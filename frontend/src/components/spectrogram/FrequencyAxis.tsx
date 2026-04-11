import React from "react";
import { cn } from "@/lib/utils";

interface FrequencyAxisProps {
  maxFrequency?: number;
  tickCount?: number;
  highContrast?: boolean;
}

function formatFrequency(hz: number): string {
  if (hz >= 1000) {
    const khz = hz / 1000;
    return `${Number.isInteger(khz) ? khz : khz.toFixed(1)} kHz`;
  }
  return `${hz} Hz`;
}

export default function FrequencyAxis({
  maxFrequency = 1000,
  tickCount = 5,
  highContrast = false,
}: FrequencyAxisProps) {
  const ticks = Array.from({ length: tickCount }, (_, i) => {
    const freq = maxFrequency - (maxFrequency / (tickCount - 1)) * i;
    return Math.round(freq);
  });

  return (
    <div className="relative flex flex-col justify-between h-full py-2 pr-2 w-16 text-right shrink-0">
      {ticks.map((freq) => (
        <div key={freq} className="flex items-center justify-end gap-1">
          <span
            className={cn(
              "font-mono leading-none whitespace-nowrap",
              highContrast
                ? "text-xs text-echofield-text-secondary"
                : "text-[10px] text-echofield-text-muted"
            )}
          >
            {formatFrequency(freq)}
          </span>
          <div
            className={cn(
              "shrink-0",
              highContrast ? "w-2.5 h-px bg-echofield-text-muted" : "w-1.5 h-px bg-echofield-border"
            )}
          />
        </div>
      ))}
    </div>
  );
}
