# EchoField — System Architecture

Real-time elephant vocalization enhancement and noise removal platform for bioacoustic research. Processes 44 field recordings (212 calls) by classifying background noise (airplanes, cars, generators) and applying hybrid spectral+deep-learning removal while preserving infrasonic content (10–20 Hz fundamental, harmonics to 1000 Hz).

---

## High-Level Architecture

```
┌─────────────────────────────────────────────────────────────────────┐
│                         BROWSER (React/Next.js)                      │
│                                                                      │
│  ┌──────────────────┐ ┌───────────────────┐ ┌────────────────────┐  │
│  │  Upload Manager  │ │ Spectrogram View  │ │ Research Export    │  │
│  │  (batch select,  │ │ (real-time        │ │ (CSV, WAV,         │  │
│  │   drag-drop)     │ │  processing bars) │ │  PDF report)       │  │
│  └───────┬──────────┘ └────────┬──────────┘ └────────┬───────────┘  │
│          │                     │                      │             │
│          └─────────────────────┴──────────────────────┘             │
│                              │                                       │
│                              │ WebSocket                            │
│                              ▼                                       │
│                     Next.js API Routes                               │
│                     (proxy to FastAPI)                                │
└──────────────────────────────┬───────────────────────────────────────┘
                               │ HTTP/WebSocket
                               ▼
┌──────────────────────────────────────────────────────────────────────┐
│                       BACKEND (FastAPI :8000)                        │
│                                                                      │
│  ┌───────────────────────────────────────────────────────────────┐   │
│  │                      ORCHESTRATOR                              │   │
│  │  Routes upload/processing requests to appropriate agent        │   │
│  └──┬──────────┬──────────┬──────────┬──────────┬────────────────┘   │
│     │          │          │          │          │                    │
│     ▼          ▼          ▼          ▼          ▼                    │
│  ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌───────────┐ │
│  │ INGESTION│ │SPECTRO   │ │ NOISE    │ │ REMOVAL  │ │ QUALITY   │ │
│  │ AGENT    │ │GENERATOR │ │CLASSIFY  │ │ PIPELINE │ │ ASSESSMENT│ │
│  │(validate,│ │(librosa) │ │AGENT     │ │(spectral+│ │(SNR, PESQ)│ │
│  │ segment) │ │(STFT)    │ │(ML model)│ │ DL)      │ │           │ │
│  └──┬───────┘ └──┬───────┘ └──┬───────┘ └──┬──────┘ └─┬─────────┘ │
│     │            │             │            │          │           │
│     └────────────┼─────────────┼────────────┼──────────┘           │
│                  ▼             │            │                      │
│  ┌───────────────────────────────────────────────────────────────┐   │
│  │                  EXPORT AGENT                                  │   │
│  │  (CSV metadata, WAV files, PDF report + spectrograms)          │   │
│  └───────────────────────────────────────────────────────────────┘   │
│                                                                      │
│  ┌───────────────────────────────────────────────────────────────┐   │
│  │                       DATA LAYER                               │   │
│  │                                                                │   │
│  │  ┌──────────────────────┐ ┌──────────────────────────────┐    │   │
│  │  │  Raw Audio Storage   │ │ Processing Metadata DB       │    │   │
│  │  │  (44 WAV files)      │ │ (call metadata, noise labels)│    │   │
│  │  └──────────────────────┘ └──────────────────────────────┘    │   │
│  │                                                                │   │
│  │  ┌──────────────────────┐ ┌──────────────────────────────┐    │   │
│  │  │ Processed Audio      │ │ Noise Classifier Model       │    │   │
│  │  │ Cache (WAV outputs)  │ │ (TensorFlow/PyTorch weights)│    │   │
│  │  └──────────────────────┘ └──────────────────────────────┘    │   │
│  │                                                                │   │
│  │  ┌──────────────────────┐ ┌──────────────────────────────┐    │   │
│  │  │ Spectrograms Cache   │ │ Research Parameters          │    │   │
│  │  │ (PNG for UI)         │ │ (noise type frequencies,     │    │   │
│  │  │                      │ │  elephant call frequencies)  │    │   │
│  │  └──────────────────────┘ └──────────────────────────────┘    │   │
│  │                                                                │   │
│  └───────────────────────────────────────────────────────────────┘   │
│                                                                      │
│  ┌───────────────────────────────────────────────────────────────┐   │
│  │                  ML MODEL INFERENCE                            │   │
│  │  ├─ Noise Type Classifier (airplane/car/generator/other)      │   │
│  │  ├─ Elephant Call Detector (presence/confidence)              │   │
│  │  └─ Denoising Autoencoder (spectral enhancement)              │   │
│  └───────────────────────────────────────────────────────────────┘   │
│                                                                      │
└──────────────────────────────────────────────────────────────────────┘
```

