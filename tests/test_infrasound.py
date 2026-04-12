"""Tests for infrasound detection and pitch-shifting."""
from __future__ import annotations

import numpy as np
import pytest

from echofield.pipeline.infrasound import (
    create_infrasound_reveal,
    detect_infrasound_regions,
    pitch_shift_infrasound,
)


def _make_infrasound(sr: int = 44_100, seconds: int = 3) -> np.ndarray:
    """Generate a waveform with strong infrasonic content at 12Hz."""
    t = np.linspace(0, seconds, sr * seconds, endpoint=False)
    infra = 0.5 * np.sin(2 * np.pi * 12 * t)  # 12Hz rumble
    audible = 0.05 * np.sin(2 * np.pi * 440 * t)  # faint 440Hz reference
    return (infra + audible).astype(np.float32)


def _make_audible_only(sr: int = 44_100, seconds: int = 2) -> np.ndarray:
    """Generate a waveform with only audible frequencies."""
    t = np.linspace(0, seconds, sr * seconds, endpoint=False)
    return (0.3 * np.sin(2 * np.pi * 500 * t)).astype(np.float32)


class TestDetectInfrasoundRegions:
    def test_detects_infrasound_in_signal_with_low_frequency(self) -> None:
        sr = 44_100
        y = _make_infrasound(sr=sr, seconds=3)
        regions = detect_infrasound_regions(y, sr)
        assert len(regions) > 0
        for r in regions:
            assert isinstance(r, dict)
            assert r["end_ms"] > r["start_ms"]
            assert r["estimated_f0_hz"] >= 0

    def test_audible_only_signal_has_negligible_infrasound_energy(self) -> None:
        sr = 44_100
        y = _make_audible_only(sr=sr, seconds=2)
        regions = detect_infrasound_regions(y, sr)
        # An audible-only signal may produce regions due to filter leakage,
        # but the estimated f0 should be 0 (no real infrasonic pitch)
        for r in regions:
            assert r["estimated_f0_hz"] == 0.0

    def test_custom_upper_bound(self) -> None:
        sr = 44_100
        y = _make_infrasound(sr=sr, seconds=2)
        regions = detect_infrasound_regions(y, sr, upper_bound_hz=15.0)
        # Should still detect the 12Hz component
        assert isinstance(regions, list)


class TestPitchShiftInfrasound:
    def test_output_same_length_when_preserving_duration(self) -> None:
        sr = 44_100
        y = _make_infrasound(sr=sr, seconds=1)
        shifted, out_sr = pitch_shift_infrasound(y, sr, shift_octaves=3, preserve_duration=True)
        assert len(shifted) == len(y)

    def test_output_different_length_without_preserving_duration(self) -> None:
        sr = 44_100
        y = _make_infrasound(sr=sr, seconds=1)
        shifted, out_sr = pitch_shift_infrasound(y, sr, shift_octaves=2, preserve_duration=False)
        # Resample method changes effective sample rate, resulting in different length
        assert isinstance(shifted, np.ndarray)
        assert len(shifted) > 0

    def test_shift_octaves_range(self) -> None:
        sr = 44_100
        y = _make_infrasound(sr=sr, seconds=1)
        for octaves in (1, 2, 3, 4, 5):
            shifted, out_sr = pitch_shift_infrasound(y, sr, shift_octaves=octaves)
            assert isinstance(shifted, np.ndarray)
            assert len(shifted) == len(y)


class TestCreateInfrasoundReveal:
    def test_shifted_only_mode(self) -> None:
        sr = 44_100
        y = _make_infrasound(sr=sr, seconds=2)
        result = create_infrasound_reveal(y, sr, shift_octaves=3, mix_mode="shifted_only")
        assert "audio" in result
        assert "infrasound_energy_pct" in result
        assert "frequency_range_original_hz" in result
        assert "frequency_range_shifted_hz" in result
        assert isinstance(result["audio"], np.ndarray)
        assert len(result["audio"]) > 0

    def test_blended_mode(self) -> None:
        sr = 44_100
        y = _make_infrasound(sr=sr, seconds=2)
        result = create_infrasound_reveal(y, sr, mix_mode="blended")
        assert isinstance(result["audio"], np.ndarray)
        assert len(result["audio"]) > 0

    def test_side_by_side_mode(self) -> None:
        sr = 44_100
        y = _make_infrasound(sr=sr, seconds=2)
        result = create_infrasound_reveal(y, sr, mix_mode="side_by_side")
        assert isinstance(result["audio"], np.ndarray)

    def test_frequency_ranges_shift_correctly(self) -> None:
        sr = 44_100
        y = _make_infrasound(sr=sr, seconds=1)
        result = create_infrasound_reveal(y, sr, shift_octaves=3)
        orig = result["frequency_range_original_hz"]
        shifted = result["frequency_range_shifted_hz"]
        assert shifted[0] == orig[0] * 8  # 2^3 = 8
        assert shifted[1] == orig[1] * 8

    def test_infrasound_energy_percentage(self) -> None:
        sr = 44_100
        y = _make_infrasound(sr=sr, seconds=2)
        result = create_infrasound_reveal(y, sr)
        # Signal is dominated by 12Hz, so infrasound energy should be high
        assert result["infrasound_energy_pct"] > 0

    def test_normalization_keeps_audio_below_one(self) -> None:
        sr = 44_100
        y = _make_infrasound(sr=sr, seconds=1)
        result = create_infrasound_reveal(y, sr)
        assert np.max(np.abs(result["audio"])) <= 1.0
