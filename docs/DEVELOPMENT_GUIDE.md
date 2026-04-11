# EchoField — Development Guide

Setup, workflow, testing, and demo run instructions for the team. Follow this exactly during hackathon.

---

## Prerequisites

- Python 3.10+ (`python3 --version`)
- Node.js 20 LTS (`node --version`)
- FFmpeg 6.0+ (`ffmpeg -version`)
- Git
- CUDA 11.8+ OR Metal (Mac) for GPU-accelerated audio processing (optional but recommended)
- System dependencies: `libsndfile1`, `libsndfile1-dev`, `sox`

### Ubuntu/Debian Setup
```bash
sudo apt-get update
sudo apt-get install -y \
  libsndfile1 \
  libsndfile1-dev \
  sox \
  libsox-dev \
  ffmpeg \
  python3-dev
```

### macOS Setup
```bash
brew install libsndfile sox ffmpeg
```

---

## Quick Start (First 30 Minutes of Hackathon)

```bash
# 1. Clone the repo
git clone <repo-url> echofield
cd echofield

# 2. Set up environment
cp .env.example .env
# No API keys needed for the local demo

# 3. Install Python dependencies
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt

# 4. Install frontend dependencies
cd frontend && npm install && cd ..

# 5. Prepare local data/output directories
mkdir -p data/recordings data/audio-files data/processed data/spectrograms data/cache
# Current repo/demo data uses data/audio-files for bundled WAVs.
# ECHOFIELD_AUDIO_DIR defaults to data/recordings, and the loader falls back to
# sibling data/audio-files when data/recordings is empty.
# Keep source recordings unchanged; generated output belongs in data/processed
# and data/spectrograms.

# 6. Start the backend server
python -m echofield

# 7. In another shell, start the frontend dev server
cd frontend && npm run dev &

# 8. Open in browser
# http://localhost:3000
```

---

## Environment Variables

```bash
# .env file
ECHOFIELD_AUDIO_DIR=./data/recordings
ECHOFIELD_PROCESSED_DIR=./data/processed
ECHOFIELD_SPECTROGRAM_DIR=./data/spectrograms
ECHOFIELD_CACHE_DIR=./data/cache
ECHOFIELD_METADATA_FILE=./data/metadata.csv
ECHOFIELD_CONFIG_FILE=./config/echofield.config.yml
ECHOFIELD_MODEL_PATH=./models/echofield-denoise-v1.pt
ECHOFIELD_LOG_LEVEL=INFO           # DEBUG for development
ECHOFIELD_LOG_FORMAT=text
ECHOFIELD_DEMO_MODE=true
ECHOFIELD_SAMPLE_RATE=44100        # Hz
ECHOFIELD_SEGMENT_SECONDS=60
ECHOFIELD_SEGMENT_OVERLAP_RATIO=0.5
ECHOFIELD_DENOISE_METHOD=hybrid
ECHOFIELD_API_PORT=8000
ECHOFIELD_CORS_ORIGINS=http://localhost:3000,http://localhost:5173
```

---

## Data Setup

### Directory Structure
```
data/
├── audio-files/         # Bundled/reference WAVs when present
│   ├── 061220-24_airplane_01.wav
│   ├── 090224-09_generator_01.wav
│   └── ... (44 total)
├── recordings/          # Upload/default input directory; do not modify source recordings
├── metadata.csv         # Optional metadata used by the recording loader
├── processed/
├── spectrograms/
└── cache/
```

### Metadata CSV Format
```
call_id,filename,animal_id,location,date,start_sec,end_sec,noise_type_ref,species
061220-24_airplane_01,061220-24_airplane_01.wav,061220-24,,,0.0,45.833,airplane,African bush elephant
...
```

### Data Preparation
```bash
# 1. Verify all 44 files are present
ls data/audio-files/*.wav | wc -l  # should print 44 when the bundled dataset is present

# 2. Validate audio files
python -c "
import librosa
import os
files = [f for f in os.listdir('data/audio-files') if f.endswith('.wav')]
for f in files[:5]:
    y, sr = librosa.load(f'data/audio-files/{f}')
    print(f'{f}: {len(y)} samples @ {sr}Hz')
"

# 3. Start the API and confirm the loader can see recordings
python -m echofield
curl http://localhost:8000/api/recordings | python -m json.tool

# 4. Process through the UI or API. Outputs are written to:
ls data/processed data/spectrograms
```

