"""EchoField FastAPI application."""

from __future__ import annotations

import asyncio
import hashlib
import io
import json
import shutil
import uuid
from contextlib import asynccontextmanager
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

import aiofiles
from fastapi import BackgroundTasks, FastAPI, File, Header, HTTPException, Query, Request, Response, UploadFile, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, PlainTextResponse, StreamingResponse
from fastapi.staticfiles import StaticFiles

from echofield.batch_store import BatchStore
from echofield.config import get_settings
from echofield.data_loader import RecordingStore, list_recordings_with_metadata
from echofield.metrics import metrics
from echofield.model_registry import ModelRegistry
from echofield.models import (
    AnnotationRequest,
    BatchStatusResponse,
    BatchSubmitResponse,
    CallAnnotation,
    CallListResponse,
    CallRecord,
    ComponentHealth,
    ContourMatch,
    ContourMatchResponse,
    EmbeddingResponse,
    ErrorResponse,
    ExportRequest,
    HarmonicOverlayResponse,
    HealthResponse,
    IndividualProfile,
    MetadataPatchRequest,
    ModelVersionInfo,
    ProcessingResult,
    ProcessingStatusModel,
    RecordingDetail,
    RecordingListResponse,
    RecordingMetadata,
    RecordingSummary,
    RecordingStatus,
    ResearchStatsResponse,
    ReviewLabelRequest,
    ReviewQueueResponse,
    SimilarityEdge,
    SimilarityGraphResponse,
    SimilarityNode,
    StatsRequest,
    StatsResponse,
    UploadResponse,
    WebhookConfig,
)
from echofield.pipeline.cache_manager import CacheManager
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
from echofield.research.exporter import export_csv, export_json, export_pdf, export_zip
from echofield.research.individual_id import IndividualIdentifier
from echofield.utils.audio_utils import get_duration, load_audio
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
    metadata = (recording.get("metadata") if recording else payload.get("metadata")) or {}
    if recording is not None:
        payload.setdefault("recording_id", recording.get("id"))
    for key in ("call_id", "animal_id", "noise_type_ref", "start_sec", "end_sec", "location", "date", "species"):
        if payload.get(key) in {None, ""} and metadata.get(key) not in {None, ""}:
            payload[key] = metadata[key]
    payload.setdefault("call_id", payload.get("id"))
    if "metadata" not in payload:
        payload["metadata"] = metadata
    return payload


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
                for key in ("annotations", "individual_id", "review_label", "reviewed_by", "reviewed_at"):
                    enriched[key] = db_call.get(key)
            calls.append(enriched)
        result["calls"] = calls
        item["result"] = result
        merged.append(item)
    return merged


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
                method=method,
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


@app.post("/api/upload", response_model=UploadResponse, status_code=201)
async def upload_recording(
    response: Response,
    file: UploadFile = File(...),
    location: str | None = Query(default=None),
    date: str | None = Query(default=None),
    notes: str | None = Query(default=None),
) -> UploadResponse:
    if not file.filename:
        raise HTTPException(status_code=400, detail="Filename is required")
    suffix = Path(file.filename).suffix.lower()
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
    metadata = {k: v for k, v in {"location": location, "date": date, "notes": notes, "file_hash": file_hash}.items() if v}
    _get_store().add(
        recording_id,
        destination.name,
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
    aggressiveness: float = Query(default=1.5, ge=0.1, le=5.0),
) -> dict[str, Any]:
    recording = _get_store().get(recording_id)
    if recording is None:
        raise HTTPException(status_code=404, detail="Recording not found")
    if recording["status"] == "processing":
        raise HTTPException(status_code=409, detail="Recording already processing")
    _get_store().update_status(recording_id, "processing", progress=0, current_stage="ingestion")
    task = asyncio.create_task(_run_processing(recording_id, method, aggressiveness))
    _get_tasks()[recording_id] = task
    return {"id": recording_id, "status": "processing", "method": method}


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


@app.get("/api/batch/{batch_id}/status", response_model=BatchStatusResponse)
async def get_batch_status(batch_id: str) -> BatchStatusResponse:
    batch = _get_batch_store().get(batch_id)
    if batch is None:
        raise HTTPException(status_code=404, detail="Batch not found")
    return BatchStatusResponse(**batch)


@app.get("/api/recordings/{recording_id}/spectrogram")
async def get_spectrogram(
    recording_id: str,
    type: str = Query(default="after"),
) -> FileResponse:
    recording = _get_store().get(recording_id)
    if recording is None:
        raise HTTPException(status_code=404, detail="Recording not found")
    result = recording.get("result") or {}
    mapping = {
        "before": result.get("spectrogram_before_path"),
        "after": result.get("spectrogram_after_path"),
        "comparison": result.get("comparison_spectrogram_path"),
    }
    path = mapping.get(type)
    if not path or not Path(path).exists():
        raise HTTPException(status_code=404, detail="Spectrogram not found")
    return FileResponse(path, media_type="image/png")


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


@app.get("/api/stats", response_model=StatsResponse)
async def get_stats() -> StatsResponse:
    stats = _get_store().get_stats()
    stats["circuit_breakers"] = get_circuit_breaker_registry().snapshot()
    return StatsResponse(**stats)


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
async def list_individuals(call_type: str | None = Query(default=None)) -> list[IndividualProfile]:
    calls, _ = _identify_calls(call_type=call_type)
    profiles = _get_individual_identifier().profiles(calls)
    return [IndividualProfile(**profile) for profile in profiles]


@app.get("/api/individuals/{individual_id}/calls", response_model=CallListResponse)
async def list_individual_calls(
    individual_id: str,
    limit: int = Query(50, ge=1, le=500),
    offset: int = Query(0, ge=0),
) -> CallListResponse:
    calls, assignments = _identify_calls()
    matched = [
        {**call, "individual_id": assignments.get(str(call.get("id")), call.get("individual_id"))}
        for call in calls
        if assignments.get(str(call.get("id")), call.get("individual_id")) == individual_id
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
    limit: int = Query(default=100, ge=1, le=500),
    offset: int = Query(default=0, ge=0),
) -> ReviewQueueResponse:
    items, total = _get_call_database().review_queue(limit=limit, offset=offset)
    records = [CallRecord(**_enrich_call(item)) for item in items]
    return ReviewQueueResponse(total=total, returned=len(records), items=records)


@app.post("/api/review/{call_id}/label", response_model=CallRecord)
async def label_review_call(call_id: str, payload: ReviewLabelRequest) -> CallRecord:
    call = _get_call_database().label_call(call_id, payload.label, payload.reviewed_by)
    if call is None:
        raise HTTPException(status_code=404, detail="Call not found")
    app.state.embedding_cache = {}
    metrics.inc("echofield_review_labels_total")
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
