"""Heuristic background-noise classification.

Uses multi-feature scoring with discriminative sub-band energy densities,
spectral shape features (flatness, slope), and temporal modulation to
distinguish airplane, car, generator, wind, and other noise types.
"""

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


# ---------------------------------------------------------------------------
# Feature helpers
# ---------------------------------------------------------------------------

def _band_energy_density(y: np.ndarray, sr: int, low_hz: float, high_hz: float) -> float:
    """Band energy normalized by the number of frequency bins in the band.

    Dividing by bin count prevents wider bands from dominating the score.
    """
    spectrum = np.abs(librosa.stft(y, n_fft=2048, hop_length=512))
    freqs = librosa.fft_frequencies(sr=sr, n_fft=2048)
    mask = (freqs >= low_hz) & (freqs < high_hz)
    n_bins = int(np.sum(mask))
    if n_bins == 0:
        return 0.0
    return float(np.sum(spectrum[mask] ** 2)) / float(n_bins)


def _spectral_slope(y: np.ndarray, sr: int) -> float:
    """Linear regression slope on the log-magnitude spectrum.

    Airplanes have a steep negative slope (energy drops with frequency);
    generators are relatively flat.
    """
    S = np.abs(librosa.stft(y, n_fft=2048))
    mean_spec = np.mean(S, axis=1)
    mean_spec = np.maximum(mean_spec, 1e-10)
    log_spec = np.log10(mean_spec)
    x = np.arange(len(log_spec), dtype=np.float64)
    if len(x) < 2:
        return 0.0
    slope = np.polyfit(x, log_spec, 1)[0]
    return float(slope)


def _temporal_modulation(y: np.ndarray, sr: int) -> float:
    """Normalized variance of frame-wise RMS energy (0=steady, 1=variable).

    Generators are very steady (low value), cars vary more, airplanes
    fade in/out.
    """
    rms = librosa.feature.rms(y=y, frame_length=2048, hop_length=512)[0]
    if len(rms) < 2:
        return 0.0
    mean_rms = float(np.mean(rms))
    if mean_rms <= 0:
        return 0.0
    # Coefficient of variation (normalized std dev), clipped to [0, 1]
    cv = float(np.std(rms) / mean_rms)
    return float(np.clip(cv, 0.0, 1.0))


def _harmonic_peak_score(y: np.ndarray, sr: int, fundamental: float = 50.0, n_harmonics: int = 4) -> float:
    """Detect harmonic peaks at multiples of a fundamental frequency.

    Returns a score 0-1 indicating how prominent the harmonic series is.
    High score = generator-like tonal structure (50/100/150/200 Hz).
    """
    S = np.abs(librosa.stft(y, n_fft=4096, hop_length=512))
    mean_spec = np.mean(S, axis=1)
    freqs = librosa.fft_frequencies(sr=sr, n_fft=4096)

    if np.max(mean_spec) == 0 or len(freqs) < 2:
        return 0.0

    freq_res = float(freqs[1] - freqs[0])
    tolerance_bins = max(int(5.0 / freq_res), 1)  # +/- 5 Hz

    total_energy = float(np.sum(mean_spec ** 2))
    if total_energy <= 0:
        return 0.0

    harmonic_energy = 0.0
    for h in range(1, n_harmonics + 1):
        target_freq = fundamental * h
        center_bin = int(round(target_freq / freq_res))
        lo = max(0, center_bin - tolerance_bins)
        hi = min(len(mean_spec), center_bin + tolerance_bins + 1)
        harmonic_energy += float(np.sum(mean_spec[lo:hi] ** 2))

    # Ratio of harmonic energy to total energy
    ratio = harmonic_energy / total_energy
    # Scale: typical generator has 5-30% energy in harmonics
    return float(np.clip(ratio / 0.15, 0.0, 1.0))


# ---------------------------------------------------------------------------
# Main classifier
# ---------------------------------------------------------------------------

