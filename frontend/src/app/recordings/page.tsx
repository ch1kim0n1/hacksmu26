"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { motion } from "framer-motion";
import {
  AlertCircle,
  ArrowLeft,
  CheckCircle2,
  ChevronRight,
  Clock,
  Download,
  Layers,
  Loader2,
  Music,
  RotateCw,
  Sparkles,
} from "lucide-react";
import {
  downloadRecording,
  getRecordings,
  processRecording,
  type Recording,
} from "@/lib/audio-api";
import { AnalysisLabelsBadge } from "@/components/research/AnalysisLabels";
import {
  fadeUp,
  staggerContainer,
  SoundWave,
} from "@/components/ui/motion-primitives";

function StatusBadge({ status }: { status: string }) {
  const config: Record<
    string,
    { bg: string; text: string; icon: React.ReactNode }
  > = {
    pending: {
      bg: "bg-ev-warm-gray/10 border-ev-warm-gray/15",
      text: "text-ev-warm-gray",
      icon: <Clock className="h-3 w-3" />,
    },
    processing: {
      bg: "bg-accent-savanna/10 border-accent-savanna/15",
      text: "text-accent-savanna",
      icon: <Loader2 className="h-3 w-3 animate-spin" />,
    },
    complete: {
      bg: "bg-success/10 border-success/15",
      text: "text-success",
      icon: <CheckCircle2 className="h-3 w-3" />,
    },
    failed: {
      bg: "bg-danger/10 border-danger/15",
      text: "text-danger",
      icon: <AlertCircle className="h-3 w-3" />,
    },
  };
  const c = config[status] || config.pending;
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-medium ${c.bg} ${c.text}`}
    >
      {c.icon}
      {status.charAt(0).toUpperCase() + status.slice(1)}
    </span>
  );
}

function formatDuration(seconds?: number): string {
  if (!seconds) return "--:--";
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${s.toString().padStart(2, "0")}`;
}

