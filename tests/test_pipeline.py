"""Unit tests for the EchoField audio processing pipeline.

Tests are organised into four sections matching the pipeline stages:
  1. Ingestion  (validate, load, segment, metadata)
  2. Spectrogram (STFT, mel, PNG export)
  3. Spectral gating / noise removal
  4. Quality assessment
  5. Hybrid pipeline end-to-end
"""

from __future__ import annotations

import asyncio
import math
import os

import numpy as np
import pytest

# ---------------------------------------------------------------------------
# 1. Ingestion
# ---------------------------------------------------------------------------

class TestIngestionValidation:
    """validate_audio_file — exists / extension / size checks."""

    def test_valid_wav_passes(self, clean_wav_path):
        from echofield.pipeline.ingestion import validate_audio_file
        ok, msg = validate_audio_file(clean_wav_path)
        assert ok is True
        assert msg == ""

    def test_missing_file_fails(self):
        from echofield.pipeline.ingestion import validate_audio_file
        ok, msg = validate_audio_file("/nonexistent/path/audio.wav")
        assert ok is False
        assert "not found" in msg.lower()

    def test_unsupported_extension_fails(self, tmp_path):
        from echofield.pipeline.ingestion import validate_audio_file
        txt_file = tmp_path / "audio.txt"
        txt_file.write_text("not audio")
        ok, msg = validate_audio_file(str(txt_file))
        assert ok is False
        assert "unsupported" in msg.lower()

    def test_mp3_extension_accepted(self, tmp_path):
        from echofield.pipeline.ingestion import validate_audio_file
        # File exists with .mp3 extension — librosa isn't called here
        mp3 = tmp_path / "audio.mp3"
        mp3.write_bytes(b"\x00" * 100)
        ok, _msg = validate_audio_file(str(mp3))
        # Only validates extension + existence + size — not content
        assert ok is True

    def test_flac_extension_accepted(self, tmp_path):
        from echofield.pipeline.ingestion import validate_audio_file
        flac = tmp_path / "audio.flac"
        flac.write_bytes(b"\x00" * 100)
        ok, _msg = validate_audio_file(str(flac))
        assert ok is True


class TestIngestionLoad:
    """load_audio — dtype, sample-rate, mono output."""

    def test_load_returns_ndarray(self, clean_wav_path, test_sr):
        from echofield.pipeline.ingestion import load_audio
        y, sr = load_audio(clean_wav_path, target_sr=test_sr)
        assert isinstance(y, np.ndarray)
        assert sr == test_sr

    def test_load_is_mono(self, clean_wav_path, test_sr):
        from echofield.pipeline.ingestion import load_audio
        y, _ = load_audio(clean_wav_path, target_sr=test_sr)
        assert y.ndim == 1

    def test_load_correct_duration(self, clean_wav_path, test_sr):
        from echofield.pipeline.ingestion import load_audio
        y, sr = load_audio(clean_wav_path, target_sr=test_sr)
        duration = len(y) / sr
        # Allow ±50 ms tolerance
        assert abs(duration - 2.0) < 0.05

    def test_load_resamples(self, clean_wav_path):
        from echofield.pipeline.ingestion import load_audio
        # Request a different SR than what the fixture was written at
        y, sr = load_audio(clean_wav_path, target_sr=8000)
        assert sr == 8000
        # Duration should still be ~2 s at new SR
        assert abs(len(y) / sr - 2.0) < 0.05


