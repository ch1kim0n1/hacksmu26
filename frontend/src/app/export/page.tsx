"use client";

import { useState, useEffect, useCallback, Suspense } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
import {
  getRecordings,
  exportResearch,
  API_BASE,
  type Recording,
} from "@/lib/audio-api";

// ---- Format definitions ----

interface ExportFormat {
  id: string;
  label: string;
  description: string;
  ext: string;
  icon: string;
}

const FORMATS: ExportFormat[] = [
  {
    id: "csv",
    label: "CSV",
    description: "Spreadsheet-friendly call catalog with acoustic metrics",
    ext: ".csv",
    icon: "M9 17v-2m3 2v-4m3 4v-6m2 10H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z",
  },
  {
    id: "json",
    label: "JSON",
    description: "Full structured data for programmatic analysis",
    ext: ".json",
    icon: "M10 20l4-16m4 4l4 4-4 4M6 16l-4-4 4-4",
  },
  {
    id: "wav",
    label: "WAV Audio",
    description: "Cleaned audio file ready for playback and analysis",
    ext: ".wav",
    icon: "M9 19V6l12-3v13M9 19c0 1.105-1.343 2-3 2s-3-.895-3-2 1.343-2 3-2 3 .895 3 2zm12-3c0 1.105-1.343 2-3 2s-3-.895-3-2 1.343-2 3-2 3 .895 3 2zM9 10l12-3",
  },
  {
    id: "png",
    label: "Spectrogram PNG",
    description: "High-resolution spectrogram images for publications",
    ext: ".png",
    icon: "M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z",
  },
];

// ---- Recording selector ----

function RecordingRow({
  recording,
  selected,
  onToggle,
}: {
  recording: Recording;
  selected: boolean;
  onToggle: () => void;
}) {
  const statusColors: Record<string, string> = {
    complete: "text-success bg-success/10",
    processing: "text-warning bg-warning/10",
    failed: "text-danger bg-danger/10",
    pending: "text-echofield-text-muted bg-echofield-surface-elevated",
  };
  const color = statusColors[recording.status] || statusColors.pending;

  return (
    <label
      className={`flex items-center gap-4 p-4 rounded-xl border cursor-pointer transition-all ${
        selected
          ? "border-accent-teal/50 bg-accent-teal/5"
          : "border-echofield-border bg-echofield-surface hover:border-echofield-text-muted/40"
      }`}
    >
      <input
        type="checkbox"
        checked={selected}
        onChange={onToggle}
        className="w-4 h-4 rounded accent-[#00D9FF] shrink-0"
      />
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium text-echofield-text-primary truncate">{recording.filename}</p>
        <div className="flex items-center gap-2 mt-0.5 text-xs text-echofield-text-muted">
          {recording.duration && <span>{recording.duration.toFixed(1)}s</span>}
          {recording.location && <><span>·</span><span>{recording.location}</span></>}
        </div>
      </div>
      <span className={`px-2 py-0.5 rounded-full text-xs font-medium capitalize ${color}`}>
        {recording.status}
      </span>
    </label>
  );
}

// ---- Main export page (needs Suspense for useSearchParams) ----

