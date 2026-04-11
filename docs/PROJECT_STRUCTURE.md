# EchoField — Project Structure & Ownership Map

EchoField is a real-time elephant vocalization noise-removal platform built for the ElephantVoices hackathon track at HackSMU (36-hour sprint). The system combines spectral noise classification, deep learning denoising, and interactive audio visualization to clean field recordings while preserving acoustic features critical for conservation research. The tech stack uses Python/FastAPI for the ML pipeline, Next.js/TypeScript for the frontend, WebSockets for real-time streaming, and Docker for reproducible demo deployment. The architecture is modular by design: audio ingestion → noise classification → hybrid denoising → quality measurement → research export.

---

## File Tree — Complete Directory Structure

```
echofield/
│
├── .env.example                # Template for environment variables (API ports, model paths, etc.)
├── .env                        # IGNORED: local secrets, HF model tokens, API keys
├── .gitignore                  # Git exclude patterns (see Git Ignore Patterns section)
├── README.md                   # Hackathon submission front-door
├── requirements.txt            # Python package dependencies (librosa, fastapi, torch, etc.)
│
├── echofield/                  # Root Python package — backend + ML pipeline
│   │
│   ├── __init__.py            # Package marker, version string
│   ├── __main__.py            # python -m echofield entry point
│   ├── server.py              # FastAPI application, route definitions, CORS setup
│   ├── config.py              # Environment loading, config dataclass, validation
│   ├── models.py              # Pydantic models for requests/responses (AudioFile, DenoiseJob, etc.)
│   ├── data_loader.py         # Spreadsheet parsing (metadata.csv), audio file discovery
│   ├── websocket.py           # WebSocket manager, connection lifecycle, event broadcasting
│   │
│   ├── pipeline/              # Core audio processing pipeline
│   │   ├── __init__.py
│   │   ├── ingestion.py       # Audio file loading (librosa), format validation, sample rate checks
│   │   ├── spectrogram.py     # Mel-scale spectrogram generation, STFT computation, caching
│   │   ├── noise_classifier.py# Classify noise type: airplane, car, generator, wind, other
│   │   ├── spectral_gate.py   # Spectral gating noise removal (threshold-based masking)
│   │   ├── deep_denoise.py    # Deep learning denoiser (Demucs fork or Nvidia Demucs wrapper)
│   │   ├── hybrid_pipeline.py # Orchestrate: classify → select strategy → denoise → measure
│   │   ├── quality_check.py   # SNR measurement, before/after comparison, quality score
│   │   ├── feature_extract.py # Call duration, pitch range, harmonic content, spectral centroid
│   │   └── cache_manager.py   # LRU cache for spectrograms and model outputs (no re-compute)
│   │
│   ├── research/              # Research output + conservation integration
│   │   ├── __init__.py
│   │   ├── exporter.py        # CSV/JSON research data export (call features, noise type, SNR)
│   │   ├── call_database.py   # In-memory call catalog, search by location/date/animal
│   │   └── acoustic_analysis.py # Frequency analysis, harmonic tracking, call classification
│   │
│   └── utils/                 # Shared utilities
│       ├── __init__.py
│       ├── audio_utils.py     # Loudness normalization, sample rate conversion
│       └── logging_config.py  # Structured logging (JSON or human-readable)
│
├── frontend/                   # Next.js 14 frontend application (App Router)
│   │
│   ├── package.json           # Dependencies: next, react, typescript, tailwind, shadcn/ui, zustand
│   ├── package-lock.json      # Locked dependency tree (committed)
│   ├── next.config.js         # Image optimization, API route config, build settings
│   ├── tsconfig.json          # TypeScript strict mode, path aliases (@/components, etc.)
│   ├── tailwind.config.ts     # Tailwind color palette, custom spacing, plugin config
│   ├── .eslintrc.json         # ESLint rules (Next.js recommended + accessibility)
│   │
│   └── src/
│       │
│       ├── app/               # Next.js App Router pages
│       │   ├── layout.tsx     # Root layout: header, sidebar, global styles
│       │   ├── page.tsx       # Landing page: ElephantVoices story, CTA to upload
│       │   ├── error.tsx      # Error boundary
│       │   │
│       │   ├── upload/
│       │   │   ├── page.tsx   # Audio file drop-zone, metadata form, submit handler
│       │   │   └── layout.tsx # Upload-specific layout (side-by-side view)
│       │   │
│       │   ├── processing/
│       │   │   ├── page.tsx   # Real-time processing UI (pipeline stages, progress bar)
│       │   │   └── [jobId]/
│       │   │       └── page.tsx # Job detail: live spectrogram, artifact viewer
│       │   │
│       │   ├── results/
│       │   │   ├── page.tsx   # Results gallery (all processed clips)
│       │   │   └── [resultId]/
│       │   │       └── page.tsx # Individual result: before/after slider, metrics, export
│       │   │
│       │   ├── database/
│       │   │   └── page.tsx   # Call catalog browser (search, filter by animal, location, date)
│       │   │
│       │   ├── analysis/
│       │   │   └── page.tsx   # Acoustic analysis dashboard (spectral plots, harmonic extraction)
│       │   │
│       │   └── export/
│       │       └── page.tsx   # Research data export (CSV, JSON, summary stats)
│       │
│       ├── components/        # Reusable React components
│       │   │
│       │   ├── spectrogram/
│       │   │   ├── SpectrogramViewer.tsx      # Mel-scale render, frequency axis labels
│       │   │   ├── BeforeAfterSlider.tsx     # Interactive slider overlay two spectrograms
│       │   │   ├── HarmonicOverlay.tsx       # Draw harmonic lines on spectrogram
│       │   │   └── FrequencyAxis.tsx         # Y-axis with kHz labels
│       │   │
│       │   ├── audio/
│       │   │   ├── WaveformPlayer.tsx        # Play/pause/seek, current time display
│       │   │   ├── AudioControls.tsx         # Volume, playback speed, download button
│       │   │   ├── WaveformVisualizer.tsx    # Canvas-based waveform render
│       │   │   └── SpectrumAnalyzer.tsx      # Real-time frequency meter (FFT visualization)
│       │   │
│       │   ├── processing/
│       │   │   ├── ProcessingTimeline.tsx    # Visual pipeline stages (ingestion → classify → denoise → export)
│       │   │   ├── NoiseAnimationCard.tsx    # Animated noise classification chip (airplane icon, etc.)
│       │   │   ├── SNRMeter.tsx              # Bar chart showing before/after SNR improvement
│       │   │   └── ProcessingStatus.tsx      # Percentage progress, ETA, status message
│       │   │
│       │   ├── research/
│       │   │   ├── CallCard.tsx              # Thumbnail: call ID, animal, location, duration, noise type
│       │   │   ├── AcousticPanel.tsx         # Show extracted features (pitch, harmonics, duration)
│       │   │   ├── CallGrid.tsx              # Grid of CallCard components with search/sort
│       │   │   ├── FilterPanel.tsx           # Location, animal type, date range filters
│       │   │   └── ExportModal.tsx           # CSV/JSON format selector, download trigger
│       │   │
│       │   ├── layout/
│       │   │   ├── Header.tsx                # Logo, nav links, user menu (if auth exists)
│       │   │   ├── Sidebar.tsx               # Left nav: Upload, Processing, Results, Database, Analysis
│       │   │   ├── Breadcrumb.tsx            # Current page breadcrumb (Upload > Step 2)
│       │   │   └── Footer.tsx                # ElephantVoices credit, sponsor logos
│       │   │
│       │   └── ui/                           # shadcn/ui + custom tokens
│       │       ├── Button.tsx
│       │       ├── Card.tsx
│       │       ├── Dialog.tsx
│       │       ├── Input.tsx
│       │       ├── Label.tsx
│       │       ├── Slider.tsx
│       │       ├── Progress.tsx
│       │       ├── Tabs.tsx
│       │       └── Badge.tsx
│       │
│       ├── hooks/             # Custom React hooks
│       │   ├── useWebSocket.ts      # Connect to backend WebSocket, handle messages, reconnect
│       │   ├── useAudioPlayer.ts    # Play/pause/seek state, current time tracking
│       │   ├── useSpectrogram.ts    # Fetch and render spectrogram image
│       │   ├── useProcessingJob.ts  # Subscribe to job updates, poll for completion
│       │   ├── useLocalStorage.ts   # Persist UI state (sidebar open, volume, etc.)
│       │   └── useDragDrop.ts       # File drag-drop zone state management
│       │
│       ├── lib/               # Utility functions and API client
│       │   ├── api.ts         # Fetch wrapper, base URL, header injection, error handling
│       │   ├── audio-api.ts   # POST /api/process, GET /api/results/:id, WebSocket URL builder
│       │   ├── constants.ts   # API endpoints, UI text, color palette, model names
│       │   ├── format.ts      # Duration formatting (MM:SS), kHz label, percentage strings
│       │   └── validation.ts  # File type check (WAV), file size limit, sample rate validation
│       │
│       └── styles/
│           ├── globals.css    # Tailwind imports, CSS resets, custom variables
│           └── theme.css      # Color palette (elephant gray, grass green), dark mode
│
├── data/                      # Audio recordings, metadata, and outputs
│   │
│   ├── recordings/           # 44 .wav files (ElephantVoices corpus subset)
│   │   ├── call_001.wav      # Duration: 5-30 seconds each, 16 kHz or 44.1 kHz sample rate
│   │   ├── call_002.wav
│   │   ├── ...
│   │   └── call_044.wav
│   │
│   ├── spectrograms/         # Pre-generated spectrogram PNG images (demo cache)
│   │   ├── call_001_mel.png
│   │   ├── call_001_mel_denoised.png
│   │   └── ...
│   │
│   ├── metadata.csv          # Master spreadsheet with call metadata
│   │                         # Columns: call_id, animal_id, location, date, start_sec, end_sec, noise_type_ref, species
│   │                         # Used for call database, search, call catalog UI
│   │
│   └── processed/            # Output directory (created at runtime)
│       ├── call_001_denoised.wav
│       ├── call_001_metrics.json
│       └── ...
│
├── models/                   # Pre-trained ML models
│   │
│   ├── denoiser/
│   │   ├── demucs_ft.pt      # Demucs fine-tuned checkpoint (elephant-specific, if available)
│   │   └── model_card.md     # Model provenance, training data, performance notes
│   │
│   └── classifier/
│       └── noise_classifier.pt # Optional: small CNN for noise type classification (airplane, car, etc.)
│
├── config/                   # Configuration files
│   │
│   ├── echofield.config.yml # Pipeline defaults: SNR threshold, denoise method, export format
│   │                        # Example:
│   │                        #   pipeline:
│   │                        #     denoise_method: "hybrid"  # spectral_gate | deep | hybrid
│   │                        #     snr_threshold_db: 10
│   │                        #     mel_bands: 64
│   │                        #     export_format: "wav"  # wav | flac | mp3
│   │
│   └── docker-compose.yml    # Service definitions: backend, frontend (dev server)
│                             # Volumes: data/, models/
│                             # Ports: 8000 (backend), 3000 (frontend)
│
├── Makefile                  # Development helpers
│   │                         # Targets: make dev (run both), make test, make build, make demo-setup
│
├── docker-compose.yml        # Top-level Compose file (mirrors config/)
│
└── .dockerignore             # Exclude node_modules, __pycache__, .git, etc.
```

