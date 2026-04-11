"""
Data loading and in-memory storage for EchoField recordings.
"""

from __future__ import annotations

import csv
import logging
import os
import uuid
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

logger = logging.getLogger(__name__)

_AUDIO_EXTENSIONS = {".wav", ".mp3", ".flac"}


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
                "id": str(uuid.uuid4()),
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
                "id": str(uuid.uuid4()),
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


class RecordingStore:
    """In-memory store for recordings and their processing results."""

    def __init__(self) -> None:
        self._recordings: dict[str, dict[str, Any]] = {}

    def add(
        self,
        recording_id: str,
        filename: str,
        duration_s: float,
        filesize_mb: float,
        metadata: dict[str, Any] | None = None,
        source_path: str | None = None,
    ) -> dict[str, Any]:
        record = {
            "id": recording_id,
            "filename": filename,
            "duration_s": float(duration_s),
            "filesize_mb": float(filesize_mb),
            "uploaded_at": datetime.now(timezone.utc).isoformat(),
            "status": "pending",
            "metadata": metadata or {},
            "source_path": source_path,
            "processing": {
                "progress": 0.0,
                "current_stage": None,
                "started_at": None,
                "completed_at": None,
                "duration_s": None,
            },
            "result": None,
        }
        self._recordings[recording_id] = record
        return record

    def load_many(self, records: list[dict[str, Any]]) -> None:
        for record in records:
            self._recordings[record["id"]] = {
                **record,
                "status": record.get("status", "pending"),
                "processing": record.get(
                    "processing",
                    {
                        "progress": 0.0,
                        "current_stage": None,
                        "started_at": None,
                        "completed_at": None,
                        "duration_s": None,
                    },
                ),
                "result": record.get("result"),
            }

    def get(self, recording_id: str) -> dict[str, Any] | None:
        return self._recordings.get(recording_id)

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
        if status in {"complete", "failed"}:
            record["processing"]["completed_at"] = now
            if status == "complete":
                record["processing"]["progress"] = 100.0

    def update_result(self, recording_id: str, result: dict[str, Any]) -> None:
        record = self._recordings.get(recording_id)
        if record is None:
            logger.warning("Unknown recording in update_result: %s", recording_id)
            return
        record["result"] = result

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
