# EchoField Data Layout

This folder now uses a single canonical structure so source audio, generated outputs, and legacy artifacts do not get mixed.

## Canonical Paths

- Source recordings: data/recordings/original
- Processed audio outputs: data/processed
- Spectrogram outputs: data/spectrograms
- Curated demo folders: data/recordings/demo
- Metadata and catalog: data/metadata and data/cache/recording_catalog.json

## Important Rules

- Only store raw source recordings in data/recordings/original.
- Do not place processed files under data/recordings/original.
- Treat data/processed and data/spectrograms as disposable generated artifacts.
- Treat data/archived as historical snapshots of old outputs.

## Why This Matters

If processed files sit inside the source tree, the loader can accidentally re-ingest them and you end up with confusing or poor demo results. The pipeline now excludes demo/processed/archive folders during discovery and defaults to source-only input.

## Quick Demo Checklist

1. Confirm source files: ls data/recordings/original | head
2. Process with isolate mode: POST /api/recordings/{id}/process?method=isolate
3. Listen to output in data/processed
4. Compare visuals in data/spectrograms
5. Use curated demo packs in data/recordings/demo

## Cleanup Legacy Outputs

Run this once to archive old scattered outputs and regenerate clean demo assets:

python scripts/refresh_demo_data.py --archive-legacy --rebuild-demo --method isolate

This will move old output files to data/archived and rebuild demo folders with fresh isolated audio.
