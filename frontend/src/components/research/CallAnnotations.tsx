"use client";

import { useState, useCallback, useEffect } from "react";
import { MessageSquare, Plus, Trash2, User, Tag } from "lucide-react";
import type { CallAnnotation } from "@/lib/audio-api";
import {
  addCallAnnotation,
  getCallAnnotations,
  deleteCallAnnotation,
} from "@/lib/audio-api";

interface CallAnnotationsProps {
  callId: string;
}

export default function CallAnnotations({ callId }: CallAnnotationsProps) {
  const [annotations, setAnnotations] = useState<CallAnnotation[]>([]);
  const [loading, setLoading] = useState(true);
  const [formOpen, setFormOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);

  // form fields
  const [note, setNote] = useState("");
  const [tagsInput, setTagsInput] = useState("");
  const [researcherId, setResearcherId] = useState("");

  const fetchAnnotations = useCallback(async () => {
    try {
      const data = await getCallAnnotations(callId);
      setAnnotations(data);
    } catch {
      // silently handle fetch errors
    } finally {
      setLoading(false);
    }
  }, [callId]);

  useEffect(() => {
    fetchAnnotations();
  }, [fetchAnnotations]);

  const resetForm = useCallback(() => {
    setNote("");
    setTagsInput("");
    setResearcherId("");
    setFormOpen(false);
  }, []);

  const handleSave = useCallback(async () => {
    if (!note.trim()) return;
    setSaving(true);
    try {
      const tags = tagsInput
        .split(",")
        .map((t) => t.trim())
        .filter(Boolean);
      const payload: { note: string; tags?: string[]; researcher_id?: string } =
        { note: note.trim() };
      if (tags.length > 0) payload.tags = tags;
      if (researcherId.trim()) payload.researcher_id = researcherId.trim();
      const created = await addCallAnnotation(callId, payload);
      setAnnotations((prev) => [created, ...prev]);
      resetForm();
    } catch {
      // silently handle save errors
    } finally {
      setSaving(false);
    }
  }, [callId, note, tagsInput, researcherId, resetForm]);

  const handleDelete = useCallback(
    async (annotationId: string) => {
      try {
        await deleteCallAnnotation(callId, annotationId);
        setAnnotations((prev) => prev.filter((a) => a.id !== annotationId));
      } catch {
        // silently handle delete errors
      } finally {
        setConfirmDeleteId(null);
      }
    },
    [callId],
  );

  return (
    <div className="rounded-lg border border-ev-sand bg-ev-cream p-5">
      {/* Header */}
      <div className="mb-4 flex items-center gap-2">
        <MessageSquare className="h-4 w-4 text-ev-warm-gray" />
        <h3 className="text-sm font-semibold text-ev-charcoal">Annotations</h3>
        <span className="px-2 py-0.5 rounded-md text-[11px] font-semibold border border-ev-sand text-ev-warm-gray">
          {loading ? "--" : annotations.length}
        </span>
      </div>

      {/* Toggle add form */}
      {!formOpen && (
        <button
          type="button"
          onClick={() => setFormOpen(true)}
          className="mb-4 flex items-center gap-1.5 rounded-lg bg-accent-savanna px-3 py-2 text-sm font-semibold text-ev-ivory hover:bg-accent-savanna/90"
        >
          <Plus className="h-3.5 w-3.5" />
          Add Annotation
        </button>
      )}

      {/* Add form */}
      {formOpen && (
        <div className="mb-4 space-y-3 rounded-lg border border-ev-sand bg-white p-4">
          <div>
            <label className="mb-1 block text-xs text-ev-warm-gray">Note</label>
            <textarea
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="Write your annotation..."
              className="min-h-[80px] w-full rounded-lg border border-ev-sand bg-white px-3 py-2 text-sm text-ev-charcoal"
            />
          </div>

          <div>
            <label className="mb-1 flex items-center gap-1 text-xs text-ev-warm-gray">
              <Tag className="h-3 w-3" />
              Tags (comma-separated)
            </label>
            <input
              type="text"
              value={tagsInput}
              onChange={(e) => setTagsInput(e.target.value)}
              placeholder="rumble, greeting, long-distance"
              className="w-full rounded-lg border border-ev-sand bg-white px-3 py-2 text-sm text-ev-charcoal"
            />
          </div>

          <div>
            <label className="mb-1 flex items-center gap-1 text-xs text-ev-warm-gray">
              <User className="h-3 w-3" />
              Researcher ID (optional)
            </label>
            <input
              type="text"
              value={researcherId}
              onChange={(e) => setResearcherId(e.target.value)}
              placeholder="e.g. jpoole"
              className="w-full rounded-lg border border-ev-sand bg-white px-3 py-2 text-sm text-ev-charcoal"
            />
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={handleSave}
              disabled={saving || !note.trim()}
              className="rounded-lg bg-accent-savanna px-3 py-2 text-sm font-semibold text-ev-ivory hover:bg-accent-savanna/90 disabled:opacity-50"
            >
              {saving ? "Saving..." : "Save"}
            </button>
            <button
              type="button"
              onClick={resetForm}
              className="rounded-lg border border-ev-sand px-3 py-2 text-sm font-semibold text-ev-charcoal hover:bg-ev-sand/30"
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {/* Annotation list */}
      {loading ? (
        <p className="text-xs text-ev-warm-gray">Loading annotations...</p>
      ) : annotations.length === 0 ? (
        <p className="text-xs text-ev-warm-gray">No annotations yet.</p>
      ) : (
        <div className="space-y-3">
          {annotations.map((a) => (
            <div
              key={a.id}
              className="rounded-lg border border-ev-sand bg-white p-4"
            >
              {/* Note text */}
              <p className="text-sm text-ev-charcoal whitespace-pre-wrap">
                {a.note}
              </p>

              {/* Tags */}
              {a.tags.length > 0 && (
                <div className="mt-2 flex flex-wrap gap-1.5">
                  {a.tags.map((tag) => (
                    <span
                      key={tag}
                      className="px-2 py-0.5 rounded-md text-[11px] font-semibold border border-accent-savanna/30 bg-accent-savanna/10 text-accent-savanna"
                    >
                      {tag}
                    </span>
                  ))}
                </div>
              )}

              {/* Meta row */}
              <div className="mt-2 flex items-center justify-between">
                <div className="flex items-center gap-3 font-mono text-xs text-ev-warm-gray">
                  {a.researcher_id && (
                    <span className="flex items-center gap-1">
                      <User className="h-3 w-3" />
                      {a.researcher_id}
                    </span>
                  )}
                  <span>
                    {new Date(a.created_at).toLocaleDateString(undefined, {
                      year: "numeric",
                      month: "short",
                      day: "numeric",
                      hour: "2-digit",
                      minute: "2-digit",
                    })}
                  </span>
                </div>

                {/* Delete */}
                {confirmDeleteId === a.id ? (
                  <div className="flex items-center gap-1.5">
                    <button
                      type="button"
                      onClick={() => handleDelete(a.id)}
                      className="text-danger hover:text-danger/80 text-xs font-semibold"
                    >
                      Confirm
                    </button>
                    <button
                      type="button"
                      onClick={() => setConfirmDeleteId(null)}
                      className="text-xs text-ev-warm-gray hover:text-ev-charcoal"
                    >
                      Cancel
                    </button>
                  </div>
                ) : (
                  <button
                    type="button"
                    onClick={() => setConfirmDeleteId(a.id)}
                    className="text-danger hover:text-danger/80 text-xs"
                    title="Delete annotation"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