def classify_noise(y: np.ndarray, sr: int) -> dict[str, object]:
    if y.size == 0:
        return {
            "primary_type": "other",
            "confidence": 0.0,
            "noise_types": [],
            "dominant_frequency_hz": 0.0,
        }

    # ---- Sub-band energy densities (discriminative, non-overlapping) ------
    sub_bass_density = _band_energy_density(y, sr, 20, 80)
    bass_density = _band_energy_density(y, sr, 80, 200)
    low_mid_density = _band_energy_density(y, sr, 200, 500)
    mid_density = _band_energy_density(y, sr, 500, 2000)
    high_density = _band_energy_density(y, sr, 2000, min(sr / 2.0, 8000.0))

    total_density = sub_bass_density + bass_density + low_mid_density + mid_density + high_density
    if total_density <= 0:
        return {
            "primary_type": "other",
            "confidence": 0.0,
            "noise_types": [],
            "dominant_frequency_hz": 0.0,
        }

    # Normalize to ratios
    r_sub_bass = sub_bass_density / total_density
    r_bass = bass_density / total_density
    r_low_mid = low_mid_density / total_density
    r_mid = mid_density / total_density
    r_high = high_density / total_density

    # ---- Spectral shape features -----------------------------------------
    flatness = float(np.mean(librosa.feature.spectral_flatness(y=y)))
    modulation = _temporal_modulation(y, sr)

    # Key discriminator: bass-to-subbass energy density ratio.
    # Calibrated against 44 field recordings with known labels:
    #   airplane: 0.23-2.7 (lots of 80-200 Hz relative to sub-bass)
    #   car:      0.02-0.62 (wide range — overlaps both airplane and generator)
    #   generator: 0.05-0.13 (sub-bass dominant, little bass)
    bass_subbass_ratio = r_bass / max(r_sub_bass, 1e-6)

    # ---- Multi-feature scoring -------------------------------------------
    # Uses Gaussian-like likelihood functions centered on each class's
    # typical feature values, calibrated on the real dataset.
    scores: dict[str, float] = {}

    # Airplane: high b/sb ratio (centered ~0.5, spread 0.3)
    # Most distinctive: high bass/sub-bass ratio + low-mid presence
    airplane_bsb = np.exp(-0.5 * ((bass_subbass_ratio - 0.55) / 0.35) ** 2)
    scores["airplane"] = (
        airplane_bsb * 5.0            # Primary: high b/sb ratio
        + r_low_mid * 12.0            # 200-500 Hz tail (very rare in car/generator)
        + r_bass * 2.0                # Strong bass component
    )

    # Car: moderate b/sb ratio (wide range, centered ~0.1, high spread)
    # Cars are the "catch-all" low-frequency noise — scored as baseline
    car_bsb = np.exp(-0.5 * ((bass_subbass_ratio - 0.12) / 0.2) ** 2)
    scores["car"] = (
        car_bsb * 3.0                 # Moderate b/sb ratio
        + r_sub_bass * 1.5            # Sub-bass presence
        + modulation * 1.5            # Tends to be more variable
        + 0.8                         # Base score (cars are common default)
    )

    # Generator: very low b/sb ratio (centered ~0.07), often steady
    gen_bsb = np.exp(-0.5 * ((bass_subbass_ratio - 0.07) / 0.04) ** 2)
    gen_steady = np.exp(-0.5 * ((modulation - 0.5) / 0.25) ** 2)
    scores["generator"] = (
        gen_bsb * 5.0                 # Primary: very low b/sb ratio
        + gen_steady * 1.5            # Tends to be steadier
        + r_sub_bass * 1.0            # Sub-bass dominant
    )

    # Wind: broadband mid-high energy (very different from low-freq noise)
    scores["wind"] = (
        r_mid * 8.0                   # Primary: 500-2000 Hz
        + r_high * 4.0                # Also high frequency
        + flatness * 3.0              # Broadband noise
        + (1.0 - r_sub_bass) * 2.0    # Not much sub-bass
    )

    # Other: high frequency content
    scores["other"] = (
        r_high * 5.0                  # Primary: >2000 Hz
        + flatness * 2.0              # Broadband
        + r_mid * 1.5                 # Some mid
    )

    # ---- Normalize scores to confidence values ---------------------------
    total_score = sum(scores.values())
    if total_score <= 0:
        normalized = {name: 0.0 for name in scores}
    else:
        normalized = {name: value / total_score for name, value in scores.items()}

    ranked = sorted(normalized.items(), key=lambda item: item[1], reverse=True)
    primary_type, primary_confidence = ranked[0]

    # ---- Dominant frequency via mel spectrogram --------------------------
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


# ---------------------------------------------------------------------------
# Public helpers (unchanged API)
# ---------------------------------------------------------------------------

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


# ---------------------------------------------------------------------------
# Validation / labeling infrastructure (unchanged)
# ---------------------------------------------------------------------------

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
