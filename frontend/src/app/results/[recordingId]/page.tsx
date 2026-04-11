"use client";

import { useState, useEffect, useCallback } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import {
  getRecording,
  getCalls,
  API_BASE,
  type Recording,
  type Call,
} from "@/lib/audio-api";

function MetricCard({
  label,
  value,
  unit,
  highlight,
}: {
  label: string;
  value: string | number | undefined;
  unit?: string;
  highlight?: boolean;
}) {
  return (
    <div className="p-5 rounded-xl bg-ev-cream border border-ev-sand">
      <p className="text-xs font-medium text-ev-warm-gray uppercase tracking-wider mb-1">
        {label}
      </p>
      {value !== undefined ? (
        <p
          className={`text-2xl font-bold ${highlight ? "text-success" : "text-ev-charcoal"}`}
        >
          {value}
          {unit && (
            <span className="text-sm font-normal text-ev-warm-gray ml-1">
              {unit}
            </span>
          )}
        </p>
      ) : (
        <div className="h-8 w-24 bg-background-elevated rounded animate-pulse" />
      )}
    </div>
  );
}

function ConfidenceBadge({ confidence }: { confidence?: number }) {
  if (confidence === undefined) return null;
  const pct = Math.round(confidence * 100);
  const color =
    pct >= 85
      ? "bg-success/10 text-success border-success/20"
      : pct >= 70
      ? "bg-accent-savanna/10 text-accent-savanna border-accent-savanna/20"
      : pct >= 30
      ? "bg-warning/10 text-warning border-warning/20"
      : "bg-danger/10 text-danger border-danger/20";
  return (
    <span className={`px-2 py-0.5 rounded-full text-xs font-medium border ${color}`}>
      {pct}%
    </span>
  );
}

function CallTypeBadge({ callType }: { callType: string }) {
  const colors: Record<string, string> = {
    rumble: "bg-ev-warm-gray/15 text-ev-elephant",
    trumpet: "bg-accent-savanna/10 text-accent-savanna",
    roar: "bg-danger/10 text-danger",
    bark: "bg-warning/10 text-warning",
    contact_call: "bg-success/10 text-success",
    "contact call": "bg-success/10 text-success",
    greeting: "bg-accent-gold/10 text-accent-gold",
    play: "bg-ev-sand/50 text-ev-elephant",
  };
  const cls = colors[callType] || "bg-background-elevated text-ev-warm-gray";
  return (
    <span className={`px-2.5 py-1 rounded-lg text-xs font-semibold capitalize ${cls}`}>
      {callType}
    </span>
  );
}

function formatMs(ms: number): string {
  const s = ms / 1000;
  const m = Math.floor(s / 60);
  const sec = (s % 60).toFixed(1);
  return m > 0 ? `${m}m ${sec}s` : `${sec}s`;
}

