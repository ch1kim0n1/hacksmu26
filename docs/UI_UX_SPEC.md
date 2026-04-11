# EchoField — UI/UX Design Specification

Complete frontend design spec for elephant vocalization noise removal and research. Every visual state is a storytelling moment where noise peels away to reveal hidden elephant voices. UI/UX is the beating heart of this hackathon project — judges are non-technical, spectrograms are the language, and the demo moment must be visceral within 15 seconds.

---

## Design Language

- **Theme:** Dark mode throughout. Think nature documentary meets science lab. Warm earth tones meet cool acoustic precision.
- **Spectrogram Quality:** High-fidelity audio visualization. Spectrograms are not decoration — they are the data. Every pixel tells the story of sound.
- **Typography:** Inter (Google Font) for UI, Courier New for technical labels. Clean, modern, highly legible even on projectors.
- **Data visualization:** Before/after spectrograms are the main event. Color gradients reveal frequency intensity: deep blue (quiet) → cyan → yellow → red (loud). Acoustic properties (frequency, bandwidth, duration) are always visible alongside.
- **Interaction model:** Upload → Analyze → Observe (the magic moment as noise dissolves) → Explore → Export. Zero friction, maximum storytelling.

### Color Palette

```
Background:       #0A1A1F (deep charcoal with green tint — night savanna)
Surface:          #141E24 (card backgrounds)
Surface Elevated: #1E2A32 (hover states, panels)
Border:           #2A3A42
Text Primary:     #F0F5F8
Text Secondary:   #8B9BA5
Text Muted:       #5A6A75

Accent Teal:      #00D9FF (spectrogram highlights, interactive elements)
Success Green:    #10C876 (clean audio, removal success)
Warning Amber:    #F5A025 (processing, noise detected)
Danger Red:       #EF4444 (heavy noise, warning)
Nature Gold:      #D4AF37 (elephant theme, warmth, savanna)
Elephant Gray:    #8B8680 (secondary, grounding)

Spectrogram Low:  #0C1A2A (deep blue, quiet)
Spectrogram Mid:  #00D9FF (cyan, moderate)
Spectrogram High: #FFD700 (gold, loud)
Spectrogram Peak: #EF4444 (red, very loud)

Success Gradient: #10C876 → #22DD88 (reveals clean audio)
```

---

## Page Structure & Routes

```
/                              → Landing / Story Intro
/upload                        → Upload & Recording Library
/processing/{recording_id}     → Processing View (THE MAIN EVENT)
/call/{call_id}               → Call Analysis / Details
/database                      → Research Database (All Cleaned Calls)
/export                        → Export / Report
/about                         → About this Project, ElephantVoices
```

---

## View 1: Landing / Story Intro

### Layout

```
┌──────────────────────────────────────────────────────────────┐
│  EchoField                                    About │ Database│
├──────────────────────────────────────────────────────────────┤
│                                                              │
│               🐘 ELEPHANT VOCALIZATION                       │
│               Noise Removal & Research                       │
│                                                              │
│  "Hear what researchers hear. Remove the noise,              │
│   reveal the voice."                                         │
│                                                              │
│  ┌──────────────────────────────────────────────────────┐   │
│  │  📁 Upload Recording  │  🎵 Sample Library  │ 📊 How  │   │
│  └──────────────────────────────────────────────────────┘   │
│                                                              │
│  ┌────────────────────────────────────────────────────────┐  │
│  │ "Why This Matters"                                     │  │
│  │ 44 recordings of wild elephant family groups.          │  │
│  │ Environmental noise: trucks, rain, wind, insects.      │  │
│  │ Our AI peels away the noise — reveals individual       │  │
│  │ voices within the herd, acoustic signatures, emotion.  │  │
│  │                                                        │  │
│  │ Researchers use these cleaned calls to:                │  │
│  │ • Identify individual elephants by vocalizations      │  │
│  │ • Understand family structure and hierarchy           │  │
│  │ • Monitor herd health and stress signals              │  │
│  │ • Track migration patterns across acoustic data       │  │
│  └────────────────────────────────────────────────────────┘  │
│                                                              │
│  ┌──────────────────────────┐  ┌──────────────────────────┐  │
│  │  44 Recordings            │  │  Success Rate: 89%       │  │
│  │  Ready to Analyze         │  │  Avg Cleanup: 8.2 min    │  │
│  └──────────────────────────┘  └──────────────────────────┘  │
│                                                              │
│  ┌──────────────────────────────────────────────────────────┐  │
│  │                    [► Get Started]                       │  │
│  └──────────────────────────────────────────────────────────┘  │
│                                                              │
└──────────────────────────────────────────────────────────────┘
```

### Story Intro Section
- **Hero Message:** "Hear what researchers hear." Big, warm typography (Nature Gold `#D4AF37` accent).
- **Why This Matters:** Short narrative explaining why elephant vocalization research matters. Real-world stakes: conservation, biodiversity, family structure.
- **Visual Stats:** 44 recordings, 89% success rate, average cleanup time. Numbers are animated (counter effect) on page load.
- **Call-to-Action Buttons:**
  - `[📁 Upload Recording]` — solid green, leads to `/upload`
  - `[🎵 Sample Library]` — teal outline, shows 3 pre-loaded demo recordings
  - `[📊 How It Works]` — gray outline, scrolls to methodology below