function formatFileSize(bytes?: number): string {
  if (!bytes) return "--";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

const FILTERS = [
  { key: "all", label: "All" },
  { key: "pending", label: "Pending" },
  { key: "processing", label: "Processing" },
  { key: "complete", label: "Completed" },
  { key: "failed", label: "Failed" },
] as const;

type FilterKey = (typeof FILTERS)[number]["key"];

export default function RecordingsPage() {
  const router = useRouter();
  const searchParams = useSearchParams();

  const [recordings, setRecordings] = useState<Recording[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [processingIds, setProcessingIds] = useState<Set<string>>(new Set());
  const [enhanceWithAI, setEnhanceWithAI] = useState(true);

  const currentFilter = useMemo<FilterKey>(() => {
    const requested = searchParams.get("status");
    return FILTERS.some((filter) => filter.key === requested)
      ? (requested as FilterKey)
      : "all";
  }, [searchParams]);

  const fetchRecordings = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const data = await getRecordings({ limit: 100 });
      setRecordings(data.recordings);
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Failed to load recordings",
      );
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchRecordings();
  }, [fetchRecordings]);

  const filteredRecordings = useMemo(() => {
    if (currentFilter === "all") return recordings;
    return recordings.filter((recording) => recording.status === currentFilter);
  }, [currentFilter, recordings]);

  const handleProcess = async (id: string) => {
    setProcessingIds((prev) => new Set(prev).add(id));
    try {
      await processRecording(id, {
        method: enhanceWithAI ? "hybrid" : "spectral",
      });
      await fetchRecordings();
      router.push(`/processing/${id}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Processing failed");
    } finally {
      setProcessingIds((prev) => {
        const next = new Set(prev);
        next.delete(id);
        return next;
      });
    }
  };

  const handleDownload = async (id: string) => {
    try {
      await downloadRecording(id);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Download failed");
    }
  };

  const filterLabel =
    FILTERS.find((filter) => filter.key === currentFilter)?.label || "All";
  const emptyLabel =
    currentFilter === "all"
      ? "No recordings yet"
      : `No ${filterLabel.toLowerCase()} recordings yet`;
  const summaryLabel =
    currentFilter === "all"
      ? `Showing ${filteredRecordings.length} recording${filteredRecordings.length === 1 ? "" : "s"}.`
      : `Showing ${filteredRecordings.length} ${filterLabel.toLowerCase()} recording${filteredRecordings.length === 1 ? "" : "s"}.`;

  return (
    <div className="mx-auto max-w-6xl space-y-8 p-6 lg:p-8">
      <motion.div
        initial={{ opacity: 0, y: -8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4 }}
        className="flex items-end justify-between gap-4"
      >
        <div>
          <Link
            href="/upload"
            className="mb-4 inline-flex min-h-[44px] items-center gap-2 rounded-full border border-ev-sand/40 bg-white/80 px-4 py-2.5 text-sm font-medium text-ev-elephant shadow-sm transition-all hover:border-ev-warm-gray/30 hover:bg-white"
          >
            <ArrowLeft className="h-4 w-4" />
            Back to Upload
          </Link>
          <div className="mb-2 flex items-center gap-2 text-sm text-ev-warm-gray">
            <Link href="/upload" className="transition-colors hover:text-ev-elephant">
              Upload
            </Link>
            <ChevronRight className="h-3.5 w-3.5" />
            <span className="text-ev-elephant">Recordings</span>
          </div>
          <h1 className="text-2xl font-bold text-ev-charcoal">Recordings</h1>
          <p className="mt-1 text-sm text-ev-warm-gray">
            Browse all uploaded files, process pending work, and open active or
            completed jobs.
          </p>
        </div>
        <SoundWave
          bars={6}
          className="hidden h-6 sm:flex"
          color="bg-ev-elephant/55"
        />
      </motion.div>

      <div className="flex flex-wrap items-center gap-2">
        {FILTERS.map((filter) => {
          const isActive = filter.key === currentFilter;
          const href =
            filter.key === "all"
              ? "/recordings"
              : `/recordings?status=${filter.key}`;
          return (
            <Link
              key={filter.key}
              href={href}
              className={`rounded-full px-4 py-2 text-sm font-medium transition-colors ${
                isActive
                  ? "bg-ev-charcoal text-white"
                  : "bg-white/60 text-ev-elephant hover:bg-ev-cream"
              }`}
            >
              {filter.label}
            </Link>
          );
        })}
      </div>

      <div className="flex items-center justify-between gap-4">
        <p className="text-sm text-ev-warm-gray">{summaryLabel}</p>
        <div className="inline-flex shrink-0 items-center gap-2.5 rounded-xl border border-ev-sand/30 px-3.5 py-2 glass">
          <Sparkles className="h-3.5 w-3.5 shrink-0 text-accent-savanna" />
          <span className="whitespace-nowrap text-xs font-medium text-ev-elephant">
            AI Enhance
          </span>
          <button
            type="button"
            role="switch"
            onClick={() => setEnhanceWithAI((prev) => !prev)}
            className={`relative inline-flex h-5 w-9 shrink-0 items-center rounded-full transition-colors duration-200 ${
              enhanceWithAI ? "bg-success" : "bg-ev-warm-gray/30"
            }`}
            aria-checked={enhanceWithAI}
            aria-label="Toggle AI enhancement"
          >
            <motion.span
              className="pointer-events-none block h-4 w-4 rounded-full bg-white shadow-sm"
              animate={{ x: enhanceWithAI ? 18 : 2 }}
              transition={{ type: "spring", stiffness: 500, damping: 30 }}
            />
          </button>
          <span className="text-[10px] text-ev-warm-gray">
            {enhanceWithAI ? "Hybrid" : "Spectral"}
          </span>
        </div>
      </div>

      {error && (
        <div className="flex items-center gap-3 rounded-xl border border-danger/15 bg-danger/5 p-4 text-sm text-danger">
          <AlertCircle className="h-5 w-5 flex-shrink-0" />
          {error}
        </div>
      )}

      {loading ? (
        <div className="space-y-3">
          {[1, 2, 3].map((i) => (
            <div
              key={i}
              className="rounded-xl border border-ev-sand/30 p-5 glass animate-pulse"
              style={{ animationDelay: `${i * 0.1}s` }}
            >
              <div className="flex items-center gap-4">
                <div className="h-10 w-10 rounded-lg bg-ev-cream" />
                <div className="flex-1">
                  <div className="mb-2 h-4 w-48 rounded bg-ev-cream" />
                  <div className="h-3 w-32 rounded bg-ev-cream" />
                </div>
              </div>
            </div>
          ))}
        </div>
      ) : filteredRecordings.length === 0 ? (
        <motion.div
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          className="rounded-2xl border border-dashed border-ev-sand/60 p-12 text-center glass"
        >
          <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-gradient-to-br from-accent-savanna/10 to-accent-gold/5">
            <Music className="h-7 w-7 text-accent-savanna/60" />
          </div>
          <p className="mb-1 font-medium text-ev-elephant">{emptyLabel}</p>
          <p className="text-sm text-ev-warm-gray">
            Upload a recording to start building your library.
          </p>
        </motion.div>
      ) : (
        <motion.div
          variants={staggerContainer}
          initial="initial"
          animate="animate"
          className="space-y-2"
        >
          {filteredRecordings.map((rec) => (
            <motion.div
              key={rec.id}
              variants={fadeUp}
              onClick={() => {
                if (rec.status === "complete" || rec.status === "processing") {
                  router.push(`/processing/${rec.id}`);
                }
              }}
              className={`group rounded-xl border border-ev-sand/30 p-4 glass ${
                rec.status === "complete" || rec.status === "processing"
                  ? "cursor-pointer card-hover"
                  : ""
              }`}
            >
              <div className="flex items-start justify-between gap-4">
                <div className="flex min-w-0 flex-1 items-start gap-3.5">
                  <div className="mt-0.5 flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-gradient-to-br from-accent-savanna/10 to-accent-gold/5">
                    <Music className="h-5 w-5 text-accent-savanna" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="max-w-[200px] truncate text-sm font-medium text-ev-charcoal sm:max-w-none">
                        {rec.filename}
                      </p>
                      <AnalysisLabelsBadge recording={rec} />
                    </div>
                    <div className="mt-1 flex flex-wrap items-center gap-2.5 text-xs text-ev-warm-gray">
                      <span className="tabular-nums">
                        {formatDuration(rec.duration ?? rec.duration_s)}
                      </span>
                      <span className="text-ev-sand">·</span>
                      <span className="tabular-nums">
                        {formatFileSize(rec.file_size)}
                      </span>
                      {rec.sample_rate && (
                        <>
                          <span className="text-ev-sand">·</span>
                          <span className="tabular-nums">
                            {(rec.sample_rate / 1000).toFixed(1)} kHz
                          </span>
                        </>
                      )}
                    </div>
                    <div className="mt-2 flex flex-wrap items-center gap-1.5">
                      {rec.metadata?.animal_id && (
                        <span className="rounded-md bg-ev-cream/80 px-2 py-0.5 text-[11px] leading-tight text-ev-elephant">
                          Animal: {rec.metadata.animal_id}
                        </span>
                      )}
                      {rec.metadata?.noise_type_ref && (
                        <span className="rounded-md bg-accent-savanna/8 px-2 py-0.5 text-[11px] leading-tight text-accent-savanna">
                          Noise: {rec.metadata.noise_type_ref}
                        </span>
                      )}
                      {rec.metadata?.call_id && (
                        <span className="rounded-md bg-ev-warm-gray/10 px-2 py-0.5 text-[11px] leading-tight text-ev-elephant">
                          Call: {rec.metadata.call_id}
                        </span>
                      )}
                      {(rec.metadata?.start_sec !== undefined ||
                        rec.metadata?.end_sec !== undefined) && (
                        <span className="rounded-md bg-ev-warm-gray/8 px-2 py-0.5 text-[11px] leading-tight text-ev-warm-gray tabular-nums">
                          {rec.metadata?.start_sec?.toFixed(2) ?? "0.00"}s -{" "}
                          {rec.metadata?.end_sec?.toFixed(2) ?? "--"}s
                        </span>
                      )}
                    </div>
                  </div>
                </div>

                <div className="flex shrink-0 items-center gap-2.5 self-center">
                  <StatusBadge status={rec.status} />

                  {rec.status === "pending" && (
                    <motion.button
                      whileHover={{ scale: 1.03 }}
                      whileTap={{ scale: 0.97 }}
                      onClick={(e) => {
                        e.stopPropagation();
                        handleProcess(rec.id);
                      }}
                      disabled={processingIds.has(rec.id)}
                      aria-label={`Process ${rec.filename}`}
                      className="inline-flex items-center gap-1.5 rounded-lg bg-gradient-to-r from-success to-success-light px-4 py-1.5 text-xs font-semibold text-white shadow-sm transition-shadow hover:shadow-md disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      {processingIds.has(rec.id) ? (
                        <>
                          <Loader2 className="h-3 w-3 animate-spin" />
                          <span>Starting…</span>
                        </>
                      ) : (
                        <span>Process</span>
                      )}
                    </motion.button>
                  )}

                  {rec.status === "complete" && (
                    <motion.button
                      whileHover={{ scale: 1.03 }}
                      whileTap={{ scale: 0.97 }}
                      onClick={(e) => {
                        e.stopPropagation();
                        handleDownload(rec.id);
                      }}
                      aria-label={`Download ${rec.filename}`}
                      className="inline-flex items-center gap-1.5 rounded-lg bg-accent-savanna/10 px-4 py-1.5 text-xs font-semibold text-accent-savanna transition-colors hover:bg-accent-savanna/15"
                    >
                      <Download className="h-3 w-3" />
                      <span>Download</span>
                    </motion.button>
                  )}

                  {rec.status === "failed" && (
                    <motion.button
                      whileHover={{ scale: 1.03 }}
                      whileTap={{ scale: 0.97 }}
                      onClick={(e) => {
                        e.stopPropagation();
                        handleProcess(rec.id);
                      }}
                      aria-label={`Retry processing ${rec.filename}`}
                      className="inline-flex items-center gap-1.5 rounded-lg bg-danger/10 px-4 py-1.5 text-xs font-semibold text-danger transition-colors hover:bg-danger/15"
                    >
                      <RotateCw className="h-3 w-3" />
                      <span>Retry</span>
                    </motion.button>
                  )}

                  {(rec.status === "complete" ||
                    rec.status === "processing") && (
                    <ChevronRight className="h-4 w-4 text-ev-dust transition-colors group-hover:text-ev-warm-gray" />
                  )}
                </div>
              </div>
            </motion.div>
          ))}
        </motion.div>
      )}

      <div className="flex items-center gap-3 rounded-2xl border border-ev-sand/30 p-5 glass">
        <Layers className="h-5 w-5 text-accent-savanna" />
        <p className="text-sm text-ev-warm-gray">
          Need to add more source audio? Head back to{" "}
          <Link href="/upload" className="font-medium text-ev-elephant underline-offset-4 hover:underline">
            Upload
          </Link>
          .
        </p>
      </div>
    </div>
  );
}