export default function ResultsPage() {
  const params = useParams();
  const recordingId = params.recordingId as string;

  const [recording, setRecording] = useState<Recording | null>(null);
  const [calls, setCalls] = useState<Call[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<"overview" | "calls" | "spectrogram">(
    "overview"
  );
  const [selectedCall, setSelectedCall] = useState<Call | null>(null);

  const fetchData = useCallback(async () => {
    try {
      setLoading(true);
      const [rec, callData] = await Promise.all([
        getRecording(recordingId),
        getCalls({ recording_id: recordingId, limit: 200 }),
      ]);
      setRecording(rec);
      setCalls(callData.calls);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load results");
    } finally {
      setLoading(false);
    }
  }, [recordingId]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const quality = recording?.result?.quality;
  const spectrogramBefore = `${API_BASE}/api/recordings/${recordingId}/spectrogram?type=before`;
  const spectrogramAfter = `${API_BASE}/api/recordings/${recordingId}/spectrogram?type=after`;
  const audioCleaned = `${API_BASE}/api/recordings/${recordingId}/audio?type=cleaned`;
  const audioOriginal = `${API_BASE}/api/recordings/${recordingId}/audio?type=original`;

  if (loading) {
    return (
      <div className="min-h-screen bg-ev-ivory flex items-center justify-center">
        <div className="flex flex-col items-center gap-4">
          <div className="w-10 h-10 border-2 border-accent-savanna border-t-transparent rounded-full animate-spin" />
          <p className="text-ev-elephant">Loading results...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen bg-ev-ivory flex items-center justify-center">
        <div className="text-center p-8">
          <p className="text-danger text-lg mb-4">{error}</p>
          <button
            onClick={fetchData}
            className="px-6 py-3 bg-ev-cream text-ev-charcoal rounded-xl hover:bg-background-elevated transition-colors"
          >
            Retry
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-ev-ivory">
      <div className="max-w-7xl mx-auto px-6 py-12">
        {/* Header */}
        <div className="flex items-start justify-between mb-8 flex-wrap gap-4">
          <div>
            <Link
              href={`/processing/${recordingId}`}
              className="inline-flex items-center gap-2 text-ev-warm-gray hover:text-ev-elephant transition-colors mb-3"
            >
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
              </svg>
              Back to Processing
            </Link>
            <h1 className="text-3xl font-bold text-ev-charcoal">
              {recording?.filename || "Results"}
            </h1>
            <p className="text-ev-warm-gray mt-1 text-sm">
              {calls.length} call{calls.length !== 1 ? "s" : ""} detected
            </p>
          </div>
          <div className="flex items-center gap-3">
            <Link
              href={`/export?recording=${recordingId}`}
              className="inline-flex items-center gap-2 px-5 py-2.5 bg-background-elevated text-ev-charcoal rounded-xl hover:bg-ev-sand transition-colors text-sm font-medium"
            >
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
              </svg>
              Export
            </Link>
            <a
              href={audioCleaned}
              download={`${recording?.filename || recordingId}-cleaned.wav`}
              className="inline-flex items-center gap-2 px-5 py-2.5 bg-accent-savanna text-ev-ivory rounded-xl hover:bg-accent-savanna/90 transition-colors text-sm font-semibold"
            >
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
              </svg>
              Download Cleaned
            </a>
          </div>
        </div>

        {/* Tabs */}
        <div className="flex gap-1 p-1 bg-ev-cream border border-ev-sand rounded-xl mb-8 w-fit">
          {(["overview", "calls", "spectrogram"] as const).map((tab) => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              className={`px-5 py-2 rounded-lg text-sm font-medium transition-all capitalize ${
                activeTab === tab
                  ? "bg-ev-ivory text-ev-charcoal shadow-sm"
                  : "text-ev-warm-gray hover:text-ev-elephant"
              }`}
            >
              {tab}
            </button>
          ))}
        </div>

        {/* Overview Tab */}
        {activeTab === "overview" && (
          <div className="space-y-8">
            {/* Quality Metrics */}
            <div>
              <h2 className="text-lg font-semibold text-ev-charcoal mb-4">
                Quality Metrics
              </h2>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <MetricCard
                  label="SNR Before"
                  value={quality?.snr_before_db?.toFixed(1)}
                  unit="dB"
                />
                <MetricCard
                  label="SNR After"
                  value={quality?.snr_after_db?.toFixed(1)}
                  unit="dB"
                />
                <MetricCard
                  label="SNR Improvement"
                  value={
                    quality?.snr_improvement_db !== undefined
                      ? `+${quality.snr_improvement_db.toFixed(1)}`
                      : undefined
                  }
                  unit="dB"
                  highlight
                />
                <MetricCard
                  label="Quality Score"
                  value={quality?.quality_score?.toFixed(0)}
                  unit="/ 100"
                  highlight
                />
              </div>
              <div className="grid grid-cols-2 md:grid-cols-3 gap-4 mt-4">
                <MetricCard
                  label="Energy Preservation"
                  value={
                    quality?.energy_preservation !== undefined
                      ? `${(quality.energy_preservation * 100).toFixed(1)}`
                      : undefined
                  }
                  unit="%"
                />
                <MetricCard
                  label="Spectral Distortion"
                  value={quality?.spectral_distortion?.toFixed(3)}
                />
                <MetricCard
                  label="Calls Detected"
                  value={calls.length}
                />
              </div>
            </div>

            {/* Audio Playback */}
            <div className="p-6 rounded-xl bg-ev-cream border border-ev-sand">
              <h2 className="text-lg font-semibold text-ev-charcoal mb-5">
                Audio Comparison
              </h2>
              <div className="grid md:grid-cols-2 gap-6">
                <div>
                  <p className="text-sm text-ev-warm-gray mb-2">Original Recording</p>
                  <audio controls className="w-full" preload="metadata">
                    <source src={audioOriginal} />
                  </audio>
                </div>
                <div>
                  <p className="text-sm text-ev-warm-gray mb-2">Cleaned Audio</p>
                  <audio controls className="w-full" preload="metadata">
                    <source src={audioCleaned} />
                  </audio>
                </div>
              </div>
            </div>

            {/* Recent Calls Preview */}
            {calls.length > 0 && (
              <div>
                <div className="flex items-center justify-between mb-4">
                  <h2 className="text-lg font-semibold text-ev-charcoal">
                    Detected Calls
                  </h2>
                  <button
                    onClick={() => setActiveTab("calls")}
                    className="text-sm text-accent-savanna hover:underline"
                  >
                    View all {calls.length}
                  </button>
                </div>
                <div className="grid gap-3">
                  {calls.slice(0, 4).map((call) => (
                    <div
                      key={call.id}
                      onClick={() => {
                        setSelectedCall(call);
                        setActiveTab("calls");
                      }}
                      className="flex items-center justify-between p-4 rounded-xl bg-ev-cream border border-ev-sand hover:border-ev-warm-gray/30 cursor-pointer transition-all"
                    >
                      <div className="flex items-center gap-3">
                        <CallTypeBadge callType={call.call_type} />
                        <span className="text-sm text-ev-elephant">
                          at {formatMs(call.start_ms)}
                        </span>
                        <span className="text-sm text-ev-warm-gray">
                          {formatMs(call.duration_ms)} long
                        </span>
                      </div>
                      <ConfidenceBadge confidence={call.confidence} />
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        {/* Calls Tab */}
        {activeTab === "calls" && (
          <div className="grid lg:grid-cols-[1fr_360px] gap-8">
            <div>
              <h2 className="text-lg font-semibold text-ev-charcoal mb-4">
                All Detected Calls ({calls.length})
              </h2>
              {calls.length === 0 ? (
                <div className="p-12 rounded-xl bg-ev-cream border border-ev-sand text-center">
                  <p className="text-ev-warm-gray">No calls detected in this recording.</p>
                </div>
              ) : (
                <div className="space-y-3">
                  {calls.map((call) => (
                    <div
                      key={call.id}
                      onClick={() => setSelectedCall(call)}
                      className={`p-5 rounded-xl border cursor-pointer transition-all ${
                        selectedCall?.id === call.id
                          ? "bg-accent-savanna/5 border-accent-savanna/40"
                          : "bg-ev-cream border-ev-sand hover:border-ev-warm-gray/30"
                      }`}
                    >
                      <div className="flex items-center justify-between flex-wrap gap-3">
                        <div className="flex items-center gap-3 flex-wrap">
                          <CallTypeBadge callType={call.call_type} />
                          <div className="text-sm text-ev-elephant">
                            <span className="font-medium">
                              {formatMs(call.start_ms)}
                            </span>
                            <span className="text-ev-warm-gray mx-1">→</span>
                            <span className="text-ev-warm-gray">
                              {formatMs(call.start_ms + call.duration_ms)}
                            </span>
                          </div>
                        </div>
                        <div className="flex items-center gap-2">
                          <span className="text-xs text-ev-warm-gray">
                            {formatMs(call.duration_ms)}
                          </span>
                          <ConfidenceBadge confidence={call.confidence} />
                        </div>
                      </div>
                      {(call.frequency_min_hz || call.frequency_max_hz) && (
                        <div className="flex gap-4 mt-2 text-xs text-ev-warm-gray">
                          {call.frequency_min_hz && (
                            <span>Low: {call.frequency_min_hz.toFixed(0)} Hz</span>
                          )}
                          {call.frequency_max_hz && (
                            <span>High: {call.frequency_max_hz.toFixed(0)} Hz</span>
                          )}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Call Detail Panel */}
            {selectedCall && (
              <div className="p-6 rounded-xl bg-ev-cream border border-ev-sand h-fit sticky top-6">
                <div className="flex items-center justify-between mb-5">
                  <h3 className="text-base font-semibold text-ev-charcoal">
                    Call Detail
                  </h3>
                  <button
                    onClick={() => setSelectedCall(null)}
                    className="text-ev-warm-gray hover:text-ev-elephant"
                  >
                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                    </svg>
                  </button>
                </div>
                <div className="space-y-4">
                  <div className="flex items-center gap-2">
                    <CallTypeBadge callType={selectedCall.call_type} />
                    <ConfidenceBadge confidence={selectedCall.confidence} />
                  </div>
                  <dl className="space-y-3 text-sm">
                    <div className="flex justify-between">
                      <dt className="text-ev-warm-gray">Start</dt>
                      <dd className="text-ev-charcoal font-medium">
                        {formatMs(selectedCall.start_ms)}
                      </dd>
                    </div>
                    <div className="flex justify-between">
                      <dt className="text-ev-warm-gray">Duration</dt>
                      <dd className="text-ev-charcoal font-medium">
                        {formatMs(selectedCall.duration_ms)}
                      </dd>
                    </div>
                    {selectedCall.frequency_min_hz && (
                      <div className="flex justify-between">
                        <dt className="text-ev-warm-gray">Freq Low</dt>
                        <dd className="text-ev-charcoal font-mono">
                          {selectedCall.frequency_min_hz.toFixed(1)} Hz
                        </dd>
                      </div>
                    )}
                    {selectedCall.frequency_max_hz && (
                      <div className="flex justify-between">
                        <dt className="text-ev-warm-gray">Freq High</dt>
                        <dd className="text-ev-charcoal font-mono">
                          {selectedCall.frequency_max_hz.toFixed(1)} Hz
                        </dd>
                      </div>
                    )}
                    {selectedCall.animal_id && (
                      <div className="flex justify-between">
                        <dt className="text-ev-warm-gray">Animal ID</dt>
                        <dd className="text-ev-charcoal">{selectedCall.animal_id}</dd>
                      </div>
                    )}
                    <div className="flex justify-between">
                      <dt className="text-ev-warm-gray">Call ID</dt>
                      <dd className="text-ev-elephant font-mono text-xs">
                        {selectedCall.id.slice(0, 16)}...
                      </dd>
                    </div>
                  </dl>
                  {selectedCall.acoustic_features &&
                    Object.keys(selectedCall.acoustic_features).length > 0 && (
                      <div>
                        <p className="text-xs font-medium text-ev-warm-gray uppercase tracking-wider mb-2">
                          Acoustic Features
                        </p>
                        <div className="space-y-1">
                          {Object.entries(selectedCall.acoustic_features)
                            .slice(0, 6)
                            .map(([k, v]) => (
                              <div key={k} className="flex justify-between text-xs">
                                <span className="text-ev-warm-gray capitalize">
                                  {k.replace(/_/g, " ")}
                                </span>
                                <span className="text-ev-elephant font-mono">
                                  {typeof v === "number" ? v.toFixed(3) : String(v)}
                                </span>
                              </div>
                            ))}
                        </div>
                      </div>
                    )}
                </div>
              </div>
            )}
          </div>
        )}

        {/* Spectrogram Tab */}
        {activeTab === "spectrogram" && (
          <div className="space-y-8">
            <div className="grid md:grid-cols-2 gap-6">
              <div className="p-6 rounded-xl bg-ev-cream border border-ev-sand">
                <h3 className="text-base font-semibold text-ev-charcoal mb-4">
                  Before Denoising
                </h3>
                <img
                  src={spectrogramBefore}
                  alt="Spectrogram before denoising"
                  className="w-full rounded-lg border border-ev-sand"
                />
              </div>
              <div className="p-6 rounded-xl bg-ev-cream border border-ev-sand">
                <h3 className="text-base font-semibold text-ev-charcoal mb-4">
                  After Denoising
                </h3>
                <img
                  src={spectrogramAfter}
                  alt="Spectrogram after denoising"
                  className="w-full rounded-lg border border-ev-sand"
                />
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
