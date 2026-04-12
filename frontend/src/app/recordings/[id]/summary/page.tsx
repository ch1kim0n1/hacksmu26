"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { motion } from "framer-motion";
import {
  ArrowLeft,
  ArrowRight,
  ArrowUpRight,
  CheckCircle2,
  Clock,
  Download,
  FileText,
  Loader2,
  AlertCircle,
  Volume2,
  Users,
  BarChart3,
  Shield,
  Lightbulb,
  Star,
} from "lucide-react";
import {
  getRecording,
  getRecordingSummary,
  API_BASE,
  type Recording,
  type RecordingSummary2,
} from "@/lib/audio-api";
import MetadataEditor from "@/components/research/MetadataEditor";

/* ────────────────────────── helpers ────────────────────────── */

const CALL_TYPE_COLORS: Record<string, string> = {
  rumble: "#C4A46C",
  trumpet: "#E67E22",
  bark: "#E74C3C",
  cry: "#9B59B6",
  roar: "#C0392B",
  contact: "#27AE60",
};

function scoreColor(score: number): string {
  if (score >= 85) return "#10C876";
  if (score >= 70) return "#C4A46C";
  if (score >= 50) return "#F5A025";
  return "#EF4444";
}

function scoreTier(score: number): {
  label: string;
  description: string;
  badgeClass: string;
} {
  if (score >= 85)
    return {
      label: "Publishable",
      description:
        "This recording meets quality thresholds for inclusion in peer-reviewed publications. Call clarity, SNR, and spectral integrity are all within acceptable ranges.",
      badgeClass: "bg-success/15 text-success border-success/30",
    };
  if (score >= 70)
    return {
      label: "Research-Grade",
      description:
        "Suitable for research datasets and internal analysis. Minor artifacts or noise may be present but do not compromise acoustic feature extraction.",
      badgeClass: "bg-accent-savanna/15 text-accent-gold border-accent-savanna/30",
    };
  if (score >= 50)
    return {
      label: "Reference Only",
      description:
        "Useful as a reference or for training classifiers, but noise or distortion limits its value for detailed acoustic analysis.",
      badgeClass: "bg-warning/15 text-warning border-warning/30",
    };
  return {
    label: "Insufficient",
    description:
      "Noise levels or distortion are too high for reliable analysis. Consider re-processing with different parameters or sourcing a cleaner recording.",
    badgeClass: "bg-danger/15 text-danger border-danger/30",
  };
}

function formatDuration(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return m > 0 ? `${m}m ${s}s` : `${s}s`;
}

function formatDate(iso: string): string {
  try {
    return new Date(iso).toLocaleDateString("en-US", {
      year: "numeric",
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return iso;
  }
}

/* ────────────────────── SVG Score Ring ─────────────────────── */

function PublishabilityRing({
  score,
  size = 160,
  strokeWidth = 10,
}: {
  score: number;
  size?: number;
  strokeWidth?: number;
}) {
  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;
  const color = scoreColor(score);

  return (
    <div className="relative inline-flex items-center justify-center">
      <svg width={size} height={size} className="-rotate-90">
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke="currentColor"
          strokeWidth={strokeWidth}
          className="text-ev-sand/50"
        />
        <motion.circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke={color}
          strokeWidth={strokeWidth}
          strokeLinecap="round"
          strokeDasharray={circumference}
          initial={{ strokeDashoffset: circumference }}
          animate={{
            strokeDashoffset: circumference - (score / 100) * circumference,
          }}
          transition={{ duration: 1.2, ease: "easeOut", delay: 0.3 }}
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <motion.span
          className="text-4xl font-bold text-ev-charcoal tabular-nums leading-none"
          initial={{ opacity: 0, scale: 0.8 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ duration: 0.5, delay: 0.6 }}
        >
          {Math.round(score)}
        </motion.span>
        <span className="text-xs text-ev-warm-gray uppercase tracking-wider font-medium mt-1">
          / 100
        </span>
      </div>
    </div>
  );
}

/* ────────────────────── Card wrapper ──────────────────────── */

function SectionCard({
  title,
  icon: Icon,
  delay = 0,
  children,
}: {
  title: string;
  icon: React.ComponentType<{ className?: string }>;
  delay?: number;
  children: React.ReactNode;
}) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 14 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay, duration: 0.45, ease: [0.25, 0.46, 0.45, 0.94] }}
      className="rounded-xl border border-ev-sand/40 bg-ev-cream/60 p-5"
    >
      <div className="flex items-center gap-2 mb-4">
        <Icon className="w-4 h-4 text-accent-savanna" />
        <h2 className="text-sm font-semibold text-ev-charcoal">{title}</h2>
      </div>
      {children}
    </motion.div>
  );
}

