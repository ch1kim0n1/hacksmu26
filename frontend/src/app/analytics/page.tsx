"use client";

import { useState, useCallback, useEffect } from "react";
import {
  PieChart,
  Users,
  MapPin,
  Clock,
  Network,
  Loader2,
} from "lucide-react";
import {
  getPopulationAnalytics,
  getAnalyticsSocialGraph,
  type PopulationAnalytics,
  type AnalyticsSocialGraph,
} from "@/lib/audio-api";

export default function AnalyticsPage() {
  const [population, setPopulation] = useState<PopulationAnalytics | null>(null);
  const [socialGraph, setSocialGraph] = useState<AnalyticsSocialGraph | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchData = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const [pop, graph] = await Promise.all([
        getPopulationAnalytics(),
        getAnalyticsSocialGraph(),
      ]);
      setPopulation(pop);
      setSocialGraph(graph);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load analytics");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  if (loading) {
    return (
      <main className="p-6 lg:p-8 max-w-6xl mx-auto space-y-6">
        <div className="flex items-center justify-center py-32">
          <Loader2 className="h-6 w-6 animate-spin text-ev-elephant" />
          <span className="ml-3 text-ev-elephant">Loading analytics...</span>
        </div>
      </main>
    );
  }

  if (error) {
    return (
      <main className="p-6 lg:p-8 max-w-6xl mx-auto space-y-6">
        <div className="rounded-lg border border-ev-sand bg-ev-cream p-5 text-center">
          <p className="text-danger mb-4">{error}</p>
          <button
            onClick={fetchData}
            className="rounded-lg bg-accent-savanna px-4 py-2 text-sm font-semibold text-ev-ivory hover:bg-accent-savanna/90"
          >
            Retry
          </button>
        </div>
      </main>
    );
  }

  if (!population || !socialGraph) return null;

  const callTypeDist = population.call_type_distribution;
  const socialFuncDist = population.social_function_distribution;
  const bySite = population.by_site;
  const hourly = population.temporal_patterns.hourly_distribution;

  const callTypeMax = Math.max(...Object.values(callTypeDist), 1);
  const totalCalls = Object.values(callTypeDist).reduce((a, b) => a + b, 0);

  const socialFuncMax = Math.max(...Object.values(socialFuncDist), 1);

  const hourlyMax = Math.max(...hourly, 1);

  return (
    <main className="p-6 lg:p-8 max-w-6xl mx-auto space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-4xl font-bold text-ev-charcoal">Analytics</h1>
        <p className="mt-2 text-ev-elephant">
          Population distribution, communication networks, and temporal patterns
        </p>
      </div>

      {/* Cards grid */}
      <div className="grid gap-4 md:grid-cols-2">
        {/* Call Type Distribution */}
        <div className="rounded-lg border border-ev-sand bg-ev-cream p-5">
          <div className="flex items-center gap-2 mb-4">
            <PieChart className="h-4 w-4 text-ev-warm-gray" />
            <h2 className="text-sm font-semibold text-ev-charcoal">
              Call Type Distribution
            </h2>
            <span className="ml-auto text-xs text-ev-warm-gray">
              {totalCalls} total calls
            </span>
          </div>
          <div className="space-y-2">
            {Object.entries(callTypeDist)
              .sort(([, a], [, b]) => b - a)
              .map(([type, count]) => (
                <div key={type} className="flex items-center gap-3">
                  <span className="w-28 truncate text-xs text-ev-elephant capitalize">
                    {type}
                  </span>
                  <div className="flex-1 h-4 bg-white/60 rounded overflow-hidden">
                    <div
                      className="h-full bg-accent-savanna rounded"
                      style={{ width: `${(count / callTypeMax) * 100}%` }}
                    />
                  </div>
                  <span className="w-10 text-right text-xs tabular-nums text-ev-charcoal font-medium">
                    {count}
                  </span>
                </div>
              ))}
          </div>
        </div>

        {/* Social Function Distribution */}
        <div className="rounded-lg border border-ev-sand bg-ev-cream p-5">
          <div className="flex items-center gap-2 mb-4">
            <Users className="h-4 w-4 text-ev-warm-gray" />
            <h2 className="text-sm font-semibold text-ev-charcoal">
              Social Function Distribution
            </h2>
          </div>
          <div className="space-y-2">
            {Object.entries(socialFuncDist)
              .sort(([, a], [, b]) => b - a)
              .map(([func, count]) => (
                <div key={func} className="flex items-center gap-3">
                  <span className="w-28 truncate text-xs text-ev-elephant capitalize">
                    {func}
                  </span>
                  <div className="flex-1 h-4 bg-white/60 rounded overflow-hidden">
                    <div
                      className="h-full bg-accent-savanna rounded"
                      style={{ width: `${(count / socialFuncMax) * 100}%` }}
                    />
                  </div>
                  <span className="w-10 text-right text-xs tabular-nums text-ev-charcoal font-medium">
                    {count}
                  </span>
                </div>
              ))}
          </div>
        </div>

        {/* By Site */}
        <div className="rounded-lg border border-ev-sand bg-ev-cream p-5">
          <div className="flex items-center gap-2 mb-4">
            <MapPin className="h-4 w-4 text-ev-warm-gray" />
            <h2 className="text-sm font-semibold text-ev-charcoal">
              By Site
            </h2>
          </div>
          <div className="space-y-3">
            {Object.entries(bySite).map(([site, data]) => (
              <div
                key={site}
                className="flex items-center justify-between gap-2"
              >
                <span className="text-xs text-ev-elephant truncate flex-1">
                  {site}
                </span>
                <span className="text-xs tabular-nums text-ev-charcoal font-medium">
                  {data.call_count} calls
                </span>
                <span className="rounded-md border border-accent-savanna/20 bg-accent-savanna/10 px-2 py-0.5 text-[11px] font-semibold text-accent-savanna capitalize">
                  {data.dominant_type}
                </span>
              </div>
            ))}
            {Object.keys(bySite).length === 0 && (
              <p className="text-xs text-ev-warm-gray">No site data available</p>
            )}
          </div>
        </div>

        {/* Hourly Distribution */}
        <div className="rounded-lg border border-ev-sand bg-ev-cream p-5">
          <div className="flex items-center gap-2 mb-4">
            <Clock className="h-4 w-4 text-ev-warm-gray" />
            <h2 className="text-sm font-semibold text-ev-charcoal">
              Hourly Distribution
            </h2>
          </div>
          <div className="flex items-end gap-[3px] h-32">
            {hourly.map((count, hour) => (
              <div
                key={hour}
                className="flex-1 flex flex-col items-center justify-end h-full"
              >
                <div
                  className="w-full bg-accent-savanna rounded-t"
                  style={{
                    height: `${(count / hourlyMax) * 100}%`,
                    minHeight: count > 0 ? "2px" : "0px",
                  }}
                />
                {hour % 4 === 0 && (
                  <span className="text-[9px] text-ev-warm-gray mt-1 tabular-nums">
                    {hour}
                  </span>
                )}
              </div>
            ))}
          </div>
          <div className="flex justify-between mt-1">
            <span className="text-[9px] text-ev-warm-gray">Hour of day</span>
            <span className="text-[9px] text-ev-warm-gray">
              Peak: {hourly.indexOf(Math.max(...hourly))}:00
            </span>
          </div>
        </div>

        {/* Social Graph */}
        <div className="rounded-lg border border-ev-sand bg-ev-cream p-5 md:col-span-2">
          <div className="flex items-center gap-2 mb-4">
            <Network className="h-4 w-4 text-ev-warm-gray" />
            <h2 className="text-sm font-semibold text-ev-charcoal">
              Social Graph
            </h2>
            <span className="ml-auto text-xs text-ev-warm-gray">
              {socialGraph.nodes.length} nodes &middot; {socialGraph.edges.length} edges
            </span>
          </div>

          <div className="grid gap-4 md:grid-cols-2">
            {/* Nodes */}
            <div>
              <h3 className="text-xs font-semibold text-ev-warm-gray mb-2 uppercase tracking-wider">
                Nodes
              </h3>
              <div className="space-y-1.5 max-h-60 overflow-y-auto">
                {socialGraph.nodes.map((node) => (
                  <div
                    key={node.id}
                    className="flex items-center justify-between gap-2 rounded bg-white/50 px-3 py-1.5"
                  >
                    <span className="text-xs text-ev-elephant font-mono truncate">
                      {node.id}
                    </span>
                    <div className="flex items-center gap-2">
                      <span className="text-xs tabular-nums text-ev-charcoal">
                        {node.call_count} calls
                      </span>
                      <span className="rounded-md border border-accent-savanna/20 bg-accent-savanna/10 px-2 py-0.5 text-[11px] font-semibold text-accent-savanna capitalize">
                        {node.dominant_type}
                      </span>
                    </div>
                  </div>
                ))}
                {socialGraph.nodes.length === 0 && (
                  <p className="text-xs text-ev-warm-gray">No nodes</p>
                )}
              </div>
            </div>

            {/* Edges */}
            <div>
              <h3 className="text-xs font-semibold text-ev-warm-gray mb-2 uppercase tracking-wider">
                Connections
              </h3>
              <div className="space-y-1.5 max-h-60 overflow-y-auto">
                {socialGraph.edges.map((edge, i) => (
                  <div
                    key={i}
                    className="flex items-center justify-between gap-2 rounded bg-white/50 px-3 py-1.5"
                  >
                    <span className="text-xs text-ev-elephant font-mono truncate">
                      {edge.from} &rarr; {edge.to}
                    </span>
                    <div className="flex items-center gap-3">
                      <span className="text-xs tabular-nums text-ev-charcoal">
                        {edge.response_count} responses
                      </span>
                      <span className="text-xs tabular-nums text-ev-warm-gray">
                        {(edge.avg_ici_ms / 1000).toFixed(1)}s avg
                      </span>
                    </div>
                  </div>
                ))}
                {socialGraph.edges.length === 0 && (
                  <p className="text-xs text-ev-warm-gray">No connections</p>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>
    </main>
  );
}
