"""In-memory batch status tracking."""

from __future__ import annotations

import uuid
from datetime import datetime, timedelta, timezone
from typing import Any


class BatchStore:
    """Small retention-limited batch store for process polling."""

    def __init__(self, retention_seconds: int = 3600) -> None:
        self._retention = timedelta(seconds=retention_seconds)
        self._batches: dict[str, dict[str, Any]] = {}

    @staticmethod
    def _now() -> str:
        return datetime.now(timezone.utc).isoformat()

    def _cleanup(self) -> None:
        now = datetime.now(timezone.utc)
        stale: list[str] = []
        for batch_id, batch in self._batches.items():
            if batch.get("status") == "processing":
                continue
            updated_at = datetime.fromisoformat(str(batch["updated_at"]))
            if now - updated_at > self._retention:
                stale.append(batch_id)
        for batch_id in stale:
            self._batches.pop(batch_id, None)

    def create(self, recording_ids: list[str]) -> dict[str, Any]:
        self._cleanup()
        batch_id = uuid.uuid4().hex
        now = self._now()
        batch = {
            "batch_id": batch_id,
            "total": len(recording_ids),
            "completed": 0,
            "failed": 0,
            "cancelled": 0,
            "status": "processing",
            "created_at": now,
            "updated_at": now,
            "results": {
                recording_id: {
                    "recording_id": recording_id,
                    "status": "queued",
                    "progress_pct": 0.0,
                    "error": None,
                }
                for recording_id in recording_ids
            },
        }
        self._batches[batch_id] = batch
        return self.get(batch_id) or batch

    def update(
        self,
        batch_id: str,
        recording_id: str,
        *,
        status: str,
        progress_pct: float | None = None,
        error: str | None = None,
    ) -> None:
        batch = self._batches.get(batch_id)
        if batch is None:
            return
        result = batch["results"].setdefault(
            recording_id,
            {
                "recording_id": recording_id,
                "status": "queued",
                "progress_pct": 0.0,
                "error": None,
            },
        )
        previous_status = result.get("status")
        result["status"] = status
        if progress_pct is not None:
            result["progress_pct"] = float(progress_pct)
        if error is not None:
            result["error"] = error

        if previous_status not in {"complete", "failed", "cancelled"}:
            if status == "complete":
                batch["completed"] += 1
            elif status == "failed":
                batch["failed"] += 1
            elif status == "cancelled":
                batch["cancelled"] += 1

        finished = batch["completed"] + batch["failed"] + batch["cancelled"]
        if finished >= batch["total"]:
            batch["status"] = "complete" if batch["failed"] == 0 and batch["cancelled"] == 0 else "finished_with_errors"
        batch["updated_at"] = self._now()

    def get(self, batch_id: str) -> dict[str, Any] | None:
        self._cleanup()
        batch = self._batches.get(batch_id)
        if batch is None:
            return None
        return {
            "batch_id": batch["batch_id"],
            "total": batch["total"],
            "completed": batch["completed"],
            "failed": batch["failed"],
            "cancelled": batch["cancelled"],
            "status": batch["status"],
            "created_at": batch["created_at"],
            "updated_at": batch["updated_at"],
            "results": list(batch["results"].values()),
        }
