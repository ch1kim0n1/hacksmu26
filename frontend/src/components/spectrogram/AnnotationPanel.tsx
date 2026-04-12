"use client";

import React from "react";
import type { Annotation } from "@/hooks/useAnnotations";
import { cn } from "@/lib/utils";

export interface AnnotationPanelProps {
  annotations: Annotation[];
  onRemove: (id: string) => void;
  onSelect: (id: string) => void;
  selectedId: string | null;
}

function formatTime(time_ms: number): string {
  const seconds = time_ms / 1000;
  if (seconds < 60) return `${seconds.toFixed(1)}s`;
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${String(s).padStart(2, "0")}`;
}

const TAG_LABELS: Record<string, string> = {
  "Noise artifact": "Noise artifact",
  "Interesting call": "Interesting call",
  "Possible infrasound": "Possible infrasound",
  "Unknown vocalization": "Unknown vocalization",
  Custom: "Custom",
};

export default function AnnotationPanel({
  annotations,
  onRemove,
  onSelect,
  selectedId,
}: AnnotationPanelProps) {
  if (annotations.length === 0) {
    return (
      <div className="rounded-xl border border-ev-sand bg-ev-cream p-4">
        <h4 className="text-sm font-semibold text-ev-charcoal mb-3">Annotations</h4>
        <div className="text-center py-6 text-ev-warm-gray text-sm">
          <p className="font-medium">No annotations yet</p>
          <p className="text-xs mt-1 text-ev-warm-gray/70">
            Enable annotate mode on the spectrogram to add notes.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="rounded-xl border border-ev-sand bg-ev-cream overflow-hidden">
      <div className="px-4 py-2.5 border-b border-ev-sand flex items-center justify-between">
        <h4 className="text-sm font-semibold text-ev-charcoal">Annotations</h4>
        <span className="text-xs text-ev-warm-gray bg-ev-sand/40 rounded-full px-2 py-0.5">
          {annotations.length}
        </span>
      </div>

      <ul className="divide-y divide-ev-sand/60 max-h-72 overflow-y-auto">
        {annotations.map((ann) => {
          const isSelected = ann.id === selectedId;
          return (
            <li
              key={ann.id}
              data-selected={isSelected ? "true" : "false"}
              className={cn(
                "flex items-start gap-2.5 px-3 py-2.5 transition-colors",
                isSelected ? "bg-accent-savanna/8" : "hover:bg-ev-sand/20"
              )}
            >
              {/* Tag color dot */}
              <span
                className="mt-0.5 w-2.5 h-2.5 rounded-full shrink-0"
                style={{ backgroundColor: ann.color }}
              />

              {/* Row button — click to select */}
              <button
                type="button"
                aria-label="Select annotation"
                onClick={() => onSelect(ann.id)}
                className="flex-1 min-w-0 text-left focus:outline-none"
              >
                <p className="text-xs font-medium text-ev-charcoal truncate">
                  {TAG_LABELS[ann.tag] ?? ann.tag}
                </p>
                {ann.text && (
                  <p className="text-[11px] text-ev-warm-gray truncate mt-0.5">{ann.text}</p>
                )}
                <p className="text-[10px] text-ev-warm-gray/60 font-mono mt-0.5">
                  {formatTime(ann.time_ms)}
                  {ann.type === "region" && ann.end_time_ms != null
                    ? ` – ${formatTime(ann.end_time_ms)}`
                    : ""}
                  {" · "}
                  {Math.round(ann.frequency_hz)} Hz
                </p>
              </button>

              {/* Delete button */}
              <button
                type="button"
                aria-label={`Delete annotation: ${ann.text}`}
                onClick={() => onRemove(ann.id)}
                className="shrink-0 p-1 rounded text-ev-warm-gray hover:text-danger hover:bg-danger/10 transition-colors focus:outline-none"
                title="Remove annotation"
              >
                <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
