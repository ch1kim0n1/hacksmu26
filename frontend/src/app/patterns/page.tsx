"use client";

import { useState, useCallback, useEffect } from "react";
import {
  GitBranch,
  ArrowRight,
  Repeat,
  Hash,
  Loader2,
} from "lucide-react";
import {
  getPatterns,
  getPatternInstances,
  type BehavioralPattern,
} from "@/lib/audio-api";

export default function PatternsPage() {
  const [patterns, setPatterns] = useState<BehavioralPattern[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [minOccurrences, setMinOccurrences] = useState(2);

  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [instances, setInstances] = useState<Array<Record<string, unknown>>>([]);
  const [instancesLoading, setInstancesLoading] = useState(false);

  const fetchPatterns = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const data = await getPatterns(minOccurrences);
      setPatterns(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load patterns");
    } finally {
      setLoading(false);
    }
  }, [minOccurrences]);

  useEffect(() => {
    fetchPatterns();
  }, [fetchPatterns]);

  const handleViewInstances = useCallback(
    async (patternId: string) => {
      if (expandedId === patternId) {
        setExpandedId(null);
        setInstances([]);
        return;
      }
      try {
        setExpandedId(patternId);
        setInstancesLoading(true);
        const data = await getPatternInstances(patternId);
        setInstances(data.instances);
      } catch {
        setInstances([]);
      } finally {
        setInstancesLoading(false);
      }
    },
    [expandedId],
  );

  return (
    <main className="p-6 lg:p-8 max-w-6xl mx-auto space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-4xl font-bold text-ev-charcoal">
          Behavioral Patterns
        </h1>
        <p className="mt-2 text-ev-elephant">
          Detected communication sequences and recurring motifs
        </p>
      </div>

      {/* Filters */}
      <div className="flex items-end gap-3">
        <div>
          <label
            htmlFor="min-occurrences"
            className="block text-xs text-ev-warm-gray mb-1"
          >
            Min Occurrences
          </label>
          <input
            id="min-occurrences"
            type="number"
            min={1}
            value={minOccurrences}
            onChange={(e) => setMinOccurrences(Number(e.target.value) || 1)}
            className="rounded-lg border border-ev-sand bg-white px-3 py-2 text-sm text-ev-charcoal w-24 focus:outline-none focus:border-accent-savanna/40 focus:ring-2 focus:ring-accent-savanna/10"
          />
        </div>
        <button
          onClick={fetchPatterns}
          className="rounded-lg bg-accent-savanna px-4 py-2 text-sm font-semibold text-ev-ivory hover:bg-accent-savanna/90"
        >
          Search
        </button>
      </div>

      {/* Content */}
      {loading ? (
        <div className="rounded-lg border border-ev-sand bg-ev-cream p-5 flex items-center justify-center gap-2">
          <Loader2 className="h-5 w-5 animate-spin text-ev-elephant" />
          <span className="text-ev-elephant">Loading patterns...</span>
        </div>
      ) : error ? (
        <div className="rounded-lg border border-ev-sand bg-ev-cream p-5 text-center text-ev-elephant">
          {error}
        </div>
      ) : patterns.length === 0 ? (
        <div className="rounded-lg border border-ev-sand bg-ev-cream p-5 text-center text-ev-elephant">
          No behavioral patterns detected. Try lowering the minimum occurrences
          threshold or processing more recordings.
        </div>
      ) : (
        <div className="grid gap-4">
          {patterns.map((pat) => (
            <div key={pat.pattern_id}>
              {/* Pattern card */}
              <div className="rounded-lg border border-ev-sand bg-ev-cream p-5">
                {/* Motif sequence */}
                <div className="flex items-center gap-1.5 flex-wrap mb-4">
                  <GitBranch className="h-4 w-4 text-ev-warm-gray shrink-0" />
                  {pat.motif.map((item, idx) => (
                    <span key={idx} className="flex items-center gap-1.5">
                      <span className="px-2.5 py-1 rounded-md text-xs font-medium border bg-accent-savanna/10 text-accent-savanna border-accent-savanna/20">
                        {item}
                      </span>
                      {idx < pat.motif.length - 1 && (
                        <ArrowRight className="h-3.5 w-3.5 text-ev-warm-gray" />
                      )}
                    </span>
                  ))}
                </div>

                {/* Stats row */}
                <div className="flex flex-wrap items-center gap-4 text-sm mb-3">
                  <div className="flex items-center gap-1.5">
                    <Repeat className="h-3.5 w-3.5 text-ev-warm-gray" />
                    <span className="text-xs text-ev-warm-gray">Occurrences</span>
                    <span className="text-ev-charcoal font-medium">
                      {pat.occurrences}
                    </span>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <Hash className="h-3.5 w-3.5 text-ev-warm-gray" />
                    <span className="text-xs text-ev-warm-gray">Recordings</span>
                    <span className="text-ev-charcoal font-medium">
                      {pat.recordings.length}
                    </span>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <span className="text-xs text-ev-warm-gray">Avg gap</span>
                    <span className="text-ev-elephant font-medium">
                      {pat.avg_gap_ms.toFixed(0)} ms
                    </span>
                  </div>
                </div>

                {/* View Instances button */}
                <button
                  onClick={() => handleViewInstances(pat.pattern_id)}
                  className="rounded-lg border border-ev-sand px-3 py-2 text-sm text-ev-charcoal hover:bg-ev-sand/20"
                >
                  {expandedId === pat.pattern_id
                    ? "Hide Instances"
                    : "View Instances"}
                </button>
              </div>

              {/* Instances panel */}
              {expandedId === pat.pattern_id && (
                <div className="mt-2 rounded-lg border border-ev-sand bg-ev-cream p-5">
                  {instancesLoading ? (
                    <div className="flex items-center justify-center gap-2">
                      <Loader2 className="h-4 w-4 animate-spin text-ev-elephant" />
                      <span className="text-ev-elephant text-sm">
                        Loading instances...
                      </span>
                    </div>
                  ) : instances.length === 0 ? (
                    <p className="text-center text-ev-elephant text-sm">
                      No instances found.
                    </p>
                  ) : (
                    <div className="space-y-3">
                      <h3 className="text-sm font-semibold text-ev-charcoal">
                        Instances ({instances.length})
                      </h3>
                      {instances.map((inst, idx) => (
                        <div
                          key={idx}
                          className="rounded-lg border border-ev-sand bg-white p-4"
                        >
                          <div className="grid grid-cols-2 sm:grid-cols-3 gap-x-4 gap-y-2">
                            {Object.entries(inst).map(([key, value]) => (
                              <div key={key}>
                                <p className="text-xs text-ev-warm-gray">
                                  {key}
                                </p>
                                <p className="text-sm text-ev-charcoal break-all">
                                  {typeof value === "object"
                                    ? JSON.stringify(value)
                                    : String(value ?? "--")}
                                </p>
                              </div>
                            ))}
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </main>
  );
}
