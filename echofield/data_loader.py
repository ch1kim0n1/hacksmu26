"""
EchoField data loading and in-memory storage layer.

Provides RecordingStore (an in-memory store for recording metadata and
processing results) and helper functions for CSV metadata loading and
audio file discovery.
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

# Supported audio extensions for file discovery
_AUDIO_EXTENSIONS = {".wav", ".mp3", ".flac"}


# ---------------------------------------------------------------------------
# RecordingStore — in-memory recording storage
# ---------------------------------------------------------------------------

class RecordingStore:
    """In-memory store for recording metadata and processing results.

    All recordings are kept in a dictionary keyed by ``recording_id``.
    Thread-safety is **not** guaranteed — this is designed for a single
    uvicorn worker during development / hackathon use.
    """

    def __init__(self) -> None:
        self._recordings: dict[str, dict[str, Any]] = {}

    # ------------------------------------------------------------------
    # CRUD helpers
    # ------------------------------------------------------------------

    def add(
        self,
        recording_id: str,
        filename: str,
        duration_s: float,
        filesize_mb: float,
        metadata: dict[str, Any] | None = None,
    ) -> dict[str, Any]:
        """Create a new recording entry and return it.

        Parameters
        ----------
        recording_id:
            Unique identifier for the recording.
        filename:
            Original upload filename.
        duration_s:
            Duration of the audio in seconds.
        filesize_mb:
            File size in megabytes.
        metadata:
            Optional dict of extra metadata (location, date, …).

        Returns
        -------
        dict
            The newly-created recording dict.
        """
        now = datetime.now(timezone.utc).isoformat()
        record: dict[str, Any] = {
            "id": recording_id,
            "filename": filename,
            "duration_s": float(duration_s),
            "filesize_mb": float(filesize_mb),
            "uploaded_at": now,
            "status": "pending",
            "metadata": metadata or {},
            "processing": {
                "progress": 0,
                "current_stage": None,
                "started_at": None,
                "completed_at": None,
            },
            "result": None,
        }
        self._recordings[recording_id] = record
        logger.info("Added recording %s (%s, %.1fs)", recording_id, filename, duration_s)
        return record

    def get(self, recording_id: str) -> dict[str, Any] | None:
        """Return the recording dict for *recording_id*, or ``None``."""
        return self._recordings.get(recording_id)

    def list(
        self,
        limit: int = 50,
        offset: int = 0,
        status: str | None = None,
        location: str | None = None,
    ) -> tuple[list[dict[str, Any]], int]:
        """Return a paginated, optionally-filtered list of recordings.

        Parameters
        ----------
        limit:
            Maximum number of items to return.
        offset:
            Number of items to skip before returning results.
        status:
            If provided, only return recordings with this status.
        location:
            If provided, only return recordings whose metadata location
            contains this substring (case-insensitive).

        Returns
        -------
        tuple[list[dict], int]
            A tuple of ``(items, total_count)`` where *total_count* is
            the number of matches **before** pagination.
        """
        items = list(self._recordings.values())

        # Sort by upload time, newest first
        items.sort(key=lambda r: r["uploaded_at"], reverse=True)

        # Apply filters
        if status is not None:
            items = [r for r in items if r["status"] == status]
        if location is not None:
            location_lower = location.lower()
            items = [
                r for r in items
                if (r.get("metadata") or {}).get("location", "").lower().find(location_lower) != -1
            ]

        total = len(items)
        page = items[offset : offset + limit]
        return page, total

    def update_status(
        self,
        recording_id: str,
        status: str,
        progress: int = 0,
        current_stage: str | None = None,
    ) -> None:
        """Update the processing status of a recording.

        Parameters
        ----------
        recording_id:
            The recording to update.
        status:
            New status value (``"pending"``, ``"processing"``,
            ``"complete"``, ``"failed"``).
        progress:
            Processing progress percentage (0–100).
        current_stage:
            Name of the current pipeline stage, if any.
        """
        record = self._recordings.get(recording_id)
        if record is None:
            logger.warning("update_status called for unknown recording %s", recording_id)
            return

        record["status"] = status
        record["processing"]["progress"] = progress

        if current_stage is not None:
            record["processing"]["current_stage"] = current_stage

        now = datetime.now(timezone.utc).isoformat()

        if status == "processing" and record["processing"]["started_at"] is None:
            record["processing"]["started_at"] = now
        if status in ("complete", "failed"):
            record["processing"]["completed_at"] = now
            if status == "complete":
                record["processing"]["progress"] = 100

        logger.info("Recording %s → status=%s progress=%d%%", recording_id, status, progress)

    def update_result(self, recording_id: str, result: dict[str, Any]) -> None:
        """Store processing results for a recording.

        Parameters
        ----------
        recording_id:
            The recording to update.
        result:
            Dict of processing results (quality metrics, detected calls, …).
        """
        record = self._recordings.get(recording_id)
        if record is None:
            logger.warning("update_result called for unknown recording %s", recording_id)
            return

        record["result"] = result
        logger.info("Stored result for recording %s", recording_id)

    def get_stats(self) -> dict[str, Any]:
        """Return aggregate statistics across all recordings.

        Returns
        -------
        dict
            Keys: ``total_recordings``, ``total_duration_s``,
            ``total_filesize_mb``, ``by_status``, ``total_calls``,
            ``avg_snr_improvement``, ``success_rate``,
            ``processing_time_avg``.
        """
        recordings = list(self._recordings.values())
        total = len(recordings)

        if total == 0:
            return {
                "total_recordings": 0,
                "total_duration_s": 0.0,
                "total_filesize_mb": 0.0,
                "by_status": {},
                "total_calls": 0,
                "avg_snr_improvement": 0.0,
                "success_rate": 0.0,
                "processing_time_avg": 0.0,
            }

        total_duration = sum(r["duration_s"] for r in recordings)
        total_filesize = sum(r["filesize_mb"] for r in recordings)

        by_status: dict[str, int] = {}
        for r in recordings:
            by_status[r["status"]] = by_status.get(r["status"], 0) + 1

        # Aggregate results from completed recordings
        total_calls = 0
        snr_improvements: list[float] = []
        processing_times: list[float] = []

        for r in recordings:
            res = r.get("result")
            if res is None:
                continue
            # Count calls
            calls = res.get("calls", [])
            total_calls += len(calls)
            # SNR improvement
            quality = res.get("quality")
            if quality and isinstance(quality, dict):
                snr_imp = quality.get("snr_improvement_db")
                if snr_imp is not None:
                    snr_improvements.append(float(snr_imp))
            # Processing time
            pt = res.get("processing_time_s")
            if pt is not None:
                processing_times.append(float(pt))

        completed = by_status.get("complete", 0)
        attempted = completed + by_status.get("failed", 0)

        return {
            "total_recordings": total,
            "total_duration_s": round(total_duration, 2),
            "total_filesize_mb": round(total_filesize, 2),
            "by_status": by_status,
            "total_calls": total_calls,
            "avg_snr_improvement": round(
                sum(snr_improvements) / len(snr_improvements), 2
            ) if snr_improvements else 0.0,
            "success_rate": round(completed / attempted, 2) if attempted > 0 else 0.0,
            "processing_time_avg": round(
                sum(processing_times) / len(processing_times), 2
            ) if processing_times else 0.0,
        }


# ---------------------------------------------------------------------------
# CSV metadata loader
# ---------------------------------------------------------------------------

def load_metadata_csv(path: str) -> list[dict[str, Any]]:
    """Parse a CSV file into a list of dicts (one per row).

    Each dict's keys are the column headers (stripped of whitespace).
    If the file does not exist or cannot be read, an empty list is
    returned and a warning is logged.

    Parameters
    ----------
    path:
        Filesystem path to the CSV file.

    Returns
    -------
    list[dict]
        Rows as dictionaries.
    """
    csv_path = Path(path)
    if not csv_path.exists():
        logger.warning("Metadata CSV not found at %s — returning empty list", path)
        return []

    try:
        with open(csv_path, "r", encoding="utf-8", newline="") as fh:
            reader = csv.DictReader(fh)
            rows: list[dict[str, Any]] = []
            for row in reader:
                # Strip whitespace from keys
                cleaned = {k.strip(): v for k, v in row.items() if k is not None}
                rows.append(cleaned)
            logger.info("Loaded %d rows from %s", len(rows), path)
            return rows
    except Exception:
        logger.exception("Failed to read metadata CSV at %s", path)
        return []


# ---------------------------------------------------------------------------
# Audio file discovery
# ---------------------------------------------------------------------------

def discover_audio_files(directory: str) -> list[str]:
    """Find all .wav, .mp3, and .flac files in *directory* (recursive).

    Parameters
    ----------
    directory:
        Root directory to search.

    Returns
    -------
    list[str]
        Sorted list of absolute file paths.
    """
    dir_path = Path(directory)
    if not dir_path.is_dir():
        logger.warning("Audio directory does not exist: %s", directory)
        return []

    found: list[str] = []
    for root, _dirs, files in os.walk(dir_path):
        for fname in files:
            if Path(fname).suffix.lower() in _AUDIO_EXTENSIONS:
                found.append(str(Path(root) / fname))

    found.sort()
    logger.info("Discovered %d audio files in %s", len(found), directory)
    return found
