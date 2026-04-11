"""EchoField FastAPI application."""

from __future__ import annotations

import asyncio
import io
import json
import logging
import os
import shutil
import uuid
from contextlib import asynccontextmanager
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
    CallDetail,
    CallListResponse,
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
from echofield.research.call_database import CallDatabase
from echofield.pipeline.cache_manager import CacheManager
from echofield.pipeline.hybrid_pipeline import ProcessingPipeline
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
    store = RecordingStore()
    preload = list_recordings_with_metadata(settings.audio_dir, settings.metadata_file)
    store.load_many(preload)
    application.state.store = store
    application.state.cache = CacheManager(str(settings.cache_dir))
    application.state.pipeline = ProcessingPipeline(settings, application.state.cache)
    yield

    # Pre-load metadata rows if the CSV exists
    meta_rows = load_metadata_csv(settings.METADATA_FILE)
    for row in meta_rows:
        rid = row.get("id") or str(uuid.uuid4())
        fname = row.get("filename", "unknown")
        duration = float(row.get("duration_s", 0))
        size = float(row.get("filesize_mb", 0))
        metadata: dict[str, Any] = {}
        for key in ("location", "date", "microphone_type", "notes", "species", "recorder"):
            if key in row and row[key]:
                metadata[key] = row[key]
        store.add(rid, fname, duration, size, metadata=metadata or None)

    # Discover existing audio files that may not be in the CSV
    audio_files = discover_audio_files(settings.AUDIO_DIR)
    existing_filenames = {r["filename"] for r in (store.get(k) for k in store._recordings) if r}
    for fpath in audio_files:
        fname = Path(fpath).name
        if fname not in existing_filenames:
            rid = str(uuid.uuid4())
            fsize = Path(fpath).stat().st_size / (1024 * 1024)
            store.add(rid, fname, duration_s=0.0, filesize_mb=round(fsize, 3))

    # ---------------------------------------------------------------
    # Initialise the call catalog
    # ---------------------------------------------------------------
    call_db = CallDatabase()
    application.state.call_db = call_db

    # 1. Load pre-existing call records from the calls CSV if present.
    #    The calls CSV path is derived from the metadata file path:
    #    data/metadata.csv  →  data/calls.csv
    #    but can be overridden via ECHOFIELD_CALLS_FILE env var.
    calls_csv_path = Path(
        os.environ.get(
            "ECHOFIELD_CALLS_FILE",
            str(Path(settings.METADATA_FILE).with_name("calls.csv")),
        )
    )
    n_loaded = call_db.load_from_csv(calls_csv_path)

    # 2. Also seed from any already-processed recordings in the store.
    for rec in store._recordings.values():
        result = rec.get("result")
        if result and isinstance(result, dict):
            pipeline_calls = result.get("calls", [])
            if pipeline_calls:
                call_db.register_pipeline_calls(
                    recording_id=rec["id"],
                    calls=pipeline_calls,
                    recording_metadata=rec.get("metadata") or {},
                )

    logger.info(
        "EchoField started — %d recordings in store, %d calls in catalog"
        " (%d from CSV)",
        len(store._recordings),
        len(call_db),
        n_loaded,
    )

    yield  # Application runs here

    logger.info("EchoField shutting down")


# ---------------------------------------------------------------------------
# FastAPI app
# ---------------------------------------------------------------------------

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


def _get_recording_path(recording: dict[str, Any]) -> Path:
    if recording.get("source_path"):
        return Path(recording["source_path"])
    return settings.audio_dir / recording["filename"]


def _get_call_db() -> CallDatabase:
    """Retrieve the CallDatabase from app state."""
    return app.state.call_db  # type: ignore[return-value]


def _recording_to_summary(rec: dict[str, Any]) -> RecordingSummary:
    """Convert an internal recording dict to a RecordingSummary model."""
    meta = rec.get("metadata")
    metadata = RecordingMetadata(**meta) if meta else None
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
    limit: int = Query(50, ge=1, le=500, description="Max results to return"),
    offset: int = Query(0, ge=0, description="Results to skip (pagination)"),
    call_type: str | None = Query(None, description="Filter by call type (exact)"),
    recording_id: str | None = Query(None, description="Filter by recording ID (exact)"),
    animal_id: str | None = Query(None, description="Filter by animal ID (exact)"),
    location: str | None = Query(None, description="Filter by location (substring, case-insensitive)"),
    date_from: str | None = Query(None, description="Earliest date inclusive (YYYY-MM-DD)"),
    date_to: str | None = Query(None, description="Latest date inclusive (YYYY-MM-DD)"),
    min_confidence: float | None = Query(None, ge=0.0, le=1.0, description="Minimum confidence threshold"),
    sort_by: str = Query("confidence", description="Field to sort by (top-level or acoustic_features key)"),
    sort_desc: bool = Query(True, description="Sort descending (default true)"),
):
    """List detected calls with filtering, sorting, and pagination.

    Searches the in-memory call catalog populated at startup from
    ``data/calls.csv`` and any processed recordings. All filters are
    optional and combined with AND logic. The ``sort_by`` parameter
    accepts any top-level call field **or** any key within
    ``acoustic_features`` (e.g. ``fundamental_frequency_hz``).
    """
    call_db = _get_call_db()
    results, total = call_db.search(
        call_type=call_type,
        location=location,
        recording_id=recording_id,
        animal_id=animal_id,
        min_confidence=min_confidence,
        date_from=date_from,
        date_to=date_to,
        limit=limit,
        offset=offset,
        sort_by=sort_by,
        sort_desc=sort_desc,
    )
    return CallListResponse(
        total=total,
        returned=len(results),
        offset=offset,
        calls=[CallDetail(**c) for c in results],
    )


@app.get("/api/calls/{call_id}", response_model=CallDetail)
async def get_call(call_id: str):
    """Return full detail for a single detected call by its ID."""
    call_db = _get_call_db()
    record = call_db.get_call(call_id)
    if record is None:
        raise HTTPException(status_code=404, detail=f"Call {call_id} not found")
    return CallDetail(**record)
    limit: int = Query(50, ge=1, le=500),
    offset: int = Query(0, ge=0),
    call_type: str | None = Query(default=None),
    recording_id: str | None = Query(default=None),
) -> dict[str, Any]:
    calls: list[dict[str, Any]] = []
    for recording in _get_store()._recordings.values():
        result = recording.get("result") or {}
        for call in result.get("calls", []):
            if call_type and call.get("call_type") != call_type:
                continue
            if recording_id and call.get("recording_id") != recording_id:
                continue
            calls.append(call)
    total = len(calls)
    return {"items": calls[offset : offset + limit], "total": total}


@app.get("/api/calls/{call_id}", response_model=dict)
async def get_call(call_id: str) -> dict[str, Any]:
    for recording in _get_store()._recordings.values():
        result = recording.get("result") or {}
        for call in result.get("calls", []):
            if call.get("id") == call_id:
                return call
    raise HTTPException(status_code=404, detail="Call not found")


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
