"""EchoField denoising validation benchmark.

Processes recordings from a directory through the denoising pipeline and
writes before/after quality metrics to a JSON file.

Usage
-----
    python scripts/benchmark.py [OPTIONS]

Options
-------
    --recordings DIR     Directory containing .wav files (default: data/audio-files/)
    --output FILE        JSON output path (default: data/benchmark_results.json)
    --method METHOD      Denoising method: spectral | deep | hybrid | all
                         (default: hybrid)
    --limit N            Process at most N recordings (default: all)
    --quiet              Suppress per-file progress output

Example
-------
    python scripts/benchmark.py --recordings data/audio-files/ --method all --limit 5
"""

from __future__ import annotations

import argparse
import json
import os
import sys
import time
from pathlib import Path

# Ensure project root is on sys.path when run as a script
_REPO_ROOT = Path(__file__).resolve().parent.parent
if str(_REPO_ROOT) not in sys.path:
    sys.path.insert(0, str(_REPO_ROOT))

import numpy as np

from echofield.pipeline.quality_check import assess_quality
from echofield.pipeline.ingestion import load_audio
from echofield.pipeline.ensemble import run_ensemble, score_candidate
from echofield.pipeline.spectral_gate import spectral_gate_denoise
from echofield.pipeline.deep_denoise import deep_denoise


# ---------------------------------------------------------------------------
# Benchmark helpers
# ---------------------------------------------------------------------------

def _process_one(
    wav_path: Path,
    method: str,
    model_path: str | None,
    quiet: bool,
) -> dict:
    """Run denoising on a single file and return metrics."""
    t0 = time.perf_counter()

    try:
        y, sr = load_audio(str(wav_path), target_sr=44100)
    except Exception as exc:
        return {"file": wav_path.name, "error": f"load failed: {exc}"}

    try:
        if method == "hybrid":
            result = run_ensemble(y, sr, model_path=model_path)
            y_clean = result["audio"]
            extra = {
                "ensemble_method_selected": result["method"],
                "ensemble_score": result["composite_score"],
                "ensemble_confidence": result["confidence"],
                "candidates_evaluated": result["candidates_evaluated"],
            }
        elif method == "deep":
            spectral = spectral_gate_denoise(y, sr)
            y_clean = deep_denoise(spectral["cleaned_audio"], sr, model_path=model_path)
            extra = {}
        else:
            spectral = spectral_gate_denoise(y, sr)
            y_clean = spectral["cleaned_audio"]
            extra = {}

        quality = assess_quality(y, y_clean, sr)
        scores = score_candidate(y, y_clean, sr)
        elapsed = round(time.perf_counter() - t0, 2)

        row = {
            "file": wav_path.name,
            "duration_s": round(len(y) / sr, 2),
            "method": method,
            "snr_before_db": quality["snr_before"],
            "snr_after_db": quality["snr_after"],
            "snr_improvement_db": quality["snr_improvement"],
            "energy_preservation": quality["energy_preservation"],
            "spectral_distortion": quality["spectral_distortion"],
            "harmonic_preservation": scores["harmonic_preservation"],
            "artifact_level": scores["artifact_level"],
            "quality_score": quality["quality_score"],
            "runtime_s": elapsed,
            **extra,
        }

        if not quiet:
            print(
                f"  {wav_path.name:<45} "
                f"SNR {quality['snr_before']:+5.1f} → {quality['snr_after']:+5.1f} dB  "
                f"quality={quality['quality_score']:.0f}  "
                f"{elapsed:.1f}s"
            )

        return row

    except Exception as exc:
        return {"file": wav_path.name, "error": str(exc)}


