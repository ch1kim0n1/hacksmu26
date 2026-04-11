"use client";

import { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { getCalls, type Call } from "@/lib/audio-api";

const CALL_TYPES = [
  "All Types",
  "Rumble",
  "Trumpet",
  "Roar",
  "Bark",
  "Cry",
  "Contact Call",
  "Greeting",
  "Play",
  "Other",
];

const PAGE_SIZE = 12;

function CallTypeBadge({ type }: { type: string }) {
  const colors: Record<string, string> = {
    rumble: "bg-accent-savanna/15 text-accent-savanna border-accent-savanna/20",
    trumpet: "bg-accent-gold/15 text-accent-gold border-accent-gold/20",
    roar: "bg-danger/15 text-danger border-danger/20",
    bark: "bg-warning/15 text-warning border-warning/20",
    cry: "bg-purple-400/15 text-purple-400 border-purple-400/20",
    "contact call": "bg-success/15 text-success border-success/20",
    greeting: "bg-blue-400/15 text-blue-400 border-blue-400/20",
    play: "bg-pink-400/15 text-pink-400 border-pink-400/20",
  };

  const c =
    colors[type.toLowerCase()] ||
    "bg-ev-warm-gray/15 text-ev-warm-gray border-ev-warm-gray/20";

  return (
    <span className={`px-2.5 py-1 rounded-md text-xs font-medium border ${c}`}>
      {type}
    </span>
  );
}

export default function DatabasePage() {
  const router = useRouter();

  const [calls, setCalls] = useState<Call[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [search, setSearch] = useState("");
  const [callTypeFilter, setCallTypeFilter] = useState("All Types");
  const [locationFilter, setLocationFilter] = useState("");
  const [page, setPage] = useState(0);

  const fetchCalls = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const data = await getCalls({
        limit: PAGE_SIZE,
        offset: page * PAGE_SIZE,
        call_type: callTypeFilter !== "All Types" ? callTypeFilter : undefined,
      });
      setCalls(data.calls);
      setTotal(data.total);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load calls");
    } finally {
      setLoading(false);
    }
  }, [page, callTypeFilter]);

  useEffect(() => {
    fetchCalls();
  }, [fetchCalls]);

  // Client-side filtering for search and location
  const filtered = calls.filter((call) => {
    if (search) {
      const q = search.toLowerCase();
      const matchesId = call.id.toLowerCase().includes(q);
      const matchesRecording = call.recording_id.toLowerCase().includes(q);
      const matchesType = call.call_type.toLowerCase().includes(q);
      if (!matchesId && !matchesRecording && !matchesType) return false;
    }
    if (locationFilter) {
      const loc = (call.metadata as Record<string, string>)?.location || "";
      if (!loc.toLowerCase().includes(locationFilter.toLowerCase())) return false;
    }
    return true;
  });

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  return (
    <div className="min-h-screen bg-ev-ivory">
      <div className="max-w-7xl mx-auto px-6 py-12">
        {/* Header */}
        <div className="mb-8">
          <Link
            href="/"
            className="inline-flex items-center gap-2 text-ev-warm-gray hover:text-ev-elephant transition-colors mb-4"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
            </svg>
            Home
          </Link>
          <h1 className="text-4xl font-bold text-ev-charcoal">
            Call Database
          </h1>
          <p className="text-ev-elephant mt-2">
            Browse and search all detected elephant vocalizations.
          </p>
        </div>

        {/* Search */}
        <div className="mb-6">
          <div className="relative">
            <svg
              className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-ev-warm-gray"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
            >
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
            </svg>
            <input
              type="text"
              placeholder="Search by call ID, recording ID, or type..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full pl-12 pr-4 py-3 bg-ev-cream border border-ev-sand rounded-xl text-ev-charcoal placeholder:text-ev-warm-gray focus:outline-none focus:border-accent-savanna/50 transition-colors"
            />
          </div>
        </div>

        {/* Filters */}
        <div className="flex flex-wrap gap-4 mb-8">
          <select
            value={callTypeFilter}
            onChange={(e) => {
              setCallTypeFilter(e.target.value);
              setPage(0);
            }}
            className="px-4 py-2.5 bg-ev-cream border border-ev-sand rounded-lg text-ev-charcoal text-sm focus:outline-none focus:border-accent-savanna/50"
          >
            {CALL_TYPES.map((t) => (
              <option key={t} value={t}>
                {t}
              </option>
            ))}
          </select>

          <input
            type="text"
            placeholder="Filter by location..."
            value={locationFilter}
            onChange={(e) => setLocationFilter(e.target.value)}
            className="px-4 py-2.5 bg-ev-cream border border-ev-sand rounded-lg text-ev-charcoal placeholder:text-ev-warm-gray text-sm focus:outline-none focus:border-accent-savanna/50"
          />

          <div className="flex-1" />

          <span className="flex items-center text-sm text-ev-warm-gray">
            {total} total calls
          </span>
        </div>

        {/* Call Grid */}
        {loading ? (
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {Array.from({ length: 6 }).map((_, i) => (
              <div
                key={i}
                className="p-5 rounded-xl bg-ev-cream border border-ev-sand animate-pulse"
              >
                <div className="h-4 w-24 bg-background-elevated rounded mb-3" />
                <div className="h-3 w-36 bg-background-elevated rounded mb-4" />
                <div className="h-6 w-16 bg-background-elevated rounded mb-3" />
                <div className="h-3 w-full bg-background-elevated rounded" />
              </div>
            ))}
          </div>
        ) : error ? (
          <div className="p-8 rounded-xl bg-ev-cream border border-ev-sand text-center">
            <p className="text-danger mb-4">{error}</p>
            <button
              onClick={fetchCalls}
              className="px-4 py-2 bg-background-elevated text-ev-elephant rounded-lg hover:text-ev-charcoal transition-colors"
            >
              Retry
            </button>
          </div>
        ) : filtered.length === 0 ? (
          <div className="p-12 rounded-xl bg-ev-cream border border-ev-sand text-center">
            <svg
              className="w-12 h-12 text-ev-warm-gray mx-auto mb-4"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
            >
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9.172 16.172a4 4 0 015.656 0M9 10h.01M15 10h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            <p className="text-ev-elephant mb-1">No calls found</p>
            <p className="text-ev-warm-gray text-sm">
              Try adjusting your filters or upload recordings for processing.
            </p>
          </div>
        ) : (
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {filtered.map((call) => (
              <button
                key={call.id}
                onClick={() => router.push(`/results/${call.id}`)}
                className="p-5 rounded-xl bg-ev-cream border border-ev-sand hover:border-accent-savanna/30 transition-all text-left group"
              >
                <div className="flex items-start justify-between mb-3">
                  <div>
                    <p className="font-mono text-xs text-ev-warm-gray mb-1">
                      {call.id.slice(0, 12)}...
                    </p>
                    <p className="text-xs text-ev-warm-gray">
                      Rec: {call.recording_id.slice(0, 8)}...
                    </p>
                  </div>
                  <CallTypeBadge type={call.call_type} />
                </div>

                <div className="grid grid-cols-2 gap-3 mt-4 text-sm">
                  <div>
                    <p className="text-ev-warm-gray text-xs">Duration</p>
                    <p className="text-ev-charcoal font-medium">
                      {(call.end_time - call.start_time).toFixed(2)}s
                    </p>
                  </div>
                  <div>
                    <p className="text-ev-warm-gray text-xs">Frequency</p>
                    <p className="text-ev-charcoal font-medium">
                      {call.frequency_low && call.frequency_high
                        ? `${call.frequency_low}-${call.frequency_high} Hz`
                        : "--"}
                    </p>
                  </div>
                  <div>
                    <p className="text-ev-warm-gray text-xs">Confidence</p>
                    <p className="text-ev-charcoal font-medium">
                      {call.confidence !== undefined
                        ? `${(call.confidence * 100).toFixed(0)}%`
                        : "--"}
                    </p>
                  </div>
                  <div>
                    <p className="text-ev-warm-gray text-xs">Start</p>
                    <p className="text-ev-charcoal font-medium">
                      {call.start_time.toFixed(2)}s
                    </p>
                  </div>
                </div>

                <div className="mt-4 flex items-center gap-1 text-xs text-accent-savanna opacity-0 group-hover:opacity-100 transition-opacity">
                  View details
                  <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                  </svg>
                </div>
              </button>
            ))}
          </div>
        )}

        {/* Pagination */}
        {totalPages > 1 && (
          <div className="flex items-center justify-center gap-2 mt-10">
            <button
              onClick={() => setPage(Math.max(0, page - 1))}
              disabled={page === 0}
              className="px-4 py-2 bg-ev-cream border border-ev-sand rounded-lg text-ev-elephant hover:text-ev-charcoal transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
            >
              Previous
            </button>

            {Array.from({ length: Math.min(5, totalPages) }).map((_, i) => {
              let pageNum: number;
              if (totalPages <= 5) {
                pageNum = i;
              } else if (page < 3) {
                pageNum = i;
              } else if (page > totalPages - 4) {
                pageNum = totalPages - 5 + i;
              } else {
                pageNum = page - 2 + i;
              }

              return (
                <button
                  key={pageNum}
                  onClick={() => setPage(pageNum)}
                  className={`w-10 h-10 rounded-lg text-sm font-medium transition-colors ${
                    page === pageNum
                      ? "bg-accent-savanna text-ev-ivory"
                      : "bg-ev-cream border border-ev-sand text-ev-elephant hover:text-ev-charcoal"
                  }`}
                >
                  {pageNum + 1}
                </button>
              );
            })}

            <button
              onClick={() => setPage(Math.min(totalPages - 1, page + 1))}
              disabled={page >= totalPages - 1}
              className="px-4 py-2 bg-ev-cream border border-ev-sand rounded-lg text-ev-elephant hover:text-ev-charcoal transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
            >
              Next
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