---

## Ownership Map

| File / Directory | Owner (Role) | Priority | Est. Hours | Notes |
|------------------|--------------|----------|------------|-------|
| **Backend Core** |
| `echofield/server.py` | Backend Lead | P0 | 4 | FastAPI app, route definitions, error handling. Unblock frontend immediately. |
| `echofield/config.py` | Backend Lead | P0 | 1.5 | Load .env, validate paths, expose settings. Blocking: everything. |
| `echofield/models.py` | Backend Lead | P0 | 2 | Request/response Pydantic schemas. Blocking: API contract. |
| `echofield/websocket.py` | Backend Lead | P0 | 3 | WebSocket manager, message routing. Blocking: real-time UI updates. |
| **Audio Pipeline** |
| `pipeline/ingestion.py` | ML Engineer | P0 | 2 | Audio file loading, validation. Blocking: entire pipeline. |
| `pipeline/spectrogram.py` | ML Engineer | P0 | 2.5 | Mel-scale generation, caching. Blocking: UI visualization, denoising. |
| `pipeline/noise_classifier.py` | ML Engineer | P1 | 3 | Classify noise type. Nice-to-have: demo works without this. |
| `pipeline/spectral_gate.py` | ML Engineer | P0 | 2.5 | Spectral gating removal. Blocking: demo audio quality. |
| `pipeline/deep_denoise.py` | ML Engineer | P1 | 4 | Deep learning denoiser (Demucs). Nice-to-have: spectral gating sufficient. |
| `pipeline/hybrid_pipeline.py` | ML Engineer | P0 | 3 | Orchestrate stages. Blocking: core flow. |
| `pipeline/quality_check.py` | ML Engineer | P0 | 2 | SNR measurement. Blocking: before/after metrics display. |
| `pipeline/feature_extract.py` | ML Engineer | P1 | 3 | Harmonic extraction, acoustic properties. Nice-to-have: research export. |
| **Research Module** |
| `research/exporter.py` | ML Engineer | P1 | 1.5 | CSV/JSON export. Nice-to-have: demo works with UI only. |
| `research/call_database.py` | Full-Stack | P1 | 2 | Call catalog search. Nice-to-have: secondary feature. |
| `research/acoustic_analysis.py` | ML Engineer | P2 | 2.5 | Harmonic analysis. Nice-to-have: future work. |
| **Frontend Core** |
| `src/app/layout.tsx` | Frontend Lead | P0 | 2 | Root layout, header, sidebar. Blocking: all pages. |
| `src/app/page.tsx` | Frontend Lead | P0 | 1.5 | Landing page. Blocking: first impression. |
| `src/app/upload/page.tsx` | Frontend Lead | P0 | 2.5 | Drop zone, metadata form, submit. Blocking: user entry point. |
| **Spectrogram Components** |
| `components/spectrogram/SpectrogramViewer.tsx` | Frontend Lead | P0 | 3 | Render mel-scale image. Blocking: core visual. |
| `components/spectrogram/BeforeAfterSlider.tsx` | Frontend Lead | P0 | 2.5 | Interactive slider overlay. Blocking: demo wow moment. |
| `components/spectrogram/HarmonicOverlay.tsx` | Frontend Lead | P1 | 2 | Draw harmonic lines. Nice-to-have: research detail. |
| **Audio Components** |
| `components/audio/WaveformPlayer.tsx` | Full-Stack | P0 | 2.5 | Play/pause/seek. Blocking: audio playback. |
| `components/audio/AudioControls.tsx` | Full-Stack | P1 | 1.5 | Volume, speed, download. Nice-to-have. |
| `components/audio/WaveformVisualizer.tsx` | Full-Stack | P1 | 2 | Canvas waveform. Nice-to-have: visual detail. |
| **Processing Components** |
| `components/processing/ProcessingTimeline.tsx` | Frontend Lead | P0 | 2 | Pipeline stages visualization. Blocking: user feedback during processing. |
| `components/processing/SNRMeter.tsx` | Frontend Lead | P0 | 1.5 | Before/after SNR bars. Blocking: metric display. |
| `components/processing/ProcessingStatus.tsx` | Frontend Lead | P0 | 1 | Progress %, ETA, message. Blocking: status feedback. |
| **Research Components** |
| `components/research/CallCard.tsx` | Full-Stack | P1 | 1.5 | Thumbnail card. Nice-to-have: gallery view. |
| `components/research/CallGrid.tsx` | Full-Stack | P1 | 1.5 | Grid layout with search. Nice-to-have: secondary feature. |
| `components/research/AcousticPanel.tsx` | Full-Stack | P1 | 1.5 | Feature display. Nice-to-have. |
| **Layout Components** |
| `components/layout/Header.tsx` | Frontend Lead | P0 | 1 | Logo, nav. Blocking: every page. |
| `components/layout/Sidebar.tsx` | Frontend Lead | P0 | 1.5 | Left nav. Blocking: navigation. |
| **Hooks & API** |
| `hooks/useWebSocket.ts` | Full-Stack | P0 | 2.5 | Backend communication. Blocking: real-time updates. |
| `hooks/useAudioPlayer.ts` | Full-Stack | P0 | 2 | Audio playback state. Blocking: player component. |
| `hooks/useProcessingJob.ts` | Full-Stack | P0 | 2 | Job polling. Blocking: real-time progress. |
| `lib/api.ts` | Full-Stack | P0 | 1.5 | API client wrapper. Blocking: all fetch calls. |
| `lib/audio-api.ts` | Full-Stack | P0 | 1.5 | Audio endpoints. Blocking: server communication. |
| **Config & Data** |
| `config/echofield.config.yml` | Backend Lead | P1 | 0.5 | Pipeline config. Nice-to-have: demo uses defaults. |
| `data/metadata.csv` | Data Engineer | P1 | 1 | Master spreadsheet. Nice-to-have: demo with subset. |
| `data/recordings/` | Data Engineer | P0 | 0 | Provided by ElephantVoices. No work required. |
| **Deployment & Docs** |
| `docker-compose.yml` | DevOps / Backend | P0 | 1.5 | Demo containers. Blocking: 36-hour hack setup. |
| `Makefile` | DevOps / Full-Stack | P0 | 1 | Dev helpers. Blocking: quick iteration. |
| `README.md` | Full-Stack Lead | P0 | 1.5 | Submission doc. Blocking: judge review. |
| `.env.example` | Backend Lead | P0 | 0.5 | Template only. Blocking: setup. |
| `.gitignore` | Full-Stack Lead | P0 | 0.5 | Exclude secrets, cache. Blocking: day 1. |
| **Testing & CI** |
| `tests/test_pipeline.py` | ML Engineer | P2 | 3 | Unit tests for audio processing. Nice-to-have: post-demo hardening. |
| `tests/test_api.py` | Full-Stack | P2 | 2 | Integration tests. Nice-to-have. |

