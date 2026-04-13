"""Generate synthetic elephant call records for demonstration and research analytics.

Produces biologically plausible data that matches the CallDatabase._calls schema,
allowing the frontend research analytics page to render rich graphs with thousands
of data points.
"""

from __future__ import annotations

import uuid
from datetime import datetime, timedelta, timezone
from typing import Any

import numpy as np

# ── Call type distribution profiles ──────────────────────────────────────────
# Each profile defines (mean, std, min_clip, max_clip) for every acoustic feature.
# Values are based on published elephant bioacoustics literature.

CALL_TYPE_WEIGHTS = {
    "rumble": 0.40,
    "trumpet": 0.15,
    "roar": 0.10,
    "bark": 0.20,
    "cry": 0.15,
}

CALL_TYPE_COLORS = {
    "rumble": "#8B6914",
    "trumpet": "#C4A46C",
    "roar": "#B85C3A",
    "bark": "#6B7A3E",
    "cry": "#5B7B8A",
    "unknown": "#9A9590",
}

LOCATIONS = ["Amboseli", "Samburu", "Tarangire", "Kruger", "Gorongosa"]
LOCATION_WEIGHTS = [0.30, 0.20, 0.20, 0.15, 0.15]

# fmt: off
# Feature profiles per call type: {feature_key: (mean, std, min_clip, max_clip)}
FEATURE_PROFILES: dict[str, dict[str, tuple[float, float, float, float]]] = {
    "rumble": {
        # Core features
        "fundamental_frequency_hz": (18.0, 4.5, 8.0, 35.0),
        "harmonicity":              (0.75, 0.10, 0.3, 0.98),
        "harmonic_count":           (5.0, 1.5, 2.0, 10.0),
        "bandwidth_hz":             (120.0, 40.0, 30.0, 300.0),
        "spectral_centroid_hz":     (280.0, 90.0, 80.0, 600.0),
        "spectral_rolloff_hz":      (450.0, 150.0, 100.0, 1000.0),
        "zero_crossing_rate":       (0.012, 0.005, 0.001, 0.05),
        "snr_db":                   (22.0, 6.0, 5.0, 45.0),
        "duration_s":               (5.5, 2.2, 1.0, 15.0),
        "below_100hz":              (68.0, 10.0, 30.0, 95.0),
        "above_100hz":              (32.0, 10.0, 5.0, 70.0),
        "formant_count":            (3.0, 1.0, 1.0, 6.0),
        "pitch_contour_slope":      (-0.002, 0.01, -0.05, 0.05),
        "temporal_energy_variance":  (0.015, 0.008, 0.001, 0.06),
        "spectral_entropy":         (0.45, 0.12, 0.1, 0.9),
        # New spectral shape features
        "spectral_flatness":        (0.08, 0.04, 0.001, 0.3),
        "spectral_slope":           (-0.003, 0.001, -0.01, 0.0),
        "spectral_kurtosis":        (8.0, 3.0, 1.0, 20.0),
        "spectral_skewness":        (2.5, 1.0, 0.0, 6.0),
        "spectral_flux":            (0.02, 0.01, 0.001, 0.08),
        "spectral_crest":           (12.0, 4.0, 3.0, 30.0),
        # Voice quality
        "jitter":                   (0.015, 0.008, 0.001, 0.05),
        "shimmer":                  (0.08, 0.04, 0.01, 0.25),
        "hnr_db":                   (18.0, 5.0, 5.0, 35.0),
        # Temporal dynamics
        "attack_time_ms":           (350.0, 150.0, 50.0, 1200.0),
        "decay_time_ms":            (800.0, 300.0, 100.0, 2500.0),
        "temporal_centroid":        (0.48, 0.08, 0.2, 0.8),
        "onset_strength":           (0.6, 0.2, 0.1, 1.5),
        "rms_energy":               (0.04, 0.02, 0.005, 0.15),
        # Modulation
        "modulation_rate_hz":       (4.5, 1.5, 1.0, 10.0),
        "modulation_depth":         (0.35, 0.15, 0.05, 0.8),
        # Formant / F0
        "formant_dispersion_hz":    (120.0, 40.0, 30.0, 300.0),
        "f0_variability":           (3.0, 1.5, 0.5, 10.0),
        # Energy
        "peak_amplitude":           (0.35, 0.15, 0.05, 0.95),
        "crest_factor":             (5.5, 2.0, 2.0, 15.0),
        "energy_ratio_low":         (0.65, 0.10, 0.25, 0.92),
        "energy_ratio_mid":         (0.25, 0.08, 0.05, 0.50),
        "energy_ratio_high":        (0.10, 0.05, 0.01, 0.30),
        # Advanced
        "subharmonic_ratio":        (0.25, 0.10, 0.02, 0.60),
    },
    "trumpet": {
        "fundamental_frequency_hz": (450.0, 120.0, 200.0, 800.0),
        "harmonicity":              (0.55, 0.15, 0.15, 0.85),
        "harmonic_count":           (8.0, 2.5, 3.0, 15.0),
        "bandwidth_hz":             (3500.0, 1000.0, 1000.0, 6000.0),
        "spectral_centroid_hz":     (2200.0, 600.0, 800.0, 4000.0),
        "spectral_rolloff_hz":      (4500.0, 1200.0, 1500.0, 8000.0),
        "zero_crossing_rate":       (0.08, 0.03, 0.02, 0.20),
        "snr_db":                   (28.0, 8.0, 8.0, 50.0),
        "duration_s":               (1.8, 0.8, 0.3, 5.0),
        "below_100hz":              (8.0, 5.0, 1.0, 25.0),
        "above_100hz":              (92.0, 5.0, 75.0, 99.0),
        "formant_count":            (4.0, 1.5, 1.0, 8.0),
        "pitch_contour_slope":      (0.01, 0.02, -0.05, 0.08),
        "temporal_energy_variance":  (0.04, 0.02, 0.005, 0.12),
        "spectral_entropy":         (0.72, 0.10, 0.3, 0.95),
        "spectral_flatness":        (0.22, 0.08, 0.05, 0.5),
        "spectral_slope":           (-0.001, 0.0008, -0.005, 0.0),
        "spectral_kurtosis":        (4.0, 2.0, 1.0, 12.0),
        "spectral_skewness":        (1.2, 0.8, 0.0, 4.0),
        "spectral_flux":            (0.06, 0.03, 0.01, 0.2),
        "spectral_crest":           (6.0, 2.5, 2.0, 18.0),
        "jitter":                   (0.025, 0.012, 0.003, 0.08),
        "shimmer":                  (0.14, 0.06, 0.03, 0.35),
        "hnr_db":                   (12.0, 4.0, 3.0, 25.0),
        "attack_time_ms":           (80.0, 40.0, 10.0, 300.0),
        "decay_time_ms":            (400.0, 200.0, 50.0, 1200.0),
        "temporal_centroid":        (0.35, 0.10, 0.1, 0.7),
        "onset_strength":           (1.2, 0.4, 0.3, 2.5),
        "rms_energy":               (0.12, 0.05, 0.02, 0.35),
        "modulation_rate_hz":       (8.0, 3.0, 2.0, 18.0),
        "modulation_depth":         (0.50, 0.18, 0.1, 0.9),
        "formant_dispersion_hz":    (350.0, 100.0, 100.0, 700.0),
        "f0_variability":           (45.0, 20.0, 5.0, 120.0),
        "peak_amplitude":           (0.65, 0.18, 0.15, 0.99),
        "crest_factor":             (3.5, 1.2, 1.5, 8.0),
        "energy_ratio_low":         (0.08, 0.04, 0.01, 0.20),
        "energy_ratio_mid":         (0.42, 0.12, 0.15, 0.70),
        "energy_ratio_high":        (0.50, 0.12, 0.20, 0.80),
        "subharmonic_ratio":        (0.10, 0.06, 0.01, 0.30),
    },
    "roar": {
        "fundamental_frequency_hz": (95.0, 35.0, 40.0, 200.0),
        "harmonicity":              (0.25, 0.10, 0.05, 0.50),
        "harmonic_count":           (3.0, 1.5, 1.0, 8.0),
        "bandwidth_hz":             (4500.0, 1500.0, 1500.0, 8000.0),
        "spectral_centroid_hz":     (1800.0, 500.0, 600.0, 3500.0),
        "spectral_rolloff_hz":      (5000.0, 1500.0, 2000.0, 8000.0),
        "zero_crossing_rate":       (0.10, 0.04, 0.03, 0.25),
        "snr_db":                   (30.0, 7.0, 10.0, 50.0),
        "duration_s":               (2.5, 1.2, 0.5, 6.0),
        "below_100hz":              (22.0, 8.0, 5.0, 45.0),
        "above_100hz":              (78.0, 8.0, 55.0, 95.0),
        "formant_count":            (2.0, 1.0, 0.0, 5.0),
        "pitch_contour_slope":      (-0.008, 0.015, -0.05, 0.03),
        "temporal_energy_variance":  (0.06, 0.03, 0.01, 0.15),
        "spectral_entropy":         (0.82, 0.08, 0.5, 0.98),
        "spectral_flatness":        (0.35, 0.12, 0.08, 0.65),
        "spectral_slope":           (-0.0008, 0.0005, -0.004, 0.0),
        "spectral_kurtosis":        (2.5, 1.2, 1.0, 8.0),
        "spectral_skewness":        (0.6, 0.5, 0.0, 2.5),
        "spectral_flux":            (0.10, 0.04, 0.02, 0.25),
        "spectral_crest":           (3.5, 1.5, 1.5, 10.0),
        "jitter":                   (0.035, 0.015, 0.005, 0.10),
        "shimmer":                  (0.20, 0.08, 0.05, 0.45),
        "hnr_db":                   (6.0, 3.0, 1.0, 15.0),
        "attack_time_ms":           (60.0, 30.0, 10.0, 200.0),
        "decay_time_ms":            (600.0, 250.0, 80.0, 1500.0),
        "temporal_centroid":        (0.30, 0.10, 0.1, 0.6),
        "onset_strength":           (1.5, 0.5, 0.5, 3.0),
        "rms_energy":               (0.18, 0.07, 0.04, 0.45),
        "modulation_rate_hz":       (6.0, 2.5, 1.0, 14.0),
        "modulation_depth":         (0.55, 0.18, 0.15, 0.95),
        "formant_dispersion_hz":    (250.0, 80.0, 60.0, 500.0),
        "f0_variability":           (18.0, 8.0, 2.0, 50.0),
        "peak_amplitude":           (0.75, 0.15, 0.25, 0.99),
        "crest_factor":             (2.8, 1.0, 1.3, 6.0),
        "energy_ratio_low":         (0.18, 0.08, 0.03, 0.40),
        "energy_ratio_mid":         (0.40, 0.10, 0.15, 0.65),
        "energy_ratio_high":        (0.42, 0.10, 0.15, 0.65),
        "subharmonic_ratio":        (0.15, 0.08, 0.02, 0.40),
    },
    "bark": {
        "fundamental_frequency_hz": (90.0, 30.0, 40.0, 180.0),
        "harmonicity":              (0.45, 0.12, 0.15, 0.70),
        "harmonic_count":           (4.0, 1.5, 1.0, 8.0),
        "bandwidth_hz":             (1200.0, 400.0, 300.0, 2500.0),
        "spectral_centroid_hz":     (900.0, 300.0, 250.0, 2000.0),
        "spectral_rolloff_hz":      (2000.0, 600.0, 600.0, 4000.0),
        "zero_crossing_rate":       (0.04, 0.02, 0.01, 0.10),
        "snr_db":                   (20.0, 6.0, 6.0, 40.0),
        "duration_s":               (0.25, 0.12, 0.05, 0.7),
        "below_100hz":              (28.0, 10.0, 5.0, 55.0),
        "above_100hz":              (72.0, 10.0, 45.0, 95.0),
        "formant_count":            (3.0, 1.0, 1.0, 6.0),
        "pitch_contour_slope":      (0.005, 0.015, -0.03, 0.05),
        "temporal_energy_variance":  (0.05, 0.025, 0.005, 0.12),
        "spectral_entropy":         (0.60, 0.12, 0.25, 0.90),
        "spectral_flatness":        (0.15, 0.06, 0.03, 0.35),
        "spectral_slope":           (-0.002, 0.001, -0.006, 0.0),
        "spectral_kurtosis":        (5.5, 2.5, 1.0, 15.0),
        "spectral_skewness":        (1.8, 0.8, 0.0, 4.5),
        "spectral_flux":            (0.08, 0.03, 0.01, 0.18),
        "spectral_crest":           (7.5, 3.0, 2.0, 18.0),
        "jitter":                   (0.022, 0.010, 0.003, 0.06),
        "shimmer":                  (0.12, 0.05, 0.02, 0.30),
        "hnr_db":                   (12.0, 4.0, 3.0, 24.0),
        "attack_time_ms":           (25.0, 15.0, 5.0, 80.0),
        "decay_time_ms":            (120.0, 60.0, 20.0, 350.0),
        "temporal_centroid":        (0.38, 0.10, 0.15, 0.65),
        "onset_strength":           (1.8, 0.5, 0.5, 3.5),
        "rms_energy":               (0.10, 0.04, 0.02, 0.28),
        "modulation_rate_hz":       (12.0, 4.0, 3.0, 25.0),
        "modulation_depth":         (0.40, 0.15, 0.08, 0.80),
        "formant_dispersion_hz":    (200.0, 70.0, 50.0, 450.0),
        "f0_variability":           (12.0, 6.0, 2.0, 35.0),
        "peak_amplitude":           (0.55, 0.18, 0.10, 0.95),
        "crest_factor":             (4.0, 1.5, 1.8, 10.0),
        "energy_ratio_low":         (0.25, 0.10, 0.05, 0.50),
        "energy_ratio_mid":         (0.45, 0.10, 0.20, 0.70),
        "energy_ratio_high":        (0.30, 0.10, 0.08, 0.55),
        "subharmonic_ratio":        (0.18, 0.08, 0.02, 0.45),
    },
    "cry": {
        "fundamental_frequency_hz": (300.0, 80.0, 150.0, 500.0),
        "harmonicity":              (0.50, 0.12, 0.20, 0.75),
        "harmonic_count":           (6.0, 2.0, 2.0, 12.0),
        "bandwidth_hz":             (2000.0, 700.0, 500.0, 4000.0),
        "spectral_centroid_hz":     (1500.0, 450.0, 500.0, 3000.0),
        "spectral_rolloff_hz":      (3200.0, 900.0, 1000.0, 6000.0),
        "zero_crossing_rate":       (0.06, 0.025, 0.015, 0.15),
        "snr_db":                   (18.0, 6.0, 4.0, 38.0),
        "duration_s":               (1.2, 0.6, 0.3, 3.5),
        "below_100hz":              (12.0, 6.0, 2.0, 30.0),
        "above_100hz":              (88.0, 6.0, 70.0, 98.0),
        "formant_count":            (4.0, 1.5, 1.0, 8.0),
        "pitch_contour_slope":      (0.015, 0.02, -0.03, 0.06),
        "temporal_energy_variance":  (0.035, 0.018, 0.005, 0.10),
        "spectral_entropy":         (0.65, 0.12, 0.3, 0.92),
        "spectral_flatness":        (0.18, 0.07, 0.04, 0.40),
        "spectral_slope":           (-0.0015, 0.0008, -0.005, 0.0),
        "spectral_kurtosis":        (5.0, 2.0, 1.0, 12.0),
        "spectral_skewness":        (1.5, 0.8, 0.0, 4.0),
        "spectral_flux":            (0.05, 0.025, 0.008, 0.15),
        "spectral_crest":           (7.0, 2.5, 2.0, 16.0),
        "jitter":                   (0.030, 0.012, 0.005, 0.08),
        "shimmer":                  (0.16, 0.06, 0.03, 0.35),
        "hnr_db":                   (10.0, 4.0, 2.0, 22.0),
        "attack_time_ms":           (120.0, 60.0, 20.0, 400.0),
        "decay_time_ms":            (500.0, 200.0, 60.0, 1200.0),
        "temporal_centroid":        (0.42, 0.10, 0.15, 0.75),
        "onset_strength":           (0.9, 0.3, 0.2, 2.0),
        "rms_energy":               (0.07, 0.03, 0.01, 0.20),
        "modulation_rate_hz":       (6.0, 2.5, 1.5, 14.0),
        "modulation_depth":         (0.45, 0.15, 0.10, 0.85),
        "formant_dispersion_hz":    (280.0, 90.0, 70.0, 550.0),
        "f0_variability":           (25.0, 12.0, 3.0, 70.0),
        "peak_amplitude":           (0.45, 0.18, 0.08, 0.90),
        "crest_factor":             (4.5, 1.8, 1.5, 12.0),
        "energy_ratio_low":         (0.12, 0.06, 0.02, 0.30),
        "energy_ratio_mid":         (0.48, 0.12, 0.18, 0.75),
        "energy_ratio_high":        (0.40, 0.12, 0.10, 0.65),
        "subharmonic_ratio":        (0.12, 0.06, 0.01, 0.35),
    },
}
# fmt: on

