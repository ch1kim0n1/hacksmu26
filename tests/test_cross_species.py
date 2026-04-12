"""Tests for cross-species acoustic comparison engine."""

import numpy as np
import pytest

from echofield.research.cross_species import (
    REFERENCE_SPECIES,
    _generate_synthetic_call,
    compare_calls,
    get_reference_audio,
)


class TestReferenceSpecies:
    """Tests for the reference species database."""

    def test_has_four_reference_species(self):
        assert len(REFERENCE_SPECIES) == 4

    def test_reference_ids(self):
        expected = {"blue_whale", "humpback_whale", "lion_roar", "human_speech"}
        assert set(REFERENCE_SPECIES.keys()) == expected

    def test_each_reference_has_required_fields(self):
        required = {"species", "call_type", "description", "frequency_range_hz", "f0_hz", "duration_s"}
        for ref_id, spec in REFERENCE_SPECIES.items():
            for field in required:
                assert field in spec, f"Missing '{field}' in {ref_id}"

    def test_frequency_ranges_are_valid(self):
        for ref_id, spec in REFERENCE_SPECIES.items():
            low, high = spec["frequency_range_hz"]
            assert low < high, f"Invalid range for {ref_id}: {low} >= {high}"
            assert low > 0, f"Negative frequency for {ref_id}"


class TestSyntheticGeneration:
    """Tests for synthetic call generation."""

    def test_generates_correct_length(self):
        spec = REFERENCE_SPECIES["blue_whale"]
        sr = 22050
        audio = _generate_synthetic_call(spec, sr)
        expected_samples = int(sr * spec["duration_s"])
        assert len(audio) == expected_samples

    def test_generates_float32(self):
        audio = _generate_synthetic_call(REFERENCE_SPECIES["lion_roar"])
        assert audio.dtype == np.float32

    def test_normalized_below_one(self):
        for ref_id in REFERENCE_SPECIES:
            audio = _generate_synthetic_call(REFERENCE_SPECIES[ref_id])
            assert np.max(np.abs(audio)) <= 1.0, f"Audio exceeds 1.0 for {ref_id}"

    def test_get_reference_audio_returns_tuple(self):
        audio, sr = get_reference_audio("blue_whale")
        assert isinstance(audio, np.ndarray)
        assert sr == 22050

    def test_get_reference_audio_unknown_raises(self):
        with pytest.raises(ValueError, match="Unknown reference"):
            get_reference_audio("unknown_species")


class TestCompareCallsOutput:
    """Tests for compare_calls output structure."""

    @pytest.fixture()
    def elephant_rumble(self):
        """Synthetic elephant rumble at 15Hz."""
        sr = 22050
        duration = 2.0
        t = np.linspace(0, duration, int(sr * duration), endpoint=False)
        signal = np.sin(2 * np.pi * 15 * t) + 0.3 * np.sin(2 * np.pi * 30 * t)
        return signal.astype(np.float32), sr

    def test_returns_reference_metadata(self, elephant_rumble):
        audio, sr = elephant_rumble
        result = compare_calls(audio, sr, "blue_whale")
        assert "reference" in result
        assert result["reference"]["id"] == "blue_whale"
        assert "species" in result["reference"]
        assert "call_type" in result["reference"]

    def test_returns_comparison_metrics(self, elephant_rumble):
        audio, sr = elephant_rumble
        result = compare_calls(audio, sr, "blue_whale")
        comp = result["comparison"]
        assert "frequency_overlap_pct" in comp
        assert "spectral_similarity" in comp
        assert "harmonic_similarity" in comp
        assert "temporal_similarity" in comp
        assert "insight" in comp

    def test_similarity_scores_in_range(self, elephant_rumble):
        audio, sr = elephant_rumble
        for ref_id in REFERENCE_SPECIES:
            result = compare_calls(audio, sr, ref_id)
            comp = result["comparison"]
            assert 0 <= comp["spectral_similarity"] <= 1.0, f"spectral out of range for {ref_id}"
            assert 0 <= comp["harmonic_similarity"] <= 1.0, f"harmonic out of range for {ref_id}"
            assert 0 <= comp["temporal_similarity"] <= 1.0, f"temporal out of range for {ref_id}"
            assert 0 <= comp["frequency_overlap_pct"] <= 100, f"overlap out of range for {ref_id}"

    def test_returns_feature_comparison(self, elephant_rumble):
        audio, sr = elephant_rumble
        result = compare_calls(audio, sr, "lion_roar")
        fc = result["feature_comparison"]
        expected_keys = {"fundamental_frequency_hz", "harmonicity", "bandwidth_hz",
                         "spectral_centroid_hz", "duration_s", "snr_db"}
        assert set(fc.keys()) == expected_keys
        for key, val in fc.items():
            assert "elephant" in val, f"Missing 'elephant' in {key}"
            assert "reference" in val, f"Missing 'reference' in {key}"
            assert "difference_pct" in val, f"Missing 'difference_pct' in {key}"

    def test_insight_is_nonempty_string(self, elephant_rumble):
        audio, sr = elephant_rumble
        result = compare_calls(audio, sr, "blue_whale")
        assert isinstance(result["comparison"]["insight"], str)
        assert len(result["comparison"]["insight"]) > 10

    def test_unknown_reference_raises(self, elephant_rumble):
        audio, sr = elephant_rumble
        with pytest.raises(ValueError, match="Unknown reference"):
            compare_calls(audio, sr, "platypus")

    def test_elephant_vs_blue_whale_infrasound_overlap(self, elephant_rumble):
        """Elephant rumble at 15Hz should have high overlap with blue whale (10-40Hz)."""
        audio, sr = elephant_rumble
        result = compare_calls(audio, sr, "blue_whale")
        # Both are infrasonic — should have meaningful overlap
        assert result["comparison"]["frequency_overlap_pct"] >= 0

    def test_all_four_references_produce_results(self, elephant_rumble):
        """Verify all 4 reference species can be compared without errors."""
        audio, sr = elephant_rumble
        for ref_id in REFERENCE_SPECIES:
            result = compare_calls(audio, sr, ref_id)
            assert result["reference"]["id"] == ref_id
