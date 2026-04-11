"use client";

import React from "react";
import FrequencyAxis from "./FrequencyAxis";
import TimeAxis from "./TimeAxis";
import { cn } from "@/lib/utils";

export interface SpectrogramViewerProps {
  src: string;
  title?: string;
  loading?: boolean;
  maxFrequency?: number;
  duration?: number;
  annotation?: string;
  annotationVariant?: "noise" | "clean" | "neutral";
  highContrast?: boolean;
  className?: string;
}

export default function SpectrogramViewer({
  src,
  title,
  loading = false,
  maxFrequency = 1000,
  duration = 5,
  annotation,
  annotationVariant = "neutral",
  highContrast = false,
  className,
}: SpectrogramViewerProps) {
  const annotationColors = {
    noise: "bg-danger/80 text-white border-danger/40",
    clean: "bg-success/80 text-white border-success/40",
    neutral: "bg-echofield-surface-elevated/90 text-echofield-text-primary border-echofield-border",
  };

  return (
    <div
      className={cn(
        "rounded-xl border border-echofield-border bg-echofield-surface shadow-card overflow-hidden",
        highContrast && "border-echofield-text-muted shadow-glow",
        className
      )}
    >
      {title && (
        <div className="px-4 py-2.5 border-b border-echofield-border flex items-center justify-between">
          <h3
            className={cn(
              "text-sm font-semibold text-echofield-text-primary",
              highContrast && "text-base"
            )}
          >
            {title}
          </h3>
          {/* Spectrogram color scale legend */}
          <div className="flex items-center gap-2">
            <span className="text-[10px] text-echofield-text-muted font-mono">Quiet</span>
            <div className="w-24 h-2 rounded-full bg-gradient-spectrogram" />
            <span className="text-[10px] text-echofield-text-muted font-mono">Loud</span>
          </div>
        </div>
      )}

      <div className="relative flex">
        {/* Y-axis frequency labels */}
        <FrequencyAxis maxFrequency={maxFrequency} highContrast={highContrast} />

        {/* Spectrogram image area */}
        <div className="relative flex-1 min-h-[200px]">
          {loading ? (
            <div className="absolute inset-0 skeleton" />
          ) : (
            <>
              <img
                src={src}
                alt={title ?? "Spectrogram"}
                className="w-full h-auto object-contain block"
                draggable={false}
              />
              {/* Grid overlay for visual reference */}
              <div
                className="absolute inset-0 pointer-events-none"
                style={{
                  backgroundImage:
                    "linear-gradient(to right, rgba(42,58,66,0.15) 1px, transparent 1px), linear-gradient(to bottom, rgba(42,58,66,0.15) 1px, transparent 1px)",
                  backgroundSize: "20% 25%",
                }}
              />
            </>
          )}

          {/* Annotation overlay */}
          {annotation && !loading && (
            <div className="absolute bottom-3 left-3 right-3 z-10">
              <div
                className={cn(
                  "inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border text-xs font-semibold backdrop-blur-sm",
                  annotationColors[annotationVariant]
                )}
              >
                {annotationVariant === "noise" && (
                  <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.732-.833-2.5 0L4.268 16.5c-.77.833.192 2.5 1.732 2.5z" />
                  </svg>
                )}
                {annotationVariant === "clean" && (
                  <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                  </svg>
                )}
                {annotation}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* X-axis time labels */}
      <TimeAxis duration={duration} highContrast={highContrast} />
    </div>
  );
}
