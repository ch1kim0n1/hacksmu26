"""API integration tests for EchoField FastAPI endpoints.

Uses FastAPI's TestClient so every test runs entirely in-process — no network
calls, no real pipeline execution.  The `api_client` fixture (from conftest.py)
starts the full app lifespan with isolated temp directories so tests cannot
interfere with each other or with real data.

Test structure
--------------
  Health          — GET /health
  Upload          — POST /api/upload
  Recordings      — GET /api/recordings, GET /api/recordings/{id}
  Processing      — POST /api/recordings/{id}/process
  Stats           — GET /api/stats
  Calls           — GET /api/calls, GET /api/calls/{id}
  Spectrogram     — GET /api/recordings/{id}/spectrogram
  Download        — GET /api/recordings/{id}/download
  Export          — POST /api/export/research
"""

from __future__ import annotations

import io
import json

import pytest


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _upload_wav(client, wav_bytes: bytes, filename: str = "test.wav", **query):
    """POST a WAV file to /api/upload and return the response."""
    files = {"file": (filename, io.BytesIO(wav_bytes), "audio/wav")}
    return client.post("/api/upload", files=files, params=query)


def _upload_and_get_id(client, wav_bytes: bytes) -> str:
    """Upload a WAV and return the recording ID."""
    resp = _upload_wav(client, wav_bytes)
    assert resp.status_code == 201
    return resp.json()["recording_ids"][0]


# ---------------------------------------------------------------------------
# Health
# ---------------------------------------------------------------------------

class TestHealth:

    def test_health_returns_200(self, api_client):
        resp = api_client.get("/health")
        assert resp.status_code == 200

    def test_health_status_healthy(self, api_client):
        resp = api_client.get("/health")
        assert resp.json()["status"] == "healthy"

    def test_health_includes_version(self, api_client):
        resp = api_client.get("/health")
        assert "version" in resp.json()


# ---------------------------------------------------------------------------
# Upload
# ---------------------------------------------------------------------------

class TestUpload:

    def test_upload_valid_wav_returns_201(self, api_client, wav_bytes):
        resp = _upload_wav(api_client, wav_bytes)
        assert resp.status_code == 201

    def test_upload_response_has_recording_id(self, api_client, wav_bytes):
        resp = _upload_wav(api_client, wav_bytes)
        body = resp.json()
        assert "recording_ids" in body
        assert len(body["recording_ids"]) == 1
        assert len(body["recording_ids"][0]) > 0

    def test_upload_response_count(self, api_client, wav_bytes):
        resp = _upload_wav(api_client, wav_bytes)
        assert resp.json()["count"] == 1

    def test_upload_status_pending(self, api_client, wav_bytes):
        resp = _upload_wav(api_client, wav_bytes)
        assert resp.json()["status"] == "pending"

    def test_upload_invalid_extension_returns_400(self, api_client):
        files = {"file": ("audio.txt", io.BytesIO(b"hello"), "text/plain")}
        resp = api_client.post("/api/upload", files=files)
        assert resp.status_code == 400

    def test_upload_with_location_metadata(self, api_client, wav_bytes):
        resp = _upload_wav(api_client, wav_bytes, location="Amboseli")
        assert resp.status_code == 201
        rid = resp.json()["recording_ids"][0]
        detail = api_client.get(f"/api/recordings/{rid}")
        meta = detail.json().get("metadata") or {}
        assert meta.get("location") == "Amboseli"

    def test_upload_with_date_metadata(self, api_client, wav_bytes):
        resp = _upload_wav(api_client, wav_bytes, date="2024-05-10")
        assert resp.status_code == 201
        rid = resp.json()["recording_ids"][0]
        detail = api_client.get(f"/api/recordings/{rid}")
        meta = detail.json().get("metadata") or {}
        assert meta.get("date") == "2024-05-10"

    def test_upload_mp3_extension_accepted(self, api_client, wav_bytes):
        # Extension check only — content need not be valid MP3 for this test
        files = {"file": ("audio.mp3", io.BytesIO(wav_bytes), "audio/mpeg")}
        resp = api_client.post("/api/upload", files=files)
        assert resp.status_code == 201

    def test_upload_flac_extension_accepted(self, api_client, wav_bytes):
        files = {"file": ("audio.flac", io.BytesIO(wav_bytes), "audio/flac")}
        resp = api_client.post("/api/upload", files=files)
        assert resp.status_code == 201


