"use client";

import React from "react";

interface AcousticPanelProps {
  features: Record<string, unknown>;
}

interface MetricDef {
  key: string;
  label: string;
  unit: string;
}

const METRIC_DEFINITIONS: MetricDef[] = [
  { key: "fundamental_freq", label: "Fundamental Freq", unit: "Hz" },
  { key: "harmonicity", label: "Harmonicity", unit: "dB" },
  { key: "harmonic_richness", label: "Harmonic Richness", unit: "" },
  { key: "formant_peaks", label: "Formant Peaks", unit: "Hz" },
  { key: "duration", label: "Duration", unit: "s" },
  { key: "bandwidth", label: "Bandwidth", unit: "Hz" },
  { key: "energy_distribution", label: "Energy Distribution", unit: "" },
  { key: "spectral_centroid", label: "Spectral Centroid", unit: "Hz" },
  { key: "spectral_rolloff", label: "Spectral Rolloff", unit: "Hz" },
  { key: "mfccs", label: "MFCCs", unit: "" },
  { key: "zero_crossing_rate", label: "Zero-Crossing Rate", unit: "Hz" },
  { key: "snr", label: "SNR", unit: "dB" },
];

function formatValue(value: unknown, unit: string): string {
  if (value === null || value === undefined) return "--";
  if (Array.isArray(value)) {
    return value.map((v) => (typeof v === "number" ? v.toFixed(1) : String(v))).join(", ");
  }
  if (typeof value === "number") {
    const formatted = Number.isInteger(value) ? String(value) : value.toFixed(2);
    return unit ? `${formatted} ${unit}` : formatted;
  }
  return String(value);
}

export default function AcousticPanel({ features }: AcousticPanelProps) {
  return (
    <div className="rounded-lg border border-ev-sand bg-ev-cream overflow-hidden">
      <div className="px-4 py-3 border-b border-ev-sand">
        <h3 className="text-sm font-medium text-ev-charcoal">
          Acoustic Features
        </h3>
      </div>

      <div className="grid grid-cols-2 gap-px bg-ev-sand">
        {METRIC_DEFINITIONS.map((metric) => {
          const rawValue = features[metric.key];
          return (
            <div
              key={metric.key}
              className="bg-ev-cream px-4 py-3 space-y-1"
            >
              <span className="text-[10px] uppercase tracking-wide text-ev-warm-gray block">
                {metric.label}
              </span>
              <span className="text-sm font-mono text-ev-charcoal block">
                {formatValue(rawValue, metric.unit)}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
