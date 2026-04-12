"""Active learning manager: uncertainty sampling, labeling queue, retrain trigger."""

from __future__ import annotations

import json
import os
from datetime import datetime, timezone
from pathlib import Path
from typing import Any


class ActiveLearningManager:
    def __init__(
        self,
        labels_path: str | Path = "data/labels/labels.json",
        model_dir: str | Path = "data/models/ml",
        retrain_threshold: int | None = None,
    ) -> None:
        self._labels_path = Path(labels_path)
        self._labels_path.parent.mkdir(parents=True, exist_ok=True)
        self._model_dir = Path(model_dir)
        self._retrain_threshold = retrain_threshold or int(
            os.getenv("ECHOFIELD_ML_RETRAIN_THRESHOLD", "20")
        )
        self._labels: dict[str, dict[str, Any]] = self._load_labels()
        self._labels_since_train: int = self._labels.get(
            "__meta__", {}
        ).get("labels_since_last_train", len(self._labels) - (1 if "__meta__" in self._labels else 0))

    def _load_labels(self) -> dict[str, dict[str, Any]]:
        if self._labels_path.exists():
            try:
                return json.loads(self._labels_path.read_text(encoding="utf-8"))
            except (json.JSONDecodeError, OSError):
                return {}
        return {}

    def _save_labels(self) -> None:
        self._labels["__meta__"] = {
            "labels_since_last_train": self._labels_since_train,
            "total_labels": len(self._labels) - (1 if "__meta__" in self._labels else 0),
            "updated_at": datetime.now(timezone.utc).isoformat(),
        }
        self._labels_path.write_text(
            json.dumps(self._labels, indent=2, default=str), encoding="utf-8"
        )

    def save_label(self, call_id: str, call_type_refined: str, social_function: str) -> dict[str, Any]:
        entry = {
            "call_type_refined": call_type_refined,
            "social_function": social_function,
            "labeled_at": datetime.now(timezone.utc).isoformat(),
        }
        self._labels[call_id] = entry
        self._labels_since_train += 1
        self._save_labels()
        return entry

    def get_all_labels(self) -> dict[str, dict[str, Any]]:
        return {k: v for k, v in self._labels.items() if k != "__meta__"}

    def get_labeling_queue(
        self, all_calls: dict[str, dict[str, Any]], limit: int = 10,
    ) -> list[dict[str, Any]]:
        labeled_ids = set(self.get_all_labels().keys())
        unlabeled = [
            call for call_id, call in all_calls.items()
            if call_id not in labeled_ids and call_id != "__meta__"
        ]
        unlabeled.sort(key=lambda c: float(c.get("confidence") or 0.0))
        return unlabeled[:limit]

    @property
    def labels_since_last_train(self) -> int:
        return self._labels_since_train

    def should_retrain(self) -> bool:
        return self._labels_since_train >= self._retrain_threshold

    def mark_retrained(self) -> None:
        self._labels_since_train = 0
        self._save_labels()
