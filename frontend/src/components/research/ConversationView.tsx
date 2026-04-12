"use client";

import React, { useState, useEffect, useCallback, useRef } from "react";
import { getCalls, type Call } from "@/lib/audio-api";

// Call type metadata for display
const CALL_TYPE_META: Record<
  string,
  { color: string; bg: string; border: string; emoji: string; description: string }
> = {
  rumble: {
    color: "text-purple-700",
    bg: "bg-purple-50",
    border: "border-purple-200",
    emoji: "🟣",
    description: "Low-frequency contact call — long-distance communication",
  },
  trumpet: {
    color: "text-amber-700",
    bg: "bg-amber-50",
    border: "border-amber-200",
    emoji: "🟡",
    description: "High-energy alarm or excitement call",
  },
  roar: {
    color: "text-red-700",
    bg: "bg-red-50",
    border: "border-red-200",
    emoji: "🔴",
    description: "Aggressive, broad-spectrum vocalization",
  },
  bark: {
    color: "text-emerald-700",
    bg: "bg-emerald-50",
    border: "border-emerald-200",
    emoji: "🟢",
    description: "Short, sharp warning signal",
  },
  cry: {
    color: "text-blue-700",
    bg: "bg-blue-50",
    border: "border-blue-200",
    emoji: "🔵",
    description: "Distress or contact-seeking vocalization",
  },
  unknown: {
    color: "text-gray-600",
    bg: "bg-gray-50",
    border: "border-gray-200",
    emoji: "⚪",
    description: "Unclassified vocalization",
  },
};

const SPEAKER_COLORS = [
  {
    name: "Matriarch",
    avatar: "🐘",
    bubbleBg: "bg-purple-50",
    bubbleBorder: "border-purple-200/60",
    nameColor: "text-purple-700",
  },
  {
    name: "Juvenile",
    avatar: "🐘",
    bubbleBg: "bg-amber-50",
    bubbleBorder: "border-amber-200/60",
    nameColor: "text-amber-700",
  },
  {
    name: "Bull",
    avatar: "🐘",
    bubbleBg: "bg-emerald-50",
    bubbleBorder: "border-emerald-200/60",
    nameColor: "text-emerald-700",
  },
  {
    name: "Calf",
    avatar: "🐘",
    bubbleBg: "bg-blue-50",
    bubbleBorder: "border-blue-200/60",
    nameColor: "text-blue-700",
  },
];

function formatTimestamp(ms: number): string {
  const totalSec = ms / 1000;
  const min = Math.floor(totalSec / 60);
  const sec = Math.floor(totalSec % 60);
  const frac = Math.floor((totalSec % 1) * 10);
  return `${min}:${sec.toString().padStart(2, "0")}.${frac}`;
}

// Simple speaker assignment based on acoustic features
function assignSpeakers(calls: Call[]): Map<string, number> {
  const speakerMap = new Map<string, number>();
  if (calls.length === 0) return speakerMap;

  // Use fundamental frequency + spectral centroid to differentiate speakers
  let currentSpeaker = 0;
  let lastF0 = 0;
  let lastCentroid = 0;

  for (const call of calls) {
    const features = call.acoustic_features || {};
    const f0 = Number(features.fundamental_frequency_hz) || 0;
    const centroid = Number(features.spectral_centroid_hz) || 0;

    if (lastF0 > 0) {
      const f0Diff = Math.abs(f0 - lastF0) / Math.max(lastF0, 1);
      const centroidDiff =
        Math.abs(centroid - lastCentroid) / Math.max(lastCentroid, 1);

      // If acoustic features differ significantly, assign to different speaker
      if (f0Diff > 0.3 || centroidDiff > 0.4) {
        currentSpeaker = (currentSpeaker + 1) % SPEAKER_COLORS.length;
      }
    }

    speakerMap.set(call.id, currentSpeaker);
    lastF0 = f0 || lastF0;
    lastCentroid = centroid || lastCentroid;
  }

  return speakerMap;
}

interface ConversationViewProps {
  recordingId: string;
  isComplete: boolean;
  location?: string;
  date?: string;
}

