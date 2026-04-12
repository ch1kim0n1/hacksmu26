"use client";

import Link from "next/link";
import { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import { motion } from "framer-motion";
import {
  ArrowLeft,
  Search,
  ChevronRight,
  ChevronLeft,
  ChevronDown,
  MapPin,
  Database as DatabaseIcon,
  RefreshCw,
  AlertCircle,
} from "lucide-react";
import { getCalls, type Call } from "@/lib/audio-api";
import { staggerContainer, fadeUp } from "@/components/ui/motion-primitives";

const CALL_TYPES = [
  "All Types",
  "Rumble",
  "Trumpet",
  "Roar",
  "Bark",
  "Cry",
  "Contact Call",
  "Greeting",
  "Play",
  "Other",
];

const PAGE_SIZE = 12;

const CALL_TYPE_COLORS: Record<string, string> = {
  rumble: "bg-accent-savanna/10 text-accent-savanna border-accent-savanna/20",
  trumpet: "bg-accent-gold/10 text-accent-gold border-accent-gold/20",
  roar: "bg-danger/10 text-danger border-danger/20",
  bark: "bg-warning/10 text-warning border-warning/20",
  cry: "bg-purple-400/10 text-purple-400 border-purple-400/20",
  "contact call": "bg-success/10 text-success border-success/20",
  greeting: "bg-blue-400/10 text-blue-400 border-blue-400/20",
  play: "bg-pink-400/10 text-pink-400 border-pink-400/20",
};

function CallTypeBadge({ type }: { type: string }) {
  const c =
    CALL_TYPE_COLORS[type.toLowerCase()] ||
    "bg-ev-warm-gray/10 text-ev-warm-gray border-ev-warm-gray/20";
  return (
    <span
      className={`px-2 py-0.5 rounded-md text-[11px] font-semibold border ${c}`}
    >
      {type}
    </span>
  );
}

function PublishabilityBadge({ score, tier }: { score?: number; tier?: string }) {
  if (score == null) return null;
  const classes =
    score >= 85
      ? "bg-success/10 text-success border-success/20"
      : score >= 70
        ? "bg-accent-savanna/10 text-accent-savanna border-accent-savanna/20"
        : score >= 50
          ? "bg-warning/10 text-warning border-warning/20"
          : "bg-danger/10 text-danger border-danger/20";
  return (
    <span className={`rounded-md border px-2 py-0.5 text-[11px] font-semibold ${classes}`}>
      {tier ? tier.replace("_", " ") : "score"} {score.toFixed(0)}
    </span>
  );
}

export default function DatabasePage() {
  const router = useRouter();

  const [calls, setCalls] = useState<Call[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [search, setSearch] = useState("");
  const [callTypeFilter, setCallTypeFilter] = useState("All Types");
  const [locationFilter, setLocationFilter] = useState("");
  const [page, setPage] = useState(0);

  const fetchCalls = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const data = await getCalls({
        limit: PAGE_SIZE,
        offset: page * PAGE_SIZE,
        call_type:
          callTypeFilter !== "All Types" ? callTypeFilter : undefined,
      });
      setCalls(data.calls);
      setTotal(data.total);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load calls");
    } finally {
      setLoading(false);
    }
  }, [page, callTypeFilter]);

  useEffect(() => {
    fetchCalls();
  }, [fetchCalls]);

  const filtered = calls.filter((call) => {
    if (search) {
      const q = search.toLowerCase();
      const matchesId = call.id.toLowerCase().includes(q);
      const matchesRecording = call.recording_id.toLowerCase().includes(q);
      const matchesType = call.call_type.toLowerCase().includes(q);
      if (!matchesId && !matchesRecording && !matchesType) return false;
    }
    if (locationFilter) {
      const loc =
        (call.metadata as Record<string, string>)?.location || "";
      if (!loc.toLowerCase().includes(locationFilter.toLowerCase()))
        return false;
    }
    return true;
  });

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  return (
    <div className="p-6 lg:p-8 max-w-6xl mx-auto space-y-6">
      {/* Page Header */}
      <motion.div
        initial={{ opacity: 0, y: -8 }}
        animate={{ opacity: 1, y: 0 }}
        className="flex flex-col sm:flex-row sm:items-end justify-between gap-4"
      >
        <div>
          <Link
            href="/upload"
            className="mb-4 inline-flex min-h-[44px] items-center gap-2 rounded-full border border-ev-sand/40 bg-white/80 px-4 py-2.5 text-sm font-medium text-ev-elephant shadow-sm transition-all hover:border-ev-warm-gray/30 hover:bg-white"
          >
            <ArrowLeft className="h-4 w-4" />
            Back to Upload
          </Link>
          <h1 className="text-2xl font-bold text-ev-charcoal">
            Call Database
          </h1>
          <p className="text-sm text-ev-warm-gray mt-1">
            Browse and search all detected elephant vocalizations.
          </p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <Link
            href="/elephants"
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl border border-accent-savanna/30 bg-accent-savanna/5 text-xs font-medium text-accent-savanna hover:bg-accent-savanna/10 transition-colors"
          >
            Elephants
          </Link>
          <Link
            href="/research/ethology"
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl border border-blue-400/30 bg-blue-400/5 text-xs font-medium text-blue-400 hover:bg-blue-400/10 transition-colors"
          >
            Call Guide
          </Link>
          <Link
            href="/research/social-network"
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl border border-purple-400/30 bg-purple-400/5 text-xs font-medium text-purple-400 hover:bg-purple-400/10 transition-colors"
          >
            Social Network
          </Link>
          <motion.span
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ delay: 0.15 }}
            className="glass border border-ev-sand/30 px-3 py-1.5 rounded-xl tabular-nums text-sm text-ev-warm-gray font-medium"
          >
            {total} total calls
          </motion.span>
        </div>
      </motion.div>

      {/* Search & Filters */}
      <motion.div
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.08 }}
        className="flex flex-col sm:flex-row gap-3"
      >
        <div className="relative flex-1">
          <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-ev-warm-gray" />
          <input
            type="text"
            placeholder="Search by call ID, recording ID, or type..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full pl-10 pr-4 py-2.5 glass border border-ev-sand/40 rounded-xl text-sm text-ev-charcoal placeholder:text-ev-warm-gray/50 focus:outline-none focus:border-accent-savanna/40 focus:ring-2 focus:ring-accent-savanna/10 transition-all"
          />
        </div>

        <div className="relative">
          <select
            value={callTypeFilter}
            onChange={(e) => {
              setCallTypeFilter(e.target.value);
              setPage(0);
            }}
            aria-label="Filter by call type"
            className="min-w-[11rem] px-3.5 py-2.5 pr-10 glass border border-ev-sand/40 rounded-xl text-sm text-ev-charcoal focus:outline-none focus:border-accent-savanna/40 focus:ring-2 focus:ring-accent-savanna/10 transition-all appearance-none"
          >
            {CALL_TYPES.map((t) => (
              <option key={t} value={t}>
                {t}
              </option>
            ))}
          </select>
          <ChevronDown
            className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ev-warm-gray"
            aria-hidden="true"
          />
        </div>

        <div className="relative sm:w-44">
          <MapPin className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-ev-warm-gray" />
          <input
            type="text"
            placeholder="Location..."
            value={locationFilter}
            onChange={(e) => setLocationFilter(e.target.value)}
            className="w-full pl-9 pr-3.5 py-2.5 glass border border-ev-sand/40 rounded-xl text-sm text-ev-charcoal placeholder:text-ev-warm-gray/50 focus:outline-none focus:border-accent-savanna/40 focus:ring-2 focus:ring-accent-savanna/10 transition-all"
          />
        </div>
      </motion.div>

      {/* Call Grid */}
      {loading ? (
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
          {Array.from({ length: 8 }).map((_, i) => (
            <div
              key={i}
              className="p-4 rounded-xl glass border border-ev-sand/30 animate-pulse"
              style={{ animationDelay: `${i * 0.05}s` }}
            >
              <div className="flex items-center justify-between mb-3">
                <div className="h-3 w-20 bg-ev-cream rounded" />
                <div className="h-5 w-14 bg-ev-cream rounded" />
              </div>
              <div className="space-y-2 mt-4">
                <div className="h-3 w-full bg-ev-cream rounded" />
                <div className="h-3 w-2/3 bg-ev-cream rounded" />
              </div>
            </div>
          ))}
        </div>
      ) : error ? (
        <div className="p-8 rounded-xl glass border border-ev-sand/30 text-center">
          <AlertCircle className="w-8 h-8 text-danger mx-auto mb-3" />
          <p className="text-danger mb-4">{error}</p>
          <motion.button
            whileHover={{ scale: 1.02 }}
            whileTap={{ scale: 0.98 }}
            onClick={fetchCalls}
            className="px-5 py-2 bg-ev-cream text-ev-elephant rounded-xl hover:text-ev-charcoal transition-colors text-sm font-medium inline-flex items-center gap-1.5"
          >
            <RefreshCw className="w-3.5 h-3.5" />
            Retry
          </motion.button>
        </div>
      ) : filtered.length === 0 ? (
        <motion.div
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          className="p-16 rounded-2xl glass border border-dashed border-ev-sand/60 text-center"
        >
          <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-accent-savanna/10 to-accent-gold/5 flex items-center justify-center mx-auto mb-4">
            <DatabaseIcon className="w-7 h-7 text-accent-savanna/50" />
          </div>
          <p className="text-ev-elephant font-medium mb-1">No calls found</p>
          <p className="text-ev-warm-gray text-sm">
            Try adjusting your filters or upload recordings for processing.
          </p>
        </motion.div>
      ) : (
        <motion.div
          variants={staggerContainer}
          initial="initial"
          animate="animate"
          className="grid sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4"
        >
          {filtered.map((call) => (
            <motion.button
              key={call.id}
              variants={fadeUp}
              onClick={() => router.push(`/results/${call.recording_id}`)}
              aria-label={`View call ${call.call_type} ${call.id.slice(0, 8)}`}
              className="group p-4 rounded-xl glass border border-ev-sand/30 card-hover text-left flex flex-col"
            >
              {/* Top row */}
              <div className="flex items-start justify-between gap-2 mb-3">
                <div className="min-w-0">
                  <p className="font-mono text-[11px] text-ev-warm-gray truncate">
                    {call.id.slice(0, 12)}&hellip;
                  </p>
                  {call.call_id && call.call_id !== call.id && (
                    <p className="text-[11px] text-ev-warm-gray/70 truncate">
                      Call: {call.call_id}
                    </p>
                  )}
                </div>
                <CallTypeBadge type={call.call_type} />
              </div>

              <div className="mb-3 flex flex-wrap gap-1.5">
                {call.reference_matches?.[0] && (
                  <span className="rounded-md border border-accent-gold/25 bg-accent-gold/10 px-2 py-0.5 text-[11px] font-semibold text-accent-gold">
                    Best Match: {call.reference_matches[0].label}{" "}
                    {(call.reference_matches[0].similarity_score * 100).toFixed(0)}%
                  </span>
                )}
                {call.ethology?.meaning && (
                  <span
                    title={`${call.ethology.behavioral_context ?? ""} ${call.ethology.common_response ?? ""}`.trim()}
                    className="rounded-md border border-blue-400/20 bg-blue-400/10 px-2 py-0.5 text-[11px] font-semibold text-blue-500"
                  >
                    Meaning: {call.ethology.meaning}
                  </span>
                )}
                <PublishabilityBadge
                  score={call.publishability?.score}
                  tier={call.publishability?.tier}
                />
              </div>

              {/* Frequency range bar */}
              {call.frequency_low != null && call.frequency_high != null && (
                <div className="mb-3">
                  <div className="h-1 bg-ev-cream rounded-full overflow-hidden">
                    <div
                      className="h-full bg-gradient-to-r from-accent-savanna/60 to-accent-gold/40 rounded-full"
                      style={{
                        marginLeft: `${Math.max(0, (call.frequency_low / 2000) * 100)}%`,
                        width: `${Math.min(100, ((call.frequency_high - call.frequency_low) / 2000) * 100)}%`,
                      }}
                    />
                  </div>
                </div>
              )}

              {/* Metrics */}
              <div className="grid grid-cols-2 gap-x-4 gap-y-2 text-sm">
                <div>
                  <p className="text-[10px] text-ev-warm-gray/60 uppercase tracking-wider">
                    Duration
                  </p>
                  <p className="text-ev-charcoal font-medium text-xs tabular-nums">
                    {(call.end_time - call.start_time).toFixed(2)}s
                  </p>
                </div>
                <div>
                  <p className="text-[10px] text-ev-warm-gray/60 uppercase tracking-wider">
                    Frequency
                  </p>
                  <p className="text-ev-charcoal font-medium text-xs tabular-nums">
                    {call.frequency_low && call.frequency_high
                      ? `${call.frequency_low}-${call.frequency_high} Hz`
                      : "--"}
                  </p>
                </div>
                <div>
                  <p className="text-[10px] text-ev-warm-gray/60 uppercase tracking-wider">
                    Confidence
                  </p>
                  <div className="flex items-center gap-1.5">
                    <p className="text-ev-charcoal font-medium text-xs tabular-nums">
                      {call.confidence !== undefined
                        ? `${(call.confidence * 100).toFixed(0)}%`
                        : "--"}
                    </p>
                    {call.confidence !== undefined && (
                      <div className="flex-1 h-1 bg-ev-cream rounded-full overflow-hidden">
                        <div
                          className="h-full rounded-full bg-gradient-to-r from-accent-savanna to-success transition-all"
                          style={{
                            width: `${call.confidence * 100}%`,
                          }}
                        />
                      </div>
                    )}
                  </div>
                </div>
                <div>
                  <p className="text-[10px] text-ev-warm-gray/60 uppercase tracking-wider">
                    Start
                  </p>
                  <p className="text-ev-charcoal font-medium text-xs tabular-nums">
                    {call.start_time.toFixed(2)}s
                  </p>
                </div>
                <div>
                  <p className="text-[10px] text-ev-warm-gray/60 uppercase tracking-wider">
                    Animal
                  </p>
                  <p className="text-ev-charcoal font-medium text-xs truncate">
                    {call.animal_id || "Unknown"}
                  </p>
                </div>
                <div>
                  <p className="text-[10px] text-ev-warm-gray/60 uppercase tracking-wider">
                    Noise Ref
                  </p>
                  <p className="text-ev-charcoal font-medium text-xs capitalize truncate">
                    {call.noise_type_ref || "Unknown"}
                  </p>
                </div>
              </div>

              {/* Hover indicator */}
              <div className="mt-3 pt-2.5 border-t border-ev-sand/20 flex items-center gap-1 text-[11px] text-accent-savanna font-medium opacity-0 group-hover:opacity-100 transition-opacity">
                View details
                <ChevronRight className="w-3 h-3" />
              </div>
            </motion.button>
          ))}
        </motion.div>
      )}

      {/* Pagination */}
      {totalPages > 1 && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.3 }}
          className="flex items-center justify-center gap-1.5 pt-4"
        >
          <motion.button
            whileHover={{ scale: 1.03 }}
            whileTap={{ scale: 0.97 }}
            onClick={() => setPage(Math.max(0, page - 1))}
            disabled={page === 0}
            aria-label="Previous page"
            className="inline-flex items-center gap-1.5 px-3.5 py-2 glass border border-ev-sand/30 rounded-lg text-ev-elephant hover:text-ev-charcoal transition-all text-sm font-medium disabled:opacity-30 disabled:cursor-not-allowed"
          >
            <ChevronLeft className="w-3.5 h-3.5" />
            <span>Previous</span>
          </motion.button>

          {Array.from({ length: Math.min(5, totalPages) }).map((_, i) => {
            let pageNum: number;
            if (totalPages <= 5) {
              pageNum = i;
            } else if (page < 3) {
              pageNum = i;
            } else if (page > totalPages - 4) {
              pageNum = totalPages - 5 + i;
            } else {
              pageNum = page - 2 + i;
            }
            return (
              <motion.button
                key={pageNum}
                whileHover={{ scale: 1.08 }}
                whileTap={{ scale: 0.92 }}
                onClick={() => setPage(pageNum)}
                aria-label={`Page ${pageNum + 1}`}
                aria-current={page === pageNum ? "page" : undefined}
                className={`w-9 h-9 rounded-lg text-sm font-medium transition-all tabular-nums ${
                  page === pageNum
                    ? "bg-gradient-to-r from-accent-savanna to-accent-gold text-white shadow-sm shadow-accent-savanna/20"
                    : "glass border border-ev-sand/30 text-ev-elephant hover:text-ev-charcoal"
                }`}
              >
                {pageNum + 1}
              </motion.button>
            );
          })}

          <motion.button
            whileHover={{ scale: 1.03 }}
            whileTap={{ scale: 0.97 }}
            onClick={() =>
              setPage(Math.min(totalPages - 1, page + 1))
            }
            disabled={page >= totalPages - 1}
            aria-label="Next page"
            className="inline-flex items-center gap-1.5 px-3.5 py-2 glass border border-ev-sand/30 rounded-lg text-ev-elephant hover:text-ev-charcoal transition-all text-sm font-medium disabled:opacity-30 disabled:cursor-not-allowed"
          >
            <span>Next</span>
            <ChevronRight className="w-3.5 h-3.5" />
          </motion.button>
        </motion.div>
      )}
    </div>
  );
}
