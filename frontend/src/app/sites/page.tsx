"use client";

import { useState, useCallback, useEffect } from "react";
import {
  MapPin,
  Volume2,
  Clock,
  AlertTriangle,
  CheckCircle,
  Loader2,
} from "lucide-react";
import {
  getSites,
  getSiteNoiseProfile,
  getSiteRecommendations,
  type SiteSummary,
  type SiteNoiseProfile,
  type TimeWindow,
} from "@/lib/audio-api";

function formatHour(h: number): string {
  const hh = h % 24;
  const suffix = hh >= 12 ? "PM" : "AM";
  const display = hh === 0 ? 12 : hh > 12 ? hh - 12 : hh;
  return `${String(display).padStart(2, "0")}:00 ${suffix}`;
}

function formatFrequency(range: [number, number]): string {
  const fmt = (v: number) =>
    v >= 1000 ? `${(v / 1000).toFixed(1)} kHz` : `${Math.round(v)} Hz`;
  return `${fmt(range[0])} - ${fmt(range[1])}`;
}

export default function SitesPage() {
  const [sites, setSites] = useState<SiteSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [selectedSite, setSelectedSite] = useState<string | null>(null);
  const [noiseProfile, setNoiseProfile] = useState<SiteNoiseProfile | null>(
    null,
  );
  const [recommendations, setRecommendations] = useState<string[]>([]);
  const [optimalWindows, setOptimalWindows] = useState<TimeWindow[]>([]);
  const [detailLoading, setDetailLoading] = useState(false);
  const [detailError, setDetailError] = useState<string | null>(null);

  const fetchSites = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const data = await getSites();
      setSites(data);
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Failed to load sites",
      );
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchSites();
  }, [fetchSites]);

  const handleSelectSite = useCallback(
    async (location: string) => {
      if (selectedSite === location) {
        setSelectedSite(null);
        setNoiseProfile(null);
        setRecommendations([]);
        setOptimalWindows([]);
        return;
      }

      setSelectedSite(location);
      setDetailLoading(true);
      setDetailError(null);
      setNoiseProfile(null);
      setRecommendations([]);
      setOptimalWindows([]);

      try {
        const [profile, recs] = await Promise.all([
          getSiteNoiseProfile(location),
          getSiteRecommendations(location),
        ]);
        setNoiseProfile(profile);
        setOptimalWindows(
          profile.optimal_windows?.length
            ? profile.optimal_windows
            : recs.optimal_windows ?? [],
        );
        setRecommendations(
          profile.recommendations?.length
            ? profile.recommendations
            : recs.recommendations ?? [],
        );
      } catch (err) {
        setDetailError(
          err instanceof Error
            ? err.message
            : "Failed to load site details",
        );
      } finally {
        setDetailLoading(false);
      }
    },
    [selectedSite],
  );

  return (
    <main className="p-6 lg:p-8 max-w-6xl mx-auto space-y-6">
      {/* ── Header ─────────────────────────────────────────────── */}
      <div>
        <h1 className="text-4xl font-bold text-ev-charcoal">
          Recording Sites
        </h1>
        <p className="mt-2 text-ev-elephant">
          Location profiles with noise analysis and recording recommendations
        </p>
      </div>

      {/* ── Error banner ───────────────────────────────────────── */}
      {error && (
        <div className="flex items-center gap-3 rounded-lg border border-danger/20 bg-danger/10 p-4 text-sm text-danger">
          <AlertTriangle className="h-5 w-5 shrink-0" />
          {error}
        </div>
      )}

      {/* ── Loading skeleton ───────────────────────────────────── */}
      {loading ? (
        <div className="rounded-lg border border-ev-sand bg-ev-cream p-5 text-center">
          <Loader2 className="mx-auto h-6 w-6 animate-spin text-ev-elephant" />
          <p className="mt-2 text-sm text-ev-elephant">Loading sites...</p>
        </div>
      ) : sites.length === 0 ? (
        /* ── Empty state ─────────────────────────────────────── */
        <div className="rounded-lg border border-ev-sand bg-ev-cream p-5 text-center text-ev-elephant">
          <MapPin className="mx-auto h-8 w-8 text-ev-warm-gray" />
          <p className="mt-2 font-medium">No recording sites found</p>
          <p className="mt-1 text-sm text-ev-warm-gray">
            Upload recordings with location metadata to see site profiles here.
          </p>
        </div>
      ) : (
        <>
          {/* ── Site cards grid ─────────────────────────────────── */}
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            {sites.map((site) => {
              const isSelected = selectedSite === site.location;
              return (
                <button
                  key={site.location}
                  type="button"
                  onClick={() => handleSelectSite(site.location)}
                  className={`rounded-lg border p-5 text-left transition-colors ${
                    isSelected
                      ? "border-accent-savanna bg-accent-savanna/5"
                      : "border-ev-sand bg-ev-cream hover:border-ev-warm-gray"
                  }`}
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex items-center gap-2">
                      <MapPin className="h-4 w-4 shrink-0 text-ev-warm-gray" />
                      <h2 className="font-semibold text-ev-charcoal">
                        {site.location}
                      </h2>
                    </div>
                    <span className="px-2.5 py-1 rounded-md text-xs font-medium border border-ev-sand bg-ev-cream text-ev-elephant">
                      {site.recording_count} recording
                      {site.recording_count !== 1 ? "s" : ""}
                    </span>
                  </div>
                </button>
              );
            })}
          </div>

          {/* ── Detail panel ───────────────────────────────────── */}
          {selectedSite && (
            <div className="space-y-4">
              {detailLoading ? (
                <div className="rounded-lg border border-ev-sand bg-ev-cream p-5 text-center">
                  <Loader2 className="mx-auto h-6 w-6 animate-spin text-ev-elephant" />
                  <p className="mt-2 text-sm text-ev-elephant">
                    Loading profile for {selectedSite}...
                  </p>
                </div>
              ) : detailError ? (
                <div className="flex items-center gap-3 rounded-lg border border-danger/20 bg-danger/10 p-4 text-sm text-danger">
                  <AlertTriangle className="h-5 w-5 shrink-0" />
                  {detailError}
                </div>
              ) : (
                <>
                  {/* ── Noise Profile ───────────────────────────── */}
                  {noiseProfile && (
                    <div className="rounded-lg border border-ev-sand bg-ev-cream p-5 space-y-4">
                      <div className="flex items-center gap-2">
                        <Volume2 className="h-5 w-5 text-ev-warm-gray" />
                        <h3 className="text-lg font-semibold text-ev-charcoal">
                          Noise Profile
                        </h3>
                      </div>

                      <div className="flex flex-wrap gap-4 text-sm">
                        <div>
                          <span className="text-xs text-ev-warm-gray">
                            Recordings analyzed
                          </span>
                          <p className="font-medium text-ev-charcoal">
                            {noiseProfile.recordings_analyzed}
                          </p>
                        </div>
                        <div>
                          <span className="text-xs text-ev-warm-gray">
                            Noise floor
                          </span>
                          <p className="font-medium text-ev-charcoal">
                            {noiseProfile.noise_floor_db.toFixed(1)} dB
                          </p>
                        </div>
                      </div>

                      {noiseProfile.noise_sources.length > 0 && (
                        <div className="space-y-2">
                          <p className="text-xs font-medium text-ev-warm-gray uppercase tracking-wide">
                            Noise Sources
                          </p>
                          <div className="space-y-2">
                            {noiseProfile.noise_sources.map((src) => (
                              <div
                                key={src.noise_type}
                                className="flex flex-wrap items-center gap-3 rounded-md border border-ev-sand bg-white/60 px-4 py-3 text-sm"
                              >
                                <span className="px-2.5 py-1 rounded-md text-xs font-medium border border-accent-savanna/30 bg-accent-savanna/10 text-accent-savanna">
                                  {src.noise_type}
                                </span>
                                <span className="text-ev-elephant">
                                  <span className="text-xs text-ev-warm-gray">
                                    occurrence{" "}
                                  </span>
                                  {(src.occurrence_rate * 100).toFixed(0)}%
                                </span>
                                <span className="text-ev-elephant">
                                  <span className="text-xs text-ev-warm-gray">
                                    range{" "}
                                  </span>
                                  {formatFrequency(src.avg_frequency_range_hz)}
                                </span>
                                <span className="text-ev-elephant">
                                  <span className="text-xs text-ev-warm-gray">
                                    energy{" "}
                                  </span>
                                  {src.avg_energy_db.toFixed(1)} dB
                                </span>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>
                  )}

                  {/* ── Optimal Windows ─────────────────────────── */}
                  {optimalWindows.length > 0 && (
                    <div className="rounded-lg border border-ev-sand bg-ev-cream p-5 space-y-4">
                      <div className="flex items-center gap-2">
                        <Clock className="h-5 w-5 text-ev-warm-gray" />
                        <h3 className="text-lg font-semibold text-ev-charcoal">
                          Optimal Recording Windows
                        </h3>
                      </div>

                      <div className="space-y-2">
                        {optimalWindows.map((w, i) => (
                          <div
                            key={i}
                            className="flex flex-wrap items-center gap-3 rounded-md border border-ev-sand bg-white/60 px-4 py-3 text-sm"
                          >
                            <span className="font-medium text-ev-charcoal tabular-nums">
                              {formatHour(w.start_hour)} -{" "}
                              {formatHour(w.end_hour)}
                            </span>
                            <span className="text-ev-elephant">
                              <span className="text-xs text-ev-warm-gray">
                                avg noise{" "}
                              </span>
                              {w.avg_noise_db.toFixed(1)} dB
                            </span>
                            {w.dominant_noise && (
                              <span className="px-2.5 py-1 rounded-md text-xs font-medium border border-ev-sand bg-ev-cream text-ev-elephant">
                                {w.dominant_noise}
                              </span>
                            )}
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* ── Recommendations ─────────────────────────── */}
                  {recommendations.length > 0 && (
                    <div className="rounded-lg border border-ev-sand bg-ev-cream p-5 space-y-4">
                      <div className="flex items-center gap-2">
                        <CheckCircle className="h-5 w-5 text-success" />
                        <h3 className="text-lg font-semibold text-ev-charcoal">
                          Recommendations
                        </h3>
                      </div>

                      <ul className="space-y-2">
                        {recommendations.map((rec, i) => (
                          <li
                            key={i}
                            className="flex items-start gap-2 text-sm text-ev-elephant"
                          >
                            <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-ev-warm-gray" />
                            {rec}
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}
                </>
              )}
            </div>
          )}
        </>
      )}
    </main>
  );
}
