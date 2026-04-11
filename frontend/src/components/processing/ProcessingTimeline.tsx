"use client";

import React from "react";
import { motion } from "framer-motion";

interface Stage {
  name: string;
  status: "pending" | "active" | "complete";
}

interface ProcessingTimelineProps {
  stages: Stage[];
  progress: number;
}

const STAGE_DISPLAY_NAMES: Record<string, string> = {
  ingestion: "Ingestion",
  spectrogram: "Spectrogram",
  noise_removal: "Noise Removal",
  quality_assessment: "Quality",
};

export default function ProcessingTimeline({
  stages,
  progress,
}: ProcessingTimelineProps) {
  return (
    <div className="space-y-6">
      {/* Timeline row */}
      <div className="flex items-center justify-between px-4">
        {stages.map((stage, index) => (
          <React.Fragment key={stage.name}>
            {/* Stage node */}
            <div className="flex flex-col items-center gap-2">
              <div className="relative">
                {/* Circle */}
                {stage.status === "complete" ? (
                  <motion.div
                    initial={{ scale: 0.8 }}
                    animate={{ scale: 1 }}
                    className="w-8 h-8 rounded-full bg-success flex items-center justify-center"
                  >
                    <svg
                      width="14"
                      height="14"
                      viewBox="0 0 14 14"
                      fill="none"
                    >
                      <path
                        d="M2 7L5.5 10.5L12 3.5"
                        stroke="white"
                        strokeWidth="2"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      />
                    </svg>
                  </motion.div>
                ) : stage.status === "active" ? (
                  <motion.div
                    animate={{
                      boxShadow: [
                        "0 0 0 0 rgba(0, 217, 255, 0.4)",
                        "0 0 0 8px rgba(0, 217, 255, 0)",
                        "0 0 0 0 rgba(0, 217, 255, 0.4)",
                      ],
                    }}
                    transition={{
                      duration: 2,
                      repeat: Infinity,
                      ease: "easeInOut",
                    }}
                    className="w-8 h-8 rounded-full bg-accent-savanna flex items-center justify-center"
                  >
                    <motion.div
                      animate={{ rotate: 360 }}
                      transition={{
                        duration: 1.5,
                        repeat: Infinity,
                        ease: "linear",
                      }}
                      className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full"
                    />
                  </motion.div>
                ) : (
                  <div className="w-8 h-8 rounded-full bg-background-elevated border-2 border-ev-sand flex items-center justify-center">
                    <div className="w-2 h-2 rounded-full bg-ev-warm-gray" />
                  </div>
                )}
              </div>

              {/* Label */}
              <span
                className={`text-[11px] font-medium whitespace-nowrap ${
                  stage.status === "complete"
                    ? "text-success"
                    : stage.status === "active"
                    ? "text-accent-savanna"
                    : "text-ev-warm-gray"
                }`}
              >
                {STAGE_DISPLAY_NAMES[stage.name] || stage.name}
              </span>
            </div>

            {/* Connecting line */}
            {index < stages.length - 1 && (
              <div className="flex-1 h-0.5 mx-2 mb-6 relative overflow-hidden rounded-full bg-ev-sand">
                {stage.status === "complete" && (
                  <motion.div
                    initial={{ width: "0%" }}
                    animate={{ width: "100%" }}
                    transition={{ duration: 0.5, ease: "easeOut" }}
                    className="absolute inset-y-0 left-0 bg-success rounded-full"
                  />
                )}
                {stage.status === "active" && (
                  <motion.div
                    animate={{ x: ["-100%", "200%"] }}
                    transition={{
                      duration: 1.5,
                      repeat: Infinity,
                      ease: "easeInOut",
                    }}
                    className="absolute inset-y-0 left-0 w-1/3 bg-accent-savanna rounded-full"
                  />
                )}
              </div>
            )}
          </React.Fragment>
        ))}
      </div>

      {/* Overall progress bar */}
      <div className="space-y-1.5">
        <div className="flex justify-between text-xs">
          <span className="text-ev-warm-gray">Overall Progress</span>
          <span className="text-ev-elephant font-mono">
            {Math.round(progress)}%
          </span>
        </div>
        <div className="h-1.5 bg-background-elevated rounded-full overflow-hidden">
          <motion.div
            initial={{ width: "0%" }}
            animate={{ width: `${progress}%` }}
            transition={{ duration: 0.5, ease: "easeOut" }}
            className="h-full rounded-full bg-gradient-to-r from-accent-savanna to-success"
          />
        </div>
      </div>
    </div>
  );
}
