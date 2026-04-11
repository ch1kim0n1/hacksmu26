"""Tests for ensemble scoring (#75) and call detector (#77)."""

from __future__ import annotations

import numpy as np
import pytest

from echofield.pipeline.ensemble import score_candidate, run_ensemble, CandidateResult
from echofield.pipeline.call_detector import (
    CallDetector,
    CONFIDENCE_MINIMUM,
    CONFIDENCE_HIGH,
    CONFIDENCE_PUBLISHABLE,
)


# ---------------------------------------------------------------------------
# Fixtures
# ---------------------------------------------------------------------------

SR = 22_050  # use a lower SR to keep tests fast


def _sine(freq_hz: float, duration_s: float, sr: int = SR) -> np.ndarray:
    t = np.linspace(0, duration_s, int(duration_s * sr), endpoint=False)
    return (0.3 * np.sin(2 * np.pi * freq_hz * t)).astype(np.float32)


def _noise(duration_s: float, amplitude: float = 0.05, sr: int = SR) -> np.ndarray:
    rng = np.random.default_rng(42)
    return (rng.standard_normal(int(duration_s * sr)) * amplitude).astype(np.float32)


@pytest.fixture
def clean_signal() -> np.ndarray:
    """Clean 18 Hz sine (elephant-range fundamental)."""
    return _sine(18.0, 2.0)


@pytest.fixture
def noisy_signal(clean_signal: np.ndarray) -> np.ndarray:
    return (clean_signal + _noise(len(clean_signal) / SR)).astype(np.float32)


# ---------------------------------------------------------------------------
# ensemble.score_candidate
# ---------------------------------------------------------------------------

class TestScoreCandidate:
    def test_returns_expected_keys(self, clean_signal: np.ndarray) -> None:
        scores = score_candidate(clean_signal, clean_signal, SR)
        expected = {
            "snr_before_db", "snr_after_db", "snr_improvement_db",
            "energy_preservation", "spectral_distortion",
            "harmonic_preservation", "artifact_level", "composite",
        }
        assert set(scores.keys()) == expected

    def test_composite_in_range(self, clean_signal: np.ndarray, noisy_signal: np.ndarray) -> None:
        scores = score_candidate(noisy_signal, clean_signal, SR)
        assert 0.0 <= scores["composite"] <= 100.0

    def test_identical_signal_high_preservation(self, clean_signal: np.ndarray) -> None:
        scores = score_candidate(clean_signal, clean_signal, SR)
        assert scores["energy_preservation"] == pytest.approx(1.0, abs=0.01)
        assert scores["spectral_distortion"] == pytest.approx(0.0, abs=0.05)

    def test_zero_length_does_not_raise(self) -> None:
        y = np.zeros(0, dtype=np.float32)
        # Should not raise even with empty arrays
        scores = score_candidate(y, y, SR)
        assert "composite" in scores


# ---------------------------------------------------------------------------
# ensemble.run_ensemble
# ---------------------------------------------------------------------------

class TestRunEnsemble:
    def test_returns_expected_keys(self, noisy_signal: np.ndarray) -> None:
        result = run_ensemble(noisy_signal, SR)
        assert "audio" in result
        assert "method" in result
        assert "composite_score" in result
        assert "confidence" in result
        assert "per_method_scores" in result
        assert "candidates_evaluated" in result

    def test_output_same_length(self, noisy_signal: np.ndarray) -> None:
        result = run_ensemble(noisy_signal, SR)
        assert len(result["audio"]) == len(noisy_signal)

    def test_method_is_known(self, noisy_signal: np.ndarray) -> None:
        result = run_ensemble(noisy_signal, SR)
        known = {"spectral", "unet", "demucs", "passthrough"}
        assert result["method"] in known

    def test_at_least_one_candidate_evaluated(self, noisy_signal: np.ndarray) -> None:
        result = run_ensemble(noisy_signal, SR)
        assert result["candidates_evaluated"] >= 1

    def test_confidence_in_range(self, noisy_signal: np.ndarray) -> None:
        result = run_ensemble(noisy_signal, SR)
        assert 0.0 <= result["confidence"] <= 1.0

    def test_empty_signal_does_not_raise(self) -> None:
        y = np.zeros(0, dtype=np.float32)
        result = run_ensemble(y, SR)
        assert "method" in result

    def test_spectral_always_available(self, noisy_signal: np.ndarray) -> None:
        # Spectral gating needs no optional deps, should always be a candidate
        result = run_ensemble(noisy_signal, SR)
        assert result["candidates_evaluated"] >= 1
        # "spectral" must appear in per_method_scores unless a higher-scoring
        # model was the only candidate generated
        if result["candidates_evaluated"] == 1:
            assert "spectral" in result["per_method_scores"]


