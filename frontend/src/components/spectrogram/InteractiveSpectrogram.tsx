"use client";

import { useState, useRef, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";

interface CallRegion {
  startTime: number;
  endTime: number;
  freqLow: number;
  freqHigh: number;
  label: string;
  color: string;
}

interface InteractiveSpectrogramProps {
  src: string;
  duration: number;
  maxFrequency?: number;
  currentTime?: number;
  onSeek?: (time: number) => void;
  isPlaying?: boolean;
  callRegions?: CallRegion[];
  label?: string;
  className?: string;
}

export default function InteractiveSpectrogram({
  src,
  duration,
  maxFrequency = 1000,
  currentTime = 0,
  onSeek,
  isPlaying = false,
  callRegions = [],
  label,
  className = "",
}: InteractiveSpectrogramProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [mousePos, setMousePos] = useState<{ x: number; y: number } | null>(null);
  const [clickPulse, setClickPulse] = useState<{ x: number; y: number } | null>(null);
  const [imageLoaded, setImageLoaded] = useState(false);

  const handleMouseMove = useCallback(
    (e: React.MouseEvent<HTMLDivElement>) => {
      if (!containerRef.current) return;
      const rect = containerRef.current.getBoundingClientRect();
      setMousePos({
        x: ((e.clientX - rect.left) / rect.width) * 100,
        y: ((e.clientY - rect.top) / rect.height) * 100,
      });
    },
    [],
  );

  const handleMouseLeave = useCallback(() => {
    setMousePos(null);
  }, []);

  const handleClick = useCallback(
    (e: React.MouseEvent<HTMLDivElement>) => {
      if (!containerRef.current || !onSeek) return;
      const rect = containerRef.current.getBoundingClientRect();
      const xPct = (e.clientX - rect.left) / rect.width;
      const time = xPct * duration;
      onSeek(Math.max(0, Math.min(duration, time)));
      setClickPulse({ x: xPct * 100, y: ((e.clientY - rect.top) / rect.height) * 100 });
      setTimeout(() => setClickPulse(null), 400);
    },
    [onSeek, duration],
  );

  const playheadPct = duration > 0 ? (currentTime / duration) * 100 : 0;
  const cursorTime = mousePos ? (mousePos.x / 100) * duration : 0;
  const cursorFreq = mousePos ? maxFrequency * (1 - mousePos.y / 100) : 0;

  // 20 Hz line position (infrasound threshold)
  const infrasoundLinePct = maxFrequency > 0 ? (1 - 20 / maxFrequency) * 100 : 100;

  return (
    <div className={`rounded-xl overflow-hidden border border-white/[0.06] bg-[#0C1A2A] spectrogram-hero ${className}`}>
      {/* Label */}
      {label && (
        <div className="flex items-center justify-between px-4 py-2.5 border-b border-white/[0.06]">
          <span className="text-xs font-medium text-dark-text-secondary uppercase tracking-wider">{label}</span>
          <div className="flex items-center gap-1.5">
            <div className="w-2 h-2 rounded-full bg-gradient-to-r from-[#0C1A2A] to-[#00D9FF]" />
            <div className="w-2 h-2 rounded-full bg-gradient-to-r from-[#00D9FF] to-[#FFD700]" />
            <div className="w-2 h-2 rounded-full bg-gradient-to-r from-[#FFD700] to-[#EF4444]" />
            <span className="text-[10px] text-dark-text-muted ml-1">Energy</span>
          </div>
        </div>
      )}

      {/* Spectrogram container */}
      <div
        ref={containerRef}
        className="relative w-full aspect-[3/1] cursor-instrument select-none"
        onMouseMove={handleMouseMove}
        onMouseLeave={handleMouseLeave}
        onClick={handleClick}
      >
        {/* Spectrogram image */}
        <img
          src={src}
          alt="Spectrogram"
          className={`absolute inset-0 w-full h-full object-cover transition-opacity duration-300 ${imageLoaded ? "opacity-100" : "opacity-0"}`}
          draggable={false}
          onLoad={() => setImageLoaded(true)}
        />

        {/* Loading skeleton */}
        {!imageLoaded && (
          <div className="absolute inset-0 bg-dark-surface animate-pulse flex items-center justify-center">
            <svg className="w-8 h-8 text-dark-text-muted/30" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1} d="M9 19V6l12-3v13M9 19c0 1.105-1.343 2-3 2s-3-.895-3-2 1.343-2 3-2 3 .895 3 2zm12-3c0 1.105-1.343 2-3 2s-3-.895-3-2 1.343-2 3-2 3 .895 3 2zM9 10l12-3" />
            </svg>
          </div>
        )}

        {/* Infrasound threshold line (20 Hz) */}
        {maxFrequency >= 20 && (
          <div
            className="absolute left-0 right-0 pointer-events-none z-10"
            style={{ top: `${infrasoundLinePct}%` }}
          >
            <div className="w-full border-t border-dashed border-blue-400/30" />
            <span className="absolute right-2 -top-4 text-[9px] text-blue-400/60 font-mono">
              20 Hz — human hearing limit
            </span>
          </div>
        )}

        {/* Infrasound zone tint */}
        {maxFrequency >= 20 && (
          <div
            className="absolute left-0 right-0 bottom-0 pointer-events-none bg-blue-500/[0.04] z-[1]"
            style={{ top: `${infrasoundLinePct}%` }}
          />
        )}

        {/* Call region overlays */}
        {callRegions.map((region, i) => {
          const left = (region.startTime / duration) * 100;
          const width = ((region.endTime - region.startTime) / duration) * 100;
          const top = (1 - region.freqHigh / maxFrequency) * 100;
          const height = ((region.freqHigh - region.freqLow) / maxFrequency) * 100;

          return (
            <div
              key={i}
              className="absolute border rounded-sm pointer-events-none z-10"
              style={{
                left: `${left}%`,
                width: `${width}%`,
                top: `${top}%`,
                height: `${height}%`,
                borderColor: `${region.color}60`,
                backgroundColor: `${region.color}10`,
              }}
            >
              <span
                className="absolute -top-4 left-0 text-[9px] font-medium px-1 rounded"
                style={{ color: region.color, backgroundColor: `${region.color}20` }}
              >
                {region.label}
              </span>
            </div>
          );
        })}

        {/* Crosshair vertical line (time) */}
        {mousePos && (
          <div
            className="absolute top-0 bottom-0 w-px bg-white/20 pointer-events-none z-20"
            style={{ left: `${mousePos.x}%` }}
          />
        )}

        {/* Crosshair horizontal line (frequency) */}
        {mousePos && (
          <div
            className="absolute left-0 right-0 h-px bg-white/20 pointer-events-none z-20"
            style={{ top: `${mousePos.y}%` }}
          />
        )}

        {/* Crosshair tooltip */}
        {mousePos && (
          <div
            className="absolute z-30 pointer-events-none"
            style={{
              left: `${mousePos.x}%`,
              top: `${mousePos.y}%`,
              transform: `translate(${mousePos.x > 80 ? "-110%" : "10%"}, ${mousePos.y > 80 ? "-110%" : "10%"})`,
            }}
          >
            <div className="bg-black/80 backdrop-blur-sm rounded-md px-2 py-1 text-[10px] font-mono text-white whitespace-nowrap border border-white/10">
              {cursorTime.toFixed(2)}s / {Math.round(cursorFreq)} Hz
              {cursorFreq < 20 && (
                <span className="text-blue-400 ml-1">infrasonique</span>
              )}
            </div>
          </div>
        )}

        {/* Playhead */}
        {isPlaying && (
          <div
            className="absolute top-0 bottom-0 w-0.5 bg-accent-savanna pointer-events-none z-20 animate-playhead-glow"
            style={{ left: `${playheadPct}%`, transition: "left 100ms linear" }}
          >
            <div className="absolute -top-1 left-1/2 -translate-x-1/2 w-2 h-2 bg-accent-savanna rounded-full" />
          </div>
        )}

        {/* Click pulse */}
        <AnimatePresence>
          {clickPulse && (
            <motion.div
              className="absolute w-6 h-6 rounded-full border-2 border-accent-savanna pointer-events-none z-30"
              style={{ left: `${clickPulse.x}%`, top: `${clickPulse.y}%`, transform: "translate(-50%, -50%)" }}
              initial={{ scale: 0.5, opacity: 1 }}
              animate={{ scale: 2, opacity: 0 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.4, ease: "easeOut" }}
            />
          )}
        </AnimatePresence>
      </div>

      {/* Time axis */}
      <div className="flex justify-between px-4 py-1.5 border-t border-white/[0.06]">
        <span className="text-[10px] font-mono text-dark-text-muted">0:00</span>
        <span className="text-[10px] font-mono text-dark-text-muted">
          {Math.floor(duration / 60)}:{String(Math.floor(duration % 60)).padStart(2, "0")}
        </span>
      </div>
    </div>
  );
}
