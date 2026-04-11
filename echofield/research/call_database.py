"""In-memory call catalog with search and filter capabilities.

Provides storage, retrieval, filtering, and aggregate statistics for
detected elephant call records. Designed for research workflows where
calls are accumulated during processing and then queried or exported.
"""

import csv
import json
import logging
import uuid
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

logger = logging.getLogger(__name__)


class CallDatabase:
    """In-memory database for elephant call records.

    Each call record is a dictionary with the following fields:
        - id: str (auto-generated UUID)
        - recording_id: str
        - animal_id: str | None
        - start_ms: float (start time within recording in milliseconds)
        - duration_ms: float (call duration in milliseconds)
        - frequency_min_hz: float
        - frequency_max_hz: float
        - call_type: str
        - confidence: float (0-1)
        - acoustic_features: dict (full feature set from feature_extract)
        - location: str | None
        - date: str | None (ISO format date string)
        - created_at: str (ISO format datetime)
    """

    def __init__(self) -> None:
        self._calls: dict[str, dict] = {}

    # ------------------------------------------------------------------
    # CRUD
    # ------------------------------------------------------------------

    def add_call(self, call: dict) -> str:
        """Add a call record to the database.

        If the call dict does not contain an 'id' field, one is generated
        automatically. A 'created_at' timestamp is added if not present.

        Args:
            call: Dictionary with call data. At minimum should contain
                'recording_id' and 'call_type'.

        Returns:
            The call_id (str) of the stored record.
        """
        call_id = call.get("id") or str(uuid.uuid4())
        record = {
            "id": call_id,
            "recording_id": call.get("recording_id", ""),
            "animal_id": call.get("animal_id"),
            "start_ms": float(call.get("start_ms", 0)),
            "duration_ms": float(call.get("duration_ms", 0)),
            "frequency_min_hz": float(call.get("frequency_min_hz", 0)),
            "frequency_max_hz": float(call.get("frequency_max_hz", 0)),
            "call_type": call.get("call_type", "unknown"),
            "confidence": float(call.get("confidence", 0)),
            "acoustic_features": call.get("acoustic_features", {}),
            "location": call.get("location"),
            "date": call.get("date"),
            "created_at": call.get(
                "created_at",
                datetime.now(timezone.utc).isoformat(),
            ),
        }
        self._calls[call_id] = record
        return call_id

    def get_call(self, call_id: str) -> dict | None:
        """Retrieve a single call record by its ID.

        Args:
            call_id: The unique identifier of the call.

        Returns:
            The call record dict, or None if not found.
        """
        return self._calls.get(call_id)

    def remove_call(self, call_id: str) -> bool:
        """Remove a call record by ID.

        Args:
            call_id: The unique identifier of the call to remove.

        Returns:
            True if the call was found and removed, False otherwise.
        """
        if call_id in self._calls:
            del self._calls[call_id]
            return True
        return False

    def clear(self) -> int:
        """Remove all call records.

        Returns:
            Number of records that were removed.
        """
        count = len(self._calls)
        self._calls.clear()
        return count

    # ------------------------------------------------------------------
    # Bulk load helpers
    # ------------------------------------------------------------------

    def load_from_csv(self, path: str | Path) -> int:
        """Load call records from a CSV file into the database.

        Each row in the CSV is treated as one call record. The following
        column names are recognised (all optional except where noted):

            id, recording_id*, call_type*, confidence, start_ms,
            duration_ms, frequency_min_hz, frequency_max_hz, location,
            date, animal_id, acoustic_features (JSON string)

        Unknown columns are silently ignored. Rows that fail to parse are
        logged as warnings and skipped.

        Args:
            path: Filesystem path to the CSV file.

        Returns:
            Number of call records successfully loaded.
        """
        csv_path = Path(path)
        if not csv_path.exists():
            logger.warning("Calls CSV not found at %s — skipping load", path)
            return 0

        loaded = 0
        try:
            with open(csv_path, "r", encoding="utf-8", newline="") as fh:
                reader = csv.DictReader(fh)
                for row in reader:
                    # Strip whitespace from all keys and values
                    cleaned: dict[str, Any] = {
                        k.strip(): v.strip() if isinstance(v, str) else v
                        for k, v in row.items()
                        if k is not None
                    }
                    try:
                        # Parse acoustic_features JSON if present
                        raw_af = cleaned.get("acoustic_features", "")
                        if raw_af:
                            try:
                                cleaned["acoustic_features"] = json.loads(raw_af)
                            except (json.JSONDecodeError, TypeError):
                                cleaned["acoustic_features"] = {}
                        else:
                            cleaned["acoustic_features"] = {}

                        # Coerce numeric fields — silently default to 0
                        for num_field in (
                            "start_ms", "duration_ms",
                            "frequency_min_hz", "frequency_max_hz", "confidence",
                        ):
                            raw = cleaned.get(num_field, "")
                            try:
                                cleaned[num_field] = float(raw) if raw else 0.0
                            except (ValueError, TypeError):
                                cleaned[num_field] = 0.0

                        self.add_call(cleaned)
                        loaded += 1
                    except Exception:
                        logger.warning(
                            "Skipping malformed call row: %s", cleaned, exc_info=True
                        )
        except Exception:
            logger.exception("Failed to read calls CSV at %s", path)
            return loaded

        logger.info("Loaded %d call records from %s", loaded, path)
        return loaded

    def register_pipeline_calls(
        self,
        recording_id: str,
        calls: list[dict],
        recording_metadata: dict | None = None,
    ) -> int:
        """Register calls produced by the processing pipeline.

        Stamps each call with the recording_id and any location/date
        found in recording_metadata, then adds them to the catalog.

        Args:
            recording_id: ID of the parent recording.
            calls: List of call dicts from the pipeline result.
            recording_metadata: Optional recording-level metadata dict
                (may contain 'location' and 'date' keys).

        Returns:
            Number of calls registered.
        """
        meta = recording_metadata or {}
        location = meta.get("location")
        date = meta.get("date")
        count = 0
        for call in calls:
            enriched = dict(call)
            enriched.setdefault("recording_id", recording_id)
            if location and not enriched.get("location"):
                enriched["location"] = location
            if date and not enriched.get("date"):
                enriched["date"] = date
            self.add_call(enriched)
            count += 1
        logger.info(
            "Registered %d pipeline calls for recording %s", count, recording_id
        )
        return count

    # ------------------------------------------------------------------
    # Query
    # ------------------------------------------------------------------

    def search(
        self,
        call_type: str | None = None,
        location: str | None = None,
        recording_id: str | None = None,
        animal_id: str | None = None,
        min_confidence: float | None = None,
        date_from: str | None = None,
        date_to: str | None = None,
        limit: int = 50,
        offset: int = 0,
        sort_by: str = "confidence",
        sort_desc: bool = True,
    ) -> tuple[list[dict], int]:
        """Search calls with multiple filter criteria.

        All filter parameters are optional and combined with AND logic.
        ``sort_by`` may reference any top-level call field **or** a key
        inside ``acoustic_features`` (e.g. ``"fundamental_frequency_hz"``).

        Args:
            call_type: Filter by call type (exact match).
            location: Filter by location (case-insensitive substring match).
            recording_id: Filter by recording ID (exact match).
            animal_id: Filter by animal ID (exact match).
            min_confidence: Minimum confidence threshold (inclusive).
            date_from: Earliest date (inclusive, ISO format YYYY-MM-DD).
            date_to: Latest date (inclusive, ISO format YYYY-MM-DD).
            limit: Maximum number of results to return (default 50).
            offset: Number of results to skip for pagination (default 0).
            sort_by: Field name to sort by (default: "confidence").
            sort_desc: Sort in descending order (default: True).

        Returns:
            Tuple of (results_list, total_matching_count).
            results_list contains at most ``limit`` records starting from
            ``offset``. total_matching_count is the number of matching
            records before pagination.
        """
        results = list(self._calls.values())

        # --- Filters ---
        if call_type is not None:
            results = [c for c in results if c["call_type"] == call_type]

        if location is not None:
            loc_lower = location.lower()
            results = [
                c for c in results
                if c.get("location") and loc_lower in c["location"].lower()
            ]

        if recording_id is not None:
            results = [c for c in results if c["recording_id"] == recording_id]

        if animal_id is not None:
            results = [c for c in results if c.get("animal_id") == animal_id]

        if min_confidence is not None:
            results = [c for c in results if c["confidence"] >= min_confidence]

        if date_from is not None:
            results = [
                c for c in results
                if c.get("date") and c["date"] >= date_from
            ]

        if date_to is not None:
            results = [
                c for c in results
                if c.get("date") and c["date"] <= date_to
            ]

        total_count = len(results)

        # --- Sort ---
        def _sort_key(call: dict) -> Any:
            # Check top-level fields first, then acoustic_features
            if sort_by in call:
                val = call[sort_by]
            else:
                val = call.get("acoustic_features", {}).get(sort_by)
            if val is None:
                # Numeric fields default to 0, strings to ""
                return 0
            return val

        try:
            results.sort(key=_sort_key, reverse=sort_desc)
        except TypeError:
            # Mixed types — fall back to string sort
            results.sort(key=lambda c: str(_sort_key(c)), reverse=sort_desc)

        # --- Paginate ---
        paginated = results[offset: offset + limit]
        return paginated, total_count

    # ------------------------------------------------------------------
    # Aggregates
    # ------------------------------------------------------------------

    def get_calls_for_recording(self, recording_id: str) -> list[dict]:
        """Get all calls from a specific recording, sorted by start_ms.

        Args:
            recording_id: The recording identifier to filter by.

        Returns:
            List of call records, sorted ascending by start time.
        """
        calls = [
            c for c in self._calls.values()
            if c["recording_id"] == recording_id
        ]
        calls.sort(key=lambda c: c["start_ms"])
        return calls

    def get_stats(self) -> dict:
        """Compute aggregate statistics across all stored calls.

        Returns:
            Dictionary with:
                - total_calls: int
                - type_distribution: dict mapping call_type to count
                - avg_confidence: float
                - confidence_range: dict with 'min' and 'max'
                - avg_duration_ms: float
                - frequency_range_hz: dict with 'min' and 'max'
                - unique_recordings: int
                - unique_locations: int
                - unique_animals: int
                - date_range: dict with 'earliest' and 'latest' or None
        """
        calls = list(self._calls.values())
        total = len(calls)

        if total == 0:
            return {
                "total_calls": 0,
                "type_distribution": {},
                "avg_confidence": 0.0,
                "confidence_range": {"min": 0.0, "max": 0.0},
                "avg_duration_ms": 0.0,
                "frequency_range_hz": {"min": 0.0, "max": 0.0},
                "unique_recordings": 0,
                "unique_locations": 0,
                "unique_animals": 0,
                "date_range": None,
            }

        type_dist: dict[str, int] = {}
        for c in calls:
            ct = c["call_type"]
            type_dist[ct] = type_dist.get(ct, 0) + 1

        confidences = [c["confidence"] for c in calls]
        avg_conf = sum(confidences) / total

        durations = [c["duration_ms"] for c in calls]
        avg_dur = sum(durations) / total

        freq_mins = [c["frequency_min_hz"] for c in calls if c["frequency_min_hz"] > 0]
        freq_maxs = [c["frequency_max_hz"] for c in calls if c["frequency_max_hz"] > 0]

        recording_ids = {c["recording_id"] for c in calls if c["recording_id"]}
        locations = {c["location"] for c in calls if c.get("location")}
        animals = {c["animal_id"] for c in calls if c.get("animal_id")}

        dates = sorted(c["date"] for c in calls if c.get("date"))
        date_range = {"earliest": dates[0], "latest": dates[-1]} if dates else None

        return {
            "total_calls": total,
            "type_distribution": type_dist,
            "avg_confidence": round(avg_conf, 3),
            "confidence_range": {
                "min": round(min(confidences), 3),
                "max": round(max(confidences), 3),
            },
            "avg_duration_ms": round(avg_dur, 1),
            "frequency_range_hz": {
                "min": round(min(freq_mins), 1) if freq_mins else 0.0,
                "max": round(max(freq_maxs), 1) if freq_maxs else 0.0,
            },
            "unique_recordings": len(recording_ids),
            "unique_locations": len(locations),
            "unique_animals": len(animals),
            "date_range": date_range,
        }

    # ------------------------------------------------------------------
    # Magic methods
    # ------------------------------------------------------------------

    def __len__(self) -> int:
        return len(self._calls)

    def __contains__(self, call_id: str) -> bool:
        return call_id in self._calls
