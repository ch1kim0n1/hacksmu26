"""Tests for the real-time live recording pipeline.

These tests are written first (TDD) and cover:
- Chunk denoising correctness
- Output length equals input length for all chunk sizes
- SNR improvement after denoising
- Noise profile bootstrapping from the first chunk only
- 50% overlap-save: no energy spike at chunk boundaries
- Per-chunk metric fields (types, ranges)
- Session lifecycle: total_samples, finalize, reset
- WebSocket /ws/record/{session_id} endpoint:
  - start / binary-chunk / stop lifecycle
  - CHUNK_PROCESSED message structure
  - RECORDING_COMPLETE message contents
  - WAV file saved to processed dir on stop
  - RecordingStore status transitions
  - Session cleanup on disconnect without stop
"""

from __future__ import annotations

import numpy as np
import pytest

# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

SR = 44_100
CHUNK_N = SR  # 1-second chunks


def _sine_chunk(
    n: int = CHUNK_N,
    freq: float = 80.0,
    amplitude: float = 0.5,
    sr: int = SR,
    seed: int = 0,
) -> np.ndarray:
    """Return a float32 array: a pure sine at *freq* Hz plus Gaussian noise."""
    rng = np.random.default_rng(seed)
    t = np.linspace(0.0, n / sr, n, endpoint=False, dtype=np.float64)
    signal = amplitude * np.sin(2.0 * np.pi * freq * t)
    noise = 0.25 * rng.standard_normal(n)
    return (signal + noise).astype(np.float32)


def _noise_chunk(n: int = CHUNK_N, amplitude: float = 0.2, seed: int = 1) -> np.ndarray:
    """Return a float32 array of pure broadband Gaussian noise."""
    rng = np.random.default_rng(seed)
    return (amplitude * rng.standard_normal(n)).astype(np.float32)


def _as_bytes(arr: np.ndarray) -> bytes:
    return arr.astype(np.float32).tobytes()


def _from_bytes(raw: bytes) -> np.ndarray:
    return np.frombuffer(raw, dtype=np.float32)


# ---------------------------------------------------------------------------
# Import target — will fail until live_pipeline.py exists
# ---------------------------------------------------------------------------

from echofield.pipeline.live_pipeline import ChunkResult, LiveRecordingSession  # noqa: E402


# ---------------------------------------------------------------------------
# Construction
# ---------------------------------------------------------------------------


class TestConstruction:
    def test_default_attributes(self) -> None:
        session = LiveRecordingSession(session_id="s0")
        assert session.session_id == "s0"
        assert session.sr == 44_100
        assert session._noise_profile is None
        assert session._accumulated == []
        assert session.total_samples == 0

    def test_custom_sample_rate(self) -> None:
        session = LiveRecordingSession(session_id="s1", sample_rate=16_000)
        assert session.sr == 16_000

    def test_custom_crossfade(self) -> None:
        session = LiveRecordingSession(session_id="s2", crossfade_ms=100.0)
        # 100 ms at 44100 Hz → 4410 samples
        assert session._crossfade_samples == 4_410


# ---------------------------------------------------------------------------
# Output length
# ---------------------------------------------------------------------------


class TestOutputLength:
    def test_output_same_length_as_input(self) -> None:
        session = LiveRecordingSession(session_id="len0")
        chunk = _sine_chunk()
        result = session.process_chunk(_as_bytes(chunk))
        out = _from_bytes(result.cleaned_bytes)
        assert len(out) == CHUNK_N

    def test_output_same_length_on_second_chunk(self) -> None:
        """Overlap-save must not change the output length on subsequent calls."""
        session = LiveRecordingSession(session_id="len1")
        for i in range(3):
            chunk = _sine_chunk(seed=i)
            result = session.process_chunk(_as_bytes(chunk))
            out = _from_bytes(result.cleaned_bytes)
            assert len(out) == CHUNK_N, f"chunk {i}: expected {CHUNK_N}, got {len(out)}"

    @pytest.mark.parametrize("n", [4_096, 8_192, 22_050, SR])
    def test_output_same_length_various_sizes(self, n: int) -> None:
        session = LiveRecordingSession(session_id=f"len-{n}")
        arr = _noise_chunk(n=n, seed=n)
        result = session.process_chunk(_as_bytes(arr))
        out = _from_bytes(result.cleaned_bytes)
        assert len(out) == n

    def test_empty_chunk_returns_empty_bytes(self) -> None:
        session = LiveRecordingSession(session_id="len-empty")
        result = session.process_chunk(b"")
        assert result.cleaned_bytes == b""


