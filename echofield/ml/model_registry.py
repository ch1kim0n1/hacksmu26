"""Versioned model storage and benchmark history."""

from __future__ import annotations

import json
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

import joblib


class ModelRegistry:
    """Save, load, and version sklearn models with benchmark tracking."""

    def __init__(self, base_dir: str | Path = "data/models/ml") -> None:
        self._base_dir = Path(base_dir)
        self._base_dir.mkdir(parents=True, exist_ok=True)

    def _model_dir(self, model_name: str) -> Path:
        d = self._base_dir / model_name
        d.mkdir(parents=True, exist_ok=True)
        return d

    def _benchmarks_path(self, model_name: str) -> Path:
        return self._model_dir(model_name) / "benchmarks.json"

    def _load_benchmarks(self, model_name: str) -> list[dict[str, Any]]:
        path = self._benchmarks_path(model_name)
        if path.exists():
            return json.loads(path.read_text(encoding="utf-8"))
        return []

    def _save_benchmarks(self, model_name: str, history: list[dict[str, Any]]) -> None:
        path = self._benchmarks_path(model_name)
        path.write_text(json.dumps(history, indent=2, default=str), encoding="utf-8")

    def latest_version(self, model_name: str) -> str | None:
        history = self._load_benchmarks(model_name)
        if not history:
            return None
        return history[-1]["version"]

    def save(self, model_name: str, model: Any, metrics: dict[str, Any], label_count: int) -> str:
        """Save a trained model and append benchmark entry. Returns version string."""
        history = self._load_benchmarks(model_name)
        version_num = len(history) + 1
        version = f"v{version_num}"
        model_path = self._model_dir(model_name) / f"{version}.pkl"
        joblib.dump(model, model_path)
        entry = {
            "version": version,
            "trained_at": datetime.now(timezone.utc).isoformat(),
            "label_count": label_count,
            "metrics": metrics,
            "model_path": str(model_path),
        }
        history.append(entry)
        self._save_benchmarks(model_name, history)
        return version

    def load(self, model_name: str, version: str | None = None) -> Any | None:
        """Load a model by name and optional version. Returns None if not found."""
        history = self._load_benchmarks(model_name)
        if not history:
            return None
        if version is None:
            entry = history[-1]
        else:
            entry = next((e for e in history if e["version"] == version), None)
            if entry is None:
                return None
        model_path = Path(entry["model_path"])
        if not model_path.exists():
            return None
        return joblib.load(model_path)

    def get_benchmark_history(self, model_name: str) -> list[dict[str, Any]]:
        """Return full training history for a model."""
        return self._load_benchmarks(model_name)
