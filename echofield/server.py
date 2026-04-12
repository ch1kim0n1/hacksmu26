"""EchoField FastAPI application."""

from __future__ import annotations

import asyncio
import hashlib
import io
import json
import shutil
import uuid
from collections import Counter
from contextlib import asynccontextmanager
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

import numpy as np
import aiofiles
import numpy as np
from fastapi import BackgroundTasks, Depends, FastAPI, File, Header, HTTPException, Query, Request, Response, UploadFile, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, PlainTextResponse, StreamingResponse
from fastapi.staticfiles import StaticFiles

from echofield.auth import (
    Auth0Client,
    Auth0TokenVerifier,
    AuthenticatedUser,
    authenticated_user_from_request,
    auth0_middleware,
    auth_config_payload,
    require_permissions,
)
from echofield.batch_store import BatchStore
from echofield.config import get_settings
from echofield.ml.active_learning import ActiveLearningManager
from echofield.ml.classifier import CallClassifier
from echofield.ml.narrative import generate_narrative
from echofield.ml.taxonomy import validate_call_type, validate_social_function, CALL_TYPES, SOCIAL_FUNCTIONS
from echofield.data_loader import RecordingStore, list_recordings_with_metadata
from echofield.metrics import metrics
from echofield.model_registry import ModelRegistry
from echofield.models import (
    AnnotationRequest,
    ActivityHeatmapResponse,
    Auth0Response,
    Auth0UserProfileResponse,
    AuthConfigResponse,
    AuthLoginUrlRequest,
    AuthLoginUrlResponse,
    AuthRoleAssignmentRequest,
    AuthTokenExchangeRequest,
    AuthTokenResponse,
    AuthUserMetadataPatchRequest,
    AuthenticatedUserResponse,
    BatchRecordingSummary,
    BatchSummaryResponse,
    BatchStatusResponse,
    BatchSubmitResponse,
    CallAnnotation,
    CallListResponse,
    CallMarker,
    CallRecord,
    CallSequenceModel,
    ComponentHealth,
    ContourMatch,
    ContourMatchResponse,
    CrossSpeciesComparisonResponse,
    CrossSpeciesRequest,
    EmbeddingResponse,
    EmotionTimelineResponse,
    ErrorResponse,
    ExportRequest,
    HarmonicOverlayResponse,
    HealthResponse,
    IndividualCluster,
    InfrasoundRevealRequest,
    InfrasoundRevealResponse,
    IndividualMatch,
    IndividualProfile,
    MarkerResponse,
    MetadataPatchRequest,
    ModelVersionInfo,
    PatternModel,
    MfaChallengeRequest,
    MfaOtpVerifyRequest,
    ProcessingResult,
    ProcessingStatusModel,
    PasswordlessStartRequest,
    PasswordlessVerifyRequest,
    RecordingDetail,
    RecordingListResponse,
    RecordingMetadata,
    RecordingSummary,
    RecordingStatus,
    ResearchStatsResponse,
    ReviewActionRequest,
    ReviewLabelRequest,
    ReviewQueueResponse,
    SimilarCallsResponse,
    SimilarityEdge,
    SimilarityGraphResponse,
    SimilarityNode,
    SiteNoiseProfile,
    SiteSummary,
    StatsRequest,
    StatsResponse,
    UploadResponse,
    WebhookConfig,
)
from echofield.pipeline.cache_manager import CacheManager
from echofield.pipeline.spectrogram import compute_stft, generate_spectrogram_png, SUPPORTED_COLORMAPS
from echofield.pipeline.infrasound import detect_infrasound_regions, create_infrasound_reveal
from echofield.pipeline.circuit_breaker import get_circuit_breaker_registry
from echofield.pipeline.hybrid_pipeline import ProcessingPipeline
from echofield.pipeline.ingestion import validate_audio, validate_magic_bytes
from echofield.research.call_database import CallDatabase
from echofield.pipeline.feature_extract import (
    extract_acoustic_features,
    get_harmonic_peaks,
    load_classifier,
    train_classifier,
)
from echofield.pipeline.infrasound import create_infrasound_reveal
from echofield.research.acoustic_analysis import (
    build_identity_signature,
    build_similarity_graph,
    compare_groups,
    compute_embedding,
    contour_similarity,
    harmonic_to_noise_ratio,
    SimilarityMatrixCache,
    track_frequency_contour,
)
from echofield.research.cross_species import REFERENCE_CALLS, compare_call_to_reference
from echofield.research.emotion_classifier import build_emotion_timeline
from echofield.research.exporter import export_csv, export_json, export_pdf, export_zip
from echofield.research.call_fingerprint import top_k_similar
from echofield.research.individual_id import IndividualIdentifier
from echofield.research.sequence_analyzer import extract_sequences, find_recurring_patterns
from echofield.research.site_profiler import build_activity_heatmap, build_site_profile, list_sites
from echofield.research.voice_id import cluster_individuals, match_across_recordings
from echofield.utils.audio_utils import get_duration, load_audio, save_audio
from echofield.utils.logging_config import get_logger, request_context
from echofield.webhook_manager import WebhookManager
from echofield.websocket import manager

logger = get_logger(__name__)


def _serialize_result(result: dict[str, Any]) -> dict[str, Any]:
    serialized = json.loads(json.dumps(result, default=str))
    return serialized


@asynccontextmanager
async def lifespan(application: FastAPI):
    settings = get_settings()
    settings.ensure_directories()
    try:
        from echofield.db import init_db

        await init_db(settings.db_path)
    except Exception as exc:
        logger.warning("SQLite initialization skipped: %s", exc)
    store = RecordingStore(persist_path=settings.catalog_file, db_path=settings.db_path)
    preload = list_recordings_with_metadata(settings.audio_dir, settings.metadata_file)
    store.load_many(preload)
    application.state.call_database = CallDatabase.from_metadata(
        settings.metadata_file,
        review_label_path=settings.cache_dir / "review_labels.json",
        db_path=settings.db_path,
    )
    application.state.store = store
    application.state.cache = CacheManager(str(settings.cache_dir))
    application.state.pipeline = ProcessingPipeline(settings, application.state.cache)
    application.state.processing_tasks = {}
    application.state.batch_store = BatchStore()
    application.state.model_registry = ModelRegistry(settings.model_registry_dir)
    application.state.embedding_cache = {}
    application.state.similarity_cache = SimilarityMatrixCache(settings.cache_dir / "similarity_cache.json")
    application.state.webhook_manager = WebhookManager(settings.cache_dir / "webhooks.json")
    application.state.individual_identifier = IndividualIdentifier()
    application.state.batch_webhooks_emitted = set()
    application.state.ml_classifier = CallClassifier()
    application.state.al_manager = ActiveLearningManager()
    active_model = application.state.model_registry.active_model_path()
    load_classifier(active_model or settings.classifier_model_path)
    try:
        yield
    finally:
        tasks: dict[str, asyncio.Task] = application.state.processing_tasks
        for task in list(tasks.values()):
            task.cancel()


app = FastAPI(
    title="EchoField API",
    version="0.2.0",
    description="Elephant vocalization enhancement, analysis, and export platform.",
    lifespan=lifespan,
)

settings = get_settings()
auth0_verifier = Auth0TokenVerifier(settings)
auth0_client = Auth0Client(settings)
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.CORS_ORIGINS,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)
app.mount("/spectrograms", StaticFiles(directory=str(settings.spectrogram_dir)), name="spectrograms")
app.mount("/processed", StaticFiles(directory=str(settings.processed_dir)), name="processed")


@app.middleware("http")
async def require_auth0_access_token(request: Request, call_next):
    return await auth0_middleware(request, call_next, settings, auth0_verifier)


@app.middleware("http")
async def add_request_context(request: Request, call_next):
    started = datetime.now(timezone.utc)
    request_id = request.headers.get("x-request-id") or uuid.uuid4().hex
    with request_context(request_id):
        response = await call_next(request)
    response.headers["x-request-id"] = request_id
    duration = (datetime.now(timezone.utc) - started).total_seconds()
    route_path = request.scope.get("route").path if request.scope.get("route") else request.url.path
    metrics.inc(
        "echofield_http_requests_total",
        labels={"method": request.method, "path": str(route_path), "status": str(response.status_code)},
    )
    metrics.observe(
        "echofield_http_request_duration_seconds",
        duration,
        {"method": request.method, "path": str(route_path), "status": str(response.status_code)},
    )
    return response


def _get_store() -> RecordingStore:
    return app.state.store  # type: ignore[return-value]


def _get_pipeline() -> ProcessingPipeline:
    return app.state.pipeline  # type: ignore[return-value]


def _get_call_database() -> CallDatabase:
    return app.state.call_database  # type: ignore[return-value]


def _get_tasks() -> dict[str, asyncio.Task]:
    return app.state.processing_tasks  # type: ignore[return-value]


def _get_batch_store() -> BatchStore:
    return app.state.batch_store  # type: ignore[return-value]


def _get_model_registry() -> ModelRegistry:
    return app.state.model_registry  # type: ignore[return-value]


def _get_similarity_cache() -> SimilarityMatrixCache:
    return app.state.similarity_cache  # type: ignore[return-value]


def _get_webhooks() -> WebhookManager:
    return app.state.webhook_manager  # type: ignore[return-value]


def _get_individual_identifier() -> IndividualIdentifier:
    return app.state.individual_identifier  # type: ignore[return-value]


def _get_ml_classifier() -> CallClassifier:
    return app.state.ml_classifier  # type: ignore[return-value]


def _get_al_manager() -> ActiveLearningManager:
    return app.state.al_manager  # type: ignore[return-value]


async def _emit_webhook(event_type: str, payload: dict[str, Any]) -> None:
    await _get_webhooks().emit(
        event_type,
        {
            **payload,
            "timestamp": datetime.now(timezone.utc).isoformat(),
        },
    )


async def _maybe_emit_batch_complete(batch_id: str | None) -> None:
    if not batch_id:
        return
    batch = _get_batch_store().get(batch_id)
    if not batch or batch.get("status") == "processing":
        return
    emitted: set[str] = app.state.batch_webhooks_emitted
    if batch_id in emitted:
        return
    emitted.add(batch_id)
    await _emit_webhook(
        "batch.complete",
        {
            "batch_id": batch_id,
            "status": batch["status"],
            "payload": batch,
        },
    )


def _get_recording_path(recording: dict[str, Any]) -> Path:
    if recording.get("source_path"):
        return Path(recording["source_path"])
    return settings.audio_dir / recording["filename"]


def _audio_media_type(path: Path) -> str:
    return {
        ".wav": "audio/wav",
        ".mp3": "audio/mpeg",
        ".flac": "audio/flac",
    }.get(path.suffix.lower(), "application/octet-stream")


def _to_summary(recording: dict[str, Any]) -> RecordingSummary:
    result = recording.get("result") or {}
    quality = result.get("quality") or {}
    return RecordingSummary(
        id=recording["id"],
        filename=recording["filename"],
        duration_s=float(recording.get("duration_s", 0.0)),
        filesize_mb=float(recording.get("filesize_mb", 0.0)),
        uploaded_at=recording["uploaded_at"],
        status=RecordingStatus(recording["status"]),
        metadata=RecordingMetadata(**(recording.get("metadata") or {})) if recording.get("metadata") else None,
        processing=ProcessingStatusModel(
            started_at=recording["processing"].get("started_at"),
            completed_at=recording["processing"].get("completed_at"),
            progress_pct=float(recording["processing"].get("progress", 0.0)),
            duration_s=recording["processing"].get("duration_s"),
            current_stage=recording["processing"].get("current_stage"),
        ),
        calls_detected=len(result.get("calls", [])),
        snr_improvement_db=quality.get("snr_improvement_db"),
    )


def _to_detail(recording: dict[str, Any]) -> RecordingDetail:
    result = recording.get("result")
    return RecordingDetail(
        **_to_summary(recording).model_dump(),
        result=ProcessingResult(**result) if result else None,
    )


def _elapsed_seconds(started_at: str | None) -> float | None:
    if not started_at:
        return None
    try:
        started = datetime.fromisoformat(started_at.replace("Z", "+00:00"))
        return max((datetime.now(timezone.utc) - started).total_seconds(), 0.0)
    except ValueError:
        return None


def _status_payload(recording: dict[str, Any]) -> dict[str, Any]:
    processing = recording.get("processing") or {}
    progress = float(processing.get("progress", 0.0))
    stage = processing.get("current_stage")
    elapsed = _elapsed_seconds(processing.get("started_at"))
    estimated_remaining = None
    if elapsed is not None and progress > 0 and progress < 100:
        estimated_remaining = round(elapsed * (100.0 - progress) / progress, 2)
    status = recording.get("status", "pending")
    if status == "complete":
        message = "Processing complete"
    elif status == "failed":
        message = "Processing failed"
    elif status == "cancelled":
        message = "Processing cancelled"
    elif status == "pending":
        message = "Pending processing"
    else:
        message = "Processing in progress"
    return {
        "id": recording["id"],
        "status": status,
        "progress_pct": progress,
        "stage": stage,
        "elapsed_s": round(elapsed, 2) if elapsed is not None else None,
        "estimated_remaining_s": estimated_remaining,
        "message": message,
    }


def _enrich_call(call: dict[str, Any], recording: dict[str, Any] | None = None) -> dict[str, Any]:
    payload = dict(call)
    if recording is None and payload.get("recording_id"):
        recording = _get_store().get(str(payload["recording_id"]))
    metadata = (recording.get("metadata") if recording else payload.get("metadata")) or {}
    if recording is not None:
        payload.setdefault("recording_id", recording.get("id"))
    for key in ("call_id", "animal_id", "noise_type_ref", "start_sec", "end_sec", "location", "date", "species"):
        if payload.get(key) in {None, ""} and metadata.get(key) not in {None, ""}:
            payload[key] = metadata[key]
    payload.setdefault("call_id", payload.get("id"))
    if "metadata" not in payload:
        payload["metadata"] = metadata
    try:
        from echofield.research.ethology_annotations import get_annotation

        payload["ethology"] = get_annotation(str(payload.get("call_type") or ""))
    except Exception:
        payload.setdefault("ethology", None)
    try:
        from echofield.research.reference_library import match_against_references

        fingerprint = payload.get("fingerprint") or []
        payload["reference_matches"] = match_against_references(fingerprint, top_k=7) if fingerprint else []
    except Exception:
        payload.setdefault("reference_matches", [])
    try:
        from echofield.research.summary_generator import compute_publishability_score

        result = (recording or {}).get("result") or {}
        quality = result.get("quality") or {}
        payload["publishability"] = compute_publishability_score(
            float(quality.get("snr_after_db") or (payload.get("acoustic_features") or {}).get("snr_db") or 0.0),
            float(quality.get("energy_preservation") or 0.5),
            float(quality.get("spectral_distortion") or 0.0),
            float(payload.get("confidence") or 0.0),
        )
    except Exception:
        payload.setdefault("publishability", None)
    return payload


