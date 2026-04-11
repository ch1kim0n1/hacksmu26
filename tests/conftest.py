from __future__ import annotations

import importlib
from pathlib import Path

import numpy as np
import pytest
import soundfile as sf
from fastapi.testclient import TestClient

from echofield.config import reset_settings


@pytest.fixture
def sample_wav_file(tmp_path: Path) -> Path:
    sr = 44_100
    t = np.linspace(0, 1, sr, endpoint=False)
    waveform = (0.2 * np.sin(2 * np.pi * 18 * t)).astype(np.float32)
    path = tmp_path / "sample.wav"
    sf.write(path, waveform, sr)
    return path


@pytest.fixture
def loaded_server(monkeypatch: pytest.MonkeyPatch, tmp_path: Path):
    config_path = Path(__file__).resolve().parents[1] / "config" / "echofield.config.yml"
    monkeypatch.setenv("ECHOFIELD_AUDIO_DIR", str(tmp_path / "recordings"))
    monkeypatch.setenv("ECHOFIELD_PROCESSED_DIR", str(tmp_path / "processed"))
    monkeypatch.setenv("ECHOFIELD_SPECTROGRAM_DIR", str(tmp_path / "spectrograms"))
    monkeypatch.setenv("ECHOFIELD_CACHE_DIR", str(tmp_path / "cache"))
    monkeypatch.setenv("ECHOFIELD_CATALOG_FILE", str(tmp_path / "cache" / "recording_catalog.json"))
    monkeypatch.setenv("ECHOFIELD_METADATA_FILE", str(tmp_path / "metadata.csv"))
    monkeypatch.setenv("ECHOFIELD_CONFIG_FILE", str(config_path))
    monkeypatch.setenv("ECHOFIELD_DEMO_MODE", "false")

    reset_settings()
    import echofield.server as server_module

    return importlib.reload(server_module)


@pytest.fixture
def test_client(loaded_server):
    with TestClient(loaded_server.app) as client:
        yield client
