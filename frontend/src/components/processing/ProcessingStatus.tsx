"use client";

import React from "react";

interface ProcessingStatusProps {
  stage: string;
  progress: number;
  eta?: string;
}

const STAGE_DISPLAY_NAMES: Record<string, string> = {
  ingestion: "Ingesting Audio",
  spectrogram: "Generating Spectrogram",
  noise_removal: "Removing Noise",
  quality_assessment: "Assessing Quality",
};

export default function ProcessingStatus({
  stage,
  progress,
  eta,
}: ProcessingStatusProps) {
  const displayName = STAGE_DISPLAY_NAMES[stage] || stage;

  return (
    <div className="flex items-center gap-3 px-4 py-2 rounded-lg bg-ev-cream border border-ev-sand">
      {/* Spinning indicator */}
      <div className="w-4 h-4 shrink-0">
        <svg
          className="animate-spin text-accent-savanna"
          viewBox="0 0 16 16"
          fill="none"
        >
          <circle
            cx="8"
            cy="8"
            r="6"
            stroke="currentColor"
            strokeWidth="2"
            opacity="0.25"
          />
          <path
            d="M14 8A6 6 0 0 0 8 2"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
          />
        </svg>
      </div>

      {/* Stage name */}
      <span className="text-sm font-medium text-ev-charcoal truncate">
        {displayName}
      </span>

      {/* Progress */}
      <span className="text-xs font-mono text-accent-savanna shrink-0">
        {Math.round(progress)}%
      </span>

      {/* ETA */}
      {eta && (
        <>
          <div className="w-px h-3 bg-ev-sand" />
          <span className="text-xs text-ev-warm-gray shrink-0">
            ETA: {eta}
          </span>
        </>
      )}
    </div>
  );
}