class TestIngestionSegment:
    """segment_audio — short audio → 1 segment; long audio → N segments."""

    def test_short_audio_single_segment(self, clean_audio, test_sr):
        from echofield.pipeline.ingestion import segment_audio
        segs = segment_audio(clean_audio, test_sr, max_duration_s=120)
        assert len(segs) == 1
        assert segs[0]["index"] == 0
        assert segs[0]["start_s"] == pytest.approx(0.0)

    def test_segment_has_required_keys(self, clean_audio, test_sr):
        from echofield.pipeline.ingestion import segment_audio
        segs = segment_audio(clean_audio, test_sr)
        for seg in segs:
            assert "data" in seg
            assert "start_s" in seg
            assert "end_s" in seg
            assert "index" in seg

    def test_long_audio_multiple_segments(self, long_audio, test_sr):
        from echofield.pipeline.ingestion import segment_audio
        # 300 s audio, max 120 s per segment → at least 2 segments
        segs = segment_audio(long_audio, test_sr, max_duration_s=120)
        assert len(segs) >= 2

    def test_segment_data_is_ndarray(self, clean_audio, test_sr):
        from echofield.pipeline.ingestion import segment_audio
        segs = segment_audio(clean_audio, test_sr)
        assert isinstance(segs[0]["data"], np.ndarray)

    def test_segment_indices_sequential(self, long_audio, test_sr):
        from echofield.pipeline.ingestion import segment_audio
        segs = segment_audio(long_audio, test_sr, max_duration_s=60)
        indices = [s["index"] for s in segs]
        assert indices == list(range(len(segs)))


class TestIngestionMetadata:
    """extract_metadata — keys and basic value sanity."""

    def test_metadata_has_required_keys(self, clean_wav_path, clean_audio, test_sr):
        from echofield.pipeline.ingestion import extract_metadata
        meta = extract_metadata(clean_wav_path, clean_audio, test_sr)
        for key in ("filename", "duration_s", "sample_rate", "file_size_mb"):
            assert key in meta

    def test_metadata_filename_is_basename(self, clean_wav_path, clean_audio, test_sr):
        from echofield.pipeline.ingestion import extract_metadata
        meta = extract_metadata(clean_wav_path, clean_audio, test_sr)
        assert meta["filename"] == os.path.basename(clean_wav_path)

    def test_metadata_duration_correct(self, clean_wav_path, clean_audio, test_sr):
        from echofield.pipeline.ingestion import extract_metadata
        meta = extract_metadata(clean_wav_path, clean_audio, test_sr)
        assert abs(meta["duration_s"] - 2.0) < 0.05

    def test_metadata_sample_rate(self, clean_wav_path, clean_audio, test_sr):
        from echofield.pipeline.ingestion import extract_metadata
        meta = extract_metadata(clean_wav_path, clean_audio, test_sr)
        assert meta["sample_rate"] == test_sr

    def test_metadata_filesize_positive(self, clean_wav_path, clean_audio, test_sr):
        from echofield.pipeline.ingestion import extract_metadata
        meta = extract_metadata(clean_wav_path, clean_audio, test_sr)
        assert meta["file_size_mb"] > 0


# ---------------------------------------------------------------------------
# 2. Spectrogram
# ---------------------------------------------------------------------------

class TestSTFT:
    """compute_stft — output shape, keys, dB range."""

    def test_returns_required_keys(self, clean_audio):
        from echofield.pipeline.spectrogram import compute_stft
        result = compute_stft(clean_audio)
        for key in ("stft", "magnitude_db", "frequencies", "times"):
            assert key in result

    def test_stft_is_complex(self, clean_audio):
        from echofield.pipeline.spectrogram import compute_stft
        result = compute_stft(clean_audio)
        assert np.iscomplexobj(result["stft"])

    def test_magnitude_db_shape_matches_stft(self, clean_audio):
        from echofield.pipeline.spectrogram import compute_stft
        result = compute_stft(clean_audio)
        assert result["magnitude_db"].shape == result["stft"].shape

    def test_frequency_bins_count(self, clean_audio):
        from echofield.pipeline.spectrogram import compute_stft
        n_fft = 512
        result = compute_stft(clean_audio, n_fft=n_fft)
        # freq axis = n_fft // 2 + 1
        assert result["stft"].shape[0] == n_fft // 2 + 1

    def test_magnitude_db_max_is_zero(self, clean_audio):
        from echofield.pipeline.spectrogram import compute_stft
        result = compute_stft(clean_audio)
        # amplitude_to_db with ref=np.max → max value is 0 dB
        assert result["magnitude_db"].max() == pytest.approx(0.0, abs=1e-4)

    def test_magnitude_db_has_no_nan(self, clean_audio):
        from echofield.pipeline.spectrogram import compute_stft
        result = compute_stft(clean_audio)
        assert not np.any(np.isnan(result["magnitude_db"]))