# ---------------------------------------------------------------------------
# Noise profile bootstrap
# ---------------------------------------------------------------------------


class TestNoiseProfile:
    def test_noise_profile_set_after_first_chunk(self) -> None:
        session = LiveRecordingSession(session_id="np0")
        assert session._noise_profile is None
        session.process_chunk(_as_bytes(_sine_chunk()))
        assert session._noise_profile is not None

    def test_noise_profile_is_float32_ndarray(self) -> None:
        session = LiveRecordingSession(session_id="np1")
        session.process_chunk(_as_bytes(_sine_chunk()))
        assert isinstance(session._noise_profile, np.ndarray)
        assert session._noise_profile.dtype == np.float32

    def test_noise_profile_length_is_approx_half_second(self) -> None:
        """estimate_noise_profile draws ~0.5 s of audio for the noise clip."""
        session = LiveRecordingSession(session_id="np2")
        session.process_chunk(_as_bytes(_sine_chunk()))
        # 0.5 s at 44100 Hz = 22050 samples; allow some rounding
        assert 1 <= len(session._noise_profile) <= SR

    def test_noise_profile_unchanged_on_second_chunk(self) -> None:
        """Profile is bootstrapped once from the first chunk and then frozen."""
        session = LiveRecordingSession(session_id="np3")
        session.process_chunk(_as_bytes(_sine_chunk(seed=0)))
        profile_after_first = session._noise_profile.copy()

        session.process_chunk(_as_bytes(_sine_chunk(seed=1)))
        np.testing.assert_array_equal(session._noise_profile, profile_after_first)

    def test_noise_profile_unchanged_after_many_chunks(self) -> None:
        session = LiveRecordingSession(session_id="np4")
        session.process_chunk(_as_bytes(_sine_chunk(seed=0)))
        frozen = session._noise_profile.copy()
        for i in range(1, 5):
            session.process_chunk(_as_bytes(_sine_chunk(seed=i)))
        np.testing.assert_array_equal(session._noise_profile, frozen)


# ---------------------------------------------------------------------------
# SNR improvement
# ---------------------------------------------------------------------------


class TestSNRImprovement:
    def test_snr_after_not_worse_than_before(self) -> None:
        """Spectral gating must not make SNR significantly worse."""
        session = LiveRecordingSession(session_id="snr0")
        chunk = _sine_chunk(amplitude=0.5, seed=42)
        result = session.process_chunk(_as_bytes(chunk))
        # Allow 2 dB degradation tolerance for the estimator heuristic
        assert result.snr_after >= result.snr_before - 2.0, (
            f"SNR degraded: before={result.snr_before:.2f}, after={result.snr_after:.2f}"
        )

    def test_snr_values_are_finite(self) -> None:
        session = LiveRecordingSession(session_id="snr1")
        result = session.process_chunk(_as_bytes(_sine_chunk()))
        assert np.isfinite(result.snr_before)
        assert np.isfinite(result.snr_after)

    def test_snr_values_are_floats(self) -> None:
        session = LiveRecordingSession(session_id="snr2")
        result = session.process_chunk(_as_bytes(_sine_chunk()))
        assert isinstance(result.snr_before, float)
        assert isinstance(result.snr_after, float)


# ---------------------------------------------------------------------------
# Chunk result fields
# ---------------------------------------------------------------------------


class TestChunkResultFields:
    @pytest.fixture(autouse=True)
    def _result(self) -> None:
        session = LiveRecordingSession(session_id="fields0")
        self.result: ChunkResult = session.process_chunk(_as_bytes(_sine_chunk()))

    def test_cleaned_bytes_is_bytes(self) -> None:
        assert isinstance(self.result.cleaned_bytes, bytes)

    def test_spectrogram_columns_is_2d_float32(self) -> None:
        spec = self.result.spectrogram_columns
        assert isinstance(spec, np.ndarray)
        assert spec.ndim == 2
        assert spec.dtype == np.float32

    def test_spectrogram_columns_has_nonzero_dimensions(self) -> None:
        spec = self.result.spectrogram_columns
        assert spec.shape[0] > 0, "expected frequency bins > 0"
        assert spec.shape[1] > 0, "expected time frames > 0"

    def test_noise_type_is_valid_string(self) -> None:
        valid = {"airplane", "car", "generator", "wind", "other"}
        assert self.result.noise_type in valid

    def test_confidence_in_range(self) -> None:
        assert 0.0 <= self.result.confidence <= 1.0

    def test_confidence_is_float(self) -> None:
        assert isinstance(self.result.confidence, float)

    def test_snr_before_is_float(self) -> None:
        assert isinstance(self.result.snr_before, float)

    def test_snr_after_is_float(self) -> None:
        assert isinstance(self.result.snr_after, float)


