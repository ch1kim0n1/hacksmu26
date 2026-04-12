"""Heuristic background-noise classification.

Uses multi-feature spectral analysis to distinguish noise types commonly
found in elephant field recordings: airplane, vehicle, generator, wind,
and ambient background noise.

Key design choices:
- Classification focuses on 100-8000 Hz to avoid infrasonic elephant calls.
- 60 Hz harmonic comb is NOT used as a discriminator because field recording
  equipment typically introduces mains hum at 60 Hz across all recordings.
- High-frequency energy ratio (> 2 kHz) is the strongest discriminator
  between vehicle (near zero) and generator/airplane (notable).
"""

from __future__ import annotations

import csv
from pathlib import Path
from typing import Any

import numpy as np
import librosa

from echofield.utils.audio_utils import load_audio

NOISE_FREQUENCY_RANGES = {
    "airplane": (50.0, 4000.0),
    "vehicle": (20.0, 500.0),
    "generator": (40.0, 500.0),
    "wind": (20.0, 2000.0),
    "background": (0.0, 8000.0),
}
NOISE_LABEL_ALIASES = {
    "aircraft": "airplane",
    "plane": "airplane",
    "airplane": "airplane",
    "vehicle": "vehicle",
    "vehicles": "vehicle",
    "traffic": "vehicle",
    "car": "vehicle",
    "generator": "generator",
    "wind": "wind",
    "background": "background",
    "rain": "wind",
    "biological_interference": "background",
    "other": "background",
}
SUPPORTED_AUDIO_SUFFIXES = {".wav", ".flac", ".mp3"}


def _band_energy(power_spectrum: np.ndarray, freqs: np.ndarray,
                 low_hz: float, high_hz: float) -> float:
    """Compute total energy in a frequency band from a pre-computed power spectrum."""
    mask = (freqs >= low_hz) & (freqs < high_hz)
    if not np.any(mask):
        return 0.0
    return float(np.sum(power_spectrum[mask]))


def classify_noise(y: np.ndarray, sr: int) -> dict[str, object]:
    """Classify background noise type using multi-feature spectral analysis.

    Classification focuses on 100-8000 Hz (above elephant infrasound).

    Key discriminating features:
    1. High-frequency energy ratio (>2 kHz): vehicle ~0%, generator 7-28%
    2. Temporal variability (RMS CV): vehicle >1.0, generator/airplane ~0.5
    3. Spectral slope: vehicle very steep, airplane/generator flatter
    4. Mid-frequency energy ratio (500-2000 Hz): airplane often higher
    5. Spectral flatness: wind highest, generator lowest
    """
    if y.size == 0:
        return {
            "primary_type": "background",
            "confidence": 0.0,
            "noise_types": [],
            "dominant_frequency_hz": 0.0,
        }

    eps = 1e-12

    # --- Spectral analysis ---
    S = np.abs(librosa.stft(y, n_fft=2048, hop_length=512))
    freqs = librosa.fft_frequencies(sr=sr, n_fft=2048)
    power = np.mean(S ** 2, axis=1)

    # --- Noise-focused band energies (above elephant infrasound) ---
    e_noise_low = _band_energy(power, freqs, 100, 500)
    e_noise_mid = _band_energy(power, freqs, 500, 2000)
    e_noise_high = _band_energy(power, freqs, 2000, min(sr / 2.0, 8000.0))
    e_noise_total = e_noise_low + e_noise_mid + e_noise_high + eps

    noise_low_ratio = e_noise_low / e_noise_total
    noise_mid_ratio = e_noise_mid / e_noise_total
    noise_high_ratio = e_noise_high / e_noise_total

    # Amplified high-freq ratio — emphasizes the small but critical differences
    # vehicle ~0.002 → 0.03, generator ~0.07-0.28 → 1.0, airplane varies
    hf_amplified = min(noise_high_ratio * 15.0, 1.0)

    # Spectral slope: energy drop-off from low to mid+high
    noise_slope = e_noise_low / (e_noise_mid + e_noise_high + eps)
    noise_slope_norm = min(noise_slope / 30.0, 1.0)  # vehicle ~80→1.0, generator ~5→0.17

    # --- Spectral flatness ---
    spectral_flatness = float(np.mean(
        librosa.feature.spectral_flatness(y=y)
    ))
    # Amplify to usable range (raw values are 0.0004-0.03)
    flatness_norm = min(spectral_flatness * 40.0, 1.0)

    # --- Temporal variability (RMS coefficient of variation) ---
    rms = librosa.feature.rms(y=y, frame_length=2048, hop_length=512)[0]
    if len(rms) >= 4 and float(np.mean(rms)) > 0:
        rms_cv = float(np.std(rms) / np.mean(rms))
    else:
        rms_cv = 0.0
    temporal_var = min(rms_cv / 1.5, 1.0)   # vehicle ~1.3-1.6 → ~0.9-1.0
    temporal_stability = 1.0 - temporal_var

    # === Multi-feature scoring ===

    # Vehicle: nearly all energy in low band + high temporal variability +
    # near-zero high-freq content
    vehicle_score = (
        (1.0 - hf_amplified) * 0.35
        + temporal_var * 0.30
        + noise_slope_norm * 0.20
        + (1.0 - flatness_norm) * 0.15
    )

    # Generator: notable high-freq content + very stable + tonal (low flatness)
    generator_score = (
        hf_amplified * 0.35
        + temporal_stability * 0.30
        + (1.0 - flatness_norm) * 0.20
        + (1.0 - noise_slope_norm) * 0.15
    )

    # Airplane: broader mid/high energy spread + moderate variability +
    # higher flatness than generator
    airplane_score = (
        (1.0 - noise_slope_norm) * 0.25
        + min(noise_mid_ratio * 5.0, 1.0) * 0.25
        + flatness_norm * 0.25
        + hf_amplified * 0.25
    )

    # Wind: spectrally flat + temporally variable + no tonal structure
    wind_score = (
        flatness_norm * 0.50
        + temporal_var * 0.30
        + (1.0 - hf_amplified) * 0.20
    )

    scores = {
        "airplane": airplane_score,
        "vehicle": vehicle_score,
        "generator": generator_score,
        "wind": wind_score,
    }

    # Normalize scores to probabilities
    total_score = sum(scores.values()) + eps
    normalized = {name: value / total_score for name, value in scores.items()}

    ranked = sorted(normalized.items(), key=lambda item: item[1], reverse=True)
    primary_type, primary_confidence = ranked[0]

    # --- Dominant frequency from mel spectrogram ---
    mel = librosa.feature.melspectrogram(y=y, sr=sr, n_mels=128)
    mel_mean = np.mean(mel, axis=1)
    dominant_bin = int(np.argmax(mel_mean))
    mel_freqs = librosa.mel_frequencies(n_mels=128, fmin=0.0, fmax=sr / 2.0)
    dominant_frequency = float(mel_freqs[dominant_bin])

    noise_types = [
        {
            "type": noise_type,
            "percentage": round(score * 100.0, 1),
            "frequency_range_hz": list(NOISE_FREQUENCY_RANGES.get(
                noise_type, NOISE_FREQUENCY_RANGES["background"]
            )),
        }
        for noise_type, score in ranked
        if score > 0.01
    ]

    return {
        "primary_type": primary_type,
        "confidence": round(float(np.clip(primary_confidence, 0.0, 1.0)), 3),
        "noise_types": noise_types,
        "dominant_frequency_hz": round(dominant_frequency, 1),
    }


