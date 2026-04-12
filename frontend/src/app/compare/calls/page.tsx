"use client";

import Link from "next/link";
import { useState, useCallback } from "react";
import {
  GitCompare,
  Search,
  BarChart3,
  Waves,
  Loader2,
  ArrowRight,
  ArrowLeft,
} from "lucide-react";
import {
  compareCalls,
  getCallCompareOverlayUrl,
  getSimilarCalls,
  getSimilarContours,
  type CallComparisonResult,
  type SimilarCallMatch,
} from "@/lib/audio-api";

const CALL_TYPE_COLORS: Record<string, string> = {
  rumble: "bg-accent-savanna/10 text-accent-savanna border-accent-savanna/20",
  trumpet: "bg-accent-gold/10 text-accent-gold border-accent-gold/20",
  roar: "bg-danger/10 text-danger border-danger/20",
  bark: "bg-warning/10 text-warning border-warning/20",
  cry: "bg-purple-400/10 text-purple-400 border-purple-400/20",
  "contact call": "bg-success/10 text-success border-success/20",
  greeting: "bg-blue-400/10 text-blue-400 border-blue-400/20",
  play: "bg-pink-400/10 text-pink-400 border-pink-400/20",
};

function CallTypeBadge({ type }: { type: string }) {
  const c =
    CALL_TYPE_COLORS[type.toLowerCase()] ||
    "bg-ev-warm-gray/10 text-ev-warm-gray border-ev-warm-gray/20";
  return (
    <span
      className={`px-2.5 py-1 rounded-md text-xs font-medium border ${c}`}
    >
      {type}
    </span>
  );
}

function SimilarityBar({ value }: { value: number }) {
  const pct = Math.round(value * 100);
  const color =
    value > 0.8
      ? "bg-success"
      : value > 0.5
        ? "bg-accent-gold"
        : "bg-danger";
  return (
    <div className="flex items-center gap-2 flex-1">
      <div className="flex-1 h-2 rounded-full bg-ev-cream overflow-hidden">
        <div
          className={`h-full rounded-full ${color} transition-all`}
          style={{ width: `${pct}%` }}
        />
      </div>
      <span className="text-xs font-medium text-ev-charcoal tabular-nums w-10 text-right">
        {pct}%
      </span>
    </div>
  );
}

function DimensionBar({
  label,
  value,
}: {
  label: string;
  value: number;
}) {
  const pct = Math.round(value * 100);
  return (
    <div>
      <div className="flex items-center justify-between mb-1">
        <span className="text-xs text-ev-warm-gray">{label}</span>
        <span className="text-xs font-medium text-ev-charcoal tabular-nums">
          {pct}%
        </span>
      </div>
      <div className="h-2 rounded-full bg-ev-cream overflow-hidden">
        <div
          className="h-full rounded-full bg-accent-savanna/70 transition-all"
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  );
}

