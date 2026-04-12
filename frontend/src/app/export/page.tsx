"use client";

import { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import { AlertCircle } from "lucide-react";
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
  const [callTypes, setCallTypes] = useState("");
  const [minConfidence, setMinConfidence] = useState("");
  const [includeAudio, setIncludeAudio] = useState(false);
  const [includeSpectrograms, setIncludeSpectrograms] = useState(false);
  const [includeFingerprints, setIncludeFingerprints] = useState(true);
  const [includeAudioClips, setIncludeAudioClips] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchRecordings = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const data = await getRecordings({ status: "complete", limit: 100 });
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
        call_types: callTypes
          .split(",")
          .map((item) => item.trim())
          .filter(Boolean),
        min_confidence: minConfidence ? Number(minConfidence) : null,
        include_audio: includeAudio,
        include_spectrograms: includeSpectrograms,
        include_fingerprints: includeFingerprints,
        include_audio_clips: includeAudioClips,
      });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `echofield-export.${format === "zip" ? "zip" : format}`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Export failed");
    } finally {
      setExporting(false);
    }
  };

  return (
    <div className="p-6 lg:p-8 max-w-6xl mx-auto space-y-6">
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

        {error && (
          <div className="flex items-center gap-3 rounded-xl border border-danger/15 bg-danger/5 p-4 text-sm text-danger">
            <AlertCircle className="h-5 w-5 flex-shrink-0" />
            {error}
          </div>
        )}

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

        {/* Export options */}
        <div className="mb-8 grid gap-4 md:grid-cols-2">
          <label className="block">
            <span className="mb-2 block text-sm font-medium text-ev-charcoal">
              Call types
            </span>
            <input
              value={callTypes}
              onChange={(event) => setCallTypes(event.target.value)}
              placeholder="rumble, trumpet"
              className="w-full rounded-lg border border-ev-sand bg-ev-cream px-4 py-2.5 text-sm text-ev-charcoal placeholder:text-ev-warm-gray focus:border-accent-savanna/50 focus:outline-none"
            />
          </label>
          <label className="block">
            <span className="mb-2 block text-sm font-medium text-ev-charcoal">
              Minimum confidence
            </span>
            <input
              type="number"
              min="0"
              max="1"
              step="0.05"
              value={minConfidence}
              onChange={(event) => setMinConfidence(event.target.value)}
              placeholder="0.5"
              className="w-full rounded-lg border border-ev-sand bg-ev-cream px-4 py-2.5 text-sm text-ev-charcoal placeholder:text-ev-warm-gray focus:border-accent-savanna/50 focus:outline-none"
            />
          </label>
          {[
            ["Processed audio", includeAudio, setIncludeAudio],
            ["Spectrograms", includeSpectrograms, setIncludeSpectrograms],
            ["Fingerprint matrix", includeFingerprints, setIncludeFingerprints],
            ["Per-call WAV clips", includeAudioClips, setIncludeAudioClips],
          ].map(([label, value, setter]) => (
            <label key={String(label)} className="flex items-center gap-3 rounded-lg border border-ev-sand bg-ev-cream px-4 py-3 text-sm text-ev-elephant">
              <input
                type="checkbox"
                checked={Boolean(value)}
                onChange={(event) => (setter as (next: boolean) => void)(event.target.checked)}
                className="rounded border-ev-sand"
              />
              {String(label)}
            </label>
          ))}
        </div>

        <div className="mb-8 rounded-lg border border-accent-savanna/20 bg-accent-savanna/5 p-4 text-sm text-ev-elephant">
          This export will include {selectedIds.size} recording{selectedIds.size === 1 ? "" : "s"}
          {callTypes ? ` filtered to ${callTypes}` : ""}. ZIP exports include the data dictionary and can include fingerprint matrices.
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
  );
}
