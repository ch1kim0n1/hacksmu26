#!/usr/bin/env python3
"""Generate demo graphs with explicit Before vs After semantics.

Inputs (default):
- data/recordings/demo/*/original.wav
- data/recordings/demo/*/processed.wav
- data/recordings/demo/*/metadata.json

Outputs (default):
- results/demo_before_after_graphs/summary_metrics.csv
- results/demo_before_after_graphs/summary_rms_before_vs_after.png
- results/demo_before_after_graphs/summary_band_ratio_before_vs_after.png
- results/demo_before_after_graphs/per_recording/*_before_vs_after_metrics.png
- results/demo_before_after_graphs/per_recording/*_before_vs_after_spectrogram_panel.png
"""

from __future__ import annotations

import argparse
import csv
import json
import shutil
from dataclasses import dataclass
from pathlib import Path
from typing import Any

import matplotlib.pyplot as plt
import numpy as np
import soundfile as sf
from scipy import signal


@dataclass
class RecordingMetrics:
    name: str
    duration_sec: float
    sample_rate: int
    rms_before: float
    rms_after: float
    db_change: float
    low_band_ratio_before: float
    low_band_ratio_after: float
    noise_band_ratio_before: float
    noise_band_ratio_after: float
    quality_score: float | None
    quality_rating: str | None
    snr_before_db: float | None
    snr_after_db: float | None
    snr_improvement_db: float | None
    original_path: Path
    processed_path: Path
    metadata_path: Path
    before_spectrogram_path: Path | None
    after_spectrogram_path: Path | None


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Build Before vs After demo graphs")
    parser.add_argument(
        "--demo-root",
        default="data/recordings/demo",
        help="Root folder containing demo recording subfolders",
    )
    parser.add_argument(
        "--out-dir",
        default="results/demo_before_after_graphs",
        help="Output directory for graph assets",
    )
    parser.add_argument(
        "--low-band-max-hz",
        type=float,
        default=100.0,
        help="Upper bound for elephant low-frequency band",
    )
    parser.add_argument(
        "--noise-band-min-hz",
        type=float,
        default=200.0,
        help="Lower bound for noise-focused band",
    )
    parser.add_argument(
        "--noise-band-max-hz",
        type=float,
        default=1000.0,
        help="Upper bound for noise-focused band",
    )
    return parser.parse_args()


def _to_mono(x: np.ndarray) -> np.ndarray:
    if x.ndim == 1:
        return x.astype(np.float32)
    return x.mean(axis=1, dtype=np.float32)


def _rms_envelope(audio: np.ndarray, frame: int = 2048, hop: int = 512) -> tuple[np.ndarray, np.ndarray]:
    if len(audio) < frame:
        value = float(np.sqrt(np.mean(np.square(audio)))) if len(audio) else 0.0
        return np.array([0.0], dtype=np.float32), np.array([value], dtype=np.float32)

    rms_vals: list[float] = []
    frame_starts: list[int] = []
    for start in range(0, len(audio) - frame + 1, hop):
        window = audio[start : start + frame]
        rms_vals.append(float(np.sqrt(np.mean(np.square(window)))))
        frame_starts.append(start)
    return np.asarray(frame_starts, dtype=np.float32), np.asarray(rms_vals, dtype=np.float32)


def _band_ratio(audio: np.ndarray, sr: int, low_hz: float, high_hz: float) -> float:
    if len(audio) == 0:
        return 0.0
    spectrum = np.fft.rfft(audio)
    power = np.square(np.abs(spectrum))
    freqs = np.fft.rfftfreq(len(audio), d=1.0 / sr)

    total = float(power.sum())
    if total <= 0.0:
        return 0.0

    mask = (freqs >= low_hz) & (freqs <= high_hz)
    return float(power[mask].sum() / total)


def _safe_db_ratio(after: float, before: float) -> float:
    eps = 1e-12
    return float(20.0 * np.log10((after + eps) / (before + eps)))


def _resample_audio(audio: np.ndarray, from_sr: int, to_sr: int) -> np.ndarray:
    if from_sr == to_sr:
        return audio.astype(np.float32)
    if len(audio) == 0:
        return audio.astype(np.float32)

    gcd = int(np.gcd(from_sr, to_sr))
    up = to_sr // gcd
    down = from_sr // gcd
    resampled = signal.resample_poly(audio, up=up, down=down)
    return np.asarray(resampled, dtype=np.float32)


def _read_metadata(path: Path) -> dict[str, Any]:
    with path.open("r", encoding="utf-8") as f:
        return json.load(f)


