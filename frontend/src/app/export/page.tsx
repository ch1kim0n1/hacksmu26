"use client";

import { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import { getRecordings, exportResearch, type Recording } from "@/lib/audio-api";

const FORMATS = [
  { key: "csv", label: "CSV", desc: "Spreadsheet-compatible acoustic data" },
  { key: "json", label: "JSON", desc: "Structured data for programmatic use" },
  { key: "zip", label: "ZIP", desc: "Full bundle with audio + spectrograms" },
] as const;

export default function ExportPage() {
  const [recordings, setRecordings] = useState<Recording[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [format, setFormat] = useState<string>("csv");
  const [exporting, setExporting] = useState(false);

  const fetchRecordings = useCallback(async () => {
    try {
      setLoading(true);
      const data = await getRecordings({ status: "complete", limit: 100 });
      setRecordings(data.recordings);
    } catch {
      // show empty
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchRecordings();
  }, [fetchRecordings]);

  const toggleSelect = (id: string) => {
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
    if (selectedIds.size === 0) return;
    setExporting(true);
    try {
      const blob = await exportResearch({
        format,
        recording_ids: Array.from(selectedIds),
      });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `echofield-export.${format === "zip" ? "zip" : format}`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch {
      // silently fail
    } finally {
      setExporting(false);
    }
  };

  return (
    <div className="min-h-screen bg-ev-ivory">
      <div className="max-w-4xl mx-auto px-6 py-12">
        <div className="mb-10">
          <Link
            href="/"
            className="inline-flex items-center gap-2 text-ev-warm-gray hover:text-ev-elephant transition-colors mb-4"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
            </svg>
            Back
          </Link>
          <h1 className="text-4xl font-bold text-ev-charcoal">Export Research Data</h1>
          <p className="text-ev-elephant mt-2">
            Select recordings and export format for research analysis.
          </p>
        </div>

        {/* Format selector */}
        <div className="mb-8">
          <h2 className="text-sm font-medium text-ev-charcoal mb-3">Format</h2>
          <div className="flex gap-3">
            {FORMATS.map((f) => (
              <button
                key={f.key}
                onClick={() => setFormat(f.key)}
                className={`flex-1 p-4 rounded-xl border text-left transition-all ${
                  format === f.key
                    ? "border-accent-savanna bg-accent-savanna/5"
                    : "border-ev-sand bg-ev-cream hover:border-ev-warm-gray"
                }`}
              >
                <span className={`text-sm font-semibold ${format === f.key ? "text-accent-savanna" : "text-ev-charcoal"}`}>
                  {f.label}
                </span>
                <p className="text-xs text-ev-warm-gray mt-1">{f.desc}</p>
              </button>
            ))}
          </div>
        </div>

        {/* Recording selection */}
        <div className="mb-8">
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-sm font-medium text-ev-charcoal">Recordings</h2>
            <label className="flex items-center gap-2 text-sm text-ev-elephant cursor-pointer">
              <input
                type="checkbox"
                checked={selectedIds.size === recordings.length && recordings.length > 0}
                onChange={toggleAll}
                className="rounded border-ev-sand"
              />
              Select all
            </label>
          </div>

          {loading ? (
            <div className="space-y-3">
              {[1, 2, 3].map((i) => (
                <div key={i} className="p-4 rounded-lg bg-ev-cream border border-ev-sand animate-pulse">
                  <div className="h-4 w-48 bg-background-elevated rounded" />
                </div>
              ))}
            </div>
          ) : recordings.length === 0 ? (
            <div className="p-8 rounded-xl bg-ev-cream border border-ev-sand text-center">
              <p className="text-ev-elephant">No processed recordings available for export.</p>
            </div>
          ) : (
            <div className="space-y-2">
              {recordings.map((rec) => (
                <label
                  key={rec.id}
                  className={`flex items-center gap-3 p-4 rounded-lg border cursor-pointer transition-all ${
                    selectedIds.has(rec.id)
                      ? "border-accent-savanna bg-accent-savanna/5"
                      : "border-ev-sand bg-ev-cream hover:border-ev-warm-gray"
                  }`}
                >
                  <input
                    type="checkbox"
                    checked={selectedIds.has(rec.id)}
                    onChange={() => toggleSelect(rec.id)}
                    className="rounded border-ev-sand"
                  />
                  <span className="font-medium text-ev-charcoal">{rec.filename}</span>
                  <span className="text-xs text-ev-warm-gray ml-auto">
                    {rec.duration_s ? `${Math.floor(rec.duration_s / 60)}:${String(Math.floor(rec.duration_s % 60)).padStart(2, "0")}` : "--"}
                  </span>
                </label>
              ))}
            </div>
          )}
        </div>

        {/* Export button */}
        <button
          onClick={handleExport}
          disabled={selectedIds.size === 0 || exporting}
          className="w-full py-3 bg-accent-savanna text-ev-ivory font-semibold rounded-xl hover:bg-accent-savanna/90 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {exporting
            ? "Exporting..."
            : `Export ${selectedIds.size} recording${selectedIds.size !== 1 ? "s" : ""} as ${format.toUpperCase()}`}
        </button>
      </div>
    </div>
  );
}
