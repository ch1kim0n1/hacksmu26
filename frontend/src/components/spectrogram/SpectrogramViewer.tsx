"use client";

import React from "react";

interface SpectrogramViewerProps {
  src: string;
  title?: string;
  loading?: boolean;
}

const FREQUENCY_LABELS = ["1000 Hz", "750 Hz", "500 Hz", "250 Hz", "0 Hz"];

export default function SpectrogramViewer({
  src,
  title,
  loading = false,
}: SpectrogramViewerProps) {
  return (
    <div className="rounded-lg border border-echofield-border bg-echofield-surface shadow-lg shadow-accent-teal/5 overflow-hidden">
      {title && (
        <div className="px-4 py-2 border-b border-echofield-border">
          <h3 className="text-sm font-medium text-echofield-text-primary">
            {title}
          </h3>
        </div>
      )}

      <div className="relative flex">
        {/* Y-axis frequency labels */}
        <div className="relative flex flex-col justify-between py-2 px-2 w-16 shrink-0 text-right">
          {FREQUENCY_LABELS.map((label) => (
            <span
              key={label}
              className="text-[10px] text-echofield-text-muted leading-none"
            >
              {label}
            </span>
          ))}
        </div>

        {/* Spectrogram image area */}
        <div className="relative flex-1 min-h-[200px]">
          {loading ? (
            <div className="absolute inset-0 bg-echofield-surface-elevated animate-pulse rounded" />
          ) : (
            <img
              src={src}
              alt={title ?? "Spectrogram"}
              className="w-full h-auto object-contain block"
              draggable={false}
            />
          )}
        </div>
      </div>

      {/* X-axis time labels */}
      <div className="flex justify-between px-16 pb-2 pt-1 border-t border-echofield-border">
        {["0s", "1s", "2s", "3s", "4s", "5s"].map((t) => (
          <span
            key={t}
            className="text-[10px] text-echofield-text-muted"
          >
            {t}
          </span>
        ))}
      </div>
    </div>
  );
}
