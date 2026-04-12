"""Cross-species acoustic comparison engine."""
from __future__ import annotations

import logging
from typing import Any

import numpy as np
import librosa

from echofield.pipeline.feature_extract import extract_acoustic_features

logger = logging.getLogger(__name__)

# Reference species database — using synthetic approximations
# These generate characteristic waveforms at known frequency ranges
REFERENCE_SPECIES = {
    "blue_whale": {
        "species": "Blue whale (Balaenoptera musculus)",
        "call_type": "D-call",
        "description": "Infrasonic pulse at 10-40Hz — used for long-distance ocean communication across hundreds of kilometers",
        "frequency_range_hz": [10, 40],
        "f0_hz": 18,
        "duration_s": 3.0,
        "harmonicity": 0.6,
        "bandwidth_hz": 30,
    },
    "humpback_whale": {
        "species": "Humpback whale (Megaptera novaeangliae)",
        "call_type": "Song unit",
        "description": "Complex tonal vocalization with frequency sweeps — part of elaborate songs lasting up to 30 minutes",
        "frequency_range_hz": [80, 4000],
        "f0_hz": 200,
        "duration_s": 2.0,
        "harmonicity": 0.75,
        "bandwidth_hz": 3000,
    },
    "lion_roar": {
        "species": "African lion (Panthera leo)",
        "call_type": "Roar",
        "description": "Low-frequency territorial call — shares savanna habitat with elephants, audible up to 8km",
        "frequency_range_hz": [40, 200],
        "f0_hz": 80,
        "duration_s": 4.0,
        "harmonicity": 0.35,
        "bandwidth_hz": 800,
    },
    "human_speech": {
        "species": "Human (Homo sapiens)",
        "call_type": "Voiced speech",
        "description": "Voiced speech segment — formant and harmonic comparison with elephant vocalizations",
        "frequency_range_hz": [85, 300],
        "f0_hz": 120,
        "duration_s": 2.0,
        "harmonicity": 0.7,
        "bandwidth_hz": 3000,
    },
}


def _generate_synthetic_call(spec: dict[str, Any], sr: int = 22050) -> np.ndarray:
    """Generate a synthetic approximation of a species' characteristic call."""
    f0 = spec["f0_hz"]
    duration = spec["duration_s"]
    harmonicity = spec.get("harmonicity", 0.5)
    n_samples = int(sr * duration)
    t = np.linspace(0, duration, n_samples, endpoint=False)

    # Fundamental
    signal = np.sin(2 * np.pi * f0 * t)

    # Add harmonics based on harmonicity
    n_harmonics = int(harmonicity * 8) + 1
    for h in range(2, n_harmonics + 1):
        amplitude = harmonicity / h
        signal += amplitude * np.sin(2 * np.pi * f0 * h * t)

    # Apply amplitude envelope (fade in/out)
    envelope = np.ones(n_samples)
    fade_len = int(sr * 0.1)
    if fade_len > 0 and fade_len * 2 < n_samples:
        envelope[:fade_len] = np.linspace(0, 1, fade_len)
        envelope[-fade_len:] = np.linspace(1, 0, fade_len)

    signal *= envelope

    # Normalize
    max_val = np.max(np.abs(signal))
    if max_val > 0:
        signal = signal / max_val * 0.8

    return signal.astype(np.float32)


def get_reference_audio(reference_id: str, sr: int = 22050) -> tuple[np.ndarray, int]:
    """Get audio for a reference species (synthetic)."""
    spec = REFERENCE_SPECIES.get(reference_id)
    if not spec:
        raise ValueError(f"Unknown reference species: {reference_id}")
    return _generate_synthetic_call(spec, sr), sr


