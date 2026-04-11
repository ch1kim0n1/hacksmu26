"""In-memory call catalog with metadata and acoustic-feature search."""

from __future__ import annotations

import csv
import json
import math
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

    def __init__(self) -> None:
        self._calls: dict[str, dict[str, Any]] = {}
        self._revision = 0

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
    ) -> "CallDatabase":
        database = cls()
        database.load_from_metadata(
            metadata_path=metadata_path,
            inventory_path=inventory_path,
            analysis_path=analysis_path,
        )
        return database

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
                "acoustic_features": features,
                "metadata": metadata,
            }
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
                "review_label": call.get("review_label"),
                "reviewed_by": call.get("reviewed_by"),
                "reviewed_at": call.get("reviewed_at"),
                "acoustic_features": features,
                "metadata": merged_metadata,
            }
        self._touch()

    def get_call(self, call_id: str) -> dict[str, Any] | None:
        return self._calls.get(call_id)

    def get_many(self, call_ids: list[str]) -> dict[str, dict[str, Any]]:
        return {call_id: self._calls[call_id] for call_id in call_ids if call_id in self._calls}

    def label_call(self, call_id: str, label: str, reviewed_by: str | None = None) -> dict[str, Any] | None:
        call = self._calls.get(call_id)
        if call is None:
            return None
        call["review_label"] = label
        call["reviewed_by"] = reviewed_by
        call["reviewed_at"] = datetime.now(timezone.utc).isoformat()
        self._touch()
        return call

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
        sort_by: str = _DEFAULT_SORT_FIELD,
        sort_desc: bool = False,
        limit: int = 50,
        offset: int = 0,
    ) -> tuple[list[dict[str, Any]], int]:
        results = list(self._calls.values())

        if location:
            location_lower = location.lower()
            results = [
                call for call in results
                if location_lower in str(call.get("location") or "").lower()
            ]

        if date_from:
            results = [
                call for call in results
                if call.get("date") and str(call["date"]) >= date_from
            ]

        if date_to:
            results = [
                call for call in results
                if call.get("date") and str(call["date"]) <= date_to
            ]

        if animal_id:
            animal_id_lower = animal_id.lower()
            results = [
                call for call in results
                if animal_id_lower in str(call.get("animal_id") or "").lower()
            ]

        if call_type:
            call_type_lower = call_type.lower()
            results = [
                call for call in results
                if str(call.get("call_type") or "").lower() == call_type_lower
            ]

        if recording_id:
            recording_id_lower = recording_id.lower()
            results = [
                call for call in results
                if recording_id_lower in str(call.get("recording_id") or "").lower()
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
