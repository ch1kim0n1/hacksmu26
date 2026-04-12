"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { motion } from "framer-motion";
import { getBatchSummary, type BatchSummary } from "@/lib/audio-api";

function Metric({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="rounded-2xl glass border border-ev-sand/30 p-4">
      <p className="text-xs uppercase tracking-wide text-ev-warm-gray">{label}</p>
      <p className="mt-2 text-2xl font-bold text-ev-charcoal">{value}</p>
    </div>
  );
}

export default function BatchPage() {
  const params = useParams();
  const batchId = params.batchId as string;
  const [summary, setSummary] = useState<BatchSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchSummary = useCallback(async () => {
    try {
      setError(null);
      const data = await getBatchSummary(batchId);
      setSummary(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load batch summary");
    } finally {
      setLoading(false);
    }
  }, [batchId]);

  useEffect(() => {
    fetchSummary();
    const timer = window.setInterval(fetchSummary, 4000);
    return () => window.clearInterval(timer);
  }, [fetchSummary]);

  return (
    <motion.main
      className="p-6 lg:p-8 max-w-6xl mx-auto space-y-6"
      initial={{ opacity: 0, y: -8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3 }}
    >
        <Link href="/recordings" className="mb-4 inline-flex text-sm text-ev-warm-gray hover:text-ev-elephant">
          Back to recordings
        </Link>
        <motion.div
          className="mb-8"
          initial={{ opacity: 0, y: -8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.3, delay: 0.05 }}
        >
          <h1 className="text-2xl font-bold text-ev-charcoal">Batch Dashboard</h1>
          <p className="mt-2 font-mono text-sm text-ev-warm-gray">{batchId}</p>
        </motion.div>

        {loading ? (
          <div className="rounded-2xl glass border border-ev-sand/30 p-8 text-ev-elephant">
            Loading batch summary...
          </div>
        ) : error ? (
          <div className="rounded-xl border border-danger/15 bg-danger/5 p-8 text-danger">
            {error}
          </div>
        ) : summary ? (
          <div className="space-y-8">
            <motion.div
              className="grid gap-4 md:grid-cols-4"
              initial={{ opacity: 0, y: -8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.3, delay: 0.1 }}
            >
              <Metric label="Status" value={summary.status} />
              <Metric label="Recordings" value={summary.recordings} />
              <Metric label="Calls" value={summary.total_calls_detected} />
              <Metric label="Avg Quality" value={summary.quality_scores.avg?.toFixed(1) ?? "--"} />
            </motion.div>

            <motion.section
              className="rounded-2xl glass border border-ev-sand/30 p-5"
              initial={{ opacity: 0, y: -8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.3, delay: 0.15 }}
            >
              <h2 className="mb-4 text-xl font-semibold text-ev-charcoal">Call Types</h2>
              <div className="space-y-3">
                {Object.entries(summary.call_type_distribution).map(([type, count]) => {
                  const width = summary.total_calls_detected
                    ? Math.max(6, (count / summary.total_calls_detected) * 100)
                    : 0;
                  return (
                    <div key={type}>
                      <div className="mb-1 flex justify-between text-sm">
                        <span className="capitalize text-ev-elephant">{type}</span>
                        <span className="text-ev-warm-gray">{count}</span>
                      </div>
                      <div className="h-2 overflow-hidden rounded-full glass">
                        <div className="h-full rounded-full bg-accent-savanna" style={{ width: `${width}%` }} />
                      </div>
                    </div>
                  );
                })}
              </div>
            </motion.section>

            <motion.section
              className="overflow-hidden rounded-2xl glass border border-ev-sand/30"
              initial={{ opacity: 0, y: -8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.3, delay: 0.2 }}
            >
              <div className="border-b border-ev-sand/30 px-5 py-4">
                <h2 className="text-xl font-semibold text-ev-charcoal">Recordings</h2>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full min-w-[760px] text-left text-sm">
                  <thead className="glass text-xs uppercase tracking-wide text-ev-warm-gray">
                    <tr>
                      <th className="px-4 py-3">Recording</th>
                      <th className="px-4 py-3">Status</th>
                      <th className="px-4 py-3">Calls</th>
                      <th className="px-4 py-3">Dominant Type</th>
                      <th className="px-4 py-3">Quality</th>
                      <th className="px-4 py-3">SNR Gain</th>
                    </tr>
                  </thead>
                  <tbody>
                    {summary.recordings_summary.map((recording) => (
                      <tr key={recording.recording_id} className="border-t border-ev-sand/30">
                        <td className="px-4 py-3">
                          <Link href={`/processing/${recording.recording_id}`} className="font-mono text-accent-savanna">
                            {recording.filename || recording.recording_id}
                          </Link>
                        </td>
                        <td className="px-4 py-3 capitalize text-ev-elephant">{recording.status || "--"}</td>
                        <td className="px-4 py-3 text-ev-elephant">{recording.calls_detected}</td>
                        <td className="px-4 py-3 capitalize text-ev-elephant">{recording.dominant_call_type || "--"}</td>
                        <td className="px-4 py-3 text-ev-elephant">{recording.quality_score?.toFixed(1) ?? "--"}</td>
                        <td className="px-4 py-3 text-ev-elephant">{recording.snr_improvement_db?.toFixed(1) ?? "--"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </motion.section>

            {summary.shared_patterns.length > 0 && (
              <motion.section
                className="rounded-2xl glass border border-ev-sand/30 p-5"
                initial={{ opacity: 0, y: -8 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.3, delay: 0.25 }}
              >
                <h2 className="mb-4 text-xl font-semibold text-ev-charcoal">Shared Patterns</h2>
                <div className="grid gap-3 md:grid-cols-2">
                  {summary.shared_patterns.slice(0, 6).map((pattern, index) => (
                    <div key={index} className="rounded-xl glass p-4">
                      <p className="font-medium text-ev-charcoal">{String(pattern.pattern ?? "Pattern")}</p>
                      <p className="mt-1 text-sm text-ev-warm-gray">
                        {String(pattern.occurrences ?? "0")} occurrences
                      </p>
                    </div>
                  ))}
                </div>
              </motion.section>
            )}
          </div>
        ) : null}
    </motion.main>
  );
}
