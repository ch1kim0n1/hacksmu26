"""
EchoField Pydantic v2 models for the REST / WebSocket API.
"""

from __future__ import annotations

from datetime import datetime
from enum import Enum
from typing import Any, Optional

from pydantic import BaseModel, Field


# ---------------------------------------------------------------------------
# Enums
# ---------------------------------------------------------------------------

class RecordingStatus(str, Enum):
    """Processing lifecycle state for a recording."""
    pending = "pending"
    processing = "processing"
    complete = "complete"
    failed = "failed"


class ProcessingStage(str, Enum):
    """Individual stage within the processing pipeline."""
    ingestion = "ingestion"
    spectrogram = "spectrogram"
    noise_classification = "noise_classification"
    noise_removal = "noise_removal"
    quality_assessment = "quality_assessment"
    complete = "complete"


# ---------------------------------------------------------------------------
# Upload / Metadata
# ---------------------------------------------------------------------------

class RecordingMetadata(BaseModel):
    """User-supplied metadata attached to a recording at upload time."""
    location: Optional[str] = None
    date: Optional[str] = None
    microphone_type: Optional[str] = None
    notes: Optional[str] = None


class UploadResponse(BaseModel):
    """Response returned after one or more audio files are uploaded."""
    status: str
    recording_ids: list[str]
    count: int
    total_duration_s: float
    message: str


# ---------------------------------------------------------------------------
# Recording list / summary
# ---------------------------------------------------------------------------

class RecordingSummary(BaseModel):
    """Compact representation of a recording shown in list views."""
    id: str
    filename: str
    duration_s: float
    filesize_mb: float
    uploaded_at: str
    status: RecordingStatus
    metadata: Optional[RecordingMetadata] = None
    processing_progress: float = Field(
        default=0.0,
        ge=0.0,
        le=100.0,
        description="Processing progress as a percentage 0-100",
    )
    calls_detected: int = 0
    snr_improvement_db: Optional[float] = None


class RecordingListResponse(BaseModel):
    """Paginated list of recordings."""
    total: int
    returned: int
    recordings: list[RecordingSummary]


# ---------------------------------------------------------------------------
# Processing details
# ---------------------------------------------------------------------------

class NoiseType(BaseModel):
    """A categorized noise source detected in a recording."""
    type: str
    percentage: float = Field(
        ge=0.0,
        le=100.0,
        description="Percentage of total noise energy attributed to this type",
    )
    frequency_range: tuple[float, float] = Field(
        description="Min and max frequency in Hz",
    )


class QualityMetrics(BaseModel):
    """Before/after quality measurements for a processed recording."""
    snr_before_db: float
    snr_after_db: float
    snr_improvement_db: float
    energy_preservation: float = Field(
        ge=0.0,
        le=1.0,
        description="Fraction of original signal energy preserved (0-1)",
    )
    spectral_distortion: float = Field(
        ge=0.0,
        description="Spectral distortion metric (lower is better)",
    )
    quality_score: float = Field(
        ge=0.0,
        le=1.0,
        description="Overall quality score (0-1)",
    )


class CallDetail(BaseModel):
    """A single detected elephant vocalization within a recording."""
    id: str
    recording_id: str
    start_ms: float
    duration_ms: float
    frequency_min_hz: float
    frequency_max_hz: float
    call_type: str
    confidence: float = Field(ge=0.0, le=1.0)
    acoustic_features: Optional[dict[str, Any]] = None


class ProcessingResult(BaseModel):
    """Full processing result returned when a recording is complete."""
    recording_id: str
    status: RecordingStatus
    stages_completed: list[str]
    noise_types: list[NoiseType] = Field(default_factory=list)
    quality: QualityMetrics
    calls: list[CallDetail] = Field(default_factory=list)
    processing_time_s: float


# ---------------------------------------------------------------------------
# Export
# ---------------------------------------------------------------------------

class ExportRequest(BaseModel):
    """Client request to export one or more processed recordings."""
    format: str = Field(
        description="Export format: wav, mp3, webm, or json_metadata",
    )
    recording_ids: list[str]
    include_audio: bool = True
    include_spectrograms: bool = False


# ---------------------------------------------------------------------------
# Stats / Dashboard
# ---------------------------------------------------------------------------

class StatsResponse(BaseModel):
    """Aggregate statistics for the dashboard."""
    total_recordings: int
    total_calls: int
    avg_snr_improvement: float
    success_rate: float = Field(
        ge=0.0,
        le=1.0,
        description="Fraction of recordings that processed successfully",
    )
    processing_time_avg: float = Field(
        description="Average processing time in seconds",
    )


# ---------------------------------------------------------------------------
# WebSocket
# ---------------------------------------------------------------------------

class WSMessage(BaseModel):
    """Message sent over WebSocket for real-time progress updates."""
    type: str
    recording_id: str
    data: dict[str, Any] = Field(default_factory=dict)
    timestamp: str = Field(
        default_factory=lambda: datetime.utcnow().isoformat() + "Z",
    )


# ---------------------------------------------------------------------------
# Errors
# ---------------------------------------------------------------------------

class ErrorResponse(BaseModel):
    """Standard error payload returned by the API."""
    code: str
    message: str
    status: int