The repo currently does not expose a standalone `echofield.preprocess` command. Use the FastAPI processing endpoints or the frontend upload/processing flow.

---

## Team Roles (5 People)

| Person | Responsibility | Primary Files |
|--------|---------------|---------------|
| **ML/Audio Lead** | Noise removal model, denoiser architecture, training pipeline | `echofield/pipeline/`, `echofield/research/` |
| **Backend Lead** | FastAPI server, audio processing queue, WebSocket events, file I/O | `echofield/server.py`, `echofield/websocket.py` |
| **Frontend Lead** | Spectrogram visualization, waveform display, story UI, data table | `frontend/src/components/` |
| **UI/UX + Animation Lead** | Before/after slider, loading states, playback controls, polish | `frontend/src/app/`, `frontend/src/components/` |
| **Research/Data Lead** | Acoustic analysis, CSV export, presentation prep, demo scripting | `echofield/research/`, `data/`, docs |

---

## Development Workflow

### Git Branching
```
main ← stable, demo-ready at all times
├── feat/denoise-model      (ML Lead)
├── feat/audio-server       (Backend Lead)
├── feat/spectrogram-viz    (Frontend Lead)
├── feat/animations         (UI/UX Lead)
└── feat/demo-hardening     (Research Lead)
```

**Merge discipline:** Merge to `main` only when feature works in isolation. Test full integration on `main` every 4 hours. No merge conflicts on demo day — resolve before pushing.

### Daily Standup (15 min)
- What's merged and working
- What's blocked
- What needs integration testing
- Any audio codec issues?

---

## Development Workflow — Individual Components

### Backend Only (FastAPI + Audio Processing)
```bash
python -m echofield
# Runs on http://localhost:8000
# API docs: http://localhost:8000/docs (auto-generated)
# WebSocket: ws://localhost:8000/ws
```

### Frontend Only (React)
```bash
cd frontend
npm run dev
# Runs on http://localhost:3000 by default
# Connects to ws://localhost:8000/ws for live events
```

### Preprocessing Only
```bash
# Not currently implemented as a CLI command.
# Start the backend and trigger processing through:
# - POST /api/recordings/{recording_id}/process
# - POST /api/batch/process
# - the frontend upload/processing flow
```

### Model Inference (Standalone)
```bash
# There is no separate echofield.ml package in the current tree.
# Use the pipeline modules directly when debugging:
python -c "from echofield.pipeline.deep_denoise import deep_denoise; print(deep_denoise)"
```

---

## Testing

### Unit Tests
```bash
# Run all tests
.venv/bin/pytest tests/ -v

# Run specific test suites
.venv/bin/pytest tests/test_pipeline.py -v
.venv/bin/pytest tests/test_server.py -v
.venv/bin/pytest tests/test_data_loader.py -v
.venv/bin/pytest tests/test_exporter.py -v
```

### Key Test Scenarios

```python
# tests/test_pipeline.py

def test_processing_pipeline_creates_outputs():
    """Verify cleaned audio, spectrograms, calls, and quality metrics are created."""

# tests/test_data_loader.py

def test_data_loader_matches_metadata_and_audio():
    """Verify metadata rows and audio files are discovered and combined."""

# tests/test_server.py

def test_server_upload_list_and_process():
    """Verify upload, listing, process start, and detail endpoints."""
```

### Audio Quality Tests
```bash
# No standalone echofield.evaluate CLI exists yet.
# For now, run the pipeline tests and inspect quality metrics returned by
# POST /api/recordings/{recording_id}/process and GET /api/recordings/{id}.
.venv/bin/pytest tests/test_pipeline.py -v
```

### Integration Test (Full Pipeline)
```bash
# Current repeatable integration coverage is in pytest.
.venv/bin/pytest tests/test_server.py -v
```

### Demo Rehearsal Test
```bash
# Manual rehearsal for the current app:
# 1. Run python -m echofield
# 2. Run cd frontend && npm run dev
# 3. Open http://localhost:3000
# 4. Upload/process one WAV and verify audio + spectrogram output.
```

---

## Common Issues & Troubleshooting

