"use client";

import { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { getRecordings, API_BASE, type Recording } from "@/lib/audio-api";

function QualityBadge({ score }: { score: number }) {
  const pct = Math.round(score * 100);
  const color =
    pct >= 80
      ? "bg-success/15 text-success"
      : pct >= 60
      ? "bg-warning/15 text-warning"
      : "bg-danger/15 text-danger";

  return (
    <span className={`px-2.5 py-1 rounded-full text-xs font-semibold ${color}`}>
      {pct}%
    </span>
  );
}

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
    <div className="min-h-screen bg-ev-ivory">
      <div className="max-w-6xl mx-auto px-6 py-12">
        <div className="mb-10">
          <Link
            href="/"
            className="inline-flex items-center gap-2 text-ev-warm-gray hover:text-ev-elephant transition-colors mb-4"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
            </svg>
            Back to Home
          </Link>
          <h1 className="text-4xl font-bold text-ev-charcoal">Results</h1>
          <p className="text-ev-elephant mt-2">
            Browse processed recordings and their analysis results.
          </p>
        </div>

        {loading ? (
          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
            {[1, 2, 3].map((i) => (
              <div key={i} className="rounded-xl bg-ev-cream border border-ev-sand p-6 animate-pulse">
                <div className="h-32 bg-background-elevated rounded mb-4" />
                <div className="h-4 w-3/4 bg-background-elevated rounded mb-2" />
                <div className="h-3 w-1/2 bg-background-elevated rounded" />
              </div>
            ))}
          </div>
        ) : recordings.length === 0 ? (
          <div className="p-12 rounded-xl bg-ev-cream border border-ev-sand text-center">
            <p className="text-ev-elephant mb-1">No processed recordings yet</p>
            <p className="text-ev-warm-gray text-sm">
              Upload and process a recording to see results here.
            </p>
          </div>
        ) : (
          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
            {recordings.map((rec) => {
              const quality = rec.result?.quality;
              const spectrogramUrl = `${API_BASE}/api/recordings/${rec.id}/spectrogram?type=after`;

              return (
                <button
                  key={rec.id}
                  onClick={() => router.push(`/processing/${rec.id}`)}
                  className="text-left rounded-xl bg-ev-cream border border-ev-sand hover:border-ev-warm-gray transition-all overflow-hidden group"
                >
                  <div className="h-36 bg-background-elevated overflow-hidden">
                    <img
                      src={spectrogramUrl}
                      alt={`Spectrogram for ${rec.filename}`}
                      className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                      loading="lazy"
                    />
                  </div>
                  <div className="p-4 space-y-2">
                    <div className="flex items-center justify-between">
                      <p className="font-medium text-ev-charcoal truncate">
                        {rec.filename}
                      </p>
                      {quality?.quality_score != null && (
                        <QualityBadge score={quality.quality_score} />
                      )}
                    </div>
                    <div className="flex items-center gap-3 text-xs text-ev-warm-gray">
                      {quality?.snr_before_db != null && quality?.snr_after_db != null && (
                        <span>
                          SNR: {quality.snr_before_db.toFixed(1)} → {quality.snr_after_db.toFixed(1)} dB
                        </span>
                      )}
                      {rec.duration != null && (
                        <span>
                          {Math.floor(rec.duration / 60)}:{String(Math.floor(rec.duration % 60)).padStart(2, "0")}
                        </span>
                      )}
                    </div>
                  </div>
                </button>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