---

## Build Priority Order

### P0 (Must Ship — 22 hours)

**Goal:** Full demo loop working end-to-end. User uploads audio → pipeline denoises → UI shows before/after → download cleaned file.

| Task | Owner | Hours | Dep. On | Shipped By |
|------|-------|-------|---------|-----------|
| Setup project structure, .env, Docker Compose | Backend | 1.5 | — | Hour 1 |
| FastAPI server (routes skeleton) | Backend | 2 | .env | Hour 3.5 |
| Audio ingestion + spectrogram generation | ML Engineer | 2.5 | server | Hour 6 |
| Spectral gating denoiser | ML Engineer | 2.5 | ingestion | Hour 8.5 |
| Quality check (SNR measurement) | ML Engineer | 2 | spectral_gate | Hour 10.5 |
| Hybrid pipeline orchestrator | ML Engineer | 3 | all stages | Hour 13.5 |
| Root layout + landing page | Frontend | 2 | — | Hour 3 |
| Upload page (drop zone + form) | Frontend | 2.5 | server ready | Hour 5.5 |
| SpectrogramViewer component | Frontend | 3 | server returns images | Hour 8.5 |
| BeforeAfterSlider component | Frontend | 2.5 | spectrogram viewer | Hour 11 |
| WaveformPlayer component | Frontend | 2.5 | server provides audio | Hour 13.5 |
| useWebSocket hook | Full-Stack | 2.5 | server WebSocket | Hour 15.5 |
| useProcessingJob hook | Full-Stack | 2 | useWebSocket | Hour 17.5 |
| ProcessingTimeline component | Frontend | 2 | processing state | Hour 19.5 |
| SNRMeter + ProcessingStatus | Frontend | 1.5 | quality_check results | Hour 21 |
| Integration: end-to-end flow | Full-Stack | 1 | all P0 | Hour 22 |

