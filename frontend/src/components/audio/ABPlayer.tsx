"use client";

import React, {
  useRef,
  useState,
  useEffect,
  useCallback,
} from "react";

export interface ABPlayerProps {
  originalSrc: string;
  cleanedSrc: string;
  beforeSpectrogramSrc: string;
  afterSpectrogramSrc: string;
}

type Mode = "original" | "cleaned";

function formatTime(seconds: number): string {
  if (!isFinite(seconds) || isNaN(seconds)) return "0:00";
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${s.toString().padStart(2, "0")}`;
}

export default function ABPlayer({
  originalSrc,
  cleanedSrc,
  beforeSpectrogramSrc,
  afterSpectrogramSrc,
}: ABPlayerProps) {
  const [mode, setMode] = useState<Mode>("original");
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [volume, setVolume] = useState(0.8);

  const originalRef = useRef<HTMLAudioElement>(null);
  const cleanedRef = useRef<HTMLAudioElement>(null);

  // Active/inactive audio refs for convenience
  const activeAudio = useCallback(
    () => (mode === "original" ? originalRef.current : cleanedRef.current),
    [mode]
  );
  const inactiveAudio = useCallback(
    () => (mode === "original" ? cleanedRef.current : originalRef.current),
    [mode]
  );

  // Sync timeupdate + metadata events from both audio elements
  useEffect(() => {
    const orig = originalRef.current;
    const cln = cleanedRef.current;
    if (!orig || !cln) return;

    const onTimeUpdate = () => {
      const active = mode === "original" ? orig : cln;
      setCurrentTime(active.currentTime);
    };

    const onLoadedMetadata = () => {
      const active = mode === "original" ? orig : cln;
      if (isFinite(active.duration)) setDuration(active.duration);
    };

    const onEnded = () => setIsPlaying(false);

    orig.addEventListener("timeupdate", onTimeUpdate);
    cln.addEventListener("timeupdate", onTimeUpdate);
    orig.addEventListener("loadedmetadata", onLoadedMetadata);
    cln.addEventListener("loadedmetadata", onLoadedMetadata);
    orig.addEventListener("ended", onEnded);
    cln.addEventListener("ended", onEnded);

    return () => {
      orig.removeEventListener("timeupdate", onTimeUpdate);
      cln.removeEventListener("timeupdate", onTimeUpdate);
      orig.removeEventListener("loadedmetadata", onLoadedMetadata);
      cln.removeEventListener("loadedmetadata", onLoadedMetadata);
      orig.removeEventListener("ended", onEnded);
      cln.removeEventListener("ended", onEnded);
    };
  }, [mode]);

  // Keep volume in sync
  useEffect(() => {
    if (originalRef.current) originalRef.current.volume = volume;
    if (cleanedRef.current) cleanedRef.current.volume = volume;
  }, [volume]);

  // Toggle A/B mode — preserve playback position
  const toggle = useCallback(() => {
    const active = activeAudio();
    const inactive = inactiveAudio();
    if (!active || !inactive) return;

    // Sync position
    inactive.currentTime = active.currentTime;

    if (isPlaying) {
      active.pause();
      inactive.play().catch(() => {});
    }

    setMode((prev) => (prev === "original" ? "cleaned" : "original"));
  }, [activeAudio, inactiveAudio, isPlaying]);

  // Keyboard shortcut — 'A' key
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement)?.tagName;
      const isInput =
        tag === "INPUT" ||
        tag === "TEXTAREA" ||
        tag === "SELECT" ||
        (e.target as HTMLElement)?.isContentEditable;
      if (isInput) return;
      if (e.key === "a" || e.key === "A") {
        toggle();
      }
    };
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [toggle]);

  const togglePlay = useCallback(() => {
    const audio = activeAudio();
    if (!audio) return;
    if (isPlaying) {
      audio.pause();
      setIsPlaying(false);
    } else {
      audio.play().catch(() => {});
      setIsPlaying(true);
    }
  }, [activeAudio, isPlaying]);

  const handleSeek = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const time = parseFloat(e.target.value);
      if (originalRef.current) originalRef.current.currentTime = time;
      if (cleanedRef.current) cleanedRef.current.currentTime = time;
      setCurrentTime(time);
    },
    []
  );

  const handleVolumeChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      setVolume(parseFloat(e.target.value));
    },
    []
  );

  const progress = duration > 0 ? (currentTime / duration) * 100 : 0;
  const playheadPct = `${progress}%`;

  const accentColor = mode === "original" ? "#C4605A" : "#5A9E6F";
  const isOriginal = mode === "original";

  return (
    <div className="rounded-2xl border border-ev-sand bg-ev-cream overflow-hidden shadow-lg shadow-accent-savanna/5">
      {/* Hidden audio elements */}
      <audio ref={originalRef} src={originalSrc} preload="metadata" />
      <audio ref={cleanedRef} src={cleanedSrc} preload="metadata" />

      {/* Spectrogram crossfade */}
      <div className="relative w-full overflow-hidden" style={{ aspectRatio: "3/1", minHeight: 100 }}>
        {/* Before (original) spectrogram */}
        <div
          data-spectrogram="before"
          className="absolute inset-0 transition-opacity duration-200"
          style={{ opacity: isOriginal ? 1 : 0 }}
        >
          <img
            src={beforeSpectrogramSrc}
            alt="Before — original recording spectrogram"
            className="w-full h-full object-cover"
            draggable={false}
          />
        </div>

        {/* After (cleaned) spectrogram */}
        <div
          data-spectrogram="after"
          className="absolute inset-0 transition-opacity duration-200"
          style={{ opacity: isOriginal ? 0 : 1 }}
        >
          <img
            src={afterSpectrogramSrc}
            alt="After — cleaned recording spectrogram"
            className="w-full h-full object-cover"
            draggable={false}
          />
        </div>

        {/* Playhead indicator */}
        <div
          data-playhead
          className="absolute top-0 bottom-0 w-0.5 z-20 pointer-events-none"
          style={{
            left: playheadPct,
            backgroundColor: accentColor,
            opacity: 0.85,
            transition: "left 0.1s linear",
            boxShadow: `0 0 6px 1px ${accentColor}55`,
          }}
        />

        {/* Mode badge overlay */}
        <div className="absolute top-2 left-2 z-30">
          <span
            className="px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-widest text-white"
            style={{ backgroundColor: `${accentColor}cc` }}
          >
            {isOriginal ? "Before" : "After"}
          </span>
        </div>
      </div>

      {/* Player controls area */}
      <div className="p-4 space-y-3">
        {/* A/B toggle + mode label */}
        <div className="flex items-center justify-between gap-3">
          {/* Toggle button */}
          <button
            onClick={toggle}
            aria-label={isOriginal ? "Original" : "Cleaned"}
            className="group relative flex items-center h-8 rounded-full p-0.5 transition-all duration-200 focus:outline-none focus-visible:ring-2 focus-visible:ring-accent-savanna"
            style={{
              backgroundColor: isOriginal ? "#f5ede4" : "#e4f0e8",
              border: `1.5px solid ${accentColor}55`,
              minWidth: 140,
            }}
          >
            {/* Pill */}
            <div
              className="absolute h-7 rounded-full transition-all duration-200 z-0"
              style={{
                width: "50%",
                left: isOriginal ? "2px" : "calc(50% - 2px)",
                backgroundColor: accentColor,
                opacity: 0.18,
              }}
            />
            {/* A side */}
            <span
              className="relative z-10 flex-1 flex items-center justify-center gap-1 text-xs font-semibold transition-colors duration-200"
              style={{ color: isOriginal ? accentColor : "#9B8E82" }}
            >
              <span
                className="inline-flex items-center justify-center w-4 h-4 rounded-full text-[9px] font-bold"
                style={{
                  backgroundColor: isOriginal ? accentColor : "transparent",
                  color: isOriginal ? "#fff" : "#9B8E82",
                  border: isOriginal ? "none" : "1.5px solid #9B8E82",
                }}
              >
                A
              </span>
              Original
            </span>
            {/* B side */}
            <span
              className="relative z-10 flex-1 flex items-center justify-center gap-1 text-xs font-semibold transition-colors duration-200"
              style={{ color: !isOriginal ? accentColor : "#9B8E82" }}
            >
              <span
                className="inline-flex items-center justify-center w-4 h-4 rounded-full text-[9px] font-bold"
                style={{
                  backgroundColor: !isOriginal ? accentColor : "transparent",
                  color: !isOriginal ? "#fff" : "#9B8E82",
                  border: !isOriginal ? "none" : "1.5px solid #9B8E82",
                }}
              >
                B
              </span>
              Cleaned
            </span>
          </button>

          {/* Keyboard hint */}
          <span className="text-[10px] text-ev-warm-gray hidden sm:inline-flex items-center gap-1">
            <kbd className="px-1.5 py-0.5 rounded border border-ev-sand bg-white text-ev-elephant font-mono text-[9px]">
              A
            </kbd>
            to switch
          </span>
        </div>

        {/* Waveform bar */}
        <div className="relative h-10 bg-ev-sand/20 rounded overflow-hidden">
          <div className="absolute inset-0 flex items-center gap-px px-1">
            {Array.from({ length: 60 }, (_, i) => {
              const height = 20 + Math.sin(i * 0.5) * 25 + Math.sin(i * 0.2) * 15;
              const filled = (i / 60) * 100 < progress;
              return (
                <div
                  key={i}
                  className="flex-1 rounded-sm"
                  style={{
                    height: `${height}%`,
                    backgroundColor: filled ? accentColor : "rgba(138,155,165,0.22)",
                  }}
                />
              );
            })}
          </div>
        </div>

        {/* Seek + time */}
        <div className="flex items-center gap-3">
          {/* Play/Pause */}
          <button
            onClick={togglePlay}
            aria-label={isPlaying ? "Pause" : "Play"}
            className="w-9 h-9 rounded-full flex items-center justify-center shrink-0 transition-all hover:scale-105 active:scale-95"
            style={{ backgroundColor: accentColor }}
          >
            {isPlaying ? (
              <svg width="14" height="14" viewBox="0 0 16 16" fill="none" className="text-white">
                <rect x="3" y="2" width="4" height="12" rx="1" fill="currentColor" />
                <rect x="9" y="2" width="4" height="12" rx="1" fill="currentColor" />
              </svg>
            ) : (
              <svg width="14" height="14" viewBox="0 0 16 16" fill="none" className="text-white">
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
            style={{
              background: `linear-gradient(to right, ${accentColor} ${progress}%, #D4CCC3 ${progress}%)`,
            }}
          />

          {/* Time */}
          <span className="text-xs text-ev-elephant font-mono whitespace-nowrap min-w-[70px] text-right">
            {formatTime(currentTime)} / {formatTime(duration)}
          </span>
        </div>

        {/* Volume */}
        <div className="flex items-center gap-2">
          <svg width="15" height="15" viewBox="0 0 16 16" fill="none" className="text-ev-warm-gray shrink-0">
            <path d="M3 6H1V10H3L7 13V3L3 6Z" fill="currentColor" />
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
      </div>
    </div>
  );
}
