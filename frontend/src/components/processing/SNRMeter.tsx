"use client";

import React from "react";
import { motion } from "framer-motion";

interface SNRMeterProps {
  snrBefore: number;
  snrAfter: number;
  loading?: boolean;
}

const MAX_SNR = 30;

function getQualityLabel(snr: number): { label: string; color: string } {
  if (snr >= 25) return { label: "Excellent", color: "#C4A46C" };
  if (snr >= 18) return { label: "Good", color: "#10C876" };
  if (snr >= 10) return { label: "Fair", color: "#F5A025" };
  return { label: "Poor", color: "#EF4444" };
}

function getBarColor(snr: number): string {
  if (snr >= 18) return "#10C876";
  if (snr >= 10) return "#F5A025";
  return "#EF4444";
}

export default function SNRMeter({
  snrBefore,
  snrAfter,
  loading = false,
}: SNRMeterProps) {
  const delta = snrAfter - snrBefore;
  const quality = getQualityLabel(snrAfter);
  const beforeWidth = Math.min((snrBefore / MAX_SNR) * 100, 100);
  const afterWidth = Math.min((snrAfter / MAX_SNR) * 100, 100);

  if (loading) {
    return (
      <div className="rounded-lg border border-white/[0.06] bg-dark-surface p-4 space-y-4">
        <div className="h-4 w-24 bg-dark-surface-elevated animate-pulse rounded" />
        <div className="h-6 bg-dark-surface-elevated animate-pulse rounded" />
        <div className="h-6 bg-dark-surface-elevated animate-pulse rounded" />
      </div>
    );
  }

  return (
    <div className="rounded-lg border border-white/[0.06] bg-dark-surface p-4 space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-medium text-dark-text-primary">
          Signal-to-Noise Ratio
        </h3>
        <div className="flex items-center gap-2">
          <motion.span
            initial={{ opacity: 0, scale: 0.8 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ delay: 0.6 }}
            className="px-2 py-0.5 rounded-full text-xs font-bold"
            style={{
              backgroundColor: `${quality.color}20`,
              color: quality.color,
            }}
          >
            {quality.label}
          </motion.span>
        </div>
      </div>

      {/* Before bar */}
      <div className="space-y-1.5">
        <div className="flex items-center justify-between">
          <span className="text-xs text-dark-text-secondary">Before</span>
          <span className="text-xs font-mono text-dark-text-primary">
            {snrBefore.toFixed(1)} dB
          </span>
        </div>
        <div className="h-5 bg-dark-surface-elevated rounded overflow-hidden">
          <motion.div
            initial={{ width: "0%" }}
            animate={{ width: `${beforeWidth}%` }}
            transition={{ duration: 0.8, ease: "easeOut" }}
            className="h-full rounded"
            style={{ backgroundColor: getBarColor(snrBefore) }}
          />
        </div>
      </div>

      {/* After bar */}
      <div className="space-y-1.5">
        <div className="flex items-center justify-between">
          <span className="text-xs text-dark-text-secondary">After</span>
          <span className="text-xs font-mono text-dark-text-primary">
            {snrAfter.toFixed(1)} dB
          </span>
        </div>
        <div className="h-5 bg-dark-surface-elevated rounded overflow-hidden">
          <motion.div
            initial={{ width: "0%" }}
            animate={{ width: `${afterWidth}%` }}
            transition={{ duration: 0.8, ease: "easeOut", delay: 0.3 }}
            className="h-full rounded"
            style={{ backgroundColor: getBarColor(snrAfter) }}
          />
        </div>
      </div>

      {/* Improvement badge */}
      <div className="flex justify-center pt-1">
        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.8 }}
          className={`inline-flex items-center gap-1 px-3 py-1 rounded-full text-sm font-bold ${
            delta > 0
              ? "bg-success/15 text-success"
              : "bg-danger/15 text-danger"
          }`}
        >
          {delta > 0 ? (
            <svg
              width="14"
              height="14"
              viewBox="0 0 14 14"
              fill="none"
            >
              <path
                d="M7 11V3M7 3L3 7M7 3L11 7"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          ) : (
            <svg
              width="14"
              height="14"
              viewBox="0 0 14 14"
              fill="none"
            >
              <path
                d="M7 3V11M7 11L3 7M7 11L11 7"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          )}
          {delta > 0 ? "+" : ""}
          {delta.toFixed(1)} dB
        </motion.div>
      </div>
    </div>
  );
}
