"""Heuristic background-noise classification."""

from __future__ import annotations

import numpy as np
import librosa

NOISE_FREQUENCY_RANGES = {
    "airplane": (20.0, 500.0),
    "car": (20.0, 250.0),
    "generator": (50.0, 250.0),
    "wind": (200.0, 2000.0),
    "other": (0.0, 4000.0),
}


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
