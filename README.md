# EchoField

Elephant vocalization noise-removal and research platform. Built for HackSMU 2026 in partnership with [ElephantVoices](https://www.elephantvoices.org/).

EchoField removes overlapping noise (airplanes, cars, generators, wind) from elephant field recordings, visualizes the acoustic discovery in real time, and surfaces acoustic metrics for elephant communication research.

## Quick start

```bash
# Backend
pip install -r requirements.txt
python -m echofield          # FastAPI on :8000

# Frontend
cd frontend && npm install
npm run dev                  # Next.js on :3000

# Both at once
make dev
```

## Project structure

```
echofield/                   # Python backend (FastAPI)
  server.py                  # REST + WebSocket API
  pipeline/                  # Audio processing pipeline
    hybrid_pipeline.py       #   Orchestrator
    ingestion.py             #   File validation, loading, segmentation
    spectrogram.py           #   STFT, mel spectrogram, PNG export
    spectral_gate.py         #   Noise removal (noisereduce + scipy)
    noise_classifier.py      #   Noise type detection
    feature_extract.py       #   Acoustic metrics per call
    quality_check.py         #   SNR, energy preservation, distortion
    call_detector.py         #   Call boundary detection
    infrasound.py            #   Infrasound analysis
    deep_denoise.py          #   ML-based denoising
  research/                  # Call database, CSV/JSON/ZIP export
  models.py                  # Pydantic request/response models
  config.py                  # Settings (env vars + YAML)

frontend/                    # Next.js 14 + TypeScript + Tailwind
  src/app/                   # Pages
    page.tsx                 #   Landing (GSAP elephant hero + globe transition)
    upload/                  #   Upload recordings
    processing/[jobId]/      #   Live processing view
    database/                #   Recording library
    results/                 #   Spectrogram gallery
    compare/                 #   Cross-species comparison
    review/                  #   Call review queue
    batch/[batchId]/         #   Batch processing
    export/                  #   Research export
    about/                   #   Project story + team
  src/components/
    audio/                   #   WaveformPlayer, AudioControls
    layout/                  #   AppShell, Header, Sidebar, Footer
    processing/              #   ProcessingStatus, SNRMeter
    research/                #   AcousticPanel, CallCard, FilterPanel
    spectrogram/             #   SpectrogramViewer, BeforeAfterSlider
    ui/                      #   shadcn/ui + motion primitives

data/                        # Runtime data
  audio-files/               # Source recordings (tracked)
  analysis/                  # Audio analysis results (tracked)
  cache/                     # Processing cache (gitignored)

config/
  echofield.config.yml       # Noise profiles, pipeline params
```

## Key APIs

The backend exposes ~80 endpoints. Core ones:

| Endpoint | Description |
|---|---|
| `POST /api/upload` | Upload audio file |
| `GET /api/recordings` | List recordings (paginated, filterable) |
| `POST /api/recordings/{id}/process` | Start processing |
| `GET /api/recordings/{id}/spectrogram` | Get spectrogram PNG |
| `GET /api/recordings/{id}/download` | Download cleaned audio |
| `GET /api/stats` | Dashboard statistics |
| `GET /api/calls` | List detected calls |
| `POST /api/export/research` | Export CSV/JSON for research |
| `WS /ws/processing/{id}` | Real-time processing progress |

Full endpoint list: see `echofield/server.py`.

## Tech stack

**Backend:** Python, FastAPI, librosa, soundfile, scipy, noisereduce, numpy, matplotlib

**Frontend:** Next.js 14, React 18, TypeScript, Tailwind CSS, GSAP, Framer Motion, wavesurfer.js, Three.js/R3F, Plotly, shadcn/ui

## Design system

Warm, nature-inspired palette based on the ElephantVoices brand:
- **Typography:** Cormorant Garamond (display) + Plus Jakarta Sans (body)
- **Colors:** Elephant grays, savanna/gold accents, sage/earth/terracotta
- **Tokens:** Defined in `frontend/tailwind.config.ts` and `frontend/src/app/globals.css`

## Team

Built by the HackSMU 2026 team for the ElephantVoices challenge.
