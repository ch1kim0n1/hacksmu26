"""Analyze and sync the bundled EchoField audio files.

Outputs:
- data/metadata.csv: app-readable metadata rows for every WAV.
- data/analysis/audio_inventory.csv: compact inventory and analysis table.
- data/analysis/audio_analysis.json: richer per-file analysis records.
"""

from __future__ import annotations

import csv
import json
import re
import sys
from pathlib import Path
from typing import Any

import librosa
import numpy as np
import soundfile as sf

PROJECT_ROOT = Path(__file__).resolve().parents[1]
if str(PROJECT_ROOT) not in sys.path:
    sys.path.insert(0, str(PROJECT_ROOT))

from echofield.pipeline.feature_extract import classify_call_type, extract_acoustic_features
from echofield.pipeline.noise_classifier import classify_noise

AUDIO_DIR = PROJECT_ROOT / "data" / "audio-files"
METADATA_PATH = PROJECT_ROOT / "data" / "metadata.csv"
ANALYSIS_DIR = PROJECT_ROOT / "data" / "analysis"
INVENTORY_CSV = ANALYSIS_DIR / "audio_inventory.csv"
ANALYSIS_JSON = ANALYSIS_DIR / "audio_analysis.json"

TARGET_SR = 22_050
ANALYSIS_CLIP_SECONDS = 60.0


def infer_noise_type(filename: str) -> str:
    name = filename.lower()
    if "airplane" in name:
        if "vehicle" in name:
            return "airplane+vehicle"
        return "airplane"
    if "generator" in name:
        if "vehicle" in name:
            return "vehicle+generator"
        return "generator"
    if "vehicle" in name:
        return "vehicle"
    if "background" in name:
        return "background"
    return "unknown"


def infer_animal_id(stem: str) -> str:
    match = re.match(r"(.+?)_(?:airplane|vehicle|generator|background)", stem, re.IGNORECASE)
    if match:
        return match.group(1).strip(" _-")
    return stem.split("_")[0].strip(" _-")


def infer_date(animal_id: str) -> str:
    """Extract a recording date or year from the animal/recording ID.

    Known patterns from ElephantVoices naming conventions:
    - ``YY-YYMMDD-NN`` (e.g. ``04-040920-02`` -> 2004-09-20)
    - ``YYMMDD-NN``    (e.g. ``061220-24``    -> 2006-12-20)
    - ``YYYY-NN``      (e.g. ``2000-23``      -> 2000)
    - ``YY-NNA``       (e.g. ``99-22A``       -> 1999)
    - ``JYY-NN``       (e.g. ``J86-1``        -> 1986)
    """
    # Pattern: YY-YYMMDD-NN  (e.g. 04-040920-02)
    m = re.match(r"\d{2}-(\d{2})(\d{2})(\d{2})-\d+", animal_id)
    if m:
        yy, mm, dd = m.group(1), m.group(2), m.group(3)
        year = int(yy) + (1900 if int(yy) > 50 else 2000)
        return f"{year}-{mm}-{dd}"

    # Pattern: YYMMDD-NN  (e.g. 061220-24, 090224-09)
    m = re.match(r"(\d{2})(\d{2})(\d{2})-\d+$", animal_id)
    if m:
        yy, mm, dd = m.group(1), m.group(2), m.group(3)
        year = int(yy) + (1900 if int(yy) > 50 else 2000)
        return f"{year}-{mm}-{dd}"

    # Pattern: YYYY-NN  (e.g. 2000-23, 1989-06)
    m = re.match(r"(\d{4})-\d+", animal_id)
    if m:
        return m.group(1)

    # Pattern: YY-NNA  (e.g. 99-22A, 99-37)
    m = re.match(r"(\d{2})-\d+", animal_id)
    if m:
        yy = int(m.group(1))
        year = yy + (1900 if yy > 50 else 2000)
        return str(year)

    # Pattern: JYY-NN  (e.g. J86-1, J87-27)
    m = re.match(r"J(\d{2})-\d+", animal_id, re.IGNORECASE)
    if m:
        yy = int(m.group(1))
        year = yy + (1900 if yy > 50 else 2000)
        return str(year)

    return ""


