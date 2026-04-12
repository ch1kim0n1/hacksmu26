from __future__ import annotations

import asyncio
import io
import json
import zipfile
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


def _research_call(call_id: str, recording_id: str, start_ms: float, call_type: str, confidence: float) -> dict:
    fundamental = 18.0 if call_type == "rumble" else 45.0
    return {
        "id": call_id,
        "recording_id": recording_id,
        "start_ms": start_ms,
        "duration_ms": 700.0,
        "frequency_min_hz": 12.0,
        "frequency_max_hz": 95.0,
        "call_type": call_type,
        "confidence": confidence,
        "acoustic_features": {
            "mfcc": [fundamental / 100.0, 0.2, 0.3, 0.4, 0.5],
            "mfcc_delta": [0.01, 0.02, 0.03],
            "fundamental_frequency_hz": fundamental,
            "spectral_centroid_hz": fundamental * 2.0,
            "bandwidth_hz": 80.0,
            "harmonicity": 0.82,
            "snr_db": 8.0,
            "frequency_contour_hz": [fundamental, fundamental + 2.0, fundamental + 1.0],
        },
    }


def _seed_research_recording(loaded_server, sample_wav_file: Path, recording_id: str, calls: list[dict]) -> None:
    metadata = {
        "location": "Amboseli",
        "date": "2026-04-11",
        "recorded_at": "2026-04-11T05:30:00Z",
        "animal_id": "E-1",
    }
    store = loaded_server.app.state.store
    store.add(
        recording_id,
        f"{recording_id}.wav",
        1.0,
        0.001,
        metadata=metadata,
        source_path=str(sample_wav_file),
    )
    store.update_result(
        recording_id,
        {
            "recording_id": recording_id,
            "status": "complete",
            "stages_completed": ["complete"],
            "noise_types": [{"type": "generator", "percentage": 80.0, "frequency_range": [50.0, 250.0]}],
            "quality": _quality_payload(),
            "calls": calls,
            "processing_time_s": 0.25,
            "output_audio_path": str(sample_wav_file),
            "spectrogram_before_path": "",
            "spectrogram_after_path": "",
        },
    )
    store.update_status(recording_id, "complete", progress=100, current_stage="complete")
    loaded_server.app.state.call_database.upsert_processed_calls(recording_id, calls, metadata=metadata)


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


