#!/usr/bin/env python3
"""Build a rumble-only showcase set for demo and analysis.

Input:
- results/audio-classification/segment_predictions.csv

Output:
- results/audio-classification/rumble_showcase/clips_all/*.wav
- results/audio-classification/rumble_showcase/prime_examples.csv
- results/audio-classification/rumble_showcase/all_rumble_examples.csv
- results/audio-classification/rumble_showcase/prime_examples_top100.csv
- results/audio-classification/rumble_showcase/recording_summary.csv
- results/audio-classification/rumble_showcase/demo_playlist_prime.m3u
- results/audio-classification/rumble_showcase/demo_playlist_all.m3u
- results/audio-classification/rumble_showcase/summary.json
"""

from __future__ import annotations

import argparse
import csv
import json
import shutil
from dataclasses import dataclass
from pathlib import Path
from typing import Any

import numpy as np
import soundfile as sf


@dataclass
class SegmentRow:
    recording: str
    segment_index: int
    start_sec: float
    end_sec: float
    predicted_class: str
    confidence: float
    prob_roar: float
    prob_rumble: float
    prob_trumpet: float


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Create rumble-only prime examples for demo")
    parser.add_argument(
        "--segments-csv",
        default="results/audio-classification/segment_predictions.csv",
        help="Path to segment prediction CSV",
    )
    parser.add_argument(
        "--recordings-dir",
        default="data/recordings/original",
        help="Directory with source WAV files",
    )
    parser.add_argument(
        "--out-dir",
        default="results/audio-classification/rumble_showcase",
        help="Output directory",
    )
    parser.add_argument(
        "--top-per-recording",
        type=int,
        default=5,
        help="Number of prime rumble examples to keep per recording",
    )
    parser.add_argument(
        "--padding-sec",
        type=float,
        default=0.15,
        help="Extra context padding added on both sides of each clip",
    )
    parser.add_argument(
        "--fade-ms",
        type=float,
        default=20.0,
        help="Fade in/out in milliseconds",
    )
    parser.add_argument(
        "--target-class",
        default="Rumble",
        help="Only keep segments with this predicted class",
    )
    return parser.parse_args()


def _load_segments(path: Path, target_class: str) -> list[SegmentRow]:
    rows: list[SegmentRow] = []
    with path.open("r", encoding="utf-8", newline="") as f:
        reader = csv.DictReader(f)
        for row in reader:
            if row.get("predicted_class") != target_class:
                continue
            rows.append(
                SegmentRow(
                    recording=str(row["recording"]),
                    segment_index=int(row["segment_index"]),
                    start_sec=float(row["start_sec"]),
                    end_sec=float(row["end_sec"]),
                    predicted_class=str(row["predicted_class"]),
                    confidence=float(row["confidence"]),
                    prob_roar=float(row["prob_roar"]),
                    prob_rumble=float(row["prob_rumble"]),
                    prob_trumpet=float(row["prob_trumpet"]),
                )
            )
    return rows


def _safe_stem(name: str) -> str:
    stem = Path(name).stem
    return "".join(ch if ch.isalnum() or ch in {"-", "_"} else "_" for ch in stem)


