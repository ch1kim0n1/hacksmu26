"""Pydantic models shared by the EchoField API and pipeline."""

from __future__ import annotations

from datetime import datetime
from enum import Enum
from typing import Any

from pydantic import BaseModel, ConfigDict, Field, HttpUrl, field_validator

AUDIO_FORMATS = {"wav", "mp3", "flac"}
MAX_FILESIZE_MB = 500.0


class RecordingStatus(str, Enum):
    pending = "pending"
    processing = "processing"
    complete = "complete"
    failed = "failed"
    cancelled = "cancelled"


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
    recorded_at: str | None = Field(default=None, examples=["2026-04-11T05:30:00Z"])
    microphone_type: str | None = Field(default=None, examples=["Parabolic"])
    notes: str | None = None
    species: str | None = Field(default=None, examples=["African bush elephant"])
    call_id: str | None = None
    animal_id: str | None = None
    noise_type_ref: str | None = Field(default=None, examples=["vehicle"])
    start_sec: float | None = Field(default=None, ge=0.0)
    end_sec: float | None = Field(default=None, ge=0.0)


class MetadataPatchRequest(EchoBaseModel):
    location: str | None = None
    date: str | None = None
    recorded_at: str | None = None
    microphone_type: str | None = None
    notes: str | None = None
    species: str | None = None
    call_id: str | None = None
    animal_id: str | None = None
    noise_type_ref: str | None = None
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
    call_id: str | None = None
    animal_id: str | None = None
    noise_type_ref: str | None = None
    start_sec: float | None = Field(default=None, ge=0.0)
    end_sec: float | None = Field(default=None, ge=0.0)
    start_ms: float = Field(ge=0.0)
    duration_ms: float = Field(ge=0.0)
    frequency_min_hz: float = Field(ge=0.0)
    frequency_max_hz: float = Field(ge=0.0)
    call_type: str
    confidence: float = Field(ge=0.0, le=1.0)
    confidence_tier: str | None = None
    detector_backend: str | None = None
    classifier_backend: str | None = None
    model_version: str | None = None
    anomaly_score: float | None = Field(default=None, ge=0.0, le=1.0)
    prediction_uncertainty: float | None = Field(default=None, ge=0.0)
    call_type_hierarchy: dict[str, Any] | None = None
    review_label: str | None = None
    review_status: str | None = None
    original_call_type: str | None = None
    corrected_call_type: str | None = None
    reviewed_by: str | None = None
    reviewed_at: str | None = None
    individual_id: str | None = None
    cluster_id: str | None = None
    fingerprint: list[float] = Field(default_factory=list)
    fingerprint_version: str | None = None
    sequence_id: str | None = None
    sequence_position: int | None = None
    color: str | None = None
    annotations: list[dict[str, Any]] = Field(default_factory=list)
    location: str | None = None
    date: str | None = None
    species: str | None = None
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
    validation_warnings: list[str] = Field(default_factory=list)
    markers: list[dict[str, Any]] = Field(default_factory=list)
    sequences: list[dict[str, Any]] = Field(default_factory=list)
    recurring_patterns: list[dict[str, Any]] = Field(default_factory=list)
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
    duplicate: bool = False


class BatchSubmitResponse(EchoBaseModel):
    batch_id: str
    queued: int = Field(ge=0)
    status: str


class BatchRecordingStatus(EchoBaseModel):
    recording_id: str
    status: str
    progress_pct: float = Field(default=0.0, ge=0.0, le=100.0)
    error: str | None = None


class BatchStatusResponse(EchoBaseModel):
    batch_id: str
    total: int = Field(ge=0)
    completed: int = Field(ge=0)
    failed: int = Field(ge=0)
    cancelled: int = Field(default=0, ge=0)
    status: str
    created_at: str
    updated_at: str
    results: list[BatchRecordingStatus] = Field(default_factory=list)


class BatchRecordingSummary(EchoBaseModel):
    recording_id: str
    filename: str | None = None
    calls_detected: int = Field(default=0, ge=0)
    dominant_call_type: str | None = None
    quality_score: float | None = None
    snr_improvement_db: float | None = None
    status: str | None = None