def compare_calls(
    elephant_audio: np.ndarray,
    elephant_sr: int,
    reference_id: str,
) -> dict[str, Any]:
    """Compare an elephant call against a reference species."""
    spec = REFERENCE_SPECIES.get(reference_id)
    if not spec:
        raise ValueError(f"Unknown reference species: {reference_id}")

    ref_audio, ref_sr = get_reference_audio(reference_id, elephant_sr)

    # Extract features from both
    elephant_features = extract_acoustic_features(elephant_audio, elephant_sr)
    reference_features = extract_acoustic_features(ref_audio, ref_sr)

    # Compute frequency overlap
    e_f0 = elephant_features.get("fundamental_frequency_hz", 0)
    e_bw = elephant_features.get("bandwidth_hz", 0)
    e_low = max(e_f0 - e_bw / 2, 0)
    e_high = e_f0 + e_bw / 2

    r_low, r_high = spec["frequency_range_hz"]

    overlap_low = max(e_low, r_low)
    overlap_high = min(e_high, r_high)
    overlap_range = max(0, overlap_high - overlap_low)
    total_range = max(e_high - e_low, r_high - r_low, 1)
    frequency_overlap_pct = round((overlap_range / total_range) * 100, 1)

    # Spectral similarity via mean spectral envelopes
    e_S = np.abs(librosa.stft(elephant_audio, n_fft=2048))
    r_S = np.abs(librosa.stft(ref_audio, n_fft=2048))

    e_envelope = np.mean(e_S, axis=1)
    r_envelope = np.mean(r_S, axis=1)

    min_len = min(len(e_envelope), len(r_envelope))
    e_env = e_envelope[:min_len]
    r_env = r_envelope[:min_len]

    # Cosine similarity
    denom = np.linalg.norm(e_env) * np.linalg.norm(r_env)
    spectral_similarity = float(np.dot(e_env, r_env) / denom) if denom > 0 else 0.0
    spectral_similarity = round(max(0, spectral_similarity), 3)

    # Harmonic similarity
    e_harm = elephant_features.get("harmonicity", 0)
    r_harm = reference_features.get("harmonicity", 0)
    harmonic_similarity = round(1.0 - abs(e_harm - r_harm), 3)

    # Temporal similarity (amplitude envelope correlation)
    e_rms = librosa.feature.rms(y=elephant_audio)[0]
    r_rms = librosa.feature.rms(y=ref_audio)[0]
    min_rms_len = min(len(e_rms), len(r_rms))
    if min_rms_len > 1:
        e_rms_r = np.interp(np.linspace(0, 1, 100), np.linspace(0, 1, len(e_rms)), e_rms)
        r_rms_r = np.interp(np.linspace(0, 1, 100), np.linspace(0, 1, len(r_rms)), r_rms)
        corr = np.corrcoef(e_rms_r, r_rms_r)[0, 1]
        temporal_similarity = round(max(0, float(corr) if np.isfinite(corr) else 0), 3)
    else:
        temporal_similarity = 0.0

    # Generate insight
    insight = _generate_insight(
        spec, frequency_overlap_pct, spectral_similarity,
        harmonic_similarity, e_f0
    )

    # Feature comparison
    feature_comparison = {}
    for key in ["fundamental_frequency_hz", "harmonicity", "bandwidth_hz",
                "spectral_centroid_hz", "duration_s", "snr_db"]:
        e_val = float(elephant_features.get(key, 0))
        r_val = float(reference_features.get(key, 0))
        diff_pct = round(abs(e_val - r_val) / max(abs(r_val), 0.01) * 100, 1)
        feature_comparison[key] = {
            "elephant": round(e_val, 2),
            "reference": round(r_val, 2),
            "difference_pct": diff_pct,
        }

    return {
        "reference": {
            "id": reference_id,
            "species": spec["species"],
            "call_type": spec["call_type"],
            "description": spec["description"],
        },
        "comparison": {
            "frequency_overlap_pct": frequency_overlap_pct,
            "spectral_similarity": spectral_similarity,
            "harmonic_similarity": harmonic_similarity,
            "temporal_similarity": temporal_similarity,
            "shared_frequency_range_hz": [round(overlap_low, 1), round(overlap_high, 1)] if overlap_range > 0 else None,
            "insight": insight,
        },
        "feature_comparison": feature_comparison,
    }


def _generate_insight(
    spec: dict[str, Any],
    freq_overlap: float,
    spectral_sim: float,
    harmonic_sim: float,
    elephant_f0: float,
) -> str:
    parts = []
    species_short = spec["species"].split("(")[0].strip()

    if freq_overlap > 60:
        parts.append(
            f"Remarkable frequency overlap ({freq_overlap:.0f}%) between elephant and {species_short} vocalizations — "
            f"both species communicate in similar frequency bands, suggesting convergent acoustic strategies."
        )
    elif freq_overlap > 30:
        parts.append(
            f"Moderate frequency overlap ({freq_overlap:.0f}%) — "
            f"some shared acoustic space between these species."
        )
    else:
        parts.append(
            f"Limited frequency overlap ({freq_overlap:.0f}%) — "
            f"these species occupy different acoustic niches."
        )

    if harmonic_sim > 0.8:
        parts.append(
            "Strikingly similar harmonic structure — both vocalizations rely on rich overtone series."
        )
    elif harmonic_sim < 0.4:
        parts.append(
            "Different harmonic profiles — one vocalization is more tonal while the other is more broadband."
        )

    if elephant_f0 < 25 and spec["f0_hz"] < 50:
        parts.append(
            "Both species use infrasound for long-distance communication — "
            "a convergent evolution across very different environments."
        )

    return " ".join(parts)