---

## Agent/Module Specifications

### Agent 1: Audio Ingestion Module

**Responsibility:** Accept uploaded audio files, validate format and duration, segment long recordings into callable units, extract basic metadata, and emit ready-for-processing signals.

**Lifecycle:**
```
ON UPLOAD (batch or single file):
  → Validate: is WAV/MP3/FLAC format
  → Validate: is mono or stereo (convert stereo → mono if needed)
  → Validate: sample rate >= 44.1 kHz (required for elephant calls)
  → Validate: file size < 500 MB (single file limit)
  → if validation fails: emit VALIDATION_ERROR event, return user-friendly message
  → Load audio using librosa.load(sr=44100) — resample if needed
  → Extract basic metadata: duration (sec), sample_rate, channels
  → if duration > 120 sec: auto-segment into overlapping 60-sec windows (50% overlap)
    for better edge handling during noise removal
  → Create audio_id (UUID), store in metadata DB
  → Emit INGESTION_COMPLETE event with audio_id, segment_count
  → Notify orchestrator: ready for spectrogram generation
```

**Internal State:**
```python
@dataclass
class AudioSegment:
    segment_id: str                    # UUID
    audio_id: str                      # Parent recording ID
    segment_index: int                 # 0, 1, 2, ... (for ordering)
    audio_data: np.ndarray             # Raw waveform (numpy array, mono, 44.1 kHz)
    duration_sec: float                # Segment duration in seconds
    sample_rate: int                   # 44100 Hz
    metadata: dict                     # {"filename", "source_location", "date", ...}
    processing_status: str             # "pending" | "analyzing" | "complete" | "error"
    noise_labels: list[str]            # ["airplane", "car"] (user provided, optional)
    
@dataclass
class IngestionResult:
    audio_id: str
    filename: str
    total_duration_sec: float
    segment_count: int
    sample_rate: int
    validated: bool
    error_msg: str = None
```

**Events Emitted:**
- `INGESTION_COMPLETE` — audio validated and segmented, ready for analysis
- `INGESTION_ERROR` — validation failed (format, duration, sample rate)
- `BATCH_QUEUED` — multiple files queued, total segment count, ETA

---

### Agent 2: Spectrogram Generator

**Responsibility:** Convert raw waveforms to spectrograms and mel-spectrograms using librosa STFT. Produce both high-resolution (for ML) and visualization-friendly (for UI) versions. Emit spectrogram data for real-time frontend display.

**Lifecycle:**
```
ON REQUEST (audio_segment):
  → Load audio_segment.audio_data
  → Apply pre-emphasis filter: y_emphasized = y - 0.97 * y[t-1]
    (boosts high frequencies where elephant calls and environmental noise live)
  → Compute STFT with:
      - n_fft=2048 (hop_length=512)
      - window='hann'
      - Frequency resolution: 44100 / 2048 ≈ 21.5 Hz per bin
      - Time resolution: 512 / 44100 ≈ 11.6 ms per frame
  → Compute magnitude spectrogram: |STFT|^2 in dB
  → Compute mel-spectrogram: 128 mel bands (0–22 kHz), log-scaled
    (emphasizes perceptual similarity, good for ML model input)
  → Normalize: subtract mean, divide by std dev per segment
  → Generate visualization PNG (256x256 pixels, viridis colormap)
    - Frequency axis: 0–1000 Hz (elephant calls + noise)
    - Time axis: full segment duration
  → Store spectrogram (numpy binary), visualization (PNG)
  → Emit SPECTROGRAM_READY event with visualization URL
```

**Internal State:**
```python
@dataclass
class Spectrogram:
    segment_id: str
    stft: np.ndarray                   # Complex STFT (freq, time)
    magnitude_db: np.ndarray           # Magnitude in dB (freq, time)
    mel_spectrogram: np.ndarray        # Mel-scaled (128, time)
    frequencies: np.ndarray            # Frequency bins (Hz)
    times: np.ndarray                  # Time frames (sec)
    n_fft: int = 2048
    hop_length: int = 512
    mel_bands: int = 128
    
@dataclass
class SpectrogramViz:
    segment_id: str
    png_data: bytes                    # PNG visualization (256x256)
    url: str                           # /cache/spectrograms/{segment_id}.png
    freq_range: tuple = (0, 1000)      # Hz
```