export default function CallComparisonPage() {
  // ── Compare Two Calls state ──
  const [callAId, setCallAId] = useState("");
  const [callBId, setCallBId] = useState("");
  const [compareResult, setCompareResult] =
    useState<CallComparisonResult | null>(null);
  const [compareLoading, setCompareLoading] = useState(false);
  const [compareError, setCompareError] = useState<string | null>(null);

  // ── Find Similar Calls state ──
  const [similarSourceId, setSimilarSourceId] = useState("");
  const [similarMatches, setSimilarMatches] = useState<SimilarCallMatch[]>(
    []
  );
  const [similarFingerprintVersion, setSimilarFingerprintVersion] =
    useState<string | null>(null);
  const [similarLoading, setSimilarLoading] = useState(false);
  const [similarError, setSimilarError] = useState<string | null>(null);

  // ── Contour Matching state ──
  const [contourSourceId, setContourSourceId] = useState("");
  const [contourMethod, setContourMethod] = useState<"dtw" | "pearson">(
    "dtw"
  );
  const [contourMinSimilarity, setContourMinSimilarity] = useState(0.5);
  const [contourMatches, setContourMatches] = useState<SimilarCallMatch[]>(
    []
  );
  const [contourTotalCompared, setContourTotalCompared] = useState<
    number | null
  >(null);
  const [contourLoading, setContourLoading] = useState(false);
  const [contourError, setContourError] = useState<string | null>(null);

  // ── Handlers ──

  const handleCompare = useCallback(async () => {
    if (!callAId.trim() || !callBId.trim()) return;
    setCompareLoading(true);
    setCompareError(null);
    setCompareResult(null);
    try {
      const result = await compareCalls(callAId.trim(), callBId.trim());
      setCompareResult(result);
    } catch (err) {
      setCompareError(
        err instanceof Error ? err.message : "Comparison failed"
      );
    } finally {
      setCompareLoading(false);
    }
  }, [callAId, callBId]);

  const handleFindSimilar = useCallback(async () => {
    if (!similarSourceId.trim()) return;
    setSimilarLoading(true);
    setSimilarError(null);
    setSimilarMatches([]);
    setSimilarFingerprintVersion(null);
    try {
      const result = await getSimilarCalls(similarSourceId.trim(), 20);
      setSimilarMatches(
        [...result.matches].sort((a, b) => b.similarity - a.similarity)
      );
      setSimilarFingerprintVersion(result.fingerprint_version);
    } catch (err) {
      setSimilarError(
        err instanceof Error ? err.message : "Failed to find similar calls"
      );
    } finally {
      setSimilarLoading(false);
    }
  }, [similarSourceId]);

  const handleMatchContours = useCallback(async () => {
    if (!contourSourceId.trim()) return;
    setContourLoading(true);
    setContourError(null);
    setContourMatches([]);
    setContourTotalCompared(null);
    try {
      const result = await getSimilarContours(contourSourceId.trim(), {
        method: contourMethod,
        min_similarity: contourMinSimilarity,
      });
      setContourMatches(
        [...result.matches].sort((a, b) => b.similarity - a.similarity)
      );
      setContourTotalCompared(result.total_compared);
    } catch (err) {
      setContourError(
        err instanceof Error ? err.message : "Contour matching failed"
      );
    } finally {
      setContourLoading(false);
    }
  }, [contourSourceId, contourMethod, contourMinSimilarity]);

  const similarityColor = (score: number) =>
    score > 0.8
      ? "text-success"
      : score > 0.5
        ? "text-accent-gold"
        : "text-danger";

  return (
    <main className="p-6 lg:p-8 max-w-6xl mx-auto space-y-6">
      {/* Header */}
      <div>
        <Link
          href="/database"
          className="mb-4 inline-flex min-h-[44px] items-center gap-2 rounded-full border border-ev-sand/40 bg-white/80 px-4 py-2.5 text-sm font-medium text-ev-elephant shadow-sm transition-all hover:border-ev-warm-gray/30 hover:bg-white"
        >
          <ArrowLeft className="h-4 w-4" />
          Back to Database
        </Link>
        <h1 className="text-4xl font-bold text-ev-charcoal">
          Call Comparison
        </h1>
        <p className="mt-2 text-ev-elephant">
          Compare calls, find similar ones, and match frequency contours
        </p>
      </div>

      {/* ── Compare Two Calls ── */}
      <div className="rounded-lg border border-ev-sand bg-ev-cream p-5">
        <div className="flex items-center gap-2 mb-4">
          <GitCompare className="w-5 h-5 text-accent-savanna" />
          <h2 className="text-lg font-semibold text-ev-charcoal">
            Compare Two Calls
          </h2>
        </div>

        <div className="flex flex-col sm:flex-row gap-3 mb-4">
          <div className="flex-1">
            <label className="block text-xs text-ev-warm-gray mb-1">
              Call A
            </label>
            <input
              type="text"
              placeholder="Enter call ID"
              value={callAId}
              onChange={(e) => setCallAId(e.target.value)}
              className="w-full rounded-lg border border-ev-sand bg-white px-3 py-2 text-sm text-ev-charcoal placeholder:text-ev-warm-gray/50 focus:outline-none focus:border-accent-savanna/40 focus:ring-2 focus:ring-accent-savanna/10"
            />
          </div>
          <div className="flex items-end pb-0.5">
            <ArrowRight className="w-4 h-4 text-ev-warm-gray hidden sm:block" />
          </div>
          <div className="flex-1">
            <label className="block text-xs text-ev-warm-gray mb-1">
              Call B
            </label>
            <input
              type="text"
              placeholder="Enter call ID"
              value={callBId}
              onChange={(e) => setCallBId(e.target.value)}
              className="w-full rounded-lg border border-ev-sand bg-white px-3 py-2 text-sm text-ev-charcoal placeholder:text-ev-warm-gray/50 focus:outline-none focus:border-accent-savanna/40 focus:ring-2 focus:ring-accent-savanna/10"
            />
          </div>
          <div className="flex items-end">
            <button
              onClick={handleCompare}
              disabled={compareLoading || !callAId.trim() || !callBId.trim()}
              className="rounded-lg bg-accent-savanna px-4 py-2 text-sm font-semibold text-ev-ivory hover:bg-accent-savanna/90 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              {compareLoading ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                "Compare"
              )}
            </button>
          </div>
        </div>

        {compareError && (
          <div className="rounded-lg border border-danger/20 bg-danger/10 text-danger px-4 py-3 text-sm mb-4">
            {compareError}
          </div>
        )}

        {compareResult && (
          <div className="space-y-5">
            {/* Overall score + fingerprint distance */}
            <div className="flex flex-col sm:flex-row gap-4">
              <div className="flex-1 rounded-lg border border-ev-sand bg-white p-4 text-center">
                <p className="text-xs text-ev-warm-gray mb-1">
                  Overall Similarity
                </p>
                <p
                  className={`text-4xl font-bold tabular-nums ${similarityColor(compareResult.similarity_score)}`}
                >
                  {Math.round(compareResult.similarity_score * 100)}%
                </p>
              </div>
              <div className="flex-1 rounded-lg border border-ev-sand bg-white p-4 text-center">
                <p className="text-xs text-ev-warm-gray mb-1">
                  Fingerprint Distance
                </p>
                <p className="text-4xl font-bold tabular-nums text-ev-charcoal">
                  {compareResult.fingerprint_distance.toFixed(3)}
                </p>
              </div>
            </div>

            {/* Dimension breakdown */}
            <div>
              <h3 className="text-sm font-medium text-ev-charcoal mb-3">
                Dimension Breakdown
              </h3>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <DimensionBar
                  label="Timbral"
                  value={
                    compareResult.dimension_breakdown.timbral_similarity
                  }
                />
                <DimensionBar
                  label="Pitch Contour"
                  value={
                    compareResult.dimension_breakdown
                      .pitch_contour_similarity
                  }
                />
                <DimensionBar
                  label="Temporal Dynamics"
                  value={
                    compareResult.dimension_breakdown
                      .temporal_dynamics_similarity
                  }
                />
                <DimensionBar
                  label="Energy Profile"
                  value={
                    compareResult.dimension_breakdown
                      .energy_profile_similarity
                  }
                />
              </div>
            </div>

            {/* Spectrogram overlay */}
            <div>
              <h3 className="text-sm font-medium text-ev-charcoal mb-3">
                Spectrogram Overlay
              </h3>
              <div className="rounded-lg border border-ev-sand overflow-hidden bg-white">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={getCallCompareOverlayUrl(
                    compareResult.call_a_id,
                    compareResult.call_b_id,
                    "spectrogram"
                  )}
                  alt="Spectrogram overlay of compared calls"
                  className="w-full h-auto"
                />
              </div>
            </div>
          </div>
        )}
      </div>

      {/* ── Find Similar Calls ── */}
      <div className="rounded-lg border border-ev-sand bg-ev-cream p-5">
        <div className="flex items-center gap-2 mb-4">
          <Search className="w-5 h-5 text-accent-savanna" />
          <h2 className="text-lg font-semibold text-ev-charcoal">
            Find Similar Calls
          </h2>
        </div>

        <div className="flex flex-col sm:flex-row gap-3 mb-4">
          <div className="flex-1">
            <label className="block text-xs text-ev-warm-gray mb-1">
              Source Call ID
            </label>
            <input
              type="text"
              placeholder="Enter call ID"
              value={similarSourceId}
              onChange={(e) => setSimilarSourceId(e.target.value)}
              className="w-full rounded-lg border border-ev-sand bg-white px-3 py-2 text-sm text-ev-charcoal placeholder:text-ev-warm-gray/50 focus:outline-none focus:border-accent-savanna/40 focus:ring-2 focus:ring-accent-savanna/10"
            />
          </div>
          <div className="flex items-end">
            <button
              onClick={handleFindSimilar}
              disabled={similarLoading || !similarSourceId.trim()}
              className="rounded-lg bg-accent-savanna px-4 py-2 text-sm font-semibold text-ev-ivory hover:bg-accent-savanna/90 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              {similarLoading ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                "Find Similar"
              )}
            </button>
          </div>
        </div>

        {similarError && (
          <div className="rounded-lg border border-danger/20 bg-danger/10 text-danger px-4 py-3 text-sm mb-4">
            {similarError}
          </div>
        )}

        {similarMatches.length > 0 && (
          <div className="space-y-2">
            {similarFingerprintVersion && (
              <p className="text-xs text-ev-warm-gray mb-2">
                Fingerprint version:{" "}
                <span className="font-mono text-xs text-ev-warm-gray">
                  {similarFingerprintVersion}
                </span>
              </p>
            )}
            {similarMatches.map((match) => (
              <div
                key={match.call_id}
                className="flex items-center gap-3 rounded-lg border border-ev-sand bg-white px-4 py-3"
              >
                <span className="font-mono text-xs text-ev-warm-gray shrink-0 w-28 truncate">
                  {match.call_id}
                </span>
                <CallTypeBadge type={match.call_type} />
                <SimilarityBar value={match.similarity} />
              </div>
            ))}
          </div>
        )}

        {!similarLoading &&
          !similarError &&
          similarMatches.length === 0 &&
          similarSourceId.trim() !== "" && (
            <p className="text-sm text-ev-warm-gray">
              No results yet. Press &ldquo;Find Similar&rdquo; to search.
            </p>
          )}
      </div>

      {/* ── Contour Matching ── */}
      <div className="rounded-lg border border-ev-sand bg-ev-cream p-5">
        <div className="flex items-center gap-2 mb-4">
          <Waves className="w-5 h-5 text-accent-savanna" />
          <h2 className="text-lg font-semibold text-ev-charcoal">
            Contour Matching
          </h2>
        </div>

        <div className="flex flex-col sm:flex-row gap-3 mb-4">
          <div className="flex-1">
            <label className="block text-xs text-ev-warm-gray mb-1">
              Source Call ID
            </label>
            <input
              type="text"
              placeholder="Enter call ID"
              value={contourSourceId}
              onChange={(e) => setContourSourceId(e.target.value)}
              className="w-full rounded-lg border border-ev-sand bg-white px-3 py-2 text-sm text-ev-charcoal placeholder:text-ev-warm-gray/50 focus:outline-none focus:border-accent-savanna/40 focus:ring-2 focus:ring-accent-savanna/10"
            />
          </div>
          <div>
            <label className="block text-xs text-ev-warm-gray mb-1">
              Method
            </label>
            <select
              value={contourMethod}
              onChange={(e) =>
                setContourMethod(e.target.value as "dtw" | "pearson")
              }
              className="rounded-lg border border-ev-sand bg-white px-3 py-2 text-sm text-ev-charcoal focus:outline-none focus:border-accent-savanna/40 focus:ring-2 focus:ring-accent-savanna/10"
            >
              <option value="dtw">DTW</option>
              <option value="pearson">Pearson</option>
            </select>
          </div>
          <div className="sm:w-44">
            <label className="block text-xs text-ev-warm-gray mb-1">
              Min Similarity: {Math.round(contourMinSimilarity * 100)}%
            </label>
            <input
              type="range"
              min={0}
              max={100}
              value={Math.round(contourMinSimilarity * 100)}
              onChange={(e) =>
                setContourMinSimilarity(Number(e.target.value) / 100)
              }
              className="w-full accent-accent-savanna"
            />
          </div>
          <div className="flex items-end">
            <button
              onClick={handleMatchContours}
              disabled={contourLoading || !contourSourceId.trim()}
              className="rounded-lg bg-accent-savanna px-4 py-2 text-sm font-semibold text-ev-ivory hover:bg-accent-savanna/90 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              {contourLoading ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                "Match Contours"
              )}
            </button>
          </div>
        </div>

        {contourError && (
          <div className="rounded-lg border border-danger/20 bg-danger/10 text-danger px-4 py-3 text-sm mb-4">
            {contourError}
          </div>
        )}

        {contourTotalCompared !== null && (
          <div className="rounded-lg border border-success/20 bg-success/10 text-success px-4 py-3 text-sm mb-4 flex items-center gap-2">
            <BarChart3 className="w-4 h-4" />
            Compared against {contourTotalCompared} calls &mdash;{" "}
            {contourMatches.length} match
            {contourMatches.length !== 1 ? "es" : ""} found
          </div>
        )}

        {contourMatches.length > 0 && (
          <div className="space-y-2">
            {contourMatches.map((match) => (
              <div
                key={match.call_id}
                className="flex items-center gap-3 rounded-lg border border-ev-sand bg-white px-4 py-3"
              >
                <span className="font-mono text-xs text-ev-warm-gray shrink-0 w-28 truncate">
                  {match.call_id}
                </span>
                <CallTypeBadge type={match.call_type} />
                <SimilarityBar value={match.similarity} />
              </div>
            ))}
          </div>
        )}

        {!contourLoading &&
          !contourError &&
          contourMatches.length === 0 &&
          contourTotalCompared === null &&
          contourSourceId.trim() !== "" && (
            <p className="text-sm text-ev-warm-gray">
              No results yet. Press &ldquo;Match Contours&rdquo; to search.
            </p>
          )}
      </div>
    </main>
  );
}