def test_research_timelines_profiles_patterns_and_exports(loaded_server, test_client, sample_wav_file: Path) -> None:
    rec_a_calls = [
        _research_call("research-a1", "research-a", 0.0, "rumble", 0.4),
        _research_call("research-a2", "research-a", 1_200.0, "bark", 0.82),
        _research_call("research-a3", "research-a", 2_400.0, "rumble", 0.91),
    ]
    rec_b_calls = [
        _research_call("research-b1", "research-b", 0.0, "rumble", 0.88),
        _research_call("research-b2", "research-b", 1_200.0, "bark", 0.86),
    ]
    _seed_research_recording(loaded_server, sample_wav_file, "research-a", rec_a_calls)
    _seed_research_recording(loaded_server, sample_wav_file, "research-b", rec_b_calls)

    batch = loaded_server.app.state.batch_store.create(["research-a", "research-b"])
    loaded_server.app.state.batch_store.update(batch["batch_id"], "research-a", status="complete", progress_pct=100)
    loaded_server.app.state.batch_store.update(batch["batch_id"], "research-b", status="complete", progress_pct=100)

    markers = test_client.get("/api/recordings/research-a/markers")
    sequences = test_client.get("/api/recordings/research-a/sequences")
    similar = test_client.get("/api/calls/research-a1/similar")
    compare = test_client.get("/api/calls/compare", params={"call_a": "research-a1", "call_b": "research-a3"})
    overlay = test_client.get(
        "/api/calls/compare-overlay.png",
        params={"call_a": "research-a1", "call_b": "research-a3", "type": "spectrogram"},
    )
    patterns = test_client.get("/api/patterns", params={"min_occurrences": 1})
    heatmap = test_client.get("/api/stats/activity-heatmap", params={"location": "Amboseli"})
    heatmap_png = test_client.get("/api/stats/activity-heatmap.png", params={"location": "Amboseli"})
    sites = test_client.get("/api/sites")
    profile = test_client.get("/api/sites/Amboseli/noise-profile")
    recommendations = test_client.get("/api/sites/Amboseli/recommendations")
    emotion = test_client.get("/api/recordings/research-a/emotion-timeline")
    infrasound = test_client.post(
        "/api/recordings/research-a/infrasound-reveal",
        json={"shift_octaves": 3, "method": "phase_vocoder", "mix_mode": "shifted_only"},
    )
    individuals = test_client.get("/api/individuals", params={"min_confidence": 0.0})
    cross_match = test_client.get("/api/individuals/cross-match", params={"recording_ids": "research-a,research-b", "min_similarity": 0.0})
    references = test_client.get("/api/reference-calls")
    cross_species = test_client.post(
        "/api/compare/cross-species",
        json={"elephant_call_id": "research-a1", "reference_id": "blue_whale_call"},
    )
    cross_species_viz = test_client.get("/api/compare/viz/research-a1/blue_whale_call.png")
    batch_summary = test_client.get(f"/api/batch/{batch['batch_id']}/summary")
    export = test_client.post(
        "/api/export/research",
        json={
            "format": "zip",
            "recording_ids": ["research-a", "research-b"],
            "include_audio": False,
            "include_spectrograms": False,
            "include_fingerprints": True,
            "include_audio_clips": False,
        },
    )

    assert markers.status_code == 200
    assert markers.json()["total_markers"] == 3
    assert markers.json()["summary"]["rumble"] == 2
    assert sequences.status_code == 200
    assert sequences.json()[0]["pattern"] == "rumble -> bark -> rumble"
    assert similar.status_code == 200
    assert similar.json()["matches"]
    assert compare.status_code == 200
    assert compare.json()["similarity_score"] > 0.0
    assert overlay.status_code == 200
    assert overlay.headers["content-type"] == "image/png"
    assert patterns.status_code == 200
    assert patterns.json()[0]["occurrences"] >= 1
    assert heatmap.status_code == 200
    assert heatmap.json()["total_calls"] == 5
    assert heatmap_png.status_code == 200
    assert heatmap_png.headers["content-type"] == "image/png"
    assert sites.status_code == 200
    assert {"location": "Amboseli", "recording_count": 2} in sites.json()
    assert profile.status_code == 200
    assert profile.json()["noise_sources"][0]["noise_type"] == "generator"
    assert recommendations.status_code == 200
    assert recommendations.json()["recommendations"]
    assert emotion.status_code == 200
    assert emotion.json()["recording_summary"]["dominant_state"]
    assert infrasound.status_code == 200
    assert infrasound.json()["shifted_audio_url"].endswith("/audio/infrasound-shifted")
    shifted_audio = test_client.get("/api/recordings/research-a/audio/infrasound-shifted")
    assert shifted_audio.status_code == 200
    assert individuals.status_code == 200
    assert individuals.json()
    assert cross_match.status_code == 200
    assert references.status_code == 200
    assert len(references.json()) >= 4
    assert cross_species.status_code == 200
    assert cross_species.json()["comparison"]["frequency_overlap_pct"] >= 0
    assert cross_species_viz.status_code == 200
    assert cross_species_viz.headers["content-type"] == "image/png"
    assert batch_summary.status_code == 200
    assert batch_summary.json()["total_calls_detected"] == 5
    assert batch_summary.json()["call_type_distribution"]["rumble"] == 3
    assert export.status_code == 200

    with zipfile.ZipFile(io.BytesIO(export.content)) as archive:
        names = set(archive.namelist())
    assert {"DATA_DICTIONARY.md", "calls.csv", "fingerprints.npy", "fingerprint_ids.json"}.issubset(names)


def test_review_queue_actions_and_classifier_retrain(loaded_server, test_client, sample_wav_file: Path, monkeypatch) -> None:
    calls = [
        _research_call("review-a1", "review-a", 0.0, "rumble", 0.32),
        _research_call("review-a2", "review-a", 1_000.0, "rumble", 0.78),
        _research_call("review-a3", "review-a", 2_000.0, "bark", 0.81),
        _research_call("review-a4", "review-a", 3_000.0, "rumble", 0.83),
        _research_call("review-a5", "review-a", 4_000.0, "bark", 0.84),
    ]
    _seed_research_recording(loaded_server, sample_wav_file, "review-a", calls)

    queue = test_client.get("/api/review-queue", params={"max_confidence": 0.5})
    reviewed = test_client.post(
        "/api/calls/review-a1/review",
        json={"action": "reclassify", "corrected_call_type": "bark", "reviewer": "analyst-1"},
    )

    def fake_train_classifier(training_data: list[dict], model_path: Path) -> dict:
        Path(model_path).parent.mkdir(parents=True, exist_ok=True)
        Path(model_path).write_bytes(b"fake-model")
        return {
            "samples": len(training_data),
            "classes": 2,
            "accuracy": 1.0,
            "ece": 0.0,
            "class_distribution": {"rumble": 3, "bark": 2},
        }

    monkeypatch.setattr(loaded_server, "train_classifier", fake_train_classifier)
    monkeypatch.setattr(loaded_server, "load_classifier", lambda path: None)
    retrained = test_client.post("/api/classifier/retrain")

    assert queue.status_code == 200
    assert queue.json()["total"] == 1
    assert queue.json()["items"][0]["id"] == "review-a1"
    assert reviewed.status_code == 200
    assert reviewed.json()["review_status"] == "corrected"
    assert reviewed.json()["corrected_call_type"] == "bark"
    assert retrained.status_code == 200
    assert retrained.json()["status"] == "trained"
    assert retrained.json()["samples"] == 5
    assert retrained.json()["registry_version"]["active"] is True


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