**Checkpoint (Hour 22):** Upload audio file → see real-time spectrogram before/after → hear denoised audio → download → verify file exists.

---

### P1 (Should Ship — 10 hours)

**Goal:** Polish, research features, better noise classification.

| Task | Owner | Hours | Dep. On | Ship If Time |
|------|-------|-------|---------|--------------|
| Noise classification (airplane/car/generator) | ML Engineer | 3 | ingestion | Hour 25 |
| Acoustic feature extraction (pitch, harmonics) | ML Engineer | 3 | spectrogram | Hour 28 |
| Call database + search UI | Full-Stack | 2 | feature_extract | Hour 30 |
| CSV/JSON export endpoint | Backend | 1.5 | feature_extract | Hour 31.5 |
| CallGrid + AcousticPanel components | Frontend | 2 | call_database | Hour 33.5 |
| Dark mode styling | Frontend | 1 | layout done | Hour 34.5 |

**Checkpoint (Hour 32):** Noise type shown on UI, acoustic features extracted and displayed, research data exportable.

---

### P2 (Nice to Have — 4 hours, post-demo)

- Deep learning denoiser (Demucs integration)
- HarmonicOverlay visualization
- Advanced acoustic analysis dashboard
- Unit test suite
- Performance profiling

---

## Critical Path — Dependency Chain

