#!/usr/bin/env python3
"""Archive legacy processed outputs and rebuild demo assets.

This script does two things:
1. Archives stale generated outputs from legacy locations into data/archived.
2. Rebuilds curated demo outputs using the current pipeline (default: isolate mode).
"""

from __future__ import annotations

import argparse
import asyncio
import json
import shutil
import sys
from datetime import datetime, timezone
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(REPO_ROOT))

from echofield.config import Config
from echofield.data_loader import stable_recording_id
from echofield.pipeline.cache_manager import CacheManager
from echofield.pipeline.hybrid_pipeline import ProcessingPipeline


def _archive_directory_contents(source_dir: Path, archive_dir: Path) -> int:
    if not source_dir.exists() or not source_dir.is_dir():
        return 0

    archive_dir.mkdir(parents=True, exist_ok=True)
    moved = 0
    for item in sorted(source_dir.iterdir()):
        if item.name in {".gitkeep", ".DS_Store"}:
            continue
        target = archive_dir / item.name
        if target.exists():
            suffix = datetime.now(timezone.utc).strftime("%Y%m%d%H%M%S")
            target = archive_dir / f"{item.stem}_{suffix}{item.suffix}"
        shutil.move(str(item), str(target))
        moved += 1
    return moved


def archive_legacy_outputs(data_root: Path) -> Path:
    stamp = datetime.now(timezone.utc).strftime("%Y%m%d_%H%M%S")
    archive_root = data_root / "archived" / f"legacy_outputs_{stamp}"

    targets = {
        data_root / "recordings" / "processed": archive_root / "recordings_processed",
        data_root / "output": archive_root / "output",
        data_root / "processed": archive_root / "processed",
        data_root / "spectrograms": archive_root / "spectrograms",
    }

    moved_total = 0
    for source, destination in targets.items():
        moved_total += _archive_directory_contents(source, destination)

    if moved_total == 0:
        # Keep behavior simple: create nothing if nothing moved.
        return archive_root

    summary = {
        "moved_items": moved_total,
        "timestamp_utc": datetime.now(timezone.utc).isoformat(),
        "sources": [str(path) for path in targets.keys()],
    }
    archive_root.mkdir(parents=True, exist_ok=True)
    (archive_root / "summary.json").write_text(json.dumps(summary, indent=2), encoding="utf-8")
    return archive_root


def _resolve_demo_source(demo_dir: Path, originals_dir: Path) -> Path | None:
    preferred = demo_dir / "original.wav"
    if preferred.exists():
        return preferred

    candidate = originals_dir / f"{demo_dir.name}.wav"
    if candidate.exists():
        return candidate

    fuzzy = sorted(originals_dir.glob(f"{demo_dir.name}*.wav"))
    if fuzzy:
        return fuzzy[0]

    return None


async def rebuild_demo_assets(method: str, aggressiveness: float) -> int:
    data_root = REPO_ROOT / "data"
    originals_dir = data_root / "recordings" / "original"
    demo_root = data_root / "recordings" / "demo"
    processed_dir = data_root / "processed"
    spectrogram_dir = data_root / "spectrograms"
    cache_dir = data_root / "cache"

    cfg = Config(
        AUDIO_DIR=str(originals_dir),
        PROCESSED_DIR=str(processed_dir),
        SPECTROGRAM_DIR=str(spectrogram_dir),
        CACHE_DIR=str(cache_dir),
        CATALOG_FILE=str(cache_dir / "recording_catalog.json"),
        METADATA_FILE=str(data_root / "metadata.csv"),
        CONFIG_FILE=str(REPO_ROOT / "config" / "echofield.config.yml"),
        DENOISE_METHOD=method,
        CALL_AWARE_GATE=True,
    )
    cfg.ensure_directories()

    cache = CacheManager(str(cfg.cache_dir), max_size_mb=2048)
    pipeline = ProcessingPipeline(cfg, cache)

    demo_dirs = sorted(path for path in demo_root.iterdir() if path.is_dir())
    rebuilt = 0

    for demo_dir in demo_dirs:
        source_path = _resolve_demo_source(demo_dir, originals_dir)
        if source_path is None:
            print(f"[skip] {demo_dir.name}: no source audio found")
            continue

        recording_id = stable_recording_id(str(source_path.resolve()), source_path.name)
        cache.invalidate(recording_id)

        print(f"[build] {demo_dir.name} ({source_path.name})")
        result = await pipeline.process_recording(
            recording_id=recording_id,
            audio_path=str(source_path),
            output_dir=str(processed_dir),
            spectrogram_dir=str(spectrogram_dir),
            method=method,
            aggressiveness=aggressiveness,
        )

        output_audio = Path(result["output_audio_path"])
        before_spec = Path(result["spectrogram_before_path"])
        after_spec = Path(result["spectrogram_after_path"])

        shutil.copy2(output_audio, demo_dir / "processed.wav")
        if before_spec.exists():
            shutil.copy2(before_spec, demo_dir / "before_spectrogram.png")
        if after_spec.exists():
            shutil.copy2(after_spec, demo_dir / "after_spectrogram.png")

        metadata_payload = {
            "recording_id": recording_id,
            "source_path": str(source_path),
            "method": method,
            "aggressiveness": aggressiveness,
            "quality": result.get("quality", {}),
            "noise_types": result.get("noise_types", []),
            "call_count": len(result.get("calls", [])),
            "call_gate": result.get("call_gate", {}),
            "output_audio_path": str(output_audio),
            "spectrogram_before_path": str(before_spec),
            "spectrogram_after_path": str(after_spec),
            "rebuilt_at": datetime.now(timezone.utc).isoformat(),
        }
        (demo_dir / "metadata.json").write_text(json.dumps(metadata_payload, indent=2, default=str), encoding="utf-8")
        rebuilt += 1

    return rebuilt


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Archive legacy outputs and refresh demo assets")
    parser.add_argument("--archive-legacy", action="store_true", help="Move old generated outputs into data/archived")
    parser.add_argument("--rebuild-demo", action="store_true", help="Rebuild demo processed assets")
    parser.add_argument(
        "--method",
        choices=["spectral", "adaptive", "wiener", "deep", "hybrid", "isolate"],
        default="isolate",
        help="Processing method for rebuilt demo outputs",
    )
    parser.add_argument(
        "--aggressiveness",
        type=float,
        default=2.2,
        help="Denoising aggressiveness passed to the pipeline",
    )
    return parser.parse_args()


def main() -> None:
    args = parse_args()
    if not args.archive_legacy and not args.rebuild_demo:
        args.rebuild_demo = True

    data_root = REPO_ROOT / "data"

    if args.archive_legacy:
        archive_root = archive_legacy_outputs(data_root)
        print(f"Archived legacy outputs under: {archive_root}")

    if args.rebuild_demo:
        rebuilt = asyncio.run(rebuild_demo_assets(args.method, args.aggressiveness))
        print(f"Rebuilt demo assets: {rebuilt}")


if __name__ == "__main__":
    main()
