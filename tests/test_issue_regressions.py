from __future__ import annotations

import asyncio
import json
from pathlib import Path

import numpy as np
import soundfile as sf

from echofield.data_loader import RecordingStore
from echofield.pipeline.ingestion import validate_audio
from echofield.pipeline.noise_classifier import validate_noise_classifier
from echofield.pipeline.spectral_gate import wiener_filter_denoise
from echofield.research.call_database import CallDatabase
from echofield.utils import logging_config
from echofield.webhook_manager import WebhookManager


def _quality_payload() -> dict:
    return {
        "snr_before_db": 1.0,
        "snr_after_db": 2.0,
        "snr_improvement_db": 1.0,
        "spectral_distortion": 0.1,
        "energy_preservation": 0.9,
        "quality_score": 80.0,
        "quality_rating": "good",
        "flagged_for_review": False,
    }


def _call_payload(call_id: str = "call-regression") -> dict:
    return {
        "id": call_id,
        "recording_id": "rec-regression",
        "start_ms": 0.0,
        "duration_ms": 900.0,
        "frequency_min_hz": 15.0,
        "frequency_max_hz": 85.0,
        "call_type": "rumble",
        "confidence": 0.92,
        "acoustic_features": {
            "mfcc": [0.1, 0.2, 0.3, 0.4],
            "fundamental_frequency_hz": 18.0,
            "spectral_centroid_hz": 42.0,
            "bandwidth_hz": 70.0,
            "harmonicity": 0.8,
        },
    }


def test_upload_content_hash_dedupes(test_client, sample_wav_file: Path) -> None:
    with sample_wav_file.open("rb") as handle:
        first = test_client.post("/api/upload", files={"file": ("sample.wav", handle, "audio/wav")})
    with sample_wav_file.open("rb") as handle:
        second = test_client.post("/api/upload", files={"file": ("sample-copy.wav", handle, "audio/wav")})

    assert first.status_code == 201
    assert second.status_code == 200
    assert second.json()["duplicate"] is True
    assert second.json()["recording_ids"] == first.json()["recording_ids"]

    listing = test_client.get("/api/recordings")
    assert listing.json()["total"] == 1


def test_extended_health_check_reports_components(test_client) -> None:
    response = test_client.get("/health")

    assert response.status_code == 200
    payload = response.json()
    assert payload["status"] in {"ok", "degraded"}
    assert {"cache", "disk", "models", "recordings"}.issubset(payload["components"])


def test_annotations_tags_individuals_and_export(loaded_server, test_client, sample_wav_file: Path) -> None:
    call = _call_payload()
    store = loaded_server.app.state.store
    store.add(
        "rec-regression",
        "sample.wav",
        1.0,
        0.001,
        metadata={"location": "Amboseli", "date": "2026-04-11", "animal_id": "E-1"},
        source_path=str(sample_wav_file),
    )
    store.update_result(
        "rec-regression",
        {
            "recording_id": "rec-regression",
            "status": "complete",
            "stages_completed": ["complete"],
            "noise_types": [],
            "quality": _quality_payload(),
            "calls": [call],
            "processing_time_s": 0.1,
            "output_audio_path": str(sample_wav_file),
            "spectrogram_before_path": "",
            "spectrogram_after_path": "",
        },
    )
    store.update_status("rec-regression", "complete", progress=100, current_stage="complete")
    loaded_server.app.state.call_database.upsert_processed_calls(
        "rec-regression",
        [call],
        metadata={"location": "Amboseli", "date": "2026-04-11", "animal_id": "E-1"},
    )

    created = test_client.post(
        "/api/calls/call-regression/annotations",
        json={"note": "clean low-frequency call", "tags": ["reviewed", "low-frequency"], "researcher_id": "analyst-1"},
    )
    assert created.status_code == 201
    annotation_id = created.json()["id"]

    annotations = test_client.get("/api/calls/call-regression/annotations")
    tagged = test_client.get("/api/calls?tags=reviewed")
    individuals = test_client.get("/api/individuals")
    export = test_client.post(
        "/api/export/research",
        json={"format": "csv", "recording_ids": ["rec-regression"], "include_audio": False},
    )
    deleted = test_client.delete(f"/api/calls/call-regression/annotations/{annotation_id}")

    assert annotations.status_code == 200
    assert annotations.json()[0]["tags"] == ["low-frequency", "reviewed"]
    assert tagged.status_code == 200
    assert tagged.json()["total"] == 1
    assert individuals.status_code == 200
    assert individuals.json()[0]["call_ids"] == ["call-regression"]
    individual_id = individuals.json()[0]["individual_id"]
    individual_calls = test_client.get(f"/api/individuals/{individual_id}/calls")
    assert individual_calls.status_code == 200
    assert individual_calls.json()["items"][0]["individual_id"] == individual_id
    assert export.status_code == 200
    assert "reviewed" in export.text
    assert deleted.status_code == 200
    assert deleted.json()["deleted"] is True