### Methodology Section (Scrollable)
- **3-Step Flow (illustrated with text + icons):**
  1. Upload your recording (WAV, MP3, up to 30 min)
  2. AI removes background noise (rain, wind, trucks, insects)
  3. Analyze cleaned calls (spectrograms, acoustic properties, export data)
- **Real Example:** Show one before/after spectrogram thumbnail with waveforms side-by-side
- **Research Use Case:** Short quote from elephant researcher about why this matters

---

## View 2: Upload & Recording Library

### Layout

```
┌──────────────────────────────────────────────────────────────┐
│  ← Back to Home                                              │
├──────────────────────────────────────────────────────────────┤
│                                                              │
│  ┌──────────────────────────────────────────────────────┐   │
│  │ Upload New Recording                                 │   │
│  │ (Drag & drop or click)                              │   │
│  │                                                      │   │
│  │  ┌──────────────────────────────────────┐           │   │
│  │  │  Drop .wav or .mp3 here              │           │   │
│  │  │  Max 30 minutes, mono or stereo      │           │   │
│  │  │  [or click to browse]                │           │   │
│  │  └──────────────────────────────────────┘           │   │
│  │                                                      │   │
│  │  ┌─────────┬──────────────────────────────────┐     │   │
│  │  │ or use  │ [Safari] [Elephant] [Urban]      │     │   │
│  │  │ samples │ [Forest] [Waterhole] [Mixed]     │     │   │
│  │  └─────────┴──────────────────────────────────┘     │   │
│  └──────────────────────────────────────────────────────┘   │
│                                                              │
│  ┌──────────────────────────────────────────────────────┐   │
│  │ Your Recordings (Sorted by date)                     │   │
│  │                                                      │   │
│  │  ┌──────────────────────────────────────────────┐   │   │
│  │  │ safari_herd_03_20240312.wav     3.2 MB       │   │   │
│  │  │ Status: ✓ Processed (8.2 min ago)           │   │   │
│  │  │ Audio quality: Good (92%)  │ Noise level: High  │   │
│  │  │ [► Analyze] [Download] [Delete]             │   │   │
│  │  └──────────────────────────────────────────────┘   │   │
│  │                                                      │   │
│  │  ┌──────────────────────────────────────────────┐   │   │
│  │  │ waterhole_mixed_02_20240310.wav   2.8 MB     │   │   │
│  │  │ Status: ◐ Processing (currently running)    │   │   │
│  │  │ [45% complete] ▓▓▓▓░░░░░░░░░░░             │   │   │
│  │  │ Est. time remaining: 3.2 minutes            │   │   │
│  │  └──────────────────────────────────────────────┘   │   │
│  │                                                      │   │
│  │  ┌──────────────────────────────────────────────┐   │   │
│  │  │ urban_street_01_20240308.wav     4.1 MB      │   │   │
│  │  │ Status: ⚠ High Noise (Partial cleanup)      │   │   │
│  │  │ Audio quality: Fair (67%)  │ Noise level: Very High
│  │  │ [► Analyze] [Retry] [Download] [Delete]     │   │   │
│  │  └──────────────────────────────────────────────┘   │   │
│  └──────────────────────────────────────────────────────┘   │
│                                                              │
└──────────────────────────────────────────────────────────────┘
```

### Upload Section
- **Drag-and-Drop Zone:** Large drop target with icon. Accepts WAV, MP3, AIFF.
- **Sample Buttons:** Quick-load pre-processed demo recordings (Safari, Elephant, Urban, Forest, Waterhole, Mixed). Speeds up demo flow.
- **File Format Info:** Small help text showing supported formats and max duration.

### Recording Grid / Table
- **Columns:** Filename, file size, status (Processing / Processed / High Noise), audio quality %, noise level, actions
- **Status Badges:**
  - ✓ Processed (green)
  - ◐ Processing (amber, with progress bar)
  - ⚠ High Noise (red, can still analyze but with caveats)
  - ✗ Failed (gray, with retry button)
- **Action Buttons:** `[► Analyze]` (leads to Processing View), `[Download]` (gets cleaned audio + spectrograms), `[Delete]` (removes from library)
- **Progress Bar Animation:** For processing recordings, a smooth animated bar fills left-to-right with estimated time remaining

### RecordingCard Component Props
```tsx
interface RecordingCard {
  recording_id: string
  filename: string
  file_size_mb: number
  created_at: ISO8601
  status: 'processing' | 'processed' | 'high_noise' | 'failed'
  audio_quality_percent: number        // 0-100
  noise_level_percent: number          // 0-100
  progress?: number                    // 0-1, if processing
  eta_seconds?: number                 // if processing
  onAnalyze: () => void
  onDownload: () => void
  onDelete: () => void
  onRetry?: () => void
}
```

---

## View 3: Processing View (THE MAIN EVENT)

### Layout