# ---------------------------------------------------------------------------
# Output correctness
# ---------------------------------------------------------------------------


class TestOutputCorrectness:
    def test_output_is_finite(self) -> None:
        session = LiveRecordingSession(session_id="out0")
        for seed in range(4):
            result = session.process_chunk(_as_bytes(_sine_chunk(seed=seed)))
            out = _from_bytes(result.cleaned_bytes)
            assert np.all(np.isfinite(out)), f"non-finite output at chunk {seed}"

    def test_pure_noise_input_produces_finite_output(self) -> None:
        session = LiveRecordingSession(session_id="out1")
        result = session.process_chunk(_as_bytes(_noise_chunk()))
        out = _from_bytes(result.cleaned_bytes)
        assert len(out) == CHUNK_N
        assert np.all(np.isfinite(out))

    def test_output_dtype_is_float32(self) -> None:
        session = LiveRecordingSession(session_id="out2")
        result = session.process_chunk(_as_bytes(_sine_chunk()))
        out = _from_bytes(result.cleaned_bytes)
        assert out.dtype == np.float32


# ---------------------------------------------------------------------------
# Overlap / boundary smoothness
# ---------------------------------------------------------------------------


class TestOverlapHandling:
    def test_no_energy_spike_at_chunk_boundary(self) -> None:
        """
        Energy at the join between two consecutive chunks must not spike
        relative to the average energy of the assembled signal.
        The overlap-save technique provides spectral context across the
        chunk boundary; the Hann crossfade smooths amplitude transitions.
        """
        rng = np.random.default_rng(77)
        amplitude = 0.15
        session = LiveRecordingSession(session_id="overlap0")

        chunk1 = (amplitude * rng.standard_normal(CHUNK_N)).astype(np.float32)
        chunk2 = (amplitude * rng.standard_normal(CHUNK_N)).astype(np.float32)
        session.process_chunk(_as_bytes(chunk1))
        session.process_chunk(_as_bytes(chunk2))

        assembled = session.finalize()
        assert len(assembled) == 2 * CHUNK_N

        # Frame-level RMS around the boundary
        frame = SR // 50  # 20 ms frames
        boundary = CHUNK_N

        # Energy in the 200 ms before and after the boundary
        window = SR // 5  # 200 ms
        pre = assembled[max(0, boundary - window) : boundary]
        at_left = assembled[max(0, boundary - frame) : boundary]
        at_right = assembled[boundary : boundary + frame]
        post = assembled[boundary : boundary + window]

        def _rms(arr: np.ndarray) -> float:
            return float(np.sqrt(np.mean(arr ** 2))) if arr.size else 0.0

        avg_energy = max(_rms(pre), _rms(post), 1e-9)
        spike_left = _rms(at_left)
        spike_right = _rms(at_right)

        # Boundary frames must not be more than 20× the average neighbour energy
        assert spike_left <= avg_energy * 20.0, (
            f"Energy spike before boundary: rms={spike_left:.4f}, avg={avg_energy:.4f}"
        )
        assert spike_right <= avg_energy * 20.0, (
            f"Energy spike after boundary: rms={spike_right:.4f}, avg={avg_energy:.4f}"
        )

    def test_input_tail_set_after_first_chunk(self) -> None:
        """The 50% input tail must be stored for the next chunk's context."""
        session = LiveRecordingSession(session_id="overlap1")
        assert session._input_tail is None
        session.process_chunk(_as_bytes(_sine_chunk()))
        assert session._input_tail is not None

    def test_input_tail_length_is_half_chunk(self) -> None:
        session = LiveRecordingSession(session_id="overlap2")
        chunk = _sine_chunk()
        session.process_chunk(_as_bytes(chunk))
        assert len(session._input_tail) == CHUNK_N // 2

    def test_input_tail_updated_on_each_chunk(self) -> None:
        session = LiveRecordingSession(session_id="overlap3")
        session.process_chunk(_as_bytes(_sine_chunk(seed=0)))
        tail_after_first = session._input_tail.copy()

        session.process_chunk(_as_bytes(_sine_chunk(seed=1)))
        # Tail must have been updated (different data)
        assert not np.array_equal(session._input_tail, tail_after_first)


