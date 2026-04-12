"use client";

import { useState, useEffect, useCallback } from "react";
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
import { getRecording, API_BASE, type Recording } from "@/lib/audio-api";
import {
  AnalysisLabels,
  AnalysisWindow,
} from "@/components/research/AnalysisLabels";
import { QualityRing } from "@/components/ui/motion-primitives";
import InteractiveSpectrogram from "@/components/spectrogram/InteractiveSpectrogram";
import DarkAudioPlayer from "@/components/audio/DarkAudioPlayer";
import NoiseDissolve from "@/components/processing/NoiseDissolve";
import SNRContext from "@/components/processing/SNRContext";

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
    <div className="flex items-center w-full overflow-x-auto pb-1" role="progressbar" aria-valuenow={activeIndex} aria-valuemin={0} aria-valuemax={STAGES.length - 1} aria-label="Processing progress">
      {STAGES.map((stage, i) => {
        const isComplete = i < activeIndex || currentStage === "complete";
        const isCurrent = i === activeIndex && currentStage !== "complete";
        return (
          <div key={stage.key} className="flex items-center flex-1 min-w-0">
            <div className="flex flex-col items-center gap-1.5 shrink-0 w-10">
              <motion.div
                initial={false}
                animate={{
                  scale: isCurrent ? 1.1 : 1,
                  backgroundColor: isComplete ? "#10C876" : isCurrent ? "#C4A46C" : "#0F1218",
                }}
                transition={{ duration: 0.4, ease: "easeOut" }}
                className="w-7 h-7 rounded-full flex items-center justify-center text-[10px] font-bold"
                style={{ boxShadow: isCurrent ? "0 0 0 4px rgba(196,164,108,0.15)" : "none" }}
              >
                {isComplete ? (
                  <Check className="w-3.5 h-3.5 text-white" />
                ) : (
                  <span className={isCurrent ? "text-white" : "text-dark-text-muted"}>{i + 1}</span>
                )}
              </motion.div>
              <span className={`text-[10px] font-medium text-center leading-tight whitespace-nowrap ${isCurrent ? "text-accent-savanna" : isComplete ? "text-success" : "text-dark-text-muted/60"}`}>
                {stage.shortLabel}
              </span>
            </div>
            {i < STAGES.length - 1 && (
              <motion.div
                initial={false}
                animate={{ backgroundColor: isComplete ? "#10C876" : "#161B24" }}
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

function MetricCard({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="p-4 rounded-xl glass border border-white/[0.06] instrument-border">
      <h3 className="text-[11px] font-medium text-dark-text-muted mb-3 uppercase tracking-wider leading-none">{label}</h3>
      <div className="min-h-0">{children}</div>
    </div>
  );
}

function SkeletonBlock() {
  return (
    <div className="w-full aspect-[2/1] bg-dark-surface rounded-xl flex items-center justify-center border border-white/[0.04]">
      <svg className="w-10 h-10 text-dark-text-muted/20" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1} d="M9 19V6l12-3v13M9 19c0 1.105-1.343 2-3 2s-3-.895-3-2 1.343-2 3-2 3 .895 3 2zm12-3c0 1.105-1.343 2-3 2s-3-.895-3-2 1.343-2 3-2 3 .895 3 2zM9 10l12-3" />
      </svg>
    </div>
  );
}

export default function ProcessingPage() {
  const params = useParams();
  const jobId = params.jobId as string;
  const processing = useProcessingJob(jobId || null);

  const [recording, setRecording] = useState<Recording | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Audio <-> Spectrogram sync state
  const [audioCurrentTime, setAudioCurrentTime] = useState(0);
  const [audioSeekTo, setAudioSeekTo] = useState<number | undefined>(undefined);
  const [isAudioPlaying, setIsAudioPlaying] = useState(false);

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

  useEffect(() => { fetchData(); }, [fetchData]);
  useEffect(() => { if (processing.status === "complete") fetchData(); }, [processing.status, fetchData]);

  const currentStage = recording?.status === "complete" ? "complete" : processing.currentStage || recording?.processing?.current_stage || recording?.status || "pending";
  const progress = recording?.status === "complete" ? 100 : Math.max(processing.progress, Number(recording?.processing?.progress_pct ?? 0));
  const isComplete = recording?.status === "complete" || processing.status === "complete";
  const isProcessing = !isComplete && (recording?.status === "processing" || processing.status === "processing" || processing.status === "connecting");
  const isFailed = recording?.status === "failed" || processing.status === "error";

  const spectrogramBefore = `${API_BASE}/api/recordings/${jobId}/spectrogram?type=before`;
  const spectrogramAfter = `${API_BASE}/api/recordings/${jobId}/spectrogram?type=after`;
  const audioOriginal = `${API_BASE}/api/recordings/${jobId}/audio?type=original`;
  const audioCleaned = `${API_BASE}/api/recordings/${jobId}/audio?type=cleaned`;

  const metricsFromLive: ProcessingMetrics | null = processing.quality ? { snr_before: processing.quality.snr_before, snr_after: processing.quality.snr_after, quality_score: processing.quality.score, noise_reduction_db: processing.quality.improvement } : null;
  const quality = recording?.result?.quality;
  const metricsFromResult: ProcessingMetrics | null = quality ? { snr_before: quality.snr_before_db, snr_after: quality.snr_after_db, quality_score: quality.quality_score, noise_reduction_db: quality.snr_improvement_db } : null;
  const metrics = metricsFromLive || metricsFromResult;
  const currentStageLabel = STAGES.find((s) => s.key === currentStage)?.label || "Processing";

  // Compute denoise stage progress for NoiseDissolve
  const denoiseStageIndex = STAGES.findIndex((s) => s.key === "noise_removal");
  const currentStageIndex = STAGES.findIndex((s) => s.key === currentStage);
  const isDenoiseActive = currentStage === "noise_removal";
  const isDenoiseComplete = currentStageIndex > denoiseStageIndex || isComplete;
  const denoiseProgress = isDenoiseComplete ? 100 : isDenoiseActive ? Math.max(0, Math.min(100, progress)) : 0;

  // Dynamic page title
  useEffect(() => {
    if (isProcessing) {
      document.title = `${Math.round(progress)}% ${currentStageLabel} | EchoField`;
    } else if (isComplete) {
      document.title = `${recording?.filename || 'Complete'} | EchoField`;
    }
    return () => { document.title = 'EchoField'; };
  }, [isProcessing, isComplete, progress, currentStageLabel, recording?.filename]);

  if (loading) {
    return (
      <div className="flex-1 flex items-center justify-center p-12 bg-dark-surface">
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="flex flex-col items-center gap-3">
          <Loader2 className="w-8 h-8 text-accent-savanna animate-spin" />
          <p className="text-sm text-dark-text-muted">Loading recording&hellip;</p>
        </motion.div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex-1 flex items-center justify-center p-12 bg-dark-surface">
        <motion.div initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} className="text-center">
          <AlertCircle className="w-8 h-8 text-danger mx-auto mb-3" />
          <p className="text-danger mb-4">{error}</p>
          <motion.button whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.98 }} onClick={fetchData} className="px-5 py-2.5 bg-dark-surface text-dark-text-primary text-sm rounded-xl hover:bg-dark-surface-elevated transition-colors font-medium">
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
          <div className="flex items-center gap-2 text-sm text-dark-text-secondary mb-1">
            <Link href="/upload" className="hover:text-dark-text-primary transition-colors">Recordings</Link>
            <ChevronRight className="w-3.5 h-3.5" />
            <span className="text-dark-text-secondary">{recording?.filename || "Processing"}</span>
          </div>
          <h1 className="text-2xl font-bold text-dark-text-primary tracking-tight">{recording?.filename || "Processing"}</h1>
        </div>
        <div className="flex items-center gap-3">
          {(processing.status === "processing" || processing.status === "connecting") && (
            <span className="inline-flex items-center gap-1.5 text-xs text-success bg-success/10 border border-success/20 px-2.5 py-1 rounded-full font-medium">
              <span className="w-1.5 h-1.5 rounded-full bg-success animate-pulse led-indicator led-green" />Live
            </span>
          )}
          {isProcessing && <span className="text-sm text-dark-text-muted tabular-nums font-medium">{Math.round(progress)}%</span>}
        </div>
      </motion.div>

      {/* Timeline */}
      <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.08 }} className="p-5 rounded-xl glass border border-white/[0.06]">
        <ProcessingTimeline currentStage={currentStage} />
        {isProcessing && (
          <div className="mt-4">
            <div className="h-2 bg-dark-surface overflow-hidden rounded-full">
              <motion.div className="h-full bg-gradient-to-r from-accent-savanna to-accent-gold rounded-full" initial={{ width: 0 }} animate={{ width: `${progress}%` }} transition={{ duration: 0.5 }} style={{ boxShadow: "0 0 12px rgba(196,164,108,0.3)" }} />
            </div>
            <p className="text-[11px] text-dark-text-secondary mt-1.5">{currentStageLabel}</p>
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

      {/* Spectrogram — full width hero */}
      <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.12 }}>
        {isComplete ? (
          <InteractiveSpectrogram
            src={spectrogramAfter}
            duration={recording?.duration || 0}
            currentTime={audioCurrentTime}
            onSeek={(time) => setAudioSeekTo(time)}
            isPlaying={isAudioPlaying}
            label="Cleaned Spectrogram"
          />
        ) : isProcessing && (isDenoiseActive || isDenoiseComplete) ? (
          <NoiseDissolve
            beforeSrc={spectrogramBefore}
            afterSrc={spectrogramAfter}
            progress={denoiseProgress}
            isActive={isDenoiseActive}
          />
        ) : (
          <div className="rounded-xl overflow-hidden border border-white/[0.06] bg-[#0C1A2A]">
            <div className="flex items-center px-4 py-2.5 border-b border-white/[0.06]">
              <span className="text-xs font-medium text-dark-text-secondary uppercase tracking-wider">Spectrogram</span>
            </div>
            <SkeletonBlock />
          </div>
        )}
      </motion.div>

      <div className="grid lg:grid-cols-[1fr_300px] gap-6">
        {/* Main content — Audio players */}
        <div className="space-y-6">
          <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.18 }}>
            <div className="space-y-4">
              <DarkAudioPlayer
                src={audioOriginal}
                label="Original Recording"
                accentColor="#F5A025"
              />
              {isComplete ? (
                <DarkAudioPlayer
                  src={audioCleaned}
                  label="Cleaned Audio"
                  accentColor="#10C876"
                  onTimeUpdate={(time) => {
                    setAudioCurrentTime(time);
                    setIsAudioPlaying(true);
                  }}
                  seekTo={audioSeekTo}
                />
              ) : (
                <div className="rounded-xl border border-white/[0.06] bg-dark-surface overflow-hidden">
                  <div className="flex items-center gap-2 px-4 py-2 border-b border-white/[0.06]">
                    <div className="w-1.5 h-1.5 rounded-full bg-dark-text-muted" />
                    <span className="text-xs font-medium text-dark-text-secondary">Cleaned Audio</span>
                  </div>
                  <div className="px-4 py-3">
                    <div className="h-12 bg-dark-surface-elevated rounded animate-pulse" />
                  </div>
                </div>
              )}
            </div>
          </motion.div>

          {/* NoiseDissolve replay when complete */}
          {isComplete && (
            <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.22 }}>
              <NoiseDissolve
                beforeSrc={spectrogramBefore}
                afterSrc={spectrogramAfter}
                progress={100}
                isActive={false}
              />
            </motion.div>
          )}
        </div>

        {/* Metrics sidebar */}
        <motion.div initial={{ opacity: 0, x: 16 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: 0.15, duration: 0.45 }} className="space-y-4">
          <MetricCard label="Quality Score">
            {metrics?.quality_score !== undefined ? (
              <div className="flex justify-center py-1"><QualityRing score={metrics.quality_score} size={90} /></div>
            ) : <div className="h-20 bg-dark-surface rounded-xl animate-pulse" />}
          </MetricCard>

          <MetricCard label="Signal-to-Noise Ratio">
            <div className="space-y-3">
              <div>
                <div className="flex items-center justify-between mb-1">
                  <span className="text-xs text-dark-text-secondary">Before</span>
                  <span className="text-xs font-mono text-dark-text-primary tabular-nums">{metrics?.snr_before !== undefined ? `${metrics.snr_before.toFixed(1)} dB` : "--"}</span>
                </div>
                <div className="h-1.5 bg-dark-surface-elevated rounded-full overflow-hidden">
                  <motion.div className="h-full bg-warning rounded-full" initial={{ width: 0 }} animate={{ width: metrics?.snr_before ? `${Math.min(100, (metrics.snr_before / 40) * 100)}%` : "0%" }} transition={{ duration: 0.8, delay: 0.3 }} />
                </div>
              </div>
              <div>
                <div className="flex items-center justify-between mb-1">
                  <span className="text-xs text-dark-text-secondary">After</span>
                  <span className="text-xs font-mono text-dark-text-primary tabular-nums">{metrics?.snr_after !== undefined ? `${metrics.snr_after.toFixed(1)} dB` : "--"}</span>
                </div>
                <div className="h-1.5 bg-dark-surface-elevated rounded-full overflow-hidden">
                  <motion.div className="h-full bg-success rounded-full" initial={{ width: 0 }} animate={{ width: metrics?.snr_after ? `${Math.min(100, (metrics.snr_after / 40) * 100)}%` : "0%" }} transition={{ duration: 0.8, delay: 0.5 }} />
                </div>
              </div>
              {metrics?.snr_before !== undefined && metrics?.snr_after !== undefined && (
                <div className="pt-2.5 border-t border-white/[0.06] flex items-center justify-between">
                  <span className="text-xs text-dark-text-secondary">Improvement</span>
                  <span className="text-xs font-bold text-success tabular-nums">+{(metrics.snr_after - metrics.snr_before).toFixed(1)} dB</span>
                </div>
              )}
            </div>
          </MetricCard>

          {/* SNR Context */}
          {metrics?.snr_before !== undefined && metrics?.snr_after !== undefined && (
            <MetricCard label="What This Sounds Like">
              <SNRContext snrBefore={metrics.snr_before} snrAfter={metrics.snr_after} />
            </MetricCard>
          )}

          {metrics?.noise_reduction_db !== undefined && (
            <MetricCard label="Noise Reduction">
              <p className="text-2xl font-bold text-accent-savanna tabular-nums">{metrics.noise_reduction_db.toFixed(1)}<span className="text-sm font-normal text-dark-text-secondary ml-1">dB</span></p>
            </MetricCard>
          )}

          <MetricCard label="Recording Info">
            <dl className="space-y-2.5 text-xs">
              <div className="flex items-baseline justify-between gap-3"><dt className="text-dark-text-muted shrink-0">ID</dt><dd className="text-dark-text-muted font-mono text-[11px] truncate">{jobId.slice(0, 12)}&hellip;</dd></div>
              {recording?.duration && <div className="flex items-baseline justify-between gap-3"><dt className="text-dark-text-muted shrink-0">Duration</dt><dd className="text-dark-text-secondary tabular-nums">{Math.floor(recording.duration / 60)}m {Math.floor(recording.duration % 60)}s</dd></div>}
              {recording?.sample_rate && <div className="flex items-baseline justify-between gap-3"><dt className="text-dark-text-muted shrink-0">Sample Rate</dt><dd className="text-dark-text-secondary tabular-nums">{(recording.sample_rate / 1000).toFixed(1)} kHz</dd></div>}
              {recording?.location && <div className="flex items-baseline justify-between gap-3"><dt className="text-dark-text-muted shrink-0">Location</dt><dd className="text-dark-text-secondary truncate">{recording.location}</dd></div>}
              {recording?.metadata?.animal_id && <div className="flex items-baseline justify-between gap-3"><dt className="text-dark-text-muted shrink-0">Animal ID</dt><dd className="text-dark-text-secondary truncate">{recording.metadata.animal_id}</dd></div>}
              {recording?.metadata?.call_id && <div className="flex items-baseline justify-between gap-3"><dt className="text-dark-text-muted shrink-0">Call ID</dt><dd className="text-dark-text-secondary truncate">{recording.metadata.call_id}</dd></div>}
              {recording?.metadata?.noise_type_ref && <div className="flex items-baseline justify-between gap-3"><dt className="text-dark-text-muted shrink-0">Ref Noise</dt><dd className="text-dark-text-secondary capitalize truncate">{recording.metadata.noise_type_ref}</dd></div>}
              <div className="flex items-baseline justify-between gap-3"><dt className="text-dark-text-muted shrink-0">Status</dt><dd className="text-dark-text-secondary capitalize">{recording?.status || currentStage}</dd></div>
            </dl>
          </MetricCard>

          {recording && (recording.animal_id || recording.noise_type_ref || recording.call_id) && (
            <MetricCard label="Analysis Labels"><AnalysisLabels recording={recording} /></MetricCard>
          )}
          {recording && recording.start_sec != null && recording.end_sec != null && (
            <div className="p-4 rounded-xl glass border border-white/[0.06]"><AnalysisWindow recording={recording} /></div>
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
                <Link href={`/export?recording=${jobId}`} aria-label="Export data" className="flex items-center justify-center gap-2 w-full px-5 py-2.5 glass border border-white/[0.06] text-dark-text-primary text-sm font-medium rounded-xl card-hover">
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
