"""
Data loading and in-memory storage for EchoField recordings.
"""

from __future__ import annotations

import csv
import json
import os
import shutil
import sqlite3
import uuid
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

from echofield.utils.logging_config import get_logger

logger = get_logger(__name__)

_AUDIO_EXTENSIONS = {".wav", ".mp3", ".flac"}
_RECORDING_ID_NAMESPACE = uuid.uuid5(uuid.NAMESPACE_DNS, "echofield-recordings")


def stable_recording_id(source_path: str | None, filename: str, call_id: str | None = None) -> str:
    """Generate deterministic recording IDs so catalog entries survive restarts."""
    if source_path:
        key = str(Path(source_path).resolve()).lower()
    elif call_id:
        key = str(call_id).strip().lower()
    else:
        key = str(filename).strip().lower()
    return str(uuid.uuid5(_RECORDING_ID_NAMESPACE, key))


def _safe_float(value: Any, default: float = 0.0) -> float:
    try:
        return float(value)
    except (TypeError, ValueError):
        return default


def _parse_metadata_row(row: dict[str, Any]) -> dict[str, Any]:
    cleaned = {str(k).strip(): v for k, v in row.items() if k is not None}
    start_sec = _safe_float(cleaned.get("start_sec"))
    end_sec = _safe_float(cleaned.get("end_sec"))
    duration_s = max(end_sec - start_sec, 0.0) if end_sec else 0.0
    return {
        "call_id": cleaned.get("call_id") or cleaned.get("id") or "",
        "animal_id": cleaned.get("animal_id") or "",
        "filename": cleaned.get("filename") or cleaned.get("file_name") or "",
        "location": cleaned.get("location") or "",
        "date": cleaned.get("date") or "",
        "start_sec": start_sec,
        "end_sec": end_sec,
        "duration_s": duration_s,
        "noise_type_ref": cleaned.get("noise_type_ref") or cleaned.get("noise_type") or "",
        "species": cleaned.get("species") or "",
        "metadata": cleaned,
    }


def load_metadata_csv(path: str | Path) -> list[dict[str, Any]]:
    csv_path = Path(path)
    if not csv_path.exists():
        logger.warning("Metadata CSV not found at %s", csv_path)
        return []

    with csv_path.open("r", encoding="utf-8", newline="") as handle:
        reader = csv.DictReader(handle)
        rows = [_parse_metadata_row(row) for row in reader]
    logger.info("Loaded %d metadata rows from %s", len(rows), csv_path)
    return rows


def discover_audio_files(directory: str | Path) -> list[str]:
    root = Path(directory)
    search_roots: list[Path] = []
    if root.is_dir():
        search_roots.append(root)
    fallback = root.parent / "audio-files"
    if fallback.is_dir() and fallback not in search_roots:
        search_roots.append(fallback)
    if not search_roots:
        logger.warning("Audio directory does not exist: %s", root)
        return []

    discovered: list[str] = []
    for search_root in search_roots:
        for current_root, _dirnames, filenames in os.walk(search_root):
            # Skip demo subdirectories — they contain pre-computed results
            # that are loaded separately via discover_demo_results().
            rel = Path(current_root).relative_to(search_root)
            if rel.parts and rel.parts[0] == "demo":
                continue
            for filename in filenames:
                if Path(filename).suffix.lower() in _AUDIO_EXTENSIONS:
                    discovered.append(str((Path(current_root) / filename).resolve()))
    discovered.sort()
    logger.info("Discovered %d audio files in %s", len(discovered), ", ".join(str(path) for path in search_roots))
    return discovered


def _build_audio_lookup(audio_files: list[str]) -> dict[str, str]:
    lookup: dict[str, str] = {}
    for file_path in audio_files:
        path = Path(file_path)
        lookup[path.name.lower()] = file_path
        lookup[path.stem.lower()] = file_path
    return lookup


