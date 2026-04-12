from __future__ import annotations

import importlib
from pathlib import Path

import numpy as np
import soundfile as sf
from fastapi.testclient import TestClient

from echofield.config import reset_settings


def _reload_server(monkeypatch, tmp_path: Path):
    config_path = Path(__file__).resolve().parents[1] / "config" / "echofield.config.yml"
    monkeypatch.setenv("ECHOFIELD_AUDIO_DIR", str(tmp_path / "recordings"))
    monkeypatch.setenv("ECHOFIELD_PROCESSED_DIR", str(tmp_path / "processed"))
    monkeypatch.setenv("ECHOFIELD_SPECTROGRAM_DIR", str(tmp_path / "spectrograms"))
    monkeypatch.setenv("ECHOFIELD_CACHE_DIR", str(tmp_path / "cache"))
    monkeypatch.setenv("ECHOFIELD_CATALOG_FILE", str(tmp_path / "cache" / "recording_catalog.json"))
    monkeypatch.setenv("ECHOFIELD_DB_PATH", str(tmp_path / "cache" / "echofield.sqlite"))
    monkeypatch.setenv("ECHOFIELD_METADATA_FILE", str(tmp_path / "metadata.csv"))
    monkeypatch.setenv("ECHOFIELD_CONFIG_FILE", str(config_path))
    monkeypatch.setenv("ECHOFIELD_DEMO_MODE", "false")
    reset_settings()
    import echofield.server as server_module

    return importlib.reload(server_module)


def test_server_upload_list_and_process(monkeypatch, tmp_path: Path) -> None:
    server_module = _reload_server(monkeypatch, tmp_path)

    sr = 44_100
    t = np.linspace(0, 1, sr, endpoint=False)
    waveform = (0.2 * np.sin(2 * np.pi * 18 * t)).astype(np.float32)
    upload_source = tmp_path / "upload.wav"
    sf.write(upload_source, waveform, sr)

    with TestClient(server_module.app) as client:
        with upload_source.open("rb") as handle:
            response = client.post(
                "/api/upload",
                files={"file": ("upload.wav", handle, "audio/wav")},
            )
        assert response.status_code == 201
        recording_id = response.json()["recording_ids"][0]

        listing = client.get("/api/recordings")
        assert listing.status_code == 200
        assert listing.json()["total"] == 1

        process_response = client.post(f"/api/recordings/{recording_id}/process")
        assert process_response.status_code == 200

        detail = client.get(f"/api/recordings/{recording_id}")
        assert detail.status_code == 200
        assert detail.json()["status"] in {"processing", "complete"}


def test_server_preloads_analysis_metadata(monkeypatch, tmp_path: Path) -> None:
    recordings_dir = tmp_path / "recordings"
    recordings_dir.mkdir()
    sr = 44_100
    t = np.linspace(0, 1, sr, endpoint=False)
    sf.write(recordings_dir / "call_001.wav", 0.1 * np.sin(2 * np.pi * 20 * t), sr)
    (tmp_path / "metadata.csv").write_text(
        "call_id,filename,animal_id,location,date,start_sec,end_sec,noise_type_ref,species\n"
        "call_001,call_001.wav,E-1,Amboseli,2026-04-11,0,1,vehicle,African bush elephant\n",
        encoding="utf-8",
    )

    server_module = _reload_server(monkeypatch, tmp_path)

    with TestClient(server_module.app) as client:
        response = client.get("/api/recordings")

    assert response.status_code == 200
    payload = response.json()
    assert payload["total"] == 1
    metadata = payload["recordings"][0]["metadata"]
    assert metadata["call_id"] == "call_001"
    assert metadata["animal_id"] == "E-1"
    assert metadata["noise_type_ref"] == "vehicle"
    assert metadata["start_sec"] == 0.0
    assert metadata["end_sec"] == 1.0


def test_recording_status_endpoint(monkeypatch, tmp_path: Path) -> None:
    server_module = _reload_server(monkeypatch, tmp_path)

    sr = 44_100
    t = np.linspace(0, 1, sr, endpoint=False)
    waveform = (0.2 * np.sin(2 * np.pi * 18 * t)).astype(np.float32)
    upload_source = tmp_path / "upload.wav"
    sf.write(upload_source, waveform, sr)

    with TestClient(server_module.app) as client:
        with upload_source.open("rb") as handle:
            response = client.post(
                "/api/upload",
                files={"file": ("upload.wav", handle, "audio/wav")},
            )
        recording_id = response.json()["recording_ids"][0]

        status_response = client.get(f"/api/recordings/{recording_id}/status")

    assert status_response.status_code == 200
    payload = status_response.json()
    assert payload["id"] == recording_id
    assert payload["status"] == "pending"
    assert payload["progress_pct"] == 0


