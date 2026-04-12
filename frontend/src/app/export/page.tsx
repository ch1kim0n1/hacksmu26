"use client";

import { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import { motion } from "framer-motion";
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
    } catch {
      // silently fail
    } finally {
      setExporting(false);
    }
  };

  return (
    <motion.div
      className="p-6 lg:p-8 max-w-6xl mx-auto space-y-6"
      initial={{ opacity: 0, y: -8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3 }}
    >
        <motion.div
          className="mb-10"
          initial={{ opacity: 0, y: -8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.3, delay: 0.05 }}
        >
          <Link
            href="/"
            className="inline-flex items-center gap-2 text-ev-warm-gray hover:text-ev-elephant transition-colors mb-4"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
            </svg>
            Back
          </Link>
          <h1 className="text-2xl font-bold text-ev-charcoal">Export Research Data</h1>
          <p className="text-ev-elephant mt-2">
            Select recordings and export format for research analysis.
          </p>
        </motion.div>

        {/* Format selector */}
        <motion.div
          className="mb-8"
          initial={{ opacity: 0, y: -8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.3, delay: 0.1 }}
        >
          <h2 className="text-sm font-medium text-ev-charcoal mb-3">Format</h2>
          <div className="flex gap-3">
            {FORMATS.map((f) => (
              <button
                key={f.key}
                onClick={() => setFormat(f.key)}
                className={`flex-1 p-4 rounded-xl border text-left transition-all ${
                  format === f.key
                    ? "border-accent-savanna bg-accent-savanna/5"
                    : "border-ev-sand/30 glass hover:border-ev-warm-gray"
                }`}
              >
                <span className={`text-sm font-semibold ${format === f.key ? "text-accent-savanna" : "text-ev-charcoal"}`}>
                  {f.label}
                </span>
                <p className="text-xs text-ev-warm-gray mt-1">{f.desc}</p>
              </button>
            ))}
          </div>
        </motion.div>

        {/* Recording selection */}
        <motion.div
          className="mb-8"
          initial={{ opacity: 0, y: -8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.3, delay: 0.15 }}
        >
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
                <div key={i} className="p-4 rounded-xl glass border border-ev-sand/30 animate-pulse">
                  <div className="h-4 w-48 glass rounded" />
                </div>
              ))}
            </div>
          ) : recordings.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-ev-sand/60 p-12 text-center glass">
              <p className="text-ev-elephant">No processed recordings available for export.</p>
            </div>
          ) : (
            <div className="space-y-2">
              {recordings.map((rec) => (
                <label
                  key={rec.id}
                  className={`flex items-center gap-3 p-4 rounded-xl border cursor-pointer transition-all ${
                    selectedIds.has(rec.id)
                      ? "border-accent-savanna bg-accent-savanna/5"
                      : "border-ev-sand/30 glass hover:border-ev-warm-gray"
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
        </motion.div>

        {/* Export options */}
        <motion.div
          className="mb-8 grid gap-4 md:grid-cols-2"
          initial={{ opacity: 0, y: -8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.3, delay: 0.2 }}
        >
          <label className="block">
            <span className="mb-2 block text-sm font-medium text-ev-charcoal">
              Call types
            </span>
            <input
              value={callTypes}
              onChange={(event) => setCallTypes(event.target.value)}
              placeholder="rumble, trumpet"
              className="w-full rounded-xl glass border border-ev-sand/40 px-4 py-2.5 text-sm text-ev-charcoal placeholder:text-ev-warm-gray focus:border-accent-savanna/50 focus:outline-none"
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
              className="w-full rounded-xl glass border border-ev-sand/40 px-4 py-2.5 text-sm text-ev-charcoal placeholder:text-ev-warm-gray focus:border-accent-savanna/50 focus:outline-none"
            />
          </label>
          {[
            ["Processed audio", includeAudio, setIncludeAudio],
            ["Spectrograms", includeSpectrograms, setIncludeSpectrograms],
            ["Fingerprint matrix", includeFingerprints, setIncludeFingerprints],
            ["Per-call WAV clips", includeAudioClips, setIncludeAudioClips],
          ].map(([label, value, setter]) => (
            <label key={String(label)} className="flex items-center gap-3 rounded-xl glass border border-ev-sand/30 px-4 py-3 text-sm text-ev-elephant">
              <input
                type="checkbox"
                checked={Boolean(value)}
                onChange={(event) => (setter as (next: boolean) => void)(event.target.checked)}
                className="rounded border-ev-sand"
              />
              {String(label)}
            </label>
          ))}
        </motion.div>

        <motion.div
          className="mb-8 rounded-xl glass border border-accent-savanna/20 bg-accent-savanna/5 p-4 text-sm text-ev-elephant"
          initial={{ opacity: 0, y: -8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.3, delay: 0.25 }}
        >
          This export will include {selectedIds.size} recording{selectedIds.size === 1 ? "" : "s"}
          {callTypes ? ` filtered to ${callTypes}` : ""}. ZIP exports include the data dictionary and can include fingerprint matrices.
        </motion.div>

        {/* Export button */}
        <button
          onClick={handleExport}
          disabled={selectedIds.size === 0 || exporting}
          className="w-full py-3 bg-gradient-to-r from-accent-savanna to-accent-savanna/90 text-ev-ivory font-semibold rounded-xl hover:from-accent-savanna/95 hover:to-accent-savanna/85 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {exporting
            ? "Exporting..."
            : `Export ${selectedIds.size} recording${selectedIds.size !== 1 ? "s" : ""} as ${format.toUpperCase()}`}
        </button>
    </motion.div>
  );
}
