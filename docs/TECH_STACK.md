# EchoField — Tech Stack Reference

Complete technology inventory with versions, justifications, and setup commands. Every choice is optimized for: hackathon speed, demo reliability, elephant vocalization fidelity, and spectral analysis precision.

---

## Core Runtime

### Python 3.11+
**Role:** Backend audio processing server (FastAPI), ML inference engine, spectral analysis, noise reduction pipeline, WebSocket real-time updates  
**Why:** Industry standard for audio processing and ML. SciPy, librosa, torch ecosystem. FastAPI for async endpoints. Best performance for DSP operations and deep learning models.  
**Install:** Pre-installed on most systems. Verify: `python3 --version`

### Node.js 20 LTS
**Role:** Frontend application server (Next.js), WebSocket client, real-time audio visualization  
**Why:** Unified runtime for Next.js. LTS = stable during demo. Native performance for UI updates during processing.  
**Install:** `nvm install 20 && nvm use 20`

---

## Backend / Processing

### FastAPI 0.111+
**Role:** REST API server for upload, processing, results endpoints. WebSocket server for real-time spectrogram streaming and noise reduction progress updates.  
**Why:** Native async/await for long-running audio processing. Auto-generates OpenAPI docs. WebSocket support for live feedback during 10-30 second processing windows.  
**Install:** `pip install "fastapi[standard]"`

### uvicorn 0.29+
**Role:** ASGI server running FastAPI. Handles concurrent upload/processing requests.  
**Install:** Bundled with `fastapi[standard]`

### Celery 5.4+ or asyncio
**Role:** Task queue for long-running audio processing jobs (5-30 second chunks depending on noise complexity).  
**Why:** Celery for distributed processing if needed, or pure asyncio for single-server hackathon demo. Don't block the main thread during spectral subtraction or deep learning inference.  
**Install:** `pip install celery` (optional) or use native asyncio

### PyYAML 6.0+
**Role:** Configuration file parsing for noise profiles, filter parameters, ML model selection.  
**Why:** Clean YAML config files instead of hardcoded Python dicts. Easy for judges to tweak parameters.  
**Install:** `pip install pyyaml`

---

## Audio & ML Libraries

### librosa 0.10+
**Role:** Audio I/O, waveform loading, STFT (Short-Time Fourier Transform), mel-spectrogram generation, harmonic-percussive source separation (HPSS), chroma features for elephant call detection.  
**Why:** Standard audio analysis library. STFT is core to spectral subtraction. HPSS isolates elephant rumbles (harmonic) from noise (percussive). MFCCs for feature extraction.  
**Install:** `pip install librosa`

### soundfile 0.12+
**Role:** High-fidelity audio file I/O (WAV, FLAC, OGG). Reads 44+ elephant recordings, writes cleaned output.  
**Why:** Handles multi-format input. Maintains audio quality — elephant calls are fragile at low frequencies.  
**Install:** `pip install soundfile`

### scipy 1.13+
**Role:** Signal processing: spectral subtraction algorithm, Butterworth filtering (high-pass 5Hz to remove DC, low-pass 1200Hz to remove ultrasonic noise), Wiener filtering fallback.  
**Why:** scipy.signal has battle-tested DSP kernels. Fast C-level implementation for real-time feel even on laptops.  
**Install:** `pip install scipy`

### noisereduce 3.0+
**Role:** Stateful noise reduction library. Learns noise profile from silent sections, applies spectral gating.  
**Why:** Fast, single-dependency noise gate. Good baseline for comparison. Easy to integrate; handles the "remove background hum" case well.  
**Install:** `pip install noisereduce`

### PyTorch 2.2+ + torchaudio 2.2+
**Role:** Deep learning model inference. Demucs or U-Net for advanced noise removal. Real-time STFT with GPU acceleration if available.  
**Why:** Demucs (trained on music) shows strong performance on elephant calls + noise (both are "sources"). U-Net is faster on CPU. torch.jit for export/mobile if needed.  
**Install:** `pip install torch torchaudio` (CPU: 100MB; GPU: 2.5GB — CPU is fine for demo)

### numpy 1.26+
**Role:** Array operations: spectrogram normalization, noise floor estimation, energy thresholding, signal reconstruction from STFT bins.  
**Why:** Fast vectorized math. Essential for processing 44 recordings × 212 calls in real time.  
**Install:** `pip install numpy`

### matplotlib 3.8+
**Role:** Server-side spectrogram image generation. Before/after spectrograms sent to frontend as PNG images.  
**Why:** Judges want to SEE the spectral difference. Matplotlib is lightweight and produces print-quality plots fast.  
**Install:** `pip install matplotlib`

---

## Frontend

