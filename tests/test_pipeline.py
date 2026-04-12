from __future__ import annotations

import asyncio
from pathlib import Path

import numpy as np
import pytest
import soundfile as sf

from echofield.pipeline.ingestion import ingest_audio_file
from echofield.pipeline.cache_manager import CacheManager
from echofield.pipeline.hybrid_pipeline import ProcessingPipeline
from echofield.pipeline.quality_check import assess_quality, compute_snr
from echofield.pipeline.spectral_gate import spectral_gate_denoise
from echofield.pipeline.spectrogram import build_spectrogram_artifacts, compute_stft


class DummySettings:
    SAMPLE_RATE = 44_100
    SEGMENT_SECONDS = 60
    SEGMENT_OVERLAP_RATIO = 0.5
    SPECTROGRAM_N_FFT = 2048
    SPECTROGRAM_HOP_LENGTH = 512
    SPECTROGRAM_FREQ_MAX = 1000
    DENOISE_METHOD = "hybrid"
    MODEL_PATH = ""
    CALL_AWARE_GATE = False
    CALL_GATE_MIN_CONFIDENCE = 0.45
    CALL_GATE_PAD_MS = 250.0
    CALL_GATE_MERGE_GAP_MS = 100.0
    CALL_GATE_FADE_MS = 40.0
    CALL_GATE_FLOOR_LINEAR = 0.0


def _make_waveform(sr: int = 44_100, seconds: int = 2) -> np.ndarray:
    t = np.linspace(0, seconds, sr * seconds, endpoint=False)
    signal = 0.2 * np.sin(2 * np.pi * 18 * t)
    noise = 0.05 * np.sin(2 * np.pi * 180 * t)
    return (signal + noise).astype(np.float32)


def test_ingestion_handles_valid_and_invalid_files(tmp_path: Path) -> None:
    sr = 44_100
    waveform = _make_waveform(sr=sr, seconds=1)
    audio_path = tmp_path / "ingest.wav"
    sf.write(audio_path, waveform, sr)

    result = ingest_audio_file(str(audio_path))
    assert result.filename == "ingest.wav"
    assert result.sample_rate == sr
    assert result.duration_s > 0
    assert len(result.segments) >= 1

    invalid_path = tmp_path / "not_audio.txt"
    invalid_path.write_text("not audio", encoding="utf-8")
    with pytest.raises(ValueError):
        ingest_audio_file(str(invalid_path))


def test_spectrogram_generation_output_shape_and_range(tmp_path: Path) -> None:
    sr = 44_100
    waveform = _make_waveform(sr=sr, seconds=1)

    stft_data = compute_stft(waveform, sr)
    magnitude_db = stft_data["magnitude_db"]
    assert magnitude_db.ndim == 2
    assert magnitude_db.shape[0] > 0
    assert magnitude_db.shape[1] > 0
    assert np.isfinite(magnitude_db).all()
    assert float(np.max(magnitude_db)) <= 1e-5

    spectrogram, viz = build_spectrogram_artifacts(
        "spec-test",
        waveform,
        sr,
        tmp_path / "spectrograms",
    )
    assert spectrogram.magnitude_db.shape == magnitude_db.shape
    assert Path(viz.url).exists()


def test_spectral_gating_improves_snr_on_synthetic_signal() -> None:
    sr = 44_100
    t = np.linspace(0, 2, sr * 2, endpoint=False)
    rng = np.random.default_rng(0)
    signal = 0.25 * np.sin(2 * np.pi * 18 * t)
    broadband_noise = 0.08 * np.sin(2 * np.pi * 800 * t)
    random_noise = 0.03 * rng.standard_normal(t.shape)
    noisy = (signal + broadband_noise + random_noise).astype(np.float32)

    before_snr = compute_snr(noisy, sr)
    cleaned = spectral_gate_denoise(noisy, sr, aggressiveness=2.2)["cleaned_audio"]
    after_snr = compute_snr(cleaned, sr)

    assert after_snr > before_snr


def test_quality_check_returns_valid_metrics() -> None:
    sr = 44_100
    t = np.linspace(0, 1, sr, endpoint=False)
    original = (0.2 * np.sin(2 * np.pi * 18 * t) + 0.06 * np.sin(2 * np.pi * 400 * t)).astype(np.float32)
    cleaned = spectral_gate_denoise(original, sr, aggressiveness=2.0)["cleaned_audio"]

    quality = assess_quality(original, cleaned, sr)
    assert 0 <= float(quality["quality_score"]) <= 100
    assert quality["quality_rating"] in {"excellent", "good", "fair", "poor"}
    assert 0 <= float(quality["energy_preservation"]) <= 1
    assert float(quality["spectral_distortion"]) >= 0


def test_processing_pipeline_creates_outputs(tmp_path: Path) -> None:
    sr = 44_100
    seconds = 2
    t = np.linspace(0, seconds, sr * seconds, endpoint=False)
    signal = 0.2 * np.sin(2 * np.pi * 18 * t)
    noise = 0.05 * np.sin(2 * np.pi * 180 * t)
    waveform = (signal + noise).astype(np.float32)

    audio_path = tmp_path / "input.wav"
    sf.write(audio_path, waveform, sr)

    cache = CacheManager(str(tmp_path / "cache"), max_size_mb=32)
    pipeline = ProcessingPipeline(DummySettings(), cache)
    result = asyncio.run(
        pipeline.process_recording(
            "rec-1",
            str(audio_path),
            str(tmp_path / "processed"),
            str(tmp_path / "spectrograms"),
        )
    )

    assert result["status"] == "complete"
    assert Path(result["output_audio_path"]).exists()
    assert Path(result["spectrogram_before_path"]).exists()
    assert Path(result["spectrogram_after_path"]).exists()
    assert result["quality"]["quality_score"] >= 0
    assert result["calls"]
    assert result.get("call_gate", {}).get("enabled") is False
    stats = cache.get_stats()
    assert stats["file_count"] >= 3