**Events Emitted:**
- `SPECTROGRAM_READY` — STFT computed, visualization available
- `SPECTROGRAM_PROGRESS` — {frame_index}/{total_frames} for real-time UI feedback

---

### Agent 3: Noise Classification Agent

**Responsibility:** Classify background noise type (airplane, car, generator, other) using a pre-trained TensorFlow/PyTorch model. Emit noise masks for downstream removal.

**Lifecycle:**
```
ON REQUEST (segment_id, mel_spectrogram):
  → Load pre-trained classifier model (TensorFlow frozen graph or ONNX)
  → Preprocess: crop/pad mel-spectrogram to (128, 128) if needed
  → Forward pass: model.predict(mel_spectrogram) → logits
  → Softmax: [airplane_prob, car_prob, generator_prob, other_prob]
  → Determine primary noise class: argmax(logits)
  → if max_prob < 0.5: classify as "unknown" (too uncertain)
  → Compute frame-level confidence using sliding window:
      - 128 overlapping windows per spectrogram
      - Each window: 128 mel bands × 50 frames
      - Confidence per frame: measure of consistent label across overlaps
  → Threshold confidence at 0.6 (only confident predictions → noise mask)
  → Emit NOISE_CLASSIFIED event with class, confidence, frame-level mask
```

**Internal State:**
```python
@dataclass
class NoiseClassification:
    segment_id: str
    primary_noise_class: str           # "airplane" | "car" | "generator" | "unknown"
    class_probabilities: dict          # {"airplane": 0.87, "car": 0.09, ...}
    confidence_per_frame: np.ndarray   # Shape (n_frames,), 0-1
    noise_mask: np.ndarray             # Binary mask (n_frames,), 1 = noise present
    # Metadata for removal pipeline
    dominant_frequencies: list[float]  # Hz (e.g., [60, 120, 180] for generator hum)
    frequency_bandwidth: tuple         # (min_hz, max_hz)
    
@dataclass
class NoiseProfile:
    noise_class: str
    sample_spectrogram: np.ndarray     # Characteristic spectro of this class
    # Pre-computed profiles in data layer
```

**Model Architecture (Pre-trained, Included):**
```
Input: (128, 128, 1) mel-spectrogram
├─ Conv2D(64, 3×3) → ReLU → MaxPool 2×2
├─ Conv2D(128, 3×3) → ReLU → MaxPool 2×2
├─ Conv2D(256, 3×3) → ReLU → MaxPool 2×2
├─ GlobalAveragePool
├─ Dense(256) → ReLU → Dropout(0.3)
└─ Dense(4) → Softmax   [airplane, car, generator, other]

Trained on ESC-50 (Environmental Sound Classification) + custom elephant field labels.
Inference time: ~10 ms per spectrogram on CPU.
```

**Events Emitted:**
- `NOISE_CLASSIFIED` — noise type determined, mask computed
- `NOISE_CLASSIFICATION_UNCERTAIN` — confidence < 0.5, flag for manual review

---

### Agent 4: Noise Removal Pipeline

**Responsibility:** Remove classified noise while preserving elephant calls. Two-stage hybrid approach: (1) spectral gating (magnitude suppression in noise-dominant regions), (2) learned denoising via autoencoder.