# ---------------------------------------------------------------------------
# Session lifecycle
# ---------------------------------------------------------------------------


class TestSessionLifecycle:
    def test_total_samples_zero_before_any_chunk(self) -> None:
        session = LiveRecordingSession(session_id="life0")
        assert session.total_samples == 0

    def test_total_samples_after_one_chunk(self) -> None:
        session = LiveRecordingSession(session_id="life1")
        session.process_chunk(_as_bytes(_sine_chunk()))
        assert session.total_samples == CHUNK_N

    def test_total_samples_accumulates(self) -> None:
        session = LiveRecordingSession(session_id="life2")
        n_chunks = 4
        for i in range(n_chunks):
            session.process_chunk(_as_bytes(_sine_chunk(seed=i)))
        assert session.total_samples == CHUNK_N * n_chunks

    def test_duration_s_property(self) -> None:
        session = LiveRecordingSession(session_id="life3")
        session.process_chunk(_as_bytes(_sine_chunk()))
        assert abs(session.duration_s - 1.0) < 0.01

    def test_finalize_empty_returns_empty_float32(self) -> None:
        session = LiveRecordingSession(session_id="life4")
        result = session.finalize()
        assert isinstance(result, np.ndarray)
        assert result.dtype == np.float32
        assert result.size == 0

    def test_finalize_single_chunk_length(self) -> None:
        session = LiveRecordingSession(session_id="life5")
        session.process_chunk(_as_bytes(_sine_chunk()))
        result = session.finalize()
        assert len(result) == CHUNK_N
        assert result.dtype == np.float32

    def test_finalize_multiple_chunks_concatenated_length(self) -> None:
        session = LiveRecordingSession(session_id="life6")
        n = 3
        for i in range(n):
            session.process_chunk(_as_bytes(_sine_chunk(seed=i)))
        result = session.finalize()
        assert len(result) == CHUNK_N * n

    def test_finalize_returns_float32_array(self) -> None:
        session = LiveRecordingSession(session_id="life7")
        session.process_chunk(_as_bytes(_sine_chunk()))
        session.process_chunk(_as_bytes(_sine_chunk(seed=1)))
        result = session.finalize()
        assert isinstance(result, np.ndarray)
        assert result.dtype == np.float32

    def test_finalize_output_is_finite(self) -> None:
        session = LiveRecordingSession(session_id="life8")
        for i in range(3):
            session.process_chunk(_as_bytes(_sine_chunk(seed=i)))
        result = session.finalize()
        assert np.all(np.isfinite(result))

    def test_reset_clears_state(self) -> None:
        session = LiveRecordingSession(session_id="life9")
        session.process_chunk(_as_bytes(_sine_chunk()))
        session.reset()
        assert session._noise_profile is None
        assert session._input_tail is None
        assert session._accumulated == []
        assert session.total_samples == 0


# ---------------------------------------------------------------------------
# WebSocket /ws/record/{session_id} — transport, session, persistence
# ---------------------------------------------------------------------------


import base64  # noqa: E402  (grouped here to keep WS tests self-contained)
import importlib
from pathlib import Path

import pytest
from fastapi.testclient import TestClient

from echofield.config import reset_settings


# ---------------------------------------------------------------------------
# Helpers shared by WS tests
# ---------------------------------------------------------------------------

_WS_CHUNK_N = 4096  # small chunk for speed in tests (~93 ms at 44100 Hz)


def _small_chunk_bytes() -> bytes:
    """Return a short float32 PCM bytes object suitable for WS tests."""
    rng = np.random.default_rng(7)
    arr = (0.1 * rng.standard_normal(_WS_CHUNK_N)).astype(np.float32)
    return arr.tobytes()