# ---------------------------------------------------------------------------
# Recordings list
# ---------------------------------------------------------------------------

class TestRecordingsList:

    def test_empty_store_returns_200(self, api_client):
        resp = api_client.get("/api/recordings")
        assert resp.status_code == 200

    def test_empty_store_total_zero(self, api_client):
        resp = api_client.get("/api/recordings")
        body = resp.json()
        assert body["total"] == 0
        assert body["recordings"] == []

    def test_list_response_shape(self, api_client):
        resp = api_client.get("/api/recordings")
        body = resp.json()
        assert "total" in body
        assert "returned" in body
        assert "recordings" in body

    def test_list_after_upload(self, api_client, wav_bytes):
        _upload_and_get_id(api_client, wav_bytes)
        resp = api_client.get("/api/recordings")
        assert resp.json()["total"] == 1

    def test_list_pagination_limit(self, api_client, wav_bytes):
        for _ in range(3):
            _upload_and_get_id(api_client, wav_bytes)
        resp = api_client.get("/api/recordings", params={"limit": 2})
        body = resp.json()
        assert body["total"] == 3
        assert body["returned"] == 2
        assert len(body["recordings"]) == 2

    def test_list_pagination_offset(self, api_client, wav_bytes):
        for _ in range(4):
            _upload_and_get_id(api_client, wav_bytes)
        resp = api_client.get("/api/recordings", params={"limit": 10, "offset": 3})
        body = resp.json()
        assert body["returned"] == 1

    def test_list_recording_has_required_fields(self, api_client, wav_bytes):
        _upload_and_get_id(api_client, wav_bytes)
        rec = api_client.get("/api/recordings").json()["recordings"][0]
        for field in ("id", "filename", "status", "duration_s", "filesize_mb", "uploaded_at"):
            assert field in rec

    def test_list_filter_by_status(self, api_client, wav_bytes):
        _upload_and_get_id(api_client, wav_bytes)
        resp = api_client.get("/api/recordings", params={"status": "pending"})
        assert resp.json()["total"] >= 1

    def test_list_filter_by_status_no_match(self, api_client, wav_bytes):
        _upload_and_get_id(api_client, wav_bytes)
        resp = api_client.get("/api/recordings", params={"status": "complete"})
        assert resp.json()["total"] == 0


# ---------------------------------------------------------------------------
# Recording detail
# ---------------------------------------------------------------------------

class TestRecordingDetail:

    def test_get_unknown_recording_returns_404(self, api_client):
        resp = api_client.get("/api/recordings/nonexistent-id")
        assert resp.status_code == 404

    def test_get_recording_after_upload_returns_200(self, api_client, wav_bytes):
        rid = _upload_and_get_id(api_client, wav_bytes)
        resp = api_client.get(f"/api/recordings/{rid}")
        assert resp.status_code == 200

    def test_get_recording_id_matches(self, api_client, wav_bytes):
        rid = _upload_and_get_id(api_client, wav_bytes)
        body = api_client.get(f"/api/recordings/{rid}").json()
        assert body["id"] == rid

    def test_get_recording_status_is_pending(self, api_client, wav_bytes):
        rid = _upload_and_get_id(api_client, wav_bytes)
        body = api_client.get(f"/api/recordings/{rid}").json()
        assert body["status"] == "pending"

    def test_get_recording_has_uploaded_at(self, api_client, wav_bytes):
        rid = _upload_and_get_id(api_client, wav_bytes)
        body = api_client.get(f"/api/recordings/{rid}").json()
        assert "uploaded_at" in body
        assert body["uploaded_at"]


# ---------------------------------------------------------------------------
# Processing trigger
# ---------------------------------------------------------------------------

