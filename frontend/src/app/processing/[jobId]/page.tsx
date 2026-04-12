"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import dynamic from "next/dynamic";
import useProcessingJob from "@/hooks/useProcessingJob";
import {
  getEmotionTimeline,
  getRecording,
  getRecordingMarkers,
  revealInfrasound,
  API_BASE,
  type EmotionTimelineResponse,
  type InfrasoundRevealResponse,
  type MarkerResponse,
  type Recording,
} from "@/lib/audio-api";
import { AnalysisLabels, AnalysisWindow } from "@/components/research/AnalysisLabels";
import CrossSpeciesCompare from "@/components/research/CrossSpeciesCompare";
import EmotionTimeline from "@/components/research/EmotionTimeline";

const Spectrogram3D = dynamic(() => import("@/components/spectrogram/Spectrogram3D"), { ssr: false });

interface ProcessingMetrics {
  snr_before?: number;
  snr_after?: number;
  quality_score?: number;
  noise_reduction_db?: number;
}

const STAGES = [
  { key: "ingestion", label: "Ingestion" },
  { key: "spectrogram", label: "Spectrogram" },
  { key: "noise_classification", label: "Noise Classification" },
  { key: "noise_removal", label: "Noise Removal" },
  { key: "feature_extraction", label: "Feature Extraction" },
  { key: "quality_assessment", label: "Quality Assessment" },
  { key: "complete", label: "Complete" },
];