# Per-elephant consistent offsets for individual voice signatures
_ELEPHANT_IDS = [f"ELE-{i:03d}" for i in range(1, 16)]

# Spectral contrast has 7 bands — define per call type
_SPECTRAL_CONTRAST_PROFILES: dict[str, tuple[float, float]] = {
    "rumble":  (8.0, 3.0),
    "trumpet": (15.0, 5.0),
    "roar":    (18.0, 6.0),
    "bark":    (12.0, 4.0),
    "cry":     (13.0, 4.5),
}

# Call type hierarchy level1 mapping
_LEVEL1_MAP = {
    "rumble": "low-frequency",
    "trumpet": "high-frequency",
    "roar": "broadband",
    "bark": "broadband",
    "cry": "high-frequency",
}


def _sample_feature(
    rng: np.random.Generator,
    mean: float,
    std: float,
    min_clip: float,
    max_clip: float,
) -> float:
    """Sample a single feature value from a clipped normal distribution."""
    return float(np.clip(rng.normal(mean, std), min_clip, max_clip))


def _generate_mfccs(
    rng: np.random.Generator,
    call_type: str,
) -> tuple[list[float], list[float], list[float]]:
    """Generate realistic MFCC, delta, and delta-delta coefficients."""
    # MFCC ranges vary by call type — rumbles have more negative c0
    base_offset = -350.0 if call_type == "rumble" else -200.0
    mfcc = [float(rng.normal(base_offset if i == 0 else rng.uniform(-20, 40), 30.0)) for i in range(13)]
    mfcc_delta = [float(rng.normal(0.0, 5.0)) for _ in range(13)]
    mfcc_delta2 = [float(rng.normal(0.0, 3.0)) for _ in range(13)]
    return mfcc, mfcc_delta, mfcc_delta2