def match_metadata_to_audio(
    metadata_rows: list[dict[str, Any]],
    audio_files: list[str],
) -> list[dict[str, Any]]:
    """Return combined recording entries, logging missing files instead of failing."""
    audio_lookup = _build_audio_lookup(audio_files)
    matched_audio_paths: set[str] = set()
    combined: list[dict[str, Any]] = []

    for row in metadata_rows:
        candidates = [
            str(row.get("filename", "")).strip().lower(),
            str(row.get("call_id", "")).strip().lower(),
        ]
        audio_path = None
        for candidate in candidates:
            if candidate and candidate in audio_lookup:
                audio_path = audio_lookup[candidate]
                break
            if candidate:
                for ext in _AUDIO_EXTENSIONS:
                    if candidate + ext in audio_lookup:
                        audio_path = audio_lookup[candidate + ext]
                        break
            if audio_path:
                break

        if audio_path is None:
            logger.warning(
                "Metadata row %s has no matching audio file",
                row.get("call_id") or row.get("filename") or "<unknown>",
            )
        else:
            matched_audio_paths.add(audio_path)

        file_size_mb = 0.0
        filename = row.get("filename") or (Path(audio_path).name if audio_path else "")
        if audio_path:
            file_size_mb = round(Path(audio_path).stat().st_size / (1024 * 1024), 3)

        combined.append(
            {
                "id": stable_recording_id(audio_path, filename, row.get("call_id")),
                "filename": filename,
                "source_path": audio_path,
                "duration_s": row.get("duration_s") or 0.0,
                "filesize_mb": file_size_mb,
                "uploaded_at": datetime.now(timezone.utc).isoformat(),
                "metadata": {
                    "location": row.get("location"),
                    "date": row.get("date"),
                    "species": row.get("species"),
                    "noise_type_ref": row.get("noise_type_ref"),
                    "animal_id": row.get("animal_id"),
                    "call_id": row.get("call_id"),
                    "start_sec": row.get("start_sec"),
                    "end_sec": row.get("end_sec"),
                },
            }
        )

    for audio_path in audio_files:
        if audio_path in matched_audio_paths:
            continue
        path = Path(audio_path)
        logger.warning("Audio file %s has no matching metadata row", path.name)
        combined.append(
            {
                "id": stable_recording_id(str(path), path.name),
                "filename": path.name,
                "source_path": str(path),
                "duration_s": 0.0,
                "filesize_mb": round(path.stat().st_size / (1024 * 1024), 3),
                "uploaded_at": datetime.now(timezone.utc).isoformat(),
                "metadata": {},
            }
        )

    return combined


def list_recordings_with_metadata(
    audio_dir: str | Path,
    metadata_path: str | Path,
) -> list[dict[str, Any]]:
    metadata_rows = load_metadata_csv(metadata_path)
    audio_files = discover_audio_files(audio_dir)
    return match_metadata_to_audio(metadata_rows, audio_files)


def _find_original_for_demo(audio_dir: Path, demo_name: str) -> Path | None:
    """Find the original audio file matching a demo folder name.

    Handles filename quirks like extra spaces (e.g. '2000-4 _airplane_01').
    """
    for subdir in ["original", "."]:
        candidate = audio_dir / subdir / f"{demo_name}.wav"
        if candidate.exists():
            return candidate

    normalized_demo = demo_name.replace(" ", "").lower()
    for search_dir in [audio_dir / "original", audio_dir]:
        if not search_dir.is_dir():
            continue
        for child in search_dir.iterdir():
            if child.suffix.lower() not in _AUDIO_EXTENSIONS:
                continue
            if child.stem.replace(" ", "").lower() == normalized_demo:
                return child
    return None


