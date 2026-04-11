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
# No API keys needed for local demo

# 3. Install Python dependencies
pip install -r requirements.txt --break-system-packages

# 4. Install frontend dependencies
cd frontend && npm install && cd ..

# 5. Download and prepare audio dataset
# (Team already has 44 files downloaded locally)
mkdir -p data/raw data/processed
# Copy the 44 .wav files from shared drive to data/raw/
# Copy metadata.csv to data/raw/

# 6. Preprocess audio files (creates spectrograms)
python -m echofield.preprocess \
  --input-dir data/raw \
  --output-dir data/processed \
  --n-workers 4

# 7. Start the backend server
python -m echofield.server &

# 8. Start the frontend dev server
cd frontend && npm run dev &

# 9. Open in browser
# http://localhost:5173
```

---

## Environment Variables

```bash
# .env file
ECHOFIELD_AUDIO_DIR=./data/raw
ECHOFIELD_PROCESSED_DIR=./data/processed
ECHOFIELD_MODEL_PATH=./models/denoise-v1.pt
ECHOFIELD_LOG_LEVEL=INFO           # DEBUG for development
ECHOFIELD_DEVICE=cuda              # or 'cpu' if no GPU
ECHOFIELD_BATCH_SIZE=8             # audio chunks per batch
ECHOFIELD_SAMPLE_RATE=16000        # Hz
ECHOFIELD_CHUNK_DURATION=10        # seconds per processing chunk
ECHOFIELD_API_PORT=8000
ECHOFIELD_CORS_ORIGINS=http://localhost:5173,http://localhost:3000
```

---

## Data Setup

### Directory Structure
```
data/
├── raw/
│   ├── elephant_call_001.wav
│   ├── elephant_call_002.wav
│   ├── ... (44 total)
│   └── metadata.csv
├── processed/
│   ├── elephant_call_001_spectrogram.npy
│   ├── elephant_call_001_clean.wav
│   └── ... (processed outputs)
└── demo/
    └── before_after_sample.wav
