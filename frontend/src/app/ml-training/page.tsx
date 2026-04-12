"use client";

import { useState, useEffect, useCallback } from "react";
import { Brain, Tag, Zap, Target, BarChart3, Loader2 } from "lucide-react";
import {
  getMLLabelingQueue,
  labelMLCall,
  trainMLClassifier,
  getMLBenchmarks,
  getMLBenchmarksLatest,
  type MLLabelingQueueItem,
  type MLBenchmarks,
} from "@/lib/audio-api";

const CALL_TYPES = [
  "unknown",
  "rumble",
  "trumpet",
  "roar",
  "bark",
  "cry",
] as const;

const SOCIAL_FUNCTIONS = [
  "unknown",
  "contact",
  "alarm",
  "greeting",
  "play",
  "distress",
  "mating",
] as const;

const CALL_TYPE_COLORS: Record<string, string> = {
  rumble: "bg-accent-savanna/10 text-accent-savanna border-accent-savanna/20",
  trumpet: "bg-accent-gold/10 text-accent-gold border-accent-gold/20",
  roar: "bg-danger/10 text-danger border-danger/20",
  bark: "bg-warning/10 text-warning border-warning/20",
  cry: "bg-purple-400/10 text-purple-400 border-purple-400/20",
  unknown: "bg-ev-warm-gray/10 text-ev-warm-gray border-ev-warm-gray/20",
};

interface LatestBenchmarks {
  call_type: { label_count: number; metrics: Record<string, unknown> };
  social_function: { label_count: number; metrics: Record<string, unknown> };
}

