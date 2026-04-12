"use client";

import { useState } from "react";
import { Edit3, Save, X, Loader2, MapPin } from "lucide-react";
import { updateRecordingMetadata } from "@/lib/audio-api";

interface MetadataEditorProps {
  recordingId: string;
  currentMetadata?: {
    location?: string;
    date?: string;
    recorded_at?: string;
    microphone_type?: string;
    notes?: string;
    species?: string;
  };
  onSaved?: () => void;
}

export default function MetadataEditor({
  recordingId,
  currentMetadata,
  onSaved,
}: MetadataEditorProps) {
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  // form fields
  const [location, setLocation] = useState(currentMetadata?.location ?? "");
  const [date, setDate] = useState(currentMetadata?.date ?? "");
  const [recordedAt, setRecordedAt] = useState(
    currentMetadata?.recorded_at ?? ""
  );
  const [microphoneType, setMicrophoneType] = useState(
    currentMetadata?.microphone_type ?? ""
  );
  const [species, setSpecies] = useState(currentMetadata?.species ?? "");
  const [notes, setNotes] = useState(currentMetadata?.notes ?? "");

  function resetForm() {
    setLocation(currentMetadata?.location ?? "");
    setDate(currentMetadata?.date ?? "");
    setRecordedAt(currentMetadata?.recorded_at ?? "");
    setMicrophoneType(currentMetadata?.microphone_type ?? "");
    setSpecies(currentMetadata?.species ?? "");
    setNotes(currentMetadata?.notes ?? "");
    setErrorMsg(null);
    setSuccessMsg(null);
  }

  function handleCancel() {
    resetForm();
    setOpen(false);
  }

  async function handleSave() {
    setSaving(true);
    setErrorMsg(null);
    setSuccessMsg(null);

    try {
      await updateRecordingMetadata(recordingId, {
        location: location || undefined,
        date: date || undefined,
        recorded_at: recordedAt || undefined,
        microphone_type: microphoneType || undefined,
        species: species || undefined,
        notes: notes || undefined,
      });

      setSuccessMsg("Metadata saved successfully.");
      onSaved?.();
    } catch (err) {
      setErrorMsg(
        err instanceof Error ? err.message : "Failed to save metadata."
      );
    } finally {
      setSaving(false);
    }
  }

  const inputClass =
    "rounded-lg border border-ev-sand bg-white px-3 py-2 text-sm text-ev-charcoal w-full";
  const labelClass = "text-ev-warm-gray text-xs mb-1";

  return (
    <div className="rounded-lg border border-ev-sand bg-ev-cream p-5">
      {/* Section title */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Edit3 className="w-4 h-4 text-accent-savanna" />
          <h2 className="text-sm font-semibold text-ev-charcoal">
            Edit Metadata
          </h2>
        </div>
        <button
          type="button"
          onClick={() => {
            if (!open) resetForm();
            setOpen(!open);
          }}
          className="rounded-lg border border-ev-sand px-3 py-2 text-sm text-ev-charcoal hover:bg-ev-sand/20"
        >
          {open ? "Close" : "Edit Metadata"}
        </button>
      </div>

      {/* Form */}
      {open && (
        <div className="mt-4 space-y-4">
          {/* Success banner */}
          {successMsg && (
            <div className="rounded-lg border-success/20 bg-success/10 px-4 py-3 text-sm text-success">
              {successMsg}
            </div>
          )}

          {/* Error banner */}
          {errorMsg && (
            <div className="rounded-lg border-danger/20 bg-danger/10 px-4 py-3 text-sm text-danger">
              {errorMsg}
            </div>
          )}

          {/* Grid of inputs */}
          <div className="grid gap-4 md:grid-cols-2">
            <div>
              <label className={labelClass}>
                <MapPin className="inline w-3 h-3 mr-1" />
                Location
              </label>
              <input
                type="text"
                value={location}
                onChange={(e) => setLocation(e.target.value)}
                placeholder="e.g. Amboseli National Park"
                className={inputClass}
              />
            </div>

            <div>
              <label className={labelClass}>Date</label>
              <input
                type="date"
                value={date}
                onChange={(e) => setDate(e.target.value)}
                className={inputClass}
              />
            </div>

            <div>
              <label className={labelClass}>Recorded At</label>
              <input
                type="text"
                value={recordedAt}
                onChange={(e) => setRecordedAt(e.target.value)}
                placeholder="e.g. Waterhole B, 06:30 AM"
                className={inputClass}
              />
            </div>

            <div>
              <label className={labelClass}>Microphone Type</label>
              <input
                type="text"
                value={microphoneType}
                onChange={(e) => setMicrophoneType(e.target.value)}
                placeholder="e.g. Sennheiser MKH 8020"
                className={inputClass}
              />
            </div>

            <div>
              <label className={labelClass}>Species</label>
              <input
                type="text"
                value={species}
                onChange={(e) => setSpecies(e.target.value)}
                placeholder="e.g. Loxodonta africana"
                className={inputClass}
              />
            </div>
          </div>

          {/* Full-width textarea */}
          <div>
            <label className={labelClass}>Notes</label>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Additional notes about this recording..."
              rows={3}
              className={inputClass}
            />
          </div>

          {/* Action buttons */}
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={handleSave}
              disabled={saving}
              className="rounded-lg bg-accent-savanna px-4 py-2 text-sm font-semibold text-ev-ivory hover:bg-accent-savanna/90 disabled:opacity-50"
            >
              {saving ? (
                <span className="inline-flex items-center gap-1.5">
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  Saving...
                </span>
              ) : (
                <span className="inline-flex items-center gap-1.5">
                  <Save className="w-3.5 h-3.5" />
                  Save
                </span>
              )}
            </button>
            <button
              type="button"
              onClick={handleCancel}
              disabled={saving}
              className="rounded-lg border border-ev-sand px-3 py-2 text-sm text-ev-charcoal hover:bg-ev-sand/20"
            >
              <span className="inline-flex items-center gap-1.5">
                <X className="w-3.5 h-3.5" />
                Cancel
              </span>
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
