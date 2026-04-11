import React from "react";

interface FrequencyAxisProps {
  maxFrequency?: number;
}

function formatFrequency(hz: number): string {
  if (hz >= 1000) {
    const khz = hz / 1000;
    return `${Number.isInteger(khz) ? khz : khz.toFixed(1)} kHz`;
  }
  return `${hz} Hz`;
}

const TICK_COUNT = 5;

export default function FrequencyAxis({ maxFrequency = 1000 }: FrequencyAxisProps) {
  const ticks = Array.from({ length: TICK_COUNT }, (_, i) => {
    const freq = maxFrequency - (maxFrequency / (TICK_COUNT - 1)) * i;
    return Math.round(freq);
  });

  return (
    <div className="relative flex flex-col justify-between h-full py-1 pr-2 w-14 text-right">
      {ticks.map((freq) => (
        <div key={freq} className="flex items-center justify-end gap-1">
          <span className="text-[10px] text-echofield-text-muted leading-none whitespace-nowrap">
            {formatFrequency(freq)}
          </span>
          <div className="w-1.5 h-px bg-echofield-border shrink-0" />
        </div>
      ))}
    </div>
  );
}