export default function ConversationView({
  recordingId,
  isComplete,
  location,
  date,
}: ConversationViewProps) {
  const [calls, setCalls] = useState<Call[]>([]);
  const [loading, setLoading] = useState(true);
  const [speakerMap, setSpeakerMap] = useState<Map<string, number>>(new Map());
  const [playingCallId, setPlayingCallId] = useState<string | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!isComplete) return;
    let cancelled = false;
    async function load() {
      try {
        setLoading(true);
        const data = await getCalls({
          recording_id: recordingId,
          limit: 200,
        });
        const sorted = [...data.calls].sort((a, b) => a.start_ms - b.start_ms);
        if (!cancelled) {
          setCalls(sorted);
          setSpeakerMap(assignSpeakers(sorted));
        }
      } catch {
        // silently fail
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    load();
    return () => {
      cancelled = true;
    };
  }, [recordingId, isComplete]);

  const handlePlayCall = useCallback(
    (call: Call) => {
      setPlayingCallId(call.id === playingCallId ? null : call.id);
    },
    [playingCallId],
  );

  if (!isComplete) return null;

  if (loading) {
    return (
      <div className="p-5 rounded-xl bg-white/50 border border-ev-sand/40">
        <div className="flex items-center gap-3 py-8 justify-center">
          <div className="w-6 h-6 border-2 border-accent-savanna border-t-transparent rounded-full animate-spin" />
          <p className="text-sm text-ev-elephant">Loading conversation...</p>
        </div>
      </div>
    );
  }

  if (calls.length === 0) {
    return (
      <div className="p-5 rounded-xl bg-white/50 border border-ev-sand/40 text-center py-8">
        <p className="text-sm text-ev-elephant">
          No calls detected in this recording.
        </p>
        <p className="text-xs text-ev-warm-gray mt-1">
          Process the recording to detect elephant vocalizations.
        </p>
      </div>
    );
  }

  // Count unique speakers
  const uniqueSpeakers = new Set(speakerMap.values());
  const speakerCount = Math.max(uniqueSpeakers.size, 1);

  return (
    <div className="rounded-xl bg-white/50 border border-ev-sand/40 overflow-hidden">
      {/* Header */}
      <div className="px-5 py-4 border-b border-ev-sand/40 bg-white/60">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-full bg-accent-savanna/10 flex items-center justify-center text-lg">
              🐘
            </div>
            <div>
              <h3 className="text-sm font-semibold text-ev-charcoal">
                Elephant Conversation
              </h3>
              <p className="text-[11px] text-ev-warm-gray">
                {location && `${location} · `}
                {date && `${date} · `}
                {speakerCount}{" "}
                {speakerCount === 1 ? "individual" : "individuals"} identified
                {" · "}
                {calls.length} vocalizations
              </p>
            </div>
          </div>
        </div>

        {/* Speaker legend */}
        {speakerCount > 1 && (
          <div className="flex items-center gap-3 mt-3 pt-3 border-t border-ev-sand/30">
            {Array.from(uniqueSpeakers).map((speakerIdx) => {
              const speaker =
                SPEAKER_COLORS[speakerIdx % SPEAKER_COLORS.length];
              const callCount = Array.from(speakerMap.values()).filter(
                (s) => s === speakerIdx,
              ).length;
              return (
                <div
                  key={speakerIdx}
                  className="flex items-center gap-1.5 text-xs"
                >
                  <span>{speaker.avatar}</span>
                  <span className={`font-medium ${speaker.nameColor}`}>
                    {speaker.name}
                  </span>
                  <span className="text-ev-warm-gray">({callCount})</span>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Chat messages */}
      <div
        ref={scrollRef}
        className="p-4 space-y-3 max-h-[500px] overflow-y-auto"
      >
        {calls.map((call, index) => {
          const speakerIdx = speakerMap.get(call.id) ?? 0;
          const speaker = SPEAKER_COLORS[speakerIdx % SPEAKER_COLORS.length];
          const callMeta =
            CALL_TYPE_META[call.call_type] || CALL_TYPE_META.unknown;
          const isRight = speakerIdx % 2 === 1;
          const isPlaying = playingCallId === call.id;

          // Calculate gap from previous call
          const prevCall = index > 0 ? calls[index - 1] : null;
          const gapMs = prevCall
            ? call.start_ms - (prevCall.start_ms + prevCall.duration_ms)
            : 0;
          const showGap = gapMs > 3000; // Show gap separator if > 3 seconds

          const durationSec = (call.duration_ms / 1000).toFixed(1);
          const f0 = call.acoustic_features?.fundamental_frequency_hz;

          return (
            <React.Fragment key={call.id}>
              {/* Gap separator */}
              {showGap && (
                <div className="flex items-center gap-3 py-2">
                  <div className="flex-1 h-px bg-ev-sand/60" />
                  <span className="text-[10px] text-ev-warm-gray font-mono">
                    {gapMs > 60000
                      ? `${Math.floor(gapMs / 60000)}m ${Math.floor((gapMs % 60000) / 1000)}s later`
                      : `${(gapMs / 1000).toFixed(1)}s silence`}
                  </span>
                  <div className="flex-1 h-px bg-ev-sand/60" />
                </div>
              )}

              {/* Chat bubble */}
              <div
                className={`flex ${isRight ? "justify-end" : "justify-start"}`}
              >
                <div
                  className={`max-w-[75%] ${isRight ? "items-end" : "items-start"} flex flex-col gap-1`}
                >
                  {/* Speaker name + timestamp */}
                  <div
                    className={`flex items-center gap-2 px-1 ${isRight ? "flex-row-reverse" : ""}`}
                  >
                    <span
                      className={`text-[10px] font-semibold ${speaker.nameColor}`}
                    >
                      {speaker.avatar} {speaker.name}
                    </span>
                    <span className="text-[10px] text-ev-warm-gray font-mono">
                      {formatTimestamp(call.start_ms)}
                    </span>
                  </div>

                  {/* Bubble */}
                  <button
                    onClick={() => handlePlayCall(call)}
                    className={`
                      relative px-4 py-3 rounded-2xl border text-left transition-all
                      ${speaker.bubbleBg} ${speaker.bubbleBorder}
                      ${isRight ? "rounded-tr-sm" : "rounded-tl-sm"}
                      ${isPlaying ? "ring-2 ring-accent-savanna/40 shadow-md" : "hover:shadow-sm"}
                    `}
                  >
                    {/* Call type badge */}
                    <div className="flex items-center gap-2 mb-1.5">
                      <span
                        className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold ${callMeta.bg} ${callMeta.color} ${callMeta.border} border`}
                      >
                        {callMeta.emoji}{" "}
                        {call.call_type.charAt(0).toUpperCase() +
                          call.call_type.slice(1)}
                      </span>
                      <span className="text-[10px] text-ev-warm-gray">
                        {durationSec}s
                      </span>
                      {call.confidence != null && (
                        <span className="text-[10px] text-ev-warm-gray font-mono">
                          {(call.confidence * 100).toFixed(0)}%
                        </span>
                      )}
                    </div>

                    {/* Description */}
                    <p className="text-xs text-ev-elephant italic leading-relaxed">
                      {callMeta.description}
                    </p>

                    {/* Acoustic feature snippet */}
                    {f0 != null && (
                      <p className="text-[10px] text-ev-warm-gray mt-1.5 font-mono">
                        F0: {Number(f0).toFixed(1)}Hz
                        {call.acoustic_features?.harmonicity != null && (
                          <>
                            {" "}
                            · H:{" "}
                            {Number(
                              call.acoustic_features.harmonicity,
                            ).toFixed(2)}
                          </>
                        )}
                      </p>
                    )}

                    {/* Play indicator */}
                    {isPlaying && (
                      <div className="absolute top-2 right-2">
                        <div className="flex items-center gap-0.5">
                          {[1, 2, 3].map((i) => (
                            <div
                              key={i}
                              className="w-0.5 bg-accent-savanna rounded-full animate-pulse"
                              style={{
                                height: `${8 + i * 3}px`,
                                animationDelay: `${i * 0.15}s`,
                              }}
                            />
                          ))}
                        </div>
                      </div>
                    )}
                  </button>
                </div>
              </div>
            </React.Fragment>
          );
        })}
      </div>

      {/* Footer */}
      <div className="px-5 py-3 border-t border-ev-sand/40 bg-white/40">
        <p className="text-[10px] text-ev-warm-gray italic text-center">
          Speaker identification is estimated from acoustic similarity. Click a
          bubble to highlight that vocalization.
        </p>
      </div>
    </div>
  );
}
