# EchoField — API Specification

All HTTP endpoints, WebSocket protocol, audio processing pipeline, elephant call detection, and research export contracts.

---

## FastAPI Backend (Port 8000)

### REST Endpoints

#### POST /api/upload
Upload one or more audio files for noise removal processing.

**Request (multipart/form-data):**
```
POST /api/upload
Content-Type: multipart/form-data

{
  "files": [AudioFile1, AudioFile2, ...],
  "metadata": {
    "location": "Amboseli National Park",
    "date": "2026-04-10",
    "microphone_type": "ARBIMON",
    "notes": "Evening chorus, herd of 8 elephants"
  }
}
```

**Response 200:**
```json
{
  "status": "uploaded",
  "recording_ids": ["rec_001a", "rec_002a"],
  "count": 2,
  "total_duration_s": 1847,
  "message": "Files queued for processing"
}
```

**Error 400 (Bad Request):**
```json
{
  "error": {
    "code": "INVALID_FILE_FORMAT",
    "message": "Unsupported format. Accepted: WAV, MP3, FLAC (≤ 3GB per file)",
    "status": 400
  }
}
```

**Error 413 (Payload Too Large):**
```json
{
  "error": {
    "code": "FILE_SIZE_EXCEEDED",
    "message": "Total upload exceeds 15GB limit",
    "status": 413
  }
}
```

---

#### GET /api/recordings
List all uploaded recordings with summary metadata.

**Query Params:**
- `limit` (optional, default 50) — Number of results
- `offset` (optional, default 0) — Pagination offset
- `status` (optional) — Filter by status: `pending`, `processing`, `complete`, `failed`
- `location` (optional) — Filter by location string

**Response 200:**
```json
{
  "total": 487,
  "returned": 50,
  "recordings": [
    {
      "id": "rec_001a",
      "filename": "amboseli_20260410_1800.wav",
      "duration_s": 923,
      "filesize_mb": 126,
      "uploaded_at": "2026-04-10T18:00:00Z",
      "status": "complete",
      "metadata": {
        "location": "Amboseli National Park",
        "date": "2026-04-10",
        "microphone_type": "ARBIMON",
        "notes": "Evening chorus"
      },
      "processing": {
        "started_at": "2026-04-10T18:05:00Z",
        "completed_at": "2026-04-10T18:12:00Z",
        "duration_s": 7,
        "progress_pct": 100
      },
      "results": {
        "calls_detected": 34,
        "snr_improvement_db": 8.2,
        "noise_type_primary": "wind_rain",
        "confidence_avg": 0.87
      }
    },
    {
      "id": "rec_002a",
      "filename": "hwange_20260409_2130.wav",
      "duration_s": 1847,
      "filesize_mb": 251,
      "uploaded_at": "2026-04-09T21:30:00Z",
      "status": "processing",
      "metadata": {
        "location": "Hwange National Park",
        "date": "2026-04-09",
        "microphone_type": "ARU"
      },
      "processing": {
        "started_at": "2026-04-09T21:35:00Z",
        "progress_pct": 47
      }
    }
  ]
}
```

---

#### GET /api/recordings/{id}
Retrieve full details for a single recording.

