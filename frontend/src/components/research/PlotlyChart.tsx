"use client";

import { useEffect, useRef } from "react";

/* eslint-disable @typescript-eslint/no-explicit-any */

interface PlotlyChartProps {
  data: Record<string, unknown>[];
  layout?: Record<string, unknown>;
  config?: Record<string, unknown>;
  className?: string;
}

export default function PlotlyChart({
  data,
  layout,
  config,
  className = "w-full h-[400px]",
}: PlotlyChartProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const plotlyRef = useRef<any>(null);

  useEffect(() => {
    let mounted = true;

    import("plotly.js-dist-min" as any).then((Plotly: any) => {
      if (!mounted || !containerRef.current) return;
      plotlyRef.current = Plotly;

      Plotly.newPlot(
        containerRef.current,
        data,
        {
          paper_bgcolor: "rgba(0,0,0,0)",
          plot_bgcolor: "rgba(0,0,0,0)",
          font: { color: "#4A453E", family: "system-ui, sans-serif", size: 12 },
          margin: { t: 36, r: 16, b: 40, l: 52 },
          legend: {
            orientation: "h",
            yanchor: "bottom",
            y: 1.02,
            xanchor: "right",
            x: 1,
            font: { size: 11 },
          },
          ...layout,
        },
        {
          responsive: true,
          displayModeBar: false,
          ...config,
        },
      );
    });

    const node = containerRef.current;
    return () => {
      mounted = false;
      if (node && plotlyRef.current) {
        try {
          plotlyRef.current.purge(node);
        } catch {
          // ignore
        }
      }
    };
  }, [data, layout, config]);

  return <div ref={containerRef} className={className} />;
}
