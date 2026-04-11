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
    file_hash TEXT,
    processing_json TEXT NOT NULL DEFAULT '{}',
    result_json TEXT
);
CREATE INDEX IF NOT EXISTS idx_recordings_status ON recordings(status);
CREATE INDEX IF NOT EXISTS idx_recordings_uploaded_at ON recordings(uploaded_at);
CREATE INDEX IF NOT EXISTS idx_recordings_file_hash ON recordings(file_hash);

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
    individual_id TEXT,
    annotations_json TEXT NOT NULL DEFAULT '[]',
    acoustic_features_json TEXT NOT NULL DEFAULT '{}',
    metadata_json TEXT NOT NULL DEFAULT '{}'
);
CREATE INDEX IF NOT EXISTS idx_calls_recording_id ON calls(recording_id);
CREATE INDEX IF NOT EXISTS idx_calls_call_type ON calls(call_type);
CREATE INDEX IF NOT EXISTS idx_calls_location ON calls(location);
CREATE INDEX IF NOT EXISTS idx_calls_date ON calls(date);
CREATE INDEX IF NOT EXISTS idx_calls_confidence ON calls(confidence);
CREATE INDEX IF NOT EXISTS idx_calls_individual_id ON calls(individual_id);

CREATE TABLE IF NOT EXISTS annotations (
    id TEXT PRIMARY KEY,
    call_id TEXT NOT NULL,
    note TEXT NOT NULL,
    tags_json TEXT NOT NULL DEFAULT '[]',
    researcher_id TEXT,
    created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_annotations_call_id ON annotations(call_id);
"""

MIGRATIONS = [
    "ALTER TABLE recordings ADD COLUMN file_hash TEXT",
    "ALTER TABLE calls ADD COLUMN individual_id TEXT",
    "ALTER TABLE calls ADD COLUMN annotations_json TEXT NOT NULL DEFAULT '[]'",
]


def apply_sqlite_migrations(db: sqlite3.Connection) -> None:
    for statement in MIGRATIONS:
        try:
            db.execute(statement)
        except sqlite3.OperationalError as exc:
            if "duplicate column name" not in str(exc).lower():
                raise


async def init_db(db_path: str | Path) -> None:
    path = Path(db_path)
    path.parent.mkdir(parents=True, exist_ok=True)
    if aiosqlite is None:
        with sqlite3.connect(path) as db:
            db.executescript(SCHEMA)
            apply_sqlite_migrations(db)
            db.commit()
        return
    async with aiosqlite.connect(path) as db:
        await db.executescript(SCHEMA)
        for statement in MIGRATIONS:
            try:
                await db.execute(statement)
            except Exception as exc:
                if "duplicate column name" not in str(exc).lower():
                    raise
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
                        metadata_json, source_path, file_hash, processing_json, result_json
                    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
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
                        record.get("file_hash") or (record.get("metadata") or {}).get("file_hash"),
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
                    metadata_json, source_path, file_hash, processing_json, result_json
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
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
                    record.get("file_hash") or (record.get("metadata") or {}).get("file_hash"),
                    json.dumps(record.get("processing") or {}),
                    json.dumps(record.get("result")) if record.get("result") is not None else None,
                ),
            )
            migrated += 1
        await db.commit()
    return migrated
