"use client";

import { useState, useEffect, useCallback } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { API_BASE } from "@/lib/api";
import {
  getRecording,
  getCalls,
  getRecordingSpectrogram,
  downloadRecording,
  type Recording,
  type Call,
} from "@/lib/audio-api";

// ---- Sub-components ----

const CALL_TYPE_COLORS: Record<string, { bg: string; text: string; border: string }> = {
  contact: { bg: "bg-accent-teal/10", text: "text-accent-teal", border: "border-accent-teal/30" },
  alarm:   { bg: "bg-danger/10",      text: "text-danger",      border: "border-danger/30" },
  song:    { bg: "bg-gold/10",        text: "text-gold",        border: "border-gold/30" },
  social:  { bg: "bg-success/10",     text: "text-success",     border: "border-success/30" },
  feeding: { bg: "bg-warning/10",     text: "text-warning",     border: "border-warning/30" },
  mating:  { bg: "bg-[#A78BFA]/10",   text: "text-[#A78BFA]",  border: "border-[#A78BFA]/30" },
};

function CallTypeBadge({ type }: { type: string }) {
  const colors = CALL_TYPE_COLORS[type] || {
    bg: "bg-echofield-surface-elevated",
    text: "text-echofield-text-secondary",
    border: "border-echofield-border",
  };
  return (
    <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold uppercase tracking-wide border ${colors.bg} ${colors.text} ${colors.border}`}>
      {type}
    </span>
  );
}

function ConfidenceBar({ value }: { value: number }) {
  const pct = Math.round(value * 100);
  const color = pct >= 80 ? "#10C876" : pct >= 60 ? "#F5A025" : "#EF4444";
  return (
    <div className="flex items-center gap-2">
      <div className="flex-1 h-1.5 bg-echofield-surface-elevated rounded-full overflow-hidden">
        <div className="h-full rounded-full" style={{ width: `${pct}%`, backgroundColor: color }} />
      </div>
      <span className="text-xs font-mono text-echofield-text-secondary w-8 text-right">{pct}%</span>
    </div>
  );
}

function MetricCard({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="p-4 rounded-xl bg-echofield-surface border border-echofield-border">
      <p className="text-[10px] uppercase tracking-wider text-echofield-text-muted mb-1">{label}</p>
      <p className="text-xl font-bold text-echofield-text-primary font-mono">{value}</p>
      {sub && <p className="text-xs text-echofield-text-muted mt-0.5">{sub}</p>}
    </div>
  );
}

function CallDetailPanel({ call, onClose }: { call: Call; onClose: () => void }) {
  const freqLow = call.frequency_low ?? 0;
  const freqHigh = call.frequency_high ?? 0;
  const duration = (call.end_time - call.start_time).toFixed(2);

  return (
    <div className="fixed inset-y-0 right-0 w-80 bg-echofield-surface border-l border-echofield-border shadow-2xl z-50 overflow-y-auto">
      <div className="flex items-center justify-between px-5 py-4 border-b border-echofield-border sticky top-0 bg-echofield-surface">
        <h3 className="font-semibold text-echofield-text-primary">Call Analysis</h3>
        <button
          onClick={onClose}
          className="p-1.5 rounded-lg hover:bg-echofield-surface-elevated text-echofield-text-muted transition-colors"
        >
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      </div>

      <div className="p-5 space-y-5">
        <div className="flex items-center gap-2">
          <CallTypeBadge type={call.call_type} />
          <span className="text-xs font-mono text-echofield-text-muted">#{call.id.slice(0, 8)}</span>
        </div>

        <div className="space-y-3">
          <h4 className="text-xs uppercase tracking-wider text-echofield-text-muted font-medium">Timing</h4>
          <div className="grid grid-cols-2 gap-2 text-sm">
            <div>
              <p className="text-echofield-text-muted text-xs">Start</p>
              <p className="text-echofield-text-primary font-mono">{call.start_time.toFixed(2)}s</p>
            </div>
            <div>
              <p className="text-echofield-text-muted text-xs">End</p>
              <p className="text-echofield-text-primary font-mono">{call.end_time.toFixed(2)}s</p>
            </div>
            <div className="col-span-2">
              <p className="text-echofield-text-muted text-xs">Duration</p>
              <p className="text-echofield-text-primary font-mono">{duration}s</p>
            </div>
          </div>
        </div>

        <div className="space-y-3">
          <h4 className="text-xs uppercase tracking-wider text-echofield-text-muted font-medium">Frequency</h4>
          <div className="grid grid-cols-2 gap-2 text-sm">
            <div>
              <p className="text-echofield-text-muted text-xs">Low</p>
              <p className="text-echofield-text-primary font-mono">{freqLow} Hz</p>
            </div>
            <div>
              <p className="text-echofield-text-muted text-xs">High</p>
              <p className="text-echofield-text-primary font-mono">{freqHigh} Hz</p>
            </div>
            <div className="col-span-2">
              <p className="text-echofield-text-muted text-xs">Bandwidth</p>
              <p className="text-echofield-text-primary font-mono">{freqHigh - freqLow} Hz</p>
            </div>
          </div>
        </div>

        {call.confidence !== undefined && (
          <div className="space-y-2">
            <h4 className="text-xs uppercase tracking-wider text-echofield-text-muted font-medium">Detection Confidence</h4>
            <ConfidenceBar value={call.confidence} />
          </div>
        )}

        {call.metadata && Object.keys(call.metadata).length > 0 && (
          <div className="space-y-2">
            <h4 className="text-xs uppercase tracking-wider text-echofield-text-muted font-medium">Acoustic Features</h4>
            <div className="space-y-2">
              {Object.entries(call.metadata).map(([key, val]) => (
                <div key={key} className="flex justify-between text-sm">
                  <span className="text-echofield-text-muted capitalize">{key.replace(/_/g, " ")}</span>
                  <span className="text-echofield-text-primary font-mono">
                    {typeof val === "number" ? val.toFixed(2) : String(val)}
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// ---- Main Page ----

export default function ResultsPage() {
  const params = useParams();
  const recordingId = params.recordingId as string;

  const [recording, setRecording] = useState<Recording | null>(null);
  const [calls, setCalls] = useState<Call[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedCall, setSelectedCall] = useState<Call | null>(null);
  const [activeTab, setActiveTab] = useState<"overview" | "calls" | "spectrogram">("overview");
  const [downloading, setDownloading] = useState(false);

  const fetchData = useCallback(async () => {
    try {
      setLoading(true);
      const [rec, callData] = await Promise.all([
        getRecording(recordingId),
        getCalls({ recording_id: recordingId, limit: 100 }),
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

  const handleDownload = async () => {
    if (downloading) return;
    try {
      setDownloading(true);
      await downloadRecording(recordingId);
    } catch {
      // silently fail — user sees nothing if download fails
    } finally {
      setDownloading(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-[60vh] flex items-center justify-center">
        <div className="flex flex-col items-center gap-4">
          <div className="w-10 h-10 border-2 border-accent-teal border-t-transparent rounded-full animate-spin" />
          <p className="text-echofield-text-secondary">Loading results...</p>
        </div>
      </div>
    );
  }

  if (error || !recording) {
    return (
      <div className="min-h-[60vh] flex items-center justify-center">
        <div className="text-center p-8 max-w-md">
          <div className="w-12 h-12 rounded-full bg-danger/10 flex items-center justify-center mx-auto mb-4">
            <svg className="w-6 h-6 text-danger" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
          </div>
          <p className="text-echofield-text-primary font-semibold mb-2">Failed to load results</p>
          <p className="text-echofield-text-secondary text-sm mb-6">{error}</p>
          <button
            onClick={fetchData}
            className="px-6 py-3 bg-echofield-surface border border-echofield-border text-echofield-text-primary rounded-xl hover:bg-echofield-surface-elevated transition-colors"
          >
            Try Again
          </button>
        </div>
      </div>
    );
  }

  const metadata = recording.metadata as Record<string, unknown> | undefined;
  const snrBefore = metadata?.snr_before as number | undefined;
  const snrAfter = metadata?.snr_after as number | undefined;
  const qualityScore = metadata?.quality_score as number | undefined;
  const noiseReductionDb = metadata?.noise_reduction_db as number | undefined;

  const spectrogramBefore = `${API_BASE}/api/recordings/${recordingId}/spectrogram?type=before`;
  const spectrogramAfter = getRecordingSpectrogram(recordingId);
  const audioOriginal = `${API_BASE}/api/recordings/${recordingId}/audio?type=original`;
  const audioCleaned = `${API_BASE}/api/recordings/${recordingId}/audio?type=cleaned`;

  const callTypeCounts = calls.reduce<Record<string, number>>((acc, c) => {
    acc[c.call_type] = (acc[c.call_type] || 0) + 1;
    return acc;
  }, {});

  return (
    <div className="max-w-7xl mx-auto px-6 py-8">
      {/* Breadcrumb */}
      <div className="flex items-center gap-2 text-sm text-echofield-text-muted mb-6">
        <Link href="/upload" className="hover:text-echofield-text-secondary transition-colors">Recordings</Link>
        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
        </svg>
        <Link href={`/processing/${recordingId}`} className="hover:text-echofield-text-secondary transition-colors">
          Processing
        </Link>
        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
        </svg>
        <span className="text-echofield-text-primary">Results</span>
      </div>

      {/* Header */}
      <div className="flex items-start justify-between gap-4 mb-8 flex-wrap">
        <div>
          <h1 className="text-3xl font-bold text-echofield-text-primary mb-1">{recording.filename}</h1>
          <div className="flex items-center gap-3 text-sm text-echofield-text-muted">
            {recording.duration && (
              <span>{Math.floor(recording.duration / 60)}m {Math.floor(recording.duration % 60)}s</span>
            )}
            {recording.location && <span className="text-echofield-border">·</span>}
            {recording.location && <span>{recording.location}</span>}
            {recording.sample_rate && <span className="text-echofield-border">·</span>}
            {recording.sample_rate && <span>{(recording.sample_rate / 1000).toFixed(1)} kHz</span>}
          </div>
        </div>
        <div className="flex items-center gap-3">
          <Link
            href={`/export?recording=${recordingId}`}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-xl border border-echofield-border bg-echofield-surface text-echofield-text-primary text-sm font-medium hover:bg-echofield-surface-elevated transition-colors"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
            </svg>
            Export Data
          </Link>
          <button
            onClick={handleDownload}
            disabled={downloading}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-accent-teal text-echofield-bg text-sm font-semibold hover:bg-accent-teal/90 transition-colors disabled:opacity-60"
          >
            {downloading ? (
              <div className="w-4 h-4 border-2 border-echofield-bg border-t-transparent rounded-full animate-spin" />
            ) : (
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M9 19l3 3m0 0l3-3m-3 3V10" />
              </svg>
            )}
            Download Cleaned
          </button>
        </div>
      </div>

      {/* Metrics Row */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
        <MetricCard
          label="Calls Detected"
          value={String(calls.length)}
          sub={`across ${Object.keys(callTypeCounts).length} call type${Object.keys(callTypeCounts).length !== 1 ? "s" : ""}`}
        />
        <MetricCard
          label="Quality Score"
          value={qualityScore !== undefined ? String(Math.round(qualityScore)) : "--"}
          sub={qualityScore !== undefined
            ? qualityScore >= 90 ? "Excellent" : qualityScore >= 75 ? "Good" : qualityScore >= 50 ? "Fair" : "Poor"
            : undefined}
        />
        <MetricCard
          label="SNR Improvement"
          value={snrBefore !== undefined && snrAfter !== undefined
            ? `+${(snrAfter - snrBefore).toFixed(1)} dB`
            : "--"}
          sub={snrAfter !== undefined ? `${snrAfter.toFixed(1)} dB after` : undefined}
        />
        <MetricCard
          label="Noise Reduction"
          value={noiseReductionDb !== undefined ? `${noiseReductionDb.toFixed(1)} dB` : "--"}
          sub="spectral gating"
        />
      </div>

      {/* Tabs */}
      <div className="flex gap-1 p-1 bg-echofield-surface rounded-xl border border-echofield-border mb-6 w-fit">
        {(["overview", "calls", "spectrogram"] as const).map((tab) => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            className={`px-5 py-2 rounded-lg text-sm font-medium capitalize transition-all ${
              activeTab === tab
                ? "bg-accent-teal text-echofield-bg shadow"
                : "text-echofield-text-secondary hover:text-echofield-text-primary"
            }`}
          >
            {tab}
            {tab === "calls" && calls.length > 0 && (
              <span className={`ml-1.5 px-1.5 py-0.5 rounded-full text-[10px] font-bold ${
                activeTab === tab ? "bg-echofield-bg/20 text-echofield-bg" : "bg-echofield-surface-elevated text-echofield-text-muted"
              }`}>
                {calls.length}
              </span>
            )}
          </button>
        ))}
      </div>

      {/* Tab Content */}
      {activeTab === "overview" && (
        <div className="grid lg:grid-cols-2 gap-6">
          {/* Audio Playback */}
          <div className="p-6 rounded-xl bg-echofield-surface border border-echofield-border space-y-5">
            <h2 className="text-base font-semibold text-echofield-text-primary">Audio Playback</h2>
            <div>
              <p className="text-xs text-echofield-text-muted mb-2 uppercase tracking-wider">Original</p>
              <audio controls className="w-full" preload="metadata">
                <source src={audioOriginal} type="audio/wav" />
              </audio>
            </div>
            <div>
              <p className="text-xs text-echofield-text-muted mb-2 uppercase tracking-wider">Cleaned</p>
              <audio controls className="w-full" preload="metadata">
                <source src={audioCleaned} type="audio/wav" />
              </audio>
            </div>
          </div>

          {/* Call Type Breakdown */}
          <div className="p-6 rounded-xl bg-echofield-surface border border-echofield-border">
            <h2 className="text-base font-semibold text-echofield-text-primary mb-4">Call Type Breakdown</h2>
            {calls.length === 0 ? (
              <p className="text-echofield-text-muted text-sm">No calls detected in this recording.</p>
            ) : (
              <div className="space-y-3">
                {Object.entries(callTypeCounts)
                  .sort((a, b) => b[1] - a[1])
                  .map(([type, count]) => {
                    const colors = CALL_TYPE_COLORS[type] || {
                      bg: "bg-echofield-surface-elevated",
                      text: "text-echofield-text-secondary",
                      border: "border-echofield-border",
                    };
                    const pct = Math.round((count / calls.length) * 100);
                    return (
                      <div key={type}>
                        <div className="flex items-center justify-between mb-1">
                          <div className="flex items-center gap-2">
                            <span className={`px-2 py-0.5 rounded text-xs font-semibold uppercase ${colors.bg} ${colors.text}`}>
                              {type}
                            </span>
                            <span className="text-sm text-echofield-text-secondary">{count} calls</span>
                          </div>
                          <span className="text-xs text-echofield-text-muted">{pct}%</span>
                        </div>
                        <div className="h-1.5 bg-echofield-surface-elevated rounded-full overflow-hidden">
                          <div
                            className="h-full rounded-full transition-all"
                            style={{
                              width: `${pct}%`,
                              backgroundColor: CALL_TYPE_COLORS[type]?.text.replace("text-[", "").replace("]", "") || "#00D9FF",
                            }}
                          />
                        </div>
                      </div>
                    );
                  })}
              </div>
            )}
          </div>

          {/* Recording Info */}
          <div className="p-6 rounded-xl bg-echofield-surface border border-echofield-border">
            <h2 className="text-base font-semibold text-echofield-text-primary mb-4">Recording Info</h2>
            <dl className="space-y-3 text-sm">
              {[
                { label: "ID", value: recording.id.slice(0, 16) + "…", mono: true },
                { label: "Filename", value: recording.filename, mono: false },
                { label: "Status", value: recording.status, mono: false },
                { label: "Duration", value: recording.duration ? `${recording.duration.toFixed(1)}s` : "--", mono: true },
                { label: "Sample Rate", value: recording.sample_rate ? `${(recording.sample_rate / 1000).toFixed(1)} kHz` : "--", mono: true },
                { label: "File Size", value: recording.file_size ? `${(recording.file_size / (1024 * 1024)).toFixed(1)} MB` : "--", mono: true },
                { label: "Location", value: recording.location || "--", mono: false },
              ].map(({ label, value, mono }) => (
                <div key={label} className="flex justify-between gap-4">
                  <dt className="text-echofield-text-muted shrink-0">{label}</dt>
                  <dd className={`text-echofield-text-secondary truncate ${mono ? "font-mono text-xs" : ""}`}>{value}</dd>
                </div>
              ))}
            </dl>
          </div>

          {/* SNR Detail */}
          {(snrBefore !== undefined || snrAfter !== undefined) && (
            <div className="p-6 rounded-xl bg-echofield-surface border border-echofield-border">
              <h2 className="text-base font-semibold text-echofield-text-primary mb-4">Signal-to-Noise Ratio</h2>
              <div className="space-y-4">
                {snrBefore !== undefined && (
                  <div>
                    <div className="flex justify-between mb-1">
                      <span className="text-sm text-echofield-text-secondary">Before</span>
                      <span className="text-sm font-mono text-warning">{snrBefore.toFixed(1)} dB</span>
                    </div>
                    <div className="h-2 bg-echofield-surface-elevated rounded-full overflow-hidden">
                      <div className="h-full bg-warning rounded-full" style={{ width: `${Math.min(100, (snrBefore / 40) * 100)}%` }} />
                    </div>
                  </div>
                )}
                {snrAfter !== undefined && (
                  <div>
                    <div className="flex justify-between mb-1">
                      <span className="text-sm text-echofield-text-secondary">After</span>
                      <span className="text-sm font-mono text-success">{snrAfter.toFixed(1)} dB</span>
                    </div>
                    <div className="h-2 bg-echofield-surface-elevated rounded-full overflow-hidden">
                      <div className="h-full bg-success rounded-full" style={{ width: `${Math.min(100, (snrAfter / 40) * 100)}%` }} />
                    </div>
                  </div>
                )}
                {snrBefore !== undefined && snrAfter !== undefined && (
                  <div className="pt-3 border-t border-echofield-border flex justify-between text-sm">
                    <span className="text-echofield-text-muted">Improvement</span>
                    <span className="text-success font-bold">+{(snrAfter - snrBefore).toFixed(1)} dB</span>
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      )}

      {activeTab === "calls" && (
        <div>
          {calls.length === 0 ? (
            <div className="py-20 text-center">
              <div className="w-12 h-12 rounded-full bg-echofield-surface-elevated flex items-center justify-center mx-auto mb-4">
                <svg className="w-6 h-6 text-echofield-text-muted" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 19V6l12-3v13M9 19c0 1.105-1.343 2-3 2s-3-.895-3-2 1.343-2 3-2 3 .895 3 2z" />
                </svg>
              </div>
              <p className="text-echofield-text-primary font-medium mb-1">No calls detected</p>
              <p className="text-echofield-text-muted text-sm">The pipeline did not detect any elephant vocalizations in this recording.</p>
            </div>
          ) : (
            <div className="grid sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
              {calls.map((call) => (
                <button
                  key={call.id}
                  onClick={() => setSelectedCall(call)}
                  className="w-full text-left rounded-xl border border-echofield-border bg-echofield-surface p-4 space-y-3 hover:border-accent-teal/40 hover:bg-echofield-surface-elevated transition-all group"
                >
                  <div className="flex items-center justify-between">
                    <CallTypeBadge type={call.call_type} />
                    <span className="text-[11px] font-mono text-echofield-text-muted group-hover:text-echofield-text-secondary transition-colors">
                      #{call.id.slice(0, 6)}
                    </span>
                  </div>
                  <div className="grid grid-cols-2 gap-2 text-xs">
                    <div>
                      <p className="text-echofield-text-muted mb-0.5">Duration</p>
                      <p className="text-echofield-text-primary font-mono">
                        {(call.end_time - call.start_time).toFixed(2)}s
                      </p>
                    </div>
                    <div>
                      <p className="text-echofield-text-muted mb-0.5">Start</p>
                      <p className="text-echofield-text-primary font-mono">{call.start_time.toFixed(2)}s</p>
                    </div>
                    {call.frequency_low !== undefined && call.frequency_high !== undefined && (
                      <div className="col-span-2">
                        <p className="text-echofield-text-muted mb-0.5">Frequency</p>
                        <p className="text-echofield-text-primary font-mono">
                          {call.frequency_low} – {call.frequency_high} Hz
                        </p>
                      </div>
                    )}
                  </div>
                  {call.confidence !== undefined && (
                    <ConfidenceBar value={call.confidence} />
                  )}
                </button>
              ))}
            </div>
          )}
        </div>
      )}

      {activeTab === "spectrogram" && (
        <div className="space-y-6">
          <div className="grid lg:grid-cols-2 gap-6">
            <div className="p-5 rounded-xl bg-echofield-surface border border-echofield-border">
              <p className="text-xs uppercase tracking-wider text-echofield-text-muted mb-3">Original</p>
              <img
                src={spectrogramBefore}
                alt="Original spectrogram"
                className="w-full rounded-lg border border-echofield-border"
                onError={(e) => { (e.target as HTMLImageElement).style.display = "none"; }}
              />
            </div>
            <div className="p-5 rounded-xl bg-echofield-surface border border-echofield-border">
              <p className="text-xs uppercase tracking-wider text-echofield-text-muted mb-3">Cleaned</p>
              <img
                src={spectrogramAfter}
                alt="Cleaned spectrogram"
                className="w-full rounded-lg border border-echofield-border"
                onError={(e) => { (e.target as HTMLImageElement).style.display = "none"; }}
              />
            </div>
          </div>
          <p className="text-xs text-echofield-text-muted text-center">
            Mel-scale spectrograms · 0 – 1000 Hz range · Time on x-axis, frequency on y-axis
          </p>
        </div>
      )}

      {/* Call Detail Slide-over */}
      {selectedCall && (
        <>
          <div
            className="fixed inset-0 bg-black/40 z-40"
            onClick={() => setSelectedCall(null)}
          />
          <CallDetailPanel call={selectedCall} onClose={() => setSelectedCall(null)} />
        </>
      )}
    </div>
  );
}
