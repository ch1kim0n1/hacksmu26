#!/usr/bin/env python3
"""
EchoField Batch Runner
======================
Processes all WAV files in data/audio-files/ through the full pipeline
and writes results to results/ directory.

Usage:
    python scripts/run_batch.py [--method spectral|hybrid|wiener|adaptive] [--limit N]
"""

from __future__ import annotations

import argparse
import asyncio
import csv
import json
import shutil
import sys
import time
from pathlib import Path

# ── repo root on sys.path ─────────────────────────────────────────────────────
REPO_ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(REPO_ROOT))

from echofield.config import Config
from echofield.pipeline.cache_manager import CacheManager
from echofield.pipeline.hybrid_pipeline import ProcessingPipeline

# ── directories ──────────────────────────────────────────────────────────────
AUDIO_IN   = REPO_ROOT / "data" / "audio-files"
METADATA   = REPO_ROOT / "data" / "metadata.csv"
RESULTS    = REPO_ROOT / "results"
AUDIO_OUT  = RESULTS / "audio"
SPECS_OUT  = RESULTS / "spectrograms"
JSON_OUT   = RESULTS / "json"
SUMMARY_CSV = RESULTS / "summary.csv"


def build_config() -> Config:
    """Minimal config pointing at our results dirs (no env needed)."""
    return Config(
        AUDIO_DIR        = str(AUDIO_IN),
        PROCESSED_DIR    = str(AUDIO_OUT),
        SPECTROGRAM_DIR  = str(SPECS_OUT),
        CACHE_DIR        = str(RESULTS / "cache"),
        CONFIG_FILE      = str(REPO_ROOT / "config" / "echofield.config.yml"),
        SAMPLE_RATE      = 44100,
        DENOISE_METHOD   = "spectral",   # overridden per-call by --method
    )


def setup_dirs() -> None:
    for d in (AUDIO_OUT, SPECS_OUT, JSON_OUT, RESULTS / "cache"):
        d.mkdir(parents=True, exist_ok=True)


def load_metadata() -> dict[str, dict]:
    """Load data/metadata.csv keyed by filename."""
    meta: dict[str, dict] = {}
    if not METADATA.exists():
        return meta
    with METADATA.open(newline="") as f:
        for row in csv.DictReader(f):
            fname = row.get("filename", "")
            if fname:
                meta[fname] = {k: v for k, v in row.items() if v}
    return meta