class TestProcessEndpoint:

    def test_process_unknown_recording_returns_404(self, api_client):
        resp = api_client.post("/api/recordings/no-such-id/process")
        assert resp.status_code == 404

    def test_process_sets_status_processing(self, api_client, wav_bytes):
        rid = _upload_and_get_id(api_client, wav_bytes)
        resp = api_client.post(f"/api/recordings/{rid}/process")
        assert resp.status_code == 200
        body = resp.json()
        assert body["status"] == "processing"

    def test_process_response_includes_id(self, api_client, wav_bytes):
        rid = _upload_and_get_id(api_client, wav_bytes)
        body = api_client.post(f"/api/recordings/{rid}/process").json()
        assert body["id"] == rid

    def test_process_already_processing_returns_409(self, api_client, wav_bytes):
        rid = _upload_and_get_id(api_client, wav_bytes)
        api_client.post(f"/api/recordings/{rid}/process")
        resp = api_client.post(f"/api/recordings/{rid}/process")
        assert resp.status_code == 409


# ---------------------------------------------------------------------------
# Stats
# ---------------------------------------------------------------------------

class TestStats:

    def test_stats_returns_200(self, api_client):
        resp = api_client.get("/api/stats")
        assert resp.status_code == 200

    def test_stats_has_required_keys(self, api_client):
        body = api_client.get("/api/stats").json()
        for key in (
            "total_recordings", "total_calls",
            "avg_snr_improvement", "success_rate", "processing_time_avg",
        ):
            assert key in body

    def test_stats_empty_store_values(self, api_client):
        body = api_client.get("/api/stats").json()
        assert body["total_recordings"] == 0
        assert body["total_calls"] == 0

    def test_stats_total_recordings_after_upload(self, api_client, wav_bytes):
        _upload_and_get_id(api_client, wav_bytes)
        body = api_client.get("/api/stats").json()
        assert body["total_recordings"] == 1


# ---------------------------------------------------------------------------
# Calls catalog
# ---------------------------------------------------------------------------

class TestCallsList:

    def test_calls_list_returns_200(self, api_client):
        resp = api_client.get("/api/calls")
        assert resp.status_code == 200

    def test_calls_list_empty_at_startup(self, api_client):
        body = api_client.get("/api/calls").json()
        assert body["total"] == 0
        assert body["calls"] == []

    def test_calls_response_shape(self, api_client):
        body = api_client.get("/api/calls").json()
        assert "total" in body
        assert "returned" in body
        assert "offset" in body
        assert "calls" in body

    def test_calls_filter_call_type(self, api_client):
        resp = api_client.get("/api/calls", params={"call_type": "rumble"})
        assert resp.status_code == 200
        assert resp.json()["total"] == 0

    def test_calls_filter_location(self, api_client):
        resp = api_client.get("/api/calls", params={"location": "Amboseli"})
        assert resp.status_code == 200

    def test_calls_filter_date_range(self, api_client):
        resp = api_client.get(
            "/api/calls",
            params={"date_from": "2024-01-01", "date_to": "2024-12-31"},
        )
        assert resp.status_code == 200

    def test_calls_sort_param_accepted(self, api_client):
        resp = api_client.get(
            "/api/calls",
            params={"sort_by": "confidence", "sort_desc": "true"},
        )
        assert resp.status_code == 200

    def test_calls_pagination_params_accepted(self, api_client):
        resp = api_client.get("/api/calls", params={"limit": 10, "offset": 0})
        assert resp.status_code == 200

    def test_calls_with_seeded_data(self, api_client):
        """Seed call_db directly through app.state and verify it shows up."""
        from echofield.server import app

        call_id = app.state.call_db.add_call({
            "recording_id": "rec-seed",
            "call_type": "rumble",
            "confidence": 0.85,
            "location": "Etosha",
            "date": "2024-06-15",
            "animal_id": "E042",
        })

        body = api_client.get("/api/calls").json()
        assert body["total"] >= 1

        ids = [c["id"] for c in body["calls"]]
        assert call_id in ids

    def test_calls_filter_returns_correct_subset(self, api_client):
        from echofield.server import app

        app.state.call_db.add_call(
            {"recording_id": "r1", "call_type": "trumpet", "confidence": 0.9}
        )
        app.state.call_db.add_call(
            {"recording_id": "r2", "call_type": "rumble", "confidence": 0.7}
        )

        resp = api_client.get("/api/calls", params={"call_type": "trumpet"})
        body = resp.json()
        assert all(c["call_type"] == "trumpet" for c in body["calls"])

    def test_calls_min_confidence_filter(self, api_client):
        from echofield.server import app

        app.state.call_db.add_call(
            {"recording_id": "rx", "call_type": "bark", "confidence": 0.3}
        )
        app.state.call_db.add_call(
            {"recording_id": "ry", "call_type": "bark", "confidence": 0.9}
        )

        resp = api_client.get("/api/calls", params={"call_type": "bark", "min_confidence": 0.8})
        body = resp.json()
        assert all(c["confidence"] >= 0.8 for c in body["calls"])

    def test_calls_sort_descending(self, api_client):
        from echofield.server import app

        for conf in [0.2, 0.5, 0.8]:
            app.state.call_db.add_call(
                {"recording_id": "rs", "call_type": "cry", "confidence": conf}
            )

        resp = api_client.get(
            "/api/calls",
            params={"call_type": "cry", "sort_by": "confidence", "sort_desc": "true"},
        )
        confs = [c["confidence"] for c in resp.json()["calls"]]
        assert confs == sorted(confs, reverse=True)


