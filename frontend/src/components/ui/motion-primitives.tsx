"use client";

import { type Variants } from "framer-motion";

export const staggerContainer: Variants = {
  initial: {},
  animate: {
    transition: { staggerChildren: 0.07, delayChildren: 0.05 },
  },
};

export const fadeUp: Variants = {
  initial: { opacity: 0, y: 18 },
  animate: {
    opacity: 1,
    y: 0,
    transition: { duration: 0.45, ease: [0.25, 0.46, 0.45, 0.94] },
  },
};

export const fadeIn: Variants = {
  initial: { opacity: 0 },
  animate: { opacity: 1, transition: { duration: 0.4 } },
};

export const scaleIn: Variants = {
  initial: { opacity: 0, scale: 0.92 },
  animate: {
    opacity: 1,
    scale: 1,
    transition: { duration: 0.35, ease: "easeOut" },
  },
};

export function SoundWave({
  className = "",
  bars = 5,
  color = "bg-accent-savanna/40",
}: {
  className?: string;
  bars?: number;
  color?: string;
}) {
  return (
    <div className={`flex items-end gap-[3px] ${className}`}>
      {Array.from({ length: bars }).map((_, i) => (
        <div
          key={i}
          className={`w-[3px] rounded-full ${color}`}
          style={{
            animation: "sound-bar 1.2s ease-in-out infinite",
            animationDelay: `${i * 0.15}s`,
            transformOrigin: "bottom",
            height: `${14 + ((i * 7) % 12)}px`,
          }}
        />
      ))}
    </div>
  );
}

export function QualityRing({
  score,
  size = 80,
  strokeWidth = 6,
}: {
  score: number;
  size?: number;
  strokeWidth?: number;
}) {
  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference - (score / 100) * circumference;
  const color =
    score >= 90
      ? "#10C876"
      : score >= 75
        ? "#C4A46C"
        : score >= 50
          ? "#F5A025"
          : "#EF4444";

  return (
    <div className="relative inline-flex items-center justify-center">
      <svg width={size} height={size} className="-rotate-90">
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke="currentColor"
          strokeWidth={strokeWidth}
          className="text-ev-cream"
        />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke={color}
          strokeWidth={strokeWidth}
          strokeDasharray={circumference}
          strokeDashoffset={offset}
          strokeLinecap="round"
          className="quality-ring-stroke"
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span className="text-xl font-bold text-ev-charcoal tabular-nums leading-none">
          {Math.round(score)}
        </span>
        <span className="text-[9px] text-ev-warm-gray uppercase tracking-wider font-medium leading-none mt-1">
          {score >= 90
            ? "Excellent"
            : score >= 75
              ? "Good"
              : score >= 50
                ? "Fair"
                : "Poor"}
        </span>
      </div>
    </div>
  );
}