function ExportPageInner() {
  const searchParams = useSearchParams();
  const preselectedId = searchParams.get("recording");

  const [recordings, setRecordings] = useState<Recording[]>([]);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [selectedFormat, setSelectedFormat] = useState<string>("csv");
  const [loading, setLoading] = useState(true);
  const [exporting, setExporting] = useState(false);
  const [exportResult, setExportResult] = useState<{ url: string; format: string; count: number } | null>(null);
  const [error, setError] = useState<string | null>(null);

  const fetchRecordings = useCallback(async () => {
    try {
      setLoading(true);
      const data = await getRecordings({ status: "complete", limit: 100 });
      setRecordings(data.recordings);
      if (preselectedId) {
        setSelectedIds(new Set([preselectedId]));
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load recordings");
    } finally {
      setLoading(false);
    }
  }, [preselectedId]);

  useEffect(() => {
    fetchRecordings();
  }, [fetchRecordings]);

  const toggleRecording = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  };

  const toggleAll = () => {
    if (selectedIds.size === recordings.length) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(recordings.map((r) => r.id)));
    }
  };

  const handleExport = async () => {
    if (selectedIds.size === 0 || exporting) return;
    setExporting(true);
    setExportResult(null);
    setError(null);

    try {
      if (selectedFormat === "wav" || selectedFormat === "png") {
        // For audio/image formats, download the first selected recording directly
        const id = [...selectedIds][0];
        const url =
          selectedFormat === "wav"
            ? `${API_BASE}/api/recordings/${id}/audio?type=cleaned`
            : `${API_BASE}/api/recordings/${id}/spectrogram?type=after`;

        const a = document.createElement("a");
        a.href = url;
        a.download = `echofield-${id}.${selectedFormat}`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);

        setExportResult({ url, format: selectedFormat, count: 1 });
      } else {
        const result = await exportResearch({
          format: selectedFormat,
          recording_ids: [...selectedIds],
        });
        setExportResult({
          url: result.download_url,
          format: result.format,
          count: result.recording_count,
        });

        // Auto-trigger download
        const a = document.createElement("a");
        a.href = result.download_url;
        a.download = `echofield-export.${selectedFormat}`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Export failed");
    } finally {
      setExporting(false);
    }
  };

  const allSelected = recordings.length > 0 && selectedIds.size === recordings.length;
  const someSelected = selectedIds.size > 0 && selectedIds.size < recordings.length;
  const selectedFormat_ = FORMATS.find((f) => f.id === selectedFormat)!;

  return (
    <div className="max-w-5xl mx-auto px-6 py-8">
      {/* Header */}
      <div className="mb-8">
        <Link
          href="/upload"
          className="inline-flex items-center gap-1.5 text-sm text-echofield-text-muted hover:text-echofield-text-secondary transition-colors mb-4"
        >
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
          </svg>
          Back
        </Link>
        <h1 className="text-3xl font-bold text-echofield-text-primary mb-2">Export Data</h1>
        <p className="text-echofield-text-secondary">
          Download cleaned audio, spectrograms, and acoustic metrics for research use.
        </p>
      </div>

      <div className="grid lg:grid-cols-[1fr_320px] gap-8">
        {/* Left: Format + Recordings */}
        <div className="space-y-6">
          {/* Format Selection */}
          <section>
            <h2 className="text-sm font-semibold text-echofield-text-primary uppercase tracking-wider mb-3">
              Export Format
            </h2>
            <div className="grid sm:grid-cols-2 gap-3">
              {FORMATS.map((fmt) => (
                <button
                  key={fmt.id}
                  onClick={() => setSelectedFormat(fmt.id)}
                  className={`flex items-start gap-3 p-4 rounded-xl border text-left transition-all ${
                    selectedFormat === fmt.id
                      ? "border-accent-teal/60 bg-accent-teal/5 ring-1 ring-accent-teal/30"
                      : "border-echofield-border bg-echofield-surface hover:border-echofield-text-muted/40"
                  }`}
                >
                  <div className={`mt-0.5 w-8 h-8 rounded-lg flex items-center justify-center shrink-0 ${
                    selectedFormat === fmt.id ? "bg-accent-teal/20" : "bg-echofield-surface-elevated"
                  }`}>
                    <svg
                      className={`w-4 h-4 ${selectedFormat === fmt.id ? "text-accent-teal" : "text-echofield-text-muted"}`}
                      fill="none"
                      viewBox="0 0 24 24"
                      stroke="currentColor"
                    >
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d={fmt.icon} />
                    </svg>
                  </div>
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-semibold text-echofield-text-primary">{fmt.label}</span>
                      <span className="text-[10px] font-mono text-echofield-text-muted bg-echofield-surface-elevated px-1.5 py-0.5 rounded">
                        {fmt.ext}
                      </span>
                    </div>
                    <p className="text-xs text-echofield-text-muted mt-0.5 leading-relaxed">{fmt.description}</p>
                  </div>
                </button>
              ))}
            </div>
          </section>

          {/* Recording Selection */}
          <section>
            <div className="flex items-center justify-between mb-3">
              <h2 className="text-sm font-semibold text-echofield-text-primary uppercase tracking-wider">
                Recordings
              </h2>
              {recordings.length > 0 && (
                <button
                  onClick={toggleAll}
                  className="text-xs text-accent-teal hover:text-accent-teal/80 transition-colors"
                >
                  {allSelected ? "Deselect all" : "Select all"}
                </button>
              )}
            </div>

            {loading ? (
              <div className="space-y-3">
                {[1, 2, 3].map((i) => (
                  <div key={i} className="h-16 rounded-xl bg-echofield-surface border border-echofield-border animate-pulse" />
                ))}
              </div>
            ) : error ? (
              <div className="p-4 rounded-xl bg-danger/10 border border-danger/20 text-danger text-sm">
                {error}
              </div>
            ) : recordings.length === 0 ? (
              <div className="py-12 text-center rounded-xl border border-dashed border-echofield-border">
                <p className="text-echofield-text-muted text-sm mb-3">No completed recordings yet.</p>
                <Link
                  href="/upload"
                  className="text-accent-teal hover:text-accent-teal/80 text-sm font-medium transition-colors"
                >
                  Upload a recording →
                </Link>
              </div>
            ) : (
              <div className="space-y-2">
                {recordings.map((rec) => (
                  <RecordingRow
                    key={rec.id}
                    recording={rec}
                    selected={selectedIds.has(rec.id)}
                    onToggle={() => toggleRecording(rec.id)}
                  />
                ))}
              </div>
            )}
          </section>
        </div>

        {/* Right: Summary + Export Button */}
        <div className="space-y-4">
          <div className="sticky top-6 space-y-4">
            {/* Export Summary Card */}
            <div className="p-5 rounded-xl bg-echofield-surface border border-echofield-border">
              <h3 className="text-sm font-semibold text-echofield-text-primary mb-4 uppercase tracking-wider">
                Export Summary
              </h3>
              <div className="space-y-3 text-sm">
                <div className="flex justify-between">
                  <span className="text-echofield-text-muted">Format</span>
                  <span className="text-echofield-text-primary font-medium">{selectedFormat_.label}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-echofield-text-muted">Recordings</span>
                  <span className={selectedIds.size > 0 ? "text-accent-teal font-semibold" : "text-echofield-text-muted"}>
                    {selectedIds.size} selected
                  </span>
                </div>
                {(selectedFormat === "wav" || selectedFormat === "png") && selectedIds.size > 1 && (
                  <p className="text-xs text-warning bg-warning/10 rounded-lg px-3 py-2">
                    Only the first selected recording will be downloaded for {selectedFormat_.label} format.
                  </p>
                )}
              </div>

              <div className="mt-4 pt-4 border-t border-echofield-border">
                <button
                  onClick={handleExport}
                  disabled={selectedIds.size === 0 || exporting}
                  className="w-full flex items-center justify-center gap-2 px-5 py-3 bg-accent-teal text-echofield-bg font-semibold rounded-xl hover:bg-accent-teal/90 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {exporting ? (
                    <>
                      <div className="w-4 h-4 border-2 border-echofield-bg border-t-transparent rounded-full animate-spin" />
                      Exporting…
                    </>
                  ) : (
                    <>
                      <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                      </svg>
                      Download {selectedFormat_.label}
                    </>
                  )}
                </button>
              </div>
            </div>

            {/* Success / Error feedback */}
            {exportResult && (
              <div className="p-4 rounded-xl bg-success/10 border border-success/20">
                <div className="flex items-start gap-3">
                  <svg className="w-5 h-5 text-success shrink-0 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                  <div>
                    <p className="text-success text-sm font-medium">Export started</p>
                    <p className="text-success/80 text-xs mt-0.5">
                      {exportResult.count} recording{exportResult.count !== 1 ? "s" : ""} · {exportResult.format.toUpperCase()}
                    </p>
                  </div>
                </div>
              </div>
            )}

            {error && (
              <div className="p-4 rounded-xl bg-danger/10 border border-danger/20">
                <div className="flex items-start gap-3">
                  <svg className="w-5 h-5 text-danger shrink-0 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                  <div>
                    <p className="text-danger text-sm font-medium">Export failed</p>
                    <p className="text-danger/80 text-xs mt-0.5">{error}</p>
                  </div>
                </div>
              </div>
            )}

            {/* Format notes */}
            <div className="p-4 rounded-xl bg-echofield-surface border border-echofield-border text-xs text-echofield-text-muted space-y-2">
              <p className="font-medium text-echofield-text-secondary">About {selectedFormat_.label}</p>
              <p>{selectedFormat_.description}.</p>
              {selectedFormat === "csv" && (
                <p>Compatible with Excel, R, Python (pandas), and MATLAB.</p>
              )}
              {selectedFormat === "json" && (
                <p>Includes full call metadata, acoustic features, and SNR metrics.</p>
              )}
              {selectedFormat === "wav" && (
                <p>48 kHz / 16-bit WAV, noise-subtracted via spectral gating.</p>
              )}
              {selectedFormat === "png" && (
                <p>Mel-scale spectrogram at 300 DPI suitable for publication figures.</p>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

export default function ExportPage() {
  return (
    <Suspense fallback={
      <div className="min-h-[60vh] flex items-center justify-center">
        <div className="w-8 h-8 border-2 border-accent-teal border-t-transparent rounded-full animate-spin" />
      </div>
    }>
      <ExportPageInner />
    </Suspense>
  );
}
