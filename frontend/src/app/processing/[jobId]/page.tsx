"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import Image from "next/image";
import { useParams } from "next/navigation";
import Link from "next/link";
import { motion } from "framer-motion";
import {
  Check,
  Loader2,
  AlertCircle,
  ArrowRight,
  Download,
  ChevronRight,
} from "lucide-react";
import useProcessingJob from "@/hooks/useProcessingJob";
import {
  getRecording,
  getRecordingStatus,
  API_BASE,
  type Recording,
  type RecordingStatusResponse,
} from "@/lib/audio-api";
import { useLocalStorage } from "@/hooks/useLocalStorage";
import {
  COLORMAPS,
  type SpectrogramColormap,
} from "@/components/spectrogram/SpectrogramViewer";
import {
  AnalysisLabels,
  AnalysisWindow,
} from "@/components/research/AnalysisLabels";
import { QualityRing } from "@/components/ui/motion-primitives";

interface ProcessingMetrics {
  snr_before?: number;
  snr_after?: number;
  quality_score?: number;
  noise_reduction_db?: number;
}

const STAGES = [
  { key: "ingestion", label: "Ingestion", shortLabel: "Ingest" },
  { key: "spectrogram", label: "Spectrogram", shortLabel: "Spectro" },
  { key: "noise_classification", label: "Noise Classification", shortLabel: "Classify" },
  { key: "noise_removal", label: "Noise Removal", shortLabel: "Denoise" },
  { key: "feature_extraction", label: "Feature Extraction", shortLabel: "Features" },
  { key: "quality_assessment", label: "Quality Assessment", shortLabel: "QA" },
  { key: "complete", label: "Complete", shortLabel: "Done" },
];

function ProcessingTimeline({ currentStage }: { currentStage: string }) {
  const currentIndex = STAGES.findIndex((s) => s.key === currentStage);
  const activeIndex = currentIndex >= 0 ? currentIndex : 0;

  return (
    <div
      className="flex w-full items-center overflow-x-auto px-1 py-2"
      role="progressbar"
      aria-valuenow={activeIndex}
      aria-valuemin={0}
      aria-valuemax={STAGES.length - 1}
      aria-label="Processing progress"
    >
      {STAGES.map((stage, i) => {
        const isComplete = i < activeIndex || currentStage === "complete";
        const isCurrent = i === activeIndex && currentStage !== "complete";
        return (
          <div key={stage.key} className="flex min-w-0 flex-1 items-center overflow-visible">
            <div className="flex flex-col items-center gap-1.5 shrink-0 w-10">
              <motion.div
                initial={false}
                animate={{
                  scale: isCurrent ? 1.1 : 1,
                  backgroundColor: isComplete ? "#10C876" : isCurrent ? "#C4A46C" : "#F0EBE3",
                }}
                transition={{ duration: 0.4, ease: "easeOut" }}
                className="w-7 h-7 rounded-full flex items-center justify-center text-[10px] font-bold"
                style={{ boxShadow: isCurrent ? "0 0 0 4px rgba(196,164,108,0.15)" : "none" }}
              >
                {isComplete ? (
                  <Check className="w-3.5 h-3.5 text-white" />
                ) : (
                  <span className={isCurrent ? "text-white" : "text-ev-warm-gray"}>{i + 1}</span>
                )}
              </motion.div>
              <span className={`text-[10px] font-medium text-center leading-tight whitespace-nowrap ${isCurrent ? "text-accent-savanna" : isComplete ? "text-success" : "text-ev-warm-gray/60"}`}>
                {stage.shortLabel}
              </span>
            </div>
            {i < STAGES.length - 1 && (
              <motion.div
                initial={false}
                animate={{ backgroundColor: isComplete ? "#10C876" : "#D4CCC350" }}
                transition={{ duration: 0.4 }}
                className="flex-1 h-0.5 mx-0.5 rounded-full min-w-[12px]"
              />
            )}
          </div>
        );
      })}
    </div>
  );
}

