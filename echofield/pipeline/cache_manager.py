"""
Simple file-based caching module for the EchoField processing pipeline.

Stores spectrogram PNGs, processed audio WAVs, and quality-metric JSON
files under a configurable cache directory, keyed by recording ID.
"""

import json
import os
import glob
import shutil


class CacheManager:
    """Manage cached artefacts for processed recordings."""

    def __init__(self, cache_dir: str) -> None:
        """
        Initialise the cache manager.

        Args:
            cache_dir: Root directory for cached files.  Created on demand.
        """
        self.cache_dir = cache_dir
        os.makedirs(self.cache_dir, exist_ok=True)

    # ------------------------------------------------------------------
    # Internal helpers
    # ------------------------------------------------------------------

    def _recording_dir(self, recording_id: str) -> str:
        """Return (and create) the per-recording cache subdirectory."""
        path = os.path.join(self.cache_dir, recording_id)
        os.makedirs(path, exist_ok=True)
        return path

    def _spectrogram_path(self, recording_id: str) -> str:
        return os.path.join(self._recording_dir(recording_id), "spectrogram.png")

    def _processed_audio_path(self, recording_id: str) -> str:
        return os.path.join(self._recording_dir(recording_id), "cleaned.wav")

    def _metrics_path(self, recording_id: str) -> str:
        return os.path.join(self._recording_dir(recording_id), "metrics.json")

    # ------------------------------------------------------------------
    # Public API
    # ------------------------------------------------------------------

    def get_spectrogram(self, recording_id: str) -> str | None:
        """
        Return the path to a cached spectrogram PNG, or None if it
        does not exist.
        """
        path = self._spectrogram_path(recording_id)
        return path if os.path.isfile(path) else None

    def get_processed_audio(self, recording_id: str) -> str | None:
        """
        Return the path to a cached cleaned WAV file, or None if it
        does not exist.
        """
        path = self._processed_audio_path(recording_id)
        return path if os.path.isfile(path) else None

    def get_metrics(self, recording_id: str) -> dict | None:
        """
        Load and return cached quality metrics (dict) from JSON, or None
        if no cached metrics exist.
        """
        path = self._metrics_path(recording_id)
        if not os.path.isfile(path):
            return None
        with open(path, "r", encoding="utf-8") as fh:
            return json.load(fh)

    def save_metrics(self, recording_id: str, metrics: dict) -> None:
        """
        Persist quality metrics as a JSON file in the cache.

        Args:
            recording_id: Unique identifier for the recording.
            metrics: Dict of quality metrics to store.
        """
        path = self._metrics_path(recording_id)
        with open(path, "w", encoding="utf-8") as fh:
            json.dump(metrics, fh, indent=2)

    def invalidate(self, recording_id: str) -> None:
        """
        Delete all cached files for the given recording.
        """
        rec_dir = os.path.join(self.cache_dir, recording_id)
        if os.path.isdir(rec_dir):
            shutil.rmtree(rec_dir)

    def get_stats(self) -> dict:
        """
        Return summary statistics about the cache.

        Returns:
            Dict with keys:
                cache_dir   - absolute path to the cache root
                total_size_mb - total size of cached files in MB
                file_count    - number of individual files
        """
        total_size = 0
        file_count = 0

        for dirpath, _dirnames, filenames in os.walk(self.cache_dir):
            for fname in filenames:
                fpath = os.path.join(dirpath, fname)
                try:
                    total_size += os.path.getsize(fpath)
                except OSError:
                    pass
                file_count += 1

        return {
            "cache_dir": os.path.abspath(self.cache_dir),
            "total_size_mb": round(total_size / (1024 * 1024), 3),
            "file_count": file_count,
        }
