# EchoField API Specification

Authoritative API contract for the currently implemented FastAPI backend and frontend client.

## Base URLs

- Backend HTTP: http://localhost:8000
- Backend WebSocket: ws://localhost:8000/ws
- OpenAPI docs: http://localhost:8000/docs

## Error Shape

The API currently uses FastAPI default HTTPException payloads:

```json
{
  "detail": "Recording not found"
}
```

Validation errors use FastAPI validation format with detail arrays.

## REST Endpoints

### Health

#### GET /health
Returns service health and backend version.

Response 200:

```json
{
  "status": "healthy",
  "version": "0.2.0"
}
```

### Upload and Recordings

#### POST /api/upload
Upload one audio file per request.

Request:
- `multipart/form-data` field: `file`
- Optional query params: `location`, `date`, `notes`

Supported file extensions: `.wav`, `.mp3`, `.flac`

Response 201:

```json
{
  "status": "pending",
  "recording_ids": ["uuid"],
  "count": 1,
  "total_duration_s": 12.345,
  "message": "Uploaded sample.wav"
}
```

#### GET /api/recordings
List recordings with pagination and optional filters.

Query params:
- `limit` (default `50`, min `1`, max `200`)
- `offset` (default `0`)
- `status` (`pending|processing|complete|failed`)
- `location` (substring match)

Response 200:

```json
{
  "total": 44,
  "returned": 44,
  "recordings": [
    {
      "id": "uuid",
      "filename": "example.wav",
      "duration_s": 45.833,
      "filesize_mb": 7.12,
      "uploaded_at": "2026-04-11T00:00:00+00:00",
      "status": "pending",
      "metadata": {
        "call_id": "061220-24_airplane_01",
        "animal_id": "061220-24",
        "noise_type_ref": "airplane",
        "start_sec": 0.0,
        "end_sec": 45.833,
        "location": null,
        "date": null
      },
      "processing": {
        "started_at": null,
        "completed_at": null,
        "progress_pct": 0,
        "duration_s": null,
        "current_stage": null
      },
      "calls_detected": 0,
      "snr_improvement_db": null
    }
  ]
}
```

#### GET /api/recordings/{recording_id}
Get full recording detail including processing result when available.

Response 200:

```json
{
  "id": "uuid",
  "filename": "example.wav",
  "status": "complete",
  "metadata": {
    "call_id": "061220-24_airplane_01",
    "animal_id": "061220-24",
    "noise_type_ref": "airplane",
    "start_sec": 0.0,
    "end_sec": 45.833
  },
  "processing": {
    "progress_pct": 100,
    "current_stage": "complete"
  },
  "result": {
    "status": "complete",
    "quality": {
      "snr_before_db": 4.1,
      "snr_after_db": 12.2,
      "snr_improvement_db": 8.1,
      "quality_score": 86.7
    },
    "calls": []
  }
}
```

#### GET /api/recordings/{recording_id}/status
Lightweight progress endpoint for polling job status.

Response 200:

```json
{
  "id": "uuid",
  "status": "processing",
  "progress_pct": 67,
  "stage": "noise_classification",
  "elapsed_s": 4.12,
  "estimated_remaining_s": 2.03,
  "message": "Processing in progress"
}
```

#### POST /api/recordings/{recording_id}/process
Start processing for one recording.

Query params:
- `method` (default from config)
- `aggressiveness` (`0.1` to `5.0`, default `1.5`)

Response 200:

```json
{
  "id": "uuid",
  "status": "processing",
  "method": "hybrid"
}
```

#### POST /api/batch/process
Queue multiple recordings for processing.

Request body:

```json
{
  "recording_ids": ["id1", "id2"],
  "method": "hybrid",
  "aggressiveness": 1.5
}
```

Response 200:

```json
{
  "queued": 2,
  "status": "processing"
}
```

### Media Retrieval

#### GET /api/recordings/{recording_id}/spectrogram
Get generated spectrogram image.

Query param:
- `type`: `before|after|comparison` (default `after`)

Response 200: PNG file

#### GET /api/recordings/{recording_id}/audio
Get source or cleaned audio file.

Query param:
- `type`: `original|cleaned` (default `cleaned`)

Response 200: audio file

#### GET /api/recordings/{recording_id}/download
Alias for cleaned audio download.

Response 200: audio file

### Stats and Calls

#### GET /api/stats
Get dashboard summary statistics.

Response 200:

```json
{
  "total_recordings": 44,
  "total_calls": 212,
  "avg_snr_improvement": 7.8,
  "success_rate": 0.95,
  "processing_time_avg": 3.4
}
```

#### GET /api/calls
List detected calls across recordings.

Query params:
- `limit` (default `50`, max `500`)
- `offset` (default `0`)
- `call_type` (optional exact match)
- `recording_id` (optional)

Response 200:

```json
{
  "calls": [
    {
      "id": "rec-1-call-0",
      "recording_id": "rec-1",
      "call_type": "rumble",
      "start_ms": 0.0,
      "duration_ms": 1320.0,
      "frequency_min_hz": 8.0,
      "frequency_max_hz": 1200.0,
      "confidence": 0.83,
      "call_id": "061220-24_airplane_01",
      "animal_id": "061220-24",
      "noise_type_ref": "airplane",
      "start_sec": 0.0,
      "end_sec": 45.833
    }
  ],
  "items": [
    {
      "id": "rec-1-call-0"
    }
  ],
  "total": 1
}
```

Note: `items` is retained for backward compatibility; frontend should consume `calls` first.

#### GET /api/calls/{call_id}
Get one call by ID.

Response 200: call object

### Export

#### POST /api/export/research
Export selected or all recordings.

Request body:

```json
{
  "format": "csv",
  "recording_ids": [],
  "include_audio": true,
  "include_spectrograms": false
}
```

Supported formats: `csv|json|zip|pdf`

Response 200: stream or file download depending on format.

## WebSocket Endpoints

### ws://localhost:8000/ws/live
Global broadcast stream for all recording events.

### ws://localhost:8000/ws/processing/{recording_id}
Per-recording processing stream.

## WebSocket Message Types

All websocket messages include:

```json
{
  "type": "EVENT_TYPE",
  "recording_id": "uuid",
  "data": {},
  "timestamp": "...",
  "sequence": 1
}
```

Event types used by frontend:
- `PROCESSING_STARTED`
- `STAGE_UPDATE`
- `NOISE_CLASSIFIED`
- `SPECTROGRAM_UPDATE`
- `QUALITY_SCORE`
- `PROCESSING_COMPLETE`
- `PROCESSING_FAILED`
- `PING`

Pipeline stage values emitted in `STAGE_UPDATE.data.stage`:
- `ingestion`
- `spectrogram`
- `noise_classification`
- `noise_removal`
- `feature_extraction`
- `quality_assessment`
- `complete`

## Deferred / Not Implemented

These endpoints are intentionally not implemented in the current app build:
- `GET /api/batch/{batch_id}/status`
- Multi-file upload under one `POST /api/upload` request body field `files`
- JSON/SVG spectrogram payloads (`format=json|svg`)

Use `POST /api/batch/process` plus per-recording status (`GET /api/recordings/{id}/status`) or websocket updates instead.