**Response 200:**
```json
{
  "id": "rec_001a",
  "filename": "amboseli_20260410_1800.wav",
  "duration_s": 923,
  "filesize_mb": 126,
  "uploaded_at": "2026-04-10T18:00:00Z",
  "status": "complete",
  "metadata": {
    "location": "Amboseli National Park",
    "date": "2026-04-10",
    "latitude": -2.6597,
    "longitude": 37.2591,
    "microphone_type": "ARBIMON",
    "microphone_height_m": 1.8,
    "ambient_temp_c": 22,
    "humidity_pct": 65,
    "notes": "Evening chorus, herd of 8 elephants"
  },
  "processing": {
    "started_at": "2026-04-10T18:05:00Z",
    "completed_at": "2026-04-10T18:12:00Z",
    "duration_s": 7,
    "model_version": "EchoNet-V3.2",
    "device_used": "gpu_0"
  },
  "results": {
    "calls_detected": 34,
    "signal_to_noise_ratio_db": {
      "before": 4.2,
      "after": 12.4,
      "improvement_db": 8.2
    },
    "noise_types_detected": [
      {"type": "wind", "pct": 38, "frequency_hz": [200, 2000]},
      {"type": "rain", "pct": 31, "frequency_hz": [1000, 8000]},
      {"type": "vehicle", "pct": 18, "frequency_hz": [50, 500]},
      {"type": "other", "pct": 13, "frequency_hz": [0, 20000]}
    ],
    "frequency_response": {
      "original_peak_hz": 12500,
      "cleaned_peak_hz": 13200,
      "peak_amplitude_db_before": -14.5,
      "peak_amplitude_db_after": -4.2
    },
    "confidence_avg": 0.87,
    "confidence_per_call": [0.92, 0.88, 0.85, "..."]
  },
  "calls": [
    {
      "id": "call_001a_001",
      "start_ms": 1240,
      "duration_ms": 1560,
      "frequency_hz_min": 8000,
      "frequency_hz_max": 15000,
      "call_type": "rumble",
      "confidence": 0.92,
      "snr_improvement_db": 8.5,
      "notes": "Low-frequency rumble, likely mother-calf contact"
    }
  ]
}
```

**Error 404 (Not Found):**
```json
{
  "error": {
    "code": "RECORDING_NOT_FOUND",
    "message": "No recording found with id 'rec_999x'",
    "status": 404
  }
}
```

---

#### POST /api/recordings/{id}/process
Manually start or restart noise removal processing for a recording.

**Request (optional):**
```json
{
  "priority": "high",
  "model": "EchoNet-V3.2",
  "noise_reduction_aggressiveness": 0.7,
  "preserve_call_frequencies": true,
  "call_detection": true
}
```

**Response 200:**
```json
{
  "id": "rec_001a",
  "status": "processing",
  "started_at": "2026-04-10T18:05:00Z",
  "estimated_completion_s": 8,
  "message": "Processing started with priority=high"
}
```

**Error 409 (Conflict):**
```json
{
  "error": {
    "code": "ALREADY_PROCESSING",
    "message": "Recording is already being processed. Wait for completion or cancel first.",
    "status": 409
  }
}
```

---

#### GET /api/recordings/{id}/status
Poll real-time processing progress.

**Response 200:**
```json
{
  "id": "rec_001a",
  "status": "processing",
  "progress_pct": 67,
  "stage": "noise_classification",
  "elapsed_s": 4,
  "estimated_remaining_s": 2,
  "calls_detected_so_far": 28,
  "current_frequency_range_hz": [10000, 14000],
  "message": "Analyzing noise profile... 2s remaining"
}
```

---

#### GET /api/recordings/{id}/spectrogram
Retrieve spectrogram visualization data (before/after) for a cleaned recording.

**Query Params:**
- `format` (optional) — `json` (default), `png`, `svg`
- `time_start_s` (optional) — Start time for window
- `time_end_s` (optional) — End time for window
- `frequency_min_hz` (optional) — Min frequency
- `frequency_max_hz` (optional) — Max frequency

**Response 200 (format=json):**
```json
{
  "id": "rec_001a",
  "filename": "amboseli_20260410_1800.wav",
  "spectrogram": {
    "original": {
      "time_bins": 512,
      "frequency_bins": 256,
      "time_resolution_ms": 1.8,
      "frequency_resolution_hz": 78,
      "data": [[amplitude_values_as_db], ["..."], "..."]
    },
    "cleaned": {
      "time_bins": 512,
      "frequency_bins": 256,
      "time_resolution_ms": 1.8,
      "frequency_resolution_hz": 78,
      "data": [[amplitude_values_as_db], ["..."], "..."]
    },
    "noise_mask": {
      "time_bins": 512,
      "frequency_bins": 256,
      "data": [[confidence_removed_0_to_1], ["..."], "..."]
    },
    "call_highlights": [
      {
        "call_id": "call_001a_001",
        "time_start_s": 1.24,
        "time_end_s": 2.80,
        "frequency_hz_min": 8000,
        "frequency_hz_max": 15000,
        "call_type": "rumble"
      }
    ]
  }
}
```

**Response 200 (format=png):**
```
Content-Type: image/png
Content-Disposition: inline; filename="rec_001a_spectrogram.png"

[PNG binary data - side-by-side before/after spectrogram visualization]
```