def get_noise_frequency_range(noise_type: str) -> tuple[float, float]:
    if noise_type not in NOISE_FREQUENCY_RANGES:
        raise ValueError(f"Unknown noise type: {noise_type}")
    return NOISE_FREQUENCY_RANGES[noise_type]


def normalize_noise_label(label: str) -> str:
    normalized = label.strip().lower().replace(" ", "_")
    if normalized not in NOISE_LABEL_ALIASES:
        raise ValueError(f"Unsupported noise label: {label}")
    return NOISE_LABEL_ALIASES[normalized]


def _iter_labeled_audio(dataset_path: str | Path) -> list[tuple[Path, str]]:
    path = Path(dataset_path)
    if path.is_file():
        rows: list[tuple[Path, str]] = []
        with path.open("r", encoding="utf-8", newline="") as handle:
            for row in csv.DictReader(handle):
                raw_label = row.get("label") or row.get("noise_type") or row.get("class")
                raw_path = row.get("path") or row.get("filename") or row.get("file")
                if not raw_label or not raw_path:
                    continue
                audio_path = Path(raw_path)
                if not audio_path.is_absolute():
                    audio_path = path.parent / audio_path
                rows.append((audio_path, normalize_noise_label(raw_label)))
        return rows

    rows = []
    for audio_path in sorted(path.rglob("*")):
        if audio_path.suffix.lower() not in SUPPORTED_AUDIO_SUFFIXES:
            continue
        rows.append((audio_path, normalize_noise_label(audio_path.parent.name)))
    return rows


def validate_noise_classifier(dataset_path: str | Path, *, sample_rate: int | None = None) -> dict[str, Any]:
    labeled_audio = _iter_labeled_audio(dataset_path)
    if not labeled_audio:
        raise ValueError(f"No labeled audio files found at {dataset_path}")

    confusion: dict[str, dict[str, int]] = {}
    samples: list[dict[str, Any]] = []
    correct = 0
    for audio_path, label in labeled_audio:
        y, sr = load_audio(audio_path, sr=sample_rate, mono=True)
        result = classify_noise(y, sr)
        predicted = normalize_noise_label(str(result["primary_type"]))
        correct += int(predicted == label)
        confusion.setdefault(label, {})
        confusion[label][predicted] = confusion[label].get(predicted, 0) + 1
        samples.append(
            {
                "path": str(audio_path),
                "label": label,
                "predicted": predicted,
                "confidence": result["confidence"],
                "correct": predicted == label,
            }
        )

    per_class_recall = {}
    for label, predictions in confusion.items():
        total = sum(predictions.values())
        per_class_recall[label] = round(predictions.get(label, 0) / total, 3) if total else 0.0

    return {
        "total": len(samples),
        "correct": correct,
        "accuracy": round(correct / len(samples), 3),
        "per_class_recall": per_class_recall,
        "confusion": confusion,
        "samples": samples,
    }
