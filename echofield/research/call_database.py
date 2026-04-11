"""In-memory call catalog with metadata and acoustic-feature search."""

from __future__ import annotations

import csv
import json
import math
import sqlite3
import uuid
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

from echofield.data_loader import load_metadata_csv

_INVENTORY_RELATIVE_PATH = Path("data/analysis/audio_inventory.csv")
_ANALYSIS_RELATIVE_PATH = Path("data/analysis/audio_analysis.json")
_DEFAULT_SORT_FIELD = "id"
_SORTABLE_BASE_FIELDS = {
    "id",
    "recording_id",
    "animal_id",
    "location",
    "date",
    "start_ms",
    "duration_ms",
    "frequency_min_hz",
    "frequency_max_hz",
    "call_type",
    "confidence",
}


def _safe_float(value: Any, default: float = 0.0) -> float:
    try:
        return float(value)
    except (TypeError, ValueError):
        return default


def _safe_int(value: Any, default: int = 0) -> int:
    try:
        return int(value)
    except (TypeError, ValueError):
        return default


def _normalize_date(value: Any) -> str | None:
    if value is None:
        return None
    text = str(value).strip()
    return text or None


def _resolve_optional_path(path: str | Path | None) -> Path | None:
    if path is None:
        return None
    candidate = Path(path)
    if candidate.is_absolute():
        return candidate
    return (Path(__file__).resolve().parents[2] / candidate).resolve()


def _load_inventory_rows(path: Path | None) -> dict[str, dict[str, Any]]:
    if path is None or not path.exists():
        return {}

    rows: dict[str, dict[str, Any]] = {}
    with path.open("r", encoding="utf-8", newline="") as handle:
        for row in csv.DictReader(handle):
            call_id = str(row.get("call_id") or "").strip()
            if call_id:
                rows[call_id] = row
    return rows


def _load_analysis_rows(path: Path | None) -> dict[str, dict[str, Any]]:
    if path is None or not path.exists():
        return {}

    with path.open("r", encoding="utf-8") as handle:
        payload = json.load(handle)

    if not isinstance(payload, list):
        return {}

    rows: dict[str, dict[str, Any]] = {}
    for row in payload:
        if not isinstance(row, dict):
            continue
        call_id = str(row.get("call_id") or "").strip()
        if call_id:
            rows[call_id] = row
    return rows


def _build_acoustic_features(
    inventory_row: dict[str, Any] | None,
    analysis_row: dict[str, Any] | None,
    duration_s: float,
) -> dict[str, Any]:
    features = {}
    if isinstance(analysis_row, dict):
        raw_features = analysis_row.get("features")
        if isinstance(raw_features, dict):
            features.update(raw_features)

    inventory_row = inventory_row or {}
    features.setdefault(
        "fundamental_frequency_hz",
        _safe_float(inventory_row.get("fundamental_frequency_hz")),
    )
    features.setdefault("harmonicity", _safe_float(inventory_row.get("harmonicity")))
    features.setdefault("harmonic_count", _safe_int(inventory_row.get("harmonic_count")))
    features.setdefault("bandwidth_hz", _safe_float(inventory_row.get("bandwidth_hz")))
    features.setdefault(
        "spectral_centroid_hz",
        _safe_float(inventory_row.get("spectral_centroid_hz")),
    )
    features.setdefault("snr_db", _safe_float(inventory_row.get("snr_db")))
    features.setdefault("duration_s", duration_s)

    return features


def _derive_frequency_bounds(features: dict[str, Any]) -> tuple[float, float]:
    fundamental = max(_safe_float(features.get("fundamental_frequency_hz")), 0.0)
    bandwidth = max(_safe_float(features.get("bandwidth_hz")), 0.0)
    if fundamental <= 0.0 and bandwidth <= 0.0:
        return 0.0, 0.0
    half_bandwidth = bandwidth / 2.0
    return max(fundamental - half_bandwidth, 0.0), max(fundamental + half_bandwidth, 0.0)


