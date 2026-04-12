"use client";

import type { Call } from "@/lib/audio-api";

function scorePct(score?: number | null): string {
  if (score == null) return "--";
  return `${Math.round(score)}%`;
}

export default function CallResearchPanel({ call }: { call: Call }) {
  const ethology = call.ethology;
  const bestMatch = call.reference_matches?.[0];
  const publishability = call.publishability;

  return (
    <div className="rounded-lg border border-ev-sand/40 bg-white/70 p-4 space-y-3">
      <div className="flex items-center justify-between gap-3">
        <div>
          <p className="text-[11px] uppercase tracking-wider text-ev-warm-gray">
            Research Decode
          </p>
          <h3 className="text-sm font-semibold text-ev-charcoal">
            {ethology?.label ?? call.call_type}
          </h3>
        </div>
        {publishability && (
          <span className="rounded-md border border-success/30 bg-success/10 px-2 py-1 text-[11px] font-semibold text-success">
            {scorePct(publishability.score)} {publishability.tier_label ?? publishability.tier}
          </span>
        )}
      </div>

      {ethology ? (
        <div className="space-y-1">
          <p className="text-sm leading-relaxed text-ev-elephant">{ethology.meaning}</p>
          <div className="grid gap-2 text-xs text-ev-warm-gray sm:grid-cols-2">
            <span>Context: {ethology.behavioral_context}</span>
            <span>Function: {ethology.social_function}</span>
            <span>Range: {ethology.range_km} km</span>
            <span>Response: {ethology.common_response}</span>
          </div>
        </div>
      ) : (
        <p className="text-sm text-ev-warm-gray">No ethology annotation yet.</p>
      )}

      {bestMatch ? (
        <div>
          <div className="mb-1 flex items-center justify-between text-xs">
            <span className="font-medium text-ev-elephant">
              Best Match: {bestMatch.label}
            </span>
            <span className="font-mono text-ev-warm-gray">
              {Math.round(bestMatch.similarity_score * 100)}%
            </span>
          </div>
          <div className="h-2 overflow-hidden rounded-sm bg-ev-cream">
            <div
              className="h-full rounded-sm bg-accent-savanna"
              style={{ width: `${Math.round(bestMatch.similarity_score * 100)}%` }}
            />
          </div>
          <p className="mt-1 text-[11px] text-ev-warm-gray">
            {bestMatch.behavioral_context}
          </p>
          {call.reference_matches && call.reference_matches.length > 1 && (
            <div className="mt-3 space-y-1.5">
              {call.reference_matches.slice(1, 7).map((match) => (
                <div key={match.rumble_id} className="grid grid-cols-[1fr_48px] items-center gap-2">
                  <span className="truncate text-[11px] text-ev-elephant">
                    {match.label}
                  </span>
                  <span className="text-right font-mono text-[11px] text-ev-warm-gray">
                    {Math.round(match.similarity_score * 100)}%
                  </span>
                  <div className="col-span-2 h-1 overflow-hidden rounded-sm bg-ev-cream">
                    <div
                      className="h-full rounded-sm bg-ev-warm-gray/60"
                      style={{ width: `${Math.round(match.similarity_score * 100)}%` }}
                    />
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      ) : (
        <p className="text-xs text-ev-warm-gray">No reference match available.</p>
      )}
    </div>
  );
}
