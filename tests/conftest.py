from __future__ import annotations

import importlib
from pathlib import Path
from typing import Iterator

import numpy as np
import pytest
import soundfile as sf
from fastapi.testclient import TestClient

from echofield.config import reset_settings
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


@pytest.fixture
def real_audio_source_path() -> Path:
    return Path(__file__).resolve().parents[1] / "data" / "audio-files" / "2000-23_vehicle_noise_2.wav"


@pytest.fixture
def sample_wav_path(tmp_path: Path, real_audio_source_path: Path) -> Path:
    output_path = tmp_path / "sample.wav"
    with sf.SoundFile(real_audio_source_path) as source:
        sr = source.samplerate
        frames = min(sr * 2, len(source))
        waveform = source.read(frames=frames, dtype="float32", always_2d=False)
    sf.write(output_path, waveform, sr)
    return output_path


@pytest.fixture
def sample_waveform(sample_wav_path: Path) -> tuple[np.ndarray, int]:
    waveform, sr = sf.read(sample_wav_path, dtype="float32")
    if waveform.ndim > 1:
        waveform = waveform.mean(axis=1)
    return waveform.astype(np.float32), int(sr)


@pytest.fixture
def invalid_audio_path(tmp_path: Path) -> Path:
    output_path = tmp_path / "invalid.txt"
    output_path.write_text("not audio", encoding="utf-8")
    return output_path


@pytest.fixture
def dummy_settings() -> DummySettings:
    return DummySettings()


@pytest.fixture
def cache_manager(tmp_path: Path) -> CacheManager:
    return CacheManager(str(tmp_path / "cache"), max_size_mb=32)


@pytest.fixture
def pipeline(dummy_settings: DummySettings, cache_manager: CacheManager) -> ProcessingPipeline:
    return ProcessingPipeline(dummy_settings, cache_manager)


def _reload_server(monkeypatch: pytest.MonkeyPatch, tmp_path: Path):
    config_path = Path(__file__).resolve().parents[1] / "config" / "echofield.config.yml"
    recordings_dir = tmp_path / "recordings"
    processed_dir = tmp_path / "processed"
    spectrograms_dir = tmp_path / "spectrograms"
    cache_dir = tmp_path / "cache"
    metadata_file = tmp_path / "metadata.csv"

    metadata_file.write_text(
        "call_id,filename,animal_id,location,date,start_sec,end_sec,noise_type_ref,species\n",
        encoding="utf-8",
    )

    monkeypatch.setenv("ECHOFIELD_AUDIO_DIR", str(recordings_dir))
    monkeypatch.setenv("ECHOFIELD_PROCESSED_DIR", str(processed_dir))
    monkeypatch.setenv("ECHOFIELD_SPECTROGRAM_DIR", str(spectrograms_dir))
    monkeypatch.setenv("ECHOFIELD_CACHE_DIR", str(cache_dir))
    monkeypatch.setenv("ECHOFIELD_METADATA_FILE", str(metadata_file))
    monkeypatch.setenv("ECHOFIELD_CONFIG_FILE", str(config_path))
    monkeypatch.setenv("ECHOFIELD_DEMO_MODE", "false")

    reset_settings()
    import echofield.server as server_module

    return importlib.reload(server_module)


@pytest.fixture
def server_module(monkeypatch: pytest.MonkeyPatch, tmp_path: Path):
    return _reload_server(monkeypatch, tmp_path)


@pytest.fixture
def client(server_module) -> Iterator[TestClient]:
    with TestClient(server_module.app) as test_client:
        yield test_client