/* ────────────────────── Tier badge helpers ─────────────────── */

function TierBadge({
  tier,
  count,
}: {
  tier: string;
  count: number;
}) {
  const config: Record<string, string> = {
    publishable: "bg-success/15 text-success border-success/30",
    "research-grade": "bg-accent-savanna/15 text-accent-gold border-accent-savanna/30",
    reference: "bg-warning/15 text-warning border-warning/30",
    insufficient: "bg-danger/15 text-danger border-danger/30",
  };
  const cls = config[tier.toLowerCase()] ?? "bg-ev-sand/30 text-ev-elephant border-ev-sand/40";

  return (
    <span
      className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg border text-xs font-medium capitalize ${cls}`}
    >
      {tier}
      <span className="font-bold tabular-nums">{count}</span>
    </span>
  );
}

/* ────────────────────── Horizontal bar chart ──────────────── */

function CallTypeBar({
  types,
  total,
}: {
  types: Record<string, number>;
  total: number;
}) {
  const entries = Object.entries(types).sort((a, b) => b[1] - a[1]);
  if (entries.length === 0 || total === 0) {
    return <p className="text-xs text-ev-warm-gray">No calls detected.</p>;
  }

  return (
    <div className="space-y-2.5">
      {entries.map(([type, count]) => {
        const pct = (count / total) * 100;
        const color = CALL_TYPE_COLORS[type] ?? "#8A9BA5";
        return (
          <div key={type}>
            <div className="flex items-center justify-between mb-1">
              <span className="text-xs font-medium capitalize text-ev-elephant">
                {type}
              </span>
              <span className="text-xs text-ev-warm-gray tabular-nums">
                {count} ({pct.toFixed(0)}%)
              </span>
            </div>
            <div className="h-2 bg-ev-sand/40 rounded-full overflow-hidden">
              <motion.div
                className="h-full rounded-full"
                style={{ backgroundColor: color }}
                initial={{ width: 0 }}
                animate={{ width: `${Math.max(3, pct)}%` }}
                transition={{ duration: 0.8, ease: "easeOut", delay: 0.4 }}
              />
            </div>
          </div>
        );
      })}
    </div>
  );
}

/* ================================================================
   Main Page Component
   ================================================================ */

export default function RecordingSummaryPage() {
  const params = useParams();
  const id = params?.id as string;

  const [recording, setRecording] = useState<Recording | null>(null);
  const [summary, setSummary] = useState<RecordingSummary2 | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  function fetchData() {
    if (!id) return;

    setLoading(true);
    setError(null);

    Promise.all([getRecording(id), getRecordingSummary(id)])
      .then(([rec, sum]) => {
        setRecording(rec);
        setSummary(sum);
      })
      .catch((err) => {
        setError(
          err instanceof Error ? err.message : "Failed to load recording summary."
        );
      })
      .finally(() => setLoading(false));
  }

  useEffect(() => {
    fetchData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  /* ─── Loading state ─── */
  if (loading) {
    return (
      <div className="flex-1 flex items-center justify-center p-12 min-h-[60vh]">
        <div className="text-center">
          <Loader2 className="w-8 h-8 text-accent-savanna animate-spin mx-auto mb-3" />
          <p className="text-sm text-ev-warm-gray">Loading research summary...</p>
        </div>
      </div>
    );
  }

  /* ─── Error state ─── */
  if (error || !recording || !summary) {
    return (
      <div className="flex-1 flex items-center justify-center p-12 min-h-[60vh]">
        <div className="text-center max-w-md">
          <AlertCircle className="w-8 h-8 text-danger mx-auto mb-3" />
          <p className="text-danger mb-1 font-medium">Unable to load summary</p>
          <p className="text-sm text-ev-warm-gray mb-5">
            {error ?? "Recording or summary data not available."}
          </p>
          <Link
            href={`/recordings/${id}`}
            className="inline-flex items-center gap-2 px-5 py-2.5 bg-ev-cream text-ev-charcoal text-sm rounded-xl hover:bg-ev-sand transition-colors font-medium"
          >
            <ArrowLeft className="w-4 h-4" />
            Back to Recording
          </Link>
        </div>
      </div>
    );
  }

  /* ─── Derived values ─── */
  const score = summary.quality_assessment.avg_publishability_score;
  const tier = scoreTier(score);
  const noise = summary.noise_environment;
  const inventory = summary.call_inventory;
  const quality = summary.quality_assessment;

  return (
    <div className="p-6 lg:p-8 max-w-5xl mx-auto space-y-6 print:p-4 print:max-w-none">
      {/* ── 1. Header ── */}
      <motion.div
        initial={{ opacity: 0, y: -8 }}
        animate={{ opacity: 1, y: 0 }}
        className="flex items-center gap-3"
      >
        <Link
          href={`/recordings/${id}`}
          className="p-2 rounded-lg hover:bg-ev-sand/40 transition-colors"
          aria-label="Back to recording"
        >
          <ArrowLeft className="w-5 h-5 text-ev-elephant" />
        </Link>
        <div>
          <h1 className="text-xl font-bold text-ev-charcoal leading-tight">
            Research Summary
          </h1>
          <p className="text-sm text-ev-warm-gray truncate max-w-md">
            {summary.filename}
          </p>
        </div>
      </motion.div>

      {/* ── 2. Publishability Score Card ── */}
      <motion.div
        initial={{ opacity: 0, y: 14 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.08, duration: 0.5 }}
        className="rounded-xl border border-ev-sand/40 bg-ev-cream/60 p-6 flex flex-col items-center text-center"
      >
        <p className="text-[11px] font-medium text-ev-warm-gray uppercase tracking-wider mb-4">
          Publishability Score
        </p>
        <PublishabilityRing score={score} />
        <div className="mt-4">
          <span
            className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border text-sm font-semibold ${tier.badgeClass}`}
          >
            <Star className="w-3.5 h-3.5" />
            {tier.label}
          </span>
        </div>
        <p className="mt-3 text-xs text-ev-warm-gray max-w-lg leading-relaxed">
          {tier.description}
        </p>
      </motion.div>

      {/* ── 3. Recording Info Grid ── */}
      <motion.div
        initial={{ opacity: 0, y: 14 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.16 }}
        className="grid grid-cols-2 md:grid-cols-4 gap-3"
      >
        {[
          {
            label: "Duration",
            value: formatDuration(summary.duration_s),
            icon: Clock,
          },
          {
            label: "Processed",
            value: formatDate(summary.processing_date),
            icon: CheckCircle2,
          },
          {
            label: "Noise Type",
            value: noise.primary_type,
            icon: Volume2,
          },
          {
            label: "Noise Severity",
            value: `${noise.severity} (${noise.pct_affected.toFixed(0)}% affected)`,
            icon: Shield,
          },
        ].map(({ label, value, icon: I }) => (
          <div
            key={label}
            className="rounded-xl border border-ev-sand/40 bg-ev-cream/60 p-3.5"
          >
            <div className="flex items-center gap-1.5 mb-1.5">
              <I className="w-3.5 h-3.5 text-ev-warm-gray" />
              <span className="text-[11px] font-medium text-ev-warm-gray uppercase tracking-wider">
                {label}
              </span>
            </div>
            <p className="text-sm font-semibold text-ev-charcoal capitalize">
              {value}
            </p>
          </div>
        ))}
      </motion.div>

      {/* ── 3b. Metadata Editor ── */}
      <MetadataEditor
        recordingId={id}
        currentMetadata={{
          location: recording.metadata?.location ?? recording.location,
          date: recording.metadata?.date,
          recorded_at: recording.metadata?.recorded_at,
          microphone_type: recording.metadata?.microphone_type,
          notes: recording.metadata?.notes,
          species: recording.metadata?.species,
        }}
        onSaved={() => fetchData()}
      />

      {/* ── 4. Call Inventory ── */}
      <SectionCard title="Call Inventory" icon={BarChart3} delay={0.22}>
        <div className="grid md:grid-cols-[1fr_1fr] gap-6">
          {/* Left: total + type breakdown */}
          <div>
            <div className="flex items-baseline gap-2 mb-4">
              <span className="text-3xl font-bold text-ev-charcoal tabular-nums">
                {inventory.total_calls}
              </span>
              <span className="text-sm text-ev-warm-gray">
                call{inventory.total_calls !== 1 ? "s" : ""} detected
              </span>
            </div>
            <CallTypeBar types={inventory.by_type} total={inventory.total_calls} />
          </div>

          {/* Right: tier breakdown + individuals */}
          <div className="space-y-4">
            <div>
              <p className="text-[11px] font-medium text-ev-warm-gray uppercase tracking-wider mb-2">
                Quality Tier Breakdown
              </p>
              <div className="flex flex-wrap gap-2">
                {Object.entries(inventory.by_tier).map(([t, count]) => (
                  <TierBadge key={t} tier={t} count={count} />
                ))}
              </div>
            </div>

            <div className="pt-3 border-t border-ev-sand/30">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Users className="w-4 h-4 text-accent-savanna" />
                  <span className="text-sm text-ev-elephant font-medium">
                    Individuals Detected
                  </span>
                </div>
                <span className="text-lg font-bold text-ev-charcoal tabular-nums">
                  {inventory.individuals_detected}
                </span>
              </div>
              {inventory.individual_ids.length > 0 && (
                <div className="mt-2 flex flex-wrap gap-1.5">
                  {inventory.individual_ids.map((eid) => (
                    <Link
                      key={eid}
                      href={`/elephants`}
                      className="text-[11px] px-2 py-0.5 rounded-md bg-ev-sand/40 text-accent-gold hover:bg-ev-sand/60 transition-colors font-mono"
                    >
                      {eid}
                    </Link>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      </SectionCard>

      {/* ── 5. Quality Metrics ── */}
      <SectionCard title="Quality Metrics" icon={Shield} delay={0.28}>
        <div className="grid sm:grid-cols-2 gap-4">
          <div className="rounded-lg bg-ev-sand/20 p-4">
            <p className="text-[11px] font-medium text-ev-warm-gray uppercase tracking-wider mb-1">
              Avg SNR Improvement
            </p>
            <div className="flex items-baseline gap-1.5">
              <ArrowUpRight className="w-4 h-4 text-success" />
              <span className="text-2xl font-bold text-ev-charcoal tabular-nums">
                +{quality.avg_snr_improvement_db.toFixed(1)}
              </span>
              <span className="text-sm text-ev-warm-gray">dB</span>
            </div>
          </div>

          <div className="rounded-lg bg-ev-sand/20 p-4">
            <p className="text-[11px] font-medium text-ev-warm-gray uppercase tracking-wider mb-1">
              Best Call
            </p>
            <div className="flex items-baseline gap-2">
              <span className="text-sm font-mono text-accent-gold truncate">
                {quality.best_call_id ? quality.best_call_id.slice(0, 12) : "No calls"}
              </span>
              <span className="text-lg font-bold text-ev-charcoal tabular-nums">
                {quality.best_call_score.toFixed(0)}
              </span>
              <span className="text-xs text-ev-warm-gray">/ 100</span>
            </div>
          </div>
        </div>
      </SectionCard>

      {/* ── 6. Notable Findings ── */}
      {summary.notable_findings.length > 0 && (
        <SectionCard title="Notable Findings" icon={Lightbulb} delay={0.34}>
          <ul className="space-y-2">
            {summary.notable_findings.map((finding, i) => (
              <li key={i} className="flex items-start gap-2.5">
                <CheckCircle2 className="w-4 h-4 text-success mt-0.5 shrink-0" />
                <span className="text-sm text-ev-elephant leading-relaxed">
                  {finding}
                </span>
              </li>
            ))}
          </ul>
        </SectionCard>
      )}

      {/* ── 7. Recommended Actions ── */}
      {summary.recommended_actions.length > 0 && (
        <SectionCard title="Recommended Actions" icon={FileText} delay={0.4}>
          <ul className="space-y-2">
            {summary.recommended_actions.map((action, i) => (
              <li key={i} className="flex items-start gap-2.5">
                <ArrowRight className="w-4 h-4 text-accent-savanna mt-0.5 shrink-0" />
                <span className="text-sm text-ev-elephant leading-relaxed">
                  {action}
                </span>
              </li>
            ))}
          </ul>
        </SectionCard>
      )}

      {/* ── 8. Action Buttons ── */}
      <motion.div
        initial={{ opacity: 0, y: 14 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.46 }}
        className="flex flex-wrap gap-3 pt-2 print:hidden"
      >
        <a
          href={`${API_BASE}/api/recordings/${id}/download`}
          className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-accent-savanna text-white text-sm font-medium hover:bg-accent-gold transition-colors"
        >
          <Download className="w-4 h-4" />
          Download Cleaned WAV
        </a>
        <Link
          href={`/export?recording=${id}`}
          className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl border border-ev-sand/40 text-ev-elephant text-sm font-medium hover:bg-ev-sand/30 transition-colors"
        >
          <FileText className="w-4 h-4" />
          Export CSV
        </Link>
        <Link
          href={`/results/${id}`}
          className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl border border-ev-sand/40 text-ev-elephant text-sm font-medium hover:bg-ev-sand/30 transition-colors"
        >
          <BarChart3 className="w-4 h-4" />
          View Full Results
        </Link>
      </motion.div>
    </div>
  );
}
