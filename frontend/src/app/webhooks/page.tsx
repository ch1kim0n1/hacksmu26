"use client";

import { useState, useCallback, useEffect } from "react";
import {
  Webhook,
  Plus,
  Trash2,
  Globe,
  Calendar,
  Loader2,
} from "lucide-react";
import {
  createWebhook,
  getWebhooks,
  deleteWebhook,
  type WebhookConfig,
} from "@/lib/audio-api";

const EVENT_TYPES = [
  "processing.complete",
  "processing.failed",
  "batch.complete",
] as const;

const EVENT_BADGE_COLORS: Record<string, string> = {
  "processing.complete": "bg-success/10 text-success border-success/20",
  "processing.failed": "bg-danger/10 text-danger border-danger/20",
  "batch.complete":
    "bg-accent-savanna/10 text-accent-savanna border-accent-savanna/20",
};

export default function WebhooksPage() {
  const [webhooks, setWebhooks] = useState<WebhookConfig[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  // form state
  const [url, setUrl] = useState("");
  const [eventType, setEventType] = useState<string>(EVENT_TYPES[0]);
  const [creating, setCreating] = useState(false);

  // delete state
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const fetchWebhooks = useCallback(async () => {
    try {
      setError(null);
      const data = await getWebhooks();
      setWebhooks(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load webhooks");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchWebhooks();
  }, [fetchWebhooks]);

  const handleCreate = useCallback(async () => {
    if (!url.trim()) return;
    setCreating(true);
    setError(null);
    setSuccess(null);
    try {
      const newHook = await createWebhook({ url: url.trim(), event_type: eventType });
      setWebhooks((prev) => [newHook, ...prev]);
      setUrl("");
      setEventType(EVENT_TYPES[0]);
      setSuccess("Webhook created successfully");
      setTimeout(() => setSuccess(null), 3000);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to create webhook");
    } finally {
      setCreating(false);
    }
  }, [url, eventType]);

  const handleDelete = useCallback(
    async (id: string) => {
      setDeletingId(id);
      setError(null);
      setSuccess(null);
      try {
        await deleteWebhook(id);
        setWebhooks((prev) => prev.filter((w) => w.id !== id));
        setConfirmDeleteId(null);
        setSuccess("Webhook deleted");
        setTimeout(() => setSuccess(null), 3000);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to delete webhook");
      } finally {
        setDeletingId(null);
      }
    },
    [],
  );

  return (
    <main className="p-6 lg:p-8 max-w-6xl mx-auto space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-4xl font-bold text-ev-charcoal">Webhooks</h1>
        <p className="mt-2 text-ev-elephant">
          Manage webhook integrations for processing events
        </p>
      </div>

      {/* Status banners */}
      {success && (
        <div className="rounded-lg border border-success/20 bg-success/10 px-4 py-3 text-sm text-success">
          {success}
        </div>
      )}
      {error && (
        <div className="rounded-lg border border-danger/20 bg-danger/10 px-4 py-3 text-sm text-danger">
          {error}
        </div>
      )}

      {/* Create webhook form */}
      <div className="rounded-lg border border-ev-sand bg-ev-cream p-5">
        <h2 className="text-sm font-semibold text-ev-charcoal mb-4 flex items-center gap-2">
          <Plus className="h-4 w-4" />
          Create Webhook
        </h2>
        <div className="flex flex-col sm:flex-row gap-3">
          <div className="flex-1">
            <label className="block text-xs text-ev-warm-gray mb-1">
              Endpoint URL
            </label>
            <div className="relative">
              <Globe className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-ev-warm-gray pointer-events-none" />
              <input
                type="url"
                value={url}
                onChange={(e) => setUrl(e.target.value)}
                placeholder="https://your-server.com/webhook"
                className="rounded-lg border border-ev-sand bg-white pl-9 pr-3 py-2 text-sm text-ev-charcoal w-full"
              />
            </div>
          </div>
          <div className="sm:w-52">
            <label className="block text-xs text-ev-warm-gray mb-1">
              Event Type
            </label>
            <select
              value={eventType}
              onChange={(e) => setEventType(e.target.value)}
              className="rounded-lg border border-ev-sand bg-white px-3 py-2 text-sm text-ev-charcoal w-full"
            >
              {EVENT_TYPES.map((t) => (
                <option key={t} value={t}>
                  {t}
                </option>
              ))}
            </select>
          </div>
          <div className="flex items-end">
            <button
              onClick={handleCreate}
              disabled={creating || !url.trim()}
              className="rounded-lg bg-accent-savanna px-4 py-2 text-sm font-semibold text-ev-ivory hover:bg-accent-savanna/90 disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
            >
              {creating ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Webhook className="h-4 w-4" />
              )}
              Create Webhook
            </button>
          </div>
        </div>
      </div>

      {/* Webhook list */}
      {loading ? (
        <div className="flex items-center justify-center py-16">
          <Loader2 className="h-6 w-6 animate-spin text-ev-warm-gray" />
        </div>
      ) : webhooks.length === 0 ? (
        <div className="rounded-lg border border-ev-sand bg-ev-cream p-5 text-center text-ev-elephant">
          <Webhook className="h-8 w-8 mx-auto mb-2 opacity-40" />
          <p className="text-sm">No webhooks configured yet</p>
          <p className="text-xs text-ev-warm-gray mt-1">
            Create one above to start receiving processing events
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {webhooks.map((hook) => (
            <div
              key={hook.id}
              className="rounded-lg border border-ev-sand bg-ev-cream p-5 flex flex-col sm:flex-row sm:items-center gap-4"
            >
              <div className="flex-1 min-w-0 space-y-2">
                <p
                  className="font-mono text-xs text-ev-warm-gray truncate"
                  title={hook.url}
                >
                  {hook.url}
                </p>
                <div className="flex flex-wrap items-center gap-3">
                  <span
                    className={`px-2.5 py-1 rounded-md text-xs font-medium border ${EVENT_BADGE_COLORS[hook.event_type] || "bg-ev-warm-gray/10 text-ev-warm-gray border-ev-warm-gray/20"}`}
                  >
                    {hook.event_type}
                  </span>
                  <span className="flex items-center gap-1 text-xs text-ev-warm-gray">
                    <Calendar className="h-3 w-3" />
                    {new Date(hook.created_at).toLocaleDateString()}
                  </span>
                </div>
              </div>

              <div className="flex items-center gap-2 shrink-0">
                {confirmDeleteId === hook.id ? (
                  <>
                    <button
                      onClick={() => handleDelete(hook.id)}
                      disabled={deletingId === hook.id}
                      className="rounded-lg bg-danger px-3 py-2 text-sm font-semibold text-white disabled:opacity-50 flex items-center gap-1"
                    >
                      {deletingId === hook.id ? (
                        <Loader2 className="h-3.5 w-3.5 animate-spin" />
                      ) : (
                        <Trash2 className="h-3.5 w-3.5" />
                      )}
                      Confirm
                    </button>
                    <button
                      onClick={() => setConfirmDeleteId(null)}
                      className="rounded-lg border border-ev-sand bg-white px-3 py-2 text-sm text-ev-elephant hover:bg-ev-cream"
                    >
                      Cancel
                    </button>
                  </>
                ) : (
                  <button
                    onClick={() => setConfirmDeleteId(hook.id)}
                    className="rounded-lg bg-danger px-3 py-2 text-sm font-semibold text-white flex items-center gap-1"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                    Delete
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </main>
  );
}
