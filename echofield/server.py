"""
EchoField FastAPI application.

Provides the REST API for uploading, listing, processing, and exporting
elephant-vocalization field recordings.
"""

from __future__ import annotations

import csv
import io
import json
import logging
import shutil
import uuid
from contextlib import asynccontextmanager
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

import aiofiles
from fastapi import FastAPI, File, HTTPException, Query, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, StreamingResponse
from fastapi.staticfiles import StaticFiles

from echofield.config import get_settings
from echofield.data_loader import RecordingStore, discover_audio_files, load_metadata_csv
from echofield.models import (
    CallDetail,
    CallListResponse,
    ErrorResponse,
    ExportRequest,
    ProcessingResult,
    RecordingListResponse,
    RecordingMetadata,
    RecordingSummary,
    RecordingStatus,
    StatsResponse,
    UploadResponse,
)
from echofield.research.call_database import CallDatabase

logger = logging.getLogger(__name__)


# ---------------------------------------------------------------------------
# Lifespan — initialise shared state
# ---------------------------------------------------------------------------

@asynccontextmanager
async def lifespan(application: FastAPI):
    """Startup / shutdown lifecycle handler.

    On startup:
    - Ensure data directories exist.
    - Create the global RecordingStore.
    - Pre-load any metadata CSV rows into the store.
    """
    settings = get_settings()
    settings.ensure_directories()

    store = RecordingStore()
    application.state.store = store

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
    version="0.1.0",
    description="Elephant vocalization noise-removal and research platform",
    lifespan=lifespan,
)

# CORS
_settings = get_settings()
app.add_middleware(
    CORSMiddleware,
    allow_origins=_settings.CORS_ORIGINS,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


# ---------------------------------------------------------------------------
# Static file mounts
# ---------------------------------------------------------------------------

def _mount_static() -> None:
    """Mount static directories only if they exist."""
    settings = get_settings()
    spec_dir = Path(settings.SPECTROGRAM_DIR)
    proc_dir = Path(settings.PROCESSED_DIR)
    if spec_dir.is_dir():
        app.mount("/spectrograms", StaticFiles(directory=str(spec_dir)), name="spectrograms")
    if proc_dir.is_dir():
        app.mount("/processed", StaticFiles(directory=str(proc_dir)), name="processed")


_mount_static()


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _get_store() -> RecordingStore:
    """Retrieve the RecordingStore from app state."""
    return app.state.store  # type: ignore[return-value]


def _get_call_db() -> CallDatabase:
    """Retrieve the CallDatabase from app state."""
    return app.state.call_db  # type: ignore[return-value]


def _recording_to_summary(rec: dict[str, Any]) -> RecordingSummary:
    """Convert an internal recording dict to a RecordingSummary model."""
    meta = rec.get("metadata")
    metadata = RecordingMetadata(**meta) if meta else None

    calls_detected = 0
    snr_improvement: float | None = None
    result = rec.get("result")
    if result and isinstance(result, dict):
        calls_detected = len(result.get("calls", []))
        quality = result.get("quality")
        if quality and isinstance(quality, dict):
            snr_improvement = quality.get("snr_improvement_db")

    return RecordingSummary(
        id=rec["id"],
        filename=rec["filename"],
        duration_s=rec["duration_s"],
        filesize_mb=rec["filesize_mb"],
        uploaded_at=rec["uploaded_at"],
        status=RecordingStatus(rec["status"]),
        metadata=metadata,
        processing_progress=float(rec["processing"]["progress"]),
        calls_detected=calls_detected,
        snr_improvement_db=snr_improvement,
    )


# ---------------------------------------------------------------------------
# Routes — Health
# ---------------------------------------------------------------------------

@app.get("/health", response_model=dict)
async def health_check():
    """Health-check endpoint."""
    return {"status": "healthy", "version": "0.1.0"}


# ---------------------------------------------------------------------------
# Routes — Upload
# ---------------------------------------------------------------------------

@app.post("/api/upload", response_model=UploadResponse, status_code=201)
async def upload_recording(
    file: UploadFile = File(...),
    location: str | None = Query(None, description="Recording location"),
    date: str | None = Query(None, description="Recording date"),
    notes: str | None = Query(None, description="Additional notes"),
):
    """Accept an audio file upload, save it to disk, and register it in the store."""
    if file.filename is None:
        raise HTTPException(status_code=400, detail="No filename provided")

    # Validate extension
    suffix = Path(file.filename).suffix.lower()
    if suffix not in {".wav", ".mp3", ".flac"}:
        raise HTTPException(
            status_code=400,
            detail=f"Unsupported file type '{suffix}'. Accepted: .wav, .mp3, .flac",
        )

    settings = get_settings()
    recording_id = str(uuid.uuid4())
    safe_filename = f"{recording_id}{suffix}"
    dest = Path(settings.AUDIO_DIR) / safe_filename

    # Save file to disk
    try:
        async with aiofiles.open(str(dest), "wb") as out:
            while chunk := await file.read(1024 * 1024):  # 1 MB chunks
                await out.write(chunk)
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"Failed to save file: {exc}")

    # Calculate file size in MB
    filesize_mb = round(dest.stat().st_size / (1024 * 1024), 3)

    # Estimate duration — for now use 0; real duration detection would require
    # librosa or soundfile which we defer to the processing pipeline.
    duration_s = 0.0

    # Build metadata
    metadata: dict[str, Any] = {}
    if location:
        metadata["location"] = location
    if date:
        metadata["date"] = date
    if notes:
        metadata["notes"] = notes

    store = _get_store()
    store.add(
        recording_id=recording_id,
        filename=safe_filename,
        duration_s=duration_s,
        filesize_mb=filesize_mb,
        metadata=metadata or None,
    )

    return UploadResponse(
        status="pending",
        recording_ids=[recording_id],
        count=1,
        total_duration_s=duration_s,
        message=f"Uploaded {file.filename} ({filesize_mb:.2f} MB)",
    )