def _all_recordings() -> list[dict[str, Any]]:
    return list(getattr(_get_store(), "_recordings", {}).values())


def _call_speaker_id(call: dict[str, Any]) -> str | None:
    for key in ("individual_id", "speaker_id", "cluster_id", "animal_id"):
        value = call.get(key)
        if value and str(value).strip():
            return str(value).strip()

    features = call.get("acoustic_features") or {}
    f0 = call.get("speaker_fundamental_hz") or features.get("fundamental_frequency_hz")
    try:
        f0_value = float(f0 or 0.0)
    except (TypeError, ValueError):
        f0_value = 0.0
    if f0_value > 0.0:
        bucket_hz = int(round(f0_value / 5.0) * 5)
        return f"voice_{bucket_hz}hz"
    return None


def _research_impact_payload() -> dict[str, Any]:
    base_stats = _get_store().get_stats()
    calls = _all_calls()
    total_calls = len(calls)
    publishable = sum(
        1
        for call in calls
        if float((call.get("acoustic_features") or {}).get("snr_db") or 0.0) >= 20
        or float(call.get("confidence") or 0.0) >= 0.85
    )
    individual_ids = {_call_speaker_id(call) for call in calls if _call_speaker_id(call)}
    noise_types: dict[str, int] = {}
    for call in calls:
        noise_type = (call.get("metadata") or {}).get("noise_type_ref") or call.get("noise_type_ref")
        if noise_type:
            key = str(noise_type)
            noise_types[key] = noise_types.get(key, 0) + 1
    total_duration_s = sum(
        float(call.get("duration_ms") or 0.0) / 1000.0
        for call in calls
        if float(call.get("confidence") or 0.0) >= 0.7
    )
    snr_improvements = []
    noise_removed_estimates = []
    recordings_saved = 0
    for record in _all_recordings():
        result = record.get("result") or {}
        quality = result.get("quality") or {}
        quality_score = float(quality.get("quality_score") or 0.0)
        if quality_score >= 55:
            recordings_saved += 1
        improvement = quality.get("snr_improvement_db")
        if improvement is not None:
            snr_improvements.append(float(improvement))
        before = quality.get("snr_before_db")
        after = quality.get("snr_after_db")
        if before is not None and after is not None and float(after) > float(before):
            noise_removed_estimates.append(min(99.0, max(0.0, (float(after) - float(before)) / max(abs(float(after)), 1.0) * 100.0)))
    avg_snr = round(sum(snr_improvements) / max(len(snr_improvements), 1), 2)
    noise_removed = round(sum(noise_removed_estimates) / max(len(noise_removed_estimates), 1), 1)
    return {
        **base_stats,
        "calls_recovered": total_calls,
        "publishable_calls": publishable,
        "recordings_saved": recordings_saved,
        "noise_types_defeated": noise_types,
        "avg_snr_improvement_db": avg_snr,
        "total_noise_energy_removed_percent": noise_removed,
        "total_noise_energy_removed_pct": noise_removed,
        "speakers_identified": len(individual_ids),
        "hours_of_clean_audio": round(total_duration_s / 3600.0, 3),
    }


def _identify_calls(call_type: str | None = None) -> tuple[list[dict[str, Any]], dict[str, str]]:
    calls, _ = _get_call_database().search(call_type=call_type, limit=10000)
    assignments = _get_individual_identifier().cluster(calls)
    _get_call_database().set_individual_ids(assignments)
    for call in calls:
        call["individual_id"] = assignments.get(str(call.get("id")), call.get("individual_id"))
    return calls, assignments


def _recordings_with_call_database_fields(recordings: list[dict[str, Any]]) -> list[dict[str, Any]]:
    merged: list[dict[str, Any]] = []
    call_database = _get_call_database()
    for recording in recordings:
        item = dict(recording)
        result = dict(item.get("result") or {})
        calls = []
        for call in result.get("calls", []):
            enriched = dict(call)
            db_call = call_database.get_call(str(call.get("id") or call.get("call_id") or ""))
            if db_call is not None:
                for key in (
                    "annotations",
                    "individual_id",
                    "cluster_id",
                    "fingerprint",
                    "fingerprint_version",
                    "sequence_id",
                    "sequence_position",
                    "color",
                    "review_label",
                    "review_status",
                    "original_call_type",
                    "corrected_call_type",
                    "reviewed_by",
                    "reviewed_at",
                ):
                    enriched[key] = db_call.get(key)
            calls.append(enriched)
        result["calls"] = calls
        item["result"] = result
        merged.append(item)
    return merged


def _all_calls(limit: int = 10000) -> list[dict[str, Any]]:
    calls, _ = _get_call_database().search(limit=limit)
    return calls


def _calls_for_recording(recording_id: str) -> list[dict[str, Any]]:
    calls, _ = _get_call_database().search(recording_id=recording_id, limit=10000)
    if calls:
        return calls
    recording = _get_store().get(recording_id)
    result = (recording or {}).get("result") or {}
    return list(result.get("calls") or [])


def _marker_payload(recording_id: str) -> dict[str, Any]:
    calls = _calls_for_recording(recording_id)
    markers = []
    summary: Counter[str] = Counter()
    for call in calls:
        start_ms = float(call.get("start_ms") or 0.0)
        duration_ms = float(call.get("duration_ms") or 0.0)
        call_type = str(call.get("call_type") or "unknown")
        summary[call_type] += 1
        markers.append({
            "id": str(call.get("id")),
            "start_ms": round(start_ms, 2),
            "end_ms": round(float(call.get("end_ms") or start_ms + duration_ms), 2),
            "duration_ms": round(duration_ms, 2),
            "call_type": call_type,
            "confidence": float(call.get("confidence") or 0.0),
            "color": call.get("color") or "#6B7280",
            "acoustic_features": call.get("acoustic_features") or {},
        })
    return {
        "recording_id": recording_id,
        "total_markers": len(markers),
        "markers": markers,
        "summary": dict(summary),
    }


def _batch_summary(batch_id: str) -> dict[str, Any]:
    batch = _get_batch_store().get(batch_id)
    if batch is None:
        raise HTTPException(status_code=404, detail="Batch not found")
    summaries = []
    call_type_distribution: Counter[str] = Counter()
    quality_scores = []
    snr_values = []
    total_processing_time = 0.0
    all_calls = []
    for item in batch["results"]:
        recording_id = item["recording_id"]
        recording = _get_store().get(recording_id) or {}
        result = recording.get("result") or {}
        calls = list(result.get("calls") or [])
        all_calls.extend(calls)
        for call in calls:
            call_type_distribution[str(call.get("call_type") or "unknown")] += 1
        quality = result.get("quality") or {}
        if quality.get("quality_score") is not None:
            quality_scores.append(float(quality["quality_score"]))
        if quality.get("snr_improvement_db") is not None:
            snr_values.append(float(quality["snr_improvement_db"]))
        total_processing_time += float(result.get("processing_time_s") or 0.0)
        dominant = Counter(str(call.get("call_type") or "unknown") for call in calls).most_common(1)
        summaries.append({
            "recording_id": recording_id,
            "filename": recording.get("filename"),
            "calls_detected": len(calls),
            "dominant_call_type": dominant[0][0] if dominant else None,
            "quality_score": quality.get("quality_score"),
            "snr_improvement_db": quality.get("snr_improvement_db"),
            "status": item.get("status"),
        })
    sequences = extract_sequences(all_calls)
    return {
        "batch_id": batch_id,
        "status": batch["status"],
        "recordings": batch["total"],
        "total_calls_detected": len(all_calls),
        "call_type_distribution": dict(call_type_distribution),
        "quality_scores": {
            "avg": round(sum(quality_scores) / len(quality_scores), 2) if quality_scores else None,
            "min": min(quality_scores) if quality_scores else None,
            "max": max(quality_scores) if quality_scores else None,
        },
        "avg_snr_improvement_db": round(sum(snr_values) / len(snr_values), 2) if snr_values else None,
        "total_processing_time_s": round(total_processing_time, 2),
        "recordings_summary": summaries,
        "shared_patterns": find_recurring_patterns(sequences),
    }


def _filter_export_recordings(recordings: list[dict[str, Any]], request: ExportRequest) -> list[dict[str, Any]]:
    allowed_types = {call_type.lower() for call_type in request.call_types}
    filtered = []
    for recording in recordings:
        item = dict(recording)
        result = dict(item.get("result") or {})
        calls = []
        for call in result.get("calls", []):
            if allowed_types and str(call.get("call_type") or "").lower() not in allowed_types:
                continue
            if request.min_confidence is not None and float(call.get("confidence") or 0.0) < request.min_confidence:
                continue
            calls.append(call)
        result["calls"] = calls
        item["result"] = result
        filtered.append(item)
    return filtered


async def _progress_callback(
    recording_id: str,
    stage: str,
    status: str,
    progress: int,
    data: dict[str, Any] | None = None,
) -> None:
    store = _get_store()
    if status == "failed":
        store.update_status(recording_id, "failed", progress=progress, current_stage=stage)
        await manager.send_processing_failed(recording_id, (data or {}).get("error", "Processing failed"))
        return

    store.update_status(recording_id, "processing" if stage != "complete" else "complete", progress=progress, current_stage=stage)
    await manager.send_stage_update(recording_id, stage, status, progress, data)
    if data and data.get("spectrogram_url"):
        await manager.send_spectrogram_update(
            recording_id,
            str(data["spectrogram_url"]),
            str(data.get("variant", "default")),
        )
    if stage == "noise_classification" and data:
        await manager.send_noise_classified(
            recording_id,
            str(data.get("noise_type", "other")),
            float(data.get("confidence", 0.0)),
            list(data.get("frequency_range", [0.0, 0.0])),
        )
    if data and data.get("quality"):
        await manager.send_quality_score(recording_id, data["quality"])


def _cleanup_partial_outputs(recording_id: str) -> None:
    for directory in (settings.processed_dir, settings.spectrogram_dir):
        if not directory.exists():
            continue
        for path in directory.glob(f"{recording_id}*"):
            if path.is_file():
                path.unlink(missing_ok=True)


async def _run_processing(
    recording_id: str,
    method: str,
    aggressiveness: float,
    batch_id: str | None = None,
    preset: str | None = None,
) -> None:
    store = _get_store()
    recording = store.get(recording_id)
    if recording is None:
        return
    source_path = _get_recording_path(recording)
    if not source_path.exists():
        store.update_status(recording_id, "failed", current_stage="ingestion")
        await manager.send_processing_failed(recording_id, f"Audio file not found: {source_path}")
        return

    try:
        with request_context(recording_id, recording_id=recording_id):
            metrics.set_gauge("echofield_pipeline_active_jobs", len(_get_tasks()) or 1)
            await manager.send_processing_started(recording_id, method)
            result = await _get_pipeline().process_recording(
                recording_id,
                str(source_path),
                str(settings.processed_dir),
                str(settings.spectrogram_dir),
                method="demo" if preset == "demo" else method,
                aggressiveness=aggressiveness,
                progress_callback=lambda stage, status, progress, data=None: _progress_callback(
                    recording_id,
                    stage,
                    status,
                    progress,
                    {**(data or {}), **({"batch_id": batch_id} if batch_id else {})},
                ),
            )
            result = _serialize_result(result)
            store.update_result(recording_id, result)
            _get_call_database().upsert_processed_calls(
                recording_id=recording_id,
                calls=list(result.get("calls") or []),
                metadata={
                    **(recording.get("metadata") or {}),
                    "filename": recording.get("filename"),
                },
            )
            _get_similarity_cache().invalidate()
            store.update_status(
                recording_id,
                "complete",
                progress=100,
                current_stage="complete",
                duration_s=result.get("processing_time_s"),
            )
            await manager.send_quality_score(recording_id, result["quality"])
            await manager.send_processing_complete(recording_id, result)
            if batch_id:
                _get_batch_store().update(batch_id, recording_id, status="complete", progress_pct=100)
                await _maybe_emit_batch_complete(batch_id)
            await _emit_webhook(
                "processing.complete",
                {
                    "recording_id": recording_id,
                    "status": "complete",
                    "quality": result.get("quality"),
                    "payload": result,
                },
            )
            metrics.inc("echofield_pipeline_jobs_total", labels={"status": "complete"})
    except asyncio.CancelledError:
        logger.info("Processing cancelled for %s", recording_id)
        _cleanup_partial_outputs(recording_id)
        store.update_status(recording_id, "cancelled", current_stage="cancelled")
        if batch_id:
            _get_batch_store().update(batch_id, recording_id, status="cancelled", progress_pct=0)
            await _maybe_emit_batch_complete(batch_id)
        metrics.inc("echofield_pipeline_jobs_total", labels={"status": "cancelled"})
        raise
    except Exception as exc:
        logger.exception("Processing failed for %s", recording_id)
        store.update_status(recording_id, "failed", current_stage="complete")
        await manager.send_processing_failed(recording_id, str(exc))
        if batch_id:
            _get_batch_store().update(batch_id, recording_id, status="failed", progress_pct=0, error=str(exc))
            await _maybe_emit_batch_complete(batch_id)
        await _emit_webhook(
            "processing.failed",
            {
                "recording_id": recording_id,
                "status": "failed",
                "payload": {"error": str(exc)},
            },
        )
        metrics.inc("echofield_pipeline_jobs_total", labels={"status": "failed"})
    finally:
        _get_tasks().pop(recording_id, None)
        metrics.set_gauge("echofield_pipeline_active_jobs", len(_get_tasks()))