def _load_metrics(demo_dir: Path, low_band_max_hz: float, noise_band_min_hz: float, noise_band_max_hz: float) -> RecordingMetrics:
    name = demo_dir.name
    original_path = demo_dir / "original.wav"
    processed_path = demo_dir / "processed.wav"
    metadata_path = demo_dir / "metadata.json"
    before_spec = demo_dir / "before_spectrogram.png"
    after_spec = demo_dir / "after_spectrogram.png"

    if not original_path.exists() or not processed_path.exists() or not metadata_path.exists():
        raise FileNotFoundError(f"Missing required demo files in {demo_dir}")

    before_audio_raw, sr_before = sf.read(str(original_path), always_2d=False)
    after_audio_raw, sr_after = sf.read(str(processed_path), always_2d=False)

    before_audio = _to_mono(np.asarray(before_audio_raw, dtype=np.float32))
    after_audio = _to_mono(np.asarray(after_audio_raw, dtype=np.float32))
    if sr_before != sr_after:
        after_audio = _resample_audio(after_audio, from_sr=sr_after, to_sr=sr_before)

    n = min(len(before_audio), len(after_audio))
    before_audio = before_audio[:n]
    after_audio = after_audio[:n]

    meta = _read_metadata(metadata_path)
    quality = meta.get("quality") or {}

    rms_before = float(np.sqrt(np.mean(np.square(before_audio)))) if n else 0.0
    rms_after = float(np.sqrt(np.mean(np.square(after_audio)))) if n else 0.0
    db_change = _safe_db_ratio(rms_after, rms_before)

    low_before = _band_ratio(before_audio, sr_before, low_hz=8.0, high_hz=low_band_max_hz)
    low_after = _band_ratio(after_audio, sr_before, low_hz=8.0, high_hz=low_band_max_hz)
    noise_before = _band_ratio(before_audio, sr_before, low_hz=noise_band_min_hz, high_hz=noise_band_max_hz)
    noise_after = _band_ratio(after_audio, sr_before, low_hz=noise_band_min_hz, high_hz=noise_band_max_hz)

    return RecordingMetrics(
        name=name,
        duration_sec=float(n) / float(sr_before) if sr_before else 0.0,
        sample_rate=int(sr_before),
        rms_before=rms_before,
        rms_after=rms_after,
        db_change=db_change,
        low_band_ratio_before=low_before,
        low_band_ratio_after=low_after,
        noise_band_ratio_before=noise_before,
        noise_band_ratio_after=noise_after,
        quality_score=quality.get("quality_score"),
        quality_rating=quality.get("quality_rating"),
        snr_before_db=quality.get("snr_before_db"),
        snr_after_db=quality.get("snr_after_db"),
        snr_improvement_db=quality.get("snr_improvement_db"),
        original_path=original_path,
        processed_path=processed_path,
        metadata_path=metadata_path,
        before_spectrogram_path=before_spec if before_spec.exists() else None,
        after_spectrogram_path=after_spec if after_spec.exists() else None,
    )


def _save_summary_csv(rows: list[RecordingMetrics], out_csv: Path) -> None:
    fields = [
        "recording",
        "duration_sec",
        "sample_rate",
        "rms_before",
        "rms_after",
        "rms_db_change",
        "low_band_ratio_before",
        "low_band_ratio_after",
        "noise_band_ratio_before",
        "noise_band_ratio_after",
        "quality_score",
        "quality_rating",
        "snr_before_db",
        "snr_after_db",
        "snr_improvement_db",
    ]
    with out_csv.open("w", encoding="utf-8", newline="") as f:
        writer = csv.DictWriter(f, fieldnames=fields)
        writer.writeheader()
        for row in rows:
            writer.writerow(
                {
                    "recording": row.name,
                    "duration_sec": round(row.duration_sec, 3),
                    "sample_rate": row.sample_rate,
                    "rms_before": round(row.rms_before, 8),
                    "rms_after": round(row.rms_after, 8),
                    "rms_db_change": round(row.db_change, 3),
                    "low_band_ratio_before": round(row.low_band_ratio_before, 6),
                    "low_band_ratio_after": round(row.low_band_ratio_after, 6),
                    "noise_band_ratio_before": round(row.noise_band_ratio_before, 6),
                    "noise_band_ratio_after": round(row.noise_band_ratio_after, 6),
                    "quality_score": row.quality_score,
                    "quality_rating": row.quality_rating,
                    "snr_before_db": row.snr_before_db,
                    "snr_after_db": row.snr_after_db,
                    "snr_improvement_db": row.snr_improvement_db,
                }
            )