# ---------------------------------------------------------------------------
# call_detector.CallDetector
# ---------------------------------------------------------------------------

class TestCallDetector:
    def test_detect_returns_list(self, clean_signal: np.ndarray) -> None:
        detector = CallDetector()  # no model paths → heuristic fallback
        calls = detector.detect("rec-001", clean_signal, SR)
        assert isinstance(calls, list)

    def test_each_call_has_required_keys(self, clean_signal: np.ndarray) -> None:
        detector = CallDetector()
        calls = detector.detect("rec-001", clean_signal, SR)
        required = {
            "id", "recording_id", "start_ms", "duration_ms",
            "call_type", "confidence", "confidence_tier",
            "detector_backend", "classifier_backend",
        }
        for call in calls:
            assert required.issubset(call.keys()), f"missing keys in {call}"

    def test_empty_signal_returns_empty(self) -> None:
        detector = CallDetector()
        calls = detector.detect("rec-000", np.zeros(0, dtype=np.float32), SR)
        assert calls == []

    def test_call_type_in_supported_types(self, clean_signal: np.ndarray) -> None:
        from echofield.pipeline.call_detector import SUPPORTED_CALL_TYPES
        detector = CallDetector()
        calls = detector.detect("rec-001", clean_signal, SR)
        for call in calls:
            assert call["call_type"] in SUPPORTED_CALL_TYPES

    def test_confidence_tier_mapping(self, clean_signal: np.ndarray) -> None:
        detector = CallDetector()
        calls = detector.detect("rec-001", clean_signal, SR)
        valid_tiers = {"publishable", "high", "minimum", "below_threshold"}
        for call in calls:
            assert call["confidence_tier"] in valid_tiers

    def test_heuristic_backend_reported(self, clean_signal: np.ndarray) -> None:
        detector = CallDetector()  # no model paths
        calls = detector.detect("rec-001", clean_signal, SR)
        for call in calls:
            assert call["detector_backend"] == "energy_threshold"
            assert call["classifier_backend"] == "rule_based"

    def test_recording_id_in_each_call(self, clean_signal: np.ndarray) -> None:
        detector = CallDetector()
        calls = detector.detect("my-recording-xyz", clean_signal, SR)
        for call in calls:
            assert call["recording_id"] == "my-recording-xyz"

    def test_deterministic_output(self, clean_signal: np.ndarray) -> None:
        """Same input → same output on repeated calls."""
        detector = CallDetector()
        calls_a = detector.detect("rec-det", clean_signal, SR)
        calls_b = detector.detect("rec-det", clean_signal, SR)
        assert len(calls_a) == len(calls_b)
        for a, b in zip(calls_a, calls_b):
            assert a["call_type"] == b["call_type"]
            assert a["confidence"] == pytest.approx(b["confidence"], abs=1e-6)


# ---------------------------------------------------------------------------
# Confidence threshold constants
# ---------------------------------------------------------------------------

class TestConfidenceThresholds:
    def test_threshold_ordering(self) -> None:
        assert CONFIDENCE_MINIMUM < CONFIDENCE_HIGH < CONFIDENCE_PUBLISHABLE

    def test_thresholds_in_unit_range(self) -> None:
        for threshold in (CONFIDENCE_MINIMUM, CONFIDENCE_HIGH, CONFIDENCE_PUBLISHABLE):
            assert 0.0 < threshold < 1.0
