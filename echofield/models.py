"""Pydantic models shared by the EchoField API and pipeline."""

from __future__ import annotations

from datetime import datetime
from enum import Enum
from typing import Any

from pydantic import BaseModel, ConfigDict, Field, field_validator

AUDIO_FORMATS = {"wav", "mp3", "flac"}
MAX_FILESIZE_MB = 500.0


class RecordingStatus(str, Enum):
    pending = "pending"
    processing = "processing"
    complete = "complete"
    failed = "failed"


class ProcessingStage(str, Enum):
    ingestion = "ingestion"
    spectrogram = "spectrogram"
    noise_classification = "noise_classification"
    noise_removal = "noise_removal"
    feature_extraction = "feature_extraction"
    quality_assessment = "quality_assessment"
    complete = "complete"


class EchoBaseModel(BaseModel):
    model_config = ConfigDict(
        use_enum_values=True,
        json_schema_extra={"examples": []},
    )


class RecordingMetadata(EchoBaseModel):
    location: str | None = Field(default=None, examples=["Amboseli, Kenya"])
    date: str | None = Field(default=None, examples=["2026-04-11"])
    microphone_type: str | None = Field(default=None, examples=["Parabolic"])
    notes: str | None = None
    species: str | None = Field(default=None, examples=["African bush elephant"])
    call_id: str | None = None
    animal_id: str | None = None
    noise_type_ref: str | None = Field(default=None, examples=["vehicle"])
    start_sec: float | None = Field(default=None, ge=0.0)
    end_sec: float | None = Field(default=None, ge=0.0)


class AudioFile(EchoBaseModel):
    id: str
    filename: str
    duration_s: float = Field(ge=0)
    filesize_mb: float = Field(ge=0, le=MAX_FILESIZE_MB)
    format: str

    @field_validator("format")
    @classmethod
    def validate_format(cls, value: str) -> str:
        normalized = value.lower().lstrip(".")
        if normalized not in AUDIO_FORMATS:
            raise ValueError(f"Unsupported audio format: {value}")
        return normalized


class ProcessingStatusModel(EchoBaseModel):
    started_at: str | None = None
    completed_at: str | None = None
    progress_pct: float = Field(default=0.0, ge=0.0, le=100.0)
    duration_s: float | None = Field(default=None, ge=0.0)
    current_stage: str | None = None


class NoiseType(EchoBaseModel):
    type: str
    percentage: float = Field(ge=0.0, le=100.0)
    frequency_range: tuple[float, float]


class QualityMetrics(EchoBaseModel):
    snr_before_db: float
    snr_after_db: float
    snr_improvement_db: float
    pesq: float | None = None
    peak_frequency_before_hz: float | None = None
    peak_frequency_after_hz: float | None = None
    spectral_distortion: float = Field(ge=0.0)
    energy_preservation: float = Field(ge=0.0, le=1.0)
    quality_score: float = Field(ge=0.0, le=100.0)
    quality_rating: str = Field(default="unknown")
    flagged_for_review: bool = False


class CallDetail(EchoBaseModel):
    id: str
    recording_id: str
    start_ms: float = Field(ge=0.0)
    duration_ms: float = Field(ge=0.0)
    frequency_min_hz: float = Field(ge=0.0)
    frequency_max_hz: float = Field(ge=0.0)
    call_type: str
    confidence: float = Field(ge=0.0, le=1.0)
    acoustic_features: dict[str, Any] = Field(default_factory=dict)
    metadata: dict[str, Any] = Field(default_factory=dict)


class CallRecord(CallDetail):
    animal_id: str | None = None
    location: str | None = None
    date: str | None = None


class CallListResponse(EchoBaseModel):
    total: int = Field(ge=0)
    returned: int = Field(ge=0)
    items: list[CallRecord] = Field(default_factory=list)


class ProcessingResult(EchoBaseModel):
    recording_id: str
    status: RecordingStatus
    stages_completed: list[str] = Field(default_factory=list)
    noise_types: list[NoiseType] = Field(default_factory=list)
    quality: QualityMetrics
    calls: list[CallDetail] = Field(default_factory=list)
    processing_time_s: float = Field(ge=0.0)
    output_audio_path: str | None = None
    spectrogram_before_path: str | None = None
    spectrogram_after_path: str | None = None
    export_metadata: dict[str, Any] = Field(default_factory=dict)


class DenoiseJob(EchoBaseModel):
    job_id: str
    recording_id: str
    method: str
    status: RecordingStatus
    progress: float = Field(ge=0.0, le=100.0)


class RecordingSummary(EchoBaseModel):
    id: str
    filename: str
    duration_s: float = Field(ge=0.0)
    filesize_mb: float = Field(ge=0.0, le=MAX_FILESIZE_MB)
    uploaded_at: str
    status: RecordingStatus
    metadata: RecordingMetadata | None = None
    processing: ProcessingStatusModel | None = None
    calls_detected: int = Field(default=0, ge=0)
    snr_improvement_db: float | None = None


class RecordingDetail(RecordingSummary):
    result: ProcessingResult | None = None


class UploadResponse(EchoBaseModel):
    status: str
    recording_ids: list[str]
    count: int
    total_duration_s: float = Field(ge=0.0)
    message: str


class RecordingListResponse(EchoBaseModel):
    total: int = Field(ge=0)
    returned: int = Field(ge=0)
    recordings: list[RecordingSummary]


class ExportRequest(EchoBaseModel):
    format: str = Field(default="csv", examples=["csv"])
    recording_ids: list[str] = Field(default_factory=list)
    include_audio: bool = True
    include_spectrograms: bool = False

    @field_validator("format")
    @classmethod
    def validate_export_format(cls, value: str) -> str:
        normalized = value.lower()
        if normalized not in {"csv", "json", "zip", "pdf"}:
            raise ValueError("Export format must be one of csv, json, zip, pdf")
        return normalized


class StatsResponse(EchoBaseModel):
    total_recordings: int = Field(ge=0)
    total_calls: int = Field(ge=0)
    avg_snr_improvement: float
    success_rate: float = Field(ge=0.0, le=1.0)
    processing_time_avg: float = Field(ge=0.0)


class WSMessage(EchoBaseModel):
    type: str
    recording_id: str
    data: dict[str, Any] = Field(default_factory=dict)
    timestamp: str = Field(
        default_factory=lambda: datetime.utcnow().isoformat() + "Z",
    )
    sequence: int | None = None


class ErrorResponse(EchoBaseModel):
    code: str
    message: str
    status: int