```
┌──────────────────────────────────────────────────────────────┐
│  safari_herd_03.wav  (3.2 MB)          Processing Status │   │
├──────────────────────────────────────────────────────────────┤
│                                                              │
│  ┌─────────────────────────────┐ ┌──────────────────────────┐│
│  │                             │ │ PROCESSING TIMELINE      ││
│  │   BEFORE                    │ │                          ││
│  │   ┌──────────────────────┐  │ │ ◉ Upload & Validate     ││
│  │   │ SPECTROGRAM (Raw)    │  │ │ ◉ Analyze Noise Profile ││
│  │   │                      │  │ │ ◉ Classify & Remove     ││
│  │   │  High intensity red  │  │ │ ◉ Verify & Segment      ││
│  │   │  in 0-2 kHz range    │  │ │ ◐ Extract Calls         ││
│  │   │  = background noise  │  │ │ ○ Finalize              ││
│  │   │                      │  │ │                          ││
│  │   │ │ │ │ ││││││         │  │ │ 67% Complete            ││
│  │   │ ││││||||││││││        │  │ ▓▓▓▓▓▓▓▓░░░░░░░░░░░░    ││
│  │   │ ███████████░░░       │  │                          ││
│  │   │ ▓▓▓▓▓▓▓░░░░░░░░░░   │  │ Current: Extracting      ││
│  │   │                      │  │ elephant calls (2/8)      ││
│  │   │ Freq ──────────►     │  │ Est. 4 min remaining     ││
│  │   │ 0   2    5   10  20kHz│  │                          ││
│  │   │ Time 0 ───────►  180s │  │                          ││
│  │   └──────────────────────┘  │                          ││
│  │                             │                          ││
│  │   WAVEFORM (Raw)            │                          ││
│  │   ▁▃▄▆▇█▆▄▃▁▃▅▇▆▄▂▁▃▅      │                          ││
│  │   (Amplitude over time)     │                          ││
│  │                             │                          ││
│  │   [Play Raw] [Pause] [↻ 5s] │                          ││
│  └─────────────────────────────┘ └──────────────────────────┘│
│                                                              │
│  ┌────── PROCESSING IN ACTION ─────────────────────────────┐│
│  │ The noise dissolves. The voices emerge.                  ││
│  │                                                          ││
│  │ ┌──────────────────────────────────────────────────┐    ││
│  │ │ SLIDER: Drag to compare BEFORE ↔ AFTER         │    ││
│  │ │                                                  │    ││
│  │ │  Before (Raw)        ║         After (Cleaned) │    ││
│  │ │  ──────────────      ║      ──────────────     │    ││
│  │ │  ███████████▓▓║▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓     │    ││
│  │ │  Noise-heavy │║      Clear voices emerge     │    ││
│  │ │  Low S/N     │║      Individual calls visible  │    ││
│  │ │              │║                                │    ││
│  │ │              │ ◄─ Drag slider                  │    ││
│  │ │                                                  │    ││
│  │ │  Freq 0-20kHz  ────────────────────────────►   │    ││
│  │ │                                                  │    ││
│  │ │  Raw Spectrum: Peak at 500-1200 Hz (wind)      │    ││
│  │ │  Cleaned: Peaks at 8-18 kHz (elephant calls)   │    ││
│  │ └──────────────────────────────────────────────────┘    ││
│  │                                                          ││
│  │ WAVEFORM COMPARISON:                                     ││
│  │ Before (Raw): ▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓           ││
│  │ After (Clean): ▁▃▅▇▄▂▁ ▂▄▆▇▄▂▁ ▃▅▇▆▄▂▁        ││
│  │                 ▁ gap  ▁ gap    ▁ (calls visible)      ││
│  │                                                          ││
│  │ [Play Before] [Play After] [↻ 5s] [Sync]              ││
│  └────────────────────────────────────────────────────────┘│
│                                                              │
│  ┌──────────────────────────────────────────────────────┐   │
│  │ PROCESSING INSIGHTS                                 │   │
│  │ Noise Profiles Detected:                             │   │
│  │ • Wind & Weather (450-800 Hz) — 34% of raw audio    │   │
│  │ • Vehicle Rumble (50-200 Hz) — 28% of raw audio    │   │
│  │ • Insect Chorus (2-4 kHz) — 18% of raw audio       │   │
│  │ • Rain Noise (5-10 kHz) — 12% of raw audio         │   │
│  │                                                      │   │
│  │ Elephant Calls Identified: 8 distinct vocalizations │   │
│  │ • Infrasound rumbles (14-20 Hz)                     │   │
│  │ • Trumpet calls (8-18 kHz, avg 3.2 sec duration)  │   │
│  │ • Roars (500-5000 Hz, avg 1.8 sec duration)       │   │
│  │                                                      │   │
│  │ Removal Effectiveness: 87% noise reduction          │   │
│  │ Signal Preservation: 94% (minimal voice loss)       │   │
│  └──────────────────────────────────────────────────────┘   │
│                                                              │
│  ┌──────────────────────────────────────────────────────┐   │
│  │            [► Explore Calls] [Save & Export]         │   │
│  └──────────────────────────────────────────────────────┘   │
│                                                              │
└──────────────────────────────────────────────────────────────┘
```

### THE STORYTELLING MOMENT

This view is the demo. It must create a "wow" moment within 15 seconds of landing:

1. **Before Spectrogram (Left):** Show raw recording with heavy noise (red-dominant heatmap). Waveform looks chaotic.
2. **Interactive Slider (Center):** User drags a vertical divider left/right. Left side shows BEFORE, right side shows AFTER.
3. **Animated Transition (0.5-1 second):** As slider moves, the spectrogram animates. Noise peaks fade, elephant calls emerge as cyan/yellow peaks on black background.
4. **After Spectrogram (Right):** Clean spectrogram. Elephant calls pop out: high-contrast cyan and yellow peaks at 8-20 kHz. Waveform is sparse and readable.
5. **Audio Playback:** User can toggle between raw and cleaned audio. The difference is audible.

### SpectrogramViewer Component

**Props:**
```tsx
interface SpectrogramViewer {
  recording_id: string
  spectrogram_image_url: string    // PNG, pre-rendered for speed
  duration_seconds: number
  frequency_range: [number, number] // e.g., [0, 20000]
  is_cleaned: boolean
  is_zoomed?: boolean
  zoom_time_range?: [number, number]
  zoom_freq_range?: [number, number]
  overlay_calls?: SegmentedCall[]   // highlights on top
  colormap: 'heatmap' | 'inferno'
}
```

**Features:**
- **Zoom:** Click and drag to select a time/frequency box, zooms to that region. Double-click to reset.
- **Time Scrubber:** Hover over spectrogram to see frequency content at that moment. Shows peak frequencies.
- **Call Markers:** If call segmentation is complete, overlay colored boxes around each detected call.
- **Frequency Labels:** Y-axis labels (0 Hz, 5 kHz, 10 kHz, etc.). X-axis time labels (0s, 30s, 60s, etc.).

### BeforeAfterSlider Component

**Props:**
```tsx
interface BeforeAfterSlider {
  before_image_url: string
  after_image_url: string
  before_audio_url?: string
  after_audio_url?: string
  slider_position: number             // 0-1
  onSliderChange: (position: number) => void
  enable_audio_playback?: boolean
  play_position?: number              // for synced playback
}
```

**Behavior:**
- Vertical draggable divider at `slider_position`.
- Left clip: shows only left (before) image, right clip: shows only right (after) image.
- As user drags, `onSliderChange` callback updates position.
- Audio playback (if enabled) can be synced: as audio plays, `play_position` updates, and both before/after audio play together so user hears the difference.

### ProcessingTimeline Component

**Props:**
```tsx
interface ProcessingTimeline {
  steps: {
    id: string
    label: string
    status: 'completed' | 'in_progress' | 'pending'
    duration_ms?: number
    start_time?: ISO8601
    end_time?: ISO8601
  }[]
  overall_progress: number             // 0-1
  eta_remaining_seconds?: number
  current_substep?: string
}
```

**Rendering:**
```
◉ Step 1 (completed)   ✓ 2.3s
◉ Step 2 (completed)   ✓ 4.1s
◐ Step 3 (in progress) ◐ Substep: Extracting calls (2/8)
○ Step 4 (pending)     ○ —
○ Step 5 (pending)     ○ —

▓▓▓▓▓▓▓▓░░░░░░░░░░░░ 62% Complete
Est. 4 min remaining
```

**Animations:**
- Filled circle (◉) to checkmark transition when step completes
- Half-circle (◐) spins while in progress
- Overall progress bar animates smoothly

### WaveformPlayer Component

**Props:**
```tsx
interface WaveformPlayer {
  audio_url: string
  duration_seconds: number
  waveform_data: number[][]         // [left_channel, right_channel] or mono
  is_playing: boolean
  current_time: number
  onPlayPause: () => void
  onSeek: (time: number) => void
  sync_with?: string                // 'before' or 'after' (for dual playback)
  show_frequency_spectrum?: boolean
}
```

**Rendering:**
- Waveform as SVG or canvas (left channel or mono).
- Time ruler above (0s, 30s, 60s, etc.).
- Play/pause button, seek bar, time display.
- Optional spectrum analyzer under waveform (frequency bars, real-time if playing).

### Processing Insights Panel

Text-based breakdown of:
1. **Noise Profiles Detected:** List of identified noise types (wind, rain, insects, vehicles) with percentage contribution.
2. **Elephant Calls Identified:** Number of distinct calls, frequency ranges, durations.
3. **Removal Effectiveness:** Metrics like noise reduction %, signal preservation %.

---

## View 4: Call Analysis / Results

### Layout