def discover_demo_results(
    audio_dir: str | Path,
    spectrogram_dir: str | Path,
    processed_dir: str | Path,
) -> list[dict[str, Any]]:
    """Scan data/recordings/demo/ for pre-computed results.

    Each demo folder contains original.wav, processed.wav,
    before_spectrogram.png, after_spectrogram.png, and metadata.json.
    Copies output files to canonical directories and returns result dicts.
    """
    demo_root = Path(audio_dir) / "demo"
    if not demo_root.is_dir():
        return []

    spec_dir = Path(spectrogram_dir)
    proc_dir = Path(processed_dir)
    spec_dir.mkdir(parents=True, exist_ok=True)
    proc_dir.mkdir(parents=True, exist_ok=True)

    results: list[dict[str, Any]] = []
    for entry in sorted(demo_root.iterdir()):
        if not entry.is_dir():
            continue
        original = entry / "original.wav"
        meta_file = entry / "metadata.json"
        processed = entry / "processed.wav"
        before_spec = entry / "before_spectrogram.png"
        after_spec = entry / "after_spectrogram.png"

        if not original.exists() or not meta_file.exists():
            continue

        demo_name = entry.name
        original_file = _find_original_for_demo(Path(audio_dir), demo_name)
        if original_file:
            rec_id = stable_recording_id(str(original_file.resolve()), original_file.name)
        else:
            rec_id = stable_recording_id(None, f"{demo_name}.wav", demo_name)

        try:
            demo_meta = json.loads(meta_file.read_text(encoding="utf-8"))
        except Exception:
            logger.warning("Failed to read demo metadata: %s", meta_file)
            continue

        spec_before_dst = spec_dir / f"{rec_id}_before_spectrogram.png"
        spec_after_dst = spec_dir / f"{rec_id}_after_spectrogram.png"
        proc_dst = proc_dir / f"{rec_id}_cleaned.wav"

        if before_spec.exists() and not spec_before_dst.exists():
            shutil.copy2(str(before_spec), str(spec_before_dst))
        if after_spec.exists() and not spec_after_dst.exists():
            shutil.copy2(str(after_spec), str(spec_after_dst))
        if processed.exists() and not proc_dst.exists():
            shutil.copy2(str(processed), str(proc_dst))

        result = {
            "recording_id": rec_id,
            "status": "complete",
            "quality": demo_meta.get("quality", {}),
            "noise_types": demo_meta.get("noise_types", []),
            "call_count": demo_meta.get("call_count", 0),
            "calls": demo_meta.get("calls", []),
            "output_audio_path": str(proc_dst) if proc_dst.exists() else None,
            "spectrogram_before_path": str(spec_before_dst) if spec_before_dst.exists() else None,
            "spectrogram_after_path": str(spec_after_dst) if spec_after_dst.exists() else None,
            "processing_time_s": 0.0,
            "demo_source": str(entry),
        }
        results.append(result)
        logger.info("Loaded demo result for %s (id=%s)", demo_name, rec_id)

    logger.info("Discovered %d demo results in %s", len(results), demo_root)
    return results