class TestMelSpectrogram:
    """compute_mel_spectrogram — shape and value range."""

    def test_shape_n_mels_x_time(self, clean_audio, test_sr):
        from echofield.pipeline.spectrogram import compute_mel_spectrogram
        n_mels = 64
        mel = compute_mel_spectrogram(clean_audio, test_sr, n_mels=n_mels)
        assert mel.shape[0] == n_mels
        assert mel.shape[1] > 0

    def test_values_are_non_positive_db(self, clean_audio, test_sr):
        from echofield.pipeline.spectrogram import compute_mel_spectrogram
        mel = compute_mel_spectrogram(clean_audio, test_sr)
        # power_to_db with ref=max → max is 0 dB, rest are ≤ 0
        assert mel.max() <= 1e-4

    def test_values_finite(self, clean_audio, test_sr):
        from echofield.pipeline.spectrogram import compute_mel_spectrogram
        mel = compute_mel_spectrogram(clean_audio, test_sr)
        assert np.all(np.isfinite(mel))

    def test_default_n_mels_128(self, clean_audio, test_sr):
        from echofield.pipeline.spectrogram import compute_mel_spectrogram
        mel = compute_mel_spectrogram(clean_audio, test_sr)
        assert mel.shape[0] == 128


class TestSpectrogramPNG:
    """generate_spectrogram_png — file creation."""

    def test_creates_png_file(self, tmp_path, clean_audio, test_sr):
        from echofield.pipeline.spectrogram import compute_stft, generate_spectrogram_png
        stft_data = compute_stft(clean_audio, n_fft=512, hop_length=128)
        out = str(tmp_path / "spec.png")
        generate_spectrogram_png(
            stft_data["magnitude_db"], test_sr, hop_length=128, output_path=out
        )
        assert os.path.isfile(out)
        assert os.path.getsize(out) > 0

    def test_file_is_png_header(self, tmp_path, clean_audio, test_sr):
        from echofield.pipeline.spectrogram import compute_stft, generate_spectrogram_png
        stft_data = compute_stft(clean_audio, n_fft=512, hop_length=128)
        out = str(tmp_path / "spec2.png")
        generate_spectrogram_png(
            stft_data["magnitude_db"], test_sr, hop_length=128, output_path=out
        )
        with open(out, "rb") as fh:
            header = fh.read(8)
        # PNG magic bytes
        assert header == b"\x89PNG\r\n\x1a\n"


# ---------------------------------------------------------------------------
# 3. Spectral gating / noise removal
# ---------------------------------------------------------------------------

