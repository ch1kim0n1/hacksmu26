#!/usr/bin/env python3
"""Clear pipeline caches and regenerate all processed audio + spectrograms from metadata."""

from __future__ import annotations

import asyncio
import json
import sys
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(REPO_ROOT))

from echofield.config import Config
from echofield.data_loader import list_recordings_with_metadata
from echofield.pipeline.cache_manager import CacheManager
from echofield.pipeline.hybrid_pipeline import ProcessingPipeline


def _clear_dir_files(directory: Path, *, keep_names: set[str] | None = None) -> int:
    keep_names = keep_names or set()
    removed = 0
    if not directory.exists():
        return 0
    for path in directory.iterdir():
        if path.name in keep_names:
            continue
        if path.is_file():
            path.unlink()
            removed += 1
    return removed


def main() -> None:
    cache_dir = REPO_ROOT / "data" / "cache"
    processed_dir = REPO_ROOT / "data" / "processed"
    spec_dir = REPO_ROOT / "data" / "spectrograms"
    recordings_processed = REPO_ROOT / "data" / "recordings" / "processed" / "audio"

    # Preserve catalog and review labels; drop cache blobs + index for full miss
    keep = {"recording_catalog.json", "review_labels.json"}
    n_cache = _clear_dir_files(cache_dir, keep_names=keep)
    index_path = cache_dir / "index.json"
    if index_path.exists():
        index_path.write_text(json.dumps({"entries": {}, "hits": 0, "misses": 0}), encoding="utf-8")

    n_out = _clear_dir_files(processed_dir)
    n_spec = _clear_dir_files(spec_dir)
    n_rp = _clear_dir_files(recordings_processed) if recordings_processed.is_dir() else 0

    print(
        f"Cleared cache files: {n_cache}, processed: {n_out}, spectrograms: {n_spec}, "
        f"recordings/processed/audio: {n_rp}"
    )

    cfg = Config(
        AUDIO_DIR=str(REPO_ROOT / "data" / "recordings"),
        PROCESSED_DIR=str(processed_dir),
        SPECTROGRAM_DIR=str(spec_dir),
        CACHE_DIR=str(cache_dir),
        CATALOG_FILE=str(cache_dir / "recording_catalog.json"),
        METADATA_FILE=str(REPO_ROOT / "data" / "metadata.csv"),
        CONFIG_FILE=str(REPO_ROOT / "config" / "echofield.config.yml"),
        DENOISE_METHOD="hybrid",
        CALL_AWARE_GATE=True,
    )
    cfg.ensure_directories()

    recordings = list_recordings_with_metadata(cfg.audio_dir, cfg.metadata_file)
    to_run = [r for r in recordings if r.get("source_path") and Path(r["source_path"]).is_file()]
    print(f"Processing {len(to_run)} recording(s) with audio on disk…")

    cache = CacheManager(str(cfg.cache_dir), max_size_mb=2048)
    pipeline = ProcessingPipeline(cfg, cache)

    async def run_all() -> None:
        for i, rec in enumerate(to_run, 1):
            rid = rec["id"]
            src = rec["source_path"]
            print(f"\n[{i}/{len(to_run)}] {rec.get('filename')} ({rid[:8]}…)")
            try:
                result = await pipeline.process_recording(
                    rid,
                    str(src),
                    str(cfg.processed_dir),
                    str(cfg.spectrogram_dir),
                    method="hybrid",
                    aggressiveness=1.0,
                )
                cg = result.get("call_gate") or {}
                print(
                    f"  → {result.get('status')} | gate={cg.get('enabled')} | "
                    f"out={result.get('output_audio_path')}"
                )
            except Exception as exc:
                print(f"  ✗ FAILED: {exc}")

    asyncio.run(run_all())
    print("\nDone.")


if __name__ == "__main__":
    main()
