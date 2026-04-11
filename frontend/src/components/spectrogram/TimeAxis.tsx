import React from "react";
import { cn } from "@/lib/utils";

interface TimeAxisProps {
  duration?: number;
  tickCount?: number;
  highContrast?: boolean;
}

function formatTime(seconds: number): string {
  if (seconds >= 60) {
    const m = Math.floor(seconds / 60);
    const s = seconds % 60;
    return `${m}:${s.toFixed(0).padStart(2, "0")}`;
  }
  return `${seconds.toFixed(1)}s`;
}

export default function TimeAxis({
  duration = 5,
  tickCount = 6,
  highContrast = false,
}: TimeAxisProps) {
  const ticks = Array.from({ length: tickCount }, (_, i) => {
    return (duration / (tickCount - 1)) * i;
  });

  return (
    <div className="flex justify-between px-16 pb-2 pt-1.5 border-t border-ev-sand">
      {ticks.map((t, i) => (
        <div key={i} className="flex flex-col items-center gap-0.5">
          <div
            className={cn(
              "shrink-0",
              highContrast ? "w-px h-2 bg-ev-warm-gray" : "w-px h-1.5 bg-ev-sand"
            )}
          />
          <span
            className={cn(
              "font-mono leading-none",
              highContrast
                ? "text-xs text-ev-elephant"
                : "text-[10px] text-ev-warm-gray"
            )}
          >
            {formatTime(t)}
          </span>
        </div>
      ))}
    </div>
  );
}