**Lifecycle:**
```
ON REQUEST (segment_id, mel_spectrogram, noise_classification):
  → STAGE 1: SPECTRAL GATING
    → Use noise_classification.noise_mask to identify noise-heavy time-frequency bins
    → Compute noise power spectrum from low-confidence regions (confidence < 0.5)
    → Apply spectral subtraction:
        S_clean(f,t) = S_original(f,t) - α * S_noise(f,t)
        where α = 2.0 (subtraction factor, prevents over-suppression)
    → Soft mask using smoothed noise confidence:
        mask(f,t) = 1.0 - 0.8 * confidence_per_frame[t]
    → Apply to mel-spectrogram: mel_gated = mel_original * mask(f,t)
    → Preserve infrasonic region (0–50 Hz) unmodified (high elephant rumble presence)
    → Emit GATING_COMPLETE event with intermediate output

  → STAGE 2: DEEP LEARNING DENOISING (if noise_class is confident)
    → Load pre-trained denoising autoencoder (ONNX model)
    → Input: mel_gated (output from stage 1)
    → Forward pass: autoencoder.encode(mel_gated) → latent → decode()
    → Output: mel_cleaned (reconstructed, low-frequency noise attenuated)
    → Blend with gated output: mel_final = 0.6 * mel_gated + 0.4 * mel_cleaned
      (conservative blend preserves elephant call energy)
    → Emit DENOISING_COMPLETE event

  → STAGE 3: CONVERT BACK TO WAVEFORM
    → Inverse mel-scale: magnitude_db_cleaned = mel2mag(mel_final)
    → Reconstruct phase from original STFT (phasogram):
        STFT_cleaned = magnitude_cleaned * exp(j * phase_original)
    → Inverse STFT: audio_cleaned = istft(STFT_cleaned)
    → Apply fade-in/fade-out at segment boundaries (10 ms each) for smooth joins
    → Emit AUDIO_CLEANED event with cleaned waveform

  → STAGE 4: QUALITY CHECK (internal loop)
    → Compute SNR (signal-to-noise ratio) before/after
    → if SNR_after < SNR_before - 2 dB: something went wrong, retry with α=1.5
    → if stable: finalize and emit to Quality Assessment Agent
```

**Internal State:**
```python
@dataclass
class DenoiserState:
    segment_id: str
    mel_original: np.ndarray           # Original mel-spectrogram
    mel_gated: np.ndarray              # After spectral gating stage
    mel_cleaned: np.ndarray            # After autoencoder stage
    audio_original: np.ndarray         # Original waveform
    audio_cleaned: np.ndarray          # Cleaned waveform
    processing_log: list[str]          # Timestamped actions for debugging
    noise_mask: np.ndarray             # Noise regions identified
    snr_before: float                  # dB
    snr_after: float                   # dB
    preservation_ratio: float          # % of elephant call energy preserved
    
@dataclass
class RemovalResult:
    segment_id: str
    audio_cleaned: np.ndarray
    audio_original: np.ndarray
    snr_improvement: float             # dB (after - before)
    processing_time_ms: float
    stages_applied: list[str]          # ["gating", "autoencoder", ...]
    quality_score: float               # 0-100
```

**Denoising Autoencoder (Pre-trained):**
```
Encoder:
├─ Conv2D(32, 4×4, stride=2) → ReLU → BatchNorm
├─ Conv2D(64, 4×4, stride=2) → ReLU → BatchNorm
├─ Conv2D(128, 4×4, stride=2) → ReLU → BatchNorm
└─ Flatten → Dense(256)

Latent: 256-dim bottleneck

Decoder:
├─ Dense(256) → ReLU
├─ Reshape → (16, 16, 128)
├─ TransposeConv2D(64, 4×4, stride=2) → ReLU → BatchNorm
├─ TransposeConv2D(32, 4×4, stride=2) → ReLU → BatchNorm
└─ TransposeConv2D(1, 4×4, stride=2) → Sigmoid

Trained on paired data: (noisy elephant call, clean elephant call).
Loss: L2 (MSE) + perceptual loss (emphasis on 10–1000 Hz band).
Inference time: ~20 ms per spectrogram on CPU.
```

**Events Emitted:**
- `GATING_COMPLETE` — spectral gating applied
- `DENOISING_COMPLETE` — autoencoder applied
- `AUDIO_CLEANED` — waveform reconstructed
- `QUALITY_WARNING` — SNR degradation detected

---

### Agent 5: Quality Assessment Module

**Responsibility:** Measure output quality using SNR, PESQ, frequency-domain metrics. Flag suspect results for manual review.