@app.get("/health", response_model=HealthResponse)
async def health_check() -> HealthResponse:
    components: dict[str, ComponentHealth] = {}
    overall = "ok"

    try:
        cache_stats = _get_store().get_stats()
        cache_manager_stats = _get_pipeline().cache.get_stats()
        components["cache"] = ComponentHealth(status="ok", details={**cache_manager_stats, **cache_stats})
    except Exception as exc:
        components["cache"] = ComponentHealth(status="error", details={"error": str(exc)})
        overall = "degraded"

    try:
        usage = shutil.disk_usage(settings.processed_dir)
        free_gb = round(usage.free / (1024 ** 3), 3)
        disk_status = "degraded" if free_gb < 1.0 else "ok"
        components["disk"] = ComponentHealth(status=disk_status, details={"free_gb": free_gb})
        if disk_status != "ok":
            overall = "degraded"
    except Exception as exc:
        components["disk"] = ComponentHealth(status="error", details={"error": str(exc)})
        overall = "degraded"

    try:
        versions = _get_model_registry().list_versions()
        active = next((item for item in versions if item.get("active")), None)
        components["models"] = ComponentHealth(
            status="ok" if active else "degraded",
            details={
                "classifier": "loaded" if active else "fallback",
                "version": active.get("version") if active else None,
                "registered_versions": len(versions),
            },
        )
        if active is None:
            overall = "degraded"
    except Exception as exc:
        components["models"] = ComponentHealth(status="error", details={"error": str(exc)})
        overall = "degraded"

    try:
        recordings = list(_get_store()._recordings.values())
        components["recordings"] = ComponentHealth(
            status="ok",
            details={
                "total": len(recordings),
                "processing": sum(1 for item in recordings if item.get("status") == "processing"),
            },
        )
    except Exception as exc:
        components["recordings"] = ComponentHealth(status="error", details={"error": str(exc)})
        overall = "degraded"

    return HealthResponse(status=overall, version=str(app.version), components=components)


def _auth_user_response(user: AuthenticatedUser) -> AuthenticatedUserResponse:
    return AuthenticatedUserResponse(
        sub=user.sub,
        scopes=sorted(user.scopes),
        permissions=sorted(user.permissions),
        roles=sorted(user.roles),
        claims=user.claims,
    )


def _auth_profile_response(profile: dict[str, Any]) -> Auth0UserProfileResponse:
    return Auth0UserProfileResponse(
        user_id=str(profile.get("user_id") or profile.get("sub") or ""),
        email=profile.get("email"),
        name=profile.get("name"),
        picture=profile.get("picture"),
        user_metadata=profile.get("user_metadata") or {},
        app_metadata=profile.get("app_metadata") or {},
        raw=profile,
    )


@app.get("/api/auth/config", response_model=AuthConfigResponse)
async def get_auth_config() -> dict[str, Any]:
    return auth_config_payload(settings)


@app.post("/api/auth/login-url", response_model=AuthLoginUrlResponse)
async def create_auth_login_url(payload: AuthLoginUrlRequest) -> AuthLoginUrlResponse:
    url = auth0_client.authorize_url(
        redirect_uri=payload.redirect_uri,
        connection=payload.connection,
        organization=payload.organization,
        screen_hint=payload.screen_hint,
        prompt=payload.prompt,
        state=payload.state,
        scope=payload.scope,
        code_challenge=payload.code_challenge,
        code_challenge_method=payload.code_challenge_method,
    )
    return AuthLoginUrlResponse(url=url, connection=payload.connection, organization=payload.organization)


@app.post("/api/auth/token/exchange", response_model=AuthTokenResponse)
async def exchange_auth_code(payload: AuthTokenExchangeRequest) -> dict[str, Any]:
    return await auth0_client.exchange_authorization_code(
        code=payload.code,
        redirect_uri=payload.redirect_uri,
        code_verifier=payload.code_verifier,
    )


@app.post("/api/auth/passwordless/start", response_model=Auth0Response)
async def start_passwordless_login(payload: PasswordlessStartRequest) -> dict[str, Any]:
    return await auth0_client.passwordless_start(
        connection=payload.connection,
        email=payload.email,
        phone_number=payload.phone_number,
        send=payload.send,
        redirect_uri=payload.redirect_uri,
        scope=payload.scope,
    )


@app.post("/api/auth/passwordless/verify", response_model=AuthTokenResponse)
async def verify_passwordless_login(payload: PasswordlessVerifyRequest) -> dict[str, Any]:
    return await auth0_client.passwordless_verify(
        connection=payload.connection,
        username=payload.username,
        otp=payload.otp,
        scope=payload.scope,
    )


@app.post("/api/auth/mfa/challenge", response_model=Auth0Response)
async def start_mfa_challenge(payload: MfaChallengeRequest) -> dict[str, Any]:
    return await auth0_client.mfa_challenge(
        mfa_token=payload.mfa_token,
        challenge_type=payload.challenge_type,
        authenticator_id=payload.authenticator_id,
    )


@app.post("/api/auth/mfa/verify-otp", response_model=AuthTokenResponse)
async def verify_mfa_otp(payload: MfaOtpVerifyRequest) -> dict[str, Any]:
    return await auth0_client.mfa_verify_otp(mfa_token=payload.mfa_token, otp=payload.otp)


@app.get("/api/auth/me", response_model=AuthenticatedUserResponse)
async def get_authenticated_user(request: Request) -> AuthenticatedUserResponse:
    user = authenticated_user_from_request(request, settings)
    return _auth_user_response(user)


@app.get("/api/auth/users/{user_id}/profile", response_model=Auth0UserProfileResponse)
async def get_auth0_user_profile(
    user_id: str,
    _user: AuthenticatedUser = Depends(require_permissions(settings, "read:users")),
) -> Auth0UserProfileResponse:
    profile = await auth0_client.get_user_profile(user_id)
    return _auth_profile_response(profile)


@app.patch("/api/auth/users/{user_id}/metadata", response_model=Auth0UserProfileResponse)
async def update_auth0_user_metadata(
    user_id: str,
    payload: AuthUserMetadataPatchRequest,
    _user: AuthenticatedUser = Depends(require_permissions(settings, "manage:users")),
) -> Auth0UserProfileResponse:
    profile = await auth0_client.patch_user_metadata(
        user_id,
        user_metadata=payload.user_metadata,
        app_metadata=payload.app_metadata,
    )
    return _auth_profile_response(profile)


@app.get("/api/auth/users/{user_id}/roles", response_model=list[dict[str, Any]])
async def list_auth0_user_roles(
    user_id: str,
    _user: AuthenticatedUser = Depends(require_permissions(settings, "read:roles")),
) -> list[dict[str, Any]]:
    return await auth0_client.list_user_roles(user_id)


@app.post("/api/auth/users/{user_id}/roles", response_model=dict)
async def assign_auth0_user_roles(
    user_id: str,
    payload: AuthRoleAssignmentRequest,
    _user: AuthenticatedUser = Depends(require_permissions(settings, "manage:users")),
) -> dict[str, Any]:
    return await auth0_client.assign_user_roles(user_id, payload.roles)


@app.delete("/api/auth/users/{user_id}/roles", response_model=dict)
async def remove_auth0_user_roles(
    user_id: str,
    payload: AuthRoleAssignmentRequest,
    _user: AuthenticatedUser = Depends(require_permissions(settings, "manage:users")),
) -> dict[str, Any]:
    return await auth0_client.remove_user_roles(user_id, payload.roles)


@app.post("/api/upload", response_model=UploadResponse, status_code=201)
async def upload_recording(
    response: Response,
    file: UploadFile = File(...),
    location: str | None = Query(default=None),
    date: str | None = Query(default=None),
    recorded_at: str | None = Query(default=None),
    notes: str | None = Query(default=None),
) -> UploadResponse:
    if not file.filename:
        raise HTTPException(status_code=400, detail="Filename is required")
    original_filename = Path(file.filename).name
    suffix = Path(original_filename).suffix.lower()
    if suffix not in {".wav", ".mp3", ".flac"}:
        raise HTTPException(status_code=400, detail="Unsupported audio format")
    header = await file.read(12)
    valid_magic, magic_error = validate_magic_bytes(header, suffix)
    if not valid_magic:
        raise HTTPException(status_code=415, detail=magic_error)
    remaining = await file.read()
    file_bytes = header + remaining
    file_hash = hashlib.sha256(file_bytes).hexdigest()
    duplicate = _get_store().find_by_hash(file_hash)
    if duplicate is not None:
        response.status_code = 200
        return UploadResponse(
            status=duplicate.get("status", "pending"),
            recording_ids=[duplicate["id"]],
            count=1,
            total_duration_s=float(duplicate.get("duration_s", 0.0)),
            message=f"Duplicate upload detected for {file.filename}",
            duplicate=True,
        )

    recording_id = str(uuid.uuid4())
    destination = settings.audio_dir / f"{recording_id}{suffix}"
    async with aiofiles.open(destination, "wb") as handle:
        await handle.write(file_bytes)

    y, sr = load_audio(destination, sr=None)
    try:
        validate_audio(y, sr)
    except ValueError as exc:
        destination.unlink(missing_ok=True)
        raise HTTPException(status_code=422, detail=str(exc)) from exc
    duration_s = round(get_duration(y, sr), 3)
    metadata = {
        k: v
        for k, v in {
            "location": location,
            "date": date,
            "recorded_at": recorded_at,
            "notes": notes,
            "file_hash": file_hash,
            "original_filename": original_filename,
            "source_format": suffix.lstrip("."),
            "source_content_type": file.content_type,
            "sample_rate": int(sr),
            "channels": 1,
        }.items()
        if v is not None and v != ""
    }
    _get_store().add(
        recording_id,
        original_filename,
        duration_s,
        round(destination.stat().st_size / (1024 * 1024), 3),
        metadata=metadata,
        source_path=str(destination),
        file_hash=file_hash,
    )
    return UploadResponse(
        status="pending",
        recording_ids=[recording_id],
        count=1,
        total_duration_s=duration_s,
        message=f"Uploaded {file.filename}",
        duplicate=False,
    )


@app.get("/api/recordings", response_model=RecordingListResponse)
async def list_recordings(
    limit: int = Query(50, ge=1, le=200),
    offset: int = Query(0, ge=0),
    status: str | None = Query(default=None),
    location: str | None = Query(default=None),
) -> RecordingListResponse:
    items, total = _get_store().list(limit=limit, offset=offset, status=status, location=location)
    summaries = [_to_summary(item) for item in items]
    return RecordingListResponse(total=total, returned=len(summaries), recordings=summaries)


@app.get("/api/recordings/{recording_id}", response_model=RecordingDetail)
async def get_recording(recording_id: str) -> RecordingDetail:
    recording = _get_store().get(recording_id)
    if recording is None:
        raise HTTPException(status_code=404, detail="Recording not found")
    return _to_detail(recording)


@app.patch("/api/recordings/{recording_id}/metadata", response_model=RecordingDetail)
async def patch_recording_metadata(recording_id: str, payload: MetadataPatchRequest) -> RecordingDetail:
    updates = payload.model_dump(exclude_unset=True)
    updated = _get_store().update_metadata(recording_id, updates)
    if updated is None:
        raise HTTPException(status_code=404, detail="Recording not found")
    recording = _get_store().get(recording_id)
    if recording is None:
        raise HTTPException(status_code=404, detail="Recording not found")
    return _to_detail(recording)


@app.get("/api/recordings/{recording_id}/status", response_model=dict)
async def get_recording_status(recording_id: str) -> dict[str, Any]:
    recording = _get_store().get(recording_id)
    if recording is None:
        raise HTTPException(status_code=404, detail="Recording not found")
    return _status_payload(recording)


@app.post("/api/recordings/{recording_id}/process", response_model=dict)
async def process_recording(
    recording_id: str,
    background_tasks: BackgroundTasks,
    method: str = Query(default=settings.DENOISE_METHOD),
    aggressiveness: float = Query(default=1.0, ge=0.1, le=5.0),
    preset: str | None = Query(default=None, pattern="^(demo)$"),
) -> dict[str, Any]:
    recording = _get_store().get(recording_id)
    if recording is None:
        raise HTTPException(status_code=404, detail="Recording not found")
    if recording["status"] == "processing":
        raise HTTPException(status_code=409, detail="Recording already processing")
    if preset == "demo":
        method = "demo"
        aggressiveness = min(aggressiveness, 1.0)
    _get_store().update_status(recording_id, "processing", progress=0, current_stage="ingestion")
    task = asyncio.create_task(_run_processing(recording_id, method, aggressiveness, preset=preset))
    _get_tasks()[recording_id] = task
    return {"id": recording_id, "status": "processing", "method": method, "preset": preset}


@app.post("/api/recordings/{recording_id}/cancel", response_model=dict)
async def cancel_recording(recording_id: str) -> dict[str, Any]:
    recording = _get_store().get(recording_id)
    if recording is None:
        raise HTTPException(status_code=404, detail="Recording not found")
    if recording["status"] in {"complete", "failed", "cancelled"}:
        raise HTTPException(status_code=409, detail=f"Recording already {recording['status']}")
    task = _get_tasks().get(recording_id)
    if task is None:
        raise HTTPException(status_code=404, detail="No active processing task")
    task.cancel()
    _get_store().update_status(recording_id, "cancelled", current_stage="cancelled")
    return {"id": recording_id, "status": "cancelled"}


@app.post("/api/batch/process", response_model=BatchSubmitResponse)
async def process_batch(
    payload: dict[str, Any],
    background_tasks: BackgroundTasks,
) -> BatchSubmitResponse:
    recording_ids = payload.get("recording_ids") or []
    method = str(payload.get("method") or settings.DENOISE_METHOD)
    aggressiveness = float(payload.get("aggressiveness") or 1.5)
    if not isinstance(recording_ids, list) or not recording_ids:
        raise HTTPException(status_code=400, detail="recording_ids is required")
    normalized_ids = [str(recording_id) for recording_id in recording_ids]
    batch = _get_batch_store().create(normalized_ids)
    for recording_id in recording_ids:
        recording_id = str(recording_id)
        if _get_store().get(recording_id) is None:
            _get_batch_store().update(batch["batch_id"], recording_id, status="failed", error="Recording not found")
            continue
        _get_store().update_status(recording_id, "processing", progress=0, current_stage="ingestion")
        _get_batch_store().update(batch["batch_id"], recording_id, status="processing", progress_pct=0)
        task = asyncio.create_task(_run_processing(recording_id, method, aggressiveness, batch_id=batch["batch_id"]))
        _get_tasks()[recording_id] = task
    return BatchSubmitResponse(batch_id=batch["batch_id"], queued=len(recording_ids), status="processing")