def _plot_summary_rms(rows: list[RecordingMetrics], out_png: Path) -> None:
    names = [r.name for r in rows]
    x = np.arange(len(rows), dtype=np.float32)
    width = 0.36

    before = [r.rms_before for r in rows]
    after = [r.rms_after for r in rows]

    fig, ax = plt.subplots(figsize=(10, 5.6), constrained_layout=True)
    ax.bar(x - width / 2, before, width=width, label="Before", color="#d95f02", alpha=0.88)
    ax.bar(x + width / 2, after, width=width, label="After", color="#1b9e77", alpha=0.88)
    ax.set_xticks(x)
    ax.set_xticklabels(names, rotation=20, ha="right")
    ax.set_title("Before vs After: RMS Energy")
    ax.set_ylabel("RMS amplitude")
    ax.grid(axis="y", alpha=0.22)
    ax.legend(loc="upper right")
    fig.savefig(out_png, dpi=180)
    plt.close(fig)


def _plot_summary_band_ratios(rows: list[RecordingMetrics], out_png: Path) -> None:
    names = [r.name for r in rows]
    x = np.arange(len(rows), dtype=np.float32)

    low_before = [r.low_band_ratio_before for r in rows]
    low_after = [r.low_band_ratio_after for r in rows]
    noise_before = [r.noise_band_ratio_before for r in rows]
    noise_after = [r.noise_band_ratio_after for r in rows]

    fig, axes = plt.subplots(1, 2, figsize=(13.5, 5.2), constrained_layout=True)

    width = 0.36
    axes[0].bar(x - width / 2, low_before, width=width, label="Before", color="#d95f02", alpha=0.88)
    axes[0].bar(x + width / 2, low_after, width=width, label="After", color="#1b9e77", alpha=0.88)
    axes[0].set_xticks(x)
    axes[0].set_xticklabels(names, rotation=20, ha="right")
    axes[0].set_title("Before vs After: Elephant Band Ratio (8-100 Hz)")
    axes[0].set_ylabel("Energy ratio")
    axes[0].grid(axis="y", alpha=0.22)
    axes[0].legend(loc="upper right")

    axes[1].bar(x - width / 2, noise_before, width=width, label="Before", color="#d95f02", alpha=0.88)
    axes[1].bar(x + width / 2, noise_after, width=width, label="After", color="#1b9e77", alpha=0.88)
    axes[1].set_xticks(x)
    axes[1].set_xticklabels(names, rotation=20, ha="right")
    axes[1].set_title("Before vs After: Noise Band Ratio (200-1000 Hz)")
    axes[1].set_ylabel("Energy ratio")
    axes[1].grid(axis="y", alpha=0.22)
    axes[1].legend(loc="upper right")

    fig.savefig(out_png, dpi=180)
    plt.close(fig)


def _plot_recording_panel(metrics: RecordingMetrics, out_png: Path) -> None:
    before_raw, sr = sf.read(str(metrics.original_path), always_2d=False)
    after_raw, sr_after = sf.read(str(metrics.processed_path), always_2d=False)
    before = _to_mono(np.asarray(before_raw, dtype=np.float32))
    after = _to_mono(np.asarray(after_raw, dtype=np.float32))
    if sr != sr_after:
        after = _resample_audio(after, from_sr=sr_after, to_sr=sr)
    n = min(len(before), len(after))
    before = before[:n]
    after = after[:n]

    time = np.arange(n, dtype=np.float32) / float(sr) if sr else np.array([], dtype=np.float32)
    idx_before, rms_before = _rms_envelope(before)
    idx_after, rms_after = _rms_envelope(after)
    t_rms_before = idx_before / float(sr) if sr else idx_before
    t_rms_after = idx_after / float(sr) if sr else idx_after

    fig, axes = plt.subplots(3, 1, figsize=(12, 9.2), constrained_layout=True)

    axes[0].plot(time, before, color="#d95f02", linewidth=0.6, alpha=0.7, label="Before")
    axes[0].plot(time, after, color="#1b9e77", linewidth=0.6, alpha=0.7, label="After")
    axes[0].set_title(f"{metrics.name}: Before vs After Waveform")
    axes[0].set_ylabel("Amplitude")
    axes[0].grid(alpha=0.22)
    axes[0].legend(loc="upper right")

    axes[1].plot(t_rms_before, rms_before, color="#d95f02", linewidth=1.2, label="Before RMS")
    axes[1].plot(t_rms_after, rms_after, color="#1b9e77", linewidth=1.2, label="After RMS")
    axes[1].set_title("Before vs After RMS Envelope")
    axes[1].set_ylabel("RMS")
    axes[1].grid(alpha=0.22)
    axes[1].legend(loc="upper right")

    labels = ["Elephant band\n8-100 Hz", "Noise band\n200-1000 Hz"]
    before_vals = [metrics.low_band_ratio_before, metrics.noise_band_ratio_before]
    after_vals = [metrics.low_band_ratio_after, metrics.noise_band_ratio_after]
    x = np.arange(len(labels), dtype=np.float32)
    width = 0.32
    axes[2].bar(x - width / 2, before_vals, width=width, label="Before", color="#d95f02", alpha=0.88)
    axes[2].bar(x + width / 2, after_vals, width=width, label="After", color="#1b9e77", alpha=0.88)
    axes[2].set_xticks(x)
    axes[2].set_xticklabels(labels)
    axes[2].set_title("Before vs After Band-Energy Ratios")
    axes[2].set_ylabel("Energy ratio")
    axes[2].grid(axis="y", alpha=0.22)
    axes[2].legend(loc="upper right")

    fig.savefig(out_png, dpi=180)
    plt.close(fig)


