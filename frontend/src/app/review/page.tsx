"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { motion } from "framer-motion";
import {
  getReviewQueue,
  retrainClassifier,
  reviewCall,
  type Call,
} from "@/lib/audio-api";

const CALL_TYPES = ["rumble", "trumpet", "roar", "bark", "cry", "unknown"];

function ReviewCard({
  call,
  busy,
  onReview,
}: {
  call: Call;
  busy: boolean;
  onReview: (callId: string, action: "confirm" | "reclassify" | "discard", corrected?: string) => void;
}) {
  const [corrected, setCorrected] = useState(call.call_type || "rumble");

  return (
    <motion.article
      className="rounded-2xl glass border border-ev-sand/30 p-5"
      initial={{ opacity: 0, y: -8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3 }}
    >
      <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="font-mono text-xs text-ev-warm-gray">{call.id}</p>
          <h2 className="mt-1 text-lg font-semibold capitalize text-ev-charcoal">
            {call.call_type}
          </h2>
          <p className="text-sm text-ev-warm-gray">
            Confidence {Math.round((call.confidence ?? 0) * 100)}% · {call.start_time.toFixed(2)}s
          </p>
        </div>
        <span className="rounded-md border border-warning/30 bg-warning/10 px-2.5 py-1 text-xs font-medium text-warning">
          {call.review_status || "pending"}
        </span>
      </div>

      <div className="mb-4 grid grid-cols-2 gap-3 text-sm">
        <div>
          <p className="text-xs text-ev-warm-gray">Recording</p>
          <p className="font-mono text-ev-elephant">{call.recording_id.slice(0, 14)}</p>
        </div>
        <div>
          <p className="text-xs text-ev-warm-gray">Frequency</p>
          <p className="text-ev-elephant">
            {call.frequency_low && call.frequency_high
              ? `${call.frequency_low}-${call.frequency_high} Hz`
              : "Unknown"}
          </p>
        </div>
      </div>

      <div className="flex flex-wrap gap-2">
        <button
          disabled={busy}
          onClick={() => onReview(call.id, "confirm")}
          className="rounded-xl bg-success px-3 py-2 text-sm font-semibold text-white disabled:opacity-50"
        >
          Confirm
        </button>
        <button
          disabled={busy}
          onClick={() => onReview(call.id, "discard")}
          className="rounded-xl bg-danger px-3 py-2 text-sm font-semibold text-white disabled:opacity-50"
        >
          Discard
        </button>
        <select
          value={corrected}
          onChange={(event) => setCorrected(event.target.value)}
          className="rounded-xl glass border border-ev-sand/40 px-3 py-2 text-sm text-ev-charcoal focus:border-accent-savanna/50 focus:outline-none"
        >
          {CALL_TYPES.map((type) => (
            <option key={type} value={type}>
              {type}
            </option>
          ))}
        </select>
        <button
          disabled={busy}
          onClick={() => onReview(call.id, "reclassify", corrected)}
          className="rounded-xl bg-accent-savanna px-3 py-2 text-sm font-semibold text-ev-ivory disabled:opacity-50"
        >
          Reclassify
        </button>
      </div>
    </motion.article>
  );
}

export default function ReviewPage() {
  const [calls, setCalls] = useState<Call[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [status, setStatus] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const fetchQueue = useCallback(async () => {
    try {
      setLoading(true);
      const data = await getReviewQueue({ status: "pending", max_confidence: 0.5, limit: 50 });
      setCalls(data.items);
      setTotal(data.total);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load review queue");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchQueue();
  }, [fetchQueue]);

  const handleReview = async (
    callId: string,
    action: "confirm" | "reclassify" | "discard",
    corrected?: string
  ) => {
    setBusyId(callId);
    setError(null);
    try {
      await reviewCall(callId, {
        action,
        corrected_call_type: action === "reclassify" ? corrected : undefined,
        reviewer: "EchoField reviewer",
      });
      setCalls((prev) => prev.filter((call) => call.id !== callId));
      setTotal((prev) => Math.max(0, prev - 1));
      setStatus("Review saved");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Review action failed");
    } finally {
      setBusyId(null);
    }
  };

  const handleRetrain = async () => {
    setStatus("Retraining classifier...");
    setError(null);
    try {
      const result = await retrainClassifier();
      setStatus(`Retrained on ${String(result.samples ?? "available")} labeled samples`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Retraining needs at least 5 labeled calls");
      setStatus(null);
    }
  };

  return (
    <motion.main
      className="p-6 lg:p-8 max-w-6xl mx-auto space-y-6"
      initial={{ opacity: 0, y: -8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3 }}
    >
        <Link href="/database" className="mb-4 inline-flex text-sm text-ev-warm-gray hover:text-ev-elephant">
          Back to database
        </Link>
        <motion.div
          className="mb-8 flex flex-wrap items-end justify-between gap-4"
          initial={{ opacity: 0, y: -8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.3, delay: 0.05 }}
        >
          <div>
            <h1 className="text-2xl font-bold text-ev-charcoal">Review Queue</h1>
            <p className="mt-2 text-ev-elephant">
              Low-confidence calls waiting for confirmation, correction, or discard.
            </p>
          </div>
          <button
            onClick={handleRetrain}
            className="rounded-xl bg-accent-savanna px-4 py-2 text-sm font-semibold text-ev-ivory hover:bg-accent-savanna/90"
          >
            Retrain Classifier
          </button>
        </motion.div>

        {status && (
          <div className="mb-4 rounded-xl border border-success/15 bg-success/5 px-4 py-3 text-sm text-success">
            {status}
          </div>
        )}
        {error && (
          <div className="mb-4 rounded-xl border border-danger/15 bg-danger/5 px-4 py-3 text-sm text-danger">
            {error}
          </div>
        )}

        <div className="mb-4 text-sm text-ev-warm-gray">
          {total} pending call{total === 1 ? "" : "s"}
        </div>

        {loading ? (
          <div className="rounded-2xl glass border border-ev-sand/30 p-8 text-ev-elephant">
            Loading review queue...
          </div>
        ) : calls.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-ev-sand/60 p-12 text-center glass">
            No pending low-confidence calls.
          </div>
        ) : (
          <div className="grid gap-4 md:grid-cols-2">
            {calls.map((call) => (
              <ReviewCard
                key={call.id}
                call={call}
                busy={busyId === call.id}
                onReview={handleReview}
              />
            ))}
          </div>
        )}
    </motion.main>
  );
}