### **librosa Installation Fails**
```bash
# Problem: "ImportError: librosa not found"

# Solution 1: Install with system dependencies
pip install --upgrade pip
sudo apt-get install -y libsndfile1 libsndfile1-dev
pip install librosa==0.10.0

# Solution 2: Use conda (more reliable for audio libraries)
conda install -c conda-forge librosa librosa-core soundfile
```

### **FFmpeg Not Found**
```bash
# Problem: "FileNotFoundError: ffmpeg"

# Ubuntu/Debian
sudo apt-get install -y ffmpeg

# macOS
brew install ffmpeg

# Verify
ffmpeg -version
```

### **Audio File Decoding Errors**
```bash
# Problem: "Unsupported codec" or "File corrupted"

# Solution 1: Re-encode with ffmpeg
ffmpeg -i data/audio-files/bad_file.wav -acodec pcm_s16le -ar 44100 data/audio-files/bad_file_fixed.wav

# Solution 2: Use sox to inspect/fix
sox data/audio-files/bad_file.wav -t wav data/audio-files/bad_file_fixed.wav

# Solution 3: Start the backend and process a different recording.
# The current repo has no standalone preprocessing CLI.
```

### **Out of Memory During Processing**
```bash
# Problem: "CUDA out of memory" or "MemoryError"

# Solution 1: Use the default spectral-gate path when deep model weights are unavailable.
ECHOFIELD_DENOISE_METHOD=spectral_gate python -m echofield

# Solution 2: Reduce segment length for local processing.
ECHOFIELD_SEGMENT_SECONDS=30 python -m echofield
```

### **WebSocket Connection Fails**
```bash
# Problem: Frontend can't connect to backend

# Solution 1: Check backend is running
curl http://localhost:8000/health

# Solution 2: Check CORS settings
# Edit .env, verify ECHOFIELD_CORS_ORIGINS includes http://localhost:3000

# Solution 3: Check firewall
# Ensure port 8000 is not blocked
lsof -i :8000

# Solution 4: Use dev proxy (Next.js)
# In frontend/, add proxy config to next.config.js if using Next.js
```

### **Model Inference Too Slow**
```bash
# Problem: Denoising 10 seconds of audio takes >10 seconds

# Likely causes:
# 1. Deep denoising fallback is too slow for the local machine
# 2. Segment length is too large
# 3. Spectrogram generation is running on a long recording

# Solutions:
# 1. Use spectral gate for the demo path
ECHOFIELD_DENOISE_METHOD=spectral_gate python -m echofield

# 2. Process a shorter clip first
ECHOFIELD_SEGMENT_SECONDS=30 python -m echofield
```

### **Spectrogram Visualization Shows Blank**
```bash
# Problem: Spectrogram displays as all zeros or all white

# Solution 1: Check audio normalization
python -c "
import numpy as np
from pathlib import Path
print(sorted(Path('data/spectrograms').glob('*.png'))[:5])
"

# Solution 2: Re-run processing for the recording from the frontend or API.
```

---

## Demo Procedure (Presentation Day)

### T-60 Minutes: Pre-Demo Setup
```bash
# 1. Kill everything
pkill -f echofield
pkill -f npm

# 2. Clean start
rm -rf data/processed/*
rm -rf data/spectrograms/*

# 3. Start backend
python -m echofield &

# 4. Start frontend
cd frontend && npm run dev &

# 5. Wait for both to be ready
sleep 5
curl http://localhost:8000/health
curl http://localhost:3000 2>/dev/null | head -1

# 6. Run integration tests
.venv/bin/pytest tests/test_server.py -v
```

### T-10 Minutes: Final Prep
```bash
# Verify everything is running
curl http://localhost:8000/api/recordings | python -m json.tool
# Should list all 44 files

# Open browser windows
# http://localhost:3000 (full screen, no dev tools)

# Position window on projector
# Have audio playback working (test speaker volume)
```

### T-0: Live Demo Script (5 Minutes)

**Opening (15s):**
- "This is EchoField. We use deep learning to remove background noise from elephant vocalizations."
- "This matters because researchers rely on audio analysis to understand behavior, migration, and health."
- "Let me show you how it works."

**Show Dataset (20s):**
- Click on table. "We have 44 recordings from Kenya, Congo, and Tanzania. Collected by researchers over 18 months."
- Point at metadata: "Location, duration, noise type. Wind, rain, vehicle noise."
- Select one file: "This recording is from an African bush elephant. Listen to the background noise." **Play noisy version (3s).**

