"""EchoField FastAPI application."""

from __future__ import annotations

import asyncio
import io
import json
import uuid
from contextlib import asynccontextmanager
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

import aiofiles
from fastapi import BackgroundTasks, FastAPI, File, HTTPException, Query, Request, UploadFile, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, StreamingResponse
from fastapi.staticfiles import StaticFiles

from echofield.config import get_settings
from echofield.data_loader import RecordingStore, list_recordings_with_metadata
from echofield.models import (
    CallListResponse,
    CallRecord,
    ErrorResponse,
    ExportRequest,
    ProcessingResult,
    ProcessingStatusModel,
    RecordingDetail,
    RecordingListResponse,
    RecordingMetadata,
    RecordingSummary,
    RecordingStatus,
    StatsResponse,
    UploadResponse,
)
from echofield.pipeline.cache_manager import CacheManager
from echofield.pipeline.hybrid_pipeline import ProcessingPipeline
from echofield.research.call_database import CallDatabase
from echofield.research.exporter import export_csv, export_json, export_pdf, export_zip
from echofield.utils.audio_utils import get_duration, load_audio
from echofield.utils.logging_config import get_logger, request_context
from echofield.websocket import manager

logger = get_logger(__name__)


def _serialize_result(result: dict[str, Any]) -> dict[str, Any]:
    serialized = json.loads(json.dumps(result, default=str))
    return serialized


@asynccontextmanager
async def lifespan(application: FastAPI):
    settings = get_settings()
    settings.ensure_directories()
    store = RecordingStore(persist_path=settings.catalog_file)
    preload = list_recordings_with_metadata(settings.audio_dir, settings.metadata_file)
    store.load_many(preload)
    application.state.call_database = CallDatabase.from_metadata(settings.metadata_file)
    application.state.store = store
    application.state.cache = CacheManager(str(settings.cache_dir))
    application.state.pipeline = ProcessingPipeline(settings, application.state.cache)
    yield


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
    request_id = request.headers.get("x-request-id") or uuid.uuid4().hex
    with request_context(request_id):
        response = await call_next(request)
    response.headers["x-request-id"] = request_id
    return response


def _get_store() -> RecordingStore:
    return app.state.store  # type: ignore[return-value]


def _get_pipeline() -> ProcessingPipeline:
    return app.state.pipeline  # type: ignore[return-value]


def _get_call_database() -> CallDatabase:
    return app.state.call_database  # type: ignore[return-value]


def _get_recording_path(recording: dict[str, Any]) -> Path:
    if recording.get("source_path"):
        return Path(recording["source_path"])
    return settings.audio_dir / recording["filename"]


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


async def _run_processing(
    recording_id: str,
    method: str,
    aggressiveness: float,
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
        with request_context(recording_id):
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
                    data,
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
            store.update_status(
                recording_id,
                "complete",
                progress=100,
                current_stage="complete",
                duration_s=result.get("processing_time_s"),
            )
            await manager.send_quality_score(recording_id, result["quality"])
            await manager.send_processing_complete(recording_id, result)
    except Exception as exc:
        logger.exception("Processing failed for %s", recording_id)
        store.update_status(recording_id, "failed", current_stage="complete")
        await manager.send_processing_failed(recording_id, str(exc))


@app.get("/health", response_model=dict)
async def health_check() -> dict[str, str]:
    return {"status": "healthy", "version": app.version}


@app.post("/api/upload", response_model=UploadResponse, status_code=201)
async def upload_recording(
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

    recording_id = str(uuid.uuid4())
    destination = settings.audio_dir / f"{recording_id}{suffix}"
    async with aiofiles.open(destination, "wb") as handle:
        while chunk := await file.read(1024 * 1024):
            await handle.write(chunk)

    y, sr = load_audio(destination, sr=None)
    duration_s = round(get_duration(y, sr), 3)
    metadata = {k: v for k, v in {"location": location, "date": date, "notes": notes}.items() if v}
    _get_store().add(
        recording_id,
        destination.name,
        duration_s,
        round(destination.stat().st_size / (1024 * 1024), 3),
        metadata=metadata,
        source_path=str(destination),
    )
    return UploadResponse(
        status="pending",
        recording_ids=[recording_id],
        count=1,
        total_duration_s=duration_s,
        message=f"Uploaded {file.filename}",
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
    background_tasks.add_task(_run_processing, recording_id, method, aggressiveness)
    _get_store().update_status(recording_id, "processing", progress=0, current_stage="ingestion")
    return {"id": recording_id, "status": "processing", "method": method}


@app.post("/api/batch/process", response_model=dict)
async def process_batch(
    payload: dict[str, Any],
    background_tasks: BackgroundTasks,
) -> dict[str, Any]:
    recording_ids = payload.get("recording_ids") or []
    method = str(payload.get("method") or settings.DENOISE_METHOD)
    aggressiveness = float(payload.get("aggressiveness") or 1.5)
    if not isinstance(recording_ids, list) or not recording_ids:
        raise HTTPException(status_code=400, detail="recording_ids is required")
    for recording_id in recording_ids:
        background_tasks.add_task(_run_processing, str(recording_id), method, aggressiveness)
    return {"queued": len(recording_ids), "status": "processing"}


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
    media_type = {
        ".wav": "audio/wav",
        ".mp3": "audio/mpeg",
        ".flac": "audio/flac",
    }.get(path.suffix.lower(), "application/octet-stream")
    return FileResponse(path, media_type=media_type)


@app.get("/api/recordings/{recording_id}/download")
async def download_cleaned(recording_id: str) -> FileResponse:
    return await get_audio(recording_id, type="cleaned")


@app.get("/api/stats", response_model=StatsResponse)
async def get_stats() -> StatsResponse:
    return StatsResponse(**_get_store().get_stats())


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
        sort_by=sort_by,
        sort_desc=sort_desc,
        limit=limit,
        offset=offset,
    )
    records = [CallRecord(**_enrich_call(item)) for item in items]
    return CallListResponse(total=total, returned=len(records), items=records)


@app.get("/api/calls/{call_id}", response_model=CallRecord)
async def get_call(call_id: str) -> CallRecord:
    call = _get_call_database().get_call(call_id)
    if call is None:
        raise HTTPException(status_code=404, detail="Call not found")
    return CallRecord(**_enrich_call(call))


@app.post("/api/export/research")
async def export_research(request: ExportRequest):
    if request.recording_ids:
        recordings = [recording for recording_id in request.recording_ids if (recording := _get_store().get(recording_id))]
    else:
        recordings = list(_get_store()._recordings.values())
    if not recordings:
        raise HTTPException(status_code=404, detail="No recordings available for export")

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