# ── progress printer ──────────────────────────────────────────────────────────
async def progress(stage: str, status: str, pct: int, data: dict | None) -> None:
    bar  = "█" * (pct // 5) + "░" * (20 - pct // 5)
    line = f"  [{bar}] {pct:3d}%  {stage:<22} {status}"
    print(f"\r{line}", end="", flush=True)
    if pct == 100:
        print()


# ── single-file processor ─────────────────────────────────────────────────────
async def process_one(
    pipeline: ProcessingPipeline,
    wav: Path,
    method: str,
    idx: int,
    total: int,
    file_meta: dict | None = None,
) -> dict:
    recording_id = wav.stem.replace(" ", "_")
    print(f"\n[{idx:02d}/{total}] {wav.name}  (method={method})")

    t0 = time.perf_counter()
    try:
        result = await pipeline.process_recording(
            recording_id  = recording_id,
            audio_path    = str(wav),
            output_dir    = str(AUDIO_OUT),
            spectrogram_dir = str(SPECS_OUT),
            method        = method,
            aggressiveness = 1.0,
            progress_callback = progress,
        )
        elapsed = time.perf_counter() - t0

        # ── copy spectrogram PNGs with readable names ──────────────────────
        for key, suffix in [("spectrogram_before_path", "before"), ("spectrogram_after_path", "after")]:
            src = result.get(key)
            if src and Path(src).exists():
                dst = SPECS_OUT / f"{recording_id}_{suffix}.png"
                if Path(src) != dst:
                    shutil.copy2(src, dst)
                result[key] = str(dst)

        # ── normalise noise_types to list[str] ────────────────────────────
        raw_nt     = result.get("noise_types", [])
        noise_list = [
            (n if isinstance(n, str) else n.get("type", str(n)))
            for n in raw_nt
        ]
        noise = ", ".join(noise_list) or "none detected"

        # ── quality metrics ────────────────────────────────────────────────
        q       = result.get("quality", {})
        snr_in  = q.get("snr_before_db",       "?")
        snr_out = q.get("snr_after_db",        "?")
        improve = q.get("snr_improvement_db",  "?")
        ncalls  = len(result.get("calls", []))

        # ── merge CSV metadata ─────────────────────────────────────────────
        meta = file_meta or {}

        # ── write per-file JSON ────────────────────────────────────────────
        out_json = JSON_OUT / f"{recording_id}.json"
        payload = {
            "file":          wav.name,
            "recording_id":  recording_id,
            "method":        method,
            "elapsed_s":     round(elapsed, 2),
            "status":        result.get("status", "unknown"),
            "noise_types":   noise_list,
            "metadata": {
                "animal_id":      meta.get("animal_id"),
                "location":       meta.get("location"),
                "date":           meta.get("date"),
                "species":        meta.get("species"),
                "noise_type_ref": meta.get("noise_type_ref"),
                "start_sec":      meta.get("start_sec"),
                "end_sec":        meta.get("end_sec"),
                "call_id":        meta.get("call_id"),
            },
            "quality":       result.get("quality", {}),
            "call_gate":     result.get("call_gate", {}),
            "calls":         result.get("calls", []),
            "stages_completed": result.get("stages_completed", []),
            "output_audio_path":      result.get("output_audio_path"),
            "spectrogram_before_path": result.get("spectrogram_before_path"),
            "spectrogram_after_path":  result.get("spectrogram_after_path"),
            "validation_warnings":     result.get("validation_warnings", []),
        }
        out_json.write_text(json.dumps(payload, indent=2, default=str))
        print(f"  ✓ done in {elapsed:.1f}s | noise={noise} | "
              f"SNR {snr_in}→{snr_out} dB (+{improve}) | {ncalls} call(s)")

        return {
            "file":       wav.name,
            "animal_id":  meta.get("animal_id", ""),
            "species":    meta.get("species", ""),
            "noise_type_ref": meta.get("noise_type_ref", ""),
            "status":     "ok",
            "elapsed_s":  round(elapsed, 2),
            "noise_types": ", ".join(noise_list) or "none detected",
            "snr_before_db":      snr_in,
            "snr_after_db":       snr_out,
            "snr_improvement_db": improve,
            "n_calls":    ncalls,
            "call_types": ", ".join({c.get("call_type","?") for c in result.get("calls", [])}),
            "json_path":  str(out_json),
        }

    except Exception as exc:
        elapsed = time.perf_counter() - t0
        print(f"\n  ✗ FAILED in {elapsed:.1f}s: {exc}")
        out_json = JSON_OUT / f"{recording_id}_error.json"
        out_json.write_text(json.dumps({"file": wav.name, "error": str(exc)}, indent=2))
        meta = file_meta or {}
        return {
            "file":       wav.name,
            "animal_id":  meta.get("animal_id", ""),
            "species":    meta.get("species", ""),
            "noise_type_ref": meta.get("noise_type_ref", ""),
            "status":     "error",
            "elapsed_s":  round(elapsed, 2),
            "noise_types": "",
            "snr_before_db": "", "snr_after_db": "", "snr_improvement_db": "",
            "n_calls": 0, "call_types": "",
            "json_path":  str(out_json),
        }


# ── main ──────────────────────────────────────────────────────────────────────
async def main() -> None:
    parser = argparse.ArgumentParser(description="EchoField batch processor")
    parser.add_argument("--method", default="spectral",
                        choices=["spectral", "hybrid", "wiener", "adaptive", "deep"],
                        help="Denoising method (default: spectral)")
    parser.add_argument("--limit", type=int, default=0,
                        help="Process only first N files (0 = all)")
    args = parser.parse_args()

    wavs = sorted(AUDIO_IN.glob("*.wav"))
    if not wavs:
        print(f"No WAV files found in {AUDIO_IN}")
        sys.exit(1)
    if args.limit:
        wavs = wavs[: args.limit]

    setup_dirs()
    cfg      = build_config()
    cache    = CacheManager(cache_dir=str(RESULTS / "cache"))
    pipeline = ProcessingPipeline(settings=cfg, cache_manager=cache)
    metadata = load_metadata()

    print(f"\nEchoField Batch Runner")
    print(f"  Input:   {AUDIO_IN}  ({len(wavs)} files)")
    print(f"  Output:  {RESULTS}")
    print(f"  Method:  {args.method}")
    print(f"  Metadata: {len(metadata)} entries loaded")
    print("=" * 60)

    t_start  = time.perf_counter()
    rows: list[dict] = []

    for i, wav in enumerate(wavs, 1):
        file_meta = metadata.get(wav.name, {})
        row = await process_one(pipeline, wav, args.method, i, len(wavs), file_meta=file_meta)
        rows.append(row)

    total_elapsed = time.perf_counter() - t_start

    # ── write summary CSV ──────────────────────────────────────────────────
    if rows:
        fieldnames = list(rows[0].keys())
        with SUMMARY_CSV.open("w", newline="") as f:
            w = csv.DictWriter(f, fieldnames=fieldnames)
            w.writeheader()
            w.writerows(rows)

    # ── final report ───────────────────────────────────────────────────────
    ok    = sum(1 for r in rows if r["status"] == "ok")
    fail  = len(rows) - ok
    print("\n" + "=" * 60)
    print(f"  Processed : {len(rows)} files in {total_elapsed:.1f}s")
    print(f"  Success   : {ok}   Failed: {fail}")
    print(f"  Results   : {RESULTS}/")
    print(f"    audio/         → cleaned WAV files")
    print(f"    spectrograms/  → before/after PNG pairs")
    print(f"    json/          → per-file JSON (calls, metrics)")
    print(f"    summary.csv    → aggregated results table")
    print("=" * 60)


if __name__ == "__main__":
    asyncio.run(main())