# ---------------------------------------------------------------------------
# Routes — Recordings
# ---------------------------------------------------------------------------

@app.get("/api/recordings", response_model=RecordingListResponse)
async def list_recordings(
    limit: int = Query(50, ge=1, le=200),
    offset: int = Query(0, ge=0),
    status: str | None = Query(None, description="Filter by status"),
    location: str | None = Query(None, description="Filter by location (substring match)"),
):
    """List recordings with pagination and optional filters."""
    store = _get_store()
    items, total = store.list(limit=limit, offset=offset, status=status, location=location)
    summaries = [_recording_to_summary(r) for r in items]
    return RecordingListResponse(
        total=total,
        returned=len(summaries),
        recordings=summaries,
    )


@app.get("/api/recordings/{recording_id}", response_model=RecordingSummary)
async def get_recording(recording_id: str):
    """Return full detail for a single recording."""
    store = _get_store()
    rec = store.get(recording_id)
    if rec is None:
        raise HTTPException(status_code=404, detail=f"Recording {recording_id} not found")
    return _recording_to_summary(rec)


# ---------------------------------------------------------------------------
# Routes — Processing
# ---------------------------------------------------------------------------

@app.post("/api/recordings/{recording_id}/process", response_model=dict)
async def process_recording(recording_id: str):
    """Kick off processing for a recording.

    NOTE: This is a placeholder — the actual pipeline integration will be
    wired in Phase 3. For now we simply set the status to "processing".
    """
    store = _get_store()
    rec = store.get(recording_id)
    if rec is None:
        raise HTTPException(status_code=404, detail=f"Recording {recording_id} not found")

    if rec["status"] == "processing":
        raise HTTPException(status_code=409, detail="Recording is already being processed")
    if rec["status"] == "complete":
        raise HTTPException(status_code=409, detail="Recording has already been processed")

    # Phase 3 TODO: launch actual pipeline here (background task).
    store.update_status(recording_id, "processing", progress=0, current_stage="ingestion")

    return {
        "id": recording_id,
        "status": "processing",
        "message": "Processing started",
    }