def test_webhook_registration_and_delivery(tmp_path: Path, test_client) -> None:
    registered = test_client.post(
        "/api/webhooks",
        json={"url": "https://example.org/echofield", "event_type": "processing.complete"},
    )
    assert registered.status_code == 201
    webhook_id = registered.json()["id"]

    listing = test_client.get("/api/webhooks")
    assert any(item["id"] == webhook_id for item in listing.json())

    delivered: list[tuple[dict, dict]] = []
    manager = WebhookManager(tmp_path / "webhooks.json")
    manager.register("https://example.org/echofield", "processing.complete")

    async def capture(webhook: dict, payload: dict) -> None:
        delivered.append((webhook, payload))

    manager._deliver = capture  # type: ignore[method-assign]
    asyncio.run(manager.emit("processing.complete", {"recording_id": "rec-1", "status": "complete"}))
    assert delivered[0][1]["event_type"] == "processing.complete"
    assert delivered[0][1]["recording_id"] == "rec-1"

    deleted = test_client.delete(f"/api/webhooks/{webhook_id}")
    assert deleted.status_code == 200


def test_sqlite_backed_recording_and_call_catalogs(tmp_path: Path, sample_wav_file: Path) -> None:
    db_path = tmp_path / "echofield.sqlite"
    store = RecordingStore(persist_path=tmp_path / "catalog.json", db_path=db_path)
    store.add(
        "rec-sqlite",
        "sample.wav",
        1.0,
        0.001,
        metadata={"file_hash": "abc123"},
        source_path=str(sample_wav_file),
        file_hash="abc123",
    )
    reloaded_store = RecordingStore(persist_path=tmp_path / "missing.json", db_path=db_path)
    assert reloaded_store.find_by_hash("abc123")["id"] == "rec-sqlite"

    calls = CallDatabase(db_path=db_path)
    calls.upsert_processed_calls("rec-sqlite", [_call_payload("call-sqlite")], metadata={"animal_id": "E-1"})
    reloaded_calls = CallDatabase(db_path=db_path)
    assert reloaded_calls.get_call("call-sqlite")["animal_id"] == "E-1"


def test_wiener_filter_and_audio_validation() -> None:
    sr = 22_050
    t = np.linspace(0, 1, sr, endpoint=False)
    clean = (0.2 * np.sin(2 * np.pi * 18 * t)).astype(np.float32)
    noisy = (clean + 0.03 * np.random.default_rng(42).standard_normal(sr)).astype(np.float32)

    result = wiener_filter_denoise(noisy, sr)
    assert result["cleaned_audio"].shape == noisy.shape
    assert result["wiener_gain"].ndim == 2
    assert np.isfinite(result["cleaned_audio"]).all()

    repaired, warnings = validate_audio(np.array([0.0, np.nan, np.inf, 0.2], dtype=np.float32), sr)
    assert np.isfinite(repaired).all()
    assert warnings

    try:
        validate_audio(np.array([np.nan, np.inf, np.nan], dtype=np.float32), sr)
    except ValueError as exc:
        assert "too many NaN/Inf" in str(exc)
    else:
        raise AssertionError("validate_audio should reject mostly invalid samples")


def test_noise_classifier_validation_suite(tmp_path: Path) -> None:
    sr = 22_050
    t = np.linspace(0, 1, sr, endpoint=False)
    dataset = tmp_path / "noise"
    samples = {
        "generator": 0.4 * np.sin(2 * np.pi * 60 * t) + 0.2 * np.sin(2 * np.pi * 120 * t),
        "wind": 0.2 * np.sin(2 * np.pi * 900 * t) + 0.15 * np.sin(2 * np.pi * 1200 * t),
        "other": 0.3 * np.sin(2 * np.pi * 3500 * t),
    }
    for label, waveform in samples.items():
        label_dir = dataset / label
        label_dir.mkdir(parents=True)
        sf.write(label_dir / f"{label}.wav", waveform.astype(np.float32), sr)

    report = validate_noise_classifier(dataset)

    assert report["total"] == 3
    assert report["accuracy"] >= 0.99
    assert json.dumps(report["confusion"])


def test_json_logging_includes_trace_fields(capsys) -> None:
    logging_config._configured = False
    logging_config.configure_logging("INFO", "json")
    logger = logging_config.get_logger("echofield.test")

    with logging_config.request_context("req-1", recording_id="rec-1", stage="ingestion"):
        logger.info("stage complete", extra={"duration_ms": 12.5})

    payload = json.loads(capsys.readouterr().out.strip().splitlines()[-1])
    assert payload["request_id"] == "req-1"
    assert payload["recording_id"] == "rec-1"
    assert payload["stage"] == "ingestion"
    assert payload["duration_ms"] == 12.5
    logging_config._configured = False
    logging_config.configure_logging("INFO", "text")
