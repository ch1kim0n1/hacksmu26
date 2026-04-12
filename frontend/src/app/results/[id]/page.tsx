"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import Image from "next/image";
import { motion } from "framer-motion";
import {
  ChevronRight,
  Download,
  ArrowLeft,
  CheckCircle,
  AlertCircle,
  Loader2,
} from "lucide-react";
import { getRecording, API_BASE, type Recording, type Call } from "@/lib/audio-api";
import WaveformPlayer from "@/components/audio/WaveformPlayer";
import { QualityRing } from "@/components/ui/motion-primitives";

const CALL_TYPE_DESCRIPTIONS: Record<string, string> = {
  rumble: "Low-frequency contact call — carries up to 10 km through the ground",
  trumpet: "High-energy alarm or excitement vocalization",
  bark: "Short, sharp warning call",
  cry: "Distress or contact-seeking vocalization",
  roar: "Aggressive broad-spectrum vocalization",
  contact: "Social bond signal used to maintain herd cohesion",
};

const CALL_COLORS: Record<string, string> = {
  rumble: "#C4A46C",
  trumpet: "#E67E22",
  bark: "#E74C3C",
  cry: "#9B59B6",
  roar: "#C0392B",
  contact: "#27AE60",
};

function CallBadge({ call }: { call: Call }) {
  const color = CALL_COLORS[call.call_type] ?? "#8A9BA5";
  const description = CALL_TYPE_DESCRIPTIONS[call.call_type];
  const startSec = (call.start_ms / 1000).toFixed(2);
  const conf = call.confidence != null ? Math.round(call.confidence * 100) : null;

  return (
    <div className="p-3 rounded-xl border border-ev-sand/40 bg-ev-cream/60 flex items-start gap-3">
      <div className="w-2 h-2 rounded-full mt-1.5 shrink-0" style={{ backgroundColor: color }} />
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-xs font-semibold capitalize text-ev-charcoal">{call.call_type}</span>
          <span className="text-[10px] text-ev-warm-gray font-mono">@ {startSec}s</span>
          {conf != null && (
            <span className="text-[10px] px-1.5 py-0.5 rounded bg-ev-sand/50 text-ev-elephant font-mono">{conf}%</span>
          )}
        </div>
        {description && (
          <p className="text-[11px] text-ev-warm-gray mt-0.5 leading-snug">{description}</p>
        )}
      </div>
    </div>
  );
}

function MetricCard({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="p-4 rounded-xl glass border border-ev-sand/30">
      <h3 className="text-[11px] font-medium text-ev-warm-gray mb-3 uppercase tracking-wider">{label}</h3>
      {children}
    </div>
  );
}