def _apply_fade(clip: np.ndarray, sr: int, fade_ms: float) -> np.ndarray:
    if clip.size == 0:
        return clip
    fade_samples = max(0, int(round((fade_ms / 1000.0) * sr)))
    fade_samples = min(fade_samples, clip.shape[0] // 2)
    if fade_samples <= 0:
        return clip

    ramp = np.linspace(0.0, 1.0, fade_samples, dtype=np.float32)
    clip = clip.copy()
    clip[:fade_samples] *= ramp
    clip[-fade_samples:] *= ramp[::-1]
    return clip


def _normalize_peak(clip: np.ndarray, peak_target: float = 0.98) -> np.ndarray:
    peak = float(np.max(np.abs(clip))) if clip.size else 0.0
    if peak <= 1e-8:
        return clip
    scale = min(peak_target / peak, 1.0)
    return (clip * scale).astype(np.float32)


def _select_top_non_overlapping(rows: list[SegmentRow], top_k: int) -> list[SegmentRow]:
    selected: list[SegmentRow] = []
    ordered = sorted(rows, key=lambda x: x.confidence, reverse=True)
    for row in ordered:
        overlap = False
        for s in selected:
            if not (row.end_sec <= s.start_sec or row.start_sec >= s.end_sec):
                overlap = True
                break
        if overlap:
            continue
        selected.append(row)
        if len(selected) >= top_k:
            break
    return sorted(selected, key=lambda x: x.confidence, reverse=True)


def _segment_key(row: SegmentRow) -> tuple[int, float, float]:
    return (row.segment_index, round(row.start_sec, 3), round(row.end_sec, 3))


def main() -> int:
    args = parse_args()
    segments_csv = Path(args.segments_csv)
    recordings_dir = Path(args.recordings_dir)
    out_dir = Path(args.out_dir)
    all_clips_dir = out_dir / "clips_all"

    if not segments_csv.exists():
        raise FileNotFoundError(f"Missing segments CSV: {segments_csv}")
    if not recordings_dir.exists():
        raise FileNotFoundError(f"Missing recordings dir: {recordings_dir}")

    rows = _load_segments(segments_csv, args.target_class)
    if not rows:
        raise RuntimeError(f"No rows found for class={args.target_class!r}")

    if out_dir.exists():
        shutil.rmtree(out_dir)
    all_clips_dir.mkdir(parents=True, exist_ok=True)

    by_recording: dict[str, list[SegmentRow]] = {}
    for row in rows:
        by_recording.setdefault(row.recording, []).append(row)

    all_records: list[dict[str, Any]] = []
    prime_records: list[dict[str, Any]] = []
    summary_rows: list[dict[str, Any]] = []
    all_playlist_lines = ["#EXTM3U"]
    prime_playlist_lines = ["#EXTM3U"]

    for recording_name in sorted(by_recording):
        source_path = recordings_dir / recording_name
        if not source_path.exists():
            continue

        samples, sr = sf.read(str(source_path), always_2d=False)
        audio = np.asarray(samples, dtype=np.float32)
        if audio.ndim == 2:
            audio = audio.mean(axis=1)

        recording_rows = sorted(by_recording[recording_name], key=lambda x: x.segment_index)
        selected = _select_top_non_overlapping(recording_rows, args.top_per_recording)
        selected_rank_map = {_segment_key(row): rank for rank, row in enumerate(selected, start=1)}
        stem = _safe_stem(recording_name)
        all_created = 0
        prime_created = 0

        for row in recording_rows:
            start_sec = max(0.0, row.start_sec - args.padding_sec)
            end_sec = min(float(len(audio)) / float(sr), row.end_sec + args.padding_sec)
            if end_sec <= start_sec:
                continue

            i0 = max(0, int(round(start_sec * sr)))
            i1 = min(len(audio), int(round(end_sec * sr)))
            if i1 <= i0:
                continue

            clip = audio[i0:i1].astype(np.float32)
            clip = _apply_fade(clip, sr=sr, fade_ms=args.fade_ms)
            clip = _normalize_peak(clip, peak_target=0.98)

            clip_name = (
                f"{stem}__seg-{row.segment_index:03d}"
                f"_conf-{row.confidence:.6f}.wav"
            )
            clip_path = all_clips_dir / clip_name
            sf.write(str(clip_path), clip, sr, subtype="PCM_16")

            item = {
                "recording": recording_name,
                "segment_index": row.segment_index,
                "predicted_class": row.predicted_class,
                "confidence": round(row.confidence, 6),
                "prob_roar": round(row.prob_roar, 6),
                "prob_rumble": round(row.prob_rumble, 6),
                "prob_trumpet": round(row.prob_trumpet, 6),
                "start_sec": round(start_sec, 3),
                "end_sec": round(end_sec, 3),
                "duration_sec": round(end_sec - start_sec, 3),
                "clip_path": str(clip_path.relative_to(out_dir)),
            }
            all_records.append(item)
            all_playlist_lines.append(f"#EXTINF:{item['duration_sec']},{recording_name} | seg {row.segment_index}")
            all_playlist_lines.append(str(Path("clips_all") / clip_name))
            all_created += 1

            key = _segment_key(row)
            if key not in selected_rank_map:
                continue

            rank = selected_rank_map[key]
            prime = dict(item)
            prime["rank_in_recording"] = rank
            # Keep rank next to recording for easier spreadsheet sorting.
            ordered_prime = {
                "recording": prime["recording"],
                "rank_in_recording": prime["rank_in_recording"],
                "segment_index": prime["segment_index"],
                "predicted_class": prime["predicted_class"],
                "confidence": prime["confidence"],
                "prob_roar": prime["prob_roar"],
                "prob_rumble": prime["prob_rumble"],
                "prob_trumpet": prime["prob_trumpet"],
                "start_sec": prime["start_sec"],
                "end_sec": prime["end_sec"],
                "duration_sec": prime["duration_sec"],
                "clip_path": prime["clip_path"],
            }
            prime_records.append(ordered_prime)
            prime_playlist_lines.append(f"#EXTINF:{prime['duration_sec']},{recording_name} | rank {rank}")
            prime_playlist_lines.append(str(Path("clips_all") / clip_name))
            prime_created += 1

        summary_rows.append(
            {
                "recording": recording_name,
                "total_rumble_segments": len(by_recording[recording_name]),
                "all_rumble_clips_created": all_created,
                "prime_clips_created": prime_created,
                "best_confidence": round(max((r.confidence for r in by_recording[recording_name]), default=0.0), 6),
            }
        )

    all_records.sort(key=lambda x: float(x["confidence"]), reverse=True)
    prime_records.sort(key=lambda x: float(x["confidence"]), reverse=True)

    all_csv = out_dir / "all_rumble_examples.csv"
    prime_csv = out_dir / "prime_examples.csv"
    top100_csv = out_dir / "prime_examples_top100.csv"
    summary_csv = out_dir / "recording_summary.csv"
    all_playlist = out_dir / "demo_playlist_all.m3u"
    prime_playlist = out_dir / "demo_playlist_prime.m3u"

    if all_records:
        with all_csv.open("w", encoding="utf-8", newline="") as f:
            writer = csv.DictWriter(f, fieldnames=list(all_records[0].keys()))
            writer.writeheader()
            writer.writerows(all_records)

    if prime_records:
        with prime_csv.open("w", encoding="utf-8", newline="") as f:
            writer = csv.DictWriter(f, fieldnames=list(prime_records[0].keys()))
            writer.writeheader()
            writer.writerows(prime_records)

        top100 = prime_records[:100]
        with top100_csv.open("w", encoding="utf-8", newline="") as f:
            writer = csv.DictWriter(f, fieldnames=list(top100[0].keys()))
            writer.writeheader()
            writer.writerows(top100)

    if summary_rows:
        with summary_csv.open("w", encoding="utf-8", newline="") as f:
            writer = csv.DictWriter(f, fieldnames=list(summary_rows[0].keys()))
            writer.writeheader()
            writer.writerows(summary_rows)

    all_playlist.write_text("\n".join(all_playlist_lines) + "\n", encoding="utf-8")
    prime_playlist.write_text("\n".join(prime_playlist_lines) + "\n", encoding="utf-8")

    meta = {
        "target_class": args.target_class,
        "recordings_with_rumbles": len(summary_rows),
        "all_rumble_examples_total": len(all_records),
        "prime_examples_total": len(prime_records),
        "top_per_recording": args.top_per_recording,
        "source_segments_csv": str(segments_csv),
        "source_recordings_dir": str(recordings_dir),
    }
    (out_dir / "summary.json").write_text(json.dumps(meta, indent=2), encoding="utf-8")

    readme = out_dir / "README.txt"
    readme.write_text(
        "Rumble-only prime showcase generated from segment predictions.\n"
        "- all_rumble_examples.csv: all extracted rumble clips (ranked by confidence).\n"
        "- prime_examples.csv: all selected prime clips (ranked by confidence).\n"
        "- prime_examples_top100.csv: strongest 100 clips for quick demo curation.\n"
        "- recording_summary.csv: per-recording clip counts and best confidence.\n"
        "- demo_playlist_all.m3u: playlist with every rumble clip.\n"
        "- demo_playlist_prime.m3u: playlist with prime subset only.\n",
        encoding="utf-8",
    )

    print(f"Created {len(all_records)} rumble clips and {len(prime_records)} prime clips in {all_clips_dir}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())