### Next.js 14 (App Router)
**Role:** Full application framework. Upload form, real-time processing status, before/after spectrogram display, audio playback controls.  
**Why:** Server-side rendering for fast initial load. API route proxying to FastAPI. File-based routing for clean structure.  
**Install:** `npx create-next-app@14 echofield --ts --tailwind --app`

### React 18
**Role:** Component framework for upload UI, playback controls, parameter tuning sliders, processing progress bar.  
**Why:** Hooks for state management. Integrates seamlessly with Next.js and audio libraries.  
**Install:** Included with Next.js setup

### Tailwind CSS 3.4 + shadcn/ui
**Role:** Styling framework. Dark theme for spectrogram contrast. Component library for cards, buttons, sliders, progress indicators.  
**Why:** Rapid iteration. shadcn/ui provides accessible, polished UI elements with zero config.  
**Install:** Included with Next.js setup. shadcn: `npx shadcn-ui@latest init`

### WaveSurfer.js 7.4+
**Role:** Interactive waveform visualization for uploaded and cleaned audio. Play/pause, seek, zoom into call regions.  
**Why:** Lightweight, no canvas complexity. Real-time drawing. Works in browser without extra backend calls.  
**Install:** `npm install wavesurfer.js`

### Plotly.js 2.27+ or D3.js 7.9+
**Role:** Interactive spectrogram visualization. Hover tooltips showing frequency/time. Zoom into specific call regions.  
**Why:** Plotly for quick heatmaps; D3 for full control if time permits. Judges want to inspect the "before" and "after" spectrograms side-by-side.  
**Install:** `npm install plotly.js` or `npm install d3`

### Framer Motion 11+
**Role:** Smooth transitions during file upload, processing spinner, spectrogram fade-in animations.  
**Why:** Declarative React animation. Makes the demo feel polished and fast-paced.  
**Install:** `npm install framer-motion`

### Howler.js 2.2+
**Role:** Cross-browser audio playback with volume, playback rate, seek controls.  
**Why:** Beats the native HTML5 <audio> tag — better compatibility, progress event callbacks, fade in/out for demo smoothness.  
**Install:** `npm install howler`

---

## ML Approach Recommendation

### Recommended: Hybrid Spectral + Deep Learning

For a 36-hour hackathon with 44 recordings and 212 calls, a **hybrid approach** wins:

1. **Phase 1: Fast Spectral Subtraction (2-3 seconds per call)**
   - Compute STFT of input audio.
   - Estimate noise floor from silent regions (first 0.5s) or user-selected noise-only section.
   - Subtract noise spectrum (scaled by aggressiveness factor: 1.0-5.0).
   - Apply spectral gating: zero out bins below noise floor threshold.
   - Reconstruct audio via inverse STFT.
   - **Pro:** Fast, deterministic, interpretable, no model download.
   - **Con:** Leaves musical noise artifacts, doesn't separate overlapping frequencies well.

2. **Phase 2: Deep Learning Enhancement (5-10 seconds per call, optional)**
   - If time permits: run inference through Demucs or lightweight U-Net (pre-trained on music/speech separation).
   - Feed Phase 1 output as input to neural network.
   - Network learns to refine spectral subtraction, remove remaining artifacts.
   - **Pro:** Better quality, fewer artifacts, professional result.
   - **Con:** Slower, requires model download (~50MB for Demucs).

3. **Demo Flow:**
   - Upload 44.1kHz .wav (elephant recording with airplane noise overlay).
   - Show original waveform and spectrogram (0-1000Hz band highlighted).
   - Click "Remove Noise" → spectral subtraction runs in <3s.
   - Show intermediate (cleaner) waveform and spectrogram.
   - Offer "Enhance with AI" toggle → Demucs runs in parallel.
   - Display final cleaned audio, before/after spectrograms side-by-side.
   - Play both versions for judges to hear the difference.

4. **Why Not Pure Deep Learning?**
   - Model download + GPU inference = 15-30s per call. Too slow for live demo.
   - iMasons judges (data center folks) respect traditional DSP. Spectral subtraction is a known technique.

5. **Why Not Pure Spectral Subtraction?**
   - Artifacts (musical noise) are audible. Judges will notice.
   - Deep learning removes these artifacts — shows sophistication.

**Recommended tech choices:**
- Use `scipy.signal` for spectral subtraction (fast, no dependencies).
- Use `noisereduce` as fallback (if scipy approach breaks).
- Optional: `demucs` pre-trained model (via `torchaudio`) for Phase 2 enhancement.
- Use `librosa` HPSS to isolate harmonic elephant rumbles before applying subtraction.

---

## External Tools & Prior Art

### Reference Implementations (Not Dependencies)
These are mentioned in the challenge brief as examples; **do not depend on them** (they are proprietary SaaS):