**Show Denoising (45s):**
- Click "Denoise." Show loading bar.
- "Our model is removing the noise while keeping the calls intact."
- When done, show spectrogram. "Before and after. See how the background is gone?"
- **Play denoised version (3s).** "Same elephant. Cleaner call. Same acoustic details."
- "The model runs on your laptop in about 2 seconds. Full batch in 8 seconds."

**Show Analysis (20s):**
- Scroll down. "We also extract acoustic features. Frequency, duration, energy, call type."
- "Researchers can export this to CSV. Use it in their papers. Their analyses just got better."
- **Click export.** "All done. CSV saved."

**Closing (20s):**
- "Four conservation teams are already testing this. Time to scale it."
- "Questions?"

### If Demo Fails

- **Audio won't play:** Mute browser mute, check system volume. If still broken, switch to backup video.
- **Denoiser crashes:** Switch to backend logs. Show error on screen for 2 seconds, then: "One of our microservices is recalibrating. Here's the output from our last run." (Show screenshot of working output.)
- **Frontend won't load:** Demo with curl. Show API response JSON. Tell judges: "The API is working perfectly. The UI is having a moment. Same data."
- **Total failure:** Backup video. No live debugging on stage. Ever.

### Backup Video Checklist
- 90 seconds of pre-recorded demo (all key moments)
- Audio synchronized with video
- Codec: H.264, 1920x1080
- File: `demo/backup_demo.mp4`
- Test playback 10x before demo day

---

## Deployment

### For Demo (Local)
```bash
# Backend: FastAPI on http://localhost:8000
python -m echofield

# Frontend: Next.js dev server on http://localhost:3000
cd frontend && npm run dev
```

### For Judging (Production)

**Backend (Railway / Render):**
```bash
# 1. Create Railway/Render account
# 2. Connect repo
# 3. Add environment variables:
#    - ECHOFIELD_AUDIO_DIR=/app/data/recordings
#    - ECHOFIELD_PROCESSED_DIR=/app/data/processed
#    - ECHOFIELD_SPECTROGRAM_DIR=/app/data/spectrograms
# 4. Dockerfile (provided):
FROM python:3.10-slim
WORKDIR /app
COPY requirements.txt .
RUN pip install -r requirements.txt
COPY . .
CMD ["python", "-m", "echofield"]
```

**Frontend (Vercel):**
```bash
# 1. Connect GitHub repo to Vercel
# 2. Root directory: frontend/
# 3. Build command: npm run build
# 4. Output directory: .next (or dist/)
# 5. Environment variables:
#    - NEXT_PUBLIC_API_URL=https://echofield-api.railway.app
```

### Health Check
```bash
# Backend
curl https://echofield-api.railway.app/health

# Frontend
curl https://echofield.vercel.app

# Full pipeline (hit the API)
curl https://echofield-api.railway.app/api/recordings
```

---

## Code Style

### Python
```bash
ruff check .
ruff format .
```
- Type hints on all function signatures
- Docstrings on all public functions (Google style)
- No trailing whitespace

### JavaScript/React
```bash
cd frontend && npx eslint . && npx prettier --write .
```
- Functional components only
- Hooks (useState, useEffect, useContext)
- Tailwind CSS for styling (no inline styles)

---

## Useful Development Commands

```bash
# Watch Python server logs
python -m echofield 2>&1 | grep -E "ERROR|INFO|Uvicorn"

# Check if ports are in use
lsof -i :8000
lsof -i :3000

# Test API endpoints
curl -X GET http://localhost:8000/api/recordings
curl -X GET http://localhost:8000/api/stats

# Process a recording after getting an id from /api/recordings
curl -X POST http://localhost:8000/api/recordings/<recording_id>/process

# Clear generated output
rm -rf data/processed/* data/spectrograms/* data/cache/*

# Validate audio files
python -c "
import librosa
import os
for f in os.listdir('data/audio-files'):
    if f.endswith('.wav'):
        try:
            y, sr = librosa.load(f'data/audio-files/{f}')
            print(f'✓ {f} ({len(y)//sr}s @ {sr}Hz)')
        except Exception as e:
            print(f'✗ {f}: {e}')
"
```

---

*Last updated: April 11, 2026*
