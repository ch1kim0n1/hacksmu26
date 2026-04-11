"""SQLite schema helpers for EchoField catalog migration."""

from __future__ import annotations

import json
import sqlite3
from pathlib import Path
from typing import Any

try:
    import aiosqlite
except ImportError:  # pragma: no cover - exercised only before deps are installed.
    aiosqlite = None

SCHEMA = """
CREATE TABLE IF NOT EXISTS recordings (
    id TEXT PRIMARY KEY,
    filename TEXT NOT NULL,
    duration_s REAL NOT NULL DEFAULT 0,
    filesize_mb REAL NOT NULL DEFAULT 0,
    uploaded_at TEXT NOT NULL,
    status TEXT NOT NULL,
    metadata_json TEXT NOT NULL DEFAULT '{}',
    source_path TEXT,
    processing_json TEXT NOT NULL DEFAULT '{}',
    result_json TEXT
);
CREATE INDEX IF NOT EXISTS idx_recordings_status ON recordings(status);
CREATE INDEX IF NOT EXISTS idx_recordings_uploaded_at ON recordings(uploaded_at);

CREATE TABLE IF NOT EXISTS calls (
    id TEXT PRIMARY KEY,
    recording_id TEXT NOT NULL,
    call_type TEXT NOT NULL,
    confidence REAL NOT NULL DEFAULT 0,
    location TEXT,
    date TEXT,
    animal_id TEXT,
    start_ms REAL NOT NULL DEFAULT 0,
    duration_ms REAL NOT NULL DEFAULT 0,
    frequency_min_hz REAL NOT NULL DEFAULT 0,
    frequency_max_hz REAL NOT NULL DEFAULT 0,
    review_label TEXT,
    reviewed_by TEXT,
    reviewed_at TEXT,
    acoustic_features_json TEXT NOT NULL DEFAULT '{}',
    metadata_json TEXT NOT NULL DEFAULT '{}'
);
CREATE INDEX IF NOT EXISTS idx_calls_recording_id ON calls(recording_id);
CREATE INDEX IF NOT EXISTS idx_calls_call_type ON calls(call_type);
CREATE INDEX IF NOT EXISTS idx_calls_location ON calls(location);
CREATE INDEX IF NOT EXISTS idx_calls_date ON calls(date);
CREATE INDEX IF NOT EXISTS idx_calls_confidence ON calls(confidence);
"""


async def init_db(db_path: str | Path) -> None:
    path = Path(db_path)
    path.parent.mkdir(parents=True, exist_ok=True)
    if aiosqlite is None:
        with sqlite3.connect(path) as db:
            db.executescript(SCHEMA)
            db.commit()
        return
    async with aiosqlite.connect(path) as db:
        await db.executescript(SCHEMA)
        await db.commit()


async def migrate_recording_catalog(catalog_path: str | Path, db_path: str | Path) -> int:
    catalog = Path(catalog_path)
    if not catalog.exists():
        return 0
    payload = json.loads(catalog.read_text(encoding="utf-8"))
    records = payload.get("recordings", []) if isinstance(payload, dict) else []
    await init_db(db_path)
    migrated = 0
    if aiosqlite is None:
        with sqlite3.connect(db_path) as db:
            for record in records:
                if not isinstance(record, dict) or not record.get("id"):
                    continue
                db.execute(
                    """
                    INSERT OR REPLACE INTO recordings (
                        id, filename, duration_s, filesize_mb, uploaded_at, status,
                        metadata_json, source_path, processing_json, result_json
                    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                    """,
                    (
                        record["id"],
                        record.get("filename") or "",
                        float(record.get("duration_s") or 0.0),
                        float(record.get("filesize_mb") or 0.0),
                        record.get("uploaded_at") or "",
                        record.get("status") or "pending",
                        json.dumps(record.get("metadata") or {}),
                        record.get("source_path"),
                        json.dumps(record.get("processing") or {}),
                        json.dumps(record.get("result")) if record.get("result") is not None else None,
                    ),
                )
                migrated += 1
            db.commit()
        return migrated
    async with aiosqlite.connect(db_path) as db:
        for record in records:
            if not isinstance(record, dict) or not record.get("id"):
                continue
            await db.execute(
                """
                INSERT OR REPLACE INTO recordings (
                    id, filename, duration_s, filesize_mb, uploaded_at, status,
                    metadata_json, source_path, processing_json, result_json
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                """,
                (
                    record["id"],
                    record.get("filename") or "",
                    float(record.get("duration_s") or 0.0),
                    float(record.get("filesize_mb") or 0.0),
                    record.get("uploaded_at") or "",
                    record.get("status") or "pending",
                    json.dumps(record.get("metadata") or {}),
                    record.get("source_path"),
                    json.dumps(record.get("processing") or {}),
                    json.dumps(record.get("result")) if record.get("result") is not None else None,
                ),
            )
            migrated += 1
        await db.commit()
    return migrated