class BatchSummaryResponse(EchoBaseModel):
    batch_id: str
    status: str
    recordings: int = Field(ge=0)
    total_calls_detected: int = Field(ge=0)
    call_type_distribution: dict[str, int] = Field(default_factory=dict)
    quality_scores: dict[str, float | None] = Field(default_factory=dict)
    avg_snr_improvement_db: float | None = None
    total_processing_time_s: float = Field(default=0.0, ge=0.0)
    recordings_summary: list[BatchRecordingSummary] = Field(default_factory=list)
    shared_patterns: list[dict[str, Any]] = Field(default_factory=list)


class RecordingListResponse(EchoBaseModel):
    total: int = Field(ge=0)
    returned: int = Field(ge=0)
    recordings: list[RecordingSummary]


class ExportRequest(EchoBaseModel):
    format: str = Field(default="csv", examples=["csv"])
    recording_ids: list[str] = Field(default_factory=list)
    call_types: list[str] = Field(default_factory=list)
    min_confidence: float | None = Field(default=None, ge=0.0, le=1.0)
    include_audio: bool = True
    include_spectrograms: bool = False
    include_fingerprints: bool = True
    include_audio_clips: bool = False

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
    circuit_breakers: dict[str, Any] = Field(default_factory=dict)


class ComponentHealth(EchoBaseModel):
    status: str
    details: dict[str, Any] = Field(default_factory=dict)


class HealthResponse(EchoBaseModel):
    status: str
    version: str
    components: dict[str, ComponentHealth] = Field(default_factory=dict)


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


class HarmonicOverlayResponse(EchoBaseModel):
    recording_id: str
    fundamental_frequency_hz: float
    harmonic_peaks_hz: list[float] = Field(default_factory=list)
    harmonic_count: int = Field(ge=0)
    harmonic_to_noise_ratio_db: float
    harmonicity: float


class SimilarityNode(EchoBaseModel):
    id: str
    label: str
    community_id: int | None = None
    degree_centrality: float | None = Field(default=None, ge=0.0)
    betweenness_centrality: float | None = Field(default=None, ge=0.0)


class SimilarityEdge(EchoBaseModel):
    source: str
    target: str
    weight: float = Field(ge=0.0, le=1.0)


class SimilarityGraphResponse(EchoBaseModel):
    nodes: list[SimilarityNode] = Field(default_factory=list)
    edges: list[SimilarityEdge] = Field(default_factory=list)
    total_calls: int = Field(ge=0)
    threshold: float


class ContourMatch(EchoBaseModel):
    call_id: str
    call_type: str
    similarity: float = Field(ge=0.0, le=1.0)
    recording_id: str | None = None


class ContourMatchResponse(EchoBaseModel):
    query_call_id: str
    matches: list[ContourMatch] = Field(default_factory=list)
    total_compared: int = Field(default=0, ge=0)


class ReviewLabelRequest(EchoBaseModel):
    label: str = Field(min_length=1)
    reviewed_by: str | None = None


class ReviewActionRequest(EchoBaseModel):
    action: str = Field(pattern="^(confirm|reclassify|discard)$")
    corrected_call_type: str | None = None
    reviewer: str | None = None


class InfrasoundRevealRequest(EchoBaseModel):
    shift_octaves: int = Field(default=3, ge=1, le=5)
    method: str = Field(default="phase_vocoder", pattern="^(phase_vocoder|resample)$")
    mix_mode: str = Field(default="shifted_only", pattern="^(shifted_only|blended|side_by_side)$")


class InfrasoundRegion(EchoBaseModel):
    start_ms: float = Field(ge=0.0)
    end_ms: float = Field(ge=0.0)
    estimated_f0_hz: float = Field(ge=0.0)
    shifted_f0_hz: float | None = Field(default=None, ge=0.0)
    energy_db: float


class InfrasoundRevealResponse(EchoBaseModel):
    recording_id: str
    infrasound_detected: bool
    infrasound_regions: list[InfrasoundRegion] = Field(default_factory=list)
    shifted_audio_url: str
    shift_octaves: int
    frequency_range_original_hz: tuple[float, float]
    frequency_range_shifted_hz: tuple[float, float]
    infrasound_energy_pct: float
    method: str
    mix_mode: str


