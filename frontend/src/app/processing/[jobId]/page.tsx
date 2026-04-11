"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { getRecording, API_BASE, type Recording } from "@/lib/audio-api";

interface ProcessingUpdate {
  stage: string;
  progress: number;
  message?: string;
  status?: string;
  spectrogram_url?: string;
  metrics?: {
    snr_before?: number;
    snr_after?: number;
    quality_score?: number;
    noise_reduction_db?: number;
  };
}

const STAGES = [
  { key: "upload", label: "Uploaded" },
  { key: "preprocessing", label: "Preprocessing" },
  { key: "spectral_analysis", label: "Spectral Analysis" },
  { key: "noise_removal", label: "Noise Removal" },
  { key: "call_detection", label: "Call Detection" },
  { key: "complete", label: "Complete" },
];

function ProcessingTimeline({ currentStage }: { currentStage: string }) {
  const currentIndex = STAGES.findIndex((s) => s.key === currentStage);

  return (
    <div className="flex items-center gap-1 w-full overflow-x-auto pb-2">
      {STAGES.map((stage, i) => {
        const isComplete = i < currentIndex;
        const isCurrent = i === currentIndex;
        const isPending = i > currentIndex;

        return (
          <div key={stage.key} className="flex items-center flex-1 min-w-0">
            <div className="flex flex-col items-center gap-1.5 flex-shrink-0">
              <div
                className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold transition-all ${
                  isComplete
                    ? "bg-success text-white"
                    : isCurrent
                    ? "bg-accent-teal text-echofield-bg ring-4 ring-accent-teal/20"
                    : "bg-echofield-surface-elevated text-echofield-text-muted"
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
                    ? "text-accent-teal"
                    : isComplete
                    ? "text-success"
                    : "text-echofield-text-muted"
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
                    ? "bg-echofield-border"
                    : "bg-accent-teal/40"
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
    <div className="w-full aspect-[2/1] bg-echofield-surface-elevated rounded-xl animate-pulse flex items-center justify-center">
      <svg className="w-12 h-12 text-echofield-text-muted/30" fill="none" viewBox="0 0 24 24" stroke="currentColor">
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
      ? "text-accent-teal bg-accent-teal/10 border-accent-teal/20"
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

  const [recording, setRecording] = useState<Recording | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [wsUpdate, setWsUpdate] = useState<ProcessingUpdate | null>(null);
  const [wsConnected, setWsConnected] = useState(false);

  const [sliderPosition, setSliderPosition] = useState(50);
  const sliderRef = useRef<HTMLDivElement>(null);
  const isDraggingSlider = useRef(false);

  const wsRef = useRef<WebSocket | null>(null);

  const fetchData = useCallback(async () => {
    try {
      setLoading(true);
      const data = await getRecording(jobId);
      setRecording(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load recording");
    } finally {
      setLoading(false);
    }
  }, [jobId]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  // WebSocket connection for live updates
  useEffect(() => {
    if (!jobId) return;

    const wsUrl = `ws://localhost:8000/ws/processing/${jobId}`;
    const ws = new WebSocket(wsUrl);
    wsRef.current = ws;

    ws.onopen = () => {
      setWsConnected(true);
    };

    ws.onmessage = (event) => {
      try {
        const raw = JSON.parse(event.data) as {
          type?: string;
          data?: Record<string, unknown>;
          status?: string;
          progress?: number;
          stage?: string;
        };

        const normalized: ProcessingUpdate = raw.data
          ? {
              stage:
                (raw.data.stage as string) ||
                (raw.type === "PROCESSING_COMPLETE" ? "complete" : raw.type?.toLowerCase() || "processing"),
              progress: (raw.data.progress as number) ?? 0,
              status: raw.data.status as string | undefined,
              spectrogram_url: raw.data.spectrogram_url as string | undefined,
              metrics:
                raw.type === "QUALITY_SCORE"
                  ? {
                      snr_before: raw.data.snr_before as number | undefined,
                      snr_after: raw.data.snr_after as number | undefined,
                      quality_score: raw.data.score as number | undefined,
                      noise_reduction_db: raw.data.improvement as number | undefined,
                    }
                  : undefined,
            }
          : (raw as ProcessingUpdate);

        setWsUpdate(normalized);

        if (normalized.stage === "complete") {
          fetchData();
        }
      } catch {
        // ignore parse errors
      }
    };

    ws.onerror = () => {
      setWsConnected(false);
    };

    ws.onclose = () => {
      setWsConnected(false);
    };

    return () => {
      ws.close();
      wsRef.current = null;
    };
  }, [jobId, fetchData]);

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

  const currentStage = wsUpdate?.stage || recording?.status || "pending";
  const isProcessing = currentStage === "processing" || (
    currentStage !== "complete" && currentStage !== "failed" && currentStage !== "pending"
  );
  const isComplete = recording?.status === "complete" || currentStage === "complete";
  const isFailed = recording?.status === "failed" || currentStage === "failed";

  const spectrogramBefore = `${API_BASE}/api/recordings/${jobId}/spectrogram?type=before`;
  const spectrogramAfter = `${API_BASE}/api/recordings/${jobId}/spectrogram?type=after`;
  const audioOriginal = `${API_BASE}/api/recordings/${jobId}/audio?type=original`;
  const audioCleaned = `${API_BASE}/api/recordings/${jobId}/audio?type=cleaned`;

  const metrics = wsUpdate?.metrics || (recording?.metadata as ProcessingUpdate["metrics"]);

  if (loading) {
    return (
      <div className="min-h-screen bg-echofield-bg flex items-center justify-center">
        <div className="flex flex-col items-center gap-4">
          <div className="w-10 h-10 border-2 border-accent-teal border-t-transparent rounded-full animate-spin" />
          <p className="text-echofield-text-secondary">Loading recording...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen bg-echofield-bg flex items-center justify-center">
        <div className="text-center p-8">
          <p className="text-danger text-lg mb-4">{error}</p>
          <button
            onClick={fetchData}
            className="px-6 py-3 bg-echofield-surface text-echofield-text-primary rounded-xl hover:bg-echofield-surface-elevated transition-colors"
          >
            Retry
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-echofield-bg">
      <div className="max-w-7xl mx-auto px-6 py-12">
        {/* Header */}
        <div className="flex items-center justify-between mb-8 flex-wrap gap-4">
          <div>
            <Link
              href="/upload"
              className="inline-flex items-center gap-2 text-echofield-text-muted hover:text-echofield-text-secondary transition-colors mb-3"
            >
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
              </svg>
              Back to Recordings
            </Link>
            <h1 className="text-3xl font-bold text-echofield-text-primary">
              {recording?.filename || "Processing"}
            </h1>
          </div>
          <div className="flex items-center gap-3">
            {wsConnected && (
              <span className="inline-flex items-center gap-1.5 text-xs text-success">
                <span className="w-1.5 h-1.5 rounded-full bg-success animate-pulse" />
                Live
              </span>
            )}
            {isProcessing && wsUpdate && (
              <span className="text-sm text-echofield-text-secondary">
                {wsUpdate.message || `${Math.round(wsUpdate.progress)}% complete`}
              </span>
            )}
          </div>
        </div>

        {/* Processing Timeline */}
        <div className="p-6 rounded-xl bg-echofield-surface border border-echofield-border mb-8">
          <ProcessingTimeline currentStage={currentStage} />
          {isProcessing && wsUpdate && (
            <div className="mt-4">
              <div className="h-2 bg-echofield-surface-elevated rounded-full overflow-hidden">
                <div
                  className="h-full bg-accent-teal rounded-full transition-all duration-500"
                  style={{ width: `${wsUpdate.progress}%` }}
                />
              </div>
              <p className="text-xs text-echofield-text-muted mt-2">
                {wsUpdate.message || "Processing..."}
              </p>
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
            <div className="p-6 rounded-xl bg-echofield-surface border border-echofield-border">
              <h2 className="text-lg font-semibold text-echofield-text-primary mb-4">
                Spectrograms
              </h2>
              <div className="grid md:grid-cols-2 gap-4">
                <div>
                  <p className="text-sm text-echofield-text-muted mb-2">Original</p>
                  {isComplete ? (
                    <img
                      src={spectrogramBefore}
                      alt="Original spectrogram"
                      className="w-full rounded-lg border border-echofield-border"
                    />
                  ) : (
                    <SkeletonImage />
                  )}
                </div>
                <div>
                  <p className="text-sm text-echofield-text-muted mb-2">Cleaned</p>
                  {isComplete ? (
                    <img
                      src={spectrogramAfter}
                      alt="Cleaned spectrogram"
                      className="w-full rounded-lg border border-echofield-border"
                    />
                  ) : (
                    <SkeletonImage />
                  )}
                </div>
              </div>
            </div>

            {/* Before/After Slider */}
            {isComplete && (
              <div className="p-6 rounded-xl bg-echofield-surface border border-echofield-border">
                <h2 className="text-lg font-semibold text-echofield-text-primary mb-4">
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
                      <svg className="w-4 h-4 text-echofield-bg" fill="none" viewBox="0 0 24 24" stroke="currentColor">
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
            <div className="p-6 rounded-xl bg-echofield-surface border border-echofield-border">
              <h2 className="text-lg font-semibold text-echofield-text-primary mb-4">
                Audio Playback
              </h2>
              <div className="grid md:grid-cols-2 gap-6">
                <div>
                  <p className="text-sm text-echofield-text-muted mb-3">Original Recording</p>
                  <audio controls className="w-full" preload="metadata">
                    <source src={audioOriginal} type="audio/wav" />
                    Your browser does not support the audio element.
                  </audio>
                </div>
                <div>
                  <p className="text-sm text-echofield-text-muted mb-3">Cleaned Audio</p>
                  {isComplete ? (
                    <audio controls className="w-full" preload="metadata">
                      <source src={audioCleaned} type="audio/wav" />
                      Your browser does not support the audio element.
                    </audio>
                  ) : (
                    <div className="h-[54px] bg-echofield-surface-elevated rounded-full animate-pulse" />
                  )}
                </div>
              </div>
            </div>
          </div>

          {/* Right Sidebar - Metrics */}
          <div className="space-y-6">
            {/* Quality Score */}
            <div className="p-6 rounded-xl bg-echofield-surface border border-echofield-border">
              <h3 className="text-sm font-medium text-echofield-text-muted mb-4 uppercase tracking-wider">
                Quality Score
              </h3>
              {metrics?.quality_score !== undefined ? (
                <QualityBadge score={metrics.quality_score} />
              ) : (
                <div className="h-12 bg-echofield-surface-elevated rounded-xl animate-pulse" />
              )}
            </div>

            {/* SNR Metrics */}
            <div className="p-6 rounded-xl bg-echofield-surface border border-echofield-border">
              <h3 className="text-sm font-medium text-echofield-text-muted mb-4 uppercase tracking-wider">
                Signal-to-Noise Ratio
              </h3>
              <div className="space-y-4">
                <div>
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-sm text-echofield-text-secondary">Before</span>
                    <span className="text-sm font-mono text-echofield-text-primary">
                      {metrics?.snr_before !== undefined
                        ? `${metrics.snr_before.toFixed(1)} dB`
                        : "--"}
                    </span>
                  </div>
                  <div className="h-2 bg-echofield-surface-elevated rounded-full overflow-hidden">
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
                    <span className="text-sm text-echofield-text-secondary">After</span>
                    <span className="text-sm font-mono text-echofield-text-primary">
                      {metrics?.snr_after !== undefined
                        ? `${metrics.snr_after.toFixed(1)} dB`
                        : "--"}
                    </span>
                  </div>
                  <div className="h-2 bg-echofield-surface-elevated rounded-full overflow-hidden">
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
                  <div className="pt-3 border-t border-echofield-border">
                    <div className="flex items-center justify-between">
                      <span className="text-sm text-echofield-text-secondary">Improvement</span>
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
              <div className="p-6 rounded-xl bg-echofield-surface border border-echofield-border">
                <h3 className="text-sm font-medium text-echofield-text-muted mb-3 uppercase tracking-wider">
                  Noise Reduction
                </h3>
                <p className="text-3xl font-bold text-accent-teal">
                  {metrics.noise_reduction_db.toFixed(1)}
                  <span className="text-lg font-normal text-echofield-text-muted ml-1">dB</span>
                </p>
              </div>
            )}

            {/* Recording Info */}
            <div className="p-6 rounded-xl bg-echofield-surface border border-echofield-border">
              <h3 className="text-sm font-medium text-echofield-text-muted mb-4 uppercase tracking-wider">
                Recording Info
              </h3>
              <dl className="space-y-3 text-sm">
                <div className="flex justify-between">
                  <dt className="text-echofield-text-muted">ID</dt>
                  <dd className="text-echofield-text-secondary font-mono text-xs">
                    {jobId.slice(0, 12)}...
                  </dd>
                </div>
                {recording?.duration && (
                  <div className="flex justify-between">
                    <dt className="text-echofield-text-muted">Duration</dt>
                    <dd className="text-echofield-text-primary">
                      {Math.floor(recording.duration / 60)}m {Math.floor(recording.duration % 60)}s
                    </dd>
                  </div>
                )}
                {recording?.sample_rate && (
                  <div className="flex justify-between">
                    <dt className="text-echofield-text-muted">Sample Rate</dt>
                    <dd className="text-echofield-text-primary">
                      {(recording.sample_rate / 1000).toFixed(1)} kHz
                    </dd>
                  </div>
                )}
                {recording?.location && (
                  <div className="flex justify-between">
                    <dt className="text-echofield-text-muted">Location</dt>
                    <dd className="text-echofield-text-primary">{recording.location}</dd>
                  </div>
                )}
                <div className="flex justify-between">
                  <dt className="text-echofield-text-muted">Status</dt>
                  <dd className="capitalize text-echofield-text-primary">
                    {recording?.status || currentStage}
                  </dd>
                </div>
              </dl>
            </div>

            {/* Actions */}
            {isComplete && (
              <div className="space-y-3">
                <Link
                  href={`/results/${jobId}`}
                  className="flex items-center justify-center gap-2 w-full px-6 py-3 bg-accent-teal text-echofield-bg font-semibold rounded-xl hover:bg-accent-teal/90 transition-colors"
                >
                  View Full Results
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7l5 5m0 0l-5 5m5-5H6" />
                  </svg>
                </Link>
                <Link
                  href={`/export?recording=${jobId}`}
                  className="flex items-center justify-center gap-2 w-full px-6 py-3 bg-echofield-surface-elevated text-echofield-text-primary font-medium rounded-xl hover:bg-echofield-border transition-colors"
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