```
┌──────────────────────────────────────────────────────────────┐
│  ← Back to Library    Call #3: Trumpet Vocalization          │
├──────────────────────────────────────────────────────────────┤
│                                                              │
│  ┌────────────────────┐  ┌──────────────────────────────────┐│
│  │                    │  │ ACOUSTIC PROPERTIES              ││
│  │  SPECTROGRAM       │  │                                  ││
│  │  (Individual Call) │  │ Call Type: Trumpet               ││
│  │                    │  │ Duration: 3.24 seconds          ││
│  │  Peak intensity    │  │ Start Time: 47.3 sec (raw)      ││
│  │  at 8-18 kHz       │  │                                  ││
│  │                    │  │ Fundamental Frequency: 11.2 kHz ││
│  │  ▓▓▓▓▓▓▓           │  │ Harmonics: 22.4 kHz, 33.6 kHz  ││
│  │  ████▓▓▓░          │  │                                  ││
│  │  ███░░░░░          │  │ Bandwidth: 18 kHz              ││
│  │  ░░░░░░░░          │  │ Peak Amplitude: -6 dB          ││
│  │  Freq 0-20kHz      │  │ Energy Distribution:            ││
│  │  Time 3.24s        │  │ • Low (0-5 kHz): 2%            ││
│  │                    │  │ • Mid (5-10 kHz): 18%          ││
│  │                    │  │ • High (10-20 kHz): 80%        ││
│  │ [Zoom] [Pan]       │  │                                  ││
│  └────────────────────┘  │ Signal Quality: Excellent       ││
│                          │ Confidence: 94%                 ││
│  [Play] [Loop 3.24s]     │                                  ││
│  [Edit Boundaries]       │ [Edit] [Reclassify] [Mark Issues]
│  [Merge] [Split]         │                                  ││
│  └──────────────────────────────────────────────────────────┘│
│                                                              │
│  ┌──────────────────────────────────────────────────────────┐│
│  │ CONTEXT IN RECORDING                                    ││
│  │ This call is part of a longer sequence:                 ││
│  │                                                          ││
│  │ 40-45s: Rumble (Individual A - low freq infrasound)    ││
│  │ 45-48s: Rumble response (Individual B)  ◄─ nearby      ││
│  │ 47.3-50.5s: Trumpet vocalization (Individual A) ◄─ THIS││
│  │ 50-55s: Silence                                         ││
│  │ 55-60s: Rumble reply (Individual C - distant)         ││
│  │                                                          ││
│  │ [◄ Previous Call] [Timeline] [Next Call ►]             ││
│  └──────────────────────────────────────────────────────────┘│
│                                                              │
│  ┌──────────────────────────────────────────────────────────┐│
│  │ RESEARCH NOTES                                          ││
│  │ [Text area for researcher to add observations]         ││
│  │ "This call follows a rumble sequence, possibly a       ││
│  │  distance-bridging communication between herds."       ││
│  │                                                          ││
│  │ [Save Note]  [Tag: Maternal] [Tag: Distress] [+Tag]    ││
│  └──────────────────────────────────────────────────────────┘│
│                                                              │
│  ┌──────────────────────────────────────────────────────────┐│
│  │         [Export This Call] [Add to Report]              ││
│  └──────────────────────────────────────────────────────────┘│
│                                                              │
└──────────────────────────────────────────────────────────────┘
```

### Call Analysis Features
- **Individual Call Spectrogram:** High-resolution spectrogram of a single call (segmented from the full recording).
- **Acoustic Properties Panel:** Frequency, duration, bandwidth, amplitude, harmonics, energy distribution, signal quality, confidence score.
- **Editable Boundaries:** User can adjust call start/end times if the AI segmentation was slightly off.
- **Context Timeline:** Shows this call within the sequence of all calls in the recording. Helps researchers understand communication patterns.
- **Research Notes:** Free-form text field for researcher observations. Autosaved. Tagging system for call types (Maternal, Distress, Social, Feeding, etc.).

### CallCard Component

```tsx
interface CallCard {
  call_id: string
  recording_id: string
  index: number                        // order in recording
  start_time_seconds: number
  end_time_seconds: number
  duration_seconds: number
  call_type?: string                   // inferred by AI
  fundamental_freq_hz: number
  harmonics_hz: number[]
  bandwidth_hz: number
  peak_amplitude_db: number
  energy_distribution: {
    low: number      // 0-5 kHz %
    mid: number      // 5-10 kHz %
    high: number     // 10-20 kHz %
  }
  signal_quality: 'excellent' | 'good' | 'fair' | 'poor'
  confidence_percent: number
  notes?: string
  tags?: string[]
  spectrogram_url: string
  audio_url: string
}
```

### AcousticPropertyPanel Component

**Props:**
```tsx
interface AcousticPropertyPanel {
  call: CallCard
  show_energy_chart?: boolean
  editable?: boolean
  on_boundary_change?: (start: number, end: number) => void
}
```

**Rendering:**
- Grid of metrics with values and small sparkline indicators (trend if data exists).
- Energy distribution as a horizontal bar chart (Low/Mid/High).
- Editable sliders for start/end time (if `editable=true`).

---

## View 5: Research Database

### Layout