---

#### GET /api/recordings/{id}/download
Download cleaned audio file in requested format.

**Query Params:**
- `format` (optional, default `wav`) — `wav`, `mp3`, `flac`
- `include_metadata` (optional, default `false`) — Embed processing metadata in file

**Response 200:**
```
Content-Type: audio/wav
Content-Disposition: attachment; filename="amboseli_20260410_1800_cleaned.wav"
Content-Length: 113245678

[WAV binary data]
```

**Error 404:**
```json
{
  "error": {
    "code": "RECORDING_NOT_COMPLETE",
    "message": "Recording not yet processed. Check /api/recordings/{id}/status",
    "status": 404
  }
}
```

---

#### POST /api/batch/process
Queue multiple recordings for batch processing with priority ordering.

**Request:**
```json
{
  "recording_ids": ["rec_001a", "rec_002a", "rec_003a"],
  "priority": "normal",
  "process_sequentially": false,
  "max_parallel": 4,
  "email_on_completion": "researcher@elephantvoices.org"
}
```

**Response 202 (Accepted):**
```json
{
  "batch_id": "batch_abc123",
  "status": "queued",
  "recording_count": 3,
  "total_duration_s": 2770,
  "estimated_completion_minutes": 12,
  "message": "Batch queued. Monitor at /api/batch/abc123/status"
}
```

---

#### GET /api/batch/{batch_id}/status
Monitor batch processing progress.

**Response 200:**
```json
{
  "batch_id": "batch_abc123",
  "status": "processing",
  "progress_pct": 42,
  "recordings_total": 3,
  "recordings_complete": 1,
  "recordings_processing": 1,
  "recordings_failed": 0,
  "started_at": "2026-04-10T18:15:00Z",
  "estimated_completion_at": "2026-04-10T18:27:00Z",
  "details": [
    {
      "recording_id": "rec_001a",
      "status": "complete",
      "calls_detected": 34,
      "duration_s": 923
    },
    {
      "recording_id": "rec_002a",
      "status": "processing",
      "progress_pct": 67
    },
    {
      "recording_id": "rec_003a",
      "status": "pending"
    }
  ]
}
```

---

#### GET /api/stats
Platform-wide processing and call detection statistics.

**Response 200:**
```json
{
  "platform": {
    "total_recordings": 487,
    "total_duration_hours": 289,
    "total_calls_detected": 12847,
    "avg_calls_per_hour": 44.5
  },
  "processing": {
    "completed_24h": 156,
    "in_progress": 8,
    "failed": 3,
    "total_processing_time_hours": 34,
    "avg_processing_time_s": 8.1
  },
  "noise_reduction": {
    "avg_snr_improvement_db": 7.8,
    "avg_confidence": 0.86,
    "most_common_noise": "wind"
  },
  "calls": {
    "rumble": {"count": 4521, "pct": 35},
    "trumpet": {"count": 2834, "pct": 22},
    "chirp": {"count": 1902, "pct": 15},
    "roar": {"count": 1456, "pct": 11},
    "infrasound": {"count": 1134, "pct": 9},
    "other": {"count": 1000, "pct": 8}
  },
  "locations": {
    "Amboseli National Park": {"count": 142, "calls": 3456},
    "Hwange National Park": {"count": 98, "calls": 2187},
    "Chobe National Park": {"count": 76, "calls": 1654},
    "other": {"count": 171, "calls": 5550}
  },
  "updated_at": "2026-04-10T18:30:00Z"
}
```

---

#### GET /api/calls
List all detected elephant calls across all recordings with filtering.

**Query Params:**
- `limit` (optional, default 100) — Number of results
- `offset` (optional, default 0) — Pagination
- `call_type` (optional) — Filter by type: `rumble`, `trumpet`, `chirp`, `roar`, `infrasound`, `other`
- `min_confidence` (optional, default 0.5) — Min detection confidence
- `location` (optional) — Filter by location
- `date_start` (optional) — Filter by start date (ISO 8601)
- `date_end` (optional) — Filter by end date