class CallDatabase:
    """Simple in-memory call catalog for hackathon-scale search."""

    def __init__(self, review_label_path: str | Path | None = None, db_path: str | Path | None = None) -> None:
        self._calls: dict[str, dict[str, Any]] = {}
        self._review_label_path = Path(review_label_path) if review_label_path else None
        self._db_path = Path(db_path) if db_path else None
        self._revision = 0
        if self._db_path:
            self._init_db()
            self._load_sqlite_calls()

    @property
    def revision(self) -> int:
        return self._revision

    def _touch(self) -> None:
        self._revision += 1

    @classmethod
    def from_metadata(
        cls,
        metadata_path: str | Path,
        inventory_path: str | Path | None = _INVENTORY_RELATIVE_PATH,
        analysis_path: str | Path | None = _ANALYSIS_RELATIVE_PATH,
        review_label_path: str | Path | None = None,
        db_path: str | Path | None = None,
    ) -> "CallDatabase":
        database = cls(review_label_path=review_label_path, db_path=db_path)
        database.load_from_metadata(
            metadata_path=metadata_path,
            inventory_path=inventory_path,
            analysis_path=analysis_path,
        )
        return database

    def _connect(self) -> sqlite3.Connection:
        if self._db_path is None:
            raise RuntimeError("CallDatabase SQLite path is not configured")
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
    def _row_to_call(row: sqlite3.Row) -> dict[str, Any]:
        metadata = json.loads(row["metadata_json"] or "{}")
        acoustic_features = json.loads(row["acoustic_features_json"] or "{}")
        annotations = json.loads(row["annotations_json"] or "[]")
        return {
            "id": row["id"],
            "recording_id": row["recording_id"],
            "animal_id": row["animal_id"],
            "location": row["location"],
            "date": row["date"],
            "start_ms": float(row["start_ms"] or 0.0),
            "duration_ms": float(row["duration_ms"] or 0.0),
            "frequency_min_hz": float(row["frequency_min_hz"] or 0.0),
            "frequency_max_hz": float(row["frequency_max_hz"] or 0.0),
            "call_type": row["call_type"],
            "confidence": float(row["confidence"] or 0.0),
            "review_label": row["review_label"],
            "reviewed_by": row["reviewed_by"],
            "reviewed_at": row["reviewed_at"],
            "individual_id": row["individual_id"],
            "annotations": annotations,
            "acoustic_features": acoustic_features,
            "metadata": metadata,
        }

    def _load_sqlite_calls(self) -> None:
        if self._db_path is None or not self._db_path.exists():
            return
        with self._connect() as db:
            rows = db.execute("SELECT * FROM calls").fetchall()
        for row in rows:
            call = self._row_to_call(row)
            self._calls[call["id"]] = call

    def _persist_call_sqlite(self, call: dict[str, Any]) -> None:
        if self._db_path is None:
            return
        with self._connect() as db:
            db.execute(
                """
                INSERT OR REPLACE INTO calls (
                    id, recording_id, call_type, confidence, location, date, animal_id,
                    start_ms, duration_ms, frequency_min_hz, frequency_max_hz,
                    review_label, reviewed_by, reviewed_at, individual_id,
                    annotations_json, acoustic_features_json, metadata_json
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                """,
                (
                    call.get("id"),
                    call.get("recording_id"),
                    call.get("call_type") or "unknown",
                    _safe_float(call.get("confidence")),
                    call.get("location"),
                    call.get("date"),
                    call.get("animal_id"),
                    _safe_float(call.get("start_ms")),
                    _safe_float(call.get("duration_ms")),
                    _safe_float(call.get("frequency_min_hz")),
                    _safe_float(call.get("frequency_max_hz")),
                    call.get("review_label"),
                    call.get("reviewed_by"),
                    call.get("reviewed_at"),
                    call.get("individual_id"),
                    json.dumps(call.get("annotations") or []),
                    json.dumps(call.get("acoustic_features") or {}),
                    json.dumps(call.get("metadata") or {}),
                ),
            )
            db.execute("DELETE FROM annotations WHERE call_id = ?", (call.get("id"),))
            db.executemany(
                """
                INSERT OR REPLACE INTO annotations (
                    id, call_id, note, tags_json, researcher_id, created_at
                ) VALUES (?, ?, ?, ?, ?, ?)
                """,
                [
                    (
                        annotation.get("id"),
                        call.get("id"),
                        annotation.get("note") or "",
                        json.dumps(annotation.get("tags") or []),
                        annotation.get("researcher_id"),
                        annotation.get("created_at") or datetime.now(timezone.utc).isoformat(),
                    )
                    for annotation in call.get("annotations") or []
                    if annotation.get("id")
                ],
            )
            db.commit()

    def _load_review_labels(self) -> dict[str, dict[str, Any]]:
        if self._review_label_path is None or not self._review_label_path.exists():
            return {}
        try:
            payload = json.loads(self._review_label_path.read_text(encoding="utf-8"))
        except Exception:
            return {}
        labels = payload.get("labels", {}) if isinstance(payload, dict) else {}
        return labels if isinstance(labels, dict) else {}

    def _save_review_labels(self) -> None:
        if self._review_label_path is None:
            return
        self._review_label_path.parent.mkdir(parents=True, exist_ok=True)
        labels = {
            call_id: {
                "review_label": call.get("review_label"),
                "reviewed_by": call.get("reviewed_by"),
                "reviewed_at": call.get("reviewed_at"),
            }
            for call_id, call in self._calls.items()
            if call.get("review_label")
        }
        self._review_label_path.write_text(
            json.dumps({"version": 1, "labels": labels}, indent=2, default=str),
            encoding="utf-8",
        )

    def _apply_review_labels(self) -> None:
        for call_id, label in self._load_review_labels().items():
            if call_id in self._calls and isinstance(label, dict):
                self._calls[call_id]["review_label"] = label.get("review_label")
                self._calls[call_id]["reviewed_by"] = label.get("reviewed_by")
                self._calls[call_id]["reviewed_at"] = label.get("reviewed_at")

    def load_from_metadata(
        self,
        metadata_path: str | Path,
        inventory_path: str | Path | None = _INVENTORY_RELATIVE_PATH,
        analysis_path: str | Path | None = _ANALYSIS_RELATIVE_PATH,
    ) -> None:
        metadata_rows = load_metadata_csv(metadata_path)
        inventory_rows = _load_inventory_rows(_resolve_optional_path(inventory_path))
        analysis_rows = _load_analysis_rows(_resolve_optional_path(analysis_path))

        for row in metadata_rows:
            call_id = str(row.get("call_id") or "").strip()
            if not call_id:
                continue

            inventory_row = inventory_rows.get(call_id)
            analysis_row = analysis_rows.get(call_id)
            duration_s = _safe_float(row.get("duration_s"))
            features = _build_acoustic_features(inventory_row, analysis_row, duration_s)
            frequency_min_hz, frequency_max_hz = _derive_frequency_bounds(features)

            metadata = {
                "filename": row.get("filename"),
                "location": row.get("location") or None,
                "date": _normalize_date(row.get("date")),
                "animal_id": row.get("animal_id") or None,
                "species": row.get("species") or None,
                "noise_type_ref": row.get("noise_type_ref") or None,
                "start_sec": _safe_float(row.get("start_sec")),
                "end_sec": _safe_float(row.get("end_sec")),
            }

            self._calls[call_id] = {
                "id": call_id,
                "recording_id": Path(str(row.get("filename") or call_id)).stem,
                "animal_id": row.get("animal_id") or None,
                "location": row.get("location") or None,
                "date": metadata["date"],
                "start_ms": _safe_float(row.get("start_sec")) * 1000.0,
                "duration_ms": duration_s * 1000.0,
                "frequency_min_hz": frequency_min_hz,
                "frequency_max_hz": frequency_max_hz,
                "call_type": str(
                    (inventory_row or {}).get("call_type")
                    or (analysis_row or {}).get("call_type")
                    or "unknown"
                ),
                "confidence": _safe_float(
                    (inventory_row or {}).get("call_type_confidence")
                    or (analysis_row or {}).get("call_type_confidence")
                ),
                "review_label": None,
                "reviewed_by": None,
                "reviewed_at": None,
                "model_version": (analysis_row or {}).get("model_version"),
                "anomaly_score": (analysis_row or {}).get("anomaly_score"),
                "prediction_uncertainty": (analysis_row or {}).get("prediction_uncertainty"),
                "call_type_hierarchy": (analysis_row or {}).get("call_type_hierarchy"),
                "individual_id": (analysis_row or {}).get("individual_id"),
                "annotations": [],
                "acoustic_features": features,
                "metadata": metadata,
            }
            self._persist_call_sqlite(self._calls[call_id])
        self._apply_review_labels()
        self._touch()

    def upsert_processed_calls(
        self,
        recording_id: str,
        calls: list[dict[str, Any]],
        metadata: dict[str, Any] | None = None,
    ) -> None:
        base_metadata = metadata or {}
        for call in calls:
            call_id = str(call.get("id") or "").strip()
            if not call_id:
                continue

            features = dict(call.get("acoustic_features") or {})
            frequency_min_hz = _safe_float(call.get("frequency_min_hz"))
            frequency_max_hz = _safe_float(call.get("frequency_max_hz"))
            if frequency_min_hz == 0.0 and frequency_max_hz == 0.0:
                frequency_min_hz, frequency_max_hz = _derive_frequency_bounds(features)

            merged_metadata = {
                "filename": base_metadata.get("filename"),
                "location": base_metadata.get("location"),
                "date": _normalize_date(base_metadata.get("date")),
                "animal_id": base_metadata.get("animal_id"),
                "species": base_metadata.get("species"),
                "noise_type_ref": base_metadata.get("noise_type_ref"),
                "start_sec": _safe_float(base_metadata.get("start_sec")),
                "end_sec": _safe_float(base_metadata.get("end_sec")),
            }
            existing = self._calls.get(call_id) or {}

            self._calls[call_id] = {
                "id": call_id,
                "recording_id": recording_id,
                "animal_id": base_metadata.get("animal_id"),
                "location": base_metadata.get("location"),
                "date": _normalize_date(base_metadata.get("date")),
                "start_ms": _safe_float(call.get("start_ms")),
                "duration_ms": _safe_float(call.get("duration_ms")),
                "frequency_min_hz": frequency_min_hz,
                "frequency_max_hz": frequency_max_hz,
                "call_type": str(call.get("call_type") or "unknown"),
                "confidence": _safe_float(call.get("confidence")),
                "confidence_tier": call.get("confidence_tier"),
                "detector_backend": call.get("detector_backend"),
                "classifier_backend": call.get("classifier_backend"),
                "model_version": call.get("model_version"),
                "anomaly_score": call.get("anomaly_score"),
                "prediction_uncertainty": call.get("prediction_uncertainty"),
                "classifier_probs": call.get("classifier_probs"),
                "call_type_hierarchy": call.get("call_type_hierarchy"),
                "review_label": call.get("review_label") or existing.get("review_label"),
                "reviewed_by": call.get("reviewed_by") or existing.get("reviewed_by"),
                "reviewed_at": call.get("reviewed_at") or existing.get("reviewed_at"),
                "individual_id": call.get("individual_id") or existing.get("individual_id"),
                "annotations": call.get("annotations") or existing.get("annotations") or [],
                "acoustic_features": features,
                "metadata": merged_metadata,
            }
            self._persist_call_sqlite(self._calls[call_id])
        self._save_review_labels()
        self._touch()

    def get_call(self, call_id: str) -> dict[str, Any] | None:
        return self._calls.get(call_id)

    def get_many(self, call_ids: list[str]) -> dict[str, dict[str, Any]]:
        return {call_id: self._calls[call_id] for call_id in call_ids if call_id in self._calls}

    def set_individual_ids(self, assignments: dict[str, str]) -> None:
        changed = False
        for call_id, individual_id in assignments.items():
            call = self._calls.get(call_id)
            if call is None or call.get("individual_id") == individual_id:
                continue
            call["individual_id"] = individual_id
            self._persist_call_sqlite(call)
            changed = True
        if changed:
            self._touch()

    def label_call(self, call_id: str, label: str, reviewed_by: str | None = None) -> dict[str, Any] | None:
        call = self._calls.get(call_id)
        if call is None:
            return None
        call["review_label"] = label
        call["reviewed_by"] = reviewed_by
        call["reviewed_at"] = datetime.now(timezone.utc).isoformat()
        self._save_review_labels()
        self._persist_call_sqlite(call)
        self._touch()
        return call

    def add_annotation(self, call_id: str, note: str, tags: list[str] | None = None, researcher_id: str | None = None) -> dict[str, Any] | None:
        call = self._calls.get(call_id)
        if call is None:
            return None
        annotation = {
            "id": uuid.uuid4().hex,
            "call_id": call_id,
            "note": note,
            "tags": sorted({tag.strip() for tag in (tags or []) if tag.strip()}),
            "researcher_id": researcher_id,
            "created_at": datetime.now(timezone.utc).isoformat(),
        }
        annotations = list(call.get("annotations") or [])
        annotations.append(annotation)
        call["annotations"] = annotations
        self._persist_call_sqlite(call)
        self._touch()
        return annotation

    def get_annotations(self, call_id: str) -> list[dict[str, Any]] | None:
        call = self._calls.get(call_id)
        if call is None:
            return None
        return list(call.get("annotations") or [])

    def delete_annotation(self, call_id: str, annotation_id: str) -> bool | None:
        call = self._calls.get(call_id)
        if call is None:
            return None
        annotations = [item for item in call.get("annotations") or [] if item.get("id") != annotation_id]
        if len(annotations) == len(call.get("annotations") or []):
            return False
        call["annotations"] = annotations
        self._persist_call_sqlite(call)
        self._touch()
        return True

    @staticmethod
    def _entropy_from_call(call: dict[str, Any]) -> float:
        features = call.get("acoustic_features") or {}
        probs = call.get("classifier_probs") or features.get("classifier_probs")
        if isinstance(probs, list) and probs:
            values = [max(float(value), 1e-12) for value in probs]
            total = sum(values)
            if total > 0:
                normalized = [value / total for value in values]
                return float(-sum(value * math.log(value) for value in normalized))
        confidence = min(max(_safe_float(call.get("confidence")), 0.0), 1.0)
        return float(1.0 - abs(confidence - 0.5) * 2.0)

    def review_queue(self, *, limit: int = 100, offset: int = 0) -> tuple[list[dict[str, Any]], int]:
        candidates = [
            call
            for call in self._calls.values()
            if call.get("review_label") in {None, ""}
            and (
                _safe_float(call.get("confidence")) < 0.5
                or str(call.get("call_type") or "").lower() in {"unknown", "novel"}
            )
        ]
        candidates.sort(key=self._entropy_from_call, reverse=True)
        total = len(candidates)
        return candidates[offset : offset + limit], total

    def training_data(self, *, include_reviewed: bool = True) -> list[dict[str, Any]]:
        items: list[dict[str, Any]] = []
        for call in self._calls.values():
            label = call.get("review_label") if include_reviewed and call.get("review_label") else call.get("call_type")
            features = call.get("acoustic_features") or {}
            if label and label != "unknown" and features:
                items.append({"features": features, "call_type": label})
        return items

    def search(
        self,
        *,
        location: str | None = None,
        date_from: str | None = None,
        date_to: str | None = None,
        animal_id: str | None = None,
        call_type: str | None = None,
        recording_id: str | None = None,
        tags: list[str] | None = None,
        sort_by: str = _DEFAULT_SORT_FIELD,
        sort_desc: bool = False,
        limit: int = 50,
        offset: int = 0,
    ) -> tuple[list[dict[str, Any]], int]:
        if self._db_path is not None:
            clauses: list[str] = []
            params: list[Any] = []
            if location:
                clauses.append("LOWER(location) LIKE ?")
                params.append(f"%{location.lower()}%")
            if date_from:
                clauses.append("date >= ?")
                params.append(date_from)
            if date_to:
                clauses.append("date <= ?")
                params.append(date_to)
            if animal_id:
                clauses.append("LOWER(animal_id) LIKE ?")
                params.append(f"%{animal_id.lower()}%")
            if call_type:
                clauses.append("LOWER(call_type) = ?")
                params.append(call_type.lower())
            if recording_id:
                clauses.append("LOWER(recording_id) LIKE ?")
                params.append(f"%{recording_id.lower()}%")
            where_sql = " WHERE " + " AND ".join(clauses) if clauses else ""
            with self._connect() as db:
                rows = db.execute(f"SELECT * FROM calls{where_sql}", params).fetchall()
            results = [self._row_to_call(row) for row in rows]
        else:
            results = list(self._calls.values())

        if self._db_path is None and location:
            location_lower = location.lower()
            results = [
                call for call in results
                if location_lower in str(call.get("location") or "").lower()
            ]

        if self._db_path is None and date_from:
            results = [
                call for call in results
                if call.get("date") and str(call["date"]) >= date_from
            ]

        if self._db_path is None and date_to:
            results = [
                call for call in results
                if call.get("date") and str(call["date"]) <= date_to
            ]

        if self._db_path is None and animal_id:
            animal_id_lower = animal_id.lower()
            results = [
                call for call in results
                if animal_id_lower in str(call.get("animal_id") or "").lower()
            ]

        if self._db_path is None and call_type:
            call_type_lower = call_type.lower()
            results = [
                call for call in results
                if str(call.get("call_type") or "").lower() == call_type_lower
            ]

        if self._db_path is None and recording_id:
            recording_id_lower = recording_id.lower()
            results = [
                call for call in results
                if recording_id_lower in str(call.get("recording_id") or "").lower()
            ]

        if tags:
            tag_set = {tag.lower() for tag in tags if tag}
            results = [
                call
                for call in results
                if tag_set
                and any(
                    tag.lower() in tag_set
                    for annotation in call.get("annotations") or []
                    for tag in annotation.get("tags", [])
                )
            ]

        total = len(results)
        normalized_sort = sort_by if sort_by in _SORTABLE_BASE_FIELDS else sort_by.strip()

        def _sort_key(call: dict[str, Any]) -> tuple[int, Any]:
            if normalized_sort in _SORTABLE_BASE_FIELDS:
                value = call.get(normalized_sort)
            else:
                value = (call.get("acoustic_features") or {}).get(normalized_sort)

            if value is None:
                return (1, 0.0)
            if isinstance(value, (int, float)):
                return (0, float(value))
            return (0, str(value).lower())

        results.sort(key=_sort_key, reverse=sort_desc)
        return results[offset : offset + limit], total

    def __len__(self) -> int:
        return len(self._calls)
