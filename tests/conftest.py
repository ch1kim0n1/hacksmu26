"""Shared pytest fixtures for EchoField tests.

Provides:
  - Synthetic audio arrays (session-scoped — created once per test run)
  - WAV file paths written to pytest's tmp_path (function-scoped — isolated)
  - A FastAPI TestClient with a fresh in-memory store per test (api_client)
"""

from __future__ import annotations

import io
import os
import struct
import wave

import numpy as np
import pytest
import soundfile as sf

# ---------------------------------------------------------------------------
# Audio constants — keep SR low so tests stay fast
# ---------------------------------------------------------------------------
TEST_SR = 16_000       # 16 kHz — fast but realistic
DURATION_S = 2.0       # 2 s clips
SIGNAL_HZ = 20.0       # 20 Hz sine — elephant-like low-frequency call


# ---------------------------------------------------------------------------
# Session-scoped arrays
# ---------------------------------------------------------------------------

@pytest.fixture(scope="session")
def test_sr() -> int:
    return TEST_SR


@pytest.fixture(scope="session")
def clean_audio(test_sr) -> np.ndarray:
    """Pure 20 Hz sine wave (no noise)."""
    t = np.linspace(0, DURATION_S, int(DURATION_S * test_sr), endpoint=False)
    y = 0.5 * np.sin(2 * np.pi * SIGNAL_HZ * t).astype(np.float32)
    return y


@pytest.fixture(scope="session")
def noisy_audio(clean_audio) -> np.ndarray:
    """Sine wave with heavy additive white noise (SNR intentionally low)."""
    rng = np.random.default_rng(42)
    noise = rng.standard_normal(len(clean_audio)).astype(np.float32) * 0.4
    return (clean_audio + noise).astype(np.float32)


@pytest.fixture(scope="session")
def long_audio(test_sr) -> np.ndarray:
    """5-minute audio array (enough to trigger segmentation at 120 s max)."""
    rng = np.random.default_rng(7)
    return rng.standard_normal(int(300 * test_sr)).astype(np.float32) * 0.1


# ---------------------------------------------------------------------------
# Function-scoped WAV file fixtures
# ---------------------------------------------------------------------------

@pytest.fixture
def clean_wav_path(tmp_path, clean_audio, test_sr) -> str:
    """Write the clean sine wave to a temp .wav and return the path."""
    path = tmp_path / "clean.wav"
    sf.write(str(path), clean_audio, test_sr)
    return str(path)


@pytest.fixture
def noisy_wav_path(tmp_path, noisy_audio, test_sr) -> str:
    """Write the noisy audio to a temp .wav and return the path."""
    path = tmp_path / "noisy.wav"
    sf.write(str(path), noisy_audio, test_sr)
    return str(path)


@pytest.fixture
def long_wav_path(tmp_path, long_audio, test_sr) -> str:
    path = tmp_path / "long.wav"
    sf.write(str(path), long_audio, test_sr)
    return str(path)


def _make_wav_bytes(sr: int = TEST_SR, duration_s: float = 0.5) -> bytes:
    """Return raw WAV bytes for an upload test (no soundfile dependency)."""
    n_samples = int(sr * duration_s)
    t = np.linspace(0, duration_s, n_samples, endpoint=False)
    samples = (0.3 * np.sin(2 * np.pi * 440 * t) * 32767).astype(np.int16)

    buf = io.BytesIO()
    with wave.open(buf, "wb") as wf:
        wf.setnchannels(1)
        wf.setsampwidth(2)
        wf.setframerate(sr)
        wf.writeframes(samples.tobytes())
    return buf.getvalue()


@pytest.fixture
def wav_bytes() -> bytes:
    """Raw WAV file bytes suitable for multipart upload tests."""
    return _make_wav_bytes()


# ---------------------------------------------------------------------------
# Settings reset helper
# ---------------------------------------------------------------------------

@pytest.fixture(autouse=False)
def reset_settings():
    """Reset the singleton settings so env-var patches take effect."""
    from echofield import config
    original = config._settings_instance
    config._settings_instance = None
    yield
    config._settings_instance = original


# ---------------------------------------------------------------------------
# FastAPI TestClient
# ---------------------------------------------------------------------------

@pytest.fixture
def api_client(tmp_path, reset_settings, monkeypatch):
    """TestClient wired to isolated temp directories.

    Each test that uses this fixture gets:
      - A fresh RecordingStore (no pre-loaded data)
      - A fresh CallDatabase (no pre-loaded calls)
      - Temp directories so the real ./data/ tree is never touched
    """
    monkeypatch.setenv("ECHOFIELD_AUDIO_DIR", str(tmp_path / "audio"))
    monkeypatch.setenv("ECHOFIELD_PROCESSED_DIR", str(tmp_path / "processed"))
    monkeypatch.setenv("ECHOFIELD_SPECTROGRAM_DIR", str(tmp_path / "spectrograms"))
    monkeypatch.setenv("ECHOFIELD_METADATA_FILE", str(tmp_path / "metadata.csv"))
    monkeypatch.setenv("ECHOFIELD_CALLS_FILE", str(tmp_path / "calls.csv"))

    # Re-import AFTER env vars are set so the module-level _settings call
    # (used for CORS middleware) picks up the patched values.
    from echofield import config
    config._settings_instance = None

    from echofield.server import app
    from fastapi.testclient import TestClient

    with TestClient(app, raise_server_exceptions=True) as client:
        yield client