export default function ResultsDetailPage() {
  const params = useParams();
  const router = useRouter();
  const id = params?.id as string;

  const [recording, setRecording] = useState<Recording | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!id) return;
    getRecording(id)
      .then(setRecording)
      .catch(() => setError("Recording not found."))
      .finally(() => setLoading(false));
  }, [id]);

  if (loading) {
    return (
      <div className="flex-1 flex items-center justify-center p-12">
        <Loader2 className="w-8 h-8 text-accent-savanna animate-spin" />
      </div>
    );
  }

  if (error || !recording) {
    return (
      <div className="flex-1 flex items-center justify-center p-12">
        <div className="text-center">
          <AlertCircle className="w-8 h-8 text-danger mx-auto mb-3" />
          <p className="text-danger mb-4">{error ?? "Recording not found."}</p>
          <button
            onClick={() => router.back()}
            className="px-5 py-2.5 bg-ev-cream text-ev-charcoal text-sm rounded-xl hover:bg-ev-sand transition-colors font-medium"
          >
            Go Back
          </button>
        </div>
      </div>
    );
  }

  const result = recording.result;
  const quality = result?.quality;
  const calls: Call[] = result?.calls ?? [];
  const isComplete = recording.status === "complete";

  const spectrogramBefore = `${API_BASE}/api/recordings/${id}/spectrogram?type=before`;
  const spectrogramAfter = `${API_BASE}/api/recordings/${id}/spectrogram?type=after`;
  const audioOriginal = `${API_BASE}/api/recordings/${id}/audio?type=original`;
  const audioCleaned = `${API_BASE}/api/recordings/${id}/audio?type=cleaned`;

  return (
    <div className="p-6 lg:p-8 max-w-6xl mx-auto space-y-6">
      {/* Header */}
      <motion.div
        initial={{ opacity: 0, y: -8 }}
        animate={{ opacity: 1, y: 0 }}
        className="flex items-center justify-between flex-wrap gap-4"
      >
        <div>
          <div className="flex items-center gap-2 text-sm text-ev-warm-gray mb-1">
            <Link href="/results" className="hover:text-ev-elephant transition-colors">
              Results
            </Link>
            <ChevronRight className="w-3.5 h-3.5" />
            <span className="text-ev-elephant truncate max-w-[200px]">{recording.filename}</span>
          </div>
          <h1 className="text-2xl font-bold text-ev-charcoal">{recording.filename}</h1>
          <div className="flex items-center gap-2 mt-1">
            {isComplete ? (
              <span className="inline-flex items-center gap-1 text-xs text-success font-medium">
                <CheckCircle className="w-3.5 h-3.5" /> Processing complete
              </span>
            ) : (
              <span className="text-xs text-ev-warm-gray capitalize">{recording.status}</span>
            )}
          </div>
        </div>
        <div className="flex items-center gap-3">
          <Link
            href={`/export?recording=${id}`}
            className="flex items-center gap-2 px-4 py-2 rounded-xl border border-ev-sand/40 text-sm text-ev-elephant hover:bg-ev-sand/30 transition-colors"
          >
            <Download className="w-4 h-4" />
            Export Data
          </Link>
          <Link
            href={`/processing/${id}`}
            className="flex items-center gap-2 px-4 py-2 rounded-xl border border-ev-sand/40 text-sm text-ev-elephant hover:bg-ev-sand/30 transition-colors"
          >
            <ArrowLeft className="w-4 h-4" />
            Processing View
          </Link>
        </div>
      </motion.div>

      <div className="grid lg:grid-cols-[1fr_300px] gap-6">
        {/* Main content */}
        <div className="space-y-6">
          {/* Spectrograms */}
          <motion.div
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.08 }}
            className="p-5 rounded-xl glass border border-ev-sand/30"
          >
            <h2 className="text-sm font-semibold text-ev-charcoal mb-4">Spectrograms</h2>
            <div className="grid md:grid-cols-2 gap-4">
              <div>
                <p className="text-xs text-ev-warm-gray mb-2 font-medium">Original</p>
                <div className="relative w-full h-48">
                  <Image
                    src={spectrogramBefore}
                    alt="Original spectrogram"
                    fill
                    className="rounded-lg border border-ev-sand/30 object-cover"
                  />
                </div>
              </div>
              <div>
                <p className="text-xs text-ev-warm-gray mb-2 font-medium">Cleaned</p>
                <div className="relative w-full h-48">
                  <Image
                    src={spectrogramAfter}
                    alt="Cleaned spectrogram"
                    fill
                    className="rounded-lg border border-ev-sand/30 object-cover"
                  />
                </div>
              </div>
            </div>
          </motion.div>

          {/* Audio players */}
          <motion.div
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.14 }}
            className="p-5 rounded-xl glass border border-ev-sand/30"
          >
            <h2 className="text-sm font-semibold text-ev-charcoal mb-4">Audio Playback</h2>
            <div className="grid md:grid-cols-2 gap-5">
              <WaveformPlayer src={audioOriginal} label="Original Recording" accentColor="#8A9BA5" />
              {isComplete && (
                <WaveformPlayer src={audioCleaned} label="Cleaned Audio" accentColor="#C4A46C" />
              )}
            </div>
          </motion.div>

          {/* Detected calls */}
          {calls.length > 0 && (
            <motion.div
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.2 }}
              className="p-5 rounded-xl glass border border-ev-sand/30"
            >
              <h2 className="text-sm font-semibold text-ev-charcoal mb-4">
                Detected Calls
                <span className="ml-2 text-[11px] font-normal text-ev-warm-gray">
                  {calls.length} vocalization{calls.length !== 1 ? "s" : ""} identified
                </span>
              </h2>
              <div className="grid sm:grid-cols-2 gap-2">
                {calls.slice(0, 12).map((call) => (
                  <CallBadge key={call.id} call={call} />
                ))}
              </div>
              {calls.length > 12 && (
                <p className="text-xs text-ev-warm-gray mt-3">
                  + {calls.length - 12} more calls — export as CSV for the full dataset
                </p>
              )}
            </motion.div>
          )}
        </div>

        {/* Sidebar metrics */}
        <motion.div
          initial={{ opacity: 0, x: 16 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ delay: 0.12, duration: 0.45 }}
          className="space-y-4"
        >
          {quality?.quality_score != null && (
            <MetricCard label="Quality Score">
              <div className="flex justify-center py-1">
                <QualityRing score={quality.quality_score} size={90} />
              </div>
            </MetricCard>
          )}

          {(quality?.snr_before_db != null || quality?.snr_after_db != null) && (
            <MetricCard label="Signal-to-Noise Ratio">
              <div className="space-y-3">
                {quality?.snr_before_db != null && (
                  <div>
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-xs text-ev-elephant">Before</span>
                      <span className="text-xs font-mono text-ev-charcoal tabular-nums">
                        {quality.snr_before_db.toFixed(1)} dB
                      </span>
                    </div>
                    <div className="h-1.5 bg-ev-cream rounded-full overflow-hidden">
                      <motion.div
                        className="h-full bg-warning rounded-full"
                        initial={{ width: 0 }}
                        animate={{ width: `${Math.min(100, (quality.snr_before_db / 40) * 100)}%` }}
                        transition={{ duration: 0.8, delay: 0.3 }}
                      />
                    </div>
                  </div>
                )}
                {quality?.snr_after_db != null && (
                  <div>
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-xs text-ev-elephant">After</span>
                      <span className="text-xs font-mono text-ev-charcoal tabular-nums">
                        {quality.snr_after_db.toFixed(1)} dB
                      </span>
                    </div>
                    <div className="h-1.5 bg-ev-cream rounded-full overflow-hidden">
                      <motion.div
                        className="h-full bg-success rounded-full"
                        initial={{ width: 0 }}
                        animate={{ width: `${Math.min(100, (quality.snr_after_db / 40) * 100)}%` }}
                        transition={{ duration: 0.8, delay: 0.5 }}
                      />
                    </div>
                  </div>
                )}
                {quality?.snr_before_db != null && quality?.snr_after_db != null && (
                  <div className="pt-2.5 border-t border-ev-sand/30 flex items-center justify-between">
                    <span className="text-xs text-ev-elephant">Improvement</span>
                    <span className="text-xs font-bold text-success tabular-nums">
                      +{(quality.snr_after_db - quality.snr_before_db).toFixed(1)} dB
                    </span>
                  </div>
                )}
              </div>
            </MetricCard>
          )}

          <MetricCard label="Recording Info">
            <dl className="space-y-2.5 text-xs">
              <div className="flex items-baseline justify-between gap-3">
                <dt className="text-ev-warm-gray shrink-0">ID</dt>
                <dd className="text-ev-elephant font-mono text-[11px] truncate">{id.slice(0, 12)}&hellip;</dd>
              </div>
              {(recording.duration_s ?? recording.duration) != null && (
                <div className="flex items-baseline justify-between gap-3">
                  <dt className="text-ev-warm-gray shrink-0">Duration</dt>
                  <dd className="text-ev-charcoal tabular-nums">
                    {(() => {
                      const d = recording.duration_s ?? recording.duration ?? 0;
                      return `${Math.floor(d / 60)}m ${Math.floor(d % 60)}s`;
                    })()}
                  </dd>
                </div>
              )}
              {recording.sample_rate && (
                <div className="flex items-baseline justify-between gap-3">
                  <dt className="text-ev-warm-gray shrink-0">Sample Rate</dt>
                  <dd className="text-ev-charcoal tabular-nums">
                    {(recording.sample_rate / 1000).toFixed(1)} kHz
                  </dd>
                </div>
              )}
              {recording.location && (
                <div className="flex items-baseline justify-between gap-3">
                  <dt className="text-ev-warm-gray shrink-0">Location</dt>
                  <dd className="text-ev-charcoal truncate">{recording.location}</dd>
                </div>
              )}
              <div className="flex items-baseline justify-between gap-3">
                <dt className="text-ev-warm-gray shrink-0">Calls detected</dt>
                <dd className="text-ev-charcoal tabular-nums">{calls.length}</dd>
              </div>
            </dl>
          </MetricCard>
        </motion.div>
      </div>
    </div>
  );
}
