# tests/test_feature_engineer.py
from __future__ import annotations

import numpy as np
import pytest


def _make_synthetic_call(duration_s: float = 1.0, sr: int = 22050, freq: float = 50.0) -> tuple[np.ndarray, int]:
    """Generate a synthetic elephant-like call: sine wave with attack/sustain/release envelope."""
    t = np.linspace(0, duration_s, int(sr * duration_s), endpoint=False)
    sine = np.sin(2 * np.pi * freq * t)
    envelope = np.ones_like(t)
    attack_end = int(len(t) * 0.2)
    release_start = int(len(t) * 0.7)
    envelope[:attack_end] = np.linspace(0, 1, attack_end)
    envelope[release_start:] = np.linspace(1, 0, len(t) - release_start)
    return (sine * envelope).astype(np.float32), sr


def test_compute_extended_features_returns_all_new_keys():
    from echofield.ml.feature_engineer import compute_extended_features
    y, sr = _make_synthetic_call()
    base_features = {"fundamental_frequency_hz": 50.0, "snr_db": 10.0}
    result = compute_extended_features(y, sr, base_features)
    expected_keys = [
        "attack_time_s", "sustain_ratio", "release_time_s",
        "amplitude_modulation_depth", "frequency_modulation_rate_hz",
        "spectral_skewness", "spectral_kurtosis", "spectral_flatness",
        "spectral_flux_mean", "sub_harmonic_ratio", "below_20hz_energy_ratio",
    ]
    for key in expected_keys:
        assert key in result, f"Missing key: {key}"


def test_compute_extended_features_preserves_base_features():
    from echofield.ml.feature_engineer import compute_extended_features
    y, sr = _make_synthetic_call()
    base_features = {"fundamental_frequency_hz": 50.0, "snr_db": 10.0}
    result = compute_extended_features(y, sr, base_features)
    assert result["fundamental_frequency_hz"] == 50.0
    assert result["snr_db"] == 10.0


def test_attack_time_is_positive_for_ramped_signal():
    from echofield.ml.feature_engineer import compute_extended_features
    y, sr = _make_synthetic_call()
    result = compute_extended_features(y, sr, {})
    assert result["attack_time_s"] > 0.0
    assert result["attack_time_s"] < 1.0


def test_sustain_ratio_between_zero_and_one():
    from echofield.ml.feature_engineer import compute_extended_features
    y, sr = _make_synthetic_call()
    result = compute_extended_features(y, sr, {})
    assert 0.0 <= result["sustain_ratio"] <= 1.0


def test_spectral_flatness_near_zero_for_pure_tone():
    from echofield.ml.feature_engineer import compute_extended_features
    sr = 22050
    t = np.linspace(0, 1.0, sr, endpoint=False)
    pure_tone = np.sin(2 * np.pi * 440 * t).astype(np.float32)
    result = compute_extended_features(pure_tone, sr, {})
    assert result["spectral_flatness"] < 0.1


def test_spectral_flatness_higher_for_noise():
    from echofield.ml.feature_engineer import compute_extended_features
    sr = 22050
    rng = np.random.default_rng(42)
    noise = rng.standard_normal(sr).astype(np.float32)
    result = compute_extended_features(noise, sr, {})
    assert result["spectral_flatness"] > 0.5


def test_compute_inter_call_features_adds_ici_fields():
    from echofield.ml.feature_engineer import compute_inter_call_features
    calls = [
        {"id": "c1", "start_ms": 0, "duration_ms": 500, "acoustic_features": {}},
        {"id": "c2", "start_ms": 2000, "duration_ms": 300, "acoustic_features": {}},
        {"id": "c3", "start_ms": 5000, "duration_ms": 400, "acoustic_features": {}},
    ]
    result = compute_inter_call_features(calls)
    assert result[0]["acoustic_features"]["ici_before_ms"] is None
    assert result[0]["acoustic_features"]["ici_after_ms"] == pytest.approx(1500.0, abs=1)
    assert result[1]["acoustic_features"]["ici_before_ms"] == pytest.approx(1500.0, abs=1)
    assert result[1]["acoustic_features"]["ici_after_ms"] == pytest.approx(2700.0, abs=1)
    assert result[2]["acoustic_features"]["ici_before_ms"] == pytest.approx(2700.0, abs=1)
    assert result[2]["acoustic_features"]["ici_after_ms"] is None


def test_compute_inter_call_features_adds_sequence_fields():
    from echofield.ml.feature_engineer import compute_inter_call_features
    calls = [
        {"id": "c1", "start_ms": 0, "duration_ms": 500, "acoustic_features": {}},
        {"id": "c2", "start_ms": 2000, "duration_ms": 300, "acoustic_features": {}},
    ]
    result = compute_inter_call_features(calls)
    assert result[0]["acoustic_features"]["sequence_length"] == 2
    assert result[0]["acoustic_features"]["sequence_position_ratio"] == pytest.approx(0.0)
    assert result[1]["acoustic_features"]["sequence_position_ratio"] == pytest.approx(1.0)


def test_compute_extended_features_handles_empty_audio():
    from echofield.ml.feature_engineer import compute_extended_features
    y = np.array([], dtype=np.float32)
    result = compute_extended_features(y, 22050, {})
    assert result["attack_time_s"] == 0.0
    assert result["spectral_flatness"] == 0.0
