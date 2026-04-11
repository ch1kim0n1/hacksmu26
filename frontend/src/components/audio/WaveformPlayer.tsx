"use client";

import React, { useRef, useState, useEffect, useCallback } from "react";

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
  accentColor = "#00D9FF",
}: WaveformPlayerProps) {
  const audioRef = useRef<HTMLAudioElement>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [volume, setVolume] = useState(0.8);

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
    <div className="rounded-lg border border-echofield-border bg-echofield-surface p-4 space-y-3">
      <audio ref={audioRef} src={src} preload="metadata" />

      {/* Label */}
      {label && (
        <div className="flex items-center gap-2">
          <div
            className="w-2 h-2 rounded-full"
            style={{ backgroundColor: accentColor }}
          />
          <span className="text-sm font-medium text-echofield-text-primary">
            {label}
          </span>
        </div>
      )}

      {/* Waveform placeholder bar */}
      <div className="relative h-12 bg-echofield-surface-elevated rounded overflow-hidden">
        {/* Background wave pattern */}
        <div className="absolute inset-0 flex items-center justify-center gap-px px-1">
          {Array.from({ length: 60 }, (_, i) => {
            const height = 20 + Math.sin(i * 0.5) * 30 + Math.random() * 20;
            return (
              <div
                key={i}
                className="flex-1 rounded-sm transition-colors duration-150"
                style={{
                  height: `${height}%`,
                  backgroundColor:
                    (i / 60) * 100 < progress
                      ? accentColor
                      : "rgba(138, 155, 165, 0.25)",
                }}
              />
            );
          })}
        </div>
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
              className="text-echofield-bg"
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
              className="text-echofield-bg"
            >
              <path d="M4 2L14 8L4 14V2Z" fill="currentColor" />
            </svg>
          )}
        </button>

        {/* Seek bar */}
        <input
          type="range"
          min={0}
          max={duration || 0}
          step={0.1}
          value={currentTime}
          onChange={handleSeek}
          className="flex-1 h-1 rounded-full appearance-none cursor-pointer"
          style={
            {
              background: `linear-gradient(to right, ${accentColor} ${progress}%, #2A3A42 ${progress}%)`,
              "--thumb-color": accentColor,
            } as React.CSSProperties
          }
        />

        {/* Time display */}
        <span className="text-xs text-echofield-text-secondary font-mono whitespace-nowrap min-w-[70px] text-right">
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
            className="text-echofield-text-muted shrink-0"
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
              background: `linear-gradient(to right, ${accentColor} ${volume * 100}%, #2A3A42 ${volume * 100}%)`,
            }}
          />
        </div>

        {/* Download button */}
        <a
          href={src}
          download
          className="flex items-center gap-1.5 px-3 py-1.5 rounded text-xs font-medium text-echofield-text-secondary hover:text-echofield-text-primary border border-echofield-border hover:border-echofield-text-muted transition-colors"
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