class RecordingStore:
    """In-memory store for recordings and their processing results."""

    def __init__(self, persist_path: str | Path | None = None, db_path: str | Path | None = None) -> None:
        self._recordings: dict[str, dict[str, Any]] = {}
        self._persist_path = Path(persist_path) if persist_path else None
        self._db_path = Path(db_path) if db_path else None
        if self._db_path:
            self._init_db()
            self._load_sqlite()
        if self._persist_path:
            self._persist_path.parent.mkdir(parents=True, exist_ok=True)
            self._load_persisted()

    def _connect(self) -> sqlite3.Connection:
        if self._db_path is None:
            raise RuntimeError("RecordingStore SQLite path is not configured")
        self._db_path.parent.mkdir(parents=True, exist_ok=True)
        connection = sqlite3.connect(self._db_path)
        connection.row_factory = sqlite3.Row
        return connection

    def _init_db(self) -> None:
        from echofield.db import SCHEMA, apply_sqlite_migrations

        with self._connect() as db:
            db.executescript(SCHEMA)
            apply_sqlite_migrations(db)
            db.commit()

    @staticmethod
    def _record_from_sqlite(row: sqlite3.Row) -> dict[str, Any]:
        metadata = json.loads(row["metadata_json"] or "{}")
        processing = json.loads(row["processing_json"] or "{}")
        result = json.loads(row["result_json"]) if row["result_json"] else None
        return {
            "id": row["id"],
            "filename": row["filename"],
            "duration_s": float(row["duration_s"] or 0.0),
            "filesize_mb": float(row["filesize_mb"] or 0.0),
            "uploaded_at": row["uploaded_at"],
            "status": row["status"],
            "metadata": metadata,
            "source_path": row["source_path"],
            "file_hash": row["file_hash"] or metadata.get("file_hash"),
            "processing": processing,
            "result": result,
        }

    def _load_sqlite(self) -> None:
        if self._db_path is None or not self._db_path.exists():
            return
        with self._connect() as db:
            rows = db.execute("SELECT * FROM recordings").fetchall()
        for row in rows:
            record = self._normalize_record(self._record_from_sqlite(row))
            self._recordings[record["id"]] = record

    def _persist_sqlite_record(self, record: dict[str, Any]) -> None:
        if self._db_path is None:
            return
        with self._connect() as db:
            db.execute(
                """
                INSERT OR REPLACE INTO recordings (
                    id, filename, duration_s, filesize_mb, uploaded_at, status,
                    metadata_json, source_path, file_hash, processing_json, result_json
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                """,
                (
                    record["id"],
                    record.get("filename") or "",
                    float(record.get("duration_s") or 0.0),
                    float(record.get("filesize_mb") or 0.0),
                    record.get("uploaded_at") or datetime.now(timezone.utc).isoformat(),
                    record.get("status") or "pending",
                    json.dumps(record.get("metadata") or {}),
                    record.get("source_path"),
                    record.get("file_hash") or (record.get("metadata") or {}).get("file_hash"),
                    json.dumps(record.get("processing") or {}),
                    json.dumps(record.get("result")) if record.get("result") is not None else None,
                ),
            )
            db.commit()

    @staticmethod
    def _default_processing() -> dict[str, Any]:
        return {
            "progress": 0.0,
            "current_stage": None,
            "started_at": None,
            "completed_at": None,
            "duration_s": None,
        }

    def _normalize_record(self, record: dict[str, Any]) -> dict[str, Any]:
        processing = self._default_processing()
        processing.update(record.get("processing") or {})
        return {
            "id": record["id"],
            "filename": record.get("filename", ""),
            "duration_s": float(record.get("duration_s", 0.0)),
            "filesize_mb": float(record.get("filesize_mb", 0.0)),
            "uploaded_at": record.get("uploaded_at") or datetime.now(timezone.utc).isoformat(),
            "status": record.get("status", "pending"),
            "metadata": record.get("metadata") or {},
            "source_path": record.get("source_path"),
            "file_hash": record.get("file_hash") or (record.get("metadata") or {}).get("file_hash"),
            "processing": processing,
            "result": record.get("result"),
        }

    def _merge_metadata(self, persisted: dict[str, Any], incoming: dict[str, Any]) -> dict[str, Any]:
        merged = dict(persisted)
        for key, value in incoming.items():
            if value is not None and value != "":
                merged[key] = value
        return merged

    def _load_persisted(self) -> None:
        if not self._persist_path or not self._persist_path.exists():
            return
        try:
            payload = json.loads(self._persist_path.read_text(encoding="utf-8"))
            records = payload.get("recordings", []) if isinstance(payload, dict) else []
            if not isinstance(records, list):
                logger.warning("Recording catalog at %s is malformed", self._persist_path)
                return
            for record in records:
                if not isinstance(record, dict) or "id" not in record:
                    continue
                normalized = self._normalize_record(record)
                self._recordings[normalized["id"]] = normalized
            logger.info("Loaded %d persisted recordings from %s", len(self._recordings), self._persist_path)
        except Exception:
            logger.exception("Failed to load recording catalog from %s", self._persist_path)

    def _persist(self) -> None:
        if not self._persist_path:
            return
        payload = {
            "version": 1,
            "recordings": list(self._recordings.values()),
        }
        tmp_path = self._persist_path.with_suffix(self._persist_path.suffix + ".tmp")
        tmp_path.write_text(json.dumps(payload, indent=2, default=str), encoding="utf-8")
        tmp_path.replace(self._persist_path)

    def add(
        self,
        recording_id: str,
        filename: str,
        duration_s: float,
        filesize_mb: float,
        metadata: dict[str, Any] | None = None,
        source_path: str | None = None,
        file_hash: str | None = None,
    ) -> dict[str, Any]:
        metadata = dict(metadata or {})
        if file_hash:
            metadata["file_hash"] = file_hash
        record = {
            "id": recording_id,
            "filename": filename,
            "duration_s": float(duration_s),
            "filesize_mb": float(filesize_mb),
            "uploaded_at": datetime.now(timezone.utc).isoformat(),
            "status": "pending",
            "metadata": metadata,
            "source_path": source_path,
            "file_hash": file_hash,
            "processing": self._default_processing(),
            "result": None,
        }
        self._recordings[recording_id] = record
        self._persist_sqlite_record(record)
        self._persist()
        return record

    def load_many(self, records: list[dict[str, Any]]) -> None:
        for record in records:
            normalized = self._normalize_record(record)
            existing = self._recordings.get(normalized["id"])
            if existing:
                merged = {
                    **normalized,
                    "uploaded_at": existing.get("uploaded_at", normalized["uploaded_at"]),
                    "status": existing.get("status", normalized["status"]),
                    "source_path": existing.get("source_path") or normalized.get("source_path"),
                    "file_hash": existing.get("file_hash") or normalized.get("file_hash"),
                    "processing": existing.get("processing") or normalized["processing"],
                    "result": existing.get("result") if existing.get("result") is not None else normalized.get("result"),
                    "metadata": self._merge_metadata(
                        existing.get("metadata") or {},
                        normalized.get("metadata") or {},
                    ),
                }
                self._recordings[normalized["id"]] = self._normalize_record(merged)
                self._persist_sqlite_record(self._recordings[normalized["id"]])
                continue
            self._recordings[normalized["id"]] = normalized
            self._persist_sqlite_record(normalized)
        self._persist()

    def get(self, recording_id: str) -> dict[str, Any] | None:
        return self._recordings.get(recording_id)

    def find_by_hash(self, file_hash: str) -> dict[str, Any] | None:
        for record in self._recordings.values():
            if record.get("file_hash") == file_hash:
                return record
            if (record.get("metadata") or {}).get("file_hash") == file_hash:
                return record
        return None

    def list(
        self,
        limit: int = 50,
        offset: int = 0,
        status: str | None = None,
        location: str | None = None,
    ) -> tuple[list[dict[str, Any]], int]:
        items = list(self._recordings.values())
        items.sort(key=lambda item: item["uploaded_at"], reverse=True)
        if status:
            items = [item for item in items if item["status"] == status]
        if location:
            location_lower = location.lower()
            items = [
                item
                for item in items
                if location_lower in str((item.get("metadata") or {}).get("location", "")).lower()
            ]
        total = len(items)
        return items[offset : offset + limit], total

    def update_status(
        self,
        recording_id: str,
        status: str,
        progress: float = 0.0,
        current_stage: str | None = None,
        duration_s: float | None = None,
    ) -> None:
        record = self._recordings.get(recording_id)
        if record is None:
            logger.warning("Unknown recording in update_status: %s", recording_id)
            return

        record["status"] = status
        record["processing"]["progress"] = float(progress)
        if current_stage is not None:
            record["processing"]["current_stage"] = current_stage
        if duration_s is not None:
            record["processing"]["duration_s"] = duration_s

        now = datetime.now(timezone.utc).isoformat()
        if status == "processing" and record["processing"]["started_at"] is None:
            record["processing"]["started_at"] = now
        if status in {"complete", "failed", "cancelled"}:
            record["processing"]["completed_at"] = now
            if status == "complete":
                record["processing"]["progress"] = 100.0
        self._persist_sqlite_record(record)
        self._persist()

    def update_metadata(self, recording_id: str, updates: dict[str, Any]) -> dict[str, Any] | None:
        record = self._recordings.get(recording_id)
        if record is None:
            logger.warning("Unknown recording in update_metadata: %s", recording_id)
            return None
        metadata = dict(record.get("metadata") or {})
        for key, value in updates.items():
            if value is not None:
                metadata[key] = value
        record["metadata"] = metadata
        self._persist_sqlite_record(record)
        self._persist()
        return metadata

    def update_result(self, recording_id: str, result: dict[str, Any]) -> None:
        record = self._recordings.get(recording_id)
        if record is None:
            logger.warning("Unknown recording in update_result: %s", recording_id)
            return
        record["result"] = result
        self._persist_sqlite_record(record)
        self._persist()

    def get_stats(self) -> dict[str, Any]:
        recordings = list(self._recordings.values())
        if not recordings:
            return {
                "total_recordings": 0,
                "total_calls": 0,
                "avg_snr_improvement": 0.0,
                "success_rate": 0.0,
                "processing_time_avg": 0.0,
            }

        total_calls = 0
        snr_improvements: list[float] = []
        durations: list[float] = []
        complete = 0
        attempted = 0
        for record in recordings:
            if record["status"] in {"complete", "failed"}:
                attempted += 1
            if record["status"] == "complete":
                complete += 1
            result = record.get("result") or {}
            total_calls += len(result.get("calls", []))
            quality = result.get("quality") or {}
            if quality.get("snr_improvement_db") is not None:
                snr_improvements.append(float(quality["snr_improvement_db"]))
            if result.get("processing_time_s") is not None:
                durations.append(float(result["processing_time_s"]))

        return {
            "total_recordings": len(recordings),
            "total_calls": total_calls,
            "avg_snr_improvement": round(
                sum(snr_improvements) / len(snr_improvements), 2
            )
            if snr_improvements
            else 0.0,
            "success_rate": round(complete / attempted, 2) if attempted else 0.0,
            "processing_time_avg": round(sum(durations) / len(durations), 2)
            if durations
            else 0.0,
        }