function ProcessingTimeline({ currentStage }: { currentStage: string }) {
  const currentIndex = STAGES.findIndex((s) => s.key === currentStage);
  const activeIndex = currentIndex >= 0 ? currentIndex : 0;

  return (
    <div className="flex items-center gap-1 w-full overflow-x-auto pb-2">
      {STAGES.map((stage, i) => {
        const isComplete = i < activeIndex || currentStage === "complete";
        const isCurrent = i === activeIndex && currentStage !== "complete";
        const isPending = i > activeIndex && currentStage !== "complete";

        return (
          <div key={stage.key} className="flex items-center flex-1 min-w-0">
            <div className="flex flex-col items-center gap-1.5 flex-shrink-0">
              <div
                className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold transition-all ${
                  isComplete
                    ? "bg-success text-white"
                    : isCurrent
                    ? "bg-accent-savanna text-ev-ivory ring-4 ring-accent-savanna/20"
                    : "bg-background-elevated text-ev-warm-gray"
                }`}
              >
                {isComplete ? (
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                  </svg>
                ) : (
                  i + 1
                )}
              </div>
              <span
                className={`text-[10px] font-medium text-center whitespace-nowrap ${
                  isCurrent
                    ? "text-accent-savanna"
                    : isComplete
                    ? "text-success"
                    : "text-ev-warm-gray"
                }`}
              >
                {stage.label}
              </span>
            </div>
            {i < STAGES.length - 1 && (
              <div
                className={`flex-1 h-0.5 mx-1 rounded-full min-w-[20px] ${
                  isComplete
                    ? "bg-success"
                    : isPending
                    ? "bg-ev-sand"
                    : "bg-accent-savanna/40"
                }`}
              />
            )}
          </div>
        );
      })}
    </div>
  );
}

function SkeletonImage() {
  return (
    <div className="w-full aspect-[2/1] bg-background-elevated rounded-xl animate-pulse flex items-center justify-center">
      <svg className="w-12 h-12 text-ev-warm-gray/30" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
      </svg>
    </div>
  );
}

function QualityBadge({ score }: { score: number }) {
  const label =
    score >= 90 ? "Excellent" : score >= 75 ? "Good" : score >= 50 ? "Fair" : "Poor";
  const color =
    score >= 90
      ? "text-success bg-success/10 border-success/20"
      : score >= 75
      ? "text-accent-savanna bg-accent-savanna/10 border-accent-savanna/20"
      : score >= 50
      ? "text-warning bg-warning/10 border-warning/20"
      : "text-danger bg-danger/10 border-danger/20";

  return (
    <div className={`inline-flex items-center gap-2 px-4 py-2 rounded-xl border ${color}`}>
      <span className="text-2xl font-bold">{score}</span>
      <span className="text-sm font-medium">{label}</span>
    </div>
  );
}

export default function ProcessingPage() {
  const params = useParams();
  const jobId = params.jobId as string;
  const processing = useProcessingJob(jobId || null);

  const [recording, setRecording] = useState<Recording | null>(null);
  const [markers, setMarkers] = useState<MarkerResponse | null>(null);
  const [emotionTimeline, setEmotionTimeline] = useState<EmotionTimelineResponse | null>(null);
  const [infrasound, setInfrasound] = useState<InfrasoundRevealResponse | null>(null);
  const [revealingInfrasound, setRevealingInfrasound] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [show3D, setShow3D] = useState(false);
  const [sliderPosition, setSliderPosition] = useState(50);
  const sliderRef = useRef<HTMLDivElement>(null);
  const isDraggingSlider = useRef(false);

  const fetchData = useCallback(async () => {
    try {
      setLoading(true);
      const data = await getRecording(jobId);
      setRecording(data);
      if (data.status === "complete") {
        getRecordingMarkers(jobId).then(setMarkers).catch(() => setMarkers(null));
        getEmotionTimeline(jobId).then(setEmotionTimeline).catch(() => setEmotionTimeline(null));
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load recording");
    } finally {
      setLoading(false);
    }
  }, [jobId]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  useEffect(() => {
    if (processing.status === "complete") {
      fetchData();
    }
  }, [processing.status, fetchData]);

  // Slider drag handling
  const handleSliderMove = useCallback((clientX: number) => {
    if (!sliderRef.current || !isDraggingSlider.current) return;
    const rect = sliderRef.current.getBoundingClientRect();
    const x = clientX - rect.left;
    const pct = Math.max(0, Math.min(100, (x / rect.width) * 100));
    setSliderPosition(pct);
  }, []);

  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => handleSliderMove(e.clientX);
    const handleMouseUp = () => {
      isDraggingSlider.current = false;
    };
    const handleTouchMove = (e: TouchEvent) => {
      if (e.touches.length > 0) handleSliderMove(e.touches[0].clientX);
    };
    const handleTouchEnd = () => {
      isDraggingSlider.current = false;
    };

    window.addEventListener("mousemove", handleMouseMove);
    window.addEventListener("mouseup", handleMouseUp);
    window.addEventListener("touchmove", handleTouchMove);
    window.addEventListener("touchend", handleTouchEnd);

    return () => {
      window.removeEventListener("mousemove", handleMouseMove);
      window.removeEventListener("mouseup", handleMouseUp);
      window.removeEventListener("touchmove", handleTouchMove);
      window.removeEventListener("touchend", handleTouchEnd);
    };
  }, [handleSliderMove]);

  const currentStage =
    recording?.status === "complete"
      ? "complete"
      : processing.currentStage || recording?.processing?.current_stage || recording?.status || "pending";
  const progress =
    recording?.status === "complete"
      ? 100
      : Math.max(processing.progress, Number(recording?.processing?.progress_pct ?? 0));
  const isComplete = recording?.status === "complete" || processing.status === "complete";
  const isProcessing =
    !isComplete &&
    (recording?.status === "processing" ||
      processing.status === "processing" ||
      processing.status === "connecting");
  const isFailed = recording?.status === "failed" || processing.status === "error";

  const spectrogramBefore = `${API_BASE}/api/recordings/${jobId}/spectrogram?type=before`;
  const spectrogramAfter = `${API_BASE}/api/recordings/${jobId}/spectrogram?type=after`;
  const audioOriginal = `${API_BASE}/api/recordings/${jobId}/audio?type=original`;
  const audioCleaned = `${API_BASE}/api/recordings/${jobId}/audio?type=cleaned`;
  const audioInfrasound = infrasound ? `${API_BASE}${infrasound.shifted_audio_url}` : null;

  const metricsFromLive: ProcessingMetrics | null = processing.quality
    ? {
        snr_before: processing.quality.snr_before,
        snr_after: processing.quality.snr_after,
        quality_score: processing.quality.score,
        noise_reduction_db: processing.quality.improvement,
      }
    : null;
  const quality = recording?.result?.quality;
  const metricsFromResult: ProcessingMetrics | null = quality
    ? {
        snr_before: quality.snr_before_db,
        snr_after: quality.snr_after_db,
        quality_score: quality.quality_score,
        noise_reduction_db: quality.snr_improvement_db,
      }
    : null;
  const metrics = metricsFromLive || metricsFromResult;
  const currentStageLabel = STAGES.find((stage) => stage.key === currentStage)?.label || "Processing";
  const liveEvents = processing.liveEvents ?? [];
  const liveNoiseType = processing.noiseType ?? null;
  const liveCallCount = processing.callCount ?? null;
  const eventLabels: Record<string, string> = {
    "spectrogram:rendering": "Rendering spectrogram",
    "spectrogram:before_complete": "Original spectrogram ready",
    "spectrogram:after_complete": "Cleaned spectrogram ready",
    "denoising:started": "Denoising started",
    "denoising:complete": "Denoising complete",
    "calls:detecting": "Detecting calls",
    "calls:detected": "Calls detected",
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-ev-ivory flex items-center justify-center">
        <div className="flex flex-col items-center gap-4">
          <div className="w-10 h-10 border-2 border-accent-savanna border-t-transparent rounded-full animate-spin" />
          <p className="text-ev-elephant">Loading recording...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen bg-ev-ivory flex items-center justify-center">
        <div className="text-center p-8">
          <p className="text-danger text-lg mb-4">{error}</p>
          <button
            onClick={fetchData}
            className="px-6 py-3 bg-ev-cream text-ev-charcoal rounded-xl hover:bg-background-elevated transition-colors"
          >
            Retry
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-ev-ivory">
      <div className="max-w-7xl mx-auto px-6 py-12">
        {/* Header */}
        <div className="flex items-center justify-between mb-8 flex-wrap gap-4">
          <div>
            <Link
              href="/upload"
              className="inline-flex items-center gap-2 text-ev-warm-gray hover:text-ev-elephant transition-colors mb-3"
            >
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
              </svg>
              Back to Recordings
            </Link>
            <h1 className="text-3xl font-bold text-ev-charcoal">
              {recording?.filename || "Processing"}
            </h1>
          </div>
          <div className="flex items-center gap-3">
            {(processing.status === "processing" || processing.status === "connecting") && (
              <span className="inline-flex items-center gap-1.5 text-xs text-success">
                <span className="w-1.5 h-1.5 rounded-full bg-success animate-pulse" />
                Live
              </span>
            )}
            {isProcessing && (
              <span className="text-sm text-ev-elephant">
                {`${Math.round(progress)}% complete`}
              </span>
            )}
          </div>
        </div>

        {/* Processing Timeline */}
        <div className="p-6 rounded-xl bg-ev-cream border border-ev-sand mb-8">
          <ProcessingTimeline currentStage={currentStage} />
          {isProcessing && (
            <div className="mt-4">
              <div className="h-2 bg-background-elevated rounded-full overflow-hidden">
                <div
                  className="h-full bg-accent-savanna rounded-full transition-all duration-500"
                  style={{ width: `${progress}%` }}
                />
              </div>
              <p className="text-xs text-ev-warm-gray mt-2">
                Current stage: {currentStageLabel}
              </p>
            </div>
          )}
          {(liveEvents.length > 0 || liveNoiseType || liveCallCount !== null) && (
            <div className="mt-5 grid gap-3 md:grid-cols-3">
              <div className="rounded-lg bg-background-elevated p-4">
                <p className="text-xs uppercase tracking-wide text-ev-warm-gray">Live event</p>
                <p className="mt-1 text-sm font-medium text-ev-charcoal">
                  {eventLabels[liveEvents[0]] || liveEvents[0] || currentStageLabel}
                </p>
              </div>
              <div className="rounded-lg bg-background-elevated p-4">
                <p className="text-xs uppercase tracking-wide text-ev-warm-gray">Noise</p>
                <p className="mt-1 text-sm font-medium capitalize text-ev-charcoal">
                  {liveNoiseType || "Analyzing"}
                </p>
              </div>
              <div className="rounded-lg bg-background-elevated p-4">
                <p className="text-xs uppercase tracking-wide text-ev-warm-gray">Call count</p>
                <p className="mt-1 text-sm font-medium text-ev-charcoal">
                  {liveCallCount ?? markers?.total_markers ?? "Waiting"}
                </p>
              </div>
            </div>
          )}
        </div>

        {isFailed && (
          <div className="p-6 rounded-xl bg-danger/10 border border-danger/20 mb-8">
            <div className="flex items-center gap-3">
              <svg className="w-6 h-6 text-danger flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              <div>
                <p className="text-danger font-medium">Processing Failed</p>
                <p className="text-danger/80 text-sm mt-1">
                  An error occurred during processing. Please try again or contact support.
                </p>
              </div>
            </div>
          </div>
        )}

        <div className="grid lg:grid-cols-[1fr_320px] gap-8">
          {/* Main Content */}
          <div className="space-y-8">
            {/* Spectrograms Side by Side */}
            <div className="p-6 rounded-xl bg-ev-cream border border-ev-sand">
              <h2 className="text-lg font-semibold text-ev-charcoal mb-4">
                Spectrograms
              </h2>
              <div className="grid md:grid-cols-2 gap-4">
                <div>
                  <p className="text-sm text-ev-warm-gray mb-2">Original</p>
                  {isComplete ? (
                    <img
                      src={spectrogramBefore}
                      alt="Original spectrogram"
                      className="w-full rounded-lg border border-ev-sand"
                    />
                  ) : (
                    <SkeletonImage />
                  )}
                </div>
                <div>
                  <p className="text-sm text-ev-warm-gray mb-2">Cleaned</p>
                  {isComplete ? (
                    <img
                      src={spectrogramAfter}
                      alt="Cleaned spectrogram"
                      className="w-full rounded-lg border border-ev-sand"
                    />
                  ) : (
                    <SkeletonImage />
                  )}
                </div>
              </div>
            </div>

            {/* 3D Spectrogram */}
            {isComplete && (
              show3D ? (
                <Spectrogram3D recordingId={jobId} onClose={() => setShow3D(false)} />
              ) : (
                <div className="flex justify-center">
                  <button
                    onClick={() => setShow3D(true)}
                    className="inline-flex items-center gap-2 px-5 py-2.5 bg-[#0C1A2A] text-white text-sm font-medium rounded-xl hover:bg-[#1a3a4a] transition-colors shadow-lg"
                  >
                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M21 7.5l-2.25-1.313M21 7.5v2.25m0-2.25l-2.25 1.313M3 7.5l2.25-1.313M3 7.5l2.25 1.313M3 7.5v2.25m9 3l2.25-1.313M12 12.75l-2.25-1.313M12 12.75V15m0 6.75l2.25-1.313M12 21.75V19.5m0 2.25l-2.25-1.313m0-16.875L12 2.25l2.25 1.313M21 14.25v2.25l-2.25 1.313m-13.5 0L3 16.5v-2.25" />
                    </svg>
                    View in 3D
                  </button>
                </div>
              )
            )}

            {/* Before/After Slider */}
            {isComplete && (
              <div className="p-6 rounded-xl bg-ev-cream border border-ev-sand">
                <h2 className="text-lg font-semibold text-ev-charcoal mb-4">
                  Before / After Comparison
                </h2>
                <div
                  ref={sliderRef}
                  className="relative w-full aspect-[2/1] rounded-xl overflow-hidden cursor-col-resize select-none"
                  onMouseDown={() => {
                    isDraggingSlider.current = true;
                  }}
                  onTouchStart={() => {
                    isDraggingSlider.current = true;
                  }}
                >
                  {/* After (full width, background) */}
                  <img
                    src={spectrogramAfter}
                    alt="Cleaned spectrogram"
                    className="absolute inset-0 w-full h-full object-cover"
                    draggable={false}
                  />

                  {/* Before (clipped) */}
                  <div
                    className="absolute inset-0 overflow-hidden"
                    style={{ clipPath: `inset(0 ${100 - sliderPosition}% 0 0)` }}
                  >
                    <img
                      src={spectrogramBefore}
                      alt="Original spectrogram"
                      className="absolute inset-0 w-full h-full object-cover"
                      draggable={false}
                    />
                  </div>

                  {/* Slider Line */}
                  <div
                    className="absolute top-0 bottom-0 w-0.5 bg-white shadow-lg z-10"
                    style={{ left: `${sliderPosition}%` }}
                  >
                    <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-8 h-8 bg-white rounded-full shadow-lg flex items-center justify-center">
                      <svg className="w-4 h-4 text-ev-ivory" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 9l4-4 4 4m0 6l-4 4-4-4" />
                      </svg>
                    </div>
                  </div>

                  {/* Labels */}
                  <div className="absolute top-3 left-3 px-2 py-1 bg-black/60 rounded text-xs text-white font-medium">
                    Before
                  </div>
                  <div className="absolute top-3 right-3 px-2 py-1 bg-black/60 rounded text-xs text-white font-medium">
                    After
                  </div>
                </div>
              </div>
            )}

            {/* Audio Players */}
            <div className="p-6 rounded-xl bg-ev-cream border border-ev-sand">
              <h2 className="text-lg font-semibold text-ev-charcoal mb-4">
                Audio Playback
              </h2>
              <div className="grid md:grid-cols-2 gap-6">
                <div>
                  <p className="text-sm text-ev-warm-gray mb-3">Original Recording</p>
                  <audio controls className="w-full" preload="metadata">
                    <source src={audioOriginal} type="audio/wav" />
                    Your browser does not support the audio element.
                  </audio>
                </div>
                <div>
                  <p className="text-sm text-ev-warm-gray mb-3">Cleaned Audio</p>
                  {isComplete ? (
                    <audio controls className="w-full" preload="metadata">
                      <source src={audioCleaned} type="audio/wav" />
                      Your browser does not support the audio element.
                    </audio>
                  ) : (
                    <div className="h-[54px] bg-background-elevated rounded-full animate-pulse" />
                  )}
                </div>
              </div>
            </div>

            {/* Cross-Species Comparison */}
            <CrossSpeciesCompare recordingId={jobId} isComplete={isComplete} />

            {markers && markers.markers.length > 0 && (
              <div className="p-6 rounded-xl bg-ev-cream border border-ev-sand">
                <h2 className="text-lg font-semibold text-ev-charcoal mb-4">
                  Call Timeline
                </h2>
                <div className="relative h-16 rounded-lg bg-background-elevated">
                  {markers.markers.map((marker) => {
                    const duration = Math.max(recording?.duration_s ? recording.duration_s * 1000 : marker.end_ms, 1);
                    const left = Math.min(100, (marker.start_ms / duration) * 100);
                    const width = Math.max(2, ((marker.duration_ms || 1) / duration) * 100);
                    return (
                      <div
                        key={marker.id}
                        title={`${marker.call_type} · ${Math.round((marker.confidence ?? 0) * 100)}%`}
                        className="absolute top-3 h-10 rounded-md px-1 text-[10px] font-semibold text-white"
                        style={{
                          left: `${left}%`,
                          width: `${Math.min(width, 100 - left)}%`,
                          backgroundColor: marker.color,
                        }}
                      >
                        <span className="block truncate capitalize">{marker.call_type}</span>
                      </div>
                    );
                  })}
                </div>
                <div className="mt-3 flex flex-wrap gap-2 text-xs text-ev-warm-gray">
                  {Object.entries(markers.summary).map(([type, count]) => (
                    <span key={type} className="rounded-md bg-background-elevated px-2 py-1 capitalize">
                      {type}: {count}
                    </span>
                  ))}
                </div>
              </div>
            )}

            {emotionTimeline && <EmotionTimeline data={emotionTimeline} />}
          </div>

          {/* Right Sidebar - Metrics */}
          <div className="space-y-6">
            {/* Quality Score */}
            <div className="p-6 rounded-xl bg-ev-cream border border-ev-sand">
              <h3 className="text-sm font-medium text-ev-warm-gray mb-4 uppercase tracking-wider">
                Quality Score
              </h3>
              {metrics?.quality_score !== undefined ? (
                <QualityBadge score={metrics.quality_score} />
              ) : (
                <div className="h-12 bg-background-elevated rounded-xl animate-pulse" />
              )}
            </div>

            {/* SNR Metrics */}
            <div className="p-6 rounded-xl bg-ev-cream border border-ev-sand">
              <h3 className="text-sm font-medium text-ev-warm-gray mb-4 uppercase tracking-wider">
                Signal-to-Noise Ratio
              </h3>
              <div className="space-y-4">
                <div>
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-sm text-ev-elephant">Before</span>
                    <span className="text-sm font-mono text-ev-charcoal">
                      {metrics?.snr_before !== undefined
                        ? `${metrics.snr_before.toFixed(1)} dB`
                        : "--"}
                    </span>
                  </div>
                  <div className="h-2 bg-background-elevated rounded-full overflow-hidden">
                    <div
                      className="h-full bg-warning rounded-full transition-all"
                      style={{
                        width: metrics?.snr_before
                          ? `${Math.min(100, (metrics.snr_before / 40) * 100)}%`
                          : "0%",
                      }}
                    />
                  </div>
                </div>
                <div>
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-sm text-ev-elephant">After</span>
                    <span className="text-sm font-mono text-ev-charcoal">
                      {metrics?.snr_after !== undefined
                        ? `${metrics.snr_after.toFixed(1)} dB`
                        : "--"}
                    </span>
                  </div>
                  <div className="h-2 bg-background-elevated rounded-full overflow-hidden">
                    <div
                      className="h-full bg-success rounded-full transition-all"
                      style={{
                        width: metrics?.snr_after
                          ? `${Math.min(100, (metrics.snr_after / 40) * 100)}%`
                          : "0%",
                      }}
                    />
                  </div>
                </div>
                {metrics?.snr_before !== undefined && metrics?.snr_after !== undefined && (
                  <div className="pt-3 border-t border-ev-sand">
                    <div className="flex items-center justify-between">
                      <span className="text-sm text-ev-elephant">Improvement</span>
                      <span className="text-sm font-bold text-success">
                        +{(metrics.snr_after - metrics.snr_before).toFixed(1)} dB
                      </span>
                    </div>
                  </div>
                )}
              </div>
            </div>

            {/* Noise Reduction */}
            {metrics?.noise_reduction_db !== undefined && (
              <div className="p-6 rounded-xl bg-ev-cream border border-ev-sand">
                <h3 className="text-sm font-medium text-ev-warm-gray mb-3 uppercase tracking-wider">
                  Noise Reduction
                </h3>
                <p className="text-3xl font-bold text-accent-savanna">
                  {metrics.noise_reduction_db.toFixed(1)}
                  <span className="text-lg font-normal text-ev-warm-gray ml-1">dB</span>
                </p>
              </div>
            )}

            {/* Recording Info */}
            <div className="p-6 rounded-xl bg-ev-cream border border-ev-sand">
              <h3 className="text-sm font-medium text-ev-warm-gray mb-4 uppercase tracking-wider">
                Recording Info
              </h3>
              <dl className="space-y-3 text-sm">
                <div className="flex justify-between">
                  <dt className="text-ev-warm-gray">ID</dt>
                  <dd className="text-ev-elephant font-mono text-xs">
                    {jobId.slice(0, 12)}...
                  </dd>
                </div>
                {recording?.duration && (
                  <div className="flex justify-between">
                    <dt className="text-ev-warm-gray">Duration</dt>
                    <dd className="text-ev-charcoal">
                      {Math.floor(recording.duration / 60)}m {Math.floor(recording.duration % 60)}s
                    </dd>
                  </div>
                )}
                {recording?.sample_rate && (
                  <div className="flex justify-between">
                    <dt className="text-ev-warm-gray">Sample Rate</dt>
                    <dd className="text-ev-charcoal">
                      {(recording.sample_rate / 1000).toFixed(1)} kHz
                    </dd>
                  </div>
                )}
                {recording?.location && (
                  <div className="flex justify-between">
                    <dt className="text-ev-warm-gray">Location</dt>
                    <dd className="text-ev-charcoal">{recording.location}</dd>
                  </div>
                )}
                {recording?.metadata?.animal_id && (
                  <div className="flex justify-between">
                    <dt className="text-ev-warm-gray">Animal ID</dt>
                    <dd className="text-ev-charcoal">{recording.metadata.animal_id}</dd>
                  </div>
                )}
                {recording?.metadata?.call_id && (
                  <div className="flex justify-between">
                    <dt className="text-ev-warm-gray">Call ID</dt>
                    <dd className="text-ev-charcoal">{recording.metadata.call_id}</dd>
                  </div>
                )}
                {recording?.metadata?.noise_type_ref && (
                  <div className="flex justify-between">
                    <dt className="text-ev-warm-gray">Ref Noise</dt>
                    <dd className="text-ev-charcoal capitalize">
                      {recording.metadata.noise_type_ref}
                    </dd>
                  </div>
                )}
                {(recording?.metadata?.start_sec !== undefined ||
                  recording?.metadata?.end_sec !== undefined) && (
                  <div className="flex justify-between">
                    <dt className="text-ev-warm-gray">Window</dt>
                    <dd className="text-ev-charcoal">
                      {recording?.metadata?.start_sec?.toFixed(2) ?? "0.00"}s -{" "}
                      {recording?.metadata?.end_sec?.toFixed(2) ?? "--"}s
                    </dd>
                  </div>
                )}
                <div className="flex justify-between">
                  <dt className="text-ev-warm-gray">Status</dt>
                  <dd className="capitalize text-ev-charcoal">
                    {recording?.status || currentStage}
                  </dd>
                </div>
              </dl>
            </div>

            {/* Analysis Labels */}
            {recording && (recording.animal_id || recording.noise_type_ref || recording.call_id) && (
              <div className="p-6 rounded-xl bg-ev-cream border border-ev-sand">
                <h3 className="text-sm font-medium text-ev-warm-gray mb-4 uppercase tracking-wider">
                  Analysis Labels
                </h3>
                <AnalysisLabels recording={recording} />
              </div>
            )}

            {/* Analysis Window */}
            {recording && recording.start_sec != null && recording.end_sec != null && (
              <div className="p-6 rounded-xl bg-ev-cream border border-ev-sand">
                <AnalysisWindow recording={recording} />
              </div>
            )}

            {/* Actions */}
            {isComplete && (
              <div className="space-y-3">
                <button
                  onClick={() => {
                    setRevealingInfrasound(true);
                    revealInfrasound(jobId)
                      .then(setInfrasound)
                      .finally(() => setRevealingInfrasound(false));
                  }}
                  disabled={revealingInfrasound}
                  className="flex w-full items-center justify-center gap-2 rounded-lg bg-danger px-6 py-3 font-semibold text-white transition-colors hover:bg-danger/90 disabled:opacity-50"
                >
                  {revealingInfrasound ? "Revealing..." : "Hear the Unhearable"}
                </button>
                {infrasound && (
                  <div className="rounded-lg border border-danger/20 bg-danger/10 p-4">
                    <p className="text-sm font-medium text-danger">
                      {infrasound.infrasound_detected ? "Infrasound detected" : "No strong infrasound detected"}
                    </p>
                    <p className="mt-1 text-xs text-ev-elephant">
                      Shifted +{infrasound.shift_octaves} octaves · {infrasound.infrasound_energy_pct.toFixed(1)}% infrasonic energy
                    </p>
                    {audioInfrasound && (
                      <audio controls className="mt-3 w-full" preload="metadata">
                        <source src={audioInfrasound} type="audio/wav" />
                      </audio>
                    )}
                  </div>
                )}
                <Link
                  href={`/results/${jobId}`}
                  className="flex items-center justify-center gap-2 w-full px-6 py-3 bg-accent-savanna text-ev-ivory font-semibold rounded-xl hover:bg-accent-savanna/90 transition-colors"
                >
                  View Full Results
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7l5 5m0 0l-5 5m5-5H6" />
                  </svg>
                </Link>
                <Link
                  href={`/export?recording=${jobId}`}
                  className="flex items-center justify-center gap-2 w-full px-6 py-3 bg-background-elevated text-ev-charcoal font-medium rounded-xl hover:bg-ev-sand transition-colors"
                >
                  Export Data
                </Link>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
