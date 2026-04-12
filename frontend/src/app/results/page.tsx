"use client";

import { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import { motion } from "framer-motion";
import { Music, TrendingUp, ArrowRight, Clock } from "lucide-react";
import { getRecordings, API_BASE, type Recording } from "@/lib/audio-api";
import { staggerContainer, fadeUp } from "@/components/ui/motion-primitives";

export default function ResultsPage() {
  const router = useRouter();
  const [recordings, setRecordings] = useState<Recording[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchResults = useCallback(async () => {
    try {
      setLoading(true);
      const data = await getRecordings({ status: "complete", limit: 50 });
      setRecordings(data.recordings);
    } catch {
      // silently fail — show empty state
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchResults();
  }, [fetchResults]);

  return (
    <div className="p-6 lg:p-8 max-w-6xl mx-auto space-y-8">
      {/* Page Header */}
      <motion.div
        initial={{ opacity: 0, y: -8 }}
        animate={{ opacity: 1, y: 0 }}
        className="flex items-end justify-between gap-4"
      >
        <div>
          <h1 className="text-2xl font-bold text-dark-text-primary">Results</h1>
          <p className="text-sm text-dark-text-secondary mt-1">
            Browse processed recordings and their analysis results.
          </p>
        </div>
        {recordings.length > 0 && (
          <motion.p
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ delay: 0.15 }}
            className="text-xs text-dark-text-secondary bg-dark-surface border border-white/[0.06] px-3 py-1.5 rounded-xl font-medium"
          >
            {recordings.length} processed
          </motion.p>
        )}
      </motion.div>

      {loading ? (
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-5">
          {[1, 2, 3].map((i) => (
            <div
              key={i}
              className="rounded-2xl bg-dark-surface border border-white/[0.06] overflow-hidden animate-pulse"
              style={{ animationDelay: `${i * 0.1}s` }}
            >
              <div className="h-36 bg-dark-surface-elevated" />
              <div className="p-4 space-y-2">
                <div className="h-4 w-3/4 bg-dark-surface-elevated rounded" />
                <div className="h-3 w-1/2 bg-dark-surface-elevated rounded" />
              </div>
            </div>
          ))}
        </div>
      ) : recordings.length === 0 ? (
        <motion.div
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          className="p-16 rounded-2xl bg-dark-surface border border-dashed border-white/[0.08] text-center"
        >
          <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-accent-savanna/10 to-accent-gold/5 flex items-center justify-center mx-auto mb-4">
            <Music className="w-7 h-7 text-accent-savanna/50" />
          </div>
          <p className="text-dark-text-secondary font-medium mb-1">
            No processed recordings yet
          </p>
          <p className="text-dark-text-muted text-sm">
            Upload and process a recording to see results here.
          </p>
        </motion.div>
      ) : (
        <motion.div
          variants={staggerContainer}
          initial="initial"
          animate="animate"
          className="grid sm:grid-cols-2 lg:grid-cols-3 gap-5"
        >
          {recordings.map((rec) => {
            const quality = rec.result?.quality;
            const spectrogramUrl = `${API_BASE}/api/recordings/${rec.id}/spectrogram?type=after`;

            return (
              <motion.button
                key={rec.id}
                variants={fadeUp}
                onClick={() => router.push(`/processing/${rec.id}`)}
                aria-label={`View ${rec.filename} results`}
                className="text-left rounded-2xl bg-dark-surface border border-white/[0.06] overflow-hidden group card-hover hover:shadow-spectrogram-glow hover:border-white/[0.12] flex flex-col"
              >
                {/* Spectrogram Thumbnail */}
                <div className="relative h-48 bg-gradient-to-br from-spectrogram-low to-spectrogram-low/80 overflow-hidden">
                  <img
                    src={spectrogramUrl}
                    alt={`Spectrogram for ${rec.filename}`}
                    className="w-full h-full object-cover group-hover:scale-[1.04] transition-transform duration-500"
                    loading="lazy"
                  />
                  <div className="absolute inset-0 spec-overlay opacity-0 group-hover:opacity-100 transition-opacity duration-300" />

                  {quality?.quality_score != null && (
                    <div className="absolute top-3 right-3">
                      <div className="bg-dark-surface-elevated/80 backdrop-blur-sm border border-white/[0.1] rounded-lg px-2 py-1">
                        <span
                          className={`text-xs font-bold ${
                            quality.quality_score >= 0.8
                              ? "text-success"
                              : quality.quality_score >= 0.6
                                ? "text-accent-savanna"
                                : "text-danger"
                          }`}
                        >
                          {Math.round(quality.quality_score * 100)}%
                        </span>
                      </div>
                    </div>
                  )}
                </div>

                {/* Card Content */}
                <div className="p-4 space-y-2.5 flex-1 flex flex-col">
                  <p className="font-medium text-dark-text-primary truncate text-sm group-hover:text-accent-savanna transition-colors">
                    {rec.filename}
                  </p>

                  <div className="flex items-center justify-between text-xs text-dark-text-secondary">
                    <div className="flex items-center gap-1.5 min-w-0">
                      {quality?.snr_before_db != null &&
                        quality?.snr_after_db != null && (
                          <span className="inline-flex items-center gap-1">
                            <span className="tabular-nums">
                              {quality.snr_before_db.toFixed(1)}
                            </span>
                            <TrendingUp className="w-3 h-3 text-success shrink-0" />
                            <span className="text-success font-semibold tabular-nums">
                              {quality.snr_after_db.toFixed(1)} dB
                            </span>
                          </span>
                        )}
                    </div>
                    {rec.duration != null && (
                      <span className="tabular-nums inline-flex items-center gap-1 shrink-0">
                        <Clock className="w-3 h-3" />
                        {Math.floor(rec.duration / 60)}:
                        {String(Math.floor(rec.duration % 60)).padStart(
                          2,
                          "0",
                        )}
                      </span>
                    )}
                  </div>

                  <div className="flex items-center gap-1 text-xs text-accent-savanna font-medium opacity-0 group-hover:opacity-100 transition-opacity pt-1 mt-auto">
                    <span>View details</span>
                    <ArrowRight className="w-3 h-3" />
                  </div>
                </div>
              </motion.button>
            );
          })}
        </motion.div>
      )}
    </div>
  );
}