**Response 200:**
```json
{
  "total": 12847,
  "returned": 100,
  "calls": [
    {
      "id": "call_001a_001",
      "recording_id": "rec_001a",
      "call_type": "rumble",
      "start_ms": 1240,
      "duration_ms": 1560,
      "frequency_hz_min": 8000,
      "frequency_hz_max": 15000,
      "peak_frequency_hz": 12500,
      "amplitude_db": -4.2,
      "confidence": 0.92,
      "snr_improvement_db": 8.5,
      "recording_metadata": {
        "location": "Amboseli National Park",
        "date": "2026-04-10",
        "filename": "amboseli_20260410_1800.wav"
      }
    }
  ]
}
```

---

#### GET /api/calls/{call_id}
Retrieve detailed acoustic analysis for a single detected call.

**Response 200:**
```json
{
  "id": "call_001a_001",
  "recording_id": "rec_001a",
  "call_type": "rumble",
  "timing": {
    "start_ms": 1240,
    "end_ms": 2800,
    "duration_ms": 1560,
    "frequency_start_hz": 8000,
    "frequency_end_hz": 15000,
    "frequency_peak_hz": 12500
  },
  "acoustic_properties": {
    "fundamental_frequency_hz": 12500,
    "harmonics": [12500, 25000, 37500],
    "bandwidth_hz": 7000,
    "amplitude_db": -4.2,
    "amplitude_peak_db": -0.8,
    "q_factor": 1.78,
    "modulation": "frequency_sweep"
  },
  "processing": {
    "confidence": 0.92,
    "snr_improvement_db": 8.5,
    "noise_reduced_pct": 84,
    "model_version": "EchoNet-V3.2"
  },
  "acoustic_classifications": {
    "primary_type": "rumble",
    "secondary_types": ["contact_rumble"],
    "behavioral_context": "mother_calf_contact",
    "distance_estimate_m": 45,
    "herd_size_estimate": 8
  },
  "segments": [
    {
      "segment_id": 0,
      "start_ms": 1240,
      "end_ms": 1680,
      "frequency_hz": 12800,
      "amplitude_db": -4.2,
      "character": "ascending"
    },
    {
      "segment_id": 1,
      "start_ms": 1680,
      "end_ms": 2200,
      "frequency_hz": 12200,
      "amplitude_db": -2.8,
      "character": "sustained"
    },
    {
      "segment_id": 2,
      "start_ms": 2200,
      "end_ms": 2800,
      "frequency_hz": 11200,
      "amplitude_db": -5.1,
      "character": "descending"
    }
  ],
  "research_notes": "Classic mother-elephant rumble with frequency sweep. Clear maternity contact pattern."
}
```

**Error 404:**
```json
{
  "error": {
    "code": "CALL_NOT_FOUND",
    "message": "No call found with id 'call_999x_999'",
    "status": 404
  }
}
```

---

#### POST /api/export/research
Export cleaned recordings and call metadata in formats suitable for research.

**Request:**
```json
{
  "recording_ids": ["rec_001a", "rec_002a"],
  "include": ["cleaned_audio", "spectrograms", "call_annotations", "raw_metrics"],
  "format": "research_bundle",
  "metadata_format": "darwin_core",
  "compression": "zip"
}
```

**Response 202 (Accepted):**
```json
{
  "export_id": "exp_001",
  "status": "preparing",
  "recording_count": 2,
  "estimated_size_mb": 480,
  "estimated_completion_s": 45,
  "download_url": "/api/export/research/exp_001/download",
  "message": "Export job queued"
}
```

**Response 200 (format=application/zip):**
```
Content-Type: application/zip
Content-Disposition: attachment; filename="echofield_research_export_20260410.zip"

[ZIP containing:
  /recordings/
    amboseli_20260410_1800_cleaned.wav
    hwange_20260409_2130_cleaned.wav
  /spectrograms/
    rec_001a_spectrogram.png
    rec_002a_spectrogram.png
  /metadata/
    calls.csv
    calls.json
    darwin_core_recordedspecimen.txt
  /metrics/
    processing_report.json
]
```

---

## WebSocket Protocol

**Endpoint:** `ws://localhost:8000/ws/processing/{recording_id}`

### Connection
Client connects with recording ID. Server immediately sends current state snapshot.

### Server → Client Events

All events follow this envelope:
```json
{
  "type": "EVENT_TYPE",
  "ts": "2026-04-10T18:05:00.123Z",
  "data": { ... }
}
```

