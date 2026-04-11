"use client";

import React from "react";

interface Call {
  id: string;
  recording_id: string;
  call_type: string;
  duration_ms: number;
  frequency_min_hz: number;
  frequency_max_hz: number;
  confidence: number;
}

interface CallCardProps {
  call: Call;
  onClick?: (call: Call) => void;
}

const CALL_TYPE_COLORS: Record<string, { bg: string; text: string }> = {
  contact: { bg: "bg-accent-teal/15", text: "text-accent-teal" },
  alarm: { bg: "bg-danger/15", text: "text-danger" },
  song: { bg: "bg-gold/15", text: "text-gold" },
  social: { bg: "bg-success/15", text: "text-success" },
  feeding: { bg: "bg-warning/15", text: "text-warning" },
  mating: { bg: "bg-[#A78BFA]/15", text: "text-[#A78BFA]" },
};

function formatDuration(ms: number): string {
  if (ms < 1000) return `${ms}ms`;
  const seconds = ms / 1000;
  if (seconds < 60) return `${seconds.toFixed(1)}s`;
  const minutes = Math.floor(seconds / 60);
  const remainingSeconds = Math.round(seconds % 60);
  return `${minutes}m ${remainingSeconds}s`;
}

export default function CallCard({ call, onClick }: CallCardProps) {
  const typeColors = CALL_TYPE_COLORS[call.call_type] || {
    bg: "bg-echofield-surface-elevated",
    text: "text-echofield-text-secondary",
  };

  const confidencePercent = Math.round(call.confidence * 100);

  return (
    <button
      onClick={() => onClick?.(call)}
      className="w-full text-left rounded-lg border border-echofield-border bg-echofield-surface p-4 space-y-3 hover:border-echofield-text-muted hover:bg-echofield-surface-elevated transition-all group"
    >
      {/* Header row */}
      <div className="flex items-center justify-between">
        <span
          className={`px-2.5 py-0.5 rounded-full text-xs font-semibold uppercase tracking-wide ${typeColors.bg} ${typeColors.text}`}
        >
          {call.call_type}
        </span>
        <span className="text-[11px] text-echofield-text-muted font-mono">
          #{call.id.slice(0, 8)}
        </span>
      </div>

      {/* Metrics */}
      <div className="grid grid-cols-2 gap-2">
        <div>
          <span className="text-[10px] uppercase tracking-wide text-echofield-text-muted block">
            Frequency Range
          </span>
          <span className="text-sm text-echofield-text-primary font-mono">
            {call.frequency_min_hz} - {call.frequency_max_hz} Hz
          </span>
        </div>
        <div>
          <span className="text-[10px] uppercase tracking-wide text-echofield-text-muted block">
            Duration
          </span>
          <span className="text-sm text-echofield-text-primary font-mono">
            {formatDuration(call.duration_ms)}
          </span>
        </div>
      </div>

      {/* Confidence bar */}
      <div className="space-y-1">
        <div className="flex items-center justify-between">
          <span className="text-[10px] uppercase tracking-wide text-echofield-text-muted">
            Confidence
          </span>
          <span className="text-xs font-mono text-echofield-text-secondary">
            {confidencePercent}%
          </span>
        </div>
        <div className="h-1.5 bg-echofield-surface-elevated rounded-full overflow-hidden">
          <div
            className="h-full rounded-full transition-all duration-500"
            style={{
              width: `${confidencePercent}%`,
              backgroundColor:
                confidencePercent >= 80
                  ? "#10C876"
                  : confidencePercent >= 60
                  ? "#F5A025"
                  : "#EF4444",
            }}
          />
        </div>
      </div>
    </button>
  );
}