```
┌──────────────────────────────────────────────────────────────┐
│  Research Database                                           │
├──────────────────────────────────────────────────────────────┤
│                                                              │
│  FILTERS & SEARCH:                                           │
│  [Search recording name] [Call type ▼] [Duration ▼]         │
│  [Signal Quality ▼] [Confidence ▼] [Recording Date ▼]       │
│  [Clear All Filters]                                         │
│                                                              │
│  441 Calls Found (from 44 recordings)                        │
│                                                              │
│  ┌────────────────────┬────────────────────┬────────────────┐│
│  │ CALL #1            │ CALL #2            │ CALL #3        ││
│  │ Trumpet            │ Rumble             │ Roar           ││
│  │                    │                    │                ││
│  │ ▓▓▓▓░░░░░          │ ░░░████░░░         │ ░░████░░░      ││
│  │ 11.2 kHz / 3.2 sec │ 16 Hz / 4.1 sec    │ 2.8 kHz / 1.9 s││
│  │ Excellent (94%)    │ Good (87%)         │ Fair (73%)     ││
│  │ [Details] [Tag+]   │ [Details] [Tag+]   │ [Details]      ││
│  └────────────────────┴────────────────────┴────────────────┘│
│                                                              │
│  ┌────────────────────┬────────────────────┬────────────────┐│
│  │ CALL #4            │ CALL #5            │ CALL #6        ││
│  │ Rumble             │ Trumpet            │ Rumble         ││
│  │ ...                │ ...                │ ...            ││
│  └────────────────────┴────────────────────┴────────────────┘│
│                                                              │
│  [← Previous] Page 1 of 18 [Next →]  [Jump to page: __]    │
│                                                              │
└──────────────────────────────────────────────────────────────┘
```

### Database Grid Features
- **Call Cards:** Each card shows a thumbnail spectrogram, call type, duration, frequency, signal quality, confidence.
- **Filters:** By recording name, call type, duration range, signal quality, confidence threshold, date range.
- **Pagination:** 6 cards per page (responsive, 3 on mobile).
- **Sorting:** By date, frequency, duration, confidence (ascending/descending).
- **Search:** Full-text search on recording name and notes.
- **Export Selection:** Checkbox on each card. Export selected calls as a dataset.

### CallGrid Component

```tsx
interface CallGrid {
  calls: CallCard[]
  total_count: number
  page: number
  page_size: number
  on_page_change: (page: number) => void
  on_call_click: (call_id: string) => void
  on_filter_change: (filters: FilterOptions) => void
  sortBy: 'date' | 'frequency' | 'duration' | 'confidence'
  sortOrder: 'asc' | 'desc'
}
```

---

## View 6: Export / Report

### Layout

```
┌──────────────────────────────────────────────────────────────┐
│  ← Back to Database                                    Export │
├──────────────────────────────────────────────────────────────┤
│                                                              │
│  EXPORT OPTIONS                                              │
│                                                              │
│  ┌─────────────────────────────────────────────────────────┐ │
│  │ ◉ Include All Calls (441 calls)                          │ │
│  │ ○ Selected Calls Only (__ calls)  [Select...]           │ │
│  │ ○ Custom Query [Advanced Filters ▼]                     │ │
│  └─────────────────────────────────────────────────────────┘ │
│                                                              │
│  FILE FORMAT                                                 │
│  ◉ CSV (spreadsheet-friendly)                              │
│  ○ JSON (programmatic access)                              │
│  ○ ZIP Package (CSVs + spectrograms + audio)               │
│                                                              │
│  INCLUDE IN EXPORT                                           │
│  ☑ Acoustic Properties (frequency, duration, bandwidth)    │
│  ☑ Spectrograms (PNG images)                               │
│  ☑ Audio Files (cleaned WAV)                               │
│  ☑ Research Notes & Tags                                   │
│  ☑ Metadata (recording date, location if available)        │
│  ☑ Processing Info (noise reduction %, confidence scores)  │
│                                                              │
│  REPORT OPTIONS                                              │
│  ┌─────────────────────────────────────────────────────────┐ │
│  │ Generate Summary Report                                 │ │
│  │ (One-page overview with statistics and visualizations) │ │
│  │                                                         │ │
│  │ ☑ Call Type Distribution Chart                         │ │
│  │ ☑ Frequency Histogram (all calls)                      │ │
│  │ ☑ Duration Statistics                                  │ │
│  │ ☑ Quality & Confidence Summary                         │ │
│  │ ☑ Research Insights (AI-generated summary)             │ │
│  │                                                         │ │
│  │ [Preview Report]                                       │ │
│  └─────────────────────────────────────────────────────────┘ │
│                                                              │
│  PROJECT METADATA                                            │
│  Project Name: [Safari Herd Monitoring 2024]               │
│  Researcher: [Your Name]                                    │
│  Institution: [Your Institution]                            │
│  Description: [Free-form project notes]                     │
│                                                              │
│  [← Cancel]  [Generate Export] ►                           │
│                                                              │
└──────────────────────────────────────────────────────────────┘
```

### Export Flow
1. **Choose Scope:** All calls, selected, or custom query.
2. **Choose Format:** CSV, JSON, or ZIP (all three).
3. **Customize Content:** Toggle which fields to include (acoustic properties, spectrograms, audio, notes, metadata).
4. **Report Options:** Generate a summary report with charts and statistics.
5. **Project Metadata:** Name, researcher, institution, description.
6. **Download:** Generates ZIP (if multiple formats) or single file, streams to browser.

### ExportPanel Component

```tsx
interface ExportPanel {
  all_calls: CallCard[]
  selected_calls?: CallCard[]
  on_export: (options: ExportOptions) => Promise<Blob>
  on_preview_report: () => void
}

interface ExportOptions {
  scope: 'all' | 'selected' | 'custom'
  filters?: FilterOptions
  format: 'csv' | 'json' | 'zip'
  include_spectrograms: boolean
  include_audio: boolean
  include_notes: boolean
  include_metadata: boolean
  include_processing_info: boolean
  generate_report: boolean
  report_options?: ReportOptions
  project_metadata: {
    name: string
    researcher: string
    institution: string
    description: string
  }
}
```

