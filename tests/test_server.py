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