def load_analysis_clip(path: Path) -> tuple[np.ndarray, int]:
    y, sr = librosa.load(
        str(path),
        sr=TARGET_SR,
        mono=True,
        duration=ANALYSIS_CLIP_SECONDS,
    )
    return y.astype(np.float32), sr


def analyze_file(path: Path) -> dict[str, Any]:
    info = sf.info(str(path))
    y, sr = load_analysis_clip(path)
    noise = classify_noise(y, sr)
    features = extract_acoustic_features(y, sr)
    call_type = classify_call_type(features)

    stem = path.stem
    animal_id = infer_animal_id(stem)
    inferred_noise = infer_noise_type(path.name)
    return {
        "call_id": stem,
        "filename": path.name,
        "animal_id": animal_id,
        "location": "",
        "date": infer_date(animal_id),
        "start_sec": 0.0,
        "end_sec": round(float(info.duration), 3),
        "duration_s": round(float(info.duration), 3),
        "sample_rate": int(info.samplerate),
        "channels": int(info.channels),
        "noise_type_ref": inferred_noise,
        "species": "African bush elephant",
        "analysis_clip_seconds": min(round(float(info.duration), 3), ANALYSIS_CLIP_SECONDS),
        "classifier_primary_noise": noise["primary_type"],
        "classifier_confidence": noise["confidence"],
        "dominant_frequency_hz": noise["dominant_frequency_hz"],
        "call_type": call_type["call_type"],
        "call_type_confidence": call_type["confidence"],
        "fundamental_frequency_hz": features["fundamental_frequency_hz"],
        "harmonicity": features["harmonicity"],
        "harmonic_count": features["harmonic_count"],
        "bandwidth_hz": features["bandwidth_hz"],
        "spectral_centroid_hz": features["spectral_centroid_hz"],
        "snr_db": features["snr_db"],
        "features": features,
        "noise": noise,
    }


def write_metadata(records: list[dict[str, Any]]) -> None:
    METADATA_PATH.parent.mkdir(parents=True, exist_ok=True)
    fieldnames = [
        "call_id",
        "filename",
        "animal_id",
        "location",
        "date",
        "start_sec",
        "end_sec",
        "noise_type_ref",
        "species",
    ]
    with METADATA_PATH.open("w", encoding="utf-8", newline="") as handle:
        writer = csv.DictWriter(handle, fieldnames=fieldnames)
        writer.writeheader()
        for record in records:
            writer.writerow({field: record.get(field, "") for field in fieldnames})


def write_inventory(records: list[dict[str, Any]]) -> None:
    ANALYSIS_DIR.mkdir(parents=True, exist_ok=True)
    fieldnames = [
        "call_id",
        "filename",
        "animal_id",
        "duration_s",
        "sample_rate",
        "channels",
        "noise_type_ref",
        "classifier_primary_noise",
        "classifier_confidence",
        "dominant_frequency_hz",
        "call_type",
        "call_type_confidence",
        "fundamental_frequency_hz",
        "harmonicity",
        "harmonic_count",
        "bandwidth_hz",
        "spectral_centroid_hz",
        "snr_db",
    ]
    with INVENTORY_CSV.open("w", encoding="utf-8", newline="") as handle:
        writer = csv.DictWriter(handle, fieldnames=fieldnames)
        writer.writeheader()
        for record in records:
            writer.writerow({field: record.get(field, "") for field in fieldnames})

    ANALYSIS_JSON.write_text(json.dumps(records, indent=2, default=str), encoding="utf-8")


def main() -> None:
    if not AUDIO_DIR.is_dir():
        raise SystemExit(f"Audio directory not found: {AUDIO_DIR}")

    paths = sorted(AUDIO_DIR.glob("*.wav"))
    if not paths:
        raise SystemExit(f"No WAV files found under {AUDIO_DIR}")

    records = []
    for index, path in enumerate(paths, start=1):
        print(f"[{index:02d}/{len(paths)}] analyzing {path.name}", flush=True)
        records.append(analyze_file(path))

    write_metadata(records)
    write_inventory(records)
    total_duration = sum(record["duration_s"] for record in records)
    print(f"Wrote {METADATA_PATH}")
    print(f"Wrote {INVENTORY_CSV}")
    print(f"Wrote {ANALYSIS_JSON}")
    print(f"Analyzed {len(records)} files; total duration {total_duration / 60:.1f} minutes")


if __name__ == "__main__":
    main()
