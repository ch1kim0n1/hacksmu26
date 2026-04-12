"use client";

import React, { useState, useEffect, useRef, useCallback } from "react";
import { getEmotionTimeline, type EmotionTimelineResponse } from "@/lib/audio-api";

const STATE_LABELS: Record<string, string> = {
  calm: "Calm",
  social: "Social",
  alert: "Alert",
  aggressive: "Aggressive",
  distressed: "Distressed",
  neutral: "\u2014",
};

interface EmotionTimelineProps {
  recordingId: string;
  isComplete: boolean;
}

export default function EmotionTimeline({ recordingId, isComplete }: EmotionTimelineProps) {
  const [data, setData] = useState<EmotionTimelineResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [hoveredBin, setHoveredBin] = useState<number | null>(null);
  const barRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!isComplete) return;
    let cancelled = false;
    async function load() {
      try {
        setLoading(true);
        const result = await getEmotionTimeline(recordingId, 500);
        if (!cancelled) setData(result);
      } catch {
        // silently fail
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    load();
    return () => { cancelled = true; };
  }, [recordingId, isComplete]);

  const handleMouseMove = useCallback(
    (e: React.MouseEvent<HTMLDivElement>) => {
      if (!barRef.current || !data) return;
      const rect = barRef.current.getBoundingClientRect();
      const x = e.clientX - rect.left;
      const pct = x / rect.width;
      const binIdx = Math.min(
        Math.floor(pct * data.timeline.length),
        data.timeline.length - 1
      );
      setHoveredBin(binIdx);
    },
    [data]
  );

  if (!isComplete || loading || !data || data.timeline.length === 0) return null;

  const bins = data.timeline;
  const summary = data.summary;
  const hoveredData = hoveredBin !== null ? bins[hoveredBin] : null;

  // Build CSS gradient from timeline bins
  const gradientStops = bins
    .map((bin, i) => `${bin.color} ${(i / bins.length) * 100}%`)
    .join(", ");

  return (
    <div className="p-5 rounded-xl bg-white/50 border border-ev-sand/40">
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <h3 className="text-sm font-semibold text-ev-charcoal">Emotional State Timeline</h3>
          <span className="text-[10px] px-2 py-0.5 rounded-full bg-ev-cream text-ev-warm-gray border border-ev-sand/40">
            estimated
          </span>
        </div>
        {summary.dominant_state && summary.dominant_state !== "neutral" && (
          <span
            className="text-xs font-medium px-2.5 py-1 rounded-lg"
            style={{
              backgroundColor: `${bins.find((b) => b.state === summary.dominant_state)?.color || "#4B5563"}15`,
              color: bins.find((b) => b.state === summary.dominant_state)?.color || "#4B5563",
            }}
          >
            Dominant: {STATE_LABELS[summary.dominant_state] || summary.dominant_state}
          </span>
        )}
      </div>

      {/* Gradient bar */}
      <div className="relative">
        <div
          ref={barRef}
          className="h-6 rounded-lg cursor-crosshair overflow-hidden"
          style={{ background: `linear-gradient(to right, ${gradientStops})` }}
          onMouseMove={handleMouseMove}
          onMouseLeave={() => setHoveredBin(null)}
        />

        {/* Hover tooltip */}
        {hoveredData && hoveredBin !== null && (
          <div
            className="absolute -top-16 transform -translate-x-1/2 pointer-events-none z-10"
            style={{ left: `${(hoveredBin / bins.length) * 100}%` }}
          >
            <div className="bg-ev-charcoal text-white px-3 py-2 rounded-lg text-[10px] whitespace-nowrap shadow-lg">
              <div className="font-semibold">{STATE_LABELS[hoveredData.state] || hoveredData.state}</div>
              <div className="text-white/70">
                {(hoveredData.time_ms / 1000).toFixed(1)}s · Arousal: {hoveredData.arousal.toFixed(2)} · Valence: {hoveredData.valence.toFixed(2)}
              </div>
            </div>
            <div
              className="w-2 h-2 rotate-45 mx-auto -mt-1"
              style={{ backgroundColor: "#2C2926" }}
            />
          </div>
        )}

        {/* Time labels */}
        <div className="flex justify-between mt-1.5">
          <span className="text-[10px] text-ev-warm-gray font-mono">0:00</span>
          <span className="text-[10px] text-ev-warm-gray font-mono">
            {Math.floor(data.duration_ms / 60000)}:{String(Math.floor((data.duration_ms % 60000) / 1000)).padStart(2, "0")}
          </span>
        </div>
      </div>

      {/* Legend */}
      <div className="flex items-center gap-4 mt-3 pt-3 border-t border-ev-sand/30">
        {(["calm", "social", "alert", "aggressive", "distressed"] as const).map((state) => (
          <div key={state} className="flex items-center gap-1.5">
            <div
              className="w-2.5 h-2.5 rounded-full"
              style={{
                backgroundColor:
                  state === "calm" ? "#10B981" :
                  state === "social" ? "#14B8A6" :
                  state === "alert" ? "#F59E0B" :
                  state === "aggressive" ? "#F97316" :
                  "#EF4444",
              }}
            />
            <span className="text-[10px] text-ev-warm-gray">{STATE_LABELS[state]}</span>
          </div>
        ))}
      </div>

      {/* Disclaimer */}
      <p className="text-[9px] text-ev-warm-gray/60 mt-2 italic">
        Emotional states are estimated from acoustic features using published research on elephant vocalizations. These are approximations, not definitive behavioral classifications.
      </p>
    </div>
  );
}
