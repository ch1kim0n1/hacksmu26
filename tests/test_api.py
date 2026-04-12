from __future__ import annotations

from pathlib import Path

import numpy as np
import pytest
import soundfile as sf


def _upload_one(client, wav_path: Path) -> str:
    with wav_path.open("rb") as handle:
        response = client.post(
            "/api/upload",
            files={"file": (wav_path.name, handle, "audio/wav")},
        )
    assert response.status_code == 201
    return response.json()["recording_ids"][0]


def test_upload_endpoint_with_wav_file(test_client, sample_wav_file: Path) -> None:
    recording_id = _upload_one(test_client, sample_wav_file)
    assert recording_id


def test_upload_endpoint_with_mp3_file(test_client, tmp_path: Path) -> None:
    if "MP3" not in sf.available_formats():
        pytest.skip("libsndfile build cannot encode MP3")

    sr = 44_100
    t = np.linspace(0, 1, sr, endpoint=False)
    mp3_path = tmp_path / "field-upload.mp3"
    sf.write(mp3_path, (0.2 * np.sin(2 * np.pi * 18 * t)).astype(np.float32), sr, format="MP3")

    with mp3_path.open("rb") as handle:
        response = test_client.post(
            "/api/upload",
            files={"file": (mp3_path.name, handle, "audio/mpeg")},
        )

    assert response.status_code == 201
    recording_id = response.json()["recording_ids"][0]
    detail = test_client.get(f"/api/recordings/{recording_id}").json()
    assert detail["filename"] == "field-upload.mp3"
    assert detail["metadata"]["source_format"] == "mp3"
    assert detail["metadata"]["sample_rate"] == sr


def test_recordings_list_with_pagination(test_client, sample_wav_file: Path) -> None:
    _upload_one(test_client, sample_wav_file)

    another = sample_wav_file.parent / "sample-2.wav"
    sr = 44_100
    t = np.linspace(0, 1, sr, endpoint=False)
    sf.write(another, (0.15 * np.sin(2 * np.pi * 24 * t)).astype(np.float32), sr)
    _upload_one(test_client, another)

    first_page = test_client.get("/api/recordings?limit=1&offset=0")
    second_page = test_client.get("/api/recordings?limit=1&offset=1")

    assert first_page.status_code == 200
    assert second_page.status_code == 200
    assert first_page.json()["total"] == 2
    assert len(first_page.json()["recordings"]) == 1
    assert len(second_page.json()["recordings"]) == 1


def test_recording_detail_response_format(test_client, sample_wav_file: Path) -> None:
    recording_id = _upload_one(test_client, sample_wav_file)

    detail = test_client.get(f"/api/recordings/{recording_id}")
    assert detail.status_code == 200
    payload = detail.json()
    assert payload["id"] == recording_id
    assert "filename" in payload
    assert "status" in payload
    assert "processing" in payload


def test_process_endpoint_triggers_pipeline(test_client, sample_wav_file: Path) -> None:
    recording_id = _upload_one(test_client, sample_wav_file)

    process_response = test_client.post(f"/api/recordings/{recording_id}/process?method=spectral")
    assert process_response.status_code == 200
    payload = process_response.json()
    assert payload["id"] == recording_id
    assert payload["status"] == "processing"
    assert payload["method"] == "spectral"


def test_download_endpoint_returns_audio(test_client, loaded_server, sample_wav_file: Path) -> None:
    recording_id = _upload_one(test_client, sample_wav_file)

    store = loaded_server.app.state.store
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
            "output_audio_path": str(sample_wav_file),
            "spectrogram_before_path": "",
            "spectrogram_after_path": "",
        },
    )
    store.update_status(recording_id, "complete", progress=100, current_stage="complete")

    response = test_client.get(f"/api/recordings/{recording_id}/download")
    assert response.status_code == 200
    assert response.headers["content-type"].startswith("audio/")


def test_export_generates_csv_format(test_client, sample_wav_file: Path) -> None:
    recording_id = _upload_one(test_client, sample_wav_file)

    response = test_client.post(
        "/api/export/research",
        json={
            "format": "csv",
            "recording_ids": [recording_id],
            "include_audio": False,
            "include_spectrograms": False,
        },
    )

    assert response.status_code == 200
    assert "text/csv" in response.headers["content-type"]
    assert "recording_id" in response.text
