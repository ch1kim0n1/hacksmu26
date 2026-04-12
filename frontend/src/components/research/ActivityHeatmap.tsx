"use client";

import type { ActivityHeatmapResponse } from "@/lib/audio-api";

function intensityClass(value: number, max: number): string {
  if (value <= 0 || max <= 0) return "bg-background-elevated";
  const ratio = value / max;
  if (ratio >= 0.75) return "bg-danger";
  if (ratio >= 0.5) return "bg-warning";
  if (ratio >= 0.25) return "bg-accent-gold";
  return "bg-accent-savanna";
}

export default function ActivityHeatmap({ data }: { data: ActivityHeatmapResponse }) {
  const max = Math.max(0, ...data.heatmap.matrix.flat());

  return (
    <section className="rounded-lg border border-ev-sand bg-ev-cream p-5">
      <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="text-xl font-semibold text-ev-charcoal">Call Activity</h2>
          <p className="text-sm text-ev-warm-gray">
            {data.total_calls} calls across {data.recordings_analyzed} recordings
          </p>
        </div>
        <div className="flex items-center gap-2 text-xs text-ev-warm-gray">
          <span>Low</span>
          <span className="h-3 w-4 rounded-sm bg-accent-savanna" />
          <span className="h-3 w-4 rounded-sm bg-accent-gold" />
          <span className="h-3 w-4 rounded-sm bg-warning" />
          <span className="h-3 w-4 rounded-sm bg-danger" />
          <span>High</span>
        </div>
      </div>

      <div className="overflow-x-auto">
        <div className="min-w-[760px]">
          <div className="grid grid-cols-[96px_repeat(24,minmax(22px,1fr))] gap-1 text-[11px] text-ev-warm-gray">
            <div />
            {data.heatmap.hours.map((hour) => (
              <div key={hour} className="text-center">
                {hour}
              </div>
            ))}
            {data.heatmap.call_types.map((callType, rowIndex) => (
              <div key={callType} className="contents">
                <div className="flex items-center truncate pr-2 text-sm font-medium capitalize text-ev-elephant">
                  {callType}
                </div>
                {data.heatmap.hours.map((hour, columnIndex) => {
                  const value = data.heatmap.matrix[rowIndex]?.[columnIndex] ?? 0;
                  return (
                    <div
                      key={`${callType}-${hour}`}
                      title={`${callType} at ${hour}:00: ${value} call${value === 1 ? "" : "s"}`}
                      className={`h-7 rounded-sm ${intensityClass(value, max)} ${value > 0 ? "text-white" : "text-ev-warm-gray"} flex items-center justify-center text-[10px]`}
                    >
                      {value || ""}
                    </div>
                  );
                })}
              </div>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}