@app.post("/api/recordings/batch-process", response_model=BatchSubmitResponse)
async def process_recordings_batch(
    payload: dict[str, Any],
    background_tasks: BackgroundTasks,
) -> BatchSubmitResponse:
    return await process_batch(payload, background_tasks)


@app.get("/api/batch/{batch_id}/status", response_model=BatchStatusResponse)
async def get_batch_status(batch_id: str) -> BatchStatusResponse:
    batch = _get_batch_store().get(batch_id)
    if batch is None:
        raise HTTPException(status_code=404, detail="Batch not found")
    return BatchStatusResponse(**batch)


@app.get("/api/batch/{batch_id}/summary", response_model=BatchSummaryResponse)
async def get_batch_summary(batch_id: str) -> BatchSummaryResponse:
    return BatchSummaryResponse(**_batch_summary(batch_id))


@app.get("/api/recordings/{recording_id}/spectrogram")
async def get_spectrogram(
    recording_id: str,
    type: str = Query(default="after"),
    colormap: str = Query(default="viridis"),
) -> FileResponse:
    if colormap not in SUPPORTED_COLORMAPS:
        from fastapi import HTTPException as _HTTPException
        raise HTTPException(
            status_code=422,
            detail=f"Unsupported colormap '{colormap}'. Supported: {sorted(SUPPORTED_COLORMAPS)}",
        )
    recording = _get_store().get(recording_id)
    if recording is None:
        raise HTTPException(status_code=404, detail="Recording not found")
    result = recording.get("result") or {}
    mapping = {
        "before": result.get("spectrogram_before_path"),
        "after": result.get("spectrogram_after_path"),
        "comparison": result.get("comparison_spectrogram_path"),
        "infrasound": (result.get("export_metadata") or {}).get("infrasound_spectrogram_path"),
    }
    path = mapping.get(type)
    if not path or not Path(path).exists():
        raise HTTPException(status_code=404, detail="Spectrogram not found")

    # Default colormap — serve the pre-generated PNG directly
    if colormap == "viridis":
        return FileResponse(path, media_type="image/png")

    # Non-default colormap — check cache, then regenerate from audio if needed
    cache: CacheManager = app.state.cache  # type: ignore[attr-defined]
    cache_params = {"colormap": colormap, "type": type}
    cached_path = cache.get_path(recording_id, "spectrogram_colormap", params=cache_params)
    if cached_path:
        return FileResponse(cached_path, media_type="image/png")

    # Regenerate: load audio, compute STFT, render with requested colormap
    audio_path_str = result.get("output_audio_path") if type == "after" else None
    if not audio_path_str or not Path(audio_path_str).exists():
        audio_path_str = str(_get_recording_path(recording))
    if not Path(audio_path_str).exists():
        raise HTTPException(status_code=404, detail="Source audio not found for colormap render")

    y, sr = await asyncio.to_thread(load_audio, audio_path_str)
    stft_data = await asyncio.to_thread(compute_stft, y, sr)

    # Write to a temp file then store in cache
    import tempfile
    with tempfile.NamedTemporaryFile(suffix=".png", delete=False) as tmp:
        tmp_path = tmp.name
    await asyncio.to_thread(
        generate_spectrogram_png,
        stft_data["magnitude_db"],
        sr,
        512,
        tmp_path,
        cmap=colormap,
    )
    cached_path = cache.store_file(
        recording_id,
        "spectrogram_colormap",
        tmp_path,
        params=cache_params,
        suffix=".png",
    )
    Path(tmp_path).unlink(missing_ok=True)
    return FileResponse(cached_path, media_type="image/png")


@app.get("/api/recordings/{recording_id}/audio")
async def get_audio(
    recording_id: str,
    type: str = Query(default="cleaned"),
) -> FileResponse:
    recording = _get_store().get(recording_id)
    if recording is None:
        raise HTTPException(status_code=404, detail="Recording not found")
    if type == "original":
        path = _get_recording_path(recording)
    else:
        result = recording.get("result") or {}
        path = Path(result.get("output_audio_path", ""))
    if not path.exists():
        raise HTTPException(status_code=404, detail="Audio file not found")
    return FileResponse(path, media_type=_audio_media_type(path))


