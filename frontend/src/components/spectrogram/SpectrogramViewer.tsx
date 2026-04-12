"use client";

import React from "react";
import FrequencyAxis from "./FrequencyAxis";
import TimeAxis from "./TimeAxis";
import HarmonicOverlay from "./HarmonicOverlay";
import { cn } from "@/lib/utils";

export type SpectrogramColormap = "viridis" | "magma" | "inferno" | "plasma" | "gray";

export const COLORMAPS: { id: SpectrogramColormap; label: string; gradient: string }[] = [
  { id: "viridis", label: "Viridis", gradient: "linear-gradient(to right, #440154, #31688e, #35b779, #fde725)" },
  { id: "magma",   label: "Magma",   gradient: "linear-gradient(to right, #000004, #3b0f70, #8c2981, #de4968, #fde0dd)" },
  { id: "inferno", label: "Inferno", gradient: "linear-gradient(to right, #000004, #420a68, #932567, #dd513a, #fcffa4)" },
  { id: "plasma",  label: "Plasma",  gradient: "linear-gradient(to right, #0d0887, #7e03a8, #cc4778, #f89540, #f0f921)" },
  { id: "gray",    label: "Gray",    gradient: "linear-gradient(to right, #000000, #ffffff)" },
];

export interface SpectrogramViewerProps {
  src: string;
  title?: string;
  loading?: boolean;
  maxFrequency?: number;
  duration?: number;
  annotation?: string;
  annotationVariant?: "noise" | "clean" | "neutral";
  harmonicFrequenciesHz?: number[];
  showHarmonicToggle?: boolean;
  highContrast?: boolean;
  className?: string;
  colormap?: SpectrogramColormap;
  onColormapChange?: (colormap: SpectrogramColormap) => void;
  showColormapPicker?: boolean;
}

export default function SpectrogramViewer({
  src,
  title,
  loading = false,
  maxFrequency = 1000,
  duration = 5,
  annotation,
  annotationVariant = "neutral",
  harmonicFrequenciesHz,
  showHarmonicToggle = true,
  highContrast = false,
  className,
  colormap = "viridis",
  onColormapChange,
  showColormapPicker = false,
}: SpectrogramViewerProps) {
  const hasHarmonics = (harmonicFrequenciesHz?.length || 0) > 0;
  const [showHarmonics, setShowHarmonics] = React.useState(hasHarmonics);

  React.useEffect(() => {
    setShowHarmonics(hasHarmonics);
  }, [hasHarmonics]);

  const annotationColors = {
    noise: "bg-danger/80 text-white border-danger/40",
    clean: "bg-success/80 text-white border-success/40",
    neutral: "bg-background-elevated/90 text-ev-charcoal border-ev-sand",
  };

  return (
    <div
      className={cn(
        "rounded-xl border border-ev-sand bg-ev-cream overflow-hidden",
        highContrast && "border-ev-warm-gray",
        className
      )}
    >
      {title && (
        <div className="px-4 py-2.5 border-b border-ev-sand flex items-center justify-between">
          <div className="flex items-center gap-3">
            <h3
              className={cn(
                "text-sm font-semibold text-ev-charcoal",
                highContrast && "text-base"
              )}
            >
              {title}
            </h3>
            {hasHarmonics && showHarmonicToggle && (
              <button
                type="button"
                onClick={() => setShowHarmonics((prev) => !prev)}
                className="rounded border border-ev-sand px-2 py-1 text-[10px] font-medium text-ev-elephant hover:bg-background-elevated"
                aria-label="Toggle harmonic overlay"
              >
                {showHarmonics ? "Hide Harmonics" : "Show Harmonics"}
              </button>
            )}
          </div>
          <div className="flex items-center gap-3">
            {/* Colormap picker */}
            {showColormapPicker && (
              <div className="flex items-center gap-1.5" aria-label="Select colormap" role="group">
                {COLORMAPS.map((cm) => (
                  <button
                    key={cm.id}
                    type="button"
                    title={cm.label}
                    aria-pressed={colormap === cm.id}
                    onClick={() => onColormapChange?.(cm.id)}
                    className={cn(
                      "w-8 h-3 rounded-sm border transition-all",
                      colormap === cm.id
                        ? "border-ev-charcoal ring-1 ring-ev-charcoal scale-110"
                        : "border-ev-sand/60 hover:border-ev-warm-gray"
                    )}
                    style={{ background: cm.gradient }}
                  />
                ))}
              </div>
            )}
            {/* Spectrogram color scale legend */}
            <div className="flex items-center gap-2">
              <span className="text-[10px] text-ev-warm-gray font-mono">Quiet</span>
              <div className="w-24 h-2 rounded-full bg-gradient-spectrogram" />
              <span className="text-[10px] text-ev-warm-gray font-mono">Loud</span>
            </div>
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
              {hasHarmonics && harmonicFrequenciesHz && (
                <HarmonicOverlay
                  frequenciesHz={harmonicFrequenciesHz}
                  maxFrequency={maxFrequency}
                  visible={showHarmonics}
                />
              )}
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
