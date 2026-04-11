from __future__ import annotations

import asyncio
from pathlib import Path

import numpy as np
import soundfile as sf

from echofield.pipeline.cache_manager import CacheManager
from echofield.pipeline.hybrid_pipeline import ProcessingPipeline


class DummySettings:
    SAMPLE_RATE = 44_100
    SEGMENT_SECONDS = 60
    SEGMENT_OVERLAP_RATIO = 0.5
    SPECTROGRAM_N_FFT = 2048
    SPECTROGRAM_HOP_LENGTH = 512
    SPECTROGRAM_FREQ_MAX = 1000
    DENOISE_METHOD = "hybrid"
    MODEL_PATH = ""


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

