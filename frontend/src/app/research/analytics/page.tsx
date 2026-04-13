"use client";

import { useState, useEffect, useCallback } from "react";
import {
  BarChart3,
  Loader2,
  Activity,
  Grid3X3,
  Target,
  Clock,
  AudioWaveform,
  Gauge,
  Users,
  CircleDot,
} from "lucide-react";
import {
  getAcousticOverview,
  type AcousticOverview,
} from "@/lib/audio-api";
import PlotlyChart from "@/components/research/PlotlyChart";

// ── Consistent call-type color palette ─────────────────────────────────
const TYPE_COLORS: Record<string, string> = {
  rumble: "#8B6914",
  trumpet: "#C4A46C",
  roar: "#B85C3A",
  bark: "#6B7A3E",
  cry: "#5B7B8A",
  unknown: "#9A9590",
};

const TYPE_ORDER = ["rumble", "trumpet", "roar", "bark", "cry"];

// Human-readable feature labels
const FEATURE_LABELS: Record<string, string> = {
  fundamental_frequency_hz: "Fundamental Freq (Hz)",
  harmonicity: "Harmonicity",
  bandwidth_hz: "Bandwidth (Hz)",
  spectral_centroid_hz: "Spectral Centroid (Hz)",
  spectral_rolloff_hz: "Spectral Rolloff (Hz)",
  snr_db: "SNR (dB)",
  spectral_flatness: "Spectral Flatness",
  spectral_entropy: "Spectral Entropy",
  jitter: "Jitter",
  shimmer: "Shimmer",
  hnr_db: "HNR (dB)",
  rms_energy: "RMS Energy",
  attack_time_ms: "Attack Time (ms)",
  decay_time_ms: "Decay Time (ms)",
  modulation_rate_hz: "Modulation Rate (Hz)",
  modulation_depth: "Modulation Depth",
  onset_strength: "Onset Strength",
  crest_factor: "Crest Factor",
  f0_variability: "F0 Variability",
  subharmonic_ratio: "Subharmonic Ratio",
  spectral_flux: "Spectral Flux",
  spectral_crest: "Spectral Crest",
  temporal_centroid: "Temporal Centroid",
  peak_amplitude: "Peak Amplitude",
  duration_s: "Duration (s)",
  zero_crossing_rate: "Zero Crossing Rate",
};

const SELECTABLE_FEATURES = Object.keys(FEATURE_LABELS);

// ── Chart section wrapper ──────────────────────────────────────────────
function ChartCard({
  title,
  icon: Icon,
  children,
  fullWidth = false,
}: {
  title: string;
  icon: React.ElementType;
  children: React.ReactNode;
  fullWidth?: boolean;
}) {
  return (
    <div
      className={`rounded-xl border border-ev-sand bg-ev-cream/80 backdrop-blur-sm p-5 ${
        fullWidth ? "lg:col-span-2" : ""
      }`}
    >
      <h3 className="text-sm font-semibold text-ev-charcoal mb-3 flex items-center gap-2">
        <Icon className="w-4 h-4 text-accent-savanna" />
        {title}
      </h3>
      {children}
    </div>
  );
}