# ---------------------------------------------------------------------------
# Routes — Spectrogram
# ---------------------------------------------------------------------------

@app.get("/api/recordings/{recording_id}/spectrogram")
async def get_spectrogram(recording_id: str):
    """Serve the spectrogram PNG for a recording."""
    store = _get_store()
    rec = store.get(recording_id)
    if rec is None:
        raise HTTPException(status_code=404, detail=f"Recording {recording_id} not found")

    settings = get_settings()
    # Look for spectrogram by recording ID or filename stem
    spec_dir = Path(settings.SPECTROGRAM_DIR)
    candidates = [
        spec_dir / f"{recording_id}.png",
        spec_dir / f"{Path(rec['filename']).stem}.png",
        spec_dir / f"{recording_id}_spectrogram.png",
    ]

    for candidate in candidates:
        if candidate.is_file():
            return FileResponse(
                str(candidate),
                media_type="image/png",
                filename=f"{recording_id}_spectrogram.png",
            )

    raise HTTPException(
        status_code=404,
        detail=f"Spectrogram not found for recording {recording_id}",
    )


# ---------------------------------------------------------------------------
# Routes — Download cleaned audio
# ---------------------------------------------------------------------------

@app.get("/api/recordings/{recording_id}/download")
async def download_cleaned(recording_id: str):
    """Serve the cleaned (processed) audio file."""
    store = _get_store()
    rec = store.get(recording_id)
    if rec is None:
        raise HTTPException(status_code=404, detail=f"Recording {recording_id} not found")

    if rec["status"] != "complete":
        raise HTTPException(
            status_code=400,
            detail="Recording has not been processed yet",
        )

    settings = get_settings()
    proc_dir = Path(settings.PROCESSED_DIR)

    # Look for processed file by recording ID
    for ext in (".wav", ".mp3", ".flac"):
        candidate = proc_dir / f"{recording_id}{ext}"
        if candidate.is_file():
            media = {
                ".wav": "audio/wav",
                ".mp3": "audio/mpeg",
                ".flac": "audio/flac",
            }[ext]
            return FileResponse(
                str(candidate),
                media_type=media,
                filename=f"{recording_id}_cleaned{ext}",
            )

    # Also check the result dict for a named output file
    result = rec.get("result") or {}
    cleaned_file = result.get("cleaned_file")
    if cleaned_file:
        cleaned_path = proc_dir / cleaned_file
        if cleaned_path.is_file():
            ext = cleaned_path.suffix.lower()
            media = "audio/wav"
            if ext == ".mp3":
                media = "audio/mpeg"
            elif ext == ".flac":
                media = "audio/flac"
            return FileResponse(
                str(cleaned_path),
                media_type=media,
                filename=cleaned_path.name,
            )

    raise HTTPException(
        status_code=404,
        detail=f"Cleaned audio file not found for recording {recording_id}",
    )


# ---------------------------------------------------------------------------
# Routes — Stats
# ---------------------------------------------------------------------------

@app.get("/api/stats", response_model=StatsResponse)
async def get_stats():
    """Return aggregate statistics across all recordings."""
    store = _get_store()
    raw = store.get_stats()
    return StatsResponse(
        total_recordings=raw["total_recordings"],
        total_calls=raw["total_calls"],
        avg_snr_improvement=raw["avg_snr_improvement"],
        success_rate=raw["success_rate"],
        processing_time_avg=raw["processing_time_avg"],
    )


# ---------------------------------------------------------------------------
# Routes — Calls
# ---------------------------------------------------------------------------

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


# ---------------------------------------------------------------------------
# Routes — Export
# ---------------------------------------------------------------------------

