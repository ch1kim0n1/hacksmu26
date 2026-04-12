"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import { motion } from "framer-motion";
import { Play, Pause, Volume2, VolumeX, Download } from "lucide-react";

interface DarkAudioPlayerProps {
  src: string;
  label?: string;
  accentColor?: string;
  onTimeUpdate?: (time: number) => void;
  seekTo?: number;
  className?: string;
}

export default function DarkAudioPlayer({
  src,
  label,
  accentColor = "#C4A46C",
  onTimeUpdate,
  seekTo,
  className = "",
}: DarkAudioPlayerProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const wavesurferRef = useRef<any>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [volume, setVolume] = useState(0.8);
  const [isMuted, setIsMuted] = useState(false);
  const [isReady, setIsReady] = useState(false);

  // Initialize wavesurfer
  useEffect(() => {
    if (!containerRef.current) return;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let ws: any = null;

    const initWaveSurfer = async () => {
      const WaveSurfer = (await import("wavesurfer.js")).default;
      if (!containerRef.current) return;

      ws = WaveSurfer.create({
        container: containerRef.current,
        waveColor: `${accentColor}50`,
        progressColor: accentColor,
        cursorColor: accentColor,
        cursorWidth: 2,
        barWidth: 2,
        barGap: 1,
        barRadius: 2,
        height: 48,
        normalize: true,
      });

      ws.load(src);

      ws.on("ready", () => {
        setDuration(ws.getDuration());
        setIsReady(true);
        ws.setVolume(volume);
      });

      ws.on("audioprocess", () => {
        const t = ws.getCurrentTime();
        setCurrentTime(t);
        onTimeUpdate?.(t);
      });

      ws.on("seeking", () => {
        const t = ws.getCurrentTime();
        setCurrentTime(t);
        onTimeUpdate?.(t);
      });

      ws.on("play", () => setIsPlaying(true));
      ws.on("pause", () => setIsPlaying(false));
      ws.on("finish", () => setIsPlaying(false));

      wavesurferRef.current = ws;
    };

    initWaveSurfer();

    return () => {
      if (ws) {
        ws.destroy();
      }
    };
  }, [src]); // eslint-disable-line react-hooks/exhaustive-deps

  // External seek
  useEffect(() => {
    if (seekTo !== undefined && wavesurferRef.current && duration > 0) {
      wavesurferRef.current.seekTo(Math.max(0, Math.min(1, seekTo / duration)));
    }
  }, [seekTo, duration]);

  // Volume sync
  useEffect(() => {
    if (wavesurferRef.current) {
      wavesurferRef.current.setVolume(isMuted ? 0 : volume);
    }
  }, [volume, isMuted]);

  const togglePlay = useCallback(() => {
    wavesurferRef.current?.playPause();
  }, []);

  const toggleMute = useCallback(() => {
    setIsMuted((m) => !m);
  }, []);

  const formatTime = (t: number) => {
    const m = Math.floor(t / 60);
    const s = Math.floor(t % 60);
    return `${m}:${String(s).padStart(2, "0")}`;
  };

  return (
    <div className={`rounded-xl border border-white/[0.06] bg-dark-surface overflow-hidden ${className}`}>
      {/* Label */}
      {label && (
        <div className="flex items-center gap-2 px-4 py-2 border-b border-white/[0.06]">
          <div className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: accentColor }} />
          <span className="text-xs font-medium text-dark-text-secondary">{label}</span>
        </div>
      )}

      {/* Waveform */}
      <div className="px-4 py-3">
        <div ref={containerRef} className="w-full" />
        {!isReady && (
          <div className="h-12 bg-dark-surface-elevated rounded animate-pulse" />
        )}
      </div>

      {/* Controls */}
      <div className="flex items-center gap-3 px-4 py-2.5 border-t border-white/[0.06]">
        {/* Play/Pause */}
        <motion.button
          whileHover={{ scale: 1.05 }}
          whileTap={{ scale: 0.95 }}
          onClick={togglePlay}
          disabled={!isReady}
          className="w-9 h-9 rounded-full flex items-center justify-center transition-colors disabled:opacity-30"
          style={{ backgroundColor: accentColor }}
          aria-label={isPlaying ? "Pause" : "Play"}
        >
          {isPlaying ? (
            <Pause className="w-4 h-4 text-white" fill="white" />
          ) : (
            <Play className="w-4 h-4 text-white ml-0.5" fill="white" />
          )}
        </motion.button>

        {/* Time */}
        <span className="text-xs font-mono text-dark-text-secondary tabular-nums min-w-[72px]">
          {formatTime(currentTime)} / {formatTime(duration)}
        </span>

        <div className="flex-1" />

        {/* Volume */}
        <button onClick={toggleMute} className="text-dark-text-muted hover:text-dark-text-secondary transition-colors" aria-label={isMuted ? "Unmute" : "Mute"}>
          {isMuted || volume === 0 ? (
            <VolumeX className="w-4 h-4" />
          ) : (
            <Volume2 className="w-4 h-4" />
          )}
        </button>
        <input
          type="range"
          min={0}
          max={1}
          step={0.01}
          value={isMuted ? 0 : volume}
          onChange={(e) => { setVolume(parseFloat(e.target.value)); setIsMuted(false); }}
          className="w-16 h-1 appearance-none bg-dark-surface-overlay rounded-full [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-3 [&::-webkit-slider-thumb]:h-3 [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:cursor-pointer"
          style={{
            background: `linear-gradient(to right, ${accentColor} ${(isMuted ? 0 : volume) * 100}%, #232930 ${(isMuted ? 0 : volume) * 100}%)`,
          }}
          aria-label="Volume"
        />

        {/* Download */}
        <a
          href={src}
          download
          className="text-dark-text-muted hover:text-dark-text-secondary transition-colors"
          aria-label="Download"
        >
          <Download className="w-4 h-4" />
        </a>
      </div>
    </div>
  );
}
