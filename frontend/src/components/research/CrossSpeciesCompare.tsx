"use client";

import React, { useState, useEffect, useCallback } from "react";
import {
  getReferenceSpecies,
  compareCrossSpecies,
  getCalls,
  type ReferenceSpecies,
  type CrossSpeciesComparison,
  type Call,
} from "@/lib/audio-api";

const SPECIES_ICONS: Record<string, string> = {
  blue_whale: "\uD83D\uDC0B",
  humpback_whale: "\uD83D\uDC33",
  lion_roar: "\uD83E\uDD81",
  human_speech: "\uD83D\uDDE3\uFE0F",
};

function SimilarityBar({ value, label }: { value: number; label: string }) {
  const pct = Math.round(value * 100);
  const color = pct > 70 ? "bg-success" : pct > 40 ? "bg-accent-savanna" : "bg-ev-warm-gray";
  return (
    <div>
      <div className="flex justify-between text-[10px] mb-1">
        <span className="text-ev-elephant">{label}</span>
        <span className="font-mono text-ev-charcoal">{pct}%</span>
      </div>
      <div className="h-1.5 bg-ev-cream rounded-full overflow-hidden">
        <div className={`h-full ${color} rounded-full transition-all duration-500`} style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}

interface CrossSpeciesCompareProps {
  recordingId: string;
  isComplete: boolean;
}

export default function CrossSpeciesCompare({ recordingId, isComplete }: CrossSpeciesCompareProps) {
  const [references, setReferences] = useState<ReferenceSpecies[]>([]);
  const [calls, setCalls] = useState<Call[]>([]);
  const [selectedCall, setSelectedCall] = useState<Call | null>(null);
  const [selectedRef, setSelectedRef] = useState<string | null>(null);
  const [comparison, setComparison] = useState<CrossSpeciesComparison | null>(null);
  const [loading, setLoading] = useState(false);
  const [initialLoading, setInitialLoading] = useState(true);

  useEffect(() => {
    if (!isComplete) return;
    let cancelled = false;
    async function load() {
      try {
        const [refsData, callsData] = await Promise.all([
          getReferenceSpecies(),
          getCalls({ recording_id: recordingId, limit: 50 }),
        ]);
        if (!cancelled) {
          setReferences(refsData.references);
          setCalls(callsData.calls);
          if (callsData.calls.length > 0) setSelectedCall(callsData.calls[0]);
        }
      } catch {
        // silently fail
      } finally {
        if (!cancelled) setInitialLoading(false);
      }
    }
    load();
    return () => { cancelled = true; };
  }, [recordingId, isComplete]);

  const handleCompare = useCallback(async (refId: string) => {
    if (!selectedCall) return;
    setSelectedRef(refId);
    setLoading(true);
    setComparison(null);
    try {
      const result = await compareCrossSpecies(selectedCall.id, refId);
      setComparison(result);
    } catch {
      // silently fail
    } finally {
      setLoading(false);
    }
  }, [selectedCall]);

  if (!isComplete || initialLoading) return null;
  if (calls.length === 0) return null;

  return (
    <div className="p-5 rounded-xl bg-white/50 border border-ev-sand/40">
      <div className="flex items-center gap-3 mb-4">
        <div className="w-9 h-9 rounded-xl bg-accent-savanna/10 flex items-center justify-center">
          <span className="text-lg">{"\uD83C\uDF0D"}</span>
        </div>
        <div>
          <h3 className="text-sm font-semibold text-ev-charcoal">Cross-Species Comparison</h3>
          <p className="text-[11px] text-ev-warm-gray">Compare elephant calls with other species</p>
        </div>
      </div>

      {/* Call selector */}
      {calls.length > 1 && (
        <div className="mb-4">
          <label className="text-[10px] text-ev-warm-gray uppercase tracking-wider mb-1.5 block">
            Select Elephant Call
          </label>
          <select
            value={selectedCall?.id || ""}
            onChange={(e) => {
              const call = calls.find((c) => c.id === e.target.value);
              if (call) { setSelectedCall(call); setComparison(null); setSelectedRef(null); }
            }}
            className="w-full px-3 py-2 rounded-lg border border-ev-sand bg-white text-sm text-ev-charcoal"
          >
            {calls.map((call) => (
              <option key={call.id} value={call.id}>
                {call.call_type} at {(call.start_ms / 1000).toFixed(1)}s ({(call.duration_ms / 1000).toFixed(1)}s)
              </option>
            ))}
          </select>
        </div>
      )}

      {/* Reference species grid */}
      <div className="grid grid-cols-2 gap-2.5 mb-4">
        {references.map((ref) => (
          <button
            key={ref.id}
            onClick={() => handleCompare(ref.id)}
            className={`text-left p-3 rounded-xl border transition-all ${
              selectedRef === ref.id
                ? "border-accent-savanna bg-accent-savanna/5 shadow-sm"
                : "border-ev-sand/60 bg-white/40 hover:border-ev-sand hover:bg-white/60"
            }`}
          >
            <div className="flex items-center gap-2 mb-1">
              <span className="text-lg">{SPECIES_ICONS[ref.id] || "\uD83D\uDD0A"}</span>
              <span className="text-xs font-semibold text-ev-charcoal">{ref.species.split("(")[0].trim()}</span>
            </div>
            <p className="text-[10px] text-ev-warm-gray leading-snug">{ref.call_type}</p>
            <p className="text-[10px] text-ev-warm-gray/60 mt-0.5 font-mono">
              {ref.frequency_range_hz[0]}&ndash;{ref.frequency_range_hz[1]}Hz
            </p>
          </button>
        ))}
      </div>

      {/* Loading */}
      {loading && (
        <div className="flex items-center gap-2 justify-center py-6">
          <div className="w-5 h-5 border-2 border-accent-savanna border-t-transparent rounded-full animate-spin" />
          <p className="text-sm text-ev-elephant">Comparing acoustic profiles...</p>
        </div>
      )}

      {/* Results */}
      {comparison && !loading && (
        <div className="space-y-4 pt-2 border-t border-ev-sand/40">
          {/* Similarity metrics */}
          <div className="grid grid-cols-2 gap-4 pt-4">
            <SimilarityBar value={comparison.comparison.frequency_overlap_pct / 100} label="Frequency Overlap" />
            <SimilarityBar value={comparison.comparison.spectral_similarity} label="Spectral Similarity" />
            <SimilarityBar value={comparison.comparison.harmonic_similarity} label="Harmonic Similarity" />
            <SimilarityBar value={comparison.comparison.temporal_similarity} label="Temporal Similarity" />
          </div>

          {/* Insight */}
          <div className="p-3.5 rounded-lg bg-accent-savanna/5 border border-accent-savanna/15">
            <p className="text-xs text-ev-elephant leading-relaxed italic">
              {comparison.comparison.insight}
            </p>
          </div>

          {/* Feature comparison table */}
          <div>
            <p className="text-[10px] text-ev-warm-gray uppercase tracking-wider mb-2">Feature Comparison</p>
            <div className="space-y-1.5">
              {Object.entries(comparison.feature_comparison).map(([key, val]) => {
                const label = key.replace(/_/g, " ").replace(/\bhz\b/gi, "Hz").replace(/\bdb\b/gi, "dB");
                return (
                  <div key={key} className="flex items-center justify-between text-[11px] py-1 border-b border-ev-sand/20 last:border-0">
                    <span className="text-ev-warm-gray capitalize">{label}</span>
                    <div className="flex items-center gap-3">
                      <span className="font-mono text-ev-charcoal">{val.elephant}</span>
                      <span className="text-ev-warm-gray">vs</span>
                      <span className="font-mono text-ev-charcoal">{val.reference}</span>
                      <span className={`text-[9px] font-mono ${val.difference_pct < 20 ? "text-success" : val.difference_pct < 50 ? "text-accent-savanna" : "text-ev-warm-gray"}`}>
                        ({val.difference_pct}%)
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