class EmotionTimelinePoint(EchoBaseModel):
    time_ms: float = Field(ge=0.0)
    state: str
    arousal: float = Field(ge=0.0, le=1.0)
    valence: float = Field(ge=0.0, le=1.0)
    color: str
    call_id: str | None = None


class EmotionEstimate(EchoBaseModel):
    call_id: str | None = None
    call_type: str | None = None
    state: str
    arousal: float = Field(ge=0.0, le=1.0)
    valence: float = Field(ge=0.0, le=1.0)
    confidence: float = Field(ge=0.0, le=1.0)
    color: str
    description: str
    start_ms: float | None = None
    end_ms: float | None = None


class EmotionTimelineResponse(EchoBaseModel):
    recording_id: str
    duration_ms: float = Field(ge=0.0)
    resolution_ms: float = Field(ge=100.0)
    timeline: list[EmotionTimelinePoint] = Field(default_factory=list)
    call_emotions: list[EmotionEstimate] = Field(default_factory=list)
    recording_summary: dict[str, Any]


class CrossSpeciesRequest(EchoBaseModel):
    elephant_call_id: str
    reference_id: str


class CrossSpeciesComparisonResponse(EchoBaseModel):
    elephant_call: dict[str, Any]
    reference: dict[str, Any]
    comparison: dict[str, Any]
    visualizations: dict[str, str]
    feature_comparison: dict[str, Any]


class ReviewQueueResponse(EchoBaseModel):
    total: int = Field(ge=0)
    returned: int = Field(ge=0)
    items: list[CallRecord] = Field(default_factory=list)


class ModelVersionInfo(EchoBaseModel):
    version: str
    active: bool = False
    model_path: str
    metadata_path: str | None = None
    trained_at: str | None = None
    samples: int | None = None
    classes: int | None = None
    accuracy: float | None = None
    ece: float | None = None
    class_distribution: dict[str, int] = Field(default_factory=dict)


class EmbeddingPoint(EchoBaseModel):
    call_id: str
    x: float
    y: float
    call_type: str
    confidence: float = Field(ge=0.0, le=1.0)


class EmbeddingResponse(EchoBaseModel):
    method: str
    points: list[EmbeddingPoint] = Field(default_factory=list)
    total: int = Field(ge=0)


class StatsRequest(EchoBaseModel):
    group_a_ids: list[str] = Field(min_length=1)
    group_b_ids: list[str] = Field(min_length=1)


class FeatureTestResult(EchoBaseModel):
    feature: str
    group_a_mean: float
    group_b_mean: float
    mann_whitney_u: float
    p_value: float
    p_value_corrected: float
    cohen_d: float
    ci95_low: float
    ci95_high: float
    significant: bool


class ResearchStatsResponse(EchoBaseModel):
    group_a_count: int = Field(ge=0)
    group_b_count: int = Field(ge=0)
    alpha: float = Field(default=0.05, ge=0.0, le=1.0)
    correction: str = "bonferroni"
    results: list[FeatureTestResult] = Field(default_factory=list)
    significant_features: list[str] = Field(default_factory=list)


class AnnotationRequest(EchoBaseModel):
    note: str = Field(min_length=1)
    tags: list[str] = Field(default_factory=list)
    researcher_id: str | None = None


class CallAnnotation(EchoBaseModel):
    id: str
    call_id: str
    note: str
    tags: list[str] = Field(default_factory=list)
    researcher_id: str | None = None
    created_at: str


class IndividualProfile(EchoBaseModel):
    individual_id: str
    cluster_id: str | None = None
    suggested_label: str | None = None
    confidence: float | None = Field(default=None, ge=0.0, le=1.0)
    call_count: int = Field(ge=0)
    call_ids: list[str] = Field(default_factory=list)
    recording_ids: list[str] = Field(default_factory=list)
    dates: list[str] = Field(default_factory=list)
    signature_mean: list[float] = Field(default_factory=list)
    signature_std: list[float] = Field(default_factory=list)
    acoustic_profile: dict[str, Any] = Field(default_factory=dict)
    call_type_distribution: dict[str, int] = Field(default_factory=dict)