---

## Component Inventory

All reusable components with props, used across views:

### SpectrogramViewer
Displays a spectrogram image with interactive zoom, time scrubber, frequency highlighting.
```tsx
interface SpectrogramViewer {
  image_url: string
  duration_seconds: number
  frequency_range: [number, number]
  is_cleaned: boolean
  zoom?: boolean
  overlay_calls?: SegmentedCall[]
  onTimeSelect?: (time: number) => void
  onFreqRange?: (freq: [number, number]) => void
}
```

### BeforeAfterSlider
Draggable slider comparing two spectrograms side-by-side.
```tsx
interface BeforeAfterSlider {
  before_url: string
  after_url: string
  before_audio_url?: string
  after_audio_url?: string
  position: number
  onChange: (pos: number) => void
}
```

### WaveformPlayer
Audio player with waveform visualization.
```tsx
interface WaveformPlayer {
  audio_url: string
  duration_seconds: number
  waveform_data: number[]
  onPlayPause?: () => void
  onSeek?: (time: number) => void
}
```

### ProcessingTimeline
Shows multi-step progress with status indicators.
```tsx
interface ProcessingTimeline {
  steps: ProcessingStep[]
  progress: number
  eta_seconds?: number
  current_substep?: string
}
```

### CallCard
Thumbnail card for a single elephant call.
```tsx
interface CallCard {
  call_id: string
  spectrogram_url: string
  call_type: string
  duration: number
  fundamental_freq: number
  quality: 'excellent' | 'good' | 'fair' | 'poor'
  confidence: number
  onClick?: () => void
}
```

### RecordingCard
Thumbnail card for a recording file.
```tsx
interface RecordingCard {
  recording_id: string
  filename: string
  file_size_mb: number
  status: 'processing' | 'processed' | 'high_noise' | 'failed'
  quality_percent: number
  noise_percent: number
  onAnalyze?: () => void
  onDownload?: () => void
  onDelete?: () => void
}
```

### AcousticPropertyPanel
Displays detailed acoustic metrics for a call.
```tsx
interface AcousticPropertyPanel {
  call: CallCard
  editable?: boolean
  onBoundaryChange?: (start: number, end: number) => void
}
```

### CallGrid
Paginated grid of call cards with filtering.
```tsx
interface CallGrid {
  calls: CallCard[]
  total_count: number
  filters?: FilterOptions
  onFilter?: (filters: FilterOptions) => void
  onCallSelect?: (id: string) => void
}
```

### ExportPanel
Export options form.
```tsx
interface ExportPanel {
  all_calls: CallCard[]
  selected_calls?: CallCard[]
  onExport: (options: ExportOptions) => Promise<Blob>
}
```

### ProgressBar
Animated progress indicator.
```tsx
interface ProgressBar {
  progress: number     // 0-1
  label?: string
  show_percent?: boolean
  animated?: boolean
}
```

### UploadZone
Drag-and-drop file upload area.
```tsx
interface UploadZone {
  accept: string[]             // e.g., ['.wav', '.mp3']
  max_size_mb: number
  onFilesSelected: (files: File[]) => void
  onDrop?: (files: File[]) => void
}
```

---

## Animation Specifications

| Element | Trigger | Animation | Duration | Easing |
|---------|---------|-----------|----------|--------|
| Spectrogram noise fade | Slider move (before→after) | Noise colors dissolve, call peaks brighten | 300ms | easeInOut |
| Waveform update | Slider move | Raw waves smooth out, become sparse | 300ms | easeInOut |
| Call peaks emerge | Processing complete | Cyan/yellow peaks fade in on black | 500ms | easeOut |
| Processing timeline step | Step completion | Filled circle ◉ → checkmark ✓ | 200ms | easeOut |
| Progress bar fill | Progress update | Bar width animates smoothly | Continuous | Linear |
| Audio playback cursor | Audio playing | Vertical line sweeps left-to-right | Real-time | Linear |
| Card hover | Mouse enter | Scale 1.02, shadow deepen | 150ms | easeOut |
| Call card enter | Page load (staggered) | FadeIn + slideUp (20ms stagger) | 300ms | easeOut |
| Export button disable | Before download ready | Opacity fade | 200ms | ease |
| Report modal appear | Generate click | FadeIn overlay + scaleUp content | 300ms | easeOut |
| Timeline context cards | Call analysis load | SlideIn from right (staggered 100ms) | 400ms | easeOut |
| Tag pill addition | Tag click | PulseIn + glow | 200ms | easeOut |
| Database filter apply | Filter change | Cards fade out, new cards fade in | 200ms | ease |

### Critical Timing: The Before/After Reveal

**The Slider Moment (0-1 second):**
When user drags the before/after slider, spectrograms must update smoothly at 60 FPS. Key requirements:
- Noise in the left half must fade in red (before), right half fade to clean (after)
- Waveform clarity increases as slider moves right
- Audio can be muted or continue playing (user choice)
- This is THE moment judges remember