**Lifecycle:**
```
ON REQUEST (audio_original, audio_cleaned):
  → METRIC 1: Signal-to-Noise Ratio (SNR)
    → Estimate noise floor from spectrogram (percentile 10 of magnitude)
    → SNR_dB = 10 * log10(signal_power / noise_power)
    → Compute before and after: SNR_improvement = SNR_after - SNR_before

  → METRIC 2: Perceptual Evaluation of Speech Quality (PESQ)
    → Use librosa's pesq-like approximation (cross-correlation in mel-domain)
    → or call external pesq library (if available)
    → Score 0-4.5 (higher = more similar to reference)
    → For elephant calls: compute against oracle "clean" call if available, else self-reference

  → METRIC 3: Frequency Response
    → FFT of original and cleaned audio (1-second snapshots)
    → Compute energy ratio in elephant call band (10–1000 Hz) before/after
    → energy_preservation = energy_after / energy_before
    → Flag if < 0.8 (too much elephant energy removed)

  → METRIC 4: Spectral Distortion
    → Compare magnitude spectrogram before/after
    → Measure L2 distance in log-mel domain
    → Normalize by original energy
    → distortion_score = 1 - (norm_distance / reference_scale)

  → Aggregate into quality_score (0–100):
    quality_score = (
      0.4 * (SNR_improvement / 10) * 100 +  # up to 40 points for SNR
      0.3 * (PESQ / 4.5) * 100 +            # up to 30 points for PESQ
      0.2 * (energy_preservation) * 100 +   # up to 20 points for preservation
      0.1 * (1 - distortion_score) * 100    # up to 10 points for low distortion
    )

  → if quality_score < 60: emit QUALITY_ALERT (flag for manual review)
  → Emit QUALITY_ASSESSMENT_COMPLETE event with all metrics
```

**Internal State:**
```python
@dataclass
class QualityMetrics:
    segment_id: str
    snr_before: float                  # dB
    snr_after: float                   # dB
    snr_improvement: float             # dB
    pesq_score: float                  # 0-4.5
    energy_preservation: float         # 0-1.0 (ratio of preserved elephant call energy)
    spectral_distortion: float         # 0-1.0 (lower = less distortion)
    quality_score: float               # 0-100 (aggregate)
    quality_rating: str                # "excellent" | "good" | "fair" | "poor"
    processing_time_ms: float
    notes: str                         # Human-readable assessment
    
@dataclass
class QualityReport:
    segment_id: str
    metrics: QualityMetrics
    recommendation: str                # "use" | "manual_review" | "reject"
    researcher_notes: str              # For export
```

**Events Emitted:**
- `QUALITY_ASSESSMENT_COMPLETE` — metrics computed
- `QUALITY_ALERT` — score < 60, flag for review
- `QUALITY_PASS` — score >= 80, safe to export

---

### Agent 6: Research Export Module

**Responsibility:** Compile results into three export formats: CSV metadata, WAV audio files, PDF report with spectrograms and findings.

**Lifecycle:**
```
ON REQUEST (batch of processed segments):
  → FORMAT 1: CSV METADATA
    → Create rows for each segment:
        | segment_id | filename | duration | noise_class | snr_before | snr_after |
        | quality_score | researcher_notes | processed_file_path | ...
    → Export to CSV (tab-delimited, UTF-8)
    → Save to: /exports/{batch_id}_metadata.csv

  → FORMAT 2: WAV AUDIO FILES
    → For each segment with quality_score >= 60:
        → Convert cleaned audio back to 44.1 kHz, 16-bit PCM
        → Write to WAV with metadata tags (RIFF INFO chunk):
            - INAME: original filename
            - IARTIST: ElephantVoices dataset
            - ICMT: noise class, SNR improvement, processing timestamp
        → Save to: /exports/{batch_id}/{segment_id}_cleaned.wav
    → For rejected segments: skip or save separately

  → FORMAT 3: PDF REPORT
    → Gather all spectrograms (before/after side-by-side)
    → For each segment in batch:
        → Before spectrogram (left): original mel-spec, marked noise regions
        → After spectrogram (right): cleaned mel-spec, annotated frequency preservation
        → Metrics card: SNR, quality_score, processing time
        → Researcher notes: noise class, confidence, any warnings
    → Summary page:
        → Total segments processed: N
        → Average quality_score: X%
        → Noise classes encountered: [airplane: 12, car: 8, generator: 5, other: 19]
        → Recommended for publication: Y segments (quality >= 80)
    → Render using Jinja2 + WeasyPrint
    → Save to: /exports/{batch_id}_report.pdf

  → Create manifest JSON:
    → {
        batch_id, timestamp, file_count, total_duration_sec,
        avg_quality_score, export_paths: {csv, wavs, pdf}
      }
    → Emit EXPORT_COMPLETE event with manifest URL

  → Cleanup: remove temporary spectrograms and intermediate files
```