class TestSpectralGate:
    """apply_spectral_gate, apply_bandpass_filter, denoise_recording."""

    def test_spectral_gate_preserves_length(self, noisy_audio, test_sr):
        from echofield.pipeline.spectral_gate import apply_spectral_gate
        y_clean = apply_spectral_gate(noisy_audio, test_sr)
        assert len(y_clean) == len(noisy_audio)

    def test_spectral_gate_returns_float32(self, noisy_audio, test_sr):
        from echofield.pipeline.spectral_gate import apply_spectral_gate
        y_clean = apply_spectral_gate(noisy_audio, test_sr)
        assert y_clean.dtype in (np.float32, np.float64)

    def test_spectral_gate_with_noise_clip(self, noisy_audio, test_sr):
        from echofield.pipeline.spectral_gate import apply_spectral_gate, estimate_noise_profile
        noise_clip = estimate_noise_profile(noisy_audio, test_sr, noise_duration_s=0.5)
        y_clean = apply_spectral_gate(noisy_audio, test_sr, noise_clip=noise_clip)
        assert len(y_clean) == len(noisy_audio)

    def test_spectral_gate_changes_signal(self, noisy_audio, test_sr):
        """Spectral gating must modify the signal — not a no-op."""
        from echofield.pipeline.spectral_gate import apply_spectral_gate
        y_clean = apply_spectral_gate(noisy_audio, test_sr)
        assert not np.allclose(y_clean, noisy_audio, atol=1e-5)

    def test_bandpass_filter_preserves_length(self, clean_audio, test_sr):
        from echofield.pipeline.spectral_gate import apply_bandpass_filter
        y_filt = apply_bandpass_filter(clean_audio, test_sr, low_hz=8, high_hz=500)
        assert len(y_filt) == len(clean_audio)

    def test_bandpass_filter_returns_float32(self, clean_audio, test_sr):
        from echofield.pipeline.spectral_gate import apply_bandpass_filter
        y_filt = apply_bandpass_filter(clean_audio, test_sr)
        assert y_filt.dtype == np.float32

    def test_bandpass_filter_attenuates_high_freq(self, test_sr):
        """Frequencies above the cutoff should be substantially attenuated.

        A 5th-order Butterworth bandpass (applied forward-backward) produces
        ~80-90 % attenuation for a sine well above the upper cutoff.
        We conservatively require ≥ 70 % energy reduction.
        """
        from echofield.pipeline.spectral_gate import apply_bandpass_filter
        # Generate a 6 kHz sine — 5x above the 1200 Hz cutoff
        t = np.linspace(0, 1.0, test_sr, endpoint=False)
        high_freq = np.sin(2 * np.pi * 6000 * t).astype(np.float32)
        filtered = apply_bandpass_filter(high_freq, test_sr, low_hz=8, high_hz=1200)
        rms_before = float(np.sqrt(np.mean(high_freq ** 2)))
        rms_after = float(np.sqrt(np.mean(filtered ** 2)))
        # After filtering, RMS should drop by at least 70%
        assert rms_after < rms_before * 0.30

    def test_denoise_recording_output_length(self, noisy_wav_path, test_sr):
        from echofield.pipeline.ingestion import load_audio
        from echofield.pipeline.spectral_gate import denoise_recording
        y, sr = load_audio(noisy_wav_path, target_sr=test_sr)
        y_clean = denoise_recording(y, sr, aggressiveness=1.0)
        assert len(y_clean) == len(y)

    def test_denoise_reduces_high_freq_noise(self, test_sr):
        """Denoising should reduce RMS of broadband noise signal."""
        from echofield.pipeline.spectral_gate import denoise_recording
        rng = np.random.default_rng(99)
        pure_noise = rng.standard_normal(test_sr * 2).astype(np.float32) * 0.3
        cleaned = denoise_recording(pure_noise, test_sr, aggressiveness=1.0)
        rms_before = float(np.sqrt(np.mean(pure_noise ** 2)))
        rms_after = float(np.sqrt(np.mean(cleaned ** 2)))
        assert rms_after < rms_before


class TestEstimateNoiseProfile:

    def test_returns_ndarray(self, noisy_audio, test_sr):
        from echofield.pipeline.spectral_gate import estimate_noise_profile
        clip = estimate_noise_profile(noisy_audio, test_sr, noise_duration_s=0.5)
        assert isinstance(clip, np.ndarray)

    def test_clip_length_bounded_by_signal(self, noisy_audio, test_sr):
        from echofield.pipeline.spectral_gate import estimate_noise_profile
        # Request more than total duration → should return whole signal
        clip = estimate_noise_profile(noisy_audio, test_sr, noise_duration_s=999)
        assert len(clip) == len(noisy_audio)

    def test_clip_length_correct(self, noisy_audio, test_sr):
        from echofield.pipeline.spectral_gate import estimate_noise_profile
        clip = estimate_noise_profile(noisy_audio, test_sr, noise_duration_s=0.5)
        expected = int(0.5 * test_sr)
        assert len(clip) == expected


# ---------------------------------------------------------------------------
# 4. Quality assessment
# ---------------------------------------------------------------------------