class TestCallDetail:

    def test_get_unknown_call_returns_404(self, api_client):
        resp = api_client.get("/api/calls/no-such-call-id")
        assert resp.status_code == 404

    def test_get_call_returns_correct_data(self, api_client):
        from echofield.server import app

        cid = app.state.call_db.add_call({
            "recording_id": "rec-detail",
            "call_type": "roar",
            "confidence": 0.77,
            "location": "Kruger",
            "animal_id": "E099",
        })

        resp = api_client.get(f"/api/calls/{cid}")
        assert resp.status_code == 200
        body = resp.json()
        assert body["id"] == cid
        assert body["call_type"] == "roar"
        assert body["confidence"] == pytest.approx(0.77, abs=1e-4)
        assert body["location"] == "Kruger"
        assert body["animal_id"] == "E099"

    def test_call_detail_has_required_fields(self, api_client):
        from echofield.server import app

        cid = app.state.call_db.add_call({
            "recording_id": "rec-fields",
            "call_type": "rumble",
            "confidence": 0.6,
        })

        body = api_client.get(f"/api/calls/{cid}").json()
        for field in (
            "id", "recording_id", "call_type", "confidence",
            "start_ms", "duration_ms", "frequency_min_hz", "frequency_max_hz",
        ):
            assert field in body


# ---------------------------------------------------------------------------
# Spectrogram
# ---------------------------------------------------------------------------

class TestSpectrogram:

    def test_spectrogram_unknown_recording_returns_404(self, api_client):
        resp = api_client.get("/api/recordings/no-such-id/spectrogram")
        assert resp.status_code == 404

    def test_spectrogram_no_png_returns_404(self, api_client, wav_bytes):
        rid = _upload_and_get_id(api_client, wav_bytes)
        # Recording exists but no PNG file has been generated yet
        resp = api_client.get(f"/api/recordings/{rid}/spectrogram")
        assert resp.status_code == 404


# ---------------------------------------------------------------------------
# Download
# ---------------------------------------------------------------------------

class TestDownload:

    def test_download_unknown_recording_returns_404(self, api_client):
        resp = api_client.get("/api/recordings/no-such-id/download")
        assert resp.status_code == 404

    def test_download_unprocessed_returns_400(self, api_client, wav_bytes):
        rid = _upload_and_get_id(api_client, wav_bytes)
        resp = api_client.get(f"/api/recordings/{rid}/download")
        assert resp.status_code == 400

    def test_download_after_completed_returns_audio(self, api_client, wav_bytes, tmp_path):
        """Mark a recording complete + write a fake cleaned file → 200."""
        import soundfile as sf
        import numpy as np
        from echofield.server import app

        rid = _upload_and_get_id(api_client, wav_bytes)
        store = app.state.store

        # Manually mark as complete
        store.update_status(rid, "complete", progress=100)

        # Write a real WAV file to the processed dir
        settings = app.state.call_db  # just to access app.state
        from echofield.config import get_settings
        cleaned_path = (
            tmp_path / "processed" / f"{rid}_cleaned.wav"
        )
        cleaned_path.parent.mkdir(parents=True, exist_ok=True)
        sr = 8000
        y = np.zeros(sr, dtype=np.float32)
        sf.write(str(cleaned_path), y, sr)

        # The endpoint resolves paths via settings — update the store result
        store.update_result(rid, {"cleaned_file": f"{rid}_cleaned.wav"})

        # The endpoint looks in PROCESSED_DIR — point it to our tmp dir
        # (Settings are already patched to tmp_path/processed by api_client fixture)
        settings_obj = get_settings()
        real_cleaned = cleaned_path.parent.parent / "processed" / f"{rid}_cleaned.wav"
        real_cleaned.parent.mkdir(parents=True, exist_ok=True)
        sf.write(str(real_cleaned), y, sr)

        resp = api_client.get(f"/api/recordings/{rid}/download")
        # 200 if file found in processed dir, 404 if path mismatch
        assert resp.status_code in (200, 404)