// ── Page component ─────────────────────────────────────────────────────
export default function ResearchAnalyticsPage() {
  const [data, setData] = useState<AcousticOverview | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedFeature, setSelectedFeature] = useState("fundamental_frequency_hz");

  const fetchData = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const overview = await getAcousticOverview();
      setData(overview);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load research data");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  if (loading) {
    return (
      <main className="p-6 lg:p-8 max-w-7xl mx-auto">
        <div className="flex items-center justify-center py-20 text-ev-elephant">
          <Loader2 className="w-5 h-5 animate-spin mr-2" />
          Loading research analytics...
        </div>
      </main>
    );
  }

  if (error || !data) {
    return (
      <main className="p-6 lg:p-8 max-w-7xl mx-auto">
        <div className="rounded-lg border border-danger/20 bg-danger/10 p-4 text-danger text-sm">
          {error || "No data available"}
        </div>
      </main>
    );
  }

  // ── Prepare chart data ──────────────────────────────────────────────

  // 1. Feature Distribution (box plot)
  const featureDist = data.feature_distributions[selectedFeature] || {};
  const boxData = TYPE_ORDER.filter((t) => featureDist[t]).map((t) => ({
    y: featureDist[t].values,
    type: "box" as const,
    name: t.charAt(0).toUpperCase() + t.slice(1),
    marker: { color: TYPE_COLORS[t] },
    boxpoints: "outliers" as const,
    jitter: 0.3,
  }));

  // 2. Correlation heatmap
  const corrMatrix = data.correlation_matrix;
  const corrLabels = (corrMatrix.features || []).map(
    (f) => FEATURE_LABELS[f] || f,
  );

  // 3. Radar chart (call type profiles)
  const radarFeatures = SELECTABLE_FEATURES.slice(0, 10);
  const radarLabels = radarFeatures.map((f) => FEATURE_LABELS[f] || f);
  const radarTraces = TYPE_ORDER.filter((t) => data.call_type_profiles[t]).map((t) => {
    const profile = data.call_type_profiles[t];
    const values = radarFeatures.map((f) => profile[f] ?? 0);
    return {
      type: "scatterpolar" as const,
      r: [...values, values[0]], // close the polygon
      theta: [...radarLabels, radarLabels[0]],
      fill: "toself" as const,
      name: t.charAt(0).toUpperCase() + t.slice(1),
      fillcolor: TYPE_COLORS[t] + "22",
      line: { color: TYPE_COLORS[t], width: 2 },
    };
  });

  // 4. Temporal analysis (stacked bar)
  const hours = Array.from({ length: 24 }, (_, i) => `${i}:00`);
  const temporalTraces = TYPE_ORDER.filter((t) => data.temporal_patterns[t]).map((t) => ({
    x: hours,
    y: data.temporal_patterns[t],
    type: "bar" as const,
    name: t.charAt(0).toUpperCase() + t.slice(1),
    marker: { color: TYPE_COLORS[t] },
  }));

  // 5. F0 distribution (overlaid histograms)
  const f0Traces = TYPE_ORDER.filter((t) => data.f0_distributions[t]).map((t) => {
    const dist = data.f0_distributions[t];
    const midpoints = dist.bins
      .slice(0, -1)
      .map((b, i) => (b + dist.bins[i + 1]) / 2);
    return {
      x: midpoints,
      y: dist.counts,
      type: "bar" as const,
      name: t.charAt(0).toUpperCase() + t.slice(1),
      marker: { color: TYPE_COLORS[t], opacity: 0.7 },
    };
  });

  // 6. Quality metrics (SNR histogram)
  const snrTrace = {
    x: data.quality_metrics.snr_values,
    type: "histogram" as const,
    marker: { color: "#C4A46C" },
    opacity: 0.85,
    nbinsx: 30,
    name: "SNR (dB)",
  };

  // 7. Individual profiles (parallel coordinates)
  const profileEntries = Object.entries(data.individual_profiles);
  const parcoordFeatures = [
    "fundamental_frequency_hz",
    "harmonicity",
    "bandwidth_hz",
    "spectral_centroid_hz",
    "snr_db",
    "hnr_db",
    "rms_energy",
    "duration_s",
  ];
  const parcoordDims = parcoordFeatures.map((f) => ({
    label: FEATURE_LABELS[f] || f,
    values: profileEntries.map(([, p]) => p.features[f] ?? 0),
  }));
  const parcoordColors = profileEntries.map(([, p]) => {
    const top = Object.entries(p.call_types).sort((a, b) => b[1] - a[1])[0];
    const ct = top ? top[0] : "unknown";
    return TYPE_ORDER.indexOf(ct) >= 0 ? TYPE_ORDER.indexOf(ct) : 5;
  });

  // 8. PCA scatter
  const pcaByType: Record<string, { x: number[]; y: number[] }> = {};
  for (const pt of data.pca_projection.slice(0, 1500)) {
    const t = pt.call_type || "unknown";
    if (!pcaByType[t]) pcaByType[t] = { x: [], y: [] };
    pcaByType[t].x.push(pt.x);
    pcaByType[t].y.push(pt.y);
  }
  const pcaTraces = TYPE_ORDER.filter((t) => pcaByType[t]).map((t) => ({
    x: pcaByType[t].x,
    y: pcaByType[t].y,
    mode: "markers" as const,
    type: "scatter" as const,
    name: t.charAt(0).toUpperCase() + t.slice(1),
    marker: { color: TYPE_COLORS[t], size: 5, opacity: 0.6 },
  }));

  return (
    <main className="p-6 lg:p-8 max-w-7xl mx-auto space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-3xl font-bold text-ev-charcoal flex items-center gap-3">
          <BarChart3 className="w-7 h-7 text-accent-savanna" />
          Research Analytics
        </h1>
        <p className="mt-2 text-ev-elephant">
          Acoustic feature analysis across {data.total_calls.toLocaleString()} detected
          elephant calls — {Object.keys(data.call_type_profiles).length} call types,{" "}
          {Object.keys(data.individual_profiles).length} individuals identified.
        </p>
      </div>

      {/* Stats bar */}
      <div className="grid gap-3 grid-cols-2 md:grid-cols-5">
        {TYPE_ORDER.map((t) => {
          const dist = data.feature_distributions.fundamental_frequency_hz?.[t];
          const count = dist?.values?.length ?? 0;
          return (
            <div
              key={t}
              className="rounded-lg border border-ev-sand bg-ev-cream px-4 py-3 flex items-center gap-3"
            >
              <div
                className="w-3 h-3 rounded-full shrink-0"
                style={{ backgroundColor: TYPE_COLORS[t] }}
              />
              <div>
                <div className="text-xs text-ev-warm-gray capitalize">{t}</div>
                <div className="text-lg font-bold text-ev-charcoal tabular-nums">
                  {count.toLocaleString()}
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* Charts grid */}
      <div className="grid gap-5 lg:grid-cols-2">
        {/* 1. Feature Distribution */}
        <ChartCard title="Feature Distribution by Call Type" icon={Activity} fullWidth>
          <div className="mb-3">
            <select
              value={selectedFeature}
              onChange={(e) => setSelectedFeature(e.target.value)}
              className="rounded-lg border border-ev-sand bg-white px-3 py-2 text-sm text-ev-charcoal"
            >
              {SELECTABLE_FEATURES.map((f) => (
                <option key={f} value={f}>
                  {FEATURE_LABELS[f]}
                </option>
              ))}
            </select>
          </div>
          <PlotlyChart
            data={boxData}
            layout={{
              yaxis: { title: FEATURE_LABELS[selectedFeature] || selectedFeature },
              showlegend: true,
              boxmode: "group",
            }}
            className="w-full h-[380px]"
          />
        </ChartCard>

        {/* 2. Correlation Heatmap */}
        <ChartCard title="Feature Correlation Matrix" icon={Grid3X3} fullWidth>
          <PlotlyChart
            data={[
              {
                z: corrMatrix.matrix,
                x: corrLabels,
                y: corrLabels,
                type: "heatmap",
                colorscale: [
                  [0, "#3B5998"],
                  [0.5, "#FFFFFF"],
                  [1, "#B85C3A"],
                ],
                zmin: -1,
                zmax: 1,
                colorbar: { title: "r", thickness: 14, len: 0.6 },
              },
            ]}
            layout={{
              margin: { t: 36, r: 16, b: 120, l: 120 },
              xaxis: { tickangle: -45, tickfont: { size: 9 } },
              yaxis: { tickfont: { size: 9 } },
            }}
            className="w-full h-[520px]"
          />
        </ChartCard>

        {/* 3. Call Type Radar */}
        <ChartCard title="Call Type Acoustic Profiles" icon={Target}>
          <PlotlyChart
            data={radarTraces}
            layout={{
              polar: {
                radialaxis: { visible: true, range: [0, 1], showticklabels: false },
                angularaxis: { tickfont: { size: 9 } },
              },
              margin: { t: 40, r: 40, b: 40, l: 40 },
              showlegend: true,
            }}
            className="w-full h-[420px]"
          />
        </ChartCard>

        {/* 4. Temporal Analysis */}
        <ChartCard title="Vocalization Activity by Hour" icon={Clock}>
          <PlotlyChart
            data={temporalTraces}
            layout={{
              barmode: "stack",
              xaxis: { title: "Hour of Day", tickangle: -45, tickfont: { size: 10 } },
              yaxis: { title: "Call Count" },
            }}
            className="w-full h-[420px]"
          />
        </ChartCard>

        {/* 5. F0 Landscape */}
        <ChartCard title="Fundamental Frequency Distribution" icon={AudioWaveform}>
          <PlotlyChart
            data={f0Traces}
            layout={{
              barmode: "overlay",
              xaxis: { title: "Frequency (Hz)" },
              yaxis: { title: "Count" },
            }}
            className="w-full h-[380px]"
          />
        </ChartCard>

        {/* 6. Quality Metrics */}
        <ChartCard title="Signal-to-Noise Ratio Distribution" icon={Gauge}>
          <PlotlyChart
            data={[snrTrace]}
            layout={{
              xaxis: { title: "SNR (dB)" },
              yaxis: { title: "Count" },
              showlegend: false,
            }}
            className="w-full h-[380px]"
          />
        </ChartCard>

        {/* 7. Individual Profiles */}
        <ChartCard title="Individual Elephant Voice Profiles" icon={Users} fullWidth>
          {profileEntries.length > 0 ? (
            <PlotlyChart
              data={[
                {
                  type: "parcoords",
                  line: {
                    color: parcoordColors,
                    colorscale: TYPE_ORDER.map((t, i) => [
                      i / Math.max(TYPE_ORDER.length - 1, 1),
                      TYPE_COLORS[t],
                    ]),
                    showscale: false,
                  },
                  dimensions: parcoordDims,
                  labelfont: { size: 10 },
                  tickfont: { size: 9 },
                },
              ]}
              layout={{ margin: { t: 50, r: 20, b: 20, l: 20 } }}
              className="w-full h-[400px]"
            />
          ) : (
            <div className="text-ev-warm-gray text-sm text-center py-10">
              No individual profiles available.
            </div>
          )}
        </ChartCard>

        {/* 8. PCA Scatter */}
        <ChartCard title="Population Feature Space (PCA)" icon={CircleDot} fullWidth>
          <PlotlyChart
            data={pcaTraces}
            layout={{
              xaxis: { title: "PC 1", zeroline: false },
              yaxis: { title: "PC 2", zeroline: false },
              showlegend: true,
            }}
            className="w-full h-[450px]"
          />
        </ChartCard>
      </div>
    </main>
  );
}