**Internal State:**
```python
@dataclass
class ExportManifest:
    batch_id: str
    created_at: datetime
    segment_count: int
    total_duration_sec: float
    avg_quality_score: float
    csv_path: str
    wav_dir: str
    pdf_path: str
    export_formats: list[str]  # ["csv", "wav", "pdf"]
    
@dataclass
class ExportResult:
    success: bool
    manifest: ExportManifest
    file_urls: dict              # {"csv": "...", "pdf": "...", "wavs_zip": "..."}
    message: str
```

**Events Emitted:**
- `EXPORT_PROGRESS` — CSV ready, WAVs being written, etc.
- `EXPORT_COMPLETE` — all files ready, download links available
- `EXPORT_ERROR` — disk space issue, permissions, etc.

---

## Data Flow: Audio Processing Pipeline

```
Time 0ms:    User selects 44 files (5–10 MB each)
             → POST /api/upload (batch upload)

Time 100ms:  Ingestion Agent receives batch
             → Validates all files in parallel
             → Total 212 calls across files
             → Segments long recordings into overlapping windows
             → Creates audio_id for each segment
             → Emits INGESTION_COMPLETE

Time 100ms:  Frontend receives INGESTION_COMPLETE
             → UI shows upload summary: "212 calls ready for analysis"

Time 150ms:  Orchestrator dispatches all segments to Spectrogram Generator
             → Parallel processing: 4-8 segments at once (CPU bound)
             → Each segment: STFT → mel-spectrogram → PNG visualization
             → Emit SPECTROGRAM_READY for each as complete

Time 150ms–500ms:  Frontend receives SPECTROGRAM_READY events (streaming)
             → Real-time update: "Processing spectrograms... 45/212 complete"
             → Display thumbnail of each spectrogram as it arrives

Time 500ms:  All spectrograms ready
             → Orchestrator dispatches all to Noise Classification Agent
             → Parallel: batch inference with pre-trained model
             → Each segment: classify noise class + frame-level mask
             → Emit NOISE_CLASSIFIED for each

Time 500–1200ms: Noise Classification Agent processes all segments
             → Typical: 50% airplane, 30% car, 15% generator, 5% unclear

Time 1200ms: All segments classified
             → Orchestrator dispatches to Noise Removal Pipeline
             → Parallel: spectral gating (fast) + autoencoder (slower)
             → Each segment: stage 1 (gating), stage 2 (autoencoder), stage 3 (iSTFT)
             → Emit AUDIO_CLEANED for each

Time 1200–3000ms: Removal Pipeline processes all segments (bottleneck)
             → Average 10–15 ms per segment
             → 212 segments × 15 ms ÷ 8 workers ≈ ~400 ms total

Time 3000ms: All segments denoised
             → Orchestrator dispatches to Quality Assessment Module
             → Parallel: compute SNR, PESQ, energy preservation
             → Aggregate into quality_score per segment

Time 3100ms: Quality metrics ready
             → Emit QUALITY_ASSESSMENT_COMPLETE

Time 3100ms: Orchestrator dispatches to Research Export Module
             → Compile CSV metadata from all QualityMetrics
             → Write WAV files (segments with quality >= 60)
             → Render PDF with spectrograms + metrics

Time 3100–4000ms: Export processing
             → PDF rendering (Jinja2 + WeasyPrint) is slowest: ~900 ms
             → CSV: ~50 ms
             → WAV writing: ~500 ms

Time 4000ms: EXPORT_COMPLETE event emitted
             → File URLs available: csv, pdf, wavs.zip

Time 4000ms: Frontend displays results page
             → Summary: "Processed 212 calls in 4.0 seconds"
             → Quality breakdown: [excellent: 156, good: 42, fair: 14, poor: 0]
             → Download buttons: CSV, PDF, ZIP of WAVs
```

---

## State Machine: Processing Pipeline States