def _plot_spectrogram_panel(metrics: RecordingMetrics, out_png: Path) -> None:
    if not metrics.before_spectrogram_path or not metrics.after_spectrogram_path:
        return

    before_img = plt.imread(str(metrics.before_spectrogram_path))
    after_img = plt.imread(str(metrics.after_spectrogram_path))

    fig, axes = plt.subplots(1, 2, figsize=(12, 4.2), constrained_layout=True)
    axes[0].imshow(before_img)
    axes[0].axis("off")
    axes[0].set_title("Before")

    axes[1].imshow(after_img)
    axes[1].axis("off")
    axes[1].set_title("After")

    quality_text = ""
    if metrics.quality_score is not None:
        quality_text = f"Quality score: {metrics.quality_score}"
    fig.suptitle(f"{metrics.name}: Before vs After Spectrograms {quality_text}".strip())
    fig.savefig(out_png, dpi=180)
    plt.close(fig)


def main() -> int:
    args = parse_args()
    demo_root = Path(args.demo_root)
    out_dir = Path(args.out_dir)
    per_dir = out_dir / "per_recording"

    if not demo_root.exists():
        raise FileNotFoundError(f"Demo root not found: {demo_root}")

    if out_dir.exists():
        shutil.rmtree(out_dir)
    per_dir.mkdir(parents=True, exist_ok=True)

    demo_dirs = sorted(path for path in demo_root.iterdir() if path.is_dir())
    metrics_rows: list[RecordingMetrics] = []

    for demo_dir in demo_dirs:
        metrics = _load_metrics(
            demo_dir,
            low_band_max_hz=args.low_band_max_hz,
            noise_band_min_hz=args.noise_band_min_hz,
            noise_band_max_hz=args.noise_band_max_hz,
        )
        metrics_rows.append(metrics)

        _plot_recording_panel(metrics, per_dir / f"{metrics.name}_before_vs_after_metrics.png")
        _plot_spectrogram_panel(metrics, per_dir / f"{metrics.name}_before_vs_after_spectrogram_panel.png")

    if not metrics_rows:
        raise RuntimeError("No demo folders with original.wav/processed.wav/metadata.json found")

    _save_summary_csv(metrics_rows, out_dir / "summary_metrics.csv")
    _plot_summary_rms(metrics_rows, out_dir / "summary_rms_before_vs_after.png")
    _plot_summary_band_ratios(metrics_rows, out_dir / "summary_band_ratio_before_vs_after.png")

    readme = out_dir / "README.txt"
    readme.write_text(
        "Before vs After graph pack generated from data/recordings/demo.\n"
        "- summary_metrics.csv: numeric metrics table per recording.\n"
        "- summary_rms_before_vs_after.png: grouped RMS bars.\n"
        "- summary_band_ratio_before_vs_after.png: low/noise band comparison.\n"
        "- per_recording/*_before_vs_after_metrics.png: waveform + RMS + band ratio panels.\n"
        "- per_recording/*_before_vs_after_spectrogram_panel.png: side-by-side spectrograms.\n",
        encoding="utf-8",
    )

    print(f"Generated Before vs After graphs for {len(metrics_rows)} recordings in {out_dir}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())