function LiveSNRMeter({ snrBefore, snrAfter, isProcessing }: {
  snrBefore?: number;
  snrAfter?: number;
  isProcessing: boolean;
}) {
  const hasData = snrBefore !== undefined;
  const maxDb = 40;
  const beforePct = snrBefore ? Math.min(100, (snrBefore / maxDb) * 100) : 0;
  const afterPct = snrAfter ? Math.min(100, (snrAfter / maxDb) * 100) : 0;
  const improvement = snrBefore !== undefined && snrAfter !== undefined ? snrAfter - snrBefore : null;

  if (!hasData && isProcessing) {
    return (
      <div className="space-y-2">
        <div className="flex items-center gap-2 mb-3">
          <span className="w-1.5 h-1.5 rounded-full bg-accent-savanna animate-pulse" />
          <span className="text-[11px] text-accent-savanna font-medium tracking-wide">Live — Measuring…</span>
        </div>
        <div className="flex items-end gap-[2px] h-14 w-full overflow-hidden rounded-lg bg-ev-cream/60 px-2 py-1">
          {Array.from({ length: 32 }).map((_, i) => (
            <div
              key={i}
              className="flex-1 rounded-sm"
              style={{
                background: `linear-gradient(to top, #C4A46C, #E4C080)`,
                animation: `sound-bar ${0.8 + (i % 6) * 0.09}s ease-in-out infinite`,
                animationDelay: `${(i * 0.05 + Math.sin(i * 1.5) * 0.12).toFixed(2)}s`,
                transformOrigin: "bottom",
                height: "100%",
              }}
            />
          ))}
        </div>
        <p className="text-[10px] text-ev-warm-gray text-center">Analyzing signal-to-noise ratio…</p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <div>
        <div className="flex justify-between mb-1.5">
          <span className="text-xs text-ev-warm-gray">Before</span>
          <span className="text-xs font-mono font-bold tabular-nums" style={{ color: "#C4785A" }}>
            {snrBefore !== undefined ? `${snrBefore.toFixed(1)} dB` : "—"}
          </span>
        </div>
        <div className="h-2 bg-ev-cream rounded-full overflow-hidden">
          <motion.div
            className="h-full rounded-full"
            style={{ background: "linear-gradient(90deg, #C4785A, #E4A060)" }}
            initial={{ width: 0 }}
            animate={{ width: `${beforePct}%` }}
            transition={{ duration: 1, ease: "easeOut" }}
          />
        </div>
      </div>
      <div>
        <div className="flex justify-between mb-1.5">
          <span className="text-xs text-ev-warm-gray">After</span>
          <span className="text-xs font-mono font-bold tabular-nums text-success">
            {snrAfter !== undefined ? `${snrAfter.toFixed(1)} dB` : "—"}
          </span>
        </div>
        <div className="h-2 bg-ev-cream rounded-full overflow-hidden">
          <motion.div
            className="h-full rounded-full"
            style={{ background: "linear-gradient(90deg, #5A8B6F, #10C876)", boxShadow: "0 0 8px rgba(16,200,118,0.35)" }}
            initial={{ width: 0 }}
            animate={{ width: `${afterPct}%` }}
            transition={{ duration: 1.2, delay: 0.3, ease: "easeOut" }}
          />
        </div>
      </div>
      {improvement !== null && (
        <motion.div
          initial={{ opacity: 0, y: 4 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.9 }}
          className="pt-2.5 border-t border-ev-sand/30 flex items-center justify-between"
        >
          <span className="text-xs text-ev-warm-gray">Improvement</span>
          <span className="text-sm font-bold text-success tabular-nums" style={{ textShadow: "0 0 10px rgba(16,200,118,0.45)" }}>
            +{improvement.toFixed(1)} dB
          </span>
        </motion.div>
      )}
      {!hasData && (
        <p className="text-xs text-ev-warm-gray text-center">Awaiting processing…</p>
      )}
    </div>
  );
}

function MetricCard({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="p-4 rounded-xl glass border border-ev-sand/30">
      <h3 className="text-[11px] font-medium text-ev-warm-gray mb-3 uppercase tracking-wider leading-none">{label}</h3>
      <div className="min-h-0">{children}</div>
    </div>
  );
}

function SkeletonBlock() {
  return (
    <div className="w-full aspect-[2/1] bg-ev-cream rounded-xl animate-pulse flex items-center justify-center">
      <svg className="w-10 h-10 text-ev-sand" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
      </svg>
    </div>
  );
}

export default function ProcessingPage() {
  const params = useParams();
  const jobId = params.jobId as string;
  const processing = useProcessingJob(jobId || null);

  const [recording, setRecording] = useState<Recording | null>(null);
  const [backendStatus, setBackendStatus] = useState<RecordingStatusResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [sliderPosition, setSliderPosition] = useState(50);
  const sliderRef = useRef<HTMLDivElement>(null);
  const isDraggingSlider = useRef(false);

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

  const fetchBackendStatus = useCallback(async () => {
    try {
      const status = await getRecordingStatus(jobId);
      setBackendStatus(status);
    } catch {
      // Keep the last known status; websocket remains primary for live updates.
    }
  }, [jobId]);

  useEffect(() => { fetchData(); }, [fetchData]);
  useEffect(() => { if (processing.status === "complete") fetchData(); }, [processing.status, fetchData]);
  useEffect(() => { if (backendStatus?.status === "complete") fetchData(); }, [backendStatus?.status, fetchData]);
  useEffect(() => {
    fetchBackendStatus();
  }, [fetchBackendStatus]);

  useEffect(() => {
    const isActiveRun =
      processing.status === "processing" ||
      processing.status === "connecting" ||
      recording?.status === "processing" ||
      backendStatus?.status === "processing";

    if (!isActiveRun) return;

    const intervalId = window.setInterval(() => {
      void fetchBackendStatus();
    }, 1200);

    return () => window.clearInterval(intervalId);
  }, [backendStatus?.status, fetchBackendStatus, processing.status, recording?.status]);

  const handleSliderMove = useCallback((clientX: number) => {
    if (!sliderRef.current || !isDraggingSlider.current) return;
    const rect = sliderRef.current.getBoundingClientRect();
    const pct = Math.max(0, Math.min(100, ((clientX - rect.left) / rect.width) * 100));
    setSliderPosition(pct);
  }, []);

  useEffect(() => {
    const onMM = (e: MouseEvent) => handleSliderMove(e.clientX);
    const onMU = () => { isDraggingSlider.current = false; };
    const onTM = (e: TouchEvent) => { if (e.touches.length > 0) handleSliderMove(e.touches[0].clientX); };
    const onTE = () => { isDraggingSlider.current = false; };
    window.addEventListener("mousemove", onMM);
    window.addEventListener("mouseup", onMU);
    window.addEventListener("touchmove", onTM);
    window.addEventListener("touchend", onTE);
    return () => { window.removeEventListener("mousemove", onMM); window.removeEventListener("mouseup", onMU); window.removeEventListener("touchmove", onTM); window.removeEventListener("touchend", onTE); };
  }, [handleSliderMove]);

  const currentStage =
    recording?.status === "complete"
      ? "complete"
      : processing.currentStage ||
        backendStatus?.stage ||
        recording?.processing?.current_stage ||
        recording?.status ||
        "pending";
  const progress =
    recording?.status === "complete"
      ? 100
      : backendStatus?.progress_pct ??
        (processing.progress > 0
          ? processing.progress
          : Number(recording?.processing?.progress_pct ?? 0));
  const isComplete =
    recording?.status === "complete" ||
    backendStatus?.status === "complete" ||
    processing.status === "complete";
  const isProcessing =
    !isComplete &&
    (backendStatus?.status === "processing" ||
      recording?.status === "processing" ||
      processing.status === "processing" ||
      processing.status === "connecting");
  const isFailed =
    recording?.status === "failed" ||
    backendStatus?.status === "failed" ||
    processing.status === "error";

  const [colormap, setColormap] = useLocalStorage<SpectrogramColormap>("echofield.colormap", "viridis");
  const spectrogramBefore = `${API_BASE}/api/recordings/${jobId}/spectrogram?type=before&colormap=${colormap}`;
  const spectrogramAfter = `${API_BASE}/api/recordings/${jobId}/spectrogram?type=after&colormap=${colormap}`;
  const audioOriginal = `${API_BASE}/api/recordings/${jobId}/audio?type=original`;
  const audioCleaned = `${API_BASE}/api/recordings/${jobId}/audio?type=cleaned`;

  const metricsFromLive: ProcessingMetrics | null = processing.quality ? { snr_before: processing.quality.snr_before, snr_after: processing.quality.snr_after, quality_score: processing.quality.score, noise_reduction_db: processing.quality.improvement } : null;
  const quality = recording?.result?.quality;
  const metricsFromResult: ProcessingMetrics | null = quality ? { snr_before: quality.snr_before_db, snr_after: quality.snr_after_db, quality_score: quality.quality_score, noise_reduction_db: quality.snr_improvement_db } : null;
  const metrics = metricsFromLive || metricsFromResult;
  const currentStageLabel = STAGES.find((s) => s.key === currentStage)?.label || "Processing";

  if (loading) {
    return (
      <div className="flex-1 flex items-center justify-center p-12">
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="flex flex-col items-center gap-3">
          <Loader2 className="w-8 h-8 text-accent-savanna animate-spin" />
          <p className="text-sm text-ev-elephant">Loading recording&hellip;</p>
        </motion.div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex-1 flex items-center justify-center p-12">
        <motion.div initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} className="text-center">
          <AlertCircle className="w-8 h-8 text-danger mx-auto mb-3" />
          <p className="text-danger mb-4">{error}</p>
          <motion.button whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.98 }} onClick={fetchData} className="px-5 py-2.5 bg-ev-cream text-ev-charcoal text-sm rounded-xl hover:bg-ev-sand transition-colors font-medium">
            Retry
          </motion.button>
        </motion.div>
      </div>
    );
  }

  return (
    <div className="p-6 lg:p-8 max-w-7xl mx-auto space-y-6">
      {/* Header */}
      <motion.div initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }} className="flex items-center justify-between flex-wrap gap-4">
        <div>
          <div className="flex items-center gap-2 text-sm text-ev-warm-gray mb-1">
            <Link href="/recordings" className="hover:text-ev-elephant transition-colors">Recordings</Link>
            <ChevronRight className="w-3.5 h-3.5" />
            <span className="text-ev-elephant">{recording?.filename || "Processing"}</span>
          </div>
          <h1 className="text-2xl font-bold text-ev-charcoal">{recording?.filename || "Processing"}</h1>
        </div>
        <div className="flex items-center gap-3">
          {(processing.status === "processing" || processing.status === "connecting") && (
            <span className="inline-flex items-center gap-1.5 text-xs text-success bg-success/8 px-2.5 py-1 rounded-full font-medium">
              <span className="w-1.5 h-1.5 rounded-full bg-success animate-pulse" />Live
            </span>
          )}
          {isProcessing && <span className="text-sm text-ev-elephant tabular-nums font-medium">{Math.round(progress)}%</span>}
        </div>
      </motion.div>

      {/* Timeline */}
      <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.08 }} className="p-5 rounded-xl glass border border-ev-sand/30">
        <ProcessingTimeline currentStage={currentStage} />
        {isProcessing && (
          <div className="mt-4">
            <div className="h-2 bg-ev-cream rounded-full overflow-hidden">
              <motion.div className="h-full bg-gradient-to-r from-accent-savanna to-accent-gold rounded-full" initial={{ width: 0 }} animate={{ width: `${progress}%` }} transition={{ duration: 0.5 }} style={{ boxShadow: "0 0 12px rgba(196,164,108,0.3)" }} />
            </div>
            <p className="text-[11px] text-ev-warm-gray mt-1.5">{currentStageLabel}</p>
          </div>
        )}
      </motion.div>

      {isFailed && (
        <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="p-5 rounded-xl bg-danger/5 border border-danger/15 flex items-center gap-3">
          <AlertCircle className="w-5 h-5 text-danger flex-shrink-0" />
          <div>
            <p className="text-danger font-medium text-sm">Processing Failed</p>
            <p className="text-danger/70 text-xs mt-0.5">An error occurred during processing. Please try again.</p>
          </div>
        </motion.div>
      )}

      <div className="grid lg:grid-cols-[1fr_300px] gap-6">
        {/* Main content */}
        <div className="space-y-6">
          {/* Spectrograms */}
          <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.12 }} className="p-5 rounded-xl glass border border-ev-sand/30">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-sm font-semibold text-ev-charcoal">Spectrograms</h2>
              <div className="flex items-center gap-1.5" aria-label="Select colormap" role="group">
                {COLORMAPS.map((cm) => (
                  <button
                    key={cm.id}
                    type="button"
                    title={cm.label}
                    aria-pressed={colormap === cm.id}
                    onClick={() => setColormap(cm.id)}
                    className={[
                      "w-8 h-3 rounded-sm border transition-all",
                      colormap === cm.id
                        ? "border-ev-charcoal ring-1 ring-ev-charcoal scale-110"
                        : "border-ev-sand/60 hover:border-ev-warm-gray",
                    ].join(" ")}
                    style={{ background: cm.gradient }}
                  />
                ))}
              </div>
            </div>
            <div className="grid md:grid-cols-2 gap-4">
              <div>
                <p className="text-xs text-ev-warm-gray mb-2 font-medium">Original</p>
                {isComplete ? (
                  <Image
                    src={spectrogramBefore}
                    alt="Original spectrogram"
                    width={1600}
                    height={800}
                    unoptimized
                    className="h-auto w-full rounded-lg border border-ev-sand/30"
                  />
                ) : (
                  <SkeletonBlock />
                )}
              </div>
              <div>
                <p className="text-xs text-ev-warm-gray mb-2 font-medium">Cleaned</p>
                {isComplete ? (
                  <Image
                    src={spectrogramAfter}
                    alt="Cleaned spectrogram"
                    width={1600}
                    height={800}
                    unoptimized
                    className="h-auto w-full rounded-lg border border-ev-sand/30"
                  />
                ) : (
                  <SkeletonBlock />
                )}
              </div>
            </div>
          </motion.div>

          {/* Before/After Slider */}
          {isComplete && (
            <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.18 }} className="p-5 rounded-xl glass border border-ev-sand/30">
              <h2 className="text-sm font-semibold text-ev-charcoal mb-4">Before / After Comparison</h2>
              <div ref={sliderRef} className="relative w-full aspect-[2/1] rounded-xl overflow-hidden cursor-col-resize select-none" role="slider" aria-label="Before/After comparison slider" aria-valuenow={Math.round(sliderPosition)} aria-valuemin={0} aria-valuemax={100} onMouseDown={() => { isDraggingSlider.current = true; }} onTouchStart={() => { isDraggingSlider.current = true; }}>
                <Image
                  src={spectrogramAfter}
                  alt="Cleaned spectrogram"
                  fill
                  sizes="(min-width: 1024px) 60vw, 92vw"
                  unoptimized
                  className="absolute inset-0 h-full w-full object-cover"
                  draggable={false}
                />
                <div className="absolute inset-0 overflow-hidden" style={{ clipPath: `inset(0 ${100 - sliderPosition}% 0 0)` }}>
                  <Image
                    src={spectrogramBefore}
                    alt="Original spectrogram"
                    fill
                    sizes="(min-width: 1024px) 60vw, 92vw"
                    unoptimized
                    className="absolute inset-0 h-full w-full object-cover"
                    draggable={false}
                  />
                </div>
                <div className="absolute top-0 bottom-0 w-0.5 bg-white/80 z-10 pointer-events-none" style={{ left: `${sliderPosition}%` }}>
                  <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-8 h-8 bg-white rounded-full shadow-lg flex items-center justify-center border border-ev-sand/20">
                    <svg className="w-3.5 h-3.5 text-ev-elephant" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 9l4-4 4 4m0 6l-4 4-4-4" /></svg>
                  </div>
                </div>
                <div className="absolute top-3 left-3 px-2.5 py-1 bg-black/50 backdrop-blur-sm rounded-md text-[10px] text-white font-medium pointer-events-none">Before</div>
                <div className="absolute top-3 right-3 px-2.5 py-1 bg-black/50 backdrop-blur-sm rounded-md text-[10px] text-white font-medium pointer-events-none">After</div>
              </div>
            </motion.div>
          )}

          {/* Audio */}
          <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.22 }} className="p-5 rounded-xl glass border border-ev-sand/30">
            <h2 className="text-sm font-semibold text-ev-charcoal mb-4">Audio Playback</h2>
            <div className="grid md:grid-cols-2 gap-5">
              <div>
                <p className="text-xs text-ev-warm-gray mb-2.5 font-medium">Original Recording</p>
                <audio controls className="w-full" preload="metadata"><source src={audioOriginal} type="audio/wav" /></audio>
              </div>
              <div>
                <p className="text-xs text-ev-warm-gray mb-2.5 font-medium">Cleaned Audio</p>
                {isComplete ? <audio controls className="w-full" preload="metadata"><source src={audioCleaned} type="audio/wav" /></audio> : <div className="h-[54px] bg-ev-cream rounded-full animate-pulse" />}
              </div>
            </div>
          </motion.div>
        </div>

        {/* Metrics sidebar */}
        <motion.div initial={{ opacity: 0, x: 16 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: 0.15, duration: 0.45 }} className="space-y-4">
          <MetricCard label="Quality Score">
            {metrics?.quality_score !== undefined ? (
              <div className="flex justify-center py-1"><QualityRing score={metrics.quality_score} size={90} /></div>
            ) : <div className="h-20 bg-ev-cream rounded-xl animate-pulse" />}
          </MetricCard>

          <MetricCard label="Signal-to-Noise Ratio">
            <LiveSNRMeter
              snrBefore={metrics?.snr_before}
              snrAfter={metrics?.snr_after}
              isProcessing={isProcessing}
            />
          </MetricCard>

          {metrics?.noise_reduction_db !== undefined && (
            <MetricCard label="Noise Reduction">
              <p className="text-2xl font-bold text-accent-savanna tabular-nums">{metrics.noise_reduction_db.toFixed(1)}<span className="text-sm font-normal text-ev-warm-gray ml-1">dB</span></p>
            </MetricCard>
          )}

          <MetricCard label="Recording Info">
            <dl className="space-y-2.5 text-xs">
              <div className="flex items-baseline justify-between gap-3"><dt className="text-ev-warm-gray shrink-0">ID</dt><dd className="text-ev-elephant font-mono text-[11px] truncate">{jobId.slice(0, 12)}&hellip;</dd></div>
              {recording?.duration && <div className="flex items-baseline justify-between gap-3"><dt className="text-ev-warm-gray shrink-0">Duration</dt><dd className="text-ev-charcoal tabular-nums">{Math.floor(recording.duration / 60)}m {Math.floor(recording.duration % 60)}s</dd></div>}
              {recording?.sample_rate && <div className="flex items-baseline justify-between gap-3"><dt className="text-ev-warm-gray shrink-0">Sample Rate</dt><dd className="text-ev-charcoal tabular-nums">{(recording.sample_rate / 1000).toFixed(1)} kHz</dd></div>}
              {recording?.location && <div className="flex items-baseline justify-between gap-3"><dt className="text-ev-warm-gray shrink-0">Location</dt><dd className="text-ev-charcoal truncate">{recording.location}</dd></div>}
              {recording?.metadata?.animal_id && <div className="flex items-baseline justify-between gap-3"><dt className="text-ev-warm-gray shrink-0">Animal ID</dt><dd className="text-ev-charcoal truncate">{recording.metadata.animal_id}</dd></div>}
              {recording?.metadata?.call_id && <div className="flex items-baseline justify-between gap-3"><dt className="text-ev-warm-gray shrink-0">Call ID</dt><dd className="text-ev-charcoal truncate">{recording.metadata.call_id}</dd></div>}
              {recording?.metadata?.noise_type_ref && <div className="flex items-baseline justify-between gap-3"><dt className="text-ev-warm-gray shrink-0">Ref Noise</dt><dd className="text-ev-charcoal capitalize truncate">{recording.metadata.noise_type_ref}</dd></div>}
              <div className="flex items-baseline justify-between gap-3"><dt className="text-ev-warm-gray shrink-0">Status</dt><dd className="capitalize text-ev-charcoal">{recording?.status || currentStage}</dd></div>
            </dl>
          </MetricCard>

          {recording && (recording.animal_id || recording.noise_type_ref || recording.call_id) && (
            <MetricCard label="Analysis Labels"><AnalysisLabels recording={recording} /></MetricCard>
          )}
          {recording && recording.start_sec != null && recording.end_sec != null && (
            <div className="p-4 rounded-xl glass border border-ev-sand/30"><AnalysisWindow recording={recording} /></div>
          )}

          {isComplete && (
            <div className="space-y-2.5">
              <motion.div whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.98 }}>
                <Link href={`/results/${jobId}`} aria-label="View full results" className="flex items-center justify-center gap-2 w-full px-5 py-2.5 bg-gradient-to-r from-accent-savanna to-accent-gold text-white text-sm font-semibold rounded-xl shadow-sm shadow-accent-savanna/20 hover:shadow-md transition-shadow">
                  <span>View Full Results</span>
                  <ArrowRight className="w-4 h-4" />
                </Link>
              </motion.div>
              <motion.div whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.98 }}>
                <Link href={`/export?recording=${jobId}`} aria-label="Export data" className="flex items-center justify-center gap-2 w-full px-5 py-2.5 glass border border-ev-sand/30 text-ev-charcoal text-sm font-medium rounded-xl card-hover">
                  <Download className="w-4 h-4" />
                  <span>Export Data</span>
                </Link>
              </motion.div>
            </div>
          )}
        </motion.div>
      </div>
    </div>
  );
}