**Implementation:**
```tsx
const handleSliderMove = (position: number) => {
  // position: 0 (all before) to 1 (all after)
  setSliderPosition(position)
  
  // Spectrogram image clipping:
  // Canvas: draw before image (0 to position*width), then after image (position*width to width)
  
  // Audio sync (optional):
  // Play before + after in sync, user hears the difference live
}
```

---

## Responsive Behavior

Target resolution: **1920×1080** (full HD projector).

- **Minimum:** 1280×720 (720p projector)
- **Spectrogram canvas:** Fills available width, maintains aspect ratio
- **Before/after slider:** Full width, draggable even on touch (mobile-friendly)
- **Call cards:** 3-column grid on wide, 2-column on tablet, 1-column on mobile
- **Left/right panels:** 50/50 split on desktop, stack vertically on <1024px
- **Timeline:** Vertical on desktop, horizontal scroll on mobile
- **Font sizes:** Base 16px, scale up to 18px on 1080p+ projectors

---

## Accessibility Notes

- **Color + Shape:** Noise indicators use color + pattern (red diagonal lines = noise, green circles = clean audio)
- **Spectrogram Descriptions:** Alt text explains heatmap (e.g., "Red indicates loud frequencies, cyan indicates moderate")
- **Aria Labels:** All interactive elements have labels (e.g., "Play raw audio", "Toggle before/after")
- **Keyboard Navigation:** Tab through call cards, Enter to select, Space to play/pause, Arrow keys to seek
- **Focus Ring:** 2px solid teal `#00D9FF` on all interactive elements
- **High Contrast Mode:** All text meets WCAG AA (4.5:1) against dark background
- **Spectrogram Captions:** Text description below each spectrogram (e.g., "Elephant trumpet call at 11.2 kHz for 3.2 seconds")
- **Audio Transcript:** Research notes provide text context for audio content
- **Skip Links:** Skip to main content, skip to call analysis

---

## Demo Recording Data (Hardcoded for 3 Key Recordings)

Pre-load full data for 3 demo recordings to guarantee fast load times and smooth demo flow:

| Recording | Role in Demo | Why |
|-----------|-------------|-----|
| `safari_herd_03.wav` | "The noisy one" | Heavy wind + rain noise. Shows off noise removal effectiveness. 441 calls extracted. |
| `elephant_family_clean.wav` | "The clean one" | Lighter ambient noise, crisp elephant calls. Shows what clean input looks like. |
| `mixed_herd_urban.wav` | "The challenging one" | Vehicle traffic + elephant calls. Shows handling of complex multi-source noise. |

Each recording has:
- Pre-processed spectrogram images (PNG, 1920×1080)
- Cleaned audio (WAV, 16-bit, 48 kHz)
- Segmented calls with acoustic properties
- Before/after waveforms
- Cached for instant loading

---

## UI Micro-interactions

**Loading State:** Skeleton screens for spectrograms (animated gradient shimmer). Avoid blank spaces.

**Empty State:** "No calls found" shows a supportive elephant icon and text: "Try adjusting your filters or uploading a new recording."

**Error State:** Red border + clear error message. "Spectrogram failed to load. Try refreshing." With retry button.

**Success Toast:** Green checkmark + "Recording saved to library" (auto-dismiss in 4 seconds).

**Drag Feedback:** Dragging a call card shows a semi-transparent copy at the cursor. Drop zone highlights.

**Button States:**
- Default: Normal appearance
- Hover: Subtle glow (teal `#00D9FF`, 2px shadow)
- Active/Pressed: Darker background
- Disabled: Opacity 0.5, cursor not-allowed

---

## Typography

- **Headlines (H1, H2):** Inter Bold, 32px / 24px
- **Body Text:** Inter Regular, 16px, line-height 1.6
- **Labels & UI Text:** Inter Medium, 14px
- **Technical Labels (on spectrograms):** Courier New, 12px (mono for precision)
- **Metric Values (numbers):** Courier New, 18px / 24px (mono for alignment)

---

## Color Usage Rules

- **Teal `#00D9FF`:** Interactive elements, focus states, important interactive cues (the slider, highlights)
- **Green `#10C876`:** Success states, clean audio, processed confirmations
- **Gold `#D4AF37`:** Warmth, elephant theme, storytelling elements (hero text, call-to-action accents)
- **Red `#EF4444`:** Noise, warnings, high-noise indicators
- **Amber `#F5A025`:** Processing, in-progress states
- **Gray `#8B8680` / `#5A6A75`:** Secondary text, borders, disabled states

---

## Target Demo Flow (36 Hours)

**Judges see this sequence:**
1. **Landing Page (5 sec):** "Hear what researchers hear" — warm, inviting, clear call-to-action
2. **Upload Sample (3 sec):** Click "Safari" sample, recording loads
3. **Processing View (15 sec):** THE MOMENT — drag slider, watch noise dissolve, hear audio switch
4. **Call Analysis (10 sec):** Click one call, show acoustic properties, research notes
5. **Export (5 sec):** Show 441 cleaned calls ready for research

**Total judge-view time: 40 seconds**. The before/after slider is the memory that sticks.

---

*Last updated: April 11, 2026*