def _reload_server_for_ws(monkeypatch: pytest.MonkeyPatch, tmp_path: Path):
    """Reload the server module with isolated tmp dirs so each test is clean."""
    config_path = Path(__file__).resolve().parents[1] / "config" / "echofield.config.yml"
    monkeypatch.setenv("ECHOFIELD_AUDIO_DIR", str(tmp_path / "recordings"))
    monkeypatch.setenv("ECHOFIELD_PROCESSED_DIR", str(tmp_path / "processed"))
    monkeypatch.setenv("ECHOFIELD_SPECTROGRAM_DIR", str(tmp_path / "spectrograms"))
    monkeypatch.setenv("ECHOFIELD_CACHE_DIR", str(tmp_path / "cache"))
    monkeypatch.setenv(
        "ECHOFIELD_CATALOG_FILE", str(tmp_path / "cache" / "recording_catalog.json")
    )
    monkeypatch.setenv(
        "ECHOFIELD_DB_PATH", str(tmp_path / "cache" / "echofield.sqlite")
    )
    monkeypatch.setenv("ECHOFIELD_METADATA_FILE", str(tmp_path / "metadata.csv"))
    monkeypatch.setenv("ECHOFIELD_CONFIG_FILE", str(config_path))
    monkeypatch.setenv("ECHOFIELD_DEMO_MODE", "false")

    reset_settings()
    import echofield.server as server_module

    return importlib.reload(server_module)


# ---------------------------------------------------------------------------
# Test class
# ---------------------------------------------------------------------------


