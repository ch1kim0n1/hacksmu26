"""Heuristic background-noise classification."""

from __future__ import annotations

import csv
from pathlib import Path
from typing import Any

import numpy as np
import librosa

from echofield.utils.audio_utils import load_audio

NOISE_FREQUENCY_RANGES = {
    "airplane": (20.0, 500.0),
    "car": (20.0, 250.0),
    "generator": (50.0, 250.0),
    "wind": (200.0, 2000.0),
    "other": (0.0, 4000.0),
}
NOISE_LABEL_ALIASES = {
    "aircraft": "airplane",
    "plane": "airplane",
    "airplane": "airplane",
    "vehicle": "car",
    "vehicles": "car",
    "traffic": "car",
    "car": "car",
    "generator": "generator",
    "wind": "wind",
    "background": "other",
    "rain": "other",
    "biological_interference": "other",
    "other": "other",
}
SUPPORTED_AUDIO_SUFFIXES = {".wav", ".flac", ".mp3"}


def _band_energy(y: np.ndarray, sr: int, low_hz: float, high_hz: float) -> float:
    spectrum = np.abs(librosa.stft(y, n_fft=2048, hop_length=512))
    freqs = librosa.fft_frequencies(sr=sr, n_fft=2048)
    mask = (freqs >= low_hz) & (freqs < high_hz)
    if not np.any(mask):
        return 0.0
    return float(np.sum(spectrum[mask] ** 2))


def classify_noise(y: np.ndarray, sr: int) -> dict[str, object]:
    if y.size == 0:
        return {
            "primary_type": "other",
            "confidence": 0.0,
            "noise_types": [],
            "dominant_frequency_hz": 0.0,
        }

    scores = {
        "airplane": _band_energy(y, sr, 20, 500) * 1.1,
        "car": _band_energy(y, sr, 20, 250) * 1.0,
        "generator": _band_energy(y, sr, 50, 250) * 1.25,
        "wind": _band_energy(y, sr, 200, 2000) * 0.95,
        "other": _band_energy(y, sr, 2000, min(sr / 2.0, 8000.0)) * 0.8,
    }

    total = sum(scores.values())
    if total <= 0:
        normalized = {name: 0.0 for name in scores}
    else:
        normalized = {name: value / total for name, value in scores.items()}

    ranked = sorted(normalized.items(), key=lambda item: item[1], reverse=True)
    primary_type, primary_confidence = ranked[0]

    mel = librosa.feature.melspectrogram(y=y, sr=sr, n_mels=128)
    mel_mean = np.mean(mel, axis=1)
    dominant_bin = int(np.argmax(mel_mean))
    mel_freqs = librosa.mel_frequencies(n_mels=128, fmin=0.0, fmax=sr / 2.0)
    dominant_frequency = float(mel_freqs[dominant_bin])

    noise_types = [
        {
            "type": noise_type,
            "percentage": round(score * 100.0, 1),
            "frequency_range_hz": list(NOISE_FREQUENCY_RANGES[noise_type]),
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

    # Handle compound labels (e.g., "vehicle+generator", "airplane+vehicle")
    # by taking the first component
    if "+" in normalized:
        normalized = normalized.split("+")[0]

    if normalized not in NOISE_LABEL_ALIASES:
        raise ValueError(f"Unsupported noise label: {label}")
    return NOISE_LABEL_ALIASES[normalized]


def _iter_labeled_audio(dataset_path: str | Path) -> list[tuple[Path, str]]:
    path = Path(dataset_path)
    if path.is_file():
        rows: list[tuple[Path, str]] = []
        with path.open("r", encoding="utf-8", newline="") as handle:
            for row in csv.DictReader(handle):
                # Support multiple label column names
                raw_label = (
                    row.get("label")
                    or row.get("noise_type")
                    or row.get("class")
                    or row.get("noise_type_ref")
                )
                raw_path = row.get("path") or row.get("filename") or row.get("file")
                if not raw_label or not raw_path:
                    continue
                audio_path = Path(raw_path)
                if not audio_path.is_absolute():
                    # Try multiple resolution strategies
                    candidate_paths = [
                        path.parent / audio_path,  # Original: data/04-040920-02_vehicle_1.wav
                        path.parent / "audio-files" / audio_path.name,  # New: data/audio-files/04-040920-02_vehicle_1.wav
                        path.parent / "recordings" / "original" / audio_path.name,  # data/recordings/original/04-040920-02_vehicle_1.wav
                    ]
                    audio_path = None
                    for candidate in candidate_paths:
                        if candidate.exists():
                            audio_path = candidate
                            break
                    if audio_path is None:
                        # If still not found, use original path (will fail later)
                        audio_path = candidate_paths[0]
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
