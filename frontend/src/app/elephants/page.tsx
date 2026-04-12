"use client";

import Link from "next/link";
import { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import { motion } from "framer-motion";
import {
  ArrowLeft,
  Search,
  ChevronRight,
  MapPin,
  AlertCircle,
  RefreshCw,
  Mic,
  FileAudio,
  Calendar,
} from "lucide-react";
import {
  getElephants,
  type ElephantProfile,
} from "@/lib/audio-api";
import { staggerContainer, fadeUp } from "@/components/ui/motion-primitives";

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

function formatDate(dateStr: string): string {
  try {
    const d = new Date(dateStr);
    return d.toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
      year: "numeric",
    });
  } catch {
    return dateStr;
  }
}

export default function ElephantsPage() {
  const router = useRouter();

  const [elephants, setElephants] = useState<ElephantProfile[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");

  const fetchElephants = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const data = await getElephants();
      setElephants(data);
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Failed to load elephants"
      );
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchElephants();
  }, [fetchElephants]);

  const filtered = elephants.filter((el) => {
    if (!search) return true;
    const q = search.toLowerCase();
    if (el.individual_id.toLowerCase().includes(q)) return true;
    if (el.most_common_type.toLowerCase().includes(q)) return true;
    if (el.locations.some((loc) => loc.toLowerCase().includes(q))) return true;
    return false;
  });

  return (
    <div className="p-6 lg:p-8 max-w-7xl mx-auto space-y-6">
      {/* Page Header */}
      <motion.div
        initial={{ opacity: 0, y: -8 }}
        animate={{ opacity: 1, y: 0 }}
        className="flex flex-col sm:flex-row sm:items-end justify-between gap-4"
      >
        <div>
          <Link
            href="/database"
            className="mb-4 inline-flex min-h-[44px] items-center gap-2 rounded-full border border-ev-sand/40 bg-white/80 px-4 py-2.5 text-sm font-medium text-ev-elephant shadow-sm transition-all hover:border-ev-warm-gray/30 hover:bg-white"
          >
            <ArrowLeft className="h-4 w-4" />
            Back to Database
          </Link>
          <h1 className="text-2xl font-bold text-ev-charcoal">
            Identified Elephants
          </h1>
          <p className="text-sm text-ev-warm-gray mt-1">
            Browse individual elephant profiles identified from acoustic
            signatures.
          </p>
        </div>
        {!loading && !error && (
          <motion.span
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ delay: 0.15 }}
            className="glass border border-ev-sand/30 px-3 py-1.5 rounded-xl tabular-nums text-sm text-ev-warm-gray font-medium"
          >
            {elephants.length} individual{elephants.length !== 1 ? "s" : ""}
          </motion.span>
        )}
      </motion.div>

      {/* Search */}
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
            placeholder="Search by ID, call type, or location..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full pl-10 pr-4 py-2.5 glass border border-ev-sand/40 rounded-xl text-sm text-ev-charcoal placeholder:text-ev-warm-gray/50 focus:outline-none focus:border-accent-savanna/40 focus:ring-2 focus:ring-accent-savanna/10 transition-all"
          />
        </div>
      </motion.div>

      {/* Grid */}
      {loading ? (
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {Array.from({ length: 6 }).map((_, i) => (
            <div
              key={i}
              className="p-5 rounded-xl border border-ev-sand/40 bg-ev-cream/60 animate-pulse"
              style={{ animationDelay: `${i * 0.05}s` }}
            >
              <div className="flex items-center justify-between mb-4">
                <div className="h-5 w-28 bg-ev-sand/50 rounded" />
                <div className="h-5 w-16 bg-ev-sand/50 rounded" />
              </div>
              <div className="space-y-2.5">
                <div className="h-3 w-full bg-ev-sand/40 rounded" />
                <div className="h-3 w-2/3 bg-ev-sand/40 rounded" />
                <div className="h-3 w-1/2 bg-ev-sand/40 rounded" />
              </div>
            </div>
          ))}
        </div>
      ) : error ? (
        <div className="p-8 rounded-xl border border-ev-sand/40 bg-ev-cream/60 text-center">
          <AlertCircle className="w-8 h-8 text-danger mx-auto mb-3" />
          <p className="text-danger mb-4">{error}</p>
          <motion.button
            whileHover={{ scale: 1.02 }}
            whileTap={{ scale: 0.98 }}
            onClick={fetchElephants}
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
          className="p-16 rounded-2xl border border-dashed border-ev-sand/60 bg-ev-cream/40 text-center"
        >
          <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-accent-savanna/10 to-accent-gold/5 flex items-center justify-center mx-auto mb-4">
            <Mic className="w-7 h-7 text-accent-savanna/50" />
          </div>
          <p className="text-ev-elephant font-medium mb-1">
            No elephants found
          </p>
          <p className="text-ev-warm-gray text-sm">
            {search
              ? "Try adjusting your search terms."
              : "Process recordings to identify individual elephants."}
          </p>
        </motion.div>
      ) : (
        <motion.div
          variants={staggerContainer}
          initial="initial"
          animate="animate"
          className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4"
        >
          {filtered.map((el) => {
            const sortedDates = [...el.dates].sort();
            const firstDate = sortedDates[0];
            const lastDate = sortedDates[sortedDates.length - 1];

            return (
              <motion.button
                key={el.individual_id}
                variants={fadeUp}
                onClick={() =>
                  router.push(
                    `/elephants/${encodeURIComponent(el.individual_id)}`
                  )
                }
                aria-label={`View profile for ${el.individual_id}`}
                className="group p-5 rounded-xl border border-ev-sand/40 bg-ev-cream/60 card-hover text-left flex flex-col transition-shadow hover:shadow-card-hover"
              >
                {/* Title row */}
                <div className="flex items-start justify-between gap-2 mb-3">
                  <h2 className="text-base font-bold text-ev-charcoal truncate">
                    {el.individual_id}
                  </h2>
                  <CallTypeBadge type={el.most_common_type} />
                </div>

                {/* Stats row */}
                <div className="flex items-center gap-4 text-xs text-ev-warm-gray mb-3">
                  <span className="inline-flex items-center gap-1">
                    <Mic className="w-3 h-3" />
                    {el.call_count} call{el.call_count !== 1 ? "s" : ""}
                  </span>
                  <span className="inline-flex items-center gap-1">
                    <FileAudio className="w-3 h-3" />
                    {el.recording_count} rec{el.recording_count !== 1 ? "s" : ""}
                  </span>
                </div>

                {/* Locations */}
                {el.locations.length > 0 && (
                  <div className="flex flex-wrap gap-1.5 mb-3">
                    {el.locations.slice(0, 3).map((loc) => (
                      <span
                        key={loc}
                        className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-ev-sand/30 text-[11px] text-ev-elephant"
                      >
                        <MapPin className="w-2.5 h-2.5" />
                        {loc}
                      </span>
                    ))}
                    {el.locations.length > 3 && (
                      <span className="px-2 py-0.5 rounded-md bg-ev-sand/20 text-[11px] text-ev-warm-gray">
                        +{el.locations.length - 3} more
                      </span>
                    )}
                  </div>
                )}

                {/* Date range */}
                {firstDate && (
                  <div className="flex items-center gap-1.5 text-[11px] text-ev-warm-gray">
                    <Calendar className="w-3 h-3" />
                    <span>
                      {formatDate(firstDate)}
                      {lastDate && lastDate !== firstDate && (
                        <> &mdash; {formatDate(lastDate)}</>
                      )}
                    </span>
                  </div>
                )}

                {/* Hover indicator */}
                <div className="mt-auto pt-3 border-t border-ev-sand/20 flex items-center gap-1 text-[11px] text-accent-savanna font-medium opacity-0 group-hover:opacity-100 transition-opacity">
                  View profile
                  <ChevronRight className="w-3 h-3" />
                </div>
              </motion.button>
            );
          })}
        </motion.div>
      )}
    </div>
  );
}