def _aggregate(rows: list[dict]) -> dict:
    """Compute mean ± std for numeric metrics across successful rows."""
    successes = [r for r in rows if "error" not in r]
    if not successes:
        return {}

    numeric_keys = [
        "snr_before_db", "snr_after_db", "snr_improvement_db",
        "energy_preservation", "spectral_distortion",
        "harmonic_preservation", "artifact_level",
        "quality_score", "runtime_s",
    ]

    summary: dict = {}
    for key in numeric_keys:
        values = [r[key] for r in successes if key in r]
        if values:
            arr = np.array(values, dtype=float)
            summary[key] = {
                "mean": round(float(np.mean(arr)), 4),
                "std": round(float(np.std(arr)), 4),
                "min": round(float(np.min(arr)), 4),
                "max": round(float(np.max(arr)), 4),
            }

    return summary


# ---------------------------------------------------------------------------
# CLI
# ---------------------------------------------------------------------------

def _parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="EchoField denoising validation benchmark",
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog=__doc__,
    )
    parser.add_argument(
        "--recordings",
        default="data/audio-files/",
        help="Directory of .wav files (default: data/audio-files/)",
    )
    parser.add_argument(
        "--output",
        default="data/benchmark_results.json",
        help="Output JSON path (default: data/benchmark_results.json)",
    )
    parser.add_argument(
        "--method",
        default="hybrid",
        choices=["spectral", "deep", "hybrid", "all"],
        help="Denoising method to benchmark (default: hybrid)",
    )
    parser.add_argument(
        "--limit",
        type=int,
        default=None,
        help="Process at most N recordings",
    )
    parser.add_argument(
        "--quiet",
        action="store_true",
        help="Suppress per-file progress output",
    )
    return parser.parse_args()


def main() -> None:
    args = _parse_args()

    recordings_dir = Path(args.recordings)
    if not recordings_dir.exists():
        print(f"ERROR: recordings directory not found: {recordings_dir}", file=sys.stderr)
        sys.exit(1)

    wav_files = sorted(recordings_dir.glob("*.wav"))
    if args.limit:
        wav_files = wav_files[: args.limit]

    if not wav_files:
        print(f"No .wav files found in {recordings_dir}", file=sys.stderr)
        sys.exit(1)

    model_path = os.getenv("ECHOFIELD_MODEL_PATH")
    methods = ["spectral", "deep", "hybrid"] if args.method == "all" else [args.method]

    all_rows: list[dict] = []
    all_failures: list[dict] = []

    for method in methods:
        if not args.quiet:
            print(f"\n=== Method: {method} ({len(wav_files)} files) ===")

        rows: list[dict] = []
        for wav_path in wav_files:
            row = _process_one(wav_path, method, model_path, args.quiet)
            if "error" in row:
                all_failures.append(row)
                if not args.quiet:
                    print(f"  FAILED {row['file']}: {row['error']}")
            else:
                rows.append(row)

        all_rows.extend(rows)

        if rows and not args.quiet:
            summary = _aggregate(rows)
            print(f"\n  Summary ({method}):")
            print(f"    SNR improvement : {summary.get('snr_improvement_db', {}).get('mean', 0):+.1f} ± {summary.get('snr_improvement_db', {}).get('std', 0):.1f} dB")
            print(f"    Quality score   : {summary.get('quality_score', {}).get('mean', 0):.1f} ± {summary.get('quality_score', {}).get('std', 0):.1f}")
            print(f"    Avg runtime     : {summary.get('runtime_s', {}).get('mean', 0):.1f} s")

    output_path = Path(args.output)
    output_path.parent.mkdir(parents=True, exist_ok=True)

    output = {
        "benchmark_config": {
            "recordings_dir": str(recordings_dir),
            "n_recordings": len(wav_files),
            "methods": methods,
            "model_path": model_path,
        },
        "results": all_rows,
        "summary": {method: _aggregate([r for r in all_rows if r.get("method") == method]) for method in methods},
        "failures": all_failures,
    }

    with open(output_path, "w") as f:
        json.dump(output, f, indent=2)

    print(f"\nResults written to {output_path}")
    print(f"Processed: {len(all_rows)}  Failed: {len(all_failures)}")


if __name__ == "__main__":
    main()