The following must be completed sequentially to unblock the demo:

1. **Backend Skeleton** (.env, config, FastAPI routes)
   ↓ blocks everything
2. **Audio Ingestion** (load files, validate formats)
   ↓ blocks
3. **Spectrogram Generation** (mel-scale STFT)
   ↓ blocks both:
   - Spectral Gating (denoising)
   - Frontend spectrogram display
4. **Spectral Gating** → Quality Check → Hybrid Pipeline (backend audio processing)
   ↓ blocks
5. **Frontend Pages** (upload, results) + WebSocket hooks
   ↓ blocks
6. **Spectrogram & Audio Components** (UI rendering)
   ↓ blocks
7. **End-to-End Integration** (user uploads → backend processes → UI displays → audio plays)

**Parallel tracks (no dependency):**
- Backend audio pipeline (once server skeleton ready)
- Frontend pages and components (can start immediately with mocked API)

**Risk zones:**
- WebSocket real-time updates: start early, test with dummy data
- Audio format compatibility: test with actual ElephantVoices .wav files from day 1
- Spectrogram caching: add early to avoid re-compute on refresh
- Model loading: test Demucs weight loading if using deep denoiser

---

## Git Ignore Patterns

```
# Environment & Secrets
.env
.env.local
.env.*.local

# Python
__pycache__/
*.py[cod]
*$py.class
*.so
.Python
build/
develop-eggs/
dist/
downloads/
eggs/
.eggs/
lib/
lib64/
parts/
sdist/
var/
wheels/
pip-wheel-metadata/
share/python-wheels/
*.egg-info/
.installed.cfg
*.egg
MANIFEST
.pytest_cache/
.coverage
htmlcov/
.tox/
.nox/
venv/
ENV/
env/
.venv

# Node & Frontend
node_modules/
.next/
out/
.cache/
.vercel/
dist/
build/
*.tsbuildinfo
npm-debug.log
yarn-error.log
.DS_Store
*.pem

# IDE
.vscode/
.idea/
*.swp
*.swo
*~
.project
.pydevproject
.settings/

# Audio Processing
*.pyc
*.wav.tmp
*.cache
.librosa_cache/

# Model Weights (large files)
*.pt
*.pth
models/denoiser/*.pt
models/classifier/*.pt

# Data Processing
data/processed/
data/spectrograms/*.png
data/recordings/*.tmp
*.log

# OS
.DS_Store
Thumbs.db
.Spotlight-V100
.Trashes

# Docker
.docker/
Dockerfile.dev
docker-compose.dev.yml

# Build Output
*.egg-info
.tox
.coverage
htmlcov/

# Jupyter
.ipynb_checkpoints
*.ipynb

# Development
.mock_data/
.tmp/
.debug/
```

