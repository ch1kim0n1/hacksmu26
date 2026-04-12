# 🎬 EchoField Demo Collection

Curated examples of successful elephant vocalization denoising. Each directory is a complete demo with original audio, processed output, and spectrograms.

## Demo Recordings

### 1. **2000-4_airplane_01** ⭐ BEST
```
Quality Score: 81.8/100 (EXCELLENT)
Noise Type: Airplane overhead
SNR Improvement: 8.08 dB
Energy Preserved: 78.5%
Animal ID: 2000-4
Duration: ~79 seconds
```

**Why this one:** 
- Highest quality score of all recordings
- Clear elephant rumble underneath airplane noise
- Dramatic SNR improvement (8+ dB is audibly significant)
- Great before/after comparison

**Demo Flow:**
1. Play `original.wav` - "Notice the airplane noise in the background"
2. Play `processed.wav` - "After processing, the elephant call is much clearer"
3. Show `before_spectrogram.png` vs `after_spectrogram.png`

---

### 2. **2000-4_airplane_02**
```
Quality Score: 80.8/100 (EXCELLENT)
Noise Type: Airplane
SNR Improvement: 8.18 dB
Energy Preserved: 78.5%
Animal ID: 2000-4
Duration: ~80 seconds
```

**Why this one:**
- Same elephant, different call
- Even better SNR improvement (8.18 dB)
- Demonstrates consistency across recordings

---

### 3. **1989-06_airplane_01**
```
Quality Score: 78.7/100 (GOOD)
Noise Type: Airplane
SNR Improvement: 8.22 dB
Energy Preserved: 84.8%
Animal ID: 1989-06
Duration: ~83 seconds
```

**Why this one:**
- Longest recording (83 sec) shows sustained denoising
- Highest energy preservation (84.8%)
- Different animal demonstrates generalization

---

## Files in Each Directory

```
{recording_name}/
├── original.wav                  Original audio (WITH noise)
├── processed.wav                 Denoised output
├── before_spectrogram.png        Frequency analysis (original)
├── after_spectrogram.png         Frequency analysis (processed)
└── metadata.json                 Quality metrics & statistics
```

## How to Use

### Quick Playback Demo
```bash
# Terminal: Play before & after
aplay 2000-4_airplane_01/original.wav
aplay 2000-4_airplane_01/processed.wav
```

### For Web UI Demo
The API endpoint `/api/recordings` loads these from the catalog. Point to any example:
```bash
curl http://localhost:8000/api/recordings | grep "2000-4_airplane_01"
```

### For Presentation Slides
Use the spectrogram images:
- **before_spectrogram.png** - "Raw recording with noise"
- **after_spectrogram.png** - "After EchoField processing"

---

## Key Metrics Explained

| Metric | Value | What It Means |
|--------|-------|---------------|
| **Quality Score** | 78-82/100 | Overall effectiveness of denoising |
| **SNR Improvement** | 8+ dB | ✅ Excellent (perceptually significant) |
| **Energy Preserved** | 75-85% | How much elephant call signal retained |
| **Spectral Distortion** | 0.08-0.12 | Low = minimal artifacts |

**Demo Stats to Mention:**
- "7-8 dB SNR improvement - that's about 3x reduction in perceived noise"
- "75-85% of the elephant call signal preserved"
- "Zero quality control flags = 100% pipeline confidence"

---

## Presentation Narrative

### 1-Minute Demo
> "Here's a real African bush elephant recording. You hear the airplane in the background? [Play original.wav]. After our pipeline processes it [Play processed.wav], the elephant's call is much clearer. The spectrogram shows the frequency analysis - notice how the noise floor dropped significantly."

### 5-Minute Deep Dive
> "We worked with ElephantVoices' dataset of real field recordings. Most have multiple noise types - airplanes, vehicles, generators. Our system:
> 1. Analyzes the spectrogram to identify noise types
> 2. Applies targeted spectral gating 
> 3. Validates quality with SNR and energy metrics
> 4. Outputs both denoised audio and visual spectrograms
>
> This example improved SNR by 8 dB while preserving 78% of the original signal. These recordings are real research-grade audio that will help elephant communication researchers study vocal patterns."

---

## Troubleshooting

**Files missing?**
```bash
# Check what's in the directory
ls -la 2000-4_airplane_01/
```

**Can't hear differences?**
- The SNR improvement of 8+ dB is a 3x reduction in noise power
- Use good speakers/headphones to hear the effect
- Listen to the high-frequency noise floor in original.wav

**Spectrograms look wrong?**
- They're PNG files in linear frequency scale
- Lower frequencies are elephant calls (15-100 Hz)
- Upper frequencies are airplane noise (500+ Hz)

---

## Next Steps

1. **Web Demo**: Upload these examples to the web UI at `http://localhost:3000`
2. **API Test**: Check `/api/recordings` endpoint returns these examples
3. **For Research**: Export as ZIP via `/api/export/research` for other researchers

---

**Created:** 2026-04-12
**Dataset:** ElephantVoices African bush elephant recordings  
**Processing Pipeline:** EchoField v1.0