export default function MLTrainingPage() {
  // ── State ──
  const [queue, setQueue] = useState<MLLabelingQueueItem[]>([]);
  const [benchmarks, setBenchmarks] = useState<MLBenchmarks | null>(null);
  const [latestBenchmarks, setLatestBenchmarks] =
    useState<LatestBenchmarks | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Labeling form state per call
  const [labelForms, setLabelForms] = useState<
    Record<string, { call_type_refined: string; social_function: string }>
  >({});

  // Training state
  const [training, setTraining] = useState(false);
  const [trainingResult, setTrainingResult] = useState<{
    accuracy: number;
    training_time_s: number;
  } | null>(null);
  const [trainingError, setTrainingError] = useState<string | null>(null);

  // Toast state
  const [toast, setToast] = useState<{
    message: string;
    type: "success" | "error";
  } | null>(null);

  // ── Data fetching ──

  const fetchData = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const [queueData, benchmarksData, latestData] = await Promise.all([
        getMLLabelingQueue(20),
        getMLBenchmarks(),
        getMLBenchmarksLatest(),
      ]);
      setQueue(queueData);
      setBenchmarks(benchmarksData);
      setLatestBenchmarks(latestData);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load ML data");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  // Auto-dismiss toast
  useEffect(() => {
    if (!toast) return;
    const timer = setTimeout(() => setToast(null), 3000);
    return () => clearTimeout(timer);
  }, [toast]);

  // ── Handlers ──

  const handleLabelSubmit = useCallback(
    async (callId: string) => {
      const form = labelForms[callId];
      if (!form || form.call_type_refined === "unknown") {
        setToast({ message: "Please select a call type", type: "error" });
        return;
      }
      try {
        await labelMLCall(callId, {
          call_type_refined: form.call_type_refined,
          social_function: form.social_function,
        });
        setQueue((prev) => prev.filter((item) => item.call_id !== callId));
        setLabelForms((prev) => {
          const next = { ...prev };
          delete next[callId];
          return next;
        });
        setToast({ message: `Label submitted for ${callId.slice(0, 8)}`, type: "success" });
      } catch (err) {
        setToast({
          message: err instanceof Error ? err.message : "Failed to submit label",
          type: "error",
        });
      }
    },
    [labelForms]
  );

  const handleTrain = useCallback(async () => {
    setTraining(true);
    setTrainingResult(null);
    setTrainingError(null);
    try {
      const result = await trainMLClassifier();
      setTrainingResult({
        accuracy: result.accuracy,
        training_time_s: result.training_time_s,
      });
      // Refresh benchmarks after training
      const [benchmarksData, latestData] = await Promise.all([
        getMLBenchmarks(),
        getMLBenchmarksLatest(),
      ]);
      setBenchmarks(benchmarksData);
      setLatestBenchmarks(latestData);
    } catch (err) {
      setTrainingError(
        err instanceof Error ? err.message : "Training failed"
      );
    } finally {
      setTraining(false);
    }
  }, []);

  const updateLabelForm = (
    callId: string,
    field: "call_type_refined" | "social_function",
    value: string
  ) => {
    setLabelForms((prev) => ({
      ...prev,
      [callId]: {
        call_type_refined: prev[callId]?.call_type_refined ?? "unknown",
        social_function: prev[callId]?.social_function ?? "unknown",
        [field]: value,
      },
    }));
  };

  // ── Derived values ──

  const totalLabels =
    (latestBenchmarks?.call_type?.label_count ?? 0) +
    (latestBenchmarks?.social_function?.label_count ?? 0);
  const callTypeAccuracy =
    (latestBenchmarks?.call_type?.metrics as Record<string, number> | undefined)
      ?.accuracy ?? null;
  const socialFunctionAccuracy =
    (
      latestBenchmarks?.social_function?.metrics as
        | Record<string, number>
        | undefined
    )?.accuracy ?? null;

  // ── Render ──

  if (loading) {
    return (
      <main className="p-6 lg:p-8 max-w-6xl mx-auto space-y-6">
        <div className="flex items-center justify-center py-20 text-ev-elephant">
          <Loader2 className="w-5 h-5 animate-spin mr-2" />
          Loading ML data...
        </div>
      </main>
    );
  }

  if (error) {
    return (
      <main className="p-6 lg:p-8 max-w-6xl mx-auto space-y-6">
        <div className="rounded-lg border border-danger/20 bg-danger/10 p-4 text-danger text-sm">
          {error}
        </div>
      </main>
    );
  }

  return (
    <main className="p-6 lg:p-8 max-w-6xl mx-auto space-y-6">
      {/* Toast */}
      {toast && (
        <div
          className={`fixed top-6 right-6 z-50 rounded-lg border px-4 py-3 text-sm font-medium shadow-lg ${
            toast.type === "success"
              ? "border-success/20 bg-success/10 text-success"
              : "border-danger/20 bg-danger/10 text-danger"
          }`}
        >
          {toast.message}
        </div>
      )}

      {/* Header */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-4xl font-bold text-ev-charcoal flex items-center gap-3">
            <Brain className="w-8 h-8 text-accent-savanna" />
            ML Training
          </h1>
          <p className="mt-2 text-ev-elephant">
            Label calls, train classifiers, and track model accuracy over time.
          </p>
        </div>
        <button
          onClick={handleTrain}
          disabled={training}
          className="rounded-lg bg-accent-savanna px-4 py-2 text-sm font-semibold text-ev-ivory hover:bg-accent-savanna/90 disabled:opacity-50 flex items-center gap-2"
        >
          {training ? (
            <Loader2 className="w-4 h-4 animate-spin" />
          ) : (
            <Zap className="w-4 h-4" />
          )}
          Train Model
        </button>
      </div>

      {/* Stats bar */}
      <div className="grid gap-4 md:grid-cols-3">
        <div className="rounded-lg border border-ev-sand bg-ev-cream p-5">
          <div className="flex items-center gap-2 mb-1">
            <Tag className="w-4 h-4 text-ev-warm-gray" />
            <span className="text-xs text-ev-warm-gray">Total Labels</span>
          </div>
          <p className="text-2xl font-bold text-ev-charcoal tabular-nums">
            {totalLabels}
          </p>
        </div>
        <div className="rounded-lg border border-ev-sand bg-ev-cream p-5">
          <div className="flex items-center gap-2 mb-1">
            <Target className="w-4 h-4 text-ev-warm-gray" />
            <span className="text-xs text-ev-warm-gray">
              Call Type Accuracy
            </span>
          </div>
          <p className="text-2xl font-bold text-ev-charcoal tabular-nums">
            {callTypeAccuracy !== null
              ? `${(callTypeAccuracy * 100).toFixed(1)}%`
              : "--"}
          </p>
        </div>
        <div className="rounded-lg border border-ev-sand bg-ev-cream p-5">
          <div className="flex items-center gap-2 mb-1">
            <Target className="w-4 h-4 text-ev-warm-gray" />
            <span className="text-xs text-ev-warm-gray">
              Social Function Accuracy
            </span>
          </div>
          <p className="text-2xl font-bold text-ev-charcoal tabular-nums">
            {socialFunctionAccuracy !== null
              ? `${(socialFunctionAccuracy * 100).toFixed(1)}%`
              : "--"}
          </p>
        </div>
      </div>

      {/* Training result / error banner */}
      {trainingResult && (
        <div className="rounded-lg border border-success/20 bg-success/10 text-success p-4 text-sm flex items-center gap-3">
          <Zap className="w-5 h-5 shrink-0" />
          <span>
            Training complete — accuracy{" "}
            <strong>{(trainingResult.accuracy * 100).toFixed(1)}%</strong> in{" "}
            <strong>{trainingResult.training_time_s.toFixed(1)}s</strong>
          </span>
        </div>
      )}
      {trainingError && (
        <div className="rounded-lg border border-danger/20 bg-danger/10 text-danger p-4 text-sm">
          {trainingError}
        </div>
      )}

      {/* Labeling Queue */}
      <div>
        <h2 className="text-lg font-semibold text-ev-charcoal mb-3 flex items-center gap-2">
          <Tag className="w-5 h-5 text-accent-savanna" />
          Labeling Queue
          <span className="text-xs text-ev-warm-gray font-normal ml-1">
            ({queue.length} items)
          </span>
        </h2>

        {queue.length === 0 ? (
          <div className="rounded-lg border border-ev-sand bg-ev-cream p-5 text-center text-ev-elephant">
            No calls awaiting labels. Process more recordings to populate the
            queue.
          </div>
        ) : (
          <div className="grid gap-4 md:grid-cols-2">
            {queue.map((item) => {
              const form = labelForms[item.call_id] ?? {
                call_type_refined: item.call_type || "unknown",
                social_function: "unknown",
              };
              const badgeColor =
                CALL_TYPE_COLORS[item.call_type?.toLowerCase()] ??
                CALL_TYPE_COLORS.unknown;

              return (
                <div
                  key={item.call_id}
                  className="rounded-lg border border-ev-sand bg-ev-cream p-5 space-y-3"
                >
                  {/* Top row: ID, badge, confidence */}
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-mono text-xs text-ev-warm-gray truncate">
                      {item.call_id.slice(0, 12)}...
                    </span>
                    <div className="flex items-center gap-2 shrink-0">
                      <span
                        className={`px-2.5 py-1 rounded-md text-xs font-medium border ${badgeColor}`}
                      >
                        {item.call_type}
                      </span>
                      <span className="text-xs text-ev-elephant tabular-nums">
                        {(item.confidence * 100).toFixed(0)}%
                      </span>
                    </div>
                  </div>

                  {/* Dropdowns */}
                  <div className="grid gap-2 sm:grid-cols-2">
                    <div>
                      <label className="text-xs text-ev-warm-gray mb-1 block">
                        Call Type
                      </label>
                      <select
                        value={form.call_type_refined}
                        onChange={(e) =>
                          updateLabelForm(
                            item.call_id,
                            "call_type_refined",
                            e.target.value
                          )
                        }
                        className="w-full rounded-lg border border-ev-sand bg-white px-3 py-2 text-sm text-ev-charcoal"
                      >
                        {CALL_TYPES.map((ct) => (
                          <option key={ct} value={ct}>
                            {ct.charAt(0).toUpperCase() + ct.slice(1)}
                          </option>
                        ))}
                      </select>
                    </div>
                    <div>
                      <label className="text-xs text-ev-warm-gray mb-1 block">
                        Social Function
                      </label>
                      <select
                        value={form.social_function}
                        onChange={(e) =>
                          updateLabelForm(
                            item.call_id,
                            "social_function",
                            e.target.value
                          )
                        }
                        className="w-full rounded-lg border border-ev-sand bg-white px-3 py-2 text-sm text-ev-charcoal"
                      >
                        {SOCIAL_FUNCTIONS.map((sf) => (
                          <option key={sf} value={sf}>
                            {sf.charAt(0).toUpperCase() + sf.slice(1)}
                          </option>
                        ))}
                      </select>
                    </div>
                  </div>

                  {/* Submit */}
                  <button
                    onClick={() => handleLabelSubmit(item.call_id)}
                    className="rounded-lg bg-accent-savanna px-4 py-2 text-sm font-semibold text-ev-ivory hover:bg-accent-savanna/90 w-full"
                  >
                    Submit Label
                  </button>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Accuracy Over Time */}
      {benchmarks &&
        benchmarks.accuracy_over_time &&
        benchmarks.accuracy_over_time.length > 0 && (
          <div>
            <h2 className="text-lg font-semibold text-ev-charcoal mb-3 flex items-center gap-2">
              <BarChart3 className="w-5 h-5 text-accent-savanna" />
              Accuracy Over Time
            </h2>
            <div className="rounded-lg border border-ev-sand bg-ev-cream p-5">
              <div className="space-y-2">
                {benchmarks.accuracy_over_time.map(
                  ([epoch, accuracy], index) => {
                    const pct = accuracy * 100;
                    return (
                      <div key={index} className="flex items-center gap-3">
                        <span className="text-xs text-ev-warm-gray w-20 shrink-0 tabular-nums">
                          Epoch {epoch}
                        </span>
                        <div className="flex-1 h-3 bg-ev-sand/40 rounded-full overflow-hidden">
                          <div
                            className="h-full bg-accent-savanna rounded-full transition-all"
                            style={{ width: `${pct}%` }}
                          />
                        </div>
                        <span className="text-xs font-medium text-ev-charcoal tabular-nums w-14 text-right">
                          {pct.toFixed(1)}%
                        </span>
                      </div>
                    );
                  }
                )}
              </div>
            </div>
          </div>
        )}
    </main>
  );
}