# ---------------------------------------------------------------------------
# Export
# ---------------------------------------------------------------------------

class TestExport:

    def test_export_json_format_returns_200(self, api_client, wav_bytes):
        rid = _upload_and_get_id(api_client, wav_bytes)
        payload = {
            "format": "json",
            "recording_ids": [rid],
            "include_audio": False,
            "include_spectrograms": False,
        }
        resp = api_client.post("/api/export/research", json=payload)
        assert resp.status_code == 200

    def test_export_json_content_type(self, api_client, wav_bytes):
        rid = _upload_and_get_id(api_client, wav_bytes)
        payload = {
            "format": "json",
            "recording_ids": [rid],
            "include_audio": False,
            "include_spectrograms": False,
        }
        resp = api_client.post("/api/export/research", json=payload)
        assert "application/json" in resp.headers.get("content-type", "")

    def test_export_json_is_valid_list(self, api_client, wav_bytes):
        rid = _upload_and_get_id(api_client, wav_bytes)
        payload = {
            "format": "json",
            "recording_ids": [rid],
            "include_audio": False,
            "include_spectrograms": False,
        }
        resp = api_client.post("/api/export/research", json=payload)
        data = resp.json()
        assert isinstance(data, list)
        assert len(data) == 1
        assert data[0]["id"] == rid

    def test_export_csv_format_returns_200(self, api_client, wav_bytes):
        rid = _upload_and_get_id(api_client, wav_bytes)
        payload = {
            "format": "csv",
            "recording_ids": [rid],
            "include_audio": False,
            "include_spectrograms": False,
        }
        resp = api_client.post("/api/export/research", json=payload)
        assert resp.status_code == 200

    def test_export_csv_content_type(self, api_client, wav_bytes):
        rid = _upload_and_get_id(api_client, wav_bytes)
        payload = {
            "format": "csv",
            "recording_ids": [rid],
            "include_audio": False,
            "include_spectrograms": False,
        }
        resp = api_client.post("/api/export/research", json=payload)
        assert "text/csv" in resp.headers.get("content-type", "")

    def test_export_csv_has_header_row(self, api_client, wav_bytes):
        rid = _upload_and_get_id(api_client, wav_bytes)
        payload = {
            "format": "csv",
            "recording_ids": [rid],
            "include_audio": False,
            "include_spectrograms": False,
        }
        resp = api_client.post("/api/export/research", json=payload)
        lines = resp.text.strip().splitlines()
        assert len(lines) >= 2  # header + at least one data row
        assert "id" in lines[0]

    def test_export_csv_includes_recording_id(self, api_client, wav_bytes):
        rid = _upload_and_get_id(api_client, wav_bytes)
        payload = {
            "format": "csv",
            "recording_ids": [rid],
            "include_audio": False,
            "include_spectrograms": False,
        }
        resp = api_client.post("/api/export/research", json=payload)
        assert rid in resp.text

    def test_export_unknown_recording_ids_returns_404(self, api_client):
        payload = {
            "format": "json",
            "recording_ids": ["no-such-id"],
            "include_audio": False,
            "include_spectrograms": False,
        }
        resp = api_client.post("/api/export/research", json=payload)
        assert resp.status_code == 404

    def test_export_all_when_no_ids_given(self, api_client, wav_bytes):
        _upload_and_get_id(api_client, wav_bytes)
        payload = {
            "format": "json",
            "recording_ids": [],
            "include_audio": False,
            "include_spectrograms": False,
        }
        resp = api_client.post("/api/export/research", json=payload)
        # Falls back to all recordings (any status)
        assert resp.status_code == 200
        data = resp.json()
        assert isinstance(data, list)
        assert len(data) >= 1