```

### Metadata CSV Format
```
filename,species,location,duration_seconds,noise_type,snr_db,researcher
elephant_call_001.wav,African bush elephant,Kenya Amboseli,8.5,wind_rain,2.1,John Smith
elephant_call_002.wav,African forest elephant,Congo,12.3,vehicle,3.5,Jane Doe
...
```

### Data Preparation
```bash
# 1. Verify all 44 files are present
ls data/raw/*.wav | wc -l  # should print 44

# 2. Validate audio files
python -c "
import librosa
import os
files = [f for f in os.listdir('data/raw') if f.endswith('.wav')]
for f in files[:5]:
    y, sr = librosa.load(f'data/raw/{f}')
    print(f'{f}: {len(y)} samples @ {sr}Hz')
"

# 3. Preprocess (creates spectrograms + aligned metadata)
python -m echofield.preprocess \
  --input-dir data/raw \
  --output-dir data/processed \
  --n-workers 4 \
  --force-reprocess  # re-run preprocessing

# 4. Verify preprocessed outputs
ls data/processed/*.npy | wc -l  # should be ~88 (spectrogram + clean audio per file)
```

---

## Team Roles (5 People)

| Person | Responsibility | Primary Files |
|--------|---------------|---------------|
| **ML/Audio Lead** | Noise removal model, denoiser architecture, training pipeline | `echofield/ml/`, `echofield/models/` |
| **Backend Lead** | FastAPI server, audio processing queue, WebSocket events, file I/O | `echofield/server.py`, `echofield/api/` |
| **Frontend Lead** | Spectrogram visualization, waveform display, story UI, data table | `frontend/src/components/` |
| **UI/UX + Animation Lead** | Before/after slider, loading states, playback controls, polish | `frontend/src/animations/`, `frontend/src/styles/` |
| **Research/Data Lead** | Acoustic analysis, CSV export, presentation prep, demo scripting | `data/`, `notebooks/`, docs |

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
python -m echofield.server
# Runs on http://localhost:8000
# API docs: http://localhost:8000/docs (auto-generated)
# WebSocket: ws://localhost:8000/ws
```

### Frontend Only (React)
```bash
cd frontend
npm run dev
# Runs on http://localhost:5173
# Connects to ws://localhost:8000/ws for live events
```

### Preprocessing Only
```bash
python -m echofield.preprocess \
  --input-dir data/raw \
  --output-dir data/processed \
  --verbose
```

### Model Inference (Standalone)
```bash
python -c "
from echofield.ml.denoiser import Denoiser
import librosa

denoiser = Denoiser(model_path='models/denoise-v1.pt', device='cuda')
y, sr = librosa.load('data/raw/elephant_call_001.wav')
y_clean = denoiser.denoise(y, sr)
print(f'SNR improvement: {compute_snr(y, y_clean):.2f} dB')
"
```

---

## Testing

### Unit Tests
```bash
# Run all tests
pytest tests/ -v

# Run specific test suites
pytest tests/test_denoiser.py -v
pytest tests/test_preprocessor.py -v
pytest tests/test_api.py -v
pytest tests/test_audio_utils.py -v
```

### Key Test Scenarios

```python
# tests/test_denoiser.py

def test_denoise_reduces_noise():
    """Verify noise power decreases after denoising."""
    
def test_denoise_preserves_signal():
    """Verify elephant call features are preserved."""
    
def test_denoise_handles_different_sample_rates():
    """Verify model works with 16kHz and 44.1kHz."""
    
def test_denoise_gpu_vs_cpu_consistent():
    """Verify GPU and CPU outputs match (within tolerance)."""
    
def test_batch_processing_identical_to_sequential():
    """Verify batch inference produces same output as sequential."""

# tests/test_preprocessor.py

def test_spectrogram_shape():
    """Verify output spectrogram dimensions are correct."""
    
def test_metadata_alignment():
    """Verify CSV metadata aligns with processed files."""
    
def test_audio_normalization():
    """Verify audio levels are normalized to [-1, 1]."""
```

### Audio Quality Tests
```bash
# Compute SNR (Signal-to-Noise Ratio) on all processed files
python -m echofield.evaluate \
  --input-dir data/raw \
  --output-dir data/processed \
  --metric snr

# Generate quality report (CSV)
python -m echofield.evaluate \
  --input-dir data/raw \
  --output-dir data/processed \
  --metric snr \
  --export-csv reports/quality_metrics.csv
```

### Integration Test (Full Pipeline)
```bash
# Runs a complete processing cycle: upload → preprocess → denoise → export
python -m echofield.integration_test

# Expected output:
# 1. Load 44 audio files
# 2. Preprocess to spectrograms
# 3. Denoise all files
# 4. Generate before/after visualizations
# 5. Compute metrics
# 6. Print: PASS / FAIL
```

### Demo Rehearsal Test
```bash
# Simulates the exact demo sequence with timing
python -m echofield.demo_rehearsal

# Runs the full 5-minute demo cycle:
# - Load dataset (show metadata table)
# - Select a file
# - Show before/after spectrogram
# - Play before audio
# - Play denoised audio
# - Show acoustic analysis
# - Export CSV
#
# Reports: total duration, model inference time, UI responsiveness
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
ffmpeg -i data/raw/bad_file.wav -acodec pcm_s16le -ar 16000 data/raw/bad_file_fixed.wav

# Solution 2: Use sox to inspect/fix
sox data/raw/bad_file.wav -t wav data/raw/bad_file_fixed.wav

# Solution 3: Skip bad files in preprocessing
python -m echofield.preprocess \
  --input-dir data/raw \
  --output-dir data/processed \
  --skip-errors
```

### **Out of Memory During Processing**
```bash
# Problem: "CUDA out of memory" or "MemoryError"

# Solution 1: Reduce batch size
ECHOFIELD_BATCH_SIZE=4 python -m echofield.server

# Solution 2: Switch to CPU
ECHOFIELD_DEVICE=cpu python -m echofield.server

# Solution 3: Process in smaller chunks
python -m echofield.preprocess \
  --input-dir data/raw \
  --output-dir data/processed \
  --chunk-size 5  # 5-second chunks instead of 10
```

### **WebSocket Connection Fails**
```bash
# Problem: Frontend can't connect to backend

# Solution 1: Check backend is running
curl http://localhost:8000/health

# Solution 2: Check CORS settings
# Edit .env, verify ECHOFIELD_CORS_ORIGINS includes http://localhost:5173

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
# 1. CPU inference (should be ~1-2s on GPU)
# 2. Model quantization not applied
# 3. Batch size too small

# Solutions:
# 1. Verify ECHOFIELD_DEVICE=cuda
# 2. Load quantized model
python -c "from echofield.ml.denoiser import Denoiser; d = Denoiser(device='cuda', quantized=True)"

# 3. Increase batch size (if memory allows)
ECHOFIELD_BATCH_SIZE=16 python -m echofield.server
```

### **Spectrogram Visualization Shows Blank**
```bash
# Problem: Spectrogram displays as all zeros or all white

# Solution 1: Check audio normalization
python -c "
import numpy as np
spec = np.load('data/processed/elephant_call_001_spectrogram.npy')
print(f'Min: {spec.min()}, Max: {spec.max()}, Mean: {spec.mean()}')
"

# Solution 2: Check log scaling
# Frontend may need log-scale conversion: 20 * log10(spec + 1e-5)

# Solution 3: Regenerate spectrograms
python -m echofield.preprocess --force-reprocess
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
python -m echofield.preprocess \
  --input-dir data/raw \
  --output-dir data/processed \
  --n-workers 4

# 3. Start backend
python -m echofield.server &

# 4. Start frontend
cd frontend && npm run dev &

# 5. Wait for both to be ready
sleep 5
curl http://localhost:8000/health
curl http://localhost:5173 2>/dev/null | head -1

# 6. Run integration test
python -m echofield.integration_test
# Must print PASS

# 7. Run demo rehearsal 2x
python -m echofield.demo_rehearsal
python -m echofield.demo_rehearsal
# Both must complete without errors
```

### T-10 Minutes: Final Prep
```bash
# Verify everything is running
curl http://localhost:8000/api/files | python -m json.tool
# Should list all 44 files

# Open browser windows
# http://localhost:5173 (full screen, no dev tools)

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
python -m echofield.server

# Frontend: React dev server on http://localhost:5173
cd frontend && npm run dev
```

### For Judging (Production)

**Backend (Railway / Render):**
```bash
# 1. Create Railway/Render account
# 2. Connect repo
# 3. Add environment variables:
#    - ECHOFIELD_AUDIO_DIR=/app/data/raw
#    - ECHOFIELD_PROCESSED_DIR=/app/data/processed
#    - ECHOFIELD_DEVICE=cpu  (use CPU on servers)
# 4. Dockerfile (provided):
FROM python:3.10-slim
WORKDIR /app
COPY requirements.txt .
RUN pip install -r requirements.txt
COPY . .
CMD ["python", "-m", "echofield.server"]
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
curl https://echofield-api.railway.app/api/files
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
python -m echofield.server 2>&1 | grep -E "ERROR|INFO|Uvicorn"

# Check if ports are in use
lsof -i :8000
lsof -i :5173

# Test API endpoints
curl -X GET http://localhost:8000/api/files
curl -X POST http://localhost:8000/api/denoise \
  -H "Content-Type: application/json" \
  -d '{"filename": "elephant_call_001.wav"}'

# Monitor preprocessing progress
tail -f .preprocess.log

# Generate quality metrics
python -m echofield.evaluate \
  --input-dir data/raw \
  --output-dir data/processed \
  --metric snr \
  --metric pesq \
  --export-csv reports/metrics.csv

# Clear caches and temp files
python -m echofield.clean --all

# Validate audio files
python -c "
import librosa
import os
for f in os.listdir('data/raw'):
    if f.endswith('.wav'):
        try:
            y, sr = librosa.load(f'data/raw/{f}')
            print(f'✓ {f} ({len(y)//sr}s @ {sr}Hz)')
        except Exception as e:
            print(f'✗ {f}: {e}')
"
```

---

*Last updated: April 11, 2026*
