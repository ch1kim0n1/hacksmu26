"use client";

import type { EmotionTimelineResponse } from "@/lib/audio-api";

export default function EmotionTimeline({ data }: { data: EmotionTimelineResponse }) {
  const gradient = data.timeline.length
    ? `linear-gradient(to right, ${data.timeline
        .map((point, index) => `${point.color} ${(index / Math.max(data.timeline.length - 1, 1)) * 100}%`)
        .join(", ")})`
    : "#4B5563";

  const distribution = data.recording_summary.state_distribution || {};

  return (
    <section className="rounded-lg border border-ev-sand bg-ev-cream p-5">
      <div className="mb-4 flex flex-wrap justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold text-ev-charcoal">Estimated Emotion Timeline</h2>
          <p className="text-sm text-ev-warm-gray">
            Dominant state: {data.recording_summary.dominant_state || "neutral"}
          </p>
        </div>
        <p className="text-xs text-ev-warm-gray">
          Arousal {data.recording_summary.arousal_avg?.toFixed(2) ?? "--"} · Valence {data.recording_summary.valence_avg?.toFixed(2) ?? "--"}
        </p>
      </div>
      <div
        className="h-7 rounded-md border border-ev-sand"
        style={{ background: gradient }}
        title="Estimated emotional state over time"
      />
      <div className="mt-3 flex flex-wrap gap-2 text-xs text-ev-warm-gray">
        {Object.entries(distribution).map(([state, pct]) => (
          <span key={state} className="rounded-md bg-background-elevated px-2 py-1 capitalize">
            {state}: {Math.round(pct * 100)}%
          </span>
        ))}
      </div>
      <p className="mt-4 text-xs leading-relaxed text-ev-warm-gray">
        Emotional states are estimated from acoustic features using published elephant vocalization research. Treat them as research triage, not definitive behavioral labels.
      </p>
    </section>
  );
}
