"use client";

import { useState, useEffect, useCallback, Suspense } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
import { getRecordings, exportResearch, type Recording } from "@/lib/audio-api";

type Format = "csv" | "json" | "zip";

const FORMAT_INFO: Record<Format, { label: string; desc: string; icon: string }> = {
  csv: {
    label: "CSV",
    desc: "Spreadsheet-compatible, one row per recording",
    icon: "M9 17v-2m3 2v-4m3 4v-6m2 10H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z",
  },
  json: {
    label: "JSON",
    desc: "Full metadata and call data, machine-readable",
    icon: "M10 20l4-16m4 4l4 4-4 4M6 16l-4-4 4-4",
  },
  zip: {
    label: "ZIP Archive",
    desc: "Audio files, spectrograms, and JSON bundled together",
    icon: "M5 8h14M5 8a2 2 0 110-4h14a2 2 0 110 4M5 8l1 12a2 2 0 002 2h8a2 2 0 002-2L19 8m-9 4v4",
  },
};

function ExportContent() {
  const searchParams = useSearchParams();
  const preselect = searchParams.get("recording");

  const [recordings, setRecordings] = useState<Recording[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(
    preselect ? new Set([preselect]) : new Set()
  );
  const [format, setFormat] = useState<Format>("csv");
  const [exporting, setExporting] = useState(false);
  const [exportError, setExportError] = useState<string | null>(null);

  const fetchRecordings = useCallback(async () => {
    try {
      setLoading(true);
      const data = await getRecordings({ limit: 100, status: "complete" });
      setRecordings(data.recordings);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load recordings");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchRecordings();
  }, [fetchRecordings]);

  const toggleId = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
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
    setExportError(null);
    setExporting(true);
    try {
      const ids = Array.from(selectedIds);
      const blob = await exportResearch({ format, recording_ids: ids });
      const ext = format === "zip" ? "zip" : format;
      const filename = `echofield_export_${new Date().toISOString().slice(0, 10)}.${ext}`;
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = filename;
      document.body.appendChild(anchor);
      anchor.click();
      document.body.removeChild(anchor);
      URL.revokeObjectURL(url);
    } catch (err) {
      setExportError(err instanceof Error ? err.message : "Export failed");
    } finally {
      setExporting(false);
    }
  };

  const allSelected = recordings.length > 0 && selectedIds.size === recordings.length;
  const partialSelected = selectedIds.size > 0 && selectedIds.size < recordings.length;

  return (
    <div className="min-h-screen bg-ev-ivory">
      <div className="max-w-5xl mx-auto px-6 py-12">
        {/* Header */}
        <div className="mb-10">
          <Link
            href="/upload"
            className="inline-flex items-center gap-2 text-ev-warm-gray hover:text-ev-elephant transition-colors mb-4"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
            </svg>
            Back to Recordings
          </Link>
          <h1 className="text-4xl font-bold text-ev-charcoal">Export Data</h1>
          <p className="text-ev-elephant mt-2">
            Download recordings, acoustic metrics, and call data for research use.
          </p>
        </div>

        <div className="grid lg:grid-cols-[1fr_320px] gap-8">
          {/* Left: Recordings List */}
          <div>
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-semibold text-ev-charcoal">
                Processed Recordings
              </h2>
              {recordings.length > 0 && (
                <button
                  onClick={toggleAll}
                  className="text-sm text-accent-savanna hover:underline"
                >
                  {allSelected ? "Deselect all" : "Select all"}
                </button>
              )}
            </div>

            {error && (
              <div className="p-4 rounded-xl bg-danger/10 border border-danger/20 text-danger text-sm mb-4">
                {error}
              </div>
            )}

            {loading ? (
              <div className="space-y-3">
                {[1, 2, 3].map((i) => (
                  <div
                    key={i}
                    className="h-16 rounded-xl bg-ev-cream border border-ev-sand animate-pulse"
                  />
                ))}
              </div>
            ) : recordings.length === 0 ? (
              <div className="p-12 rounded-xl bg-ev-cream border border-ev-sand text-center">
                <p className="text-ev-warm-gray">No processed recordings available.</p>
                <Link
                  href="/upload"
                  className="inline-block mt-3 text-sm text-accent-savanna hover:underline"
                >
                  Upload and process recordings first
                </Link>
              </div>
            ) : (
              <div className="space-y-2">
                {recordings.map((rec) => {
                  const checked = selectedIds.has(rec.id);
                  return (
                    <label
                      key={rec.id}
                      className={`flex items-center gap-4 p-4 rounded-xl border cursor-pointer transition-all ${
                        checked
                          ? "bg-accent-savanna/5 border-accent-savanna/40"
                          : "bg-ev-cream border-ev-sand hover:border-ev-warm-gray/30"
                      }`}
                    >
                      <input
                        type="checkbox"
                        checked={checked}
                        onChange={() => toggleId(rec.id)}
                        className="w-4 h-4 accent-accent-savanna rounded"
                      />
                      <div className="flex-1 min-w-0">
                        <p className="font-medium text-ev-charcoal truncate text-sm">
                          {rec.filename}
                        </p>
                        <div className="flex gap-3 text-xs text-ev-warm-gray mt-0.5">
                          {rec.duration_s !== undefined && (
                            <span>
                              {Math.floor(rec.duration_s / 60)}m{" "}
                              {Math.floor(rec.duration_s % 60)}s
                            </span>
                          )}
                          {rec.result?.quality?.snr_improvement_db !== undefined && (
                            <span className="text-success">
                              +{rec.result.quality.snr_improvement_db.toFixed(1)} dB
                            </span>
                          )}
                        </div>
                      </div>
                      <span className="text-xs text-success bg-success/10 px-2 py-0.5 rounded-full">
                        Complete
                      </span>
                    </label>
                  );
                })}
              </div>
            )}

            {partialSelected && (
              <p className="text-sm text-ev-warm-gray mt-3">
                {selectedIds.size} of {recordings.length} selected
              </p>
            )}
          </div>

          {/* Right: Export Options */}
          <div className="space-y-6">
            <div className="p-6 rounded-xl bg-ev-cream border border-ev-sand">
              <h3 className="text-base font-semibold text-ev-charcoal mb-4">
                Export Format
              </h3>
              <div className="space-y-3">
                {(Object.entries(FORMAT_INFO) as [Format, (typeof FORMAT_INFO)[Format]][]).map(
                  ([key, info]) => (
                    <label
                      key={key}
                      className={`flex items-start gap-3 p-3 rounded-lg border cursor-pointer transition-all ${
                        format === key
                          ? "bg-accent-savanna/5 border-accent-savanna/40"
                          : "border-ev-sand hover:border-ev-warm-gray/30"
                      }`}
                    >
                      <input
                        type="radio"
                        name="format"
                        value={key}
                        checked={format === key}
                        onChange={() => setFormat(key)}
                        className="mt-0.5 accent-accent-savanna"
                      />
                      <div>
                        <div className="flex items-center gap-2">
                          <svg
                            className="w-4 h-4 text-ev-warm-gray"
                            fill="none"
                            viewBox="0 0 24 24"
                            stroke="currentColor"
                          >
                            <path
                              strokeLinecap="round"
                              strokeLinejoin="round"
                              strokeWidth={1.5}
                              d={info.icon}
                            />
                          </svg>
                          <span className="text-sm font-semibold text-ev-charcoal">
                            {info.label}
                          </span>
                        </div>
                        <p className="text-xs text-ev-warm-gray mt-0.5">{info.desc}</p>
                      </div>
                    </label>
                  )
                )}
              </div>
            </div>

            {exportError && (
              <div className="p-4 rounded-xl bg-danger/10 border border-danger/20 text-danger text-sm">
                {exportError}
              </div>
            )}

            <button
              onClick={handleExport}
              disabled={selectedIds.size === 0 || exporting}
              className="w-full px-6 py-3 bg-accent-savanna text-ev-ivory font-semibold rounded-xl hover:bg-accent-savanna/90 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
            >
              {exporting ? (
                <>
                  <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                  Exporting...
                </>
              ) : (
                <>
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
                      d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4"
                    />
                  </svg>
                  Export {selectedIds.size > 0 ? `${selectedIds.size} Recording${selectedIds.size !== 1 ? "s" : ""}` : ""}
                </>
              )}
            </button>

            {selectedIds.size === 0 && (
              <p className="text-xs text-ev-warm-gray text-center">
                Select at least one recording to export
              </p>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

export default function ExportPage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen bg-ev-ivory flex items-center justify-center">
          <div className="w-10 h-10 border-2 border-accent-savanna border-t-transparent rounded-full animate-spin" />
        </div>
      }
    >
      <ExportContent />
    </Suspense>
  );
}