@app.post("/api/export/research")
async def export_research(request: ExportRequest):
    """Generate and return a research export file (CSV or JSON)."""
    store = _get_store()

    # Determine which recordings to include
    if request.recording_ids:
        recordings = []
        for rid in request.recording_ids:
            rec = store.get(rid)
            if rec is not None:
                recordings.append(rec)
        if not recordings:
            raise HTTPException(status_code=404, detail="None of the requested recordings were found")
    else:
        # Export all completed recordings
        recordings = [
            r for r in store._recordings.values()
            if r["status"] == "complete"
        ]
        if not recordings:
            # Fall back to exporting all recordings regardless of status
            recordings = list(store._recordings.values())

    if request.format == "json":
        return _export_json(recordings, request)
    else:
        return _export_csv(recordings, request)


def _export_json(
    recordings: list[dict[str, Any]],
    request: ExportRequest,
) -> StreamingResponse:
    """Build a JSON research export."""
    export_data: list[dict[str, Any]] = []
    for rec in recordings:
        entry: dict[str, Any] = {
            "id": rec["id"],
            "filename": rec["filename"],
            "duration_s": rec["duration_s"],
            "filesize_mb": rec["filesize_mb"],
            "uploaded_at": rec["uploaded_at"],
            "status": rec["status"],
            "metadata": rec.get("metadata"),
        }
        result = rec.get("result")
        if result and isinstance(result, dict):
            if request.include_audio:
                entry["quality"] = result.get("quality")
                entry["noise_types"] = result.get("noise_types", [])
            if request.include_spectrograms:
                entry["spectrogram_file"] = result.get("spectrogram_file")
        export_data.append(entry)

    content = json.dumps(export_data, indent=2, default=str)
    return StreamingResponse(
        iter([content]),
        media_type="application/json",
        headers={
            "Content-Disposition": f'attachment; filename="echofield_export_{_timestamp()}.json"'
        },
    )


def _export_csv(
    recordings: list[dict[str, Any]],
    request: ExportRequest,
) -> StreamingResponse:
    """Build a CSV research export."""
    output = io.StringIO()
    fieldnames = [
        "id", "filename", "duration_s", "filesize_mb", "uploaded_at",
        "status", "location", "date",
    ]
    if request.include_audio:
        fieldnames.extend([
            "snr_before_db", "snr_after_db", "snr_improvement_db",
            "quality_score", "noise_types",
        ])
    if request.include_spectrograms:
        fieldnames.append("spectrogram_file")

    writer = csv.DictWriter(output, fieldnames=fieldnames, extrasaction="ignore")
    writer.writeheader()

    for rec in recordings:
        meta = rec.get("metadata") or {}
        row: dict[str, Any] = {
            "id": rec["id"],
            "filename": rec["filename"],
            "duration_s": rec["duration_s"],
            "filesize_mb": rec["filesize_mb"],
            "uploaded_at": rec["uploaded_at"],
            "status": rec["status"],
            "location": meta.get("location", ""),
            "date": meta.get("date", ""),
        }
        result = rec.get("result")
        if result and isinstance(result, dict) and request.include_audio:
            quality = result.get("quality") or {}
            if isinstance(quality, dict):
                row["snr_before_db"] = quality.get("snr_before_db", "")
                row["snr_after_db"] = quality.get("snr_after_db", "")
                row["snr_improvement_db"] = quality.get("snr_improvement_db", "")
                row["quality_score"] = quality.get("quality_score", "")
            noise_types = result.get("noise_types", [])
            if noise_types:
                row["noise_types"] = "; ".join(
                    nt.get("type", str(nt)) if isinstance(nt, dict) else str(nt)
                    for nt in noise_types
                )
        if result and isinstance(result, dict) and request.include_spectrograms:
            row["spectrogram_file"] = result.get("spectrogram_file", "")

        writer.writerow(row)

    csv_content = output.getvalue()
    return StreamingResponse(
        iter([csv_content]),
        media_type="text/csv",
        headers={
            "Content-Disposition": f'attachment; filename="echofield_export_{_timestamp()}.csv"'
        },
    )


def _timestamp() -> str:
    """Return a compact UTC timestamp for filenames."""
    return datetime.now(timezone.utc).strftime("%Y%m%d_%H%M%S")