#### PROCESSING_STARTED
Sent when processing begins.
```json
{
  "type": "PROCESSING_STARTED",
  "ts": "2026-04-10T18:05:00Z",
  "data": {
    "recording_id": "rec_001a",
    "duration_s": 923,
    "model_version": "EchoNet-V3.2",
    "estimated_duration_s": 8
  }
}
```

#### SPECTROGRAM_UPDATE
Sent every 0.5s with live spectrogram visualization data.
```json
{
  "type": "SPECTROGRAM_UPDATE",
  "ts": "2026-04-10T18:05:01Z",
  "data": {
    "progress_pct": 12,
    "time_completed_s": 1.5,
    "spectrogram_chunk": {
      "time_start_s": 0,
      "time_end_s": 1.5,
      "frequency_bins": 256,
      "data": [[db_values], ["..."], "..."]
    },
    "calls_detected_so_far": 3
  }
}
```

#### NOISE_CLASSIFIED
Sent when primary noise types are identified.
```json
{
  "type": "NOISE_CLASSIFIED",
  "ts": "2026-04-10T18:05:02Z",
  "data": {
    "noise_types": [
      {"type": "wind", "confidence": 0.92, "frequency_hz": [200, 2000]},
      {"type": "rain", "confidence": 0.78, "frequency_hz": [1000, 8000]}
    ],
    "primary_noise": "wind",
    "removal_strategy": "spectral_subtraction_adaptive"
  }
}
```

#### REMOVAL_PROGRESS
Sent every 1-2s with overall progress.
```json
{
  "type": "REMOVAL_PROGRESS",
  "ts": "2026-04-10T18:05:03Z",
  "data": {
    "progress_pct": 35,
    "stage": "noise_removal",
    "time_processed_s": 3.2,
    "estimated_remaining_s": 6,
    "snr_current_db": 6.8,
    "calls_detected_so_far": 18
  }
}
```

#### CALL_DETECTED
Sent each time a new elephant call is identified.
```json
{
  "type": "CALL_DETECTED",
  "ts": "2026-04-10T18:05:04Z",
  "data": {
    "call_id": "call_001a_018",
    "call_type": "trumpet",
    "start_ms": 28140,
    "duration_ms": 840,
    "frequency_hz_min": 5000,
    "frequency_hz_max": 14000,
    "confidence": 0.89,
    "snr_improvement_db": 7.2,
    "message": "Trumpet call detected (confidence 0.89)"
  }
}
```

#### QUALITY_SCORE
Sent periodically with audio quality metrics.
```json
{
  "type": "QUALITY_SCORE",
  "ts": "2026-04-10T18:05:06Z",
  "data": {
    "overall_quality_pct": 84,
    "snr_improvement_db": 7.8,
    "noise_reduction_pct": 82,
    "call_clarity_improvement_pct": 76,
    "artifacts_detected": 0
  }
}
```

#### PROCESSING_COMPLETE
Sent when processing finishes successfully.
```json
{
  "type": "PROCESSING_COMPLETE",
  "ts": "2026-04-10T18:05:08Z",
  "data": {
    "recording_id": "rec_001a",
    "total_duration_s": 8,
    "calls_detected": 34,
    "snr_improvement_db": 8.2,
    "final_quality_pct": 87,
    "confidence_avg": 0.87,
    "message": "Processing complete. 34 calls detected."
  }
}
```

#### PROCESSING_FAILED
Sent if processing encounters an error.
```json
{
  "type": "PROCESSING_FAILED",
  "ts": "2026-04-10T18:05:07Z",
  "data": {
    "recording_id": "rec_001a",
    "error_code": "CUDA_OUT_OF_MEMORY",
    "message": "GPU memory exhausted. Try reducing resolution or batch size.",
    "retry_recommended": true
  }
}
```

---

## Global Activity Feed

**Endpoint:** `ws://localhost:8000/ws/live`

### Server → Client Events

#### PLATFORM_ACTIVITY
Sent every 10s with aggregated platform activity.
```json
{
  "type": "PLATFORM_ACTIVITY",
  "ts": "2026-04-10T18:05:10Z",
  "data": {
    "active_users": 12,
    "recordings_processing": 4,
    "calls_detected_last_10m": 187,
    "recent_completions": [
      {"recording_id": "rec_045a", "calls_detected": 28, "duration_s": 523},
      {"recording_id": "rec_044a", "calls_detected": 41, "duration_s": 1247}
    ]
  }
}
```