```
                    ┌─────────────────────────┐
                    │      UPLOADED           │
                    │  (user selected files)  │
                    └────────────┬────────────┘
                                 │
                    ┌────────────▼────────────┐
                    │    VALIDATING           │
                    │  (format, sample rate)  │
                    └────────────┬────────────┘
                                 │
                    ┌────────────▼────────────┐
                    │    SEGMENTED            │
                    │  (overlapping windows)  │
                    └────────────┬────────────┘
                                 │
                    ┌────────────▼────────────┐
                    │  ANALYZING_SPECTRO      │
                    │  (STFT, mel-scale)      │
                    └────────────┬────────────┘
                                 │
                    ┌────────────▼────────────┐
                    │  CLASSIFYING_NOISE      │
                    │  (ML model inference)   │
                    └────────────┬────────────┘
                                 │
                    ┌────────────▼────────────┐
                    │  REMOVING_NOISE         │
                    │  (gating + autoencoder) │
                    └────────────┬────────────┘
                                 │
                    ┌────────────▼────────────┐
                    │  ASSESSING_QUALITY      │
                    │  (SNR, PESQ, metrics)   │
                    └────────────┬────────────┘
                                 │
                    ┌────────────▼────────────┐
                    │  EXPORTING              │
                    │  (CSV, WAV, PDF)        │
                    └────────────┬────────────┘
                                 │
                    ┌────────────▼────────────┐
                    │    COMPLETE             │
                    │  (download links ready) │
                    └─────────────────────────┘

ERROR STATES (from any stage):
  → VALIDATION_ERROR (format, duration, sample rate)
  → PROCESSING_ERROR (OOM, disk full, model loading failed)
  → QUALITY_ALERT (quality_score < 60, flag for review)

Transitions:
  • UPLOADED → VALIDATING (automatic on form submit)
  • VALIDATING → SEGMENTED (if valid) or VALIDATION_ERROR (if invalid)
  • All processing stages (ANALYZING_SPECTRO → CLASSIFYING_NOISE → ...) run in parallel
    but UI shows waterfall (user sees progress through each stage)
  • Any stage can raise ERROR state (caught by orchestrator, emit to frontend)
  • On ERROR: show message, offer retry or manual review
```

---

## WebSocket Protocol: Real-Time Events for UI

**Connection:**
```javascript
// Client-side
const ws = new WebSocket("ws://localhost:8000/ws/process/{batch_id}");

ws.onmessage = (event) => {
  const payload = JSON.parse(event.data);
  // Handle event.type: "progress", "spectrogram_ready", "quality_alert", etc.
};
```

**Event Payloads:**

```json
{
  "type": "INGESTION_COMPLETE",
  "batch_id": "batch_abc123",
  "segment_count": 212,
  "total_duration_sec": 3847.2,
  "timestamp": "2026-04-11T14:32:05Z"
}
```

```json
{
  "type": "SPECTROGRAM_READY",
  "segment_id": "seg_001",
  "progress": {
    "completed": 45,
    "total": 212,
    "percent": 21.2
  },
  "spectrogram_url": "/cache/spectrograms/seg_001.png"
}
```

```json
{
  "type": "NOISE_CLASSIFIED",
  "segment_id": "seg_001",
  "noise_class": "airplane",
  "confidence": 0.92,
  "dominant_frequencies": [100, 200, 300]
}
```

```json
{
  "type": "AUDIO_CLEANED",
  "segment_id": "seg_001",
  "processing_time_ms": 45,
  "snr_before": 8.2,
  "snr_after": 14.7
}
```

```json
{
  "type": "QUALITY_ASSESSMENT_COMPLETE",
  "segment_id": "seg_001",
  "quality_score": 87,
  "quality_rating": "excellent",
  "metrics": {
    "snr_improvement": 6.5,
    "pesq_score": 3.8,
    "energy_preservation": 0.94,
    "spectral_distortion": 0.12
  }
}
```

```json
{
  "type": "QUALITY_ALERT",
  "segment_id": "seg_015",
  "quality_score": 55,
  "reason": "Low energy preservation (0.72)",
  "recommendation": "manual_review"
}
```

```json
{
  "type": "EXPORT_COMPLETE",
  "batch_id": "batch_abc123",
  "summary": {
    "segments_processed": 212,
    "excellent": 156,
    "good": 42,
    "fair": 14,
    "poor": 0
  },
  "download_urls": {
    "csv": "/exports/batch_abc123_metadata.csv",
    "pdf": "/exports/batch_abc123_report.pdf",
    "wavs_zip": "/exports/batch_abc123_wavs.zip"
  }
}
```

```json
{
  "type": "ERROR",
  "batch_id": "batch_abc123",
  "stage": "REMOVING_NOISE",
  "error_msg": "Disk space low (< 100 MB remaining)",
  "recoverable": true,
  "retry_after_sec": 60
}
```

---

## Batch vs. Single-File Processing