class CallMarker(EchoBaseModel):
    id: str
    start_ms: float = Field(ge=0.0)
    end_ms: float = Field(ge=0.0)
    duration_ms: float = Field(ge=0.0)
    call_type: str
    confidence: float = Field(ge=0.0, le=1.0)
    color: str
    acoustic_features: dict[str, Any] = Field(default_factory=dict)


class MarkerResponse(EchoBaseModel):
    recording_id: str
    total_markers: int = Field(ge=0)
    markers: list[CallMarker] = Field(default_factory=list)
    summary: dict[str, int] = Field(default_factory=dict)


class CallSequenceModel(EchoBaseModel):
    id: str
    recording_id: str
    calls: list[str] = Field(default_factory=list)
    pattern: str
    total_duration_ms: float = Field(ge=0.0)
    inter_call_gaps_ms: list[float] = Field(default_factory=list)


class PatternModel(EchoBaseModel):
    pattern_id: str
    motif: list[str] = Field(default_factory=list)
    pattern: str
    occurrences: int = Field(ge=0)
    recordings: list[str] = Field(default_factory=list)
    avg_gap_ms: float = Field(default=0.0, ge=0.0)


class CallSimilarityMatch(EchoBaseModel):
    call_id: str
    recording_id: str | None = None
    call_type: str
    similarity: float = Field(ge=-1.0, le=1.0)


class SimilarCallsResponse(EchoBaseModel):
    query_call_id: str
    matches: list[CallSimilarityMatch] = Field(default_factory=list)
    fingerprint_version: str = "v1"


class IndividualCluster(EchoBaseModel):
    cluster_id: str
    suggested_label: str
    call_ids: list[str] = Field(default_factory=list)
    recording_ids: list[str] = Field(default_factory=list)
    centroid: list[float] = Field(default_factory=list)
    confidence: float = Field(ge=0.0, le=1.0)
    acoustic_profile: dict[str, Any] = Field(default_factory=dict)
    call_type_distribution: dict[str, int] = Field(default_factory=dict)


class IndividualMatch(EchoBaseModel):
    individual_a: str
    individual_b: str
    similarity: float = Field(ge=-1.0, le=1.0)
    recording_a: str | None = None
    recording_b: str | None = None


class ActivityHeatmapResponse(EchoBaseModel):
    heatmap: dict[str, Any]
    total_calls: int = Field(ge=0)
    recordings_analyzed: int = Field(ge=0)
    date_range: dict[str, str | None] = Field(default_factory=dict)


class NoiseSource(EchoBaseModel):
    noise_type: str
    occurrence_rate: float = Field(ge=0.0, le=1.0)
    avg_frequency_range_hz: tuple[float, float]
    avg_energy_db: float
    temporal_pattern: dict[str, Any] | None = None


class TimeWindow(EchoBaseModel):
    start_hour: int = Field(ge=0, le=23)
    end_hour: int = Field(ge=0, le=24)
    avg_noise_db: float
    dominant_noise: str | None = None


class SiteSummary(EchoBaseModel):
    location: str
    recording_count: int = Field(ge=0)


class SiteNoiseProfile(EchoBaseModel):
    location: str
    recordings_analyzed: int = Field(ge=0)
    date_range: tuple[str | None, str | None]
    noise_sources: list[NoiseSource] = Field(default_factory=list)
    noise_floor_db: float
    optimal_windows: list[TimeWindow] = Field(default_factory=list)
    recommendations: list[str] = Field(default_factory=list)


class WebhookConfig(EchoBaseModel):
    id: str | None = None
    url: HttpUrl
    event_type: str = Field(pattern="^(processing.complete|processing.failed|batch.complete)$")
    created_at: str | None = None


class WebhookEvent(EchoBaseModel):
    event_type: str
    recording_id: str | None = None
    batch_id: str | None = None
    status: str
    quality: dict[str, Any] | None = None
    payload: dict[str, Any] = Field(default_factory=dict)
    timestamp: str = Field(default_factory=lambda: datetime.utcnow().isoformat() + "Z")