class TestWebSocketRecordEndpoint:
    """Integration tests for /ws/record/{session_id}.

    Each test reloads the server module to get a clean in-memory store and a
    fresh ``app.state.live_sessions`` dict.  The TestClient is entered inside
    each test so that the lifespan startup/shutdown runs per-test.
    """

    # ------------------------------------------------------------------
    # Connect → creates RecordingStore entry with status="recording"
    # ------------------------------------------------------------------

    def test_connect_creates_store_entry(
        self, monkeypatch: pytest.MonkeyPatch, tmp_path: Path
    ) -> None:
        srv = _reload_server_for_ws(monkeypatch, tmp_path)
        with TestClient(srv.app) as client:
            store = srv.app.state.store
            with client.websocket_connect("/ws/record/conn-1") as ws:
                ws.send_json({"action": "start", "sample_rate": SR})
                ws.receive_json()  # consume SESSION_STARTED
                recordings, total = store.list(limit=50)
            # After disconnect the entry should still exist (marked failed)
            _, total_after = store.list(limit=50)
            assert total_after >= 1

    def test_connect_sets_status_recording(
        self, monkeypatch: pytest.MonkeyPatch, tmp_path: Path
    ) -> None:
        srv = _reload_server_for_ws(monkeypatch, tmp_path)
        with TestClient(srv.app) as client:
            store = srv.app.state.store
            # Grab the entry while still connected (before stop/disconnect)
            with client.websocket_connect("/ws/record/conn-2") as ws:
                ws.send_json({"action": "start", "sample_rate": SR})
                ws.receive_json()  # SESSION_STARTED
                recordings, _ = store.list(limit=50)
                statuses = {r["status"] for r in recordings}
                # Status should be "recording" while session is active
                assert "recording" in statuses

    # ------------------------------------------------------------------
    # start action → SESSION_STARTED message
    # ------------------------------------------------------------------

    def test_start_returns_session_started(
        self, monkeypatch: pytest.MonkeyPatch, tmp_path: Path
    ) -> None:
        srv = _reload_server_for_ws(monkeypatch, tmp_path)
        with TestClient(srv.app) as client:
            with client.websocket_connect("/ws/record/start-1") as ws:
                ws.send_json({"action": "start", "sample_rate": SR})
                msg = ws.receive_json()
        assert msg["type"] == "SESSION_STARTED"

    def test_start_message_contains_recording_id(
        self, monkeypatch: pytest.MonkeyPatch, tmp_path: Path
    ) -> None:
        srv = _reload_server_for_ws(monkeypatch, tmp_path)
        with TestClient(srv.app) as client:
            with client.websocket_connect("/ws/record/start-2") as ws:
                ws.send_json({"action": "start", "sample_rate": SR})
                msg = ws.receive_json()
        assert "recording_id" in msg
        assert isinstance(msg["recording_id"], str)
        assert len(msg["recording_id"]) > 0

    def test_start_message_contains_session_id(
        self, monkeypatch: pytest.MonkeyPatch, tmp_path: Path
    ) -> None:
        srv = _reload_server_for_ws(monkeypatch, tmp_path)
        with TestClient(srv.app) as client:
            with client.websocket_connect("/ws/record/start-3") as ws:
                ws.send_json({"action": "start", "sample_rate": SR})
                msg = ws.receive_json()
        assert msg.get("session_id") == "start-3"

    # ------------------------------------------------------------------
    # Binary chunk → CHUNK_PROCESSED message
    # ------------------------------------------------------------------

    def test_binary_chunk_returns_chunk_processed(
        self, monkeypatch: pytest.MonkeyPatch, tmp_path: Path
    ) -> None:
        srv = _reload_server_for_ws(monkeypatch, tmp_path)
        with TestClient(srv.app) as client:
            with client.websocket_connect("/ws/record/chunk-1") as ws:
                ws.send_json({"action": "start", "sample_rate": SR})
                ws.receive_json()  # SESSION_STARTED
                ws.send_bytes(_small_chunk_bytes())
                msg = ws.receive_json()
        assert msg["type"] == "CHUNK_PROCESSED"

    def test_chunk_processed_has_chunk_index(
        self, monkeypatch: pytest.MonkeyPatch, tmp_path: Path
    ) -> None:
        srv = _reload_server_for_ws(monkeypatch, tmp_path)
        with TestClient(srv.app) as client:
            with client.websocket_connect("/ws/record/chunk-2") as ws:
                ws.send_json({"action": "start", "sample_rate": SR})
                ws.receive_json()
                ws.send_bytes(_small_chunk_bytes())
                msg = ws.receive_json()
        assert "chunk_index" in msg["data"]
        assert msg["data"]["chunk_index"] == 0

    def test_chunk_index_increments(
        self, monkeypatch: pytest.MonkeyPatch, tmp_path: Path
    ) -> None:
        srv = _reload_server_for_ws(monkeypatch, tmp_path)
        with TestClient(srv.app) as client:
            with client.websocket_connect("/ws/record/chunk-3") as ws:
                ws.send_json({"action": "start", "sample_rate": SR})
                ws.receive_json()
                indices = []
                for _ in range(3):
                    ws.send_bytes(_small_chunk_bytes())
                    m = ws.receive_json()
                    indices.append(m["data"]["chunk_index"])
        assert indices == [0, 1, 2]

    def test_chunk_processed_has_noise_type(
        self, monkeypatch: pytest.MonkeyPatch, tmp_path: Path
    ) -> None:
        srv = _reload_server_for_ws(monkeypatch, tmp_path)
        with TestClient(srv.app) as client:
            with client.websocket_connect("/ws/record/chunk-4") as ws:
                ws.send_json({"action": "start", "sample_rate": SR})
                ws.receive_json()
                ws.send_bytes(_small_chunk_bytes())
                msg = ws.receive_json()
        data = msg["data"]
        assert "noise_type" in data
        assert data["noise_type"] in {"airplane", "car", "generator", "wind", "other"}

    def test_chunk_processed_has_snr_fields(
        self, monkeypatch: pytest.MonkeyPatch, tmp_path: Path
    ) -> None:
        srv = _reload_server_for_ws(monkeypatch, tmp_path)
        with TestClient(srv.app) as client:
            with client.websocket_connect("/ws/record/chunk-5") as ws:
                ws.send_json({"action": "start", "sample_rate": SR})
                ws.receive_json()
                ws.send_bytes(_small_chunk_bytes())
                msg = ws.receive_json()
        data = msg["data"]
        assert "snr_before" in data
        assert "snr_after" in data
        assert isinstance(data["snr_before"], float)
        assert isinstance(data["snr_after"], float)

    def test_chunk_processed_has_confidence(
        self, monkeypatch: pytest.MonkeyPatch, tmp_path: Path
    ) -> None:
        srv = _reload_server_for_ws(monkeypatch, tmp_path)
        with TestClient(srv.app) as client:
            with client.websocket_connect("/ws/record/chunk-6") as ws:
                ws.send_json({"action": "start", "sample_rate": SR})
                ws.receive_json()
                ws.send_bytes(_small_chunk_bytes())
                msg = ws.receive_json()
        data = msg["data"]
        assert "confidence" in data
        assert 0.0 <= data["confidence"] <= 1.0

    def test_chunk_processed_has_cleaned_audio_b64(
        self, monkeypatch: pytest.MonkeyPatch, tmp_path: Path
    ) -> None:
        srv = _reload_server_for_ws(monkeypatch, tmp_path)
        with TestClient(srv.app) as client:
            with client.websocket_connect("/ws/record/chunk-7") as ws:
                ws.send_json({"action": "start", "sample_rate": SR})
                ws.receive_json()
                ws.send_bytes(_small_chunk_bytes())
                msg = ws.receive_json()
        data = msg["data"]
        assert "cleaned_audio_b64" in data
        decoded = base64.b64decode(data["cleaned_audio_b64"])
        # Should decode to the same number of float32 samples as input
        assert len(decoded) == _WS_CHUNK_N * 4  # 4 bytes per float32

    def test_chunk_processed_has_spectrogram_columns(
        self, monkeypatch: pytest.MonkeyPatch, tmp_path: Path
    ) -> None:
        srv = _reload_server_for_ws(monkeypatch, tmp_path)
        with TestClient(srv.app) as client:
            with client.websocket_connect("/ws/record/chunk-8") as ws:
                ws.send_json({"action": "start", "sample_rate": SR})
                ws.receive_json()
                ws.send_bytes(_small_chunk_bytes())
                msg = ws.receive_json()
        data = msg["data"]
        assert "spectrogram_columns" in data
        cols = data["spectrogram_columns"]
        assert isinstance(cols, list)
        assert len(cols) > 0          # at least one frequency bin
        assert isinstance(cols[0], list)  # each bin is a list of frame values

    # ------------------------------------------------------------------
    # stop action → RECORDING_COMPLETE + WAV saved + store status=complete
    # ------------------------------------------------------------------

    def test_stop_sends_recording_complete(
        self, monkeypatch: pytest.MonkeyPatch, tmp_path: Path
    ) -> None:
        srv = _reload_server_for_ws(monkeypatch, tmp_path)
        with TestClient(srv.app) as client:
            with client.websocket_connect("/ws/record/stop-1") as ws:
                ws.send_json({"action": "start", "sample_rate": SR})
                ws.receive_json()
                ws.send_bytes(_small_chunk_bytes())
                ws.receive_json()  # CHUNK_PROCESSED
                ws.send_json({"action": "stop"})
                final = ws.receive_json()
        assert final["type"] == "RECORDING_COMPLETE"

    def test_stop_message_has_recording_id(
        self, monkeypatch: pytest.MonkeyPatch, tmp_path: Path
    ) -> None:
        srv = _reload_server_for_ws(monkeypatch, tmp_path)
        with TestClient(srv.app) as client:
            with client.websocket_connect("/ws/record/stop-2") as ws:
                ws.send_json({"action": "start", "sample_rate": SR})
                start_msg = ws.receive_json()
                recording_id = start_msg["recording_id"]
                ws.send_bytes(_small_chunk_bytes())
                ws.receive_json()
                ws.send_json({"action": "stop"})
                final = ws.receive_json()
        assert final["data"]["recording_id"] == recording_id

    def test_stop_message_has_duration_s(
        self, monkeypatch: pytest.MonkeyPatch, tmp_path: Path
    ) -> None:
        srv = _reload_server_for_ws(monkeypatch, tmp_path)
        with TestClient(srv.app) as client:
            with client.websocket_connect("/ws/record/stop-3") as ws:
                ws.send_json({"action": "start", "sample_rate": SR})
                ws.receive_json()
                ws.send_bytes(_small_chunk_bytes())
                ws.receive_json()
                ws.send_json({"action": "stop"})
                final = ws.receive_json()
        assert "duration_s" in final["data"]
        assert isinstance(final["data"]["duration_s"], float)
        assert final["data"]["duration_s"] > 0.0

    def test_stop_message_has_total_chunks(
        self, monkeypatch: pytest.MonkeyPatch, tmp_path: Path
    ) -> None:
        srv = _reload_server_for_ws(monkeypatch, tmp_path)
        with TestClient(srv.app) as client:
            with client.websocket_connect("/ws/record/stop-4") as ws:
                ws.send_json({"action": "start", "sample_rate": SR})
                ws.receive_json()
                for _ in range(2):
                    ws.send_bytes(_small_chunk_bytes())
                    ws.receive_json()
                ws.send_json({"action": "stop"})
                final = ws.receive_json()
        assert final["data"]["total_chunks"] == 2

    def test_stop_message_has_output_path(
        self, monkeypatch: pytest.MonkeyPatch, tmp_path: Path
    ) -> None:
        srv = _reload_server_for_ws(monkeypatch, tmp_path)
        with TestClient(srv.app) as client:
            with client.websocket_connect("/ws/record/stop-5") as ws:
                ws.send_json({"action": "start", "sample_rate": SR})
                ws.receive_json()
                ws.send_bytes(_small_chunk_bytes())
                ws.receive_json()
                ws.send_json({"action": "stop"})
                final = ws.receive_json()
        assert "output_path" in final["data"]
        assert final["data"]["output_path"].endswith(".wav")

    def test_stop_saves_wav_to_processed_dir(
        self, monkeypatch: pytest.MonkeyPatch, tmp_path: Path
    ) -> None:
        srv = _reload_server_for_ws(monkeypatch, tmp_path)
        with TestClient(srv.app) as client:
            with client.websocket_connect("/ws/record/stop-6") as ws:
                ws.send_json({"action": "start", "sample_rate": SR})
                ws.receive_json()
                ws.send_bytes(_small_chunk_bytes())
                ws.receive_json()
                ws.send_json({"action": "stop"})
                final = ws.receive_json()
        output_path = Path(final["data"]["output_path"])
        assert output_path.exists(), f"WAV not found at {output_path}"
        assert output_path.stat().st_size > 0

    def test_stop_updates_store_status_complete(
        self, monkeypatch: pytest.MonkeyPatch, tmp_path: Path
    ) -> None:
        srv = _reload_server_for_ws(monkeypatch, tmp_path)
        with TestClient(srv.app) as client:
            store = srv.app.state.store
            with client.websocket_connect("/ws/record/stop-7") as ws:
                ws.send_json({"action": "start", "sample_rate": SR})
                start_msg = ws.receive_json()
                recording_id = start_msg["recording_id"]
                ws.send_bytes(_small_chunk_bytes())
                ws.receive_json()
                ws.send_json({"action": "stop"})
                ws.receive_json()
        rec = store.get(recording_id)
        assert rec is not None
        assert rec["status"] == "complete"

    def test_stop_stores_output_path_in_result(
        self, monkeypatch: pytest.MonkeyPatch, tmp_path: Path
    ) -> None:
        srv = _reload_server_for_ws(monkeypatch, tmp_path)
        with TestClient(srv.app) as client:
            store = srv.app.state.store
            with client.websocket_connect("/ws/record/stop-8") as ws:
                ws.send_json({"action": "start", "sample_rate": SR})
                start_msg = ws.receive_json()
                recording_id = start_msg["recording_id"]
                ws.send_bytes(_small_chunk_bytes())
                ws.receive_json()
                ws.send_json({"action": "stop"})
                ws.receive_json()
        rec = store.get(recording_id)
        assert rec is not None
        result = rec.get("result") or {}
        assert "output_audio_path" in result

    # ------------------------------------------------------------------
    # Disconnect without stop → store status = failed + session cleaned up
    # ------------------------------------------------------------------

    def test_disconnect_without_stop_marks_recording_failed(
        self, monkeypatch: pytest.MonkeyPatch, tmp_path: Path
    ) -> None:
        srv = _reload_server_for_ws(monkeypatch, tmp_path)
        with TestClient(srv.app) as client:
            store = srv.app.state.store
            with client.websocket_connect("/ws/record/disc-1") as ws:
                ws.send_json({"action": "start", "sample_rate": SR})
                start_msg = ws.receive_json()
                recording_id = start_msg["recording_id"]
                ws.send_bytes(_small_chunk_bytes())
                ws.receive_json()
                # Exit without sending stop → simulates browser disconnect
        rec = store.get(recording_id)
        assert rec is not None
        assert rec["status"] == "failed"

    def test_disconnect_cleans_up_live_sessions(
        self, monkeypatch: pytest.MonkeyPatch, tmp_path: Path
    ) -> None:
        srv = _reload_server_for_ws(monkeypatch, tmp_path)
        with TestClient(srv.app) as client:
            live_sessions = srv.app.state.live_sessions
            with client.websocket_connect("/ws/record/disc-2") as ws:
                ws.send_json({"action": "start", "sample_rate": SR})
                ws.receive_json()
                assert "disc-2" in live_sessions
            # After disconnect, session must be removed
        assert "disc-2" not in live_sessions

    def test_stop_cleans_up_live_sessions(
        self, monkeypatch: pytest.MonkeyPatch, tmp_path: Path
    ) -> None:
        srv = _reload_server_for_ws(monkeypatch, tmp_path)
        with TestClient(srv.app) as client:
            live_sessions = srv.app.state.live_sessions
            with client.websocket_connect("/ws/record/disc-3") as ws:
                ws.send_json({"action": "start", "sample_rate": SR})
                ws.receive_json()
                ws.send_bytes(_small_chunk_bytes())
                ws.receive_json()
                ws.send_json({"action": "stop"})
                ws.receive_json()
        assert "disc-3" not in live_sessions
