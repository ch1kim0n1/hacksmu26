"use client";

import { useMemo } from "react";
import { cn } from "@/lib/utils";

interface HarmonicOverlayProps {
  frequenciesHz: number[];
  maxFrequency: number;
  visible: boolean;
}

export default function HarmonicOverlay({
  frequenciesHz,
  maxFrequency,
  visible,
}: HarmonicOverlayProps) {
  const frequencies = useMemo(() => {
    const unique = new Set<number>();
    for (const raw of frequenciesHz) {
      const value = Number(raw);
      if (!Number.isFinite(value) || value <= 0 || value > maxFrequency) {
        continue;
      }
      unique.add(Number(value.toFixed(1)));
    }
    return Array.from(unique).sort((a, b) => a - b);
  }, [frequenciesHz, maxFrequency]);

  if (frequencies.length === 0) {
    return null;
  }

  const fundamental = frequencies[0];

  return (
    <div className="absolute inset-0 pointer-events-none z-10" aria-hidden={!visible}>
      {frequencies.map((freq, index) => {
        const topPercent = 100 - (freq / maxFrequency) * 100;
        const isFundamental = freq === fundamental;
        return (
          <div
            key={`${freq}-${index}`}
            className={cn(
              "absolute left-0 right-0 transition-opacity duration-500",
              visible ? "opacity-100" : "opacity-0"
            )}
            style={{
              top: `${topPercent}%`,
              transitionDelay: `${Math.min(index * 60, 240)}ms`,
            }}
          >
            <div
              className={cn(
                "w-full border-t",
                isFundamental
                  ? "border-accent-gold border-solid"
                  : "border-accent-savanna/80 border-dashed"
              )}
            />
            <span
              className={cn(
                "absolute right-1 -top-2 rounded px-1 py-0.5 text-[10px] font-mono",
                isFundamental
                  ? "bg-accent-gold/90 text-ev-charcoal"
                  : "bg-accent-savanna/80 text-white"
              )}
            >
              {freq.toFixed(1)} Hz
            </span>
          </div>
        );
      })}
    </div>
  );
}
