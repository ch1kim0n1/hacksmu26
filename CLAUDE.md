# EchoField — Elephant Vocalization Noise-Removal & Research Platform

## What this project does

An interactive web platform that removes overlapping noise (airplanes, cars, generators, wind) from elephant field recordings, visualizes the acoustic discovery in real time, and unlocks acoustic metrics for elephant communication research. Built for the HackSMU 2026 hackathon in partnership with ElephantVoices.

## Project structure

```
echofield/                  # Python backend (FastAPI)
  server.py                 # REST API: upload, list, process, export, stats
  config.py                 # Settings from env vars + YAML config
  models.py                 # Pydantic request/response models
  data_loader.py            # In-memory RecordingStore + CSV/audio discovery
  websocket.py              # WebSocket manager for real-time progress
  __main__.py               # Entry point: `python -m echofield`
  pipeline/                 # Audio processing pipeline
    ingestion.py            # File validation, loading, segmentation
    spectrogram.py          # STFT, mel spectrogram, PNG export
    spectral_gate.py        # Spectral gating noise removal (noisereduce + scipy)
    noise_classifier.py     # Heuristic noise type detection (airplane/car/generator/wind)
    feature_extract.py      # 12 acoustic metrics per call + call type classification
    quality_check.py        # SNR, energy preservation, spectral distortion
    hybrid_pipeline.py      # Orchestrator: ingestion -> spectrogram -> denoise -> QA
    cache_manager.py        # File-based caching for spectrograms and processed audio
  research/                 # Research data tools
    call_database.py        # In-memory call catalog with search/filter
    exporter.py             # CSV, JSON, ZIP export for research workflows
  utils/
    audio_utils.py          # Audio I/O, normalization, resampling
    logging_config.py       # Structured logging

frontend/                   # Next.js 14 (TypeScript + Tailwind)
  src/app/                  # Pages: landing, upload, processing/[jobId], database
  src/components/
    audio/                  # AudioControls, WaveformPlayer (wavesurfer.js)
    layout/                 # Header, Sidebar, Footer
    processing/             # ProcessingStatus, ProcessingTimeline, SNRMeter
    research/               # AcousticPanel, CallCard, ExportModal, FilterPanel
    spectrogram/            # SpectrogramViewer, BeforeAfterSlider, FrequencyAxis
  src/hooks/                # useLocalStorage

config/
  echofield.config.yml      # Noise profiles, pipeline stages, quality thresholds
  .env.example               # Environment variable reference
  docker-compose.yml         # Alternate compose location

data/                        # Runtime data (not in git)
  recordings/                # Raw uploaded WAV/MP3/FLAC files
  processed/                 # Denoised output files
  spectrograms/              # Generated spectrogram PNGs
```

## How to run

```bash
# Install
pip install -r requirements.txt
cd frontend && npm install && cd ..

# Dev (backend + frontend)
make dev

# Backend only
python -m echofield        # FastAPI on :8000

# Frontend only
cd frontend && npm run dev  # Next.js on :3000

# Docker
docker compose up
```

## Key APIs

- `POST /api/upload` — Upload audio file
- `GET /api/recordings` — List recordings (paginated, filterable)
- `POST /api/recordings/{id}/process` — Start processing
- `GET /api/recordings/{id}/spectrogram` — Get spectrogram PNG
- `GET /api/recordings/{id}/download` — Download cleaned audio
- `GET /api/stats` — Dashboard statistics
- `GET /api/calls` — List detected calls
- `POST /api/export/research` — Export CSV/JSON

## Dependencies

Backend: `fastapi librosa soundfile scipy noisereduce numpy matplotlib pyyaml python-multipart aiofiles python-dotenv`

Frontend: `next@14 react@18 wavesurfer.js framer-motion tailwindcss`

## Code conventions

- Backend is pure Python with numpy/scipy/librosa. No PyTorch required for the core pipeline.
- Pipeline stages are modular — each file in `echofield/pipeline/` handles one stage.
- In-memory storage (RecordingStore) — no database. Single uvicorn worker.
- Frontend uses Next.js App Router with TypeScript. Tailwind for styling.
- Config via `ECHOFIELD_*` environment variables with fallback defaults.

## Working order

1. **Pick an issue** — Either the user specifies one, or pick from what's assigned to `@cxdima` on GitHub.
2. **Write tests first** — TDD. Write failing tests that define the expected behavior before any implementation.
3. **Implement** — Write the code to make the tests pass.
4. **Commit to a PR** — Create a PR with `(WIP)` in the title. Push commits as work progresses.
5. **Remove (WIP)** — Once CI/CD passes, update the PR title to remove `(WIP)`.

Goals: working code, tested, high quality, passes CI/CD, and cool.

## GitHub issues

Issues are tracked at https://github.com/ch1kim0n1/hacksmu26/issues. Labels use priority (`P0: must-ship`, `P1: should-ship`, `P2: nice-to-have`) and role tags.
