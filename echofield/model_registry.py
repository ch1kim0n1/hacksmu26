"""Versioned classifier model registry."""

from __future__ import annotations

import json
import re
import shutil
from datetime import datetime, timezone
from pathlib import Path
from typing import Any


def _now_version(metrics: dict[str, Any]) -> str:
    timestamp = datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%SZ")
    accuracy = float(metrics.get("accuracy") or 0.0)
    ece = float(metrics.get("ece") or 0.0)
    return f"{timestamp}_acc{accuracy:.3f}_ece{ece:.3f}"


def _safe_version(version: str) -> str:
    safe = re.sub(r"[^A-Za-z0-9_.-]", "", version)
    if not safe or safe in {".", ".."}:
        raise ValueError("Invalid model version")
    return safe


class ModelRegistry:
    def __init__(self, root: str | Path) -> None:
        self.root = Path(root)
        self.root.mkdir(parents=True, exist_ok=True)

    @property
    def active_link(self) -> Path:
        return self.root / "active"

    @property
    def active_version_file(self) -> Path:
        return self.root / "active_version.txt"

    def _version_dir(self, version: str) -> Path:
        return self.root / _safe_version(version)

    def _active_version(self) -> str | None:
        if self.active_link.is_symlink():
            target = self.active_link.resolve()
            return target.name
        if self.active_version_file.exists():
            return self.active_version_file.read_text(encoding="utf-8").strip() or None
        return None

    def active_model_path(self) -> Path | None:
        version = self._active_version()
        if not version:
            return None
        path = self._version_dir(version) / "model.joblib"
        return path if path.exists() else None

    def register_model(self, model_path: str | Path, metrics: dict[str, Any]) -> dict[str, Any]:
        source = Path(model_path)
        if not source.exists():
            raise FileNotFoundError(source)
        version = _now_version(metrics)
        version_dir = self._version_dir(version)
        version_dir.mkdir(parents=True, exist_ok=False)
        destination = version_dir / "model.joblib"
        shutil.copy2(source, destination)
        metadata = {
            "version": version,
            "trained_at": datetime.now(timezone.utc).isoformat(),
            "model_path": str(destination),
            **metrics,
        }
        metadata_path = version_dir / "metadata.json"
        metadata_path.write_text(json.dumps(metadata, indent=2, default=str), encoding="utf-8")
        self.activate(version)
        return self._info(version, active=True)

    def activate(self, version: str) -> dict[str, Any]:
        version = _safe_version(version)
        version_dir = self._version_dir(version)
        if not (version_dir / "model.joblib").exists():
            raise FileNotFoundError(f"Unknown model version: {version}")
        if self.active_link.exists() or self.active_link.is_symlink():
            if self.active_link.is_dir() and not self.active_link.is_symlink():
                shutil.rmtree(self.active_link)
            else:
                self.active_link.unlink()
        try:
            self.active_link.symlink_to(version_dir, target_is_directory=True)
        except OSError:
            self.active_version_file.write_text(version, encoding="utf-8")
        return self._info(version, active=True)

    def _info(self, version: str, *, active: bool | None = None) -> dict[str, Any]:
        version_dir = self._version_dir(version)
        metadata_path = version_dir / "metadata.json"
        metadata: dict[str, Any] = {}
        if metadata_path.exists():
            metadata = json.loads(metadata_path.read_text(encoding="utf-8"))
        if active is None:
            active = version == self._active_version()
        return {
            "version": version,
            "active": bool(active),
            "model_path": str(version_dir / "model.joblib"),
            "metadata_path": str(metadata_path) if metadata_path.exists() else None,
            "trained_at": metadata.get("trained_at"),
            "samples": metadata.get("samples"),
            "classes": metadata.get("classes"),
            "accuracy": metadata.get("accuracy"),
            "ece": metadata.get("ece"),
            "class_distribution": metadata.get("class_distribution") or {},
        }

    def list_versions(self) -> list[dict[str, Any]]:
        versions = []
        active = self._active_version()
        for path in sorted(self.root.iterdir(), reverse=True):
            if not path.is_dir() or path.name == "active":
                continue
            if (path / "model.joblib").exists():
                versions.append(self._info(path.name, active=path.name == active))
        return versions