def test_recordings_persist_across_restart(monkeypatch, tmp_path: Path) -> None:
    server_module = _reload_server(monkeypatch, tmp_path)

    sr = 44_100
    t = np.linspace(0, 1, sr, endpoint=False)
    waveform = (0.2 * np.sin(2 * np.pi * 18 * t)).astype(np.float32)
    upload_source = tmp_path / "upload.wav"
    spectrogram_path = tmp_path / "spec.png"
    sf.write(upload_source, waveform, sr)
    spectrogram_path.write_bytes(b"PNG")

    with TestClient(server_module.app) as client:
        with upload_source.open("rb") as handle:
            response = client.post(
                "/api/upload",
                files={"file": ("upload.wav", handle, "audio/wav")},
            )
        assert response.status_code == 201
        recording_id = response.json()["recording_ids"][0]

    store = server_module.app.state.store
    store.update_result(
        recording_id,
        {
            "recording_id": recording_id,
            "status": "complete",
            "stages_completed": ["complete"],
            "noise_types": [],
            "quality": {
                "snr_before_db": 1.0,
                "snr_after_db": 2.0,
                "snr_improvement_db": 1.0,
                "spectral_distortion": 0.1,
                "energy_preservation": 0.9,
                "quality_score": 80.0,
                "quality_rating": "good",
                "flagged_for_review": False,
            },
            "calls": [],
            "processing_time_s": 0.1,
            "output_audio_path": str(upload_source),
            "spectrogram_before_path": str(spectrogram_path),
            "spectrogram_after_path": str(spectrogram_path),
            "comparison_spectrogram_path": str(spectrogram_path),
        },
    )
    store.update_status(recording_id, "complete", progress=100, current_stage="complete")

    reloaded_server_module = _reload_server(monkeypatch, tmp_path)
    with TestClient(reloaded_server_module.app) as client:
        listing = client.get("/api/recordings")
        detail = client.get(f"/api/recordings/{recording_id}")
        cleaned_audio = client.get(f"/api/recordings/{recording_id}/audio?type=cleaned")
        spectrogram = client.get(f"/api/recordings/{recording_id}/spectrogram?type=after")

    assert listing.status_code == 200
    assert detail.status_code == 200
    assert cleaned_audio.status_code == 200
    assert spectrogram.status_code == 200
    assert any(item["id"] == recording_id and item["status"] == "complete" for item in listing.json()["recordings"])
    assert detail.json()["result"]["quality"]["quality_score"] == 80.0


# ── Colormap endpoint tests ──


def _make_and_process_recording(client, tmp_path: Path) -> str:
    """Upload and fully process a recording, returning its ID."""
    import numpy as np
    import soundfile as sf
    sr = 44_100
    t = np.linspace(0, 1, sr, endpoint=False)
    waveform = (0.2 * np.sin(2 * np.pi * 18 * t)).astype(np.float32)
    audio_path = tmp_path / "colormap_test.wav"
    sf.write(audio_path, waveform, sr)

    with audio_path.open("rb") as fh:
        resp = client.post("/api/upload", files={"file": ("colormap_test.wav", fh, "audio/wav")})
    assert resp.status_code == 201
    recording_id = resp.json()["recording_ids"][0]
    client.post(f"/api/recordings/{recording_id}/process")
    # poll until complete
    import time
    for _ in range(30):
        detail = client.get(f"/api/recordings/{recording_id}")
        if detail.json().get("status") == "complete":
            break
        time.sleep(0.5)
    return recording_id


def test_spectrogram_endpoint_default_colormap(monkeypatch, tmp_path: Path) -> None:
    """GET /api/recordings/{id}/spectrogram returns PNG for default colormap."""
    server_module = _reload_server(monkeypatch, tmp_path)
    with TestClient(server_module.app) as client:
        recording_id = _make_and_process_recording(client, tmp_path)
        resp = client.get(f"/api/recordings/{recording_id}/spectrogram?type=after")
    assert resp.status_code == 200
    assert resp.headers["content-type"] == "image/png"


def test_spectrogram_endpoint_valid_colormap(monkeypatch, tmp_path: Path) -> None:
    """GET /api/recordings/{id}/spectrogram?colormap=magma returns a valid PNG."""
    server_module = _reload_server(monkeypatch, tmp_path)
    with TestClient(server_module.app) as client:
        recording_id = _make_and_process_recording(client, tmp_path)
        resp = client.get(f"/api/recordings/{recording_id}/spectrogram?type=after&colormap=magma")
    assert resp.status_code == 200
    assert resp.headers["content-type"] == "image/png"
    assert len(resp.content) > 0


def test_spectrogram_endpoint_all_colormaps(monkeypatch, tmp_path: Path) -> None:
    """All supported colormaps return valid PNGs from the endpoint."""
    server_module = _reload_server(monkeypatch, tmp_path)
    with TestClient(server_module.app) as client:
        recording_id = _make_and_process_recording(client, tmp_path)
        for cmap in ("viridis", "magma", "inferno", "plasma", "gray"):
            resp = client.get(f"/api/recordings/{recording_id}/spectrogram?type=after&colormap={cmap}")
            assert resp.status_code == 200, f"Failed for colormap={cmap}"
            assert resp.headers["content-type"] == "image/png"


def test_spectrogram_endpoint_invalid_colormap_returns_422(monkeypatch, tmp_path: Path) -> None:
    """An unsupported colormap returns HTTP 422."""
    server_module = _reload_server(monkeypatch, tmp_path)
    with TestClient(server_module.app) as client:
        recording_id = _make_and_process_recording(client, tmp_path)
        resp = client.get(f"/api/recordings/{recording_id}/spectrogram?type=after&colormap=rainbow")
    assert resp.status_code == 422
