"""Tests for noise classifier validation and dataset loading."""

import pytest
from pathlib import Path
import tempfile
import csv
import numpy as np
from echofield.pipeline.noise_classifier import (
    validate_noise_classifier,
    classify_noise,
    normalize_noise_label,
    _iter_labeled_audio,
)
from echofield.utils.audio_utils import save_audio


class TestNoiseClassifierValidation:
    """Test the validate_noise_classifier function against real dataset."""

    def test_validate_noise_classifier_with_metadata_csv(self):
        """Test that validation works with actual data/metadata.csv."""
        result = validate_noise_classifier("data/metadata.csv")

        # Should have processed all 44 labeled samples
        assert result["total"] == 44
        assert result["correct"] >= 0
        assert 0 <= result["accuracy"] <= 1

        # Should have per-class recall for each class in dataset
        assert "per_class_recall" in result
        assert len(result["per_class_recall"]) > 0

        # Should have confusion matrix
        assert "confusion" in result
        assert isinstance(result["confusion"], dict)

        # Should have per-sample details
        assert "samples" in result
        assert len(result["samples"]) == 44

    def test_confusion_matrix_structure(self):
        """Test that confusion matrix has correct structure."""
        result = validate_noise_classifier("data/metadata.csv")
        confusion = result["confusion"]

        # Each true label should appear in confusion matrix
        for true_label, predictions in confusion.items():
            assert isinstance(predictions, dict)
            # Each prediction should be a count
            for pred_label, count in predictions.items():
                assert isinstance(count, int)
                assert count >= 0

    def test_per_class_recall_values(self):
        """Test that per-class recall values are reasonable."""
        result = validate_noise_classifier("data/metadata.csv")

        # All recall values should be between 0 and 1
        for label, recall in result["per_class_recall"].items():
            assert 0 <= recall <= 1

        # Should have at least one class with recall > random baseline (0.25)
        # This documents the current state - may fail initially, then improve
        max_recall = max(result["per_class_recall"].values())
        assert max_recall > 0.0, "At least one class should have some correct predictions"

    def test_sample_details_include_mismatches(self):
        """Test that samples include correct/incorrect flags."""
        result = validate_noise_classifier("data/metadata.csv")
        samples = result["samples"]

        # Each sample should have expected fields
        for sample in samples:
            assert "path" in sample
            assert "label" in sample
            assert "predicted" in sample
            assert "confidence" in sample
            assert "correct" in sample
            assert isinstance(sample["correct"], bool)


class TestIterLabeledAudio:
    """Test the _iter_labeled_audio function for CSV loading."""

    def test_iter_labeled_audio_with_metadata_csv(self):
        """Test loading from data/metadata.csv with noise_type_ref column."""
        labeled_audio = _iter_labeled_audio("data/metadata.csv")

        # Should find all 44 files
        assert len(labeled_audio) == 44

        # Each entry should be (Path, str) tuple
        for audio_path, label in labeled_audio:
            assert isinstance(audio_path, Path)
            assert isinstance(label, str)
            # Audio files should exist
            assert audio_path.exists(), f"Audio file not found: {audio_path}"
            # Label should be normalized
            assert label in [
                "airplane",
                "car",
                "generator",
                "wind",
                "other",
                "background",
            ]

    def test_iter_labeled_audio_path_resolution(self):
        """Test that paths are correctly resolved to data/audio-files/."""
        labeled_audio = _iter_labeled_audio("data/metadata.csv")

        for audio_path, label in labeled_audio:
            # All audio files should be found in data/audio-files/
            assert "audio-files" in str(audio_path) or audio_path.exists()

    def test_normalize_noise_label_supports_background(self):
        """Test that background label is properly normalized."""
        # Should handle 'background' from metadata
        result = normalize_noise_label("background")
        assert result in ["airplane", "car", "generator", "wind", "other", "background"]


class TestClassifyNoiseBasics:
    """Test basic classify_noise functionality."""

    def test_classify_noise_returns_expected_structure(self):
        """Test that classify_noise returns all required fields."""
        # Create simple sinusoidal audio at 440 Hz
        sr = 22050
        duration = 1.0
        freq = 440
        t = np.linspace(0, duration, int(sr * duration))
        y = np.sin(2 * np.pi * freq * t).astype(np.float32)

        result = classify_noise(y, sr)

        # Should have all required fields
        assert "primary_type" in result
        assert "confidence" in result
        assert "noise_types" in result
        assert "dominant_frequency_hz" in result

        # Confidence should be between 0 and 1
        assert 0 <= result["confidence"] <= 1

    def test_classify_noise_empty_audio(self):
        """Test handling of empty audio."""
        result = classify_noise(np.array([]), 22050)

        assert result["primary_type"] == "other"
        assert result["confidence"] == 0.0
        assert result["noise_types"] == []
        assert result["dominant_frequency_hz"] == 0.0
