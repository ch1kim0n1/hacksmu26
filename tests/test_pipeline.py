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
from echofield.pipeline.spectrogram import build_spectrogram_artifacts, compute_stft, generate_spectrogram_png


class DummySettings:
    SAMPLE_RATE = 44_100
    SEGMENT_SECONDS = 60
    SEGMENT_OVERLAP_RATIO = 0.5
    SPECTROGRAM_N_FFT = 2048
    SPECTROGRAM_HOP_LENGTH = 512
    SPECTROGRAM_FREQ_MAX = 1000
    DENOISE_METHOD = "hybrid"
    MODEL_PATH = ""


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
    stats = cache.get_stats()
    assert stats["file_count"] >= 3


# ── Colormap tests ──


SUPPORTED_COLORMAPS = ["viridis", "magma", "inferno", "plasma", "gray"]


def test_generate_spectrogram_png_default_cmap(tmp_path: Path) -> None:
    """generate_spectrogram_png produces a PNG with the default viridis colormap."""
    sr = 44_100
    waveform = _make_waveform(sr=sr, seconds=1)
    stft_data = compute_stft(waveform, sr)
    output = tmp_path / "spec_viridis.png"
    result = generate_spectrogram_png(stft_data["magnitude_db"], sr, 512, output)
    assert Path(result).exists()
    assert Path(result).stat().st_size > 0


@pytest.mark.parametrize("cmap", SUPPORTED_COLORMAPS)
def test_generate_spectrogram_png_custom_cmap(tmp_path: Path, cmap: str) -> None:
    """generate_spectrogram_png accepts each supported colormap and produces a valid PNG."""
    sr = 44_100
    waveform = _make_waveform(sr=sr, seconds=1)
    stft_data = compute_stft(waveform, sr)
    output = tmp_path / f"spec_{cmap}.png"
    result = generate_spectrogram_png(stft_data["magnitude_db"], sr, 512, output, cmap=cmap)
    assert Path(result).exists()
    assert Path(result).stat().st_size > 0


def test_generate_spectrogram_png_different_colormaps_produce_different_files(tmp_path: Path) -> None:
    """Two different colormaps produce visually distinct PNG files (different bytes)."""
    sr = 44_100
    waveform = _make_waveform(sr=sr, seconds=1)
    stft_data = compute_stft(waveform, sr)

    path_viridis = tmp_path / "viridis.png"
    path_magma = tmp_path / "magma.png"
    generate_spectrogram_png(stft_data["magnitude_db"], sr, 512, path_viridis, cmap="viridis")
    generate_spectrogram_png(stft_data["magnitude_db"], sr, 512, path_magma, cmap="magma")

    assert path_viridis.read_bytes() != path_magma.read_bytes()


def test_build_spectrogram_artifacts_accepts_cmap(tmp_path: Path) -> None:
    """build_spectrogram_artifacts passes the cmap through to PNG generation."""
    sr = 44_100
    waveform = _make_waveform(sr=sr, seconds=1)

    _, viz = build_spectrogram_artifacts(
        "cmap-test",
        waveform,
        sr,
        tmp_path / "spectrograms",
        cmap="magma",
    )
    assert Path(viz.url).exists()
    assert Path(viz.url).stat().st_size > 0


def test_build_spectrogram_artifacts_invalid_cmap_raises(tmp_path: Path) -> None:
    """build_spectrogram_artifacts raises ValueError for unsupported colormaps."""
    sr = 44_100
    waveform = _make_waveform(sr=sr, seconds=1)

    with pytest.raises(ValueError, match="colormap"):
        build_spectrogram_artifacts(
            "bad-cmap-test",
            waveform,
            sr,
            tmp_path / "spectrograms",
            cmap="rainbow",
        )


# ── Spectrogram axis readability tests ──


def test_generate_spectrogram_png_produces_larger_image(tmp_path: Path) -> None:
    """The PNG is large enough (≥ 400px wide) to display without axis clutter."""
    from PIL import Image  # type: ignore[import]

    sr = 44_100
    waveform = _make_waveform(sr=sr, seconds=1)
    stft_data = compute_stft(waveform, sr)
    output = tmp_path / "spec.png"
    generate_spectrogram_png(stft_data["magnitude_db"], sr, 512, output)
    img = Image.open(output)
    width, height = img.size
    assert width >= 400, f"PNG width {width}px is too narrow — axis labels will clutter"
    assert height >= 300, f"PNG height {height}px is too short"


def test_generate_spectrogram_png_short_recording_readable(tmp_path: Path) -> None:
    """A very short recording (0.5s) generates a PNG without crashing or garbled axes."""
    sr = 44_100
    short_waveform = _make_waveform(sr=sr, seconds=1)[:sr // 2]
    stft_data = compute_stft(short_waveform, sr)
    output = tmp_path / "spec_short.png"
    result = generate_spectrogram_png(stft_data["magnitude_db"], sr, 512, output)
    assert Path(result).exists()
    assert Path(result).stat().st_size > 1000  # non-trivial PNG