@app.post("/api/recordings/{recording_id}/infrasound-reveal", response_model=InfrasoundRevealResponse)
async def create_recording_infrasound_reveal(
    recording_id: str,
    payload: InfrasoundRevealRequest,
) -> InfrasoundRevealResponse:
    recording = _get_store().get(recording_id)
    if recording is None:
        raise HTTPException(status_code=404, detail="Recording not found")
    result = recording.get("result") or {}
    audio_path = Path(result.get("output_audio_path") or _get_recording_path(recording))
    if not audio_path.exists():
        raise HTTPException(status_code=404, detail="Audio file not found")
    y, sr = load_audio(audio_path)
    reveal = create_infrasound_reveal(
        y,
        sr,
        shift_octaves=payload.shift_octaves,
        method=payload.method,
        mix_mode=payload.mix_mode,
    )
    output_path = settings.processed_dir / f"{recording_id}_infrasound_shifted.wav"
    await asyncio.to_thread(save_audio, reveal["audio"], reveal["sr"], output_path)

    spectrogram_path = settings.spectrogram_dir / f"{recording_id}_infrasound.png"
    import matplotlib.pyplot as plt

    fig, ax = plt.subplots(figsize=(8, 2.8), dpi=160)
    ax.specgram(y, NFFT=min(16384, max(256, len(y) // 2)), Fs=sr, noverlap=128, cmap="viridis")
    ax.set_ylim(0, 50)
    ax.set_title("Infrasound 0-50Hz")
    ax.set_xlabel("Time (s)")
    ax.set_ylabel("Hz")
    fig.tight_layout()
    spectrogram_path.parent.mkdir(parents=True, exist_ok=True)
    fig.savefig(spectrogram_path)
    plt.close(fig)

    result = dict(result)
    export_metadata = dict(result.get("export_metadata") or {})
    export_metadata.update({
        "infrasound_shifted_audio_path": str(output_path),
        "infrasound_spectrogram_path": str(spectrogram_path),
    })
    result["export_metadata"] = export_metadata
    _get_store().update_result(recording_id, result)

    factor = 2 ** payload.shift_octaves
    regions = [
        {
            **region,
            "shifted_f0_hz": round(float(region.get("estimated_f0_hz") or 0.0) * factor, 2),
        }
        for region in reveal["regions"]
    ]
    return InfrasoundRevealResponse(
        recording_id=recording_id,
        infrasound_detected=bool(regions),
        infrasound_regions=regions,
        shifted_audio_url=f"/api/recordings/{recording_id}/audio/infrasound-shifted",
        shift_octaves=payload.shift_octaves,
        frequency_range_original_hz=tuple(reveal["frequency_range_original_hz"]),
        frequency_range_shifted_hz=tuple(reveal["frequency_range_shifted_hz"]),
        infrasound_energy_pct=float(reveal["infrasound_energy_pct"]),
        method=payload.method,
        mix_mode=payload.mix_mode,
    )


@app.get("/api/recordings/{recording_id}/audio/infrasound-shifted")
async def get_infrasound_shifted_audio(recording_id: str) -> FileResponse:
    recording = _get_store().get(recording_id)
    if recording is None:
        raise HTTPException(status_code=404, detail="Recording not found")
    result = recording.get("result") or {}
    path = Path((result.get("export_metadata") or {}).get("infrasound_shifted_audio_path") or settings.processed_dir / f"{recording_id}_infrasound_shifted.wav")
    if not path.exists():
        raise HTTPException(status_code=404, detail="Infrasound shifted audio not found")
    return FileResponse(path, media_type="audio/wav")


@app.get("/api/recordings/{recording_id}/download")
async def download_cleaned(
    recording_id: str,
    range_header: str | None = Header(default=None, alias="Range"),
):
    recording = _get_store().get(recording_id)
    if recording is None:
        raise HTTPException(status_code=404, detail="Recording not found")
    result = recording.get("result") or {}
    path = Path(result.get("output_audio_path", ""))
    if not path.exists():
        raise HTTPException(status_code=404, detail="Audio file not found")
    file_size = path.stat().st_size
    headers = {
        "Accept-Ranges": "bytes",
        "Content-Disposition": f'attachment; filename="{path.name}"',
    }
    media_type = _audio_media_type(path)
    if not range_header:
        return FileResponse(path, media_type=media_type, headers=headers)

    if not range_header.startswith("bytes="):
        raise HTTPException(status_code=416, detail="Invalid Range header")
    start_text, _, end_text = range_header.removeprefix("bytes=").partition("-")
    try:
        start = int(start_text) if start_text else 0
        end = int(end_text) if end_text else file_size - 1
    except ValueError as exc:
        raise HTTPException(status_code=416, detail="Invalid Range header") from exc
    if start < 0 or end < start or start >= file_size:
        raise HTTPException(status_code=416, detail="Requested range not satisfiable")
    end = min(end, file_size - 1)
    content_length = end - start + 1

    async def _range_iter():
        remaining = content_length
        async with aiofiles.open(path, "rb") as handle:
            await handle.seek(start)
            while remaining > 0:
                chunk = await handle.read(min(1024 * 1024, remaining))
                if not chunk:
                    break
                remaining -= len(chunk)
                yield chunk

    headers.update({
        "Content-Range": f"bytes {start}-{end}/{file_size}",
        "Content-Length": str(content_length),
    })
    return StreamingResponse(_range_iter(), status_code=206, media_type=media_type, headers=headers)


@app.get("/api/recordings/{recording_id}/spectrogram-data")
async def get_spectrogram_data(
    recording_id: str,
    width: int = Query(default=256, ge=32, le=1024),
    height: int = Query(default=128, ge=32, le=512),
):
    """Return downsampled spectrogram magnitude data as JSON for 3D rendering."""
    import numpy as np

    store = _get_store()
    recording = store.get(recording_id)
    if not recording:
        raise HTTPException(status_code=404, detail="Recording not found")

    result = recording.get("result") or {}
    audio_path = result.get("output_audio_path")
    if not audio_path or not Path(audio_path).exists():
        audio_path = str(_get_recording_path(recording))

    y, sr = await asyncio.to_thread(load_audio, audio_path)
    duration_s = len(y) / sr

    import librosa
    from scipy.ndimage import zoom

    n_fft = 2048
    hop_length = 512
    S = np.abs(librosa.stft(y, n_fft=n_fft, hop_length=hop_length))
    S_db = librosa.amplitude_to_db(S, ref=np.max(S) if np.max(S) > 0 else 1.0)

    # Normalize to 0-1 range
    s_min = float(S_db.min())
    s_max = float(S_db.max())
    if s_max > s_min:
        S_norm = (S_db - s_min) / (s_max - s_min)
    else:
        S_norm = np.zeros_like(S_db)

    # Downsample to requested resolution
    zoom_factors = (height / S_norm.shape[0], width / S_norm.shape[1])
    S_downsampled = zoom(S_norm, zoom_factors, order=1)

    freq_max = sr / 2
    # Only keep up to 1000Hz for elephant vocalization focus
    freq_limit = min(1000, freq_max)
    freq_bins = int(S_norm.shape[0] * (freq_limit / freq_max))
    if freq_bins < S_norm.shape[0]:
        S_cropped = S_norm[:freq_bins, :]
        zoom_factors = (height / S_cropped.shape[0], width / S_cropped.shape[1])
        S_downsampled = zoom(S_cropped, zoom_factors, order=1)
        freq_max = freq_limit

    return {
        "recording_id": recording_id,
        "width": int(S_downsampled.shape[1]),
        "height": int(S_downsampled.shape[0]),
        "duration_s": round(duration_s, 2),
        "freq_max_hz": round(freq_max, 1),
        "sample_rate": sr,
        "magnitudes": S_downsampled.tolist(),
    }


@app.get("/api/recordings/{recording_id}/harmonics", response_model=HarmonicOverlayResponse)
async def get_harmonics(recording_id: str) -> HarmonicOverlayResponse:
    recording = _get_store().get(recording_id)
    if recording is None:
        raise HTTPException(status_code=404, detail="Recording not found")
    result = recording.get("result") or {}
    audio_path = result.get("output_audio_path")
    if not audio_path or not Path(audio_path).exists():
        raise HTTPException(status_code=404, detail="Processed audio not found; process the recording first")
    y, sr = load_audio(Path(audio_path))
    features = extract_acoustic_features(y, sr)
    peaks = get_harmonic_peaks(y, sr)
    hnr = harmonic_to_noise_ratio(y)
    return HarmonicOverlayResponse(
        recording_id=recording_id,
        fundamental_frequency_hz=features["fundamental_frequency_hz"],
        harmonic_peaks_hz=peaks,
        harmonic_count=len(peaks),
        harmonic_to_noise_ratio_db=hnr,
        harmonicity=features["harmonicity"],
    )


@app.get("/api/recordings/{recording_id}/markers", response_model=MarkerResponse)
async def get_recording_markers(recording_id: str) -> MarkerResponse:
    if _get_store().get(recording_id) is None:
        raise HTTPException(status_code=404, detail="Recording not found")
    return MarkerResponse(**_marker_payload(recording_id))


@app.get("/api/recordings/{recording_id}/sequences", response_model=list[CallSequenceModel])
async def get_recording_sequences(recording_id: str, max_gap_ms: float = Query(default=5000.0, ge=0.0)) -> list[CallSequenceModel]:
    if _get_store().get(recording_id) is None:
        raise HTTPException(status_code=404, detail="Recording not found")
    sequences = extract_sequences(_calls_for_recording(recording_id), max_gap_ms=max_gap_ms)
    return [CallSequenceModel(**sequence) for sequence in sequences]


@app.get("/api/recordings/{recording_id}/emotion-timeline", response_model=EmotionTimelineResponse)
async def get_emotion_timeline(
    recording_id: str,
    resolution_ms: float = Query(default=500.0, ge=100.0, le=5000.0),
) -> EmotionTimelineResponse:
    recording = _get_store().get(recording_id)
    if recording is None:
        raise HTTPException(status_code=404, detail="Recording not found")
    duration_ms = float(recording.get("duration_s") or 0.0) * 1000.0
    payload = build_emotion_timeline(_calls_for_recording(recording_id), duration_ms, resolution_ms=resolution_ms)
    return EmotionTimelineResponse(recording_id=recording_id, **payload)


@app.get("/api/stats", response_model=StatsResponse)
async def get_stats() -> StatsResponse:
    stats = _research_impact_payload()
    stats["circuit_breakers"] = get_circuit_breaker_registry().snapshot()
    return StatsResponse(**stats)


@app.get("/api/stats/activity-heatmap", response_model=ActivityHeatmapResponse)
async def get_activity_heatmap(
    location: str | None = Query(default=None),
    date_from: str | None = Query(default=None),
    date_to: str | None = Query(default=None),
) -> ActivityHeatmapResponse:
    payload = build_activity_heatmap(_all_calls(), location=location, date_from=date_from, date_to=date_to)
    return ActivityHeatmapResponse(**payload)


@app.get("/api/stats/activity-heatmap.png")
async def get_activity_heatmap_png(
    location: str | None = Query(default=None),
    date_from: str | None = Query(default=None),
    date_to: str | None = Query(default=None),
) -> StreamingResponse:
    import matplotlib.pyplot as plt

    payload = build_activity_heatmap(_all_calls(), location=location, date_from=date_from, date_to=date_to)
    heatmap = payload["heatmap"]
    fig, ax = plt.subplots(figsize=(10, 4), dpi=160)
    ax.imshow(heatmap["matrix"], aspect="auto", cmap="viridis")
    ax.set_xticks(list(range(24)))
    ax.set_yticks(list(range(len(heatmap["call_types"]))))
    ax.set_yticklabels(heatmap["call_types"])
    ax.set_xlabel("Hour of day")
    ax.set_ylabel("Call type")
    fig.tight_layout()
    buffer = io.BytesIO()
    fig.savefig(buffer, format="png")
    plt.close(fig)
    buffer.seek(0)
    return StreamingResponse(iter([buffer.getvalue()]), media_type="image/png")


@app.get("/api/sites", response_model=list[SiteSummary])
async def get_sites() -> list[SiteSummary]:
    return [SiteSummary(**site) for site in list_sites(list(_get_store()._recordings.values()))]


@app.get("/api/sites/{location}/noise-profile", response_model=SiteNoiseProfile)
async def get_site_noise_profile(location: str) -> SiteNoiseProfile:
    profile = build_site_profile(list(_get_store()._recordings.values()), location)
    if profile["recordings_analyzed"] == 0:
        raise HTTPException(status_code=404, detail="No recordings found for site")
    return SiteNoiseProfile(**profile)


@app.get("/api/sites/{location}/recommendations", response_model=dict)
async def get_site_recommendations(location: str) -> dict[str, Any]:
    profile = build_site_profile(list(_get_store()._recordings.values()), location)
    if profile["recordings_analyzed"] == 0:
        raise HTTPException(status_code=404, detail="No recordings found for site")
    return {
        "location": location,
        "optimal_windows": profile["optimal_windows"],
        "recommendations": profile["recommendations"],
    }


@app.get("/api/calls", response_model=CallListResponse)
async def list_calls(
    limit: int = Query(50, ge=1, le=500),
    offset: int = Query(0, ge=0),
    call_type: str | None = Query(default=None),
    recording_id: str | None = Query(default=None),
    location: str | None = Query(default=None),
    animal_id: str | None = Query(default=None),
    date_from: str | None = Query(default=None),
    date_to: str | None = Query(default=None),
    tags: list[str] | None = Query(default=None),
    sort_by: str = Query(default="id"),
    sort_desc: bool = Query(default=False),
) -> CallListResponse:
    items, total = _get_call_database().search(
        location=location,
        date_from=date_from,
        date_to=date_to,
        animal_id=animal_id,
        call_type=call_type,
        recording_id=recording_id,
        tags=tags,
        sort_by=sort_by,
        sort_desc=sort_desc,
        limit=limit,
        offset=offset,
    )
    records = [CallRecord(**_enrich_call(item)) for item in items]
    return CallListResponse(total=total, returned=len(records), items=records)


@app.get("/api/calls/similarity", response_model=SimilarityGraphResponse)
async def get_call_similarity(
    call_type: str | None = Query(default=None),
    threshold: float = Query(default=0.75, ge=0.0, le=1.0),
    limit: int = Query(default=100, ge=1, le=500),
) -> SimilarityGraphResponse:
    items, total = _get_call_database().search(call_type=call_type, limit=limit)
    graph = _get_similarity_cache().get_graph(items, threshold=threshold)
    return SimilarityGraphResponse(
        nodes=[SimilarityNode(**n) for n in graph["nodes"]],
        edges=[SimilarityEdge(**e) for e in graph["edges"]],
        total_calls=total,
        threshold=threshold,
    )


@app.get("/api/calls/compare", response_model=dict)
async def compare_calls(call_a: str = Query(...), call_b: str = Query(...)) -> dict[str, Any]:
    calls_by_id = _get_call_database().get_many([call_a, call_b])
    if call_a not in calls_by_id or call_b not in calls_by_id:
        raise HTTPException(status_code=404, detail="Call not found")
    matches = top_k_similar([calls_by_id[call_a], calls_by_id[call_b]], call_a, k=1)
    similarity = matches[0]["similarity"] if matches else 0.0
    return {
        "call_a_id": call_a,
        "call_b_id": call_b,
        "similarity_score": similarity,
        "fingerprint_distance": round(1.0 - similarity, 4),
        "overlay": {
            "spectrogram_overlay_url": f"/api/calls/compare-overlay.png?call_a={call_a}&call_b={call_b}&type=spectrogram",
            "waveform_overlay_url": f"/api/calls/compare-overlay.png?call_a={call_a}&call_b={call_b}&type=waveform",
            "difference_heatmap_url": f"/api/calls/compare-overlay.png?call_a={call_a}&call_b={call_b}&type=difference",
            "aligned": True,
            "time_stretch_factor": 1.0,
        },
        "dimension_breakdown": {
            "timbral_similarity": similarity,
            "pitch_contour_similarity": similarity,
            "temporal_dynamics_similarity": similarity,
            "energy_profile_similarity": similarity,
        },
    }


@app.get("/api/calls/compare-overlay.png")
async def compare_calls_overlay(
    call_a: str = Query(...),
    call_b: str = Query(...),
    type: str = Query(default="spectrogram", pattern="^(spectrogram|waveform|difference)$"),
) -> StreamingResponse:
    import matplotlib.pyplot as plt

    calls_by_id = _get_call_database().get_many([call_a, call_b])
    if call_a not in calls_by_id or call_b not in calls_by_id:
        raise HTTPException(status_code=404, detail="Call not found")
    left = calls_by_id[call_a]
    right = calls_by_id[call_b]

    def _contour(call: dict[str, Any]) -> np.ndarray:
        features = call.get("acoustic_features") or {}
        contour = features.get("frequency_contour_hz") or []
        if not contour:
            f0 = float(features.get("fundamental_frequency_hz") or 0.0)
            contour = [f0, f0, f0]
        return np.asarray(contour, dtype=np.float32)

    left_contour = _contour(left)
    right_contour = _contour(right)
    width = max(len(left_contour), len(right_contour), 2)
    x = np.linspace(0.0, 1.0, width)
    left_interp = np.interp(x, np.linspace(0.0, 1.0, len(left_contour)), left_contour)
    right_interp = np.interp(x, np.linspace(0.0, 1.0, len(right_contour)), right_contour)

    fig, ax = plt.subplots(figsize=(6, 2.5), dpi=160)
    if type == "difference":
        diff = np.abs(left_interp - right_interp).reshape(1, -1)
        ax.imshow(diff, aspect="auto", cmap="magma")
        ax.set_yticks([])
        ax.set_title("Fingerprint contour difference")
    else:
        ax.plot(x, left_interp, label=call_a, color="#2563EB", linewidth=2, alpha=0.85)
        ax.plot(x, right_interp, label=call_b, color="#F97316", linewidth=2, alpha=0.85)
        if type == "spectrogram":
            ax.fill_between(x, 0, left_interp, color="#2563EB", alpha=0.18)
            ax.fill_between(x, 0, right_interp, color="#F97316", alpha=0.18)
            ax.set_title("Aligned frequency contour overlay")
            ax.set_ylabel("Hz")
        else:
            left_wave = np.sin(2 * np.pi * np.cumsum(left_interp / max(float(np.max(left_interp)), 1.0)) / width)
            right_wave = np.sin(2 * np.pi * np.cumsum(right_interp / max(float(np.max(right_interp)), 1.0)) / width)
            ax.clear()
            ax.plot(x, left_wave, label=call_a, color="#2563EB", linewidth=1.5, alpha=0.85)
            ax.plot(x, right_wave, label=call_b, color="#F97316", linewidth=1.5, alpha=0.85)
            ax.set_title("Aligned waveform proxy")
            ax.set_ylabel("Amplitude")
        ax.set_xlabel("Normalized time")
        ax.legend(fontsize=6, loc="upper right")
    fig.tight_layout()
    buffer = io.BytesIO()
    fig.savefig(buffer, format="png")
    plt.close(fig)
    buffer.seek(0)
    return StreamingResponse(iter([buffer.getvalue()]), media_type="image/png")


@app.get("/api/reference-calls", response_model=list[dict[str, Any]])
async def list_reference_calls() -> list[dict[str, Any]]:
    return list(REFERENCE_CALLS.values())


@app.post("/api/compare/cross-species", response_model=CrossSpeciesComparisonResponse)
async def compare_cross_species(payload: CrossSpeciesRequest) -> CrossSpeciesComparisonResponse:
    call = _get_call_database().get_call(payload.elephant_call_id)
    if call is None:
        raise HTTPException(status_code=404, detail="Elephant call not found")
    try:
        comparison = compare_call_to_reference(call, payload.reference_id)
    except KeyError as exc:
        raise HTTPException(status_code=404, detail="Reference call not found") from exc
    return CrossSpeciesComparisonResponse(**comparison)


@app.post("/api/compare/cross-species/upload", response_model=CrossSpeciesComparisonResponse)
async def compare_cross_species_upload(
    elephant_call_id: str = Query(...),
    file: UploadFile = File(...),
) -> CrossSpeciesComparisonResponse:
    call = _get_call_database().get_call(elephant_call_id)
    if call is None:
        raise HTTPException(status_code=404, detail="Elephant call not found")
    suffix = Path(file.filename or "reference.wav").suffix or ".wav"
    temp_path = settings.cache_dir / f"{uuid.uuid4().hex}{suffix}"
    async with aiofiles.open(temp_path, "wb") as handle:
        await handle.write(await file.read())
    try:
        y, sr = load_audio(temp_path)
        features = extract_acoustic_features(y, sr)
        reference_id = "uploaded_reference"
        REFERENCE_CALLS[reference_id] = {
            "id": reference_id,
            "species": "Uploaded reference",
            "call_type": file.filename or "uploaded audio",
            "description": "User-uploaded cross-species reference.",
            "frequency_range_hz": (
                float(features.get("fundamental_frequency_hz") or 0.0),
                float(features.get("spectral_rolloff_hz") or features.get("spectral_centroid_hz") or 1.0),
            ),
            "synthetic": False,
        }
        comparison = compare_call_to_reference(call, reference_id)
    finally:
        temp_path.unlink(missing_ok=True)
    return CrossSpeciesComparisonResponse(**comparison)


@app.get("/api/compare/viz/{elephant_call_id}/{reference_id}.png")
async def get_cross_species_visualization(
    elephant_call_id: str,
    reference_id: str,
    type: str = Query(default="overlay", pattern="^(overlay|side_by_side)$"),
) -> StreamingResponse:
    import matplotlib.pyplot as plt

    call = _get_call_database().get_call(elephant_call_id)
    if call is None or reference_id not in REFERENCE_CALLS:
        raise HTTPException(status_code=404, detail="Comparison not found")
    reference = REFERENCE_CALLS[reference_id]
    comparison = compare_call_to_reference(call, reference_id)
    elephant_range = (
        float(call.get("frequency_min_hz") or 0.0),
        float(call.get("frequency_max_hz") or (call.get("acoustic_features") or {}).get("spectral_rolloff_hz") or 1.0),
    )
    reference_range = tuple(float(value) for value in reference["frequency_range_hz"])
    fig, ax = plt.subplots(figsize=(7, 2.8), dpi=160)
    if type == "side_by_side":
        ax.barh(["Elephant", "Reference"], [elephant_range[1] - elephant_range[0], reference_range[1] - reference_range[0]], left=[elephant_range[0], reference_range[0]], color=["#2563EB", "#F97316"])
    else:
        ax.axvspan(elephant_range[0], elephant_range[1], color="#2563EB", alpha=0.35, label="Elephant")
        ax.axvspan(reference_range[0], reference_range[1], color="#F97316", alpha=0.35, label=reference["species"])
        shared = comparison["comparison"]["shared_frequency_range_hz"]
        if shared[1] > shared[0]:
            ax.axvspan(shared[0], shared[1], color="#10B981", alpha=0.45, label="Shared")
        ax.legend(fontsize=7)
    ax.set_xlabel("Frequency (Hz)")
    ax.set_title("Cross-species frequency comparison")
    fig.tight_layout()
    buffer = io.BytesIO()
    fig.savefig(buffer, format="png")
    plt.close(fig)
    buffer.seek(0)
    return StreamingResponse(iter([buffer.getvalue()]), media_type="image/png")


@app.get("/api/patterns", response_model=list[PatternModel])
async def get_patterns(min_occurrences: int = Query(default=2, ge=1)) -> list[PatternModel]:
    sequences = extract_sequences(_all_calls())
    return [PatternModel(**pattern) for pattern in find_recurring_patterns(sequences, min_occurrences=min_occurrences)]


@app.get("/api/patterns/{pattern_id}/instances", response_model=dict)
async def get_pattern_instances(pattern_id: str) -> dict[str, Any]:
    sequences = extract_sequences(_all_calls())
    patterns = find_recurring_patterns(sequences, min_occurrences=1)
    pattern = next((item for item in patterns if item["pattern_id"] == pattern_id), None)
    if pattern is None:
        raise HTTPException(status_code=404, detail="Pattern not found")
    motif = pattern["motif"]
    instances = [sequence for sequence in sequences if " -> ".join(motif) in sequence.get("pattern", "")]
    return {"pattern": pattern, "instances": instances}


@app.get("/api/calls/{call_id}/similar", response_model=SimilarCallsResponse)
async def get_similar_calls(
    call_id: str,
    limit: int = Query(default=10, ge=1, le=100),
) -> SimilarCallsResponse:
    matches = top_k_similar(_all_calls(), call_id, k=limit)
    if not matches and _get_call_database().get_call(call_id) is None:
        raise HTTPException(status_code=404, detail="Call not found")
    return SimilarCallsResponse(query_call_id=call_id, matches=matches)


@app.get("/api/calls/{call_id}", response_model=CallRecord)
async def get_call(call_id: str) -> CallRecord:
    call = _get_call_database().get_call(call_id)
    if call is None:
        raise HTTPException(status_code=404, detail="Call not found")
    return CallRecord(**_enrich_call(call))


@app.post("/api/calls/{call_id}/annotations", response_model=CallAnnotation, status_code=201)
async def create_call_annotation(call_id: str, payload: AnnotationRequest) -> CallAnnotation:
    annotation = _get_call_database().add_annotation(
        call_id,
        payload.note,
        tags=payload.tags,
        researcher_id=payload.researcher_id,
    )
    if annotation is None:
        raise HTTPException(status_code=404, detail="Call not found")
    app.state.embedding_cache = {}
    _get_similarity_cache().invalidate()
    return CallAnnotation(**annotation)


@app.get("/api/calls/{call_id}/annotations", response_model=list[CallAnnotation])
async def list_call_annotations(call_id: str) -> list[CallAnnotation]:
    annotations = _get_call_database().get_annotations(call_id)
    if annotations is None:
        raise HTTPException(status_code=404, detail="Call not found")
    return [CallAnnotation(**annotation) for annotation in annotations]


@app.delete("/api/calls/{call_id}/annotations/{annotation_id}", response_model=dict)
async def delete_call_annotation(call_id: str, annotation_id: str) -> dict[str, Any]:
    deleted = _get_call_database().delete_annotation(call_id, annotation_id)
    if deleted is None:
        raise HTTPException(status_code=404, detail="Call not found")
    if not deleted:
        raise HTTPException(status_code=404, detail="Annotation not found")
    app.state.embedding_cache = {}
    _get_similarity_cache().invalidate()
    return {"call_id": call_id, "annotation_id": annotation_id, "deleted": True}


@app.get("/api/individuals", response_model=list[IndividualProfile])
async def list_individuals(
    call_type: str | None = Query(default=None),
    recording_id: str | None = Query(default=None),
    min_confidence: float = Query(default=0.0, ge=0.0, le=1.0),
) -> list[IndividualProfile]:
    if recording_id:
        calls = _calls_for_recording(recording_id)
    else:
        calls, _ = _identify_calls(call_type=call_type)
    if call_type:
        calls = [call for call in calls if str(call.get("call_type") or "").lower() == call_type.lower()]
    clusters = [cluster for cluster in cluster_individuals(calls) if cluster["confidence"] >= min_confidence]
    profiles = [
        {
            "individual_id": cluster["cluster_id"],
            "cluster_id": cluster["cluster_id"],
            "suggested_label": cluster["suggested_label"],
            "confidence": cluster["confidence"],
            "call_count": len(cluster["call_ids"]),
            "call_ids": cluster["call_ids"],
            "recording_ids": cluster["recording_ids"],
            "dates": sorted({str(call.get("date")) for call in calls if call.get("id") in cluster["call_ids"] and call.get("date")}),
            "signature_mean": cluster["centroid"],
            "signature_std": [],
            "acoustic_profile": cluster["acoustic_profile"],
            "call_type_distribution": cluster["call_type_distribution"],
        }
        for cluster in clusters
    ]
    return [IndividualProfile(**profile) for profile in profiles]


@app.get("/api/individuals/cross-match", response_model=list[IndividualMatch])
async def cross_match_individuals(
    recording_ids: str | None = Query(default=None),
    min_similarity: float = Query(default=0.85, ge=0.0, le=1.0),
) -> list[IndividualMatch]:
    requested = [item.strip() for item in (recording_ids or "").split(",") if item.strip()]
    if not requested:
        requested = sorted({str(call.get("recording_id")) for call in _all_calls() if call.get("recording_id")})
    clusters_by_recording = {
        recording_id: cluster_individuals(_calls_for_recording(recording_id))
        for recording_id in requested
    }
    return [IndividualMatch(**match) for match in match_across_recordings(clusters_by_recording, min_similarity=min_similarity)]


@app.get("/api/individuals/{cluster_id}", response_model=IndividualProfile)
async def get_individual_cluster(cluster_id: str) -> IndividualProfile:
    profiles = await list_individuals()
    for profile in profiles:
        if profile.individual_id == cluster_id or profile.cluster_id == cluster_id:
            return profile
    raise HTTPException(status_code=404, detail="Individual cluster not found")


@app.get("/api/individuals/{cluster_id}/profile", response_model=IndividualProfile)
async def get_individual_profile(cluster_id: str) -> IndividualProfile:
    return await get_individual_cluster(cluster_id)


@app.get("/api/individuals/{individual_id}/calls", response_model=CallListResponse)
async def list_individual_calls(
    individual_id: str,
    limit: int = Query(50, ge=1, le=500),
    offset: int = Query(0, ge=0),
) -> CallListResponse:
    all_calls = _all_calls()
    clusters = cluster_individuals(all_calls)
    cluster_call_ids = {
        call_id
        for cluster in clusters
        if cluster["cluster_id"] == individual_id
        for call_id in cluster["call_ids"]
    }
    calls, assignments = _identify_calls()
    matched = [
        {
            **call,
            "individual_id": individual_id
            if str(call.get("id")) in cluster_call_ids
            else assignments.get(str(call.get("id")), call.get("individual_id")),
        }
        for call in calls
        if assignments.get(str(call.get("id")), call.get("individual_id")) == individual_id
        or str(call.get("id")) in cluster_call_ids
    ]
    total = len(matched)
    records = [CallRecord(**_enrich_call(item)) for item in matched[offset : offset + limit]]
    return CallListResponse(total=total, returned=len(records), items=records)


@app.get("/api/calls/{call_id}/similar-contours", response_model=ContourMatchResponse)
async def get_similar_contours(
    call_id: str,
    call_type: str | None = Query(default=None),
    limit: int = Query(default=10, ge=1, le=50),
    min_similarity: float = Query(default=0.5, ge=0.0, le=1.0),
    method: str = Query(default="dtw", pattern="^(dtw|pearson)$"),
) -> ContourMatchResponse:
    target = _get_call_database().get_call(call_id)
    if target is None:
        raise HTTPException(status_code=404, detail="Call not found")
    target_features = target.get("acoustic_features") or {}
    target_contour = target_features.get("frequency_contour_hz")
    if not target_contour:
        raise HTTPException(status_code=404, detail="No frequency contour data for this call")
    items, _ = _get_call_database().search(call_type=call_type, limit=500)
    matches: list[ContourMatch] = []
    compared = 0
    for call in items:
        if call.get("id") == call_id:
            continue
        other_features = call.get("acoustic_features") or {}
        other_contour = other_features.get("frequency_contour_hz")
        if not other_contour:
            continue
        compared += 1
        sim = contour_similarity(target_contour, other_contour, method=method)
        if sim >= min_similarity:
            matches.append(ContourMatch(
                call_id=call.get("id", ""),
                call_type=call.get("call_type", "unknown"),
                similarity=sim,
                recording_id=call.get("recording_id"),
            ))
    matches.sort(key=lambda m: m.similarity, reverse=True)
    return ContourMatchResponse(
        query_call_id=call_id,
        matches=matches[:limit],
        total_compared=compared,
    )


@app.get("/api/research/embedding", response_model=EmbeddingResponse)
async def get_research_embedding(
    method: str = Query(default="pca", pattern="^(pca|umap)$"),
    call_ids: list[str] | None = Query(default=None),
) -> EmbeddingResponse:
    if call_ids:
        calls_by_id = _get_call_database().get_many(call_ids)
        missing = [call_id for call_id in call_ids if call_id not in calls_by_id]
        if missing:
            raise HTTPException(status_code=404, detail=f"Call IDs not found: {', '.join(missing)}")
        calls = [calls_by_id[call_id] for call_id in call_ids]
    else:
        calls, _ = _get_call_database().search(limit=10000)
    cache_key = json.dumps({"method": method, "call_ids": [call.get("id") for call in calls]}, sort_keys=True)
    embedding_cache: dict[str, Any] = app.state.embedding_cache
    if cache_key not in embedding_cache:
        embedding_cache[cache_key] = compute_embedding(calls, method=method)
    return EmbeddingResponse(**embedding_cache[cache_key])


@app.post("/api/research/stats", response_model=ResearchStatsResponse)
async def compare_research_stats(request: StatsRequest) -> ResearchStatsResponse:
    db = _get_call_database()
    group_a_map = db.get_many(request.group_a_ids)
    group_b_map = db.get_many(request.group_b_ids)
    missing = [
        call_id
        for call_id in [*request.group_a_ids, *request.group_b_ids]
        if call_id not in group_a_map and call_id not in group_b_map
    ]
    if missing:
        raise HTTPException(status_code=404, detail=f"Call IDs not found: {', '.join(missing)}")
    result = compare_groups(
        [group_a_map[call_id] for call_id in request.group_a_ids],
        [group_b_map[call_id] for call_id in request.group_b_ids],
    )
    return ResearchStatsResponse(**result)


@app.post("/api/export/research")
async def export_research(request: ExportRequest):
    if request.recording_ids:
        recordings = [recording for recording_id in request.recording_ids if (recording := _get_store().get(recording_id))]
    else:
        recordings = list(_get_store()._recordings.values())
    if not recordings:
        raise HTTPException(status_code=404, detail="No recordings available for export")
    recordings = _recordings_with_call_database_fields(recordings)
    recordings = _filter_export_recordings(recordings, request)

    if request.format == "csv":
        content = export_csv(recordings)
        return StreamingResponse(
            iter([content]),
            media_type="text/csv",
            headers={"Content-Disposition": 'attachment; filename="echofield_export.csv"'},
        )
    if request.format == "json":
        content = export_json(recordings)
        return StreamingResponse(
            iter([content]),
            media_type="application/json",
            headers={"Content-Disposition": 'attachment; filename="echofield_export.json"'},
        )
    if request.format == "zip":
        payload = export_zip(
            recordings,
            processed_dir=settings.processed_dir,
            spectrogram_dir=settings.spectrogram_dir,
            include_audio=request.include_audio,
            include_spectrograms=request.include_spectrograms,
            include_fingerprints=request.include_fingerprints,
            include_audio_clips=request.include_audio_clips,
        )
        return StreamingResponse(
            iter([payload.getvalue()]),
            media_type="application/zip",
            headers={"Content-Disposition": 'attachment; filename="echofield_export.zip"'},
        )

    pdf_path = export_pdf(recordings, settings.processed_dir / "echofield_export_report.pdf")
    return FileResponse(pdf_path, media_type="application/pdf")


@app.post("/api/classifier/train", response_model=dict)
async def train_call_classifier() -> dict[str, Any]:
    """Train the ML call type classifier from existing call database data."""
    db = _get_call_database()
    training_data = db.training_data(include_reviewed=True)
    if len(training_data) < 5:
        raise HTTPException(status_code=400, detail=f"Need at least 5 labeled calls, found {len(training_data)}")
    try:
        result = train_classifier(training_data, settings.classifier_model_path)
        version_info = _get_model_registry().register_model(settings.classifier_model_path, result)
        load_classifier(Path(version_info["model_path"]))
        metrics.inc("echofield_classifier_trains_total")
        return {
            "status": "trained",
            **result,
            "model_path": str(settings.classifier_model_path),
            "registry_version": version_info,
        }
    except Exception as exc:
        raise HTTPException(status_code=500, detail=str(exc))


@app.post("/api/classifier/retrain", response_model=dict)
async def retrain_call_classifier() -> dict[str, Any]:
    return await train_call_classifier()


@app.get("/api/models", response_model=list[ModelVersionInfo])
async def list_model_versions() -> list[ModelVersionInfo]:
    return [ModelVersionInfo(**item) for item in _get_model_registry().list_versions()]


@app.post("/api/models/{version}/activate", response_model=ModelVersionInfo)
async def activate_model_version(version: str) -> ModelVersionInfo:
    try:
        info = _get_model_registry().activate(version)
        load_classifier(Path(info["model_path"]))
        return ModelVersionInfo(**info)
    except FileNotFoundError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc


@app.get("/api/review/queue", response_model=ReviewQueueResponse)
async def review_queue(
    status: str | None = Query(default="pending"),
    max_confidence: float | None = Query(default=0.5, ge=0.0, le=1.0),
    call_type: str | None = Query(default=None),
    limit: int = Query(default=100, ge=1, le=500),
    offset: int = Query(default=0, ge=0),
) -> ReviewQueueResponse:
    items, total = _get_call_database().review_queue(
        status=status,
        max_confidence=max_confidence,
        call_type=call_type,
        limit=limit,
        offset=offset,
    )
    records = [CallRecord(**_enrich_call(item)) for item in items]
    return ReviewQueueResponse(total=total, returned=len(records), items=records)


@app.get("/api/review-queue", response_model=ReviewQueueResponse)
async def review_queue_alias(
    status: str | None = Query(default="pending"),
    max_confidence: float | None = Query(default=0.5, ge=0.0, le=1.0),
    call_type: str | None = Query(default=None),
    limit: int = Query(default=100, ge=1, le=500),
    offset: int = Query(default=0, ge=0),
) -> ReviewQueueResponse:
    return await review_queue(status=status, max_confidence=max_confidence, call_type=call_type, limit=limit, offset=offset)


@app.post("/api/review/{call_id}/label", response_model=CallRecord)
async def label_review_call(call_id: str, payload: ReviewLabelRequest) -> CallRecord:
    call = _get_call_database().label_call(call_id, payload.label, payload.reviewed_by)
    if call is None:
        raise HTTPException(status_code=404, detail="Call not found")
    app.state.embedding_cache = {}
    metrics.inc("echofield_review_labels_total")
    return CallRecord(**_enrich_call(call))


@app.post("/api/recordings/{recording_id}/infrasound-reveal")
async def infrasound_reveal(
    recording_id: str,
    shift_octaves: int = Query(default=3, ge=1, le=5),
    mix_mode: str = Query(default="shifted_only"),
):
    store = _get_store()
    recording = store.get(recording_id)
    if not recording:
        raise HTTPException(status_code=404, detail="Recording not found")

    # Load cleaned audio if available, otherwise original
    result = recording.get("result") or {}
    audio_path = result.get("output_audio_path")
    if not audio_path or not Path(audio_path).exists():
        audio_path = str(_get_recording_path(recording))

    y, sr = await asyncio.to_thread(load_audio, audio_path)

    # Create pitch-shifted audio (also detects regions internally)
    reveal = await asyncio.to_thread(
        create_infrasound_reveal,
        y,
        sr,
        shift_octaves=shift_octaves,
        mix_mode=mix_mode,
    )

    regions = reveal.get("regions", [])

    # Save shifted audio
    output_dir = Path(settings.processed_dir)
    output_dir.mkdir(parents=True, exist_ok=True)
    shifted_path = output_dir / f"{recording_id}_infrasound_shifted.wav"

    import soundfile as sf

    await asyncio.to_thread(sf.write, str(shifted_path), reveal["audio"], sr)

    return {
        "recording_id": recording_id,
        "infrasound_detected": len(regions) > 0,
        "infrasound_regions": [
            {
                "start_ms": r["start_ms"],
                "end_ms": r["end_ms"],
                "estimated_f0_hz": r["estimated_f0_hz"],
                "shifted_f0_hz": round(
                    r["estimated_f0_hz"] * (2**shift_octaves), 1
                ),
                "energy_db": r["energy_db"],
            }
            for r in regions
        ],
        "shifted_audio_url": f"/api/recordings/{recording_id}/audio/infrasound-shifted",
        "shift_octaves": shift_octaves,
        "frequency_range_original_hz": reveal["frequency_range_original_hz"],
        "frequency_range_shifted_hz": reveal["frequency_range_shifted_hz"],
        "infrasound_energy_pct": reveal["infrasound_energy_pct"],
        "mix_mode": mix_mode,
    }


@app.get("/api/recordings/{recording_id}/audio/infrasound-shifted")
async def get_infrasound_shifted_audio(recording_id: str):
    shifted_path = (
        Path(settings.processed_dir)
        / f"{recording_id}_infrasound_shifted.wav"
    )
    if not shifted_path.exists():
        raise HTTPException(
            status_code=404,
            detail="Shifted audio not found. Call /infrasound-reveal first.",
        )
    return FileResponse(str(shifted_path), media_type="audio/wav")


@app.post("/api/calls/{call_id}/review", response_model=CallRecord)
async def review_call_action(call_id: str, payload: ReviewActionRequest) -> CallRecord:
    try:
        call = _get_call_database().review_call(
            call_id,
            payload.action,
            corrected_call_type=payload.corrected_call_type,
            reviewer=payload.reviewer,
        )
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    if call is None:
        raise HTTPException(status_code=404, detail="Call not found")
    app.state.embedding_cache = {}
    metrics.inc("echofield_review_actions_total", labels={"action": payload.action})
    return CallRecord(**_enrich_call(call))


@app.get("/metrics")
async def prometheus_metrics() -> PlainTextResponse:
    return PlainTextResponse(metrics.render_prometheus(), media_type="text/plain; version=0.0.4")


@app.post("/api/webhooks", response_model=WebhookConfig, status_code=201)
async def register_webhook(config: WebhookConfig) -> WebhookConfig:
    stored = _get_webhooks().register(str(config.url), config.event_type)
    return WebhookConfig(**stored)


@app.get("/api/webhooks", response_model=list[WebhookConfig])
async def list_webhooks() -> list[WebhookConfig]:
    return [WebhookConfig(**item) for item in _get_webhooks().list()]


@app.delete("/api/webhooks/{webhook_id}", response_model=dict)
async def delete_webhook(webhook_id: str) -> dict[str, Any]:
    if not _get_webhooks().delete(webhook_id):
        raise HTTPException(status_code=404, detail="Webhook not found")
    return {"id": webhook_id, "deleted": True}


@app.get("/api/reference-calls")
async def list_reference_calls():
    """List available reference species for comparison."""
    return {
        "references": [
            {
                "id": ref_id,
                "species": spec["species"],
                "call_type": spec["call_type"],
                "description": spec["description"],
                "frequency_range_hz": spec["frequency_range_hz"],
            }
            for ref_id, spec in REFERENCE_CALLS.items()
        ]
    }


@app.post("/api/compare/cross-species")
async def cross_species_compare(
    call_id: str = Query(...),
    reference_id: str = Query(...),
):
    """Compare an elephant call against a reference species."""
    db = _get_call_database()
    call = db.get_call(call_id)
    if not call:
        raise HTTPException(status_code=404, detail="Call not found")

    comparison = await asyncio.to_thread(compare_call_to_reference, call, reference_id)

    return {
        "elephant_call": {
            "call_id": call_id,
            "call_type": call.get("call_type", "unknown"),
            "recording_id": call.get("recording_id", ""),
        },
        **comparison,
    }


# --- ML Labeling ---

@app.get("/api/ml/labeling-queue")
async def ml_labeling_queue(limit: int = Query(10, ge=1, le=100)):
    db = _get_call_database()
    mgr = _get_al_manager()
    queue = mgr.get_labeling_queue(db._calls, limit=limit)
    return queue


@app.post("/api/ml/label/{call_id}")
async def ml_label_call(call_id: str, body: dict):
    ct = body.get("call_type_refined", "")
    sf = body.get("social_function", "")
    if not validate_call_type(ct):
        raise HTTPException(status_code=422, detail=f"Invalid call_type_refined: {ct}. Must be one of {CALL_TYPES}")
    if not validate_social_function(sf):
        raise HTTPException(status_code=422, detail=f"Invalid social_function: {sf}. Must be one of {SOCIAL_FUNCTIONS}")
    mgr = _get_al_manager()
    mgr.save_label(call_id, ct, sf)
    db = _get_call_database()
    call = db._calls.get(call_id)
    if call:
        call["call_type_refined"] = ct
        call["social_function"] = sf
    return {
        "status": "labeled",
        "labels_since_last_train": mgr.labels_since_last_train,
        "retrain_threshold": mgr._retrain_threshold,
        "should_retrain": mgr.should_retrain(),
    }


# --- ML Training & Prediction ---

@app.post("/api/ml/train")
async def ml_train():
    mgr = _get_al_manager()
    clf = _get_ml_classifier()
    db = _get_call_database()
    labels = mgr.get_all_labels()
    if len(labels) < 5:
        raise HTTPException(status_code=400, detail=f"Need at least 5 labels, have {len(labels)}")
    training_data = []
    for call_id, label in labels.items():
        call = db._calls.get(call_id)
        features = (call or {}).get("acoustic_features", {})
        training_data.append({
            "acoustic_features": features,
            "call_type_refined": label["call_type_refined"],
            "social_function": label["social_function"],
        })
    result = clf.train(training_data)
    mgr.mark_retrained()
    return result


@app.get("/api/ml/predict/{call_id}")
async def ml_predict(call_id: str):
    db = _get_call_database()
    call = db._calls.get(call_id)
    if call is None:
        raise HTTPException(status_code=404, detail="Call not found")
    clf = _get_ml_classifier()
    features = call.get("acoustic_features", {})
    prediction = clf.predict(features)
    if prediction is None:
        return {"error": "No trained model available", "call_id": call_id}
    top_features = sorted(
        [(k, v) for k, v in features.items() if isinstance(v, (int, float)) and v is not None],
        key=lambda x: abs(x[1]),
        reverse=True,
    )[:5]
    narrative = call.get("narrative_text")
    if not narrative:
        narrative = generate_narrative(
            call_type=prediction["call_type"],
            social_function=prediction["social_function"],
            confidence=prediction["confidence"],
            top_features=top_features,
        )
        call["narrative_text"] = narrative
    prediction["narrative_text"] = narrative
    prediction["call_id"] = call_id
    return prediction


# --- ML Benchmarks ---

@app.get("/api/ml/benchmarks")
async def ml_benchmarks():
    clf = _get_ml_classifier()
    mgr = _get_al_manager()
    registry = clf._registry
    ct_history = registry.get_benchmark_history("call_type")
    sf_history = registry.get_benchmark_history("social_fn")
    accuracy_over_time = []
    for entry in ct_history:
        accuracy_over_time.append([
            entry.get("label_count", 0),
            entry.get("metrics", {}).get("accuracy", 0),
        ])
    return {
        "training_runs": {"call_type": ct_history, "social_function": sf_history},
        "active_learning": {
            "total_labels": len(mgr.get_all_labels()),
            "labels_since_last_train": mgr.labels_since_last_train,
            "retrain_threshold": mgr._retrain_threshold,
            "accuracy_over_time": accuracy_over_time,
        },
    }


@app.get("/api/ml/benchmarks/latest")
async def ml_benchmarks_latest():
    clf = _get_ml_classifier()
    registry = clf._registry
    ct_history = registry.get_benchmark_history("call_type")
    sf_history = registry.get_benchmark_history("social_fn")
    return {
        "call_type": ct_history[-1] if ct_history else None,
        "social_function": sf_history[-1] if sf_history else None,
    }


# --- Analytics ---

@app.get("/api/analytics/population")
async def analytics_population():
    db = _get_call_database()
    calls = [c for cid, c in db._calls.items() if cid != "__meta__"]
    ct_dist: dict[str, int] = {}
    sf_dist: dict[str, int] = {}
    by_site: dict[str, dict] = {}
    for call in calls:
        ct = call.get("call_type_refined") or call.get("call_type") or "unknown"
        sf = call.get("social_function") or "unknown"
        ct_dist[ct] = ct_dist.get(ct, 0) + 1
        sf_dist[sf] = sf_dist.get(sf, 0) + 1
        location = call.get("location") or "unknown"
        if location not in by_site:
            by_site[location] = {"call_count": 0, "dominant_type": ""}
        by_site[location]["call_count"] += 1
    for site, info in by_site.items():
        site_calls = [c for c in calls if (c.get("location") or "unknown") == site]
        types = {}
        for c in site_calls:
            t = c.get("call_type_refined") or c.get("call_type") or "unknown"
            types[t] = types.get(t, 0) + 1
        info["dominant_type"] = max(types, key=types.get) if types else "unknown"
    return {
        "call_type_distribution": ct_dist,
        "social_function_distribution": sf_dist,
        "by_site": by_site,
        "temporal_patterns": {"hourly_distribution": [0] * 24, "call_rate_per_recording": []},
    }


@app.get("/api/analytics/social-graph")
async def analytics_social_graph():
    db = _get_call_database()
    calls = sorted(
        [c for cid, c in db._calls.items() if cid != "__meta__"],
        key=lambda c: (c.get("recording_id", ""), float(c.get("start_ms") or 0)),
    )
    nodes: dict[str, dict] = {}
    edges: dict[str, dict] = {}
    for call in calls:
        cluster = call.get("cluster_id") or call.get("individual_id") or call.get("id", "unknown")
        if cluster not in nodes:
            nodes[cluster] = {"id": cluster, "call_count": 0, "dominant_type": "unknown"}
        nodes[cluster]["call_count"] += 1
    prev = None
    for call in calls:
        if prev and prev.get("recording_id") == call.get("recording_id"):
            prev_end = float(prev.get("start_ms") or 0) + float(prev.get("duration_ms") or 0)
            curr_start = float(call.get("start_ms") or 0)
            ici = curr_start - prev_end
            if 0 < ici < 5000:
                from_id = prev.get("cluster_id") or prev.get("individual_id") or prev.get("id", "")
                to_id = call.get("cluster_id") or call.get("individual_id") or call.get("id", "")
                if from_id != to_id:
                    edge_key = f"{from_id}->{to_id}"
                    if edge_key not in edges:
                        edges[edge_key] = {"from": from_id, "to": to_id, "response_count": 0, "ici_sum": 0.0}
                    edges[edge_key]["response_count"] += 1
                    edges[edge_key]["ici_sum"] += ici
        prev = call
    edge_list = []
    for e in edges.values():
        e["avg_ici_ms"] = round(e["ici_sum"] / e["response_count"], 1) if e["response_count"] > 0 else 0
        del e["ici_sum"]
        edge_list.append(e)
    return {"nodes": list(nodes.values()), "edges": edge_list}


@app.get("/api/analytics/recording/{recording_id}/features")
async def analytics_recording_features(recording_id: str):
    import numpy as np
    db = _get_call_database()
    calls = [
        c for cid, c in db._calls.items()
        if c.get("recording_id") == recording_id and cid != "__meta__"
    ]
    if not calls:
        raise HTTPException(status_code=404, detail="Recording not found or has no calls")
    ct_dist: dict[str, int] = {}
    f0_values: list[float] = []
    snr_values: list[float] = []
    duration_values: list[float] = []
    for call in calls:
        ct = call.get("call_type_refined") or call.get("call_type") or "unknown"
        ct_dist[ct] = ct_dist.get(ct, 0) + 1
        features = call.get("acoustic_features") or {}
        f0 = features.get("fundamental_frequency_hz")
        if f0 is not None:
            f0_values.append(float(f0))
        snr = features.get("snr_db")
        if snr is not None:
            snr_values.append(float(snr))
        dur = call.get("duration_ms")
        if dur is not None:
            duration_values.append(float(dur))
    def _stats(values):
        if not values:
            return {"min": 0, "max": 0, "mean": 0}
        arr = np.array(values)
        return {"min": round(float(np.min(arr)), 2), "max": round(float(np.max(arr)), 2), "mean": round(float(np.mean(arr)), 2)}
    return {
        "recording_id": recording_id,
        "call_count": len(calls),
        "call_types": ct_dist,
        "feature_distributions": {
            "fundamental_frequency_hz": _stats(f0_values),
            "snr_db": _stats(snr_values),
            "duration_ms": _stats(duration_values),
        },
    }


@app.post("/api/filter-chunk")
async def filter_chunk(
    request: Request,
    sr: int = Query(default=44100, ge=8000, le=192000),
    preserve_harmonics: bool = Query(default=True),
    aggressiveness: float = Query(default=1.0, ge=0.1, le=3.0),
    high_hz: float = Query(default=1200.0, ge=100.0, le=20000.0),
) -> Response:
    """Filter a raw PCM chunk using the spectral-gate pipeline.

    Request body: little-endian float32 PCM samples (mono).
    Response body: filtered float32 PCM samples (same length).
    Extra headers: X-Noise-Type, X-Noise-Confidence, X-SNR-Before-DB, X-SNR-After-DB.

    For phone/speaker playback use aggressiveness=0.5 and high_hz=4000 to avoid
    treating the signal itself as noise and to capture the phone's wider output range.
    """
    from echofield.pipeline.spectral_gate import spectral_gate_denoise, apply_bandpass_filter
    from echofield.pipeline.noise_classifier import classify_noise
    from echofield.pipeline.quality_check import compute_snr

    body = await request.body()
    if not body:
        return Response(content=b"", media_type="application/octet-stream")

    y = np.frombuffer(body, dtype="<f4").copy()

    noise_info: dict[str, object] = classify_noise(y, sr)
    noise_type = str(noise_info.get("noise_type") or "other")
    confidence = float(noise_info.get("confidence", 0.0))

    snr_before = float(compute_snr(y, sr))

    # Run spectral gate with caller-supplied aggressiveness, then apply the
    # requested bandpass so phone-mode (high_hz=4000) passes more of the signal.
    result = spectral_gate_denoise(
        y,
        sr,
        aggressiveness=aggressiveness,
        noise_type=noise_type,
        preserve_harmonics=preserve_harmonics,
        post_process=True,
    )
    cleaned: np.ndarray = result["cleaned_audio"]
    # Re-apply bandpass with the requested high_hz (default pipeline uses 1200 Hz)
    if high_hz != 1200.0:
        cleaned = apply_bandpass_filter(cleaned, sr, low_hz=8.0, high_hz=high_hz)

    snr_after = float(compute_snr(cleaned, sr))

    headers = {
        "X-Noise-Type": noise_type,
        "X-Noise-Confidence": f"{confidence:.4f}",
        "X-SNR-Before-DB": f"{snr_before:.2f}",
        "X-SNR-After-DB": f"{snr_after:.2f}",
        "Access-Control-Expose-Headers": (
            "X-Noise-Type, X-Noise-Confidence, X-SNR-Before-DB, X-SNR-After-DB"
        ),
    }
    return Response(
        content=cleaned.astype("<f4").tobytes(),
        media_type="application/octet-stream",
        headers=headers,
    )


# ─── Research Features: Ethology, Reference Library, Profiles, Social Network ───


@app.get("/api/ethology")
async def get_ethology_annotations() -> dict[str, Any]:
    """Return all ethology annotations for all call types."""
    from echofield.research.ethology_annotations import get_all_annotations
    return get_all_annotations()


@app.get("/api/calls/{call_id}/ethology")
async def get_call_ethology(call_id: str) -> dict[str, Any]:
    """Return ethology annotation for a specific call."""
    from echofield.research.ethology_annotations import get_annotation
    call = _get_call_database().get_call(call_id)
    if call is None:
        raise HTTPException(status_code=404, detail="Call not found")
    annotation = get_annotation(str(call.get("call_type", "")))
    return {"call_id": call_id, "ethology": annotation}


@app.get("/api/reference-library")
async def get_reference_library() -> list[dict[str, Any]]:
    """Return all reference rumbles (without fingerprint vectors)."""
    from echofield.research.reference_library import get_all_references
    return get_all_references()


@app.get("/api/calls/{call_id}/reference-matches")
async def get_call_reference_matches(
    call_id: str,
    top_k: int = Query(default=7, ge=1, le=10),
) -> list[dict[str, Any]]:
    """Match a call's fingerprint against reference rumble library."""
    from echofield.research.reference_library import match_against_references
    call = _get_call_database().get_call(call_id)
    if call is None:
        raise HTTPException(status_code=404, detail="Call not found")
    fingerprint = call.get("fingerprint") or []
    if not fingerprint:
        return []
    return match_against_references(fingerprint, top_k=top_k)


@app.get("/api/elephants")
async def list_elephants() -> list[dict[str, Any]]:
    """List all identified individual elephants with summary stats."""
    calls = _all_calls()
    individuals: dict[str, dict[str, Any]] = {}
    for call in calls:
        ind_id = _call_speaker_id(call)
        if not ind_id:
            continue
        if ind_id not in individuals:
            individuals[ind_id] = {
                "individual_id": ind_id,
                "call_count": 0,
                "recording_count": 0,
                "recordings": set(),
                "locations": set(),
                "dates": set(),
                "call_types": [],
                "acoustic_sums": {},
                "acoustic_counts": 0,
                "social_connections": set(),
            }
        ind = individuals[ind_id]
        ind["call_count"] += 1
        rec_id = call.get("recording_id")
        if rec_id:
            ind["recordings"].add(rec_id)
        loc = call.get("location")
        if loc:
            ind["locations"].add(loc)
        dt = call.get("date")
        if dt:
            ind["dates"].add(str(dt))
        ct = call.get("call_type")
        if ct:
            ind["call_types"].append(ct)
        features = call.get("acoustic_features") or {}
        for key in ("fundamental_frequency_hz", "harmonicity", "bandwidth_hz", "snr_db", "spectral_centroid_hz", "duration_s", "pitch_contour_slope", "spectral_entropy"):
            val = features.get(key)
            if val is not None:
                ind["acoustic_sums"][key] = ind["acoustic_sums"].get(key, 0.0) + float(val)
                ind["acoustic_counts"] = max(ind["acoustic_counts"], ind["acoustic_sums"].get(f"_count_{key}", 0) + 1)
                ind["acoustic_sums"][f"_count_{key}"] = ind["acoustic_sums"].get(f"_count_{key}", 0) + 1

    # Find social connections (individuals in same recordings)
    recording_to_individuals: dict[str, set[str]] = {}
    for call in calls:
        ind_id = _call_speaker_id(call)
        rec_id = call.get("recording_id")
        if ind_id and rec_id:
            recording_to_individuals.setdefault(rec_id, set()).add(ind_id)
    for rec_ids_set in recording_to_individuals.values():
        for a in rec_ids_set:
            for b in rec_ids_set:
                if a != b and a in individuals:
                    individuals[a]["social_connections"].add(b)

    result = []
    for ind in individuals.values():
        type_counts = Counter(ind["call_types"])
        most_common = type_counts.most_common(1)[0][0] if type_counts else "unknown"
        n = ind["call_count"] or 1
        sums = ind["acoustic_sums"]
        sig = {}
        for key in ("fundamental_frequency_hz", "harmonicity", "bandwidth_hz", "snr_db", "spectral_centroid_hz", "duration_s", "pitch_contour_slope", "spectral_entropy"):
            count = sums.get(f"_count_{key}", 0)
            sig[key] = round(sums.get(key, 0) / max(count, 1), 3)
        result.append({
            "individual_id": ind["individual_id"],
            "call_count": ind["call_count"],
            "recording_count": len(ind["recordings"]),
            "recordings": sorted(ind["recordings"]),
            "locations": sorted(ind["locations"]),
            "dates": sorted(ind["dates"]),
            "most_common_type": most_common,
            "call_type_distribution": dict(type_counts),
            "acoustic_signature": sig,
            "active_hours": {},
            "social_connections": sorted(ind["social_connections"]),
        })
    result.sort(key=lambda x: x["call_count"], reverse=True)
    return result


@app.get("/api/elephants/{individual_id}")
async def get_elephant(individual_id: str) -> dict[str, Any]:
    """Get full profile for a specific individual elephant."""
    profiles = await list_elephants()
    for profile in profiles:
        if profile["individual_id"] == individual_id:
            return profile
    raise HTTPException(status_code=404, detail="Individual not found")


@app.get("/api/elephants/{individual_id}/calls")
async def get_elephant_calls(
    individual_id: str,
    limit: int = Query(default=100, ge=1, le=500),
    offset: int = Query(default=0, ge=0),
) -> dict[str, Any]:
    """Get all calls for a specific individual elephant."""
    calls = _all_calls()
    filtered = [c for c in calls if _call_speaker_id(c) == individual_id]
    total = len(filtered)
    items = [CallRecord(**_enrich_call(c)) for c in filtered[offset:offset + limit]]
    return {"items": items, "total": total}


@app.get("/api/social-network")
async def get_social_network() -> dict[str, Any]:
    """Build and return the elephant social network graph."""
    from echofield.research.social_network import build_social_network
    calls = _all_calls()
    return build_social_network(calls)


@app.get("/api/recordings/{recording_id}/conversation")
async def get_recording_conversation(recording_id: str) -> dict[str, Any]:
    """Get conversation-style data for a specific recording."""
    from echofield.research.social_network import get_conversation_data
    calls = _all_calls()
    return get_conversation_data(calls, recording_id)


@app.get("/api/recordings/{recording_id}/speakers")
async def get_recording_speakers(recording_id: str) -> dict[str, Any]:
    """Get speaker separation results for a recording."""
    from echofield.pipeline.speaker_separation import separate_speakers, get_speaker_metadata
    store = _get_store()
    recording = store.get(recording_id)
    if recording is None:
        raise HTTPException(status_code=404, detail="Recording not found")
    result = recording.get("result") or {}
    audio_path = result.get("output_audio_path") or str(_get_recording_path(recording))
    if not audio_path or not Path(audio_path).exists():
        raise HTTPException(status_code=400, detail="No audio available for speaker separation")
    y, sr = load_audio(str(audio_path))
    separation = separate_speakers(y, sr)
    speakers_metadata = [get_speaker_metadata(s, sr) for s in separation.get("speakers", [])]
    return {
        "speaker_count": separation["speaker_count"],
        "speakers": speakers_metadata,
    }


@app.get("/api/recordings/{recording_id}/speakers/{speaker_id}/download")
async def download_speaker_audio(recording_id: str, speaker_id: str) -> Response:
    """Download isolated audio for a specific speaker."""
    from echofield.pipeline.speaker_separation import separate_speakers
    store = _get_store()
    recording = store.get(recording_id)
    if recording is None:
        raise HTTPException(status_code=404, detail="Recording not found")
    result = recording.get("result") or {}
    audio_path = result.get("output_audio_path") or str(_get_recording_path(recording))
    if not audio_path or not Path(audio_path).exists():
        raise HTTPException(status_code=400, detail="No audio available")
    y, sr = load_audio(str(audio_path))
    separation = separate_speakers(y, sr)
    for speaker in separation.get("speakers", []):
        if speaker["id"] == speaker_id:
            buf = io.BytesIO()
            import soundfile as sf
            sf.write(buf, speaker["audio"], sr, format="WAV")
            buf.seek(0)
            return Response(
                content=buf.read(),
                media_type="audio/wav",
                headers={"Content-Disposition": f'attachment; filename="speaker_{speaker_id}.wav"'},
            )
    raise HTTPException(status_code=404, detail="Speaker not found")


@app.get("/api/calls/{call_id}/harmonics")
async def get_call_harmonics(call_id: str) -> dict[str, Any]:
    """Get harmonic decomposition for a specific call."""
    from echofield.pipeline.harmonic_decomposition import decompose_harmonics
    call = _get_call_database().get_call(call_id)
    if call is None:
        raise HTTPException(status_code=404, detail="Call not found")
    features = call.get("acoustic_features") or {}
    fundamental_hz = float(features.get("fundamental_frequency_hz", 0))
    if fundamental_hz <= 0:
        return {"fundamental_hz": 0, "harmonics": [], "total_harmonics_detected": 0}
    recording_id = call.get("recording_id", "")
    store = _get_store()
    recording = store.get(recording_id)
    if recording is None:
        return {"fundamental_hz": fundamental_hz, "harmonics": [], "total_harmonics_detected": 0}
    result = recording.get("result") or {}
    original_path = str(_get_recording_path(recording))
    cleaned_path = result.get("output_audio_path")
    if not original_path or not Path(str(original_path)).exists():
        return {"fundamental_hz": fundamental_hz, "harmonics": [], "total_harmonics_detected": 0}
    y_original, sr = load_audio(str(original_path))
    y_cleaned = load_audio(str(cleaned_path))[0] if cleaned_path and Path(str(cleaned_path)).exists() else y_original
    start_sample = int(float(call.get("start_ms", 0)) / 1000.0 * sr)
    end_sample = start_sample + int(float(call.get("duration_ms", 0)) / 1000.0 * sr)
    start_sample = max(0, min(start_sample, len(y_original) - 1))
    end_sample = max(start_sample + 1, min(end_sample, len(y_original)))
    return decompose_harmonics(
        y_original[start_sample:end_sample],
        y_cleaned[start_sample:end_sample] if len(y_cleaned) > end_sample else y_cleaned,
        sr,
        fundamental_hz,
    )


@app.get("/api/recordings/{recording_id}/summary")
async def get_recording_summary(recording_id: str) -> dict[str, Any]:
    """Get research summary for a processed recording."""
    from echofield.research.summary_generator import generate_recording_summary
    store = _get_store()
    recording = store.get(recording_id)
    if recording is None:
        raise HTTPException(status_code=404, detail="Recording not found")
    calls_for_recording = [
        c for c in _all_calls() if c.get("recording_id") == recording_id
    ]
    return generate_recording_summary(recording, calls_for_recording)


@app.get("/api/stats/research-impact")
async def get_research_impact_stats() -> dict[str, Any]:
    """Extended stats for the research impact dashboard."""
    return _research_impact_payload()


@app.websocket("/ws/live")
async def ws_live(websocket: WebSocket) -> None:
    await manager.connect_global(websocket)
    heartbeat_task = asyncio.create_task(manager.heartbeat(websocket))
    try:
        while True:
            await websocket.receive_text()
    except WebSocketDisconnect:
        manager.disconnect_global(websocket)
    finally:
        heartbeat_task.cancel()


@app.websocket("/ws/processing/{recording_id}")
async def ws_processing(websocket: WebSocket, recording_id: str) -> None:
    await manager.connect_recording(websocket, recording_id)
    heartbeat_task = asyncio.create_task(manager.heartbeat(websocket))
    try:
        while True:
            await websocket.receive_text()
    except WebSocketDisconnect:
        manager.disconnect_recording(websocket, recording_id)
    finally:
        heartbeat_task.cancel()