def _generate_datetime(
    rng: np.random.Generator,
    start_date: datetime,
    end_date: datetime,
) -> datetime:
    """Generate a datetime with dawn/dusk bias (5-7 AM and 5-7 PM peaks)."""
    # Random date in range
    days_range = (end_date - start_date).days
    day_offset = int(rng.integers(0, max(days_range, 1)))
    date = start_date + timedelta(days=day_offset)

    # Bimodal hour distribution: dawn (5-7) and dusk (17-19) peaks
    if rng.random() < 0.6:
        # 60% chance of dawn/dusk hours
        if rng.random() < 0.5:
            hour = int(rng.normal(6.0, 1.0))  # dawn peak
        else:
            hour = int(rng.normal(18.0, 1.0))  # dusk peak
        hour = max(0, min(23, hour))
    else:
        # 40% uniform across all hours
        hour = int(rng.integers(0, 24))

    minute = int(rng.integers(0, 60))
    second = int(rng.integers(0, 60))
    return date.replace(hour=hour, minute=minute, second=second, tzinfo=timezone.utc)


def generate_simulated_data(
    n_calls: int = 3000,
    seed: int = 42,
) -> list[dict[str, Any]]:
    """Generate *n_calls* synthetic elephant call records.

    Returns a list of dicts matching the CallDatabase._calls schema exactly,
    ready to inject into ``call_database._calls``.
    """
    rng = np.random.default_rng(seed)

    # Pre-generate per-elephant acoustic offsets for individual signatures
    elephant_offsets: dict[str, dict[str, float]] = {}
    for eid in _ELEPHANT_IDS:
        elephant_offsets[eid] = {
            "fundamental_frequency_hz": float(rng.normal(0, 3.0)),
            "harmonicity": float(rng.normal(0, 0.03)),
            "spectral_centroid_hz": float(rng.normal(0, 50.0)),
            "bandwidth_hz": float(rng.normal(0, 20.0)),
            "hnr_db": float(rng.normal(0, 1.5)),
            "rms_energy": float(rng.normal(0, 0.008)),
        }

    # Pre-generate recording IDs (pool of ~60 synthetic recordings)
    n_recordings = 60
    recording_ids = [str(uuid.UUID(bytes=rng.bytes(16))) for _ in range(n_recordings)]

    # Date range: 2024-01-01 to 2025-12-31
    start_date = datetime(2024, 1, 1, tzinfo=timezone.utc)
    end_date = datetime(2025, 12, 31, tzinfo=timezone.utc)

    # Call type choices
    types = list(CALL_TYPE_WEIGHTS.keys())
    weights = np.array(list(CALL_TYPE_WEIGHTS.values()))
    weights = weights / weights.sum()

    calls: list[dict[str, Any]] = []

    for i in range(n_calls):
        call_id = str(uuid.UUID(bytes=rng.bytes(16)))
        call_type = str(rng.choice(types, p=weights))
        profile = FEATURE_PROFILES[call_type]
        animal_id = str(rng.choice(_ELEPHANT_IDS))
        location = str(rng.choice(LOCATIONS, p=LOCATION_WEIGHTS))
        recording_id = str(rng.choice(recording_ids))
        dt = _generate_datetime(rng, start_date, end_date)

        # Sample all acoustic features
        features: dict[str, Any] = {}
        for key, (mean, std, mn, mx) in profile.items():
            val = _sample_feature(rng, mean, std, mn, mx)
            # Apply individual elephant offset if available
            offset = elephant_offsets.get(animal_id, {}).get(key, 0.0)
            val = float(np.clip(val + offset, mn, mx))
            features[key] = round(val, 6)

        # Spectral contrast (7 bands)
        sc_mean, sc_std = _SPECTRAL_CONTRAST_PROFILES[call_type]
        features["spectral_contrast"] = [
            round(float(np.clip(rng.normal(sc_mean * (1 - 0.08 * b), sc_std), 1.0, 40.0)), 3)
            for b in range(7)
        ]

        # Chroma energy (12 pitch classes)
        chroma_raw = rng.dirichlet(np.ones(12) * 2.0)
        features["chroma_energy"] = [round(float(v), 6) for v in chroma_raw]

        # MFCCs
        mfcc, mfcc_delta, mfcc_delta2 = _generate_mfccs(rng, call_type)
        features["mfcc"] = mfcc
        features["mfcc_delta"] = mfcc_delta
        features["mfcc_delta2"] = mfcc_delta2

        # Formant peaks (up to 5)
        f0 = features["fundamental_frequency_hz"]
        n_formants = int(features.get("formant_count", 3))
        features["formant_peaks_hz"] = [
            round(float(f0 * (k + 1) + rng.normal(0, 15)), 1)
            for k in range(max(1, n_formants))
        ][:5]

        # Energy distribution sub-dict (legacy format)
        features["energy_distribution"] = {
            "below_100hz": features["below_100hz"],
            "above_100hz": features["above_100hz"],
        }

        # Derived fields
        duration_s = features["duration_s"]
        start_ms = round(float(rng.uniform(0, 30000)), 1)
        duration_ms = round(duration_s * 1000.0, 1)
        confidence = round(float(rng.uniform(0.50, 0.95)), 3)
        bandwidth = features["bandwidth_hz"]
        freq_min = max(8.0, round(f0 - bandwidth / 2, 1))
        freq_max = round(f0 + bandwidth / 2, 1)

        # Fingerprint stub (80-dim normalized vector)
        fp_raw = rng.standard_normal(80)
        fp_norm = fp_raw / (np.linalg.norm(fp_raw) + 1e-9)
        fingerprint = [round(float(v), 6) for v in fp_norm]

        level1 = _LEVEL1_MAP.get(call_type, "unknown")
        hierarchy = {
            "level1": level1,
            "level2": call_type,
            "level1_confidence": round(float(rng.uniform(0.6, 0.95)), 3),
            "level2_confidence": confidence,
        }

        confidence_tier = "high" if confidence >= 0.8 else ("normal" if confidence >= 0.6 else "minimum")

        call_record: dict[str, Any] = {
            "id": call_id,
            "recording_id": recording_id,
            "animal_id": animal_id,
            "location": location,
            "date": dt.strftime("%Y-%m-%d"),
            "start_ms": start_ms,
            "duration_ms": duration_ms,
            "frequency_min_hz": freq_min,
            "frequency_max_hz": freq_max,
            "call_type": call_type,
            "confidence": confidence,
            "confidence_tier": confidence_tier,
            "detector_backend": "simulated",
            "classifier_backend": "simulated",
            "model_version": "sim-v1",
            "anomaly_score": round(float(rng.uniform(0.0, 0.3)), 3),
            "prediction_uncertainty": round(float(rng.uniform(0.05, 0.4)), 3),
            "call_type_hierarchy": hierarchy,
            "classifier_probs": None,
            "review_label": None,
            "review_status": "confirmed" if confidence >= 0.6 else "pending",
            "original_call_type": call_type,
            "corrected_call_type": None,
            "reviewed_by": None,
            "reviewed_at": None,
            "individual_id": animal_id,
            "cluster_id": f"cluster-{call_type}-{hash(animal_id) % 5}",
            "fingerprint": fingerprint,
            "fingerprint_version": "v1",
            "sequence_id": f"sim-seq-{recording_id[:8]}-{i % 8}",
            "sequence_position": i % 8,
            "color": CALL_TYPE_COLORS.get(call_type, "#9A9590"),
            "annotations": [],
            "acoustic_features": features,
            "metadata": {
                "filename": f"sim_{recording_id[:8]}.wav",
                "location": location,
                "date": dt.strftime("%Y-%m-%d"),
                "recorded_at": dt.isoformat(),
                "animal_id": animal_id,
                "species": "Loxodonta africana",
                "noise_type_ref": str(rng.choice(["wind", "vehicle", "airplane", "generator", "rain"])),
                "start_sec": round(start_ms / 1000.0, 3),
                "end_sec": round((start_ms + duration_ms) / 1000.0, 3),
            },
        }
        calls.append(call_record)

    return calls