---

## Error Handling

All endpoints return errors in this standard format:
```json
{
  "error": {
    "code": "ERROR_CODE",
    "message": "Human-readable error message",
    "status": 400,
    "details": { "optional_context": "..." }
  }
}
```

| Code | Status | When |
|------|--------|------|
| `INVALID_FILE_FORMAT` | 400 | Unsupported audio format |
| `FILE_SIZE_EXCEEDED` | 413 | File or batch exceeds size limit |
| `INVALID_PARAMETERS` | 400 | Bad request parameters |
| `RECORDING_NOT_FOUND` | 404 | Recording ID doesn't exist |
| `CALL_NOT_FOUND` | 404 | Call ID doesn't exist |
| `ALREADY_PROCESSING` | 409 | Recording is already being processed |
| `RECORDING_NOT_COMPLETE` | 404 | Recording hasn't finished processing |
| `PROCESSING_FAILED` | 500 | Processing encountered an error |
| `GPU_UNAVAILABLE` | 503 | GPU device not available |
| `RATE_LIMITED` | 429 | Too many requests |
| `INTERNAL_ERROR` | 500 | Unexpected server error |

---

## Bioacoustics Model Integration

### EchoNet Call Detection Model

**Version:** V3.2 (optimized for African elephant vocalizations)

**Supported Call Types:**
- `rumble` — Low-frequency contact calls (8-15 kHz)
- `trumpet` — High-pitched alarm/excitement calls (5-14 kHz)
- `chirp` — Short ultrasonic contact calls (10-20 kHz)
- `roar` — Loud aggression/threat calls (2-10 kHz)
- `infrasound` — Subsonic rumbles (< 20 Hz, detected via harmonics)
- `other` — Unclassified vocalizations

**Acoustic Feature Extraction:**
```python
# Per 512-sample window:
- Mel-scaled spectrogram (256 bins)
- MFCC coefficients (13 features)
- Spectral centroid & bandwidth
- Zero-crossing rate
- Temporal derivatives (delta, delta-delta)
```

**Confidence Thresholds:**
- Minimum detection confidence: 0.50 (configurable)
- High confidence: 0.85+
- Publishing threshold: 0.75+ recommended

---

## Audio Format Support

| Format | Codec | Sample Rate | Bit Depth | Supported | Notes |
|--------|-------|-------------|-----------|-----------|-------|
| WAV | PCM | 16-48 kHz | 16-32 bit | Yes | Preferred format |
| MP3 | MP3 | 44.1-48 kHz | 128-320 kbps | Yes | Transcoded to WAV |
| FLAC | FLAC | 16-48 kHz | 16-24 bit | Yes | Lossless |
| OGG | Vorbis | 44.1-48 kHz | Variable | Yes | Transcoded to WAV |
| M4A | AAC | 44.1-48 kHz | 128-256 kbps | Limited | Transcoding may degrade calls |

**Recommended:** WAV PCM 16-bit 48 kHz for research-grade recordings.

---

## Rate Limiting

All endpoints follow these limits:

| Endpoint | Limit | Window |
|----------|-------|--------|
| POST /api/upload | 10 files | Per hour |
| GET /api/recordings | 1000 requests | Per hour |
| POST /api/batch/process | 5 batches | Per hour |
| WebSocket connections | 50 concurrent | Per user |

Exceeding limits returns 429 with `Retry-After` header.

---

## Demo Mode

For presentation and testing, demo endpoints with pre-computed results are available:

#### GET /api/demo/results/{recording_name}
Returns instant pre-cached processing results.

**Recording Names:**
- `amboseli_demo` — 923s Amboseli recording, 34 calls
- `hwange_demo` — 1847s Hwange recording, 67 calls
- `chobe_demo` — 547s Chobe recording, 12 calls

**Response 200:**
```json
{
  "id": "demo_001",
  "status": "complete",
  "calls_detected": 34,
  "snr_improvement_db": 8.2,
  "message": "Demo recording - instant results"
}
```

---

*Last updated: April 10, 2026*