class TestComputeSNR:

    def test_returns_finite_float(self, clean_audio, test_sr):
        from echofield.pipeline.quality_check import compute_snr
        snr = compute_snr(clean_audio, test_sr)
        assert isinstance(snr, float)
        assert math.isfinite(snr)

    def test_silent_signal_returns_zero(self, test_sr):
        from echofield.pipeline.quality_check import compute_snr
        silence = np.zeros(test_sr * 2, dtype=np.float32)
        snr = compute_snr(silence, test_sr)
        assert snr == pytest.approx(0.0)

    def test_bursty_signal_higher_snr_than_uniform_noise(self, test_sr):
        """The SNR heuristic splits frames by median RMS.

        A signal with clearly distinct high-energy bursts vs. a quiet floor
        (high frame-energy variance) should score higher than flat white noise
        (low frame-energy variance).
        """
        from echofield.pipeline.quality_check import compute_snr
        rng = np.random.default_rng(11)

        # Flat white noise — uniform energy, SNR ≈ 0
        uniform_noise = rng.standard_normal(test_sr * 2).astype(np.float32) * 0.05

        # Burst signal: loud sine for 1 s, near-silence for 1 s
        t = np.linspace(0, 1.0, test_sr, endpoint=False)
        burst = np.concatenate([
            np.sin(2 * np.pi * 100 * t).astype(np.float32),   # loud 1 s
            np.zeros(test_sr, dtype=np.float32) + 1e-4,        # quiet 1 s
        ])

        snr_burst = compute_snr(burst, test_sr)
        snr_uniform = compute_snr(uniform_noise, test_sr)
        assert snr_burst > snr_uniform


class TestSNRImprovement:

    def test_returns_required_keys(self, clean_audio, noisy_audio, test_sr):
        from echofield.pipeline.quality_check import compute_snr_improvement
        result = compute_snr_improvement(noisy_audio, clean_audio, test_sr)
        for key in ("snr_before", "snr_after", "improvement_db"):
            assert key in result

    def test_values_are_finite(self, clean_audio, noisy_audio, test_sr):
        from echofield.pipeline.quality_check import compute_snr_improvement
        result = compute_snr_improvement(noisy_audio, clean_audio, test_sr)
        assert math.isfinite(result["snr_before"])
        assert math.isfinite(result["snr_after"])
        assert math.isfinite(result["improvement_db"])

    def test_improvement_is_snr_after_minus_before(self, clean_audio, noisy_audio, test_sr):
        from echofield.pipeline.quality_check import compute_snr_improvement
        result = compute_snr_improvement(noisy_audio, clean_audio, test_sr)
        expected = round(result["snr_after"] - result["snr_before"], 2)
        assert result["improvement_db"] == pytest.approx(expected, abs=0.01)


class TestEnergyPreservation:

    def test_identical_signals_preserve_fully(self, clean_audio, test_sr):
        from echofield.pipeline.quality_check import compute_energy_preservation
        ratio = compute_energy_preservation(clean_audio, clean_audio, test_sr)
        assert ratio == pytest.approx(1.0, abs=1e-3)

    def test_silent_output_returns_zero(self, clean_audio, test_sr):
        from echofield.pipeline.quality_check import compute_energy_preservation
        silent = np.zeros_like(clean_audio)
        ratio = compute_energy_preservation(clean_audio, silent, test_sr)
        assert ratio == pytest.approx(0.0, abs=1e-3)

    def test_ratio_between_zero_and_one(self, clean_audio, noisy_audio, test_sr):
        from echofield.pipeline.quality_check import compute_energy_preservation
        ratio = compute_energy_preservation(clean_audio, noisy_audio, test_sr)
        assert 0.0 <= ratio <= 1.0


class TestAssessQuality:

    def test_returns_required_keys(self, noisy_audio, clean_audio, test_sr):
        from echofield.pipeline.quality_check import assess_quality
        result = assess_quality(noisy_audio, clean_audio, test_sr)
        for key in (
            "snr_before", "snr_after", "snr_improvement",
            "energy_preservation", "spectral_distortion", "quality_score",
        ):
            assert key in result

    def test_quality_score_in_range(self, noisy_audio, clean_audio, test_sr):
        from echofield.pipeline.quality_check import assess_quality
        result = assess_quality(noisy_audio, clean_audio, test_sr)
        assert 0.0 <= result["quality_score"] <= 100.0

    def test_energy_preservation_in_range(self, noisy_audio, clean_audio, test_sr):
        from echofield.pipeline.quality_check import assess_quality
        result = assess_quality(noisy_audio, clean_audio, test_sr)
        assert 0.0 <= result["energy_preservation"] <= 1.0

    def test_spectral_distortion_non_negative(self, noisy_audio, clean_audio, test_sr):
        from echofield.pipeline.quality_check import assess_quality
        result = assess_quality(noisy_audio, clean_audio, test_sr)
        assert result["spectral_distortion"] >= 0.0

    def test_identical_signals_max_preservation(self, clean_audio, test_sr):
        from echofield.pipeline.quality_check import assess_quality
        result = assess_quality(clean_audio, clean_audio, test_sr)
        assert result["energy_preservation"] == pytest.approx(1.0, abs=1e-3)
        assert result["spectral_distortion"] == pytest.approx(0.0, abs=1e-3)