**Batch Mode (Default):**
- User uploads 1–44 WAV files simultaneously
- Backend: creates one batch_id per upload session
- Processing: all segments from all files processed in parallel queue
- Output: single CSV, single PDF report, single ZIP of cleaned WAVs
- Ideal for hackathon demo: load 44 field recordings at once, export comprehensive report

**Single-File Mode:**
- User uploads one file
- Backend: creates one batch_id, segments if duration > 120 sec
- Processing: segments processed in queue
- Output: individual CSV + PDF + WAV (or just WAV for quick test)
- Useful for researchers testing specific recordings

**Queue Management:**
```python
@dataclass
class ProcessingQueue:
    batch_id: str
    segments: list[SegmentTask]        # Each segment is one task
    max_workers: int = 8               # Parallel workers
    priority: str = "normal"           # "normal" or "high" (demo priority)
    
    def enqueue_batch(self, segments):
        # Sort by estimated processing time (heuristic: duration + noise class)
        # Assign workers in round-robin
        # Start processing
    
    def process_segment(self, segment_task):
        # Spectro → Classify → Remove → Assess → await completion
        # Emit events to WebSocket
```

---

## Spectrogram Visualization Data Flow

**What the UI Receives:**

```
1. Raw Spectrogram (ANALYZING_SPECTRO stage):
   - PNG: 256x256 pixels, viridis colormap
   - Freq range: 0–1000 Hz (elephant calls + noise)
   - URL: /cache/spectrograms/{segment_id}_original.png
   - Sent via WebSocket: SPECTROGRAM_READY event

2. Noise Overlay (CLASSIFYING_NOISE stage):
   - Same PNG, with red box overlay on noise-heavy regions
   - Noise mask (frame-level confidence) encoded as alpha channel
   - URL: /cache/spectrograms/{segment_id}_noise_mask.png

3. Cleaned Spectrogram (REMOVING_NOISE stage):
   - PNG: cleaned mel-spectrogram
   - Same dimensions and frequency range
   - URL: /cache/spectrograms/{segment_id}_cleaned.png

4. Side-by-Side Comparison (QUALITY_ASSESSMENT stage):
   - PNG: before | after, horizontally concatenated
   - Metrics overlay: SNR before/after, quality score, processing time
   - URL: /cache/spectrograms/{segment_id}_comparison.png
```

**Frontend React Component:**
```javascript
// Receive WebSocket event
const handleSpectrogramReady = (event) => {
  const { segment_id, spectrogram_url } = event;
  
  // Fade-in animation
  setSpectrograms(prev => ({
    ...prev,
    [segment_id]: { url: spectrogram_url, isReady: true }
  }));
};

// Render grid of thumbnails
<div className="spectrogram-grid">
  {spectrograms.map(([segmentId, data]) => (
    <img
      key={segmentId}
      src={data.url}
      className={data.isReady ? "fade-in" : ""}
      onClick={() => viewFullSpectrogram(segmentId)}
    />
  ))}
</div>
```

---

## Security & Reliability Notes

**Audio Privacy:**
- All uploaded audio files stored in ephemeral `/tmp` directory
- Cleared after export generation (12-hour retention max)
- No persistent storage of user recordings
- All processing local to backend; no cloud transmission of audio

**Model Security:**
- Pre-trained models (noise classifier, autoencoder) bundled in Docker image
- No external model downloads during runtime
- ONNX format for model inference (sandboxed, no arbitrary code execution)

**Performance Targets:**
- Single file ingestion: < 100 ms
- STFT + spectrogram per segment: 5–10 ms
- Noise classification (inference): 10–15 ms per segment
- Removal pipeline (gating + autoencoder): 15–25 ms per segment
- Quality assessment: 5–10 ms per segment
- Total for 212 segments: 3–5 seconds (with 8 parallel workers)

**Failure Handling:**
- Model loading fails: fall back to spectral gating only (skip autoencoder)
- Out of memory: process segments in smaller batches sequentially
- Disk space low: pause processing, alert user, offer cleanup
- PESQ computation unavailable: use SNR + energy preservation only
- Quality < 60: flag segment but don't reject; include in export with warning

**Offline Capability:**
- All models pre-loaded at startup
- Processing is CPU-only (no internet required)
- WebSocket connection: if dropped, frontend polls `/api/batch/{batch_id}` for status

---

*Last updated: April 11, 2026*
