"use client";

import React, { useState, useCallback } from "react";
import {
  revealInfrasound,
  getInfrasoundShiftedAudioUrl,
  type InfrasoundRevealResponse,
} from "@/lib/audio-api";

interface InfrasoundRevealProps {
  recordingId: string;
  isComplete: boolean;
}

export default function InfrasoundReveal({
  recordingId,
  isComplete,
}: InfrasoundRevealProps) {
  const [revealData, setRevealData] =
    useState<InfrasoundRevealResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isPlayingShifted, setIsPlayingShifted] = useState(false);
  const audioRef = React.useRef<HTMLAudioElement>(null);

  const handleReveal = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const data = await revealInfrasound(recordingId, {
        shift_octaves: 3,
        mix_mode: "shifted_only",
      });
      setRevealData(data);
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Failed to analyze infrasound"
      );
    } finally {
      setLoading(false);
    }
  }, [recordingId]);

  const togglePlay = useCallback(() => {
    const audio = audioRef.current;
    if (!audio) return;
    if (isPlayingShifted) {
      audio.pause();
    } else {
      audio.play();
    }
    setIsPlayingShifted(!isPlayingShifted);
  }, [isPlayingShifted]);

  if (!isComplete) return null;

  return (
    <div className="p-5 rounded-xl bg-gradient-to-br from-purple-500/5 via-white/50 to-indigo-500/5 border border-purple-200/40">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl bg-purple-500/10 flex items-center justify-center">
            <svg
              className="w-5 h-5 text-purple-600"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={1.5}
                d="M19.114 5.636a9 9 0 010 12.728M16.463 8.288a5.25 5.25 0 010 7.424M6.75 8.25l4.72-4.72a.75.75 0 011.28.53v15.88a.75.75 0 01-1.28.53l-4.72-4.72H4.51c-.88 0-1.704-.507-1.938-1.354A9.01 9.01 0 012.25 12c0-.83.112-1.633.322-2.396C2.806 8.756 3.63 8.25 4.51 8.25H6.75z"
              />
            </svg>
          </div>
          <div>
            <h3 className="text-sm font-semibold text-ev-charcoal">
              Hear the Unhearable
            </h3>
            <p className="text-[11px] text-ev-warm-gray">
              Detect &amp; pitch-shift elephant infrasound into audible range
            </p>
          </div>
        </div>
      </div>

      {!revealData && !loading && (
        <div className="text-center py-6">
          <p className="text-xs text-ev-elephant mb-4 max-w-md mx-auto">
            Elephants communicate using infrasound (8–20Hz) — frequencies below
            human hearing that travel up to 10km across the savanna. Click below
            to shift these hidden vocalizations into your audible range.
          </p>
          <button
            onClick={handleReveal}
            className="inline-flex items-center gap-2 px-6 py-3 bg-purple-600 text-white text-sm font-semibold rounded-xl hover:bg-purple-700 transition-all hover:scale-[1.02] active:scale-[0.98] shadow-lg shadow-purple-500/20"
          >
            <svg
              className="w-4 h-4"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M15.536 8.464a5 5 0 010 7.072M17.95 6.05a8 8 0 010 11.9M6.75 8.25l4.72-4.72a.75.75 0 011.28.53v15.88a.75.75 0 01-1.28.53l-4.72-4.72H4.51c-.88 0-1.704-.507-1.938-1.354A9.01 9.01 0 012.25 12c0-.83.112-1.633.322-2.396C2.806 8.756 3.63 8.25 4.51 8.25H6.75z"
              />
            </svg>
            Reveal Infrasound
          </button>
        </div>
      )}

      {loading && (
        <div className="flex flex-col items-center gap-3 py-8">
          <div className="w-8 h-8 border-2 border-purple-500 border-t-transparent rounded-full animate-spin" />
          <p className="text-sm text-purple-600 font-medium">
            Analyzing infrasound content...
          </p>
          <p className="text-xs text-ev-warm-gray">
            Detecting sub-20Hz frequencies and pitch-shifting +3 octaves
          </p>
        </div>
      )}

      {error && (
        <div className="p-3 rounded-lg bg-danger/5 border border-danger/15 text-sm text-danger">
          {error}
        </div>
      )}

      {revealData && !loading && (
        <div className="space-y-4">
          {revealData.infrasound_detected ? (
            <>
              {/* Stats row */}
              <div className="grid grid-cols-3 gap-3">
                <div className="p-3 rounded-lg bg-white/60 border border-purple-100">
                  <p className="text-[10px] text-ev-warm-gray uppercase tracking-wider mb-1">
                    Regions Found
                  </p>
                  <p className="text-lg font-bold text-purple-600">
                    {revealData.infrasound_regions.length}
                  </p>
                </div>
                <div className="p-3 rounded-lg bg-white/60 border border-purple-100">
                  <p className="text-[10px] text-ev-warm-gray uppercase tracking-wider mb-1">
                    Energy
                  </p>
                  <p className="text-lg font-bold text-purple-600">
                    {revealData.infrasound_energy_pct}%
                  </p>
                </div>
                <div className="p-3 rounded-lg bg-white/60 border border-purple-100">
                  <p className="text-[10px] text-ev-warm-gray uppercase tracking-wider mb-1">
                    Shifted
                  </p>
                  <p className="text-lg font-bold text-purple-600">
                    +{revealData.shift_octaves} oct
                  </p>
                </div>
              </div>

              {/* Infrasound regions list */}
              <div className="space-y-2">
                <p className="text-xs font-medium text-ev-elephant">
                  Detected Infrasound Regions
                </p>
                {revealData.infrasound_regions.map((region, i) => (
                  <div
                    key={i}
                    className="flex items-center gap-3 p-2.5 rounded-lg bg-white/40 border border-purple-100/60 text-xs"
                  >
                    <div className="w-6 h-6 rounded-full bg-purple-500/10 flex items-center justify-center text-[10px] font-bold text-purple-600">
                      {i + 1}
                    </div>
                    <div className="flex-1 flex items-center justify-between">
                      <span className="text-ev-elephant font-mono">
                        {(region.start_ms / 1000).toFixed(1)}s –{" "}
                        {(region.end_ms / 1000).toFixed(1)}s
                      </span>
                      <span className="text-purple-600 font-medium">
                        {region.estimated_f0_hz}Hz → {region.shifted_f0_hz}Hz
                      </span>
                    </div>
                  </div>
                ))}
              </div>

              {/* Audio player for shifted audio */}
              <div className="p-4 rounded-xl bg-purple-50/50 border border-purple-200/40">
                <div className="flex items-center gap-3 mb-3">
                  <p className="text-xs font-semibold text-purple-700">
                    Pitch-Shifted Infrasound
                  </p>
                  <span className="text-[10px] px-2 py-0.5 rounded-full bg-purple-100 text-purple-600 font-medium">
                    {revealData.frequency_range_original_hz[0]}–
                    {revealData.frequency_range_original_hz[1]}Hz →{" "}
                    {revealData.frequency_range_shifted_hz[0]}–
                    {revealData.frequency_range_shifted_hz[1]}Hz
                  </span>
                </div>
                <audio
                  ref={audioRef}
                  src={getInfrasoundShiftedAudioUrl(recordingId)}
                  preload="metadata"
                  onEnded={() => setIsPlayingShifted(false)}
                />
                <button
                  onClick={togglePlay}
                  className="inline-flex items-center gap-2 px-5 py-2.5 bg-purple-600 text-white text-sm font-semibold rounded-lg hover:bg-purple-700 transition-colors"
                >
                  {isPlayingShifted ? (
                    <>
                      <svg
                        width="14"
                        height="14"
                        viewBox="0 0 16 16"
                        fill="currentColor"
                      >
                        <rect x="3" y="2" width="4" height="12" rx="1" />
                        <rect x="9" y="2" width="4" height="12" rx="1" />
                      </svg>
                      Pause
                    </>
                  ) : (
                    <>
                      <svg
                        width="14"
                        height="14"
                        viewBox="0 0 16 16"
                        fill="currentColor"
                      >
                        <path d="M4 2L14 8L4 14V2Z" />
                      </svg>
                      Play Revealed Infrasound
                    </>
                  )}
                </button>
              </div>

              <p className="text-[10px] text-ev-warm-gray italic">
                Infrasound frequencies (below 20Hz) have been shifted up by{" "}
                {revealData.shift_octaves} octaves into audible range. Elephants
                use these ultra-low frequencies to communicate over distances up
                to 10 kilometers.
              </p>
            </>
          ) : (
            <div className="text-center py-4">
              <p className="text-sm text-ev-elephant">
                No significant infrasound detected in this recording.
              </p>
              <p className="text-xs text-ev-warm-gray mt-1">
                This recording may not contain sub-20Hz elephant vocalizations,
                or they may be too faint to detect.
              </p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
