# EchoField Data Directory

This directory contains all audio, processed files, and metadata for the EchoField elephant vocalization denoising platform.

## Directory Structure

```
data/
├── recordings/                       All audio recordings (original & processed)
│   ├── original/                     Original audio files with background noise
│   │   └── *.wav                     44 African bush elephant recordings
│   │
│   ├── processed/                    Denoised audio & spectrograms
│   │   ├── audio/                    Cleaned/denoised audio files
│   │   │   └── {id}_cleaned.wav
│   │   └── spectrograms/             Visualization of before/after
│   │       ├── {id}_before.png
│   │       └── {id}_after.png
│   │
│   └── demo/                         🎬 CURATED EXAMPLES FOR PRESENTATION
│       ├── 2000-4_airplane_01/      (Best: 81.8/100 quality)
│       ├── 2000-4_airplane_02/      (Excellent: 80.8/100)
│       └── 1989-06_airplane_01/     (Good: 78.7/100)
│           Each contains:
│           ├── original.wav
│           ├── processed.wav
│           ├── before_spectrogram.png
│           ├── after_spectrogram.png
│           └── metadata.json (quality metrics & stats)
│
├── metadata/                         Catalog, labels, analysis
│   ├── recording_catalog.json        Complete recording manifest (44 recordings)
│   ├── metadata.csv                  Metadata CSV with animal IDs, locations, etc.
│   ├── labels.json                   ML labels for call types
│   └── analysis/                     Research analysis files
│       ├── audio_analysis.json
│       ├── audio_inventory_review.csv
│       └── classifier_evaluation.json
│
└── cache/                            Runtime cache (don't modify)
    ├── echofield.sqlite              Processing state & metadata database
    ├── index.json                    Cache LRU index
    └── review_labels.json            Training data labels
```

## Quick Start for Presenters

### 🎬 Find Demo Examples
All best examples are in `recordings/demo/`:
```bash
cd data/recordings/demo/
ls -la                              # View all demo recordings
```

### 📊 Access Audio Files
```bash
# Original audio (with background noise)
data/recordings/original/2000-4_airplane_01.wav

# Processed audio (cleaned)
data/recordings/processed/audio/2000-4_airplane_01_cleaned.wav

# Visual comparison
data/recordings/processed/spectrograms/2000-4_airplane_01_before.png
data/recordings/processed/spectrograms/2000-4_airplane_01_after.png
```

### 📈 Check Quality Metrics
```bash
# JSON metadata for demo recording
cat data/recordings/demo/2000-4_airplane_01/metadata.json
```

## For Development

### Add New Recordings
1. Place original audio in `recordings/original/`
2. After processing, denoised files appear in `recordings/processed/audio/`
3. Run catalog update to index new files

### Update Processing Results
The API automatically:
- Reads from `recordings/original/` for source audio
- Writes processed files to `recordings/processed/audio/`
- Stores spectrograms in `recordings/processed/spectrograms/`
- Updates `metadata/recording_catalog.json`

### Configuration
Environment variables in `.env.local` point to these directories:
```bash
ECHOFIELD_AUDIO_DIR=./data/recordings/original
ECHOFIELD_PROCESSED_DIR=./data/recordings/processed/audio
ECHOFIELD_SPECTROGRAM_DIR=./data/recordings/processed/spectrograms
ECHOFIELD_CATALOG_FILE=./data/metadata/recording_catalog.json
```

## Key Statistics

| Metric | Count |
|--------|-------|
| Total Recordings | 44 |
| Completed Processing | 13 |
| "Good" Quality Examples | 10 |
| Demo Collections | 3 |
| Average SNR Improvement | 7.06 dB |
| Energy Preservation | 74.3% |

## File Organization

All files are organized by `recording_id` (UUID). The catalog `metadata/recording_catalog.json` maintains the complete mapping:
```json
{
  "id": "2000-4...",
  "filename": "2000-4_airplane_01.wav",
  "source_path": "data/recordings/original/2000-4_airplane_01.wav",
  "result": {
    "output_audio_path": "data/recordings/processed/audio/2000-4..._cleaned.wav",
    "spectrogram_before_path": "data/recordings/processed/spectrograms/2000-4..._before.png",
    ...
  }
}
```

## Troubleshooting

**API can't find files?**
- Check `.env.local` paths match your data directory location
- Verify paths exist: `ls data/recordings/original/`

**Missing spectrograms?**
- Regenerate with: `python scripts/improve_catalog_metrics.py`

**Update catalog after file changes:**
- Run: `python scripts/sync_catalog_with_cache.py`

## Next Steps

For HackSMU presentation:
1. Navigate to `data/recordings/demo/`
2. Load one of the 3 examples in the web UI or audio player
3. Play original.wav → processed.wav to demonstrate noise reduction
4. Show before/after spectrograms for visual impact
