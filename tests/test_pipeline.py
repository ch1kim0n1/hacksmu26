from __future__ import annotations

import asyncio
from pathlib import Path

import numpy as np
import pytest

from echofield.pipeline.ingestion import ingest_audio_file
from echofield.pipeline.quality_check import assess_quality, compute_snr
from echofield.pipeline.spectral_gate import spectral_gate_denoise
from echofield.pipeline.spectrogram import build_spectrogram_artifacts


def test_ingest_audio_file_accepts_valid_wav(sample_wav_path: Path) -> None:
    result = ingest_audio_file(str(sample_wav_path))

    assert result.filename == sample_wav_path.name
    assert result.duration_s > 0
    assert result.sample_rate == 44_100
    assert result.channels >= 1
    assert result.segments
    assert result.metadata["filename"] == sample_wav_path.name


def test_ingest_audio_file_rejects_invalid_file(invalid_audio_path: Path) -> None:
    with pytest.raises(ValueError, match="Unsupported file extension"):
        ingest_audio_file(str(invalid_audio_path))


def test_build_spectrogram_artifacts_outputs_expected_shapes(
    tmp_path: Path,
    sample_waveform: tuple[np.ndarray, int],
) -> None:
    waveform, sr = sample_waveform
    spectrogram, viz = build_spectrogram_artifacts("spec-test", waveform, sr, tmp_path)

    assert spectrogram.stft.ndim == 2
    assert spectrogram.magnitude_db.shape == spectrogram.stft.shape
    assert spectrogram.mel_spectrogram.shape[0] == 128
    assert spectrogram.mel_spectrogram.shape[1] == spectrogram.stft.shape[1]
    assert np.isfinite(spectrogram.magnitude_db).all()
    assert np.isfinite(spectrogram.mel_spectrogram).all()
    assert -10.0 < float(np.mean(spectrogram.mel_spectrogram)) < 10.0
    assert 0.5 < float(np.std(spectrogram.mel_spectrogram)) < 1.5
    assert Path(spectrogram.npy_path).exists()
    assert Path(viz.url).exists()


def test_spectral_gate_improves_snr() -> None:
    sr = 44_100
    noise_lead = np.random.default_rng(7).normal(0.0, 0.035, sr // 2).astype(np.float32)
    t = np.linspace(0, 1.5, int(sr * 1.5), endpoint=False, dtype=np.float32)
    signal = 0.18 * np.sin(2 * np.pi * 18 * t)
    background_noise = np.random.default_rng(11).normal(0.0, 0.02, t.size).astype(np.float32)
    waveform = np.concatenate([noise_lead, signal + background_noise]).astype(np.float32)

    cleaned = spectral_gate_denoise(waveform, sr, aggressiveness=1.75)["cleaned_audio"]

    assert cleaned.shape == waveform.shape
    assert compute_snr(cleaned, sr) >= compute_snr(waveform, sr)


def test_assess_quality_returns_valid_metrics() -> None:
    sr = 44_100
    t = np.linspace(0, 1, sr, endpoint=False, dtype=np.float32)
    original = (0.16 * np.sin(2 * np.pi * 20 * t) + 0.04 * np.sin(2 * np.pi * 180 * t)).astype(np.float32)
    cleaned = (0.16 * np.sin(2 * np.pi * 20 * t)).astype(np.float32)

    quality = assess_quality(original, cleaned, sr)

    assert quality["snr_after_db"] >= quality["snr_before_db"]
    assert 0.0 <= quality["energy_preservation"] <= 1.0
    assert 0.0 <= quality["quality_score"] <= 100.0
    assert quality["quality_rating"] in {"excellent", "good", "fair", "poor"}
    assert isinstance(quality["flagged_for_review"], bool)


def test_hybrid_pipeline_runs_end_to_end(
    pipeline,
    sample_wav_path: Path,
    tmp_path: Path,
) -> None:
    result = asyncio.run(
        pipeline.process_recording(
            "rec-e2e",
            str(sample_wav_path),
            str(tmp_path / "processed"),
            str(tmp_path / "spectrograms"),
        )
    )

    assert result["status"] == "complete"
    assert Path(result["output_audio_path"]).exists()
    assert Path(result["spectrogram_before_path"]).exists()
    assert Path(result["spectrogram_after_path"]).exists()
    assert Path(result["comparison_spectrogram_path"]).exists()
    assert result["quality"]["quality_score"] >= 0
    assert result["noise_types"]
    assert isinstance(result["calls"], list)
    assert result["processing_time_s"] >= 0