---

## Dev Environment Setup Checklist (Hour 0–1)

- [ ] Clone repo, create feature branch
- [ ] `python -m venv venv && source venv/bin/activate`
- [ ] `pip install -r requirements.txt`
- [ ] `cd frontend && npm install`
- [ ] Copy `.env.example` to `.env`, fill in HuggingFace token
- [ ] `docker-compose up -d` (spin up dev database if needed)
- [ ] Verify backend server starts: `python -m echofield` (should see "Uvicorn running on 8000")
- [ ] Verify frontend dev server: `cd frontend && npm run dev` (should see "Ready on 3000")
- [ ] Test upload endpoint: `curl -X POST http://localhost:8000/api/process -F file=@data/recordings/call_001.wav`
- [ ] Open http://localhost:3000 in browser, see landing page
- [ ] **Checkpoint:** Backend + frontend both running, no errors in console

---

## Demo Procedure (Hour 36)

1. **Start services:** `docker-compose up` (or `make demo`)
2. **Open browser:** http://localhost:3000
3. **Navigate:** Click "Upload" in sidebar
4. **Drop file:** Drag `data/recordings/call_001.wav` into drop zone
5. **Process:** Hit "Denoise" button
6. **Watch:** See pipeline stages animate (ingestion → classify → spectral gate → quality check)
7. **Compare:** Before/after spectrogram slider (show noise removed, call preserved)
8. **Listen:** Play both versions side-by-side using player controls
9. **Download:** Hit "Download Cleaned" button, verify .wav appears in downloads folder
10. **Export:** (If time) Show CSV export of call features + SNR improvement
11. **Pivot to database:** (If time) Show call catalog search (filtered by location, animal type)

**Target demo time:** 3–5 minutes. Judge impression: "This preserves elephant calls while removing real-world noise. Useful for conservation research. Clean architecture, real-time feedback."

