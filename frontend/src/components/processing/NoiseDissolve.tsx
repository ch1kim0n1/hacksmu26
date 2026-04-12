"use client";

import { useState, useCallback } from "react";
import { motion } from "framer-motion";
import { RotateCcw } from "lucide-react";

interface NoiseDissolveProps {
  beforeSrc: string;
  afterSrc: string;
  progress: number; // 0-100
  isActive: boolean;
  className?: string;
}

export default function NoiseDissolve({
  beforeSrc,
  afterSrc,
  progress,
  isActive,
  className = "",
}: NoiseDissolveProps) {
  const [replayProgress, setReplayProgress] = useState<number | null>(null);
  const [isReplaying, setIsReplaying] = useState(false);

  const displayProgress = replayProgress !== null ? replayProgress : progress;
  const dissolveAmount = Math.min(100, Math.max(0, displayProgress));

  const replay = useCallback(() => {
    setIsReplaying(true);
    setReplayProgress(0);
    const startTime = Date.now();
    const duration = 3000; // 3 seconds

    const animate = () => {
      const elapsed = Date.now() - startTime;
      const pct = Math.min(100, (elapsed / duration) * 100);
      setReplayProgress(pct);

      if (pct < 100) {
        requestAnimationFrame(animate);
      } else {
        setIsReplaying(false);
        setTimeout(() => setReplayProgress(null), 500);
      }
    };

    requestAnimationFrame(animate);
  }, []);

  return (
    <div className={`rounded-xl overflow-hidden border border-white/[0.06] bg-[#060D18] ${className}`}>
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-2.5 border-b border-white/[0.06]">
        <div className="flex items-center gap-2">
          <span className="text-xs font-medium text-dark-text-secondary uppercase tracking-wider">
            {isActive ? "Removing Noise" : "Noise Removal"}
          </span>
          {isActive && (
            <span className="inline-flex items-center gap-1 text-[10px] text-accent-savanna bg-accent-savanna/10 px-2 py-0.5 rounded-full">
              <span className="w-1 h-1 rounded-full bg-accent-savanna animate-pulse" />
              {Math.round(dissolveAmount)}%
            </span>
          )}
        </div>
        {!isActive && progress >= 100 && (
          <motion.button
            whileHover={{ scale: 1.05 }}
            whileTap={{ scale: 0.95 }}
            onClick={replay}
            disabled={isReplaying}
            className="flex items-center gap-1.5 text-[10px] text-dark-text-muted hover:text-accent-savanna transition-colors disabled:opacity-50"
          >
            <RotateCcw className="w-3 h-3" />
            Replay
          </motion.button>
        )}
      </div>

      {/* Dissolve visualization */}
      <div className="relative w-full aspect-[3/1]">
        {/* After (clean) — always visible behind */}
        <img
          src={afterSrc}
          alt="Cleaned spectrogram"
          className="absolute inset-0 w-full h-full object-cover"
          draggable={false}
        />

        {/* Before (noisy) — clipped away progressively */}
        <div
          className="absolute inset-0 overflow-hidden transition-[clip-path] duration-700 ease-[cubic-bezier(0.22,1,0.36,1)]"
          style={{
            clipPath: `inset(0 0 0 ${dissolveAmount}%)`,
          }}
        >
          <img
            src={beforeSrc}
            alt="Original spectrogram"
            className="absolute inset-0 w-full h-full object-cover"
            style={{
              filter: dissolveAmount > 0 ? `brightness(${1 - dissolveAmount * 0.004}) saturate(${1 - dissolveAmount * 0.003})` : "none",
            }}
            draggable={false}
          />
        </div>

        {/* Dissolve edge glow */}
        {dissolveAmount > 0 && dissolveAmount < 100 && (
          <div
            className="absolute top-0 bottom-0 w-12 pointer-events-none z-10"
            style={{
              left: `${dissolveAmount}%`,
              transform: "translateX(-50%)",
              background: `linear-gradient(90deg, transparent, rgba(0, 200, 240, 0.12), rgba(212, 170, 92, 0.08), transparent)`,
              filter: "blur(2px)",
            }}
          />
        )}

        {/* Labels */}
        <div className="absolute top-3 left-3 px-2 py-0.5 bg-danger/50 border border-danger/20 backdrop-blur-sm rounded text-[9px] text-white font-medium pointer-events-none z-20">
          Noisy
        </div>
        <div className="absolute top-3 right-3 px-2 py-0.5 bg-success/50 border border-success/20 backdrop-blur-sm rounded text-[9px] text-white font-medium pointer-events-none z-20">
          Clean
        </div>
      </div>
    </div>
  );
}