- **Audacity** (free, open-source): Manual spectral editing. Shows judges what "professional" noise removal looks like.
- **Veed.io, Lalal.ai**: AI noise removal SaaS. Show that EchoField achieves similar quality at hackathon speed.
- **Descript, Adobe Audition**: Professional DAWs. Confirm we're solving a real problem.

---

## Development Tools

### TypeScript 5.4+
**Role:** Type safety for frontend. Prevents bugs during rapid development.  
**Install:** Included with Next.js setup

### ESLint + Prettier
**Role:** Frontend code quality and formatting.  
**Install:** Included with Next.js setup

### pytest 8.0+
**Role:** Unit tests for spectral subtraction algorithm, noise floor estimation, spectrogram generation.  
**Install:** `pip install pytest pytest-asyncio`

### SoX (Sound eXchange)
**Role:** Command-line audio processing for test data preparation, format conversion, resampling.  
**Why:** Useful for batch-processing the 44 recordings before hackathon.  
**Install:** `brew install sox` (macOS) or `apt-get install sox` (Linux)

---

## Deployment

### Vercel (Frontend)
**Role:** Hosts the Next.js application. Free tier. Automatic HTTPS.  
**Why:** Next.js is built by Vercel — zero config deployment. Instant preview URLs.  
**Setup:** `vercel` CLI or GitHub integration

### Railway or Render (Backend)
**Role:** Hosts the FastAPI backend. Free tier. HTTPS included.  
**Why:** Simple Python deployment. Environment variable management. Handles long-running requests.  
**Setup:** `railway up` or push to GitHub → auto-deploy

---

## Full Install Script

```bash
#!/bin/bash
# EchoField — Full Development Setup

# System dependencies (macOS)
brew install sox libsndfile  # for audio processing

# Python dependencies
pip install "fastapi[standard]" librosa soundfile scipy noisereduce torch torchaudio numpy matplotlib pytest pytest-asyncio pyyaml --break-system-packages

# Frontend
cd frontend
npm install
cd ..

# shadcn/ui initialization
cd frontend && npx shadcn-ui@latest init && cd ..

# Verify
python3 -c "import librosa, soundfile, scipy, torch, matplotlib; print('All Python deps OK')"
node -v
echo "EchoField dev environment ready."
```

---

## Version Lock (requirements.txt)

```
fastapi[standard]>=0.111.0
librosa>=0.10.0
soundfile>=0.12.0
scipy>=1.13.0
noisereduce>=3.0.0
torch>=2.2.0
torchaudio>=2.2.0
numpy>=1.26.0
matplotlib>=3.8.0
pyyaml>=6.0.0
pytest>=8.0.0
pytest-asyncio>=0.23.0
```

## Version Lock (package.json dependencies)

```json
{
  "dependencies": {
    "next": "^14.2.0",
    "react": "^18.3.0",
    "react-dom": "^18.3.0",
    "wavesurfer.js": "^7.4.0",
    "plotly.js": "^2.27.0",
    "framer-motion": "^11.0.0",
    "howler": "^2.2.0"
  },
  "devDependencies": {
    "typescript": "^5.4.0",
    "tailwindcss": "^3.4.0",
    "eslint": "^8.57.0",
    "prettier": "^3.2.0",
    "@types/react": "^18.3.0"
  }
}
```

---

## Technology Decision Log

| Decision | Options Considered | Chosen | Why |
|----------|-------------------|--------|-----|
| Noise removal | Pure spectral, pure deep learning, hybrid | Hybrid (spectral + optional DL) | Fast spectral for demo, optional Demucs for quality polish |
| Spectral subtraction library | scipy.signal, librosa's built-in, custom | scipy.signal | Fast C-level DSP, well-tested, zero overhead |
| Deep learning framework | PyTorch, TensorFlow, ONNX | PyTorch + Demucs | Pre-trained Demucs model readily available, good CPU inference |
| Waveform visualization | WaveSurfer, Tone.js, custom Canvas | WaveSurfer.js | Lightweight, real-time, no framework overhead |
| Spectrogram display | Plotly, D3, custom matplotlib | Plotly.js (fallback matplotlib server-side) | Interactive heatmap, hover tooltips, fast render |
| Audio playback | HTML5 audio, Howler, Tone.js | Howler.js | Better controls, cross-browser, fade effects for polish |
| Backend framework | FastAPI, Flask, Express | FastAPI | Async by default, WebSocket support for real-time progress |
| Frontend framework | Next.js, Remix, Vite | Next.js 14 | SSR for fast load, API routes, file-based routing |
| Styling | Tailwind, Material-UI, Chakra | Tailwind + shadcn/ui | Rapid iteration, copy-paste components, no bundle bloat |
| Deployment | Vercel+Railway, AWS, Heroku | Vercel + Railway | Free tier, instant deploy, zero config for Next.js |

---

*Last updated: April 11, 2026*
