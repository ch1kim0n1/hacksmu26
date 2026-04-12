"use client";

import { useState, useEffect, useCallback, useRef, useMemo } from "react";
import Link from "next/link";
import { SpectrogramImage } from "@/components/spectrogram/SpectrogramImage";
import { useRouter } from "next/navigation";
import { motion, AnimatePresence } from "framer-motion";
import { Music, TrendingUp, ArrowRight, Clock, Keyboard } from "lucide-react";
import { getRecordings, API_BASE, type Recording, type Call } from "@/lib/audio-api";
import { staggerContainer, fadeUp } from "@/components/ui/motion-primitives";
import { useKeyboardShortcuts } from "@/hooks/useKeyboardShortcuts";
import ShortcutHelp from "@/components/layout/ShortcutHelp";

const CALL_TYPES = ["rumble", "trumpet", "roar", "bark", "cry"] as const;

export default function ResultsPage() {
  const router = useRouter();
  const [recordings, setRecordings] = useState<Recording[]>([]);
  const [loading, setLoading] = useState(true);
  const [currentCallIndex, setCurrentCallIndex] = useState<number | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [showShortcutHelp, setShowShortcutHelp] = useState(false);
  const [abSelectedId, setAbSelectedId] = useState<string | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  // Flatten all calls across all recordings for keyboard navigation
  const allCalls = useMemo<Call[]>(
    () =>
      recordings.flatMap((rec) => rec.result?.calls ?? []),
    [recordings]
  );

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

  // ── Keyboard shortcut handlers ─────────────────────────────────────────────

  const handlePlayPause = useCallback(() => {
    const audio = audioRef.current;
    if (!audio) {
      setIsPlaying((p) => !p);
      return;
    }
    if (isPlaying) {
      audio.pause();
    } else {
      audio.play().catch(() => {});
    }
    setIsPlaying((p) => !p);
  }, [isPlaying]);

  const handleNextCall = useCallback(() => {
    if (allCalls.length === 0) return;
    setCurrentCallIndex((i) => {
      if (i === null) return 0;
      return Math.min(i + 1, allCalls.length - 1);
    });
  }, [allCalls.length]);

  const handlePrevCall = useCallback(() => {
    if (allCalls.length === 0) return;
    setCurrentCallIndex((i) => {
      if (i === null) return 0;
      return Math.max((i ?? 0) - 1, 0);
    });
  }, [allCalls.length]);

  const handleDeselect = useCallback(() => {
    setCurrentCallIndex(null);
  }, []);

  const handleReclassify = useCallback(
    (callTypeIndex: number) => {
      if (currentCallIndex === null) return;
      const callType = CALL_TYPES[callTypeIndex];
      if (!callType) return;
      // Optimistic UI: update call_type in local state
      setRecordings((prev) =>
        prev.map((rec) => ({
          ...rec,
          result: rec.result
            ? {
                ...rec.result,
                calls: rec.result.calls?.map((call, globalIdx) => {
                  // Calculate the global index offset for this recording's calls
                  const recCallsOffset = prev
                    .slice(0, prev.indexOf(rec))
                    .reduce((sum, r) => sum + (r.result?.calls?.length ?? 0), 0);
                  const localIdx = currentCallIndex - recCallsOffset;
                  if (localIdx === globalIdx) {
                    return { ...call, call_type: callType };
                  }
                  return call;
                }),
              }
            : rec.result,
        }))
      );
    },
    [currentCallIndex]
  );

  const keyMap = useMemo(
    () => ({
      " ": (e: KeyboardEvent) => {
        e.preventDefault();
        handlePlayPause();
      },
      ArrowRight: (e: KeyboardEvent) => {
        e.preventDefault();
        handleNextCall();
      },
      ArrowLeft: (e: KeyboardEvent) => {
        e.preventDefault();
        handlePrevCall();
      },
      a: () => {
        /* A/B toggle — no-op until #131 is implemented */
      },
      A: () => {
        /* A/B toggle — no-op until #131 is implemented */
      },
      "1": () => handleReclassify(0),
      "2": () => handleReclassify(1),
      "3": () => handleReclassify(2),
      "4": () => handleReclassify(3),
      "5": () => handleReclassify(4),
      Escape: () => handleDeselect(),
      "?": () => setShowShortcutHelp((v) => !v),
    }),
    [handlePlayPause, handleNextCall, handlePrevCall, handleReclassify, handleDeselect]
  );

  // Disable global shortcuts while the ShortcutHelp overlay is open (Esc is
  // handled internally by ShortcutHelp) — except allow "?" to still close it.
  useKeyboardShortcuts(keyMap, !showShortcutHelp);

  // ── Render ─────────────────────────────────────────────────────────────────

  return (
    <>
      <ShortcutHelp
        isOpen={showShortcutHelp}
        onClose={() => setShowShortcutHelp(false)}
      />

      <div className="p-6 lg:p-8 max-w-6xl mx-auto space-y-8">
        {/* Page Header */}
        <motion.div
          initial={{ opacity: 0, y: -8 }}
          animate={{ opacity: 1, y: 0 }}
          className="flex items-end justify-between gap-4"
        >
          <div>
            <h1 className="text-2xl font-bold text-ev-charcoal">Results</h1>
            <p className="text-sm text-ev-warm-gray mt-1">
              Browse processed recordings and their analysis results.
            </p>
          </div>

          <div className="flex items-center gap-3">
            {/* Shortcut help trigger */}
            <motion.button
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ delay: 0.1 }}
              onClick={() => setShowShortcutHelp(true)}
              aria-label="Show keyboard shortcuts"
              title="Keyboard shortcuts (?)"
              className="inline-flex items-center gap-1.5 text-xs text-ev-warm-gray glass border border-ev-sand/30 px-3 py-1.5 rounded-xl font-medium -translate-y-0.5 shadow-[0_12px_32px_rgba(44,41,38,0.10)] hover:text-ev-charcoal hover:border-ev-sand/60 transition-all duration-300"
            >
              <Keyboard className="w-3 h-3" />
              Shortcuts
            </motion.button>

            {recordings.length > 0 && (
              <motion.p
                initial={{ opacity: 0, scale: 0.9 }}
                animate={{ opacity: 1, scale: 1 }}
                transition={{ delay: 0.15 }}
                className="text-xs text-ev-warm-gray glass border border-ev-sand/30 px-3 py-1.5 rounded-xl font-medium"
              >
                {recordings.length} processed
              </motion.p>
            )}
          </div>
        </motion.div>

        {/* A/B Player panel — expands when a recording card is clicked */}
        <AnimatePresence>
          {abSelectedId && (() => {
            const rec = recordings.find((r) => r.id === abSelectedId);
            if (!rec) return null;
            return (
              <motion.div
                key={abSelectedId}
                initial={{ opacity: 0, y: -12, scale: 0.98 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={{ opacity: 0, y: -8, scale: 0.98 }}
                transition={{ duration: 0.22, ease: "easeOut" }}
                className="rounded-2xl glass border border-ev-sand/40 overflow-hidden"
              >
                {/* Spectrogram Thumbnail */}
                <div className="relative h-40 bg-gradient-to-br from-spectrogram-low to-spectrogram-low/80 overflow-hidden">
                  <SpectrogramImage
                    src={`${API_BASE}/api/recordings/${rec.id}/spectrogram?type=after`}
                    alt={`Spectrogram for ${rec.filename}`}
                    fill
                    sizes="(min-width: 1024px) 33vw, (min-width: 640px) 50vw, 100vw"
                    unoptimized
                    className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-[1.04]"
                  />
                </div>
              </motion.div>
            );
          })()}
        </AnimatePresence>

        {/* Current call navigation indicator */}
        {allCalls.length > 0 && (
          <motion.div
            initial={{ opacity: 0, y: -4 }}
            animate={{ opacity: 1, y: 0 }}
            className="flex items-center gap-3 text-xs text-ev-warm-gray"
          >
            <span>
              {currentCallIndex !== null
                ? `Call ${currentCallIndex + 1} of ${allCalls.length} selected`
                : `${allCalls.length} calls detected — use ← → to navigate`}
            </span>
            {currentCallIndex !== null && (
              <button
                onClick={handleDeselect}
                className="text-accent-savanna hover:underline"
              >
                Deselect
              </button>
            )}
          </motion.div>
        )}

        {loading ? (
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-5">
            {[1, 2, 3].map((i) => (
              <div
                key={i}
                className="rounded-2xl glass border border-ev-sand/30 overflow-hidden animate-pulse"
                style={{ animationDelay: `${i * 0.1}s` }}
              >
                <div className="h-36 bg-ev-cream" />
                <div className="p-4 space-y-2">
                  <div className="h-4 w-3/4 bg-ev-cream rounded" />
                  <div className="h-3 w-1/2 bg-ev-cream rounded" />
                </div>
              </div>
            ))}
          </div>
        ) : recordings.length === 0 ? (
          <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            className="p-16 rounded-2xl glass border border-dashed border-ev-sand/60 text-center -translate-y-0.5 shadow-[0_18px_40px_rgba(44,41,38,0.08)] transition-all duration-300"
          >
            <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-accent-savanna/10 to-accent-gold/5 flex items-center justify-center mx-auto mb-4">
              <Music className="w-7 h-7 text-accent-savanna/50" />
            </div>
            <p className="text-ev-elephant font-medium mb-1">
              No processed recordings yet
            </p>
            <p className="text-ev-warm-gray text-sm">
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
              const recCalls = rec.result?.calls ?? [];

              // Determine if any call in this recording is currently selected
              const recCallOffset = recordings
                .slice(0, recordings.indexOf(rec))
                .reduce((sum, r) => sum + (r.result?.calls?.length ?? 0), 0);
              const isRecordingActive =
                currentCallIndex !== null &&
                currentCallIndex >= recCallOffset &&
                currentCallIndex < recCallOffset + recCalls.length;

              const isAbActive = abSelectedId === rec.id;

              return (
                <motion.div key={rec.id} variants={fadeUp} className="flex flex-col">
                  <div
                    className={`text-left rounded-2xl glass border overflow-hidden group flex flex-col transition-all ${
                      isRecordingActive
                        ? "border-accent-savanna ring-2 ring-accent-savanna/30"
                        : isAbActive
                          ? "border-accent-savanna/50 ring-1 ring-accent-savanna/20"
                          : "border-ev-sand/30"
                    }`}
                  >
                    {/* Spectrogram Thumbnail — click navigates to details */}
                    <button
                      onClick={() => router.push(`/processing/${rec.id}`)}
                      aria-label={`View ${rec.filename} results`}
                      className="relative h-40 bg-gradient-to-br from-spectrogram-low to-spectrogram-low/80 overflow-hidden w-full text-left"
                    >
                      <SpectrogramImage
                        src={spectrogramUrl}
                        alt={`Spectrogram for ${rec.filename}`}
                        fill
                        sizes="(min-width: 1024px) 33vw, (min-width: 640px) 50vw, 100vw"
                        className="object-cover group-hover:scale-[1.04] transition-transform duration-500"
                      />
                      <div className="absolute inset-0 spec-overlay opacity-0 group-hover:opacity-100 transition-opacity duration-300" />

                      {quality?.quality_score != null && (
                        <div className="absolute top-3 right-3">
                          <div className="glass-strong rounded-lg px-2 py-1 border border-white/20">
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

                      {/* Call count badge */}
                      {recCalls.length > 0 && (
                        <div className="absolute top-3 left-3">
                          <div className="glass-strong rounded-lg px-2 py-1 border border-white/20">
                            <span className="text-xs font-medium text-ev-ivory">
                              {recCalls.length} call{recCalls.length !== 1 ? "s" : ""}
                            </span>
                          </div>
                        </div>
                      )}
                    </button>

                    {/* Card Content */}
                    <div className="p-4 space-y-2.5 flex-1 flex flex-col">
                      <p className="font-medium text-ev-charcoal truncate text-sm">
                        {rec.filename}
                      </p>

                      <div className="flex items-center justify-between text-xs text-ev-warm-gray">
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

                      {/* Currently selected call indicator */}
                      {isRecordingActive && currentCallIndex !== null && (
                        <div className="text-xs text-accent-savanna font-medium flex items-center gap-1 pt-1">
                          <span className="w-1.5 h-1.5 rounded-full bg-accent-savanna animate-pulse" />
                          Call {currentCallIndex - recCallOffset + 1} selected
                        </div>
                      )}

                      {/* Action row: A/B compare + details link */}
                      <div className="flex items-center gap-2 pt-1 mt-auto">
                        <button
                          onClick={() => setAbSelectedId(isAbActive ? null : rec.id)}
                          aria-label={`${isAbActive ? "Close" : "Open"} A/B player for ${rec.filename}`}
                          className={`flex items-center gap-1 px-2.5 py-1 rounded-lg text-[11px] font-semibold transition-all duration-150 ${
                            isAbActive
                              ? "bg-accent-savanna text-white"
                              : "border border-ev-sand text-ev-elephant hover:border-accent-savanna/50 hover:text-accent-savanna"
                          }`}
                        >
                          <span>A</span>
                          <span className="opacity-40">/</span>
                          <span>B</span>
                        </button>
                        <button
                          onClick={() => router.push(`/processing/${rec.id}`)}
                          className="flex items-center gap-1 text-xs text-ev-warm-gray hover:text-accent-savanna transition-colors ml-auto"
                        >
                          Details
                          <ArrowRight className="w-3 h-3" />
                        </button>
                      </div>
                    </div>
                  </div>
                </motion.div>
              );
            })}
          </motion.div>
        )}
      </div>
    </>
  );
}
