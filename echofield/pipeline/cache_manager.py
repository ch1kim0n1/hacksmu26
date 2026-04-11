"""File-based cache with parameter-aware keys and LRU eviction."""

from __future__ import annotations

import hashlib
import json
import os
import shutil
import time
from pathlib import Path
from typing import Any


class CacheManager:
    def __init__(self, cache_dir: str, max_size_mb: float = 512.0) -> None:
        self.cache_dir = Path(cache_dir)
        self.cache_dir.mkdir(parents=True, exist_ok=True)
        self.max_size_bytes = int(max_size_mb * 1024 * 1024)
        self.index_path = self.cache_dir / "index.json"
        self._index = self._load_index()

    def _load_index(self) -> dict[str, Any]:
        if not self.index_path.exists():
            return {"entries": {}, "hits": 0, "misses": 0}
        with self.index_path.open("r", encoding="utf-8") as handle:
            return json.load(handle)

    def _save_index(self) -> None:
        self.index_path.write_text(json.dumps(self._index, indent=2), encoding="utf-8")

    def _key(self, recording_id: str, kind: str, params: dict[str, Any] | None = None) -> str:
        payload = json.dumps(params or {}, sort_keys=True, default=str)
        digest = hashlib.sha256(payload.encode("utf-8")).hexdigest()[:16]
        return f"{recording_id}:{kind}:{digest}"

    def _path_for(self, key: str, suffix: str) -> Path:
        sanitized = key.replace(":", "_")
        return self.cache_dir / f"{sanitized}{suffix}"

    def _record_access(self, key: str, hit: bool) -> None:
        if hit:
            self._index["hits"] += 1
        else:
            self._index["misses"] += 1
        if key in self._index["entries"]:
            self._index["entries"][key]["last_access"] = time.time()
        self._save_index()

    def _evict_if_needed(self) -> None:
        total_size = self._total_size_bytes()
        if total_size <= self.max_size_bytes:
            return
        entries = sorted(
            self._index["entries"].items(),
            key=lambda item: item[1].get("last_access", 0),
        )
        for key, metadata in entries:
            path = Path(metadata["path"])
            if path.exists():
                path.unlink()
            self._index["entries"].pop(key, None)
            total_size = self._total_size_bytes()
            if total_size <= self.max_size_bytes:
                break
        self._save_index()

    def _total_size_bytes(self) -> int:
        total = 0
        for path in self.cache_dir.glob("*"):
            if path.is_file():
                total += path.stat().st_size
        return total

    def get_path(
        self,
        recording_id: str,
        kind: str,
        *,
        params: dict[str, Any] | None = None,
    ) -> str | None:
        key = self._key(recording_id, kind, params)
        entry = self._index["entries"].get(key)
        if not entry:
            self._record_access(key, hit=False)
            return None
        path = Path(entry["path"])
        if not path.exists():
            self._index["entries"].pop(key, None)
            self._record_access(key, hit=False)
            return None
        self._record_access(key, hit=True)
        return str(path)

    def store_file(
        self,
        recording_id: str,
        kind: str,
        source_path: str | Path,
        *,
        params: dict[str, Any] | None = None,
        suffix: str | None = None,
    ) -> str:
        key = self._key(recording_id, kind, params)
        src = Path(source_path)
        dest = self._path_for(key, suffix or src.suffix)
        shutil.copy2(src, dest)
        self._index["entries"][key] = {
            "path": str(dest),
            "kind": kind,
            "recording_id": recording_id,
            "params": params or {},
            "last_access": time.time(),
        }
        self._save_index()
        self._evict_if_needed()
        return str(dest)

    def store_json(
        self,
        recording_id: str,
        kind: str,
        payload: dict[str, Any],
        *,
        params: dict[str, Any] | None = None,
    ) -> str:
        key = self._key(recording_id, kind, params)
        dest = self._path_for(key, ".json")
        dest.write_text(json.dumps(payload, indent=2, default=str), encoding="utf-8")
        self._index["entries"][key] = {
            "path": str(dest),
            "kind": kind,
            "recording_id": recording_id,
            "params": params or {},
            "last_access": time.time(),
        }
        self._save_index()
        self._evict_if_needed()
        return str(dest)

    def load_json(
        self,
        recording_id: str,
        kind: str,
        *,
        params: dict[str, Any] | None = None,
    ) -> dict[str, Any] | None:
        path = self.get_path(recording_id, kind, params=params)
        if not path:
            return None
        with open(path, "r", encoding="utf-8") as handle:
            return json.load(handle)

    def invalidate(self, recording_id: str) -> None:
        to_delete = [
            key
            for key, metadata in self._index["entries"].items()
            if metadata.get("recording_id") == recording_id
        ]
        for key in to_delete:
            path = Path(self._index["entries"][key]["path"])
            if path.exists():
                path.unlink()
            self._index["entries"].pop(key, None)
        self._save_index()

    def get_stats(self) -> dict[str, Any]:
        hits = self._index.get("hits", 0)
        misses = self._index.get("misses", 0)
        total = hits + misses
        return {
            "cache_dir": str(self.cache_dir.resolve()),
            "total_size_mb": round(self._total_size_bytes() / (1024 * 1024), 3),
            "file_count": len(self._index["entries"]),
            "hits": hits,
            "misses": misses,
            "hit_ratio": round(hits / total, 3) if total else 0.0,
            "max_size_mb": round(self.max_size_bytes / (1024 * 1024), 3),
        }

    def get_spectrogram(self, recording_id: str, *, params: dict[str, Any] | None = None) -> str | None:
        return self.get_path(recording_id, "spectrogram", params=params)

    def get_processed_audio(self, recording_id: str, *, params: dict[str, Any] | None = None) -> str | None:
        return self.get_path(recording_id, "processed_audio", params=params)

    def get_metrics(self, recording_id: str, *, params: dict[str, Any] | None = None) -> dict[str, Any] | None:
        return self.load_json(recording_id, "quality_metrics", params=params)

    def save_metrics(self, recording_id: str, metrics: dict[str, Any], *, params: dict[str, Any] | None = None) -> None:
        self.store_json(recording_id, "quality_metrics", metrics, params=params)