# ---------------------------------------------------------------------------
# 5. Hybrid pipeline end-to-end
# ---------------------------------------------------------------------------

class TestHybridPipeline:
    """ProcessingPipeline.process_recording — smoke test with a short WAV."""

    @pytest.fixture
    def tiny_wav(self, tmp_path, test_sr):
        """0.5-second WAV at 8 kHz — minimal but valid."""
        import soundfile as sf
        sr = 8000
        t = np.linspace(0, 0.5, sr // 2, endpoint=False)
        y = (0.3 * np.sin(2 * np.pi * 20 * t)).astype(np.float32)
        path = tmp_path / "tiny.wav"
        sf.write(str(path), y, sr)
        return str(path)

    @pytest.fixture
    def pipeline_dirs(self, tmp_path):
        out = tmp_path / "processed"
        spec = tmp_path / "spectrograms"
        cache = tmp_path / "cache"
        out.mkdir(); spec.mkdir(); cache.mkdir()
        return str(out), str(spec), str(cache)

    def test_pipeline_returns_complete_status(self, tiny_wav, pipeline_dirs):
        from echofield.pipeline.hybrid_pipeline import ProcessingPipeline
        from echofield.pipeline.cache_manager import CacheManager

        out_dir, spec_dir, cache_dir = pipeline_dirs
        cache = CacheManager(cache_dir)
        settings = {
            "target_sr": 8000,
            "n_fft": 512,
            "hop_length": 128,
            "aggressiveness": 1.0,
            "freq_max": 500,
        }
        pipeline = ProcessingPipeline(settings, cache)
        result = asyncio.run(
            pipeline.process_recording(
                recording_id="test-001",
                audio_path=tiny_wav,
                output_dir=out_dir,
                spectrogram_dir=spec_dir,
            )
        )
        assert result["status"] == "complete"

    def test_pipeline_result_has_required_keys(self, tiny_wav, pipeline_dirs):
        from echofield.pipeline.hybrid_pipeline import ProcessingPipeline
        from echofield.pipeline.cache_manager import CacheManager

        out_dir, spec_dir, cache_dir = pipeline_dirs
        cache = CacheManager(cache_dir)
        pipeline = ProcessingPipeline(
            {"target_sr": 8000, "n_fft": 512, "hop_length": 128}, cache
        )
        result = asyncio.run(
            pipeline.process_recording("test-002", tiny_wav, out_dir, spec_dir)
        )
        for key in (
            "recording_id", "status", "quality_metrics",
            "processing_time_s", "output_audio_path",
            "spectrogram_before_path", "spectrogram_after_path",
        ):
            assert key in result

    def test_pipeline_writes_cleaned_audio(self, tiny_wav, pipeline_dirs):
        from echofield.pipeline.hybrid_pipeline import ProcessingPipeline
        from echofield.pipeline.cache_manager import CacheManager

        out_dir, spec_dir, cache_dir = pipeline_dirs
        cache = CacheManager(cache_dir)
        pipeline = ProcessingPipeline(
            {"target_sr": 8000, "n_fft": 512, "hop_length": 128}, cache
        )
        result = asyncio.run(
            pipeline.process_recording("test-003", tiny_wav, out_dir, spec_dir)
        )
        assert os.path.isfile(result["output_audio_path"])
        assert os.path.getsize(result["output_audio_path"]) > 0

    def test_pipeline_writes_spectrograms(self, tiny_wav, pipeline_dirs):
        from echofield.pipeline.hybrid_pipeline import ProcessingPipeline
        from echofield.pipeline.cache_manager import CacheManager

        out_dir, spec_dir, cache_dir = pipeline_dirs
        cache = CacheManager(cache_dir)
        pipeline = ProcessingPipeline(
            {"target_sr": 8000, "n_fft": 512, "hop_length": 128}, cache
        )
        result = asyncio.run(
            pipeline.process_recording("test-004", tiny_wav, out_dir, spec_dir)
        )
        assert os.path.isfile(result["spectrogram_before_path"])
        assert os.path.isfile(result["spectrogram_after_path"])

    def test_pipeline_saves_quality_metrics_to_cache(self, tiny_wav, pipeline_dirs):
        from echofield.pipeline.hybrid_pipeline import ProcessingPipeline
        from echofield.pipeline.cache_manager import CacheManager

        out_dir, spec_dir, cache_dir = pipeline_dirs
        cache = CacheManager(cache_dir)
        pipeline = ProcessingPipeline(
            {"target_sr": 8000, "n_fft": 512, "hop_length": 128}, cache
        )
        asyncio.run(
            pipeline.process_recording("test-005", tiny_wav, out_dir, spec_dir)
        )
        cached = cache.get_metrics("test-005")
        assert cached is not None
        assert "quality_score" in cached

    def test_pipeline_invalid_file_raises(self, pipeline_dirs):
        from echofield.pipeline.hybrid_pipeline import ProcessingPipeline
        from echofield.pipeline.cache_manager import CacheManager

        out_dir, spec_dir, cache_dir = pipeline_dirs
        cache = CacheManager(cache_dir)
        pipeline = ProcessingPipeline({}, cache)
        with pytest.raises((ValueError, Exception)):
            asyncio.run(
                pipeline.process_recording(
                    "test-bad", "/no/such/file.wav", out_dir, spec_dir
                )
            )

    def test_progress_callback_is_called(self, tiny_wav, pipeline_dirs):
        from echofield.pipeline.hybrid_pipeline import ProcessingPipeline
        from echofield.pipeline.cache_manager import CacheManager

        out_dir, spec_dir, cache_dir = pipeline_dirs
        cache = CacheManager(cache_dir)
        pipeline = ProcessingPipeline(
            {"target_sr": 8000, "n_fft": 512, "hop_length": 128}, cache
        )
        stages: list[str] = []

        def _cb(stage: str, pct: int) -> None:
            stages.append(stage)

        asyncio.run(
            pipeline.process_recording(
                "test-006", tiny_wav, out_dir, spec_dir,
                progress_callback=_cb,
            )
        )
        assert len(stages) > 0
        assert "complete" in stages


# ---------------------------------------------------------------------------
# 6. Cache manager
# ---------------------------------------------------------------------------

class TestCacheManager:

    def test_save_and_retrieve_metrics(self, tmp_path):
        from echofield.pipeline.cache_manager import CacheManager
        cache = CacheManager(str(tmp_path / "cache"))
        metrics = {"snr_before": 5.0, "quality_score": 72.4}
        cache.save_metrics("rec-123", metrics)
        loaded = cache.get_metrics("rec-123")
        assert loaded == metrics

    def test_missing_metrics_returns_none(self, tmp_path):
        from echofield.pipeline.cache_manager import CacheManager
        cache = CacheManager(str(tmp_path / "cache"))
        assert cache.get_metrics("nonexistent") is None

    def test_missing_spectrogram_returns_none(self, tmp_path):
        from echofield.pipeline.cache_manager import CacheManager
        cache = CacheManager(str(tmp_path / "cache"))
        assert cache.get_spectrogram("nonexistent") is None

    def test_invalidate_removes_files(self, tmp_path):
        from echofield.pipeline.cache_manager import CacheManager
        cache = CacheManager(str(tmp_path / "cache"))
        cache.save_metrics("rec-del", {"quality_score": 50})
        assert cache.get_metrics("rec-del") is not None
        cache.invalidate("rec-del")
        assert cache.get_metrics("rec-del") is None

    def test_stats_reflect_saved_files(self, tmp_path):
        from echofield.pipeline.cache_manager import CacheManager
        cache = CacheManager(str(tmp_path / "cache"))
        cache.save_metrics("rec-a", {"quality_score": 80})
        cache.save_metrics("rec-b", {"quality_score": 60})
        stats = cache.get_stats()
        assert stats["file_count"] == 2
        assert stats["total_size_mb"] >= 0
