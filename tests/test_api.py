from __future__ import annotations

from pathlib import Path

import numpy as np
import soundfile as sf


def _upload_sample(client, sample_wav_path: Path, *, filename: str = "sample.wav") -> str:
    with sample_wav_path.open("rb") as handle:
        response = client.post(
            "/api/upload",
            files={"file": (filename, handle, "audio/wav")},
        )
    assert response.status_code == 201
    payload = response.json()
    return str(payload["recording_ids"][0])


def test_upload_endpoint_accepts_wav_file(client, sample_wav_path: Path) -> None:
    recording_id = _upload_sample(client, sample_wav_path)

    response = client.get(f"/api/recordings/{recording_id}")

    assert response.status_code == 200
    payload = response.json()
    assert payload["id"] == recording_id
    assert payload["filename"].endswith(".wav")
    assert payload["duration_s"] > 0


def test_recordings_list_supports_pagination(client, sample_wav_path: Path) -> None:
    for index in range(3):
        _upload_sample(client, sample_wav_path, filename=f"sample-{index}.wav")

    response = client.get("/api/recordings", params={"limit": 2, "offset": 1})

    assert response.status_code == 200
    payload = response.json()
    assert payload["total"] == 3
    assert payload["returned"] == 2
    assert len(payload["recordings"]) == 2


def test_recording_detail_response_format(client, sample_wav_path: Path) -> None:
    recording_id = _upload_sample(client, sample_wav_path)

    response = client.get(f"/api/recordings/{recording_id}")

    assert response.status_code == 200
    payload = response.json()
    assert {"id", "filename", "status", "processing", "metadata"} <= set(payload.keys())
    assert payload["processing"]["progress_pct"] >= 0


def test_process_endpoint_triggers_pipeline(client, server_module, sample_wav_path: Path, monkeypatch) -> None:
    recording_id = _upload_sample(client, sample_wav_path)
    observed: dict[str, str] = {}

    async def fake_run_processing(recording_id: str, method: str, aggressiveness: float) -> None:
        observed["recording_id"] = recording_id
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
                    "pesq": None,
                    "peak_frequency_before_hz": 18.0,
                    "peak_frequency_after_hz": 18.0,
                    "spectral_distortion": 0.1,
                    "energy_preservation": 0.9,
                    "quality_score": 80.0,
                    "quality_rating": "good",
                    "flagged_for_review": False,
                },
                "calls": [],
                "processing_time_s": 0.01,
                "output_audio_path": "",
                "spectrogram_before_path": "",
                "spectrogram_after_path": "",
            },
        )
        store.update_status(recording_id, "complete", progress=100, current_stage="complete")

    monkeypatch.setattr(server_module, "_run_processing", fake_run_processing)

    response = client.post(f"/api/recordings/{recording_id}/process")

    assert response.status_code == 200
    assert observed["recording_id"] == recording_id

    detail = client.get(f"/api/recordings/{recording_id}")
    assert detail.status_code == 200
    assert detail.json()["status"] == "complete"


def test_download_returns_valid_audio(client, sample_wav_path: Path) -> None:
    recording_id = _upload_sample(client, sample_wav_path)

    process_response = client.post(f"/api/recordings/{recording_id}/process")
    assert process_response.status_code == 200

    response = client.get(f"/api/recordings/{recording_id}/download")

    assert response.status_code == 200
    assert response.headers["content-type"].startswith("audio/wav")

    downloaded_path = sample_wav_path.parent / "downloaded.wav"
    downloaded_path.write_bytes(response.content)
    waveform, sr = sf.read(downloaded_path, dtype="float32")
    if waveform.ndim > 1:
        waveform = waveform.mean(axis=1)
    assert sr == 44_100
    assert waveform.size > 0
    assert np.isfinite(waveform).all()


def test_export_generates_requested_format(client, sample_wav_path: Path) -> None:
    recording_id = _upload_sample(client, sample_wav_path)

    process_response = client.post(f"/api/recordings/{recording_id}/process")
    assert process_response.status_code == 200

    response = client.post(
        "/api/export/research",
        json={"format": "json", "recording_ids": [recording_id]},
    )

    assert response.status_code == 200
    assert response.headers["content-type"].startswith("application/json")
    assert '"recordings"' in response.text
