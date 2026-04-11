"use client";

import React from "react";

interface AudioControlsProps {
  volume: number;
  onVolumeChange: (volume: number) => void;
  playbackRate: number;
  onPlaybackRateChange: (rate: number) => void;
  onDownload: () => void;
}

const SPEED_OPTIONS = [0.5, 1, 1.5, 2];

export default function AudioControls({
  volume,
  onVolumeChange,
  playbackRate,
  onPlaybackRateChange,
  onDownload,
}: AudioControlsProps) {
  return (
    <div className="flex items-center gap-4 px-4 py-2 rounded-lg bg-echofield-surface border border-echofield-border">
      {/* Volume control */}
      <div className="flex items-center gap-2">
        <button
          onClick={() => onVolumeChange(volume > 0 ? 0 : 0.8)}
          className="text-echofield-text-muted hover:text-echofield-text-primary transition-colors"
          aria-label={volume > 0 ? "Mute" : "Unmute"}
        >
          <svg
            width="16"
            height="16"
            viewBox="0 0 16 16"
            fill="none"
          >
            {volume === 0 ? (
              <>
                <path d="M3 6H1V10H3L7 13V3L3 6Z" fill="currentColor" />
                <path
                  d="M11 5L14 8M14 5L11 8"
                  stroke="currentColor"
                  strokeWidth="1.5"
                  strokeLinecap="round"
                />
              </>
            ) : (
              <>
                <path d="M3 6H1V10H3L7 13V3L3 6Z" fill="currentColor" />
                <path
                  d="M10 4C11.3 5.3 12 7 12 8C12 9 11.3 10.7 10 12"
                  stroke="currentColor"
                  strokeWidth="1.5"
                  strokeLinecap="round"
                />
              </>
            )}
          </svg>
        </button>
        <input
          type="range"
          min={0}
          max={1}
          step={0.01}
          value={volume}
          onChange={(e) => onVolumeChange(parseFloat(e.target.value))}
          className="w-20 h-1 rounded-full appearance-none cursor-pointer"
          style={{
            background: `linear-gradient(to right, #00D9FF ${volume * 100}%, #2A3A42 ${volume * 100}%)`,
          }}
          aria-label="Volume"
        />
      </div>

      {/* Divider */}
      <div className="w-px h-5 bg-echofield-border" />

      {/* Playback speed */}
      <div className="flex items-center gap-1">
        <span className="text-[10px] text-echofield-text-muted uppercase tracking-wide mr-1">
          Speed
        </span>
        {SPEED_OPTIONS.map((rate) => (
          <button
            key={rate}
            onClick={() => onPlaybackRateChange(rate)}
            className={`px-2 py-0.5 rounded text-xs font-medium transition-colors ${
              playbackRate === rate
                ? "bg-accent-teal/20 text-accent-teal"
                : "text-echofield-text-muted hover:text-echofield-text-secondary"
            }`}
          >
            {rate}x
          </button>
        ))}
      </div>

      {/* Divider */}
      <div className="w-px h-5 bg-echofield-border" />

      {/* Download button */}
      <button
        onClick={onDownload}
        className="flex items-center gap-1.5 px-3 py-1 rounded text-xs font-medium text-echofield-text-secondary hover:text-echofield-text-primary border border-echofield-border hover:border-echofield-text-muted transition-colors"
        aria-label="Download audio"
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
      </button>
    </div>
  );
}
