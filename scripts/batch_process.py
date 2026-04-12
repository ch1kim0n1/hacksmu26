#!/usr/bin/env python
"""
Batch process all 44 elephant recordings: denoise + extract individual call clips.

Requires the backend running at localhost:8000.

Usage:
    python scripts/batch_process.py

Output:
    data/output/cleaned/   — Full cleaned recordings (noise removed)
    data/output/clips/     — Individual elephant call WAV clips
"""

import sys
import json
import time
import shutil
from pathlib import Path
from concurrent.futures import ThreadPoolExecutor, as_completed

sys.path.insert(0, str(Path(__file__).parent.parent))

import requests
import numpy as np

API = "http://localhost:8000"
OUTPUT_DIR = Path("data/output")
CLEANED_DIR = OUTPUT_DIR / "cleaned"
CLIPS_DIR = OUTPUT_DIR / "clips"
MAX_PARALLEL = 4
POLL_INTERVAL = 3
CLIP_PAD_MS = 50  # padding on each side of call clips


def get_all_recordings():
    resp = requests.get(f"{API}/api/recordings", params={"limit": 100})
    resp.raise_for_status()
    return resp.json()["recordings"]


def process_recording(rec):
    """Process a single recording via API. Returns recording dict when complete."""
    rec_id = rec["id"]
    filename = rec["filename"]

    if rec["status"] == "complete":
        print(f"  [skip] {filename} — already complete")
        return rec_id, filename, "skipped"

    # Start processing
    try:
        resp = requests.post(
            f"{API}/api/recordings/{rec_id}/process",
            json={"method": "hybrid"},
        )
        resp.raise_for_status()
    except requests.exceptions.HTTPError as e:
        if "already" in str(e.response.text).lower() or resp.status_code == 409:
            pass  # already processing
        else:
            print(f"  [error] {filename} — {e}")
            return rec_id, filename, "error"

    # Poll until complete
    for _ in range(200):  # max ~10 minutes
        time.sleep(POLL_INTERVAL)
        resp = requests.get(f"{API}/api/recordings/{rec_id}")
        resp.raise_for_status()
        data = resp.json()
        status = data["status"]
        if status == "complete":
            print(f"  [done] {filename}")
            return rec_id, filename, "complete"
        if status == "failed":
            print(f"  [failed] {filename}")
            return rec_id, filename, "failed"

    print(f"  [timeout] {filename}")
    return rec_id, filename, "timeout"


def download_cleaned_audio(rec_id, filename):
    """Download the cleaned audio WAV file."""
    stem = Path(filename).stem
    out_path = CLEANED_DIR / f"{stem}_cleaned.wav"
    if out_path.exists():
        return out_path

    resp = requests.get(f"{API}/api/recordings/{rec_id}/audio", params={"type": "cleaned"}, stream=True)
    resp.raise_for_status()
    with open(out_path, "wb") as f:
        shutil.copyfileobj(resp.raw, f)
    return out_path


def extract_call_clips(rec_id, filename, cleaned_path):
    """Extract individual call clips from cleaned audio using call markers."""
    from echofield.utils.audio_utils import load_audio, save_audio

    # Get call data from API
    resp = requests.get(f"{API}/api/recordings/{rec_id}")
    resp.raise_for_status()
    data = resp.json()
    calls = data.get("result", {}).get("calls", [])

    if not calls:
        return 0

    # Load cleaned audio
    y, sr = load_audio(str(cleaned_path), mono=True)
    stem = Path(filename).stem
    count = 0

    for i, call in enumerate(calls, 1):
        start_ms = call.get("start_ms", 0)
        duration_ms = call.get("duration_ms", 0)
        call_type = call.get("call_type", "unknown")
        confidence = call.get("confidence", 0)

        # Skip low-confidence detections
        if confidence < 0.3:
            continue

        # Calculate sample indices with padding
        start_sample = max(0, int((start_ms - CLIP_PAD_MS) / 1000.0 * sr))
        end_sample = min(len(y), int((start_ms + duration_ms + CLIP_PAD_MS) / 1000.0 * sr))

        if end_sample <= start_sample:
            continue

        clip = y[start_sample:end_sample]

        # Save clip
        clip_name = f"{stem}_call-{i:03d}_{call_type}.wav"
        clip_path = CLIPS_DIR / clip_name
        save_audio(clip, sr, str(clip_path))
        count += 1

    return count


def main():
    print("=" * 60)
    print("  EchoField Batch Processor")
    print("  Denoise + Extract Elephant Call Clips")
    print("=" * 60)

    # Check backend
    try:
        resp = requests.get(f"{API}/health")
        resp.raise_for_status()
    except Exception:
        print("\nError: Backend not running at localhost:8000")
        print("Start it with: python -m echofield")
        return 1

    # Create output dirs
    CLEANED_DIR.mkdir(parents=True, exist_ok=True)
    CLIPS_DIR.mkdir(parents=True, exist_ok=True)

    # Get all recordings
    recordings = get_all_recordings()
    total = len(recordings)
    pending = [r for r in recordings if r["status"] != "complete"]
    complete = [r for r in recordings if r["status"] == "complete"]

    print(f"\nRecordings: {total} total, {len(complete)} already complete, {len(pending)} to process")

    # Phase 1: Process all pending recordings
    if pending:
        print(f"\n--- Phase 1: Processing {len(pending)} recordings ({MAX_PARALLEL} parallel) ---\n")
        results = {"complete": 0, "failed": 0, "error": 0, "timeout": 0, "skipped": 0}

        with ThreadPoolExecutor(max_workers=MAX_PARALLEL) as pool:
            futures = {pool.submit(process_recording, r): r for r in pending}
            for future in as_completed(futures):
                rec_id, filename, status = future.result()
                results[status] = results.get(status, 0) + 1

        print(f"\nProcessing results: {results}")

    # Refresh recordings list
    recordings = get_all_recordings()
    complete_recs = [r for r in recordings if r["status"] == "complete"]

    # Phase 2: Download cleaned audio + extract clips
    print(f"\n--- Phase 2: Extracting cleaned audio + call clips ({len(complete_recs)} recordings) ---\n")

    total_clips = 0
    for i, rec in enumerate(complete_recs, 1):
        rec_id = rec["id"]
        filename = rec["filename"]
        print(f"  [{i}/{len(complete_recs)}] {filename}")

        try:
            cleaned_path = download_cleaned_audio(rec_id, filename)
            n_clips = extract_call_clips(rec_id, filename, cleaned_path)
            total_clips += n_clips
            print(f"           → {n_clips} call clips extracted")
        except Exception as e:
            print(f"           → Error: {e}")

    # Summary
    cleaned_files = list(CLEANED_DIR.glob("*.wav"))
    clip_files = list(CLIPS_DIR.glob("*.wav"))

    print("\n" + "=" * 60)
    print("  COMPLETE")
    print("=" * 60)
    print(f"  Cleaned recordings:  {len(cleaned_files)} files in data/output/cleaned/")
    print(f"  Call clips:          {len(clip_files)} files in data/output/clips/")
    print(f"  Total clips:         {total_clips}")

    if clip_files:
        print(f"\n  Sample clips:")
        for f in sorted(clip_files)[:5]:
            size_kb = f.stat().st_size / 1024
            print(f"    {f.name}  ({size_kb:.0f} KB)")

    return 0


if __name__ == "__main__":
    sys.exit(main())
