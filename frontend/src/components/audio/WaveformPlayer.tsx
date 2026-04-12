"use client";

import React, { useRef, useState, useEffect, useCallback } from "react";

const BAR_COUNT = 80;

/** Decode audio via Web Audio API and return normalised per-bar amplitudes [0,1]. */
async function decodeWaveformBars(src: string, bars: number): Promise<number[]> {
  try {
    const Ctx = window.AudioContext ?? (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    if (!Ctx) throw new Error("No AudioContext");
    const ctx = new Ctx();
    const response = await fetch(src);
    if (!response.ok) throw new Error("Fetch failed");
    const arrayBuffer = await response.arrayBuffer();
    const audioBuffer = await ctx.decodeAudioData(arrayBuffer);
    ctx.close();

    // Mix all channels down to mono and sample into `bars` buckets
    const channelCount = audioBuffer.numberOfChannels;
    const frameCount = audioBuffer.length;
    const frameStep = Math.max(1, Math.floor(frameCount / bars));
    const result: number[] = [];

    for (let b = 0; b < bars; b++) {
      const start = b * frameStep;
      const end = Math.min(start + frameStep, frameCount);
      let sum = 0;
      for (let ch = 0; ch < channelCount; ch++) {
        const data = audioBuffer.getChannelData(ch);
        for (let i = start; i < end; i++) {
          sum += Math.abs(data[i]);
        }
      }
      result.push(sum / ((end - start) * channelCount));
    }

    const peak = Math.max(...result, 1e-6);
    return result.map((v) => v / peak);
  } catch {
    // Fallback: deterministic pseudo-random bars (no Math.random so they're stable)
    return Array.from({ length: bars }, (_, i) =>
      0.15 + 0.7 * Math.abs(Math.sin(i * 1.3) * Math.cos(i * 0.7))
    );
  }
}

interface WaveformPlayerProps {
  src: string;
  label?: string;
  accentColor?: string;
}

function formatTime(seconds: number): string {
  if (!isFinite(seconds) || isNaN(seconds)) return "0:00";
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${s.toString().padStart(2, "0")}`;
}

export default function WaveformPlayer({
  src,
  label,
  accentColor = "#C4A46C",
}: WaveformPlayerProps) {
  const audioRef = useRef<HTMLAudioElement>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [volume, setVolume] = useState(0.8);
  const [waveformBars, setWaveformBars] = useState<number[]>(() =>
    Array.from({ length: BAR_COUNT }, (_, i) =>
      0.15 + 0.7 * Math.abs(Math.sin(i * 1.3) * Math.cos(i * 0.7))
    )
  );

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;

    const onTimeUpdate = () => setCurrentTime(audio.currentTime);
    const onLoadedMetadata = () => setDuration(audio.duration);
    const onEnded = () => setIsPlaying(false);

    audio.addEventListener("timeupdate", onTimeUpdate);
    audio.addEventListener("loadedmetadata", onLoadedMetadata);
    audio.addEventListener("ended", onEnded);

    return () => {
      audio.removeEventListener("timeupdate", onTimeUpdate);
      audio.removeEventListener("loadedmetadata", onLoadedMetadata);
      audio.removeEventListener("ended", onEnded);
    };
  }, []);

  // Decode real audio waveform on mount / src change
  useEffect(() => {
    let cancelled = false;
    decodeWaveformBars(src, BAR_COUNT).then((bars) => {
      if (!cancelled) setWaveformBars(bars);
    });
    return () => { cancelled = true; };
  }, [src]);

  useEffect(() => {
    if (audioRef.current) {
      audioRef.current.volume = volume;
    }
  }, [volume]);

  const togglePlay = useCallback(() => {
    const audio = audioRef.current;
    if (!audio) return;
    if (isPlaying) {
      audio.pause();
    } else {
      audio.play();
    }
    setIsPlaying(!isPlaying);
  }, [isPlaying]);

  const handleSeek = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const time = parseFloat(e.target.value);
    if (audioRef.current) {
      audioRef.current.currentTime = time;
    }
    setCurrentTime(time);
  }, []);

  const handleVolumeChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      setVolume(parseFloat(e.target.value));
    },
    []
  );

  const progress = duration > 0 ? (currentTime / duration) * 100 : 0;

  return (
    <div className="rounded-lg border border-ev-sand bg-ev-cream p-4 space-y-3">
      <audio ref={audioRef} src={src} preload="metadata" />

      {/* Label */}
      {label && (
        <div className="flex items-center gap-2">
          <div
            className="w-2 h-2 rounded-full"
            style={{ backgroundColor: accentColor }}
          />
          <span className="text-sm font-medium text-ev-charcoal">
            {label}
          </span>
        </div>
      )}

      {/* Waveform — real amplitude bars decoded from audio */}
      <div className="relative h-16 bg-background-elevated rounded-lg overflow-hidden">
        <div
          data-testid="waveform-bars"
          className="absolute inset-0 flex items-center gap-px px-1"
        >
          {waveformBars.map((amplitude, i) => {
            const played = (i / BAR_COUNT) * 100 < progress;
            const barH = Math.max(4, amplitude * 100);
            return (
              <div
                key={i}
                className="flex-1 rounded-sm transition-colors duration-75"
                style={{
                  height: `${barH}%`,
                  backgroundColor: played
                    ? accentColor
                    : "rgba(138, 155, 165, 0.3)",
                }}
              />
            );
          })}
        </div>
        {/* Hover-seekable overlay */}
        <input
          type="range"
          min={0}
          max={duration || 0}
          step={0.01}
          value={currentTime}
          onChange={handleSeek}
          className="absolute inset-0 w-full opacity-0 cursor-pointer"
          aria-label="Seek audio"
        />
      </div>

      {/* Controls row */}
      <div className="flex items-center gap-3">
        {/* Play/Pause button */}
        <button
          onClick={togglePlay}
          className="w-10 h-10 rounded-full flex items-center justify-center shrink-0 transition-all hover:scale-105 active:scale-95"
          style={{ backgroundColor: accentColor }}
          aria-label={isPlaying ? "Pause" : "Play"}
        >
          {isPlaying ? (
            <svg
              width="16"
              height="16"
              viewBox="0 0 16 16"
              fill="none"
              className="text-ev-ivory"
            >
              <rect
                x="3"
                y="2"
                width="4"
                height="12"
                rx="1"
                fill="currentColor"
              />
              <rect
                x="9"
                y="2"
                width="4"
                height="12"
                rx="1"
                fill="currentColor"
              />
            </svg>
          ) : (
            <svg
              width="16"
              height="16"
              viewBox="0 0 16 16"
              fill="none"
              className="text-ev-ivory"
            >
              <path d="M4 2L14 8L4 14V2Z" fill="currentColor" />
            </svg>
          )}
        </button>

        {/* Progress indicator (read-only — seek via waveform) */}
        <div className="flex-1 h-1 rounded-full overflow-hidden bg-ev-sand/50">
          <div
            className="h-full rounded-full transition-none"
            style={{ width: `${progress}%`, backgroundColor: accentColor }}
          />
        </div>

        {/* Time display */}
        <span className="text-xs text-ev-elephant font-mono whitespace-nowrap min-w-[70px] text-right">
          {formatTime(currentTime)} / {formatTime(duration)}
        </span>
      </div>

      {/* Volume and download row */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          {/* Volume icon */}
          <svg
            width="16"
            height="16"
            viewBox="0 0 16 16"
            fill="none"
            className="text-ev-warm-gray shrink-0"
          >
            <path
              d="M3 6H1V10H3L7 13V3L3 6Z"
              fill="currentColor"
            />
            <path
              d="M10 4C11.3 5.3 12 7 12 8C12 9 11.3 10.7 10 12"
              stroke="currentColor"
              strokeWidth="1.5"
              strokeLinecap="round"
            />
          </svg>
          <input
            type="range"
            min={0}
            max={1}
            step={0.01}
            value={volume}
            onChange={handleVolumeChange}
            className="w-20 h-1 rounded-full appearance-none cursor-pointer"
            style={{
              background: `linear-gradient(to right, ${accentColor} ${volume * 100}%, #D4CCC3 ${volume * 100}%)`,
            }}
          />
        </div>

        {/* Download button */}
        <a
          href={src}
          download
          className="flex items-center gap-1.5 px-3 py-1.5 rounded text-xs font-medium text-ev-elephant hover:text-ev-charcoal border border-ev-sand hover:border-ev-warm-gray transition-colors"
        >
          <svg
            width="14"
            height="14"
            viewBox="0 0 14 14"
            fill="none"
            className="shrink-0"
          >
            <path
              d="M7 1V9M7 9L4 6M7 9L10 6M1 11V12C1 12.6 1.4 13 2 13H12C12.6 13 13 12.6 13 12V11"
              stroke="currentColor"
              strokeWidth="1.5"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
          Download
        </a>
      </div>
    </div>
  );
}
