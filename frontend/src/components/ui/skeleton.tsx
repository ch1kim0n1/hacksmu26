import React from "react";
import { cn } from "@/lib/utils";

interface SkeletonProps extends React.HTMLAttributes<HTMLDivElement> {
  variant?: "default" | "card" | "spectrogram" | "waveform" | "metric";
}

export function Skeleton({ className, variant = "default", ...props }: SkeletonProps) {
  const variantClasses = {
    default: "h-4 w-full",
    card: "h-32 w-full rounded-xl",
    spectrogram: "h-48 w-full rounded-xl",
    waveform: "h-16 w-full rounded-lg",
    metric: "h-10 w-24 rounded-lg",
  };

  return (
    <div
      className={cn("skeleton", variantClasses[variant], className)}
      {...props}
    />
  );
}

export function SkeletonCard() {
  return (
    <div className="rounded-xl border border-echofield-border bg-echofield-surface p-6 space-y-4">
      <div className="flex items-center gap-3">
        <Skeleton className="h-10 w-10 rounded-full" />
        <div className="space-y-2 flex-1">
          <Skeleton className="h-4 w-1/3" />
          <Skeleton className="h-3 w-1/2" />
        </div>
      </div>
      <Skeleton variant="spectrogram" />
      <div className="flex gap-4">
        <Skeleton variant="metric" />
        <Skeleton variant="metric" />
        <Skeleton variant="metric" />
      </div>
    </div>
  );
}

export function SkeletonSpectrogram() {
  return (
    <div className="rounded-xl border border-echofield-border bg-echofield-surface overflow-hidden">
      <div className="px-4 py-2.5 border-b border-echofield-border">
        <Skeleton className="h-4 w-32" />
      </div>
      <div className="flex">
        <div className="w-16 p-2 space-y-6">
          {Array.from({ length: 5 }).map((_, i) => (
            <Skeleton key={i} className="h-3 w-10 ml-auto" />
          ))}
        </div>
        <Skeleton variant="spectrogram" className="flex-1 m-0 rounded-none" />
      </div>
    </div>
  );
}

export function SkeletonMetricPanel() {
  return (
    <div className="rounded-xl border border-echofield-border bg-echofield-surface p-4 space-y-3">
      <Skeleton className="h-3 w-20" />
      <Skeleton className="h-8 w-16" />
      <Skeleton variant="waveform" />
    </div>
  );
}
