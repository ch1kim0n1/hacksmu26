"use client";

import Link from "next/link";
import { useState, useEffect, useCallback, useMemo } from "react";
import { useParams, useRouter } from "next/navigation";
import { motion } from "framer-motion";
import {
  ArrowLeft,
  MapPin,
  Mic,
  FileAudio,
  Calendar,
  AlertCircle,
  RefreshCw,
  Users,
  Clock,
} from "lucide-react";
import {
  getElephant,
  getElephantCalls,
  type ElephantProfile,
  type Call,
} from "@/lib/audio-api";
import { staggerContainer, fadeUp } from "@/components/ui/motion-primitives";

/* ------------------------------------------------------------------ */
/*  Constants                                                          */
/* ------------------------------------------------------------------ */

const CALL_TYPE_COLORS: Record<string, string> = {
  rumble: "bg-accent-savanna/10 text-accent-savanna border-accent-savanna/20",
  trumpet: "bg-accent-gold/10 text-accent-gold border-accent-gold/20",
  roar: "bg-danger/10 text-danger border-danger/20",
  bark: "bg-warning/10 text-warning border-warning/20",
  cry: "bg-purple-400/10 text-purple-400 border-purple-400/20",
  "contact call": "bg-success/10 text-success border-success/20",
  greeting: "bg-blue-400/10 text-blue-400 border-blue-400/20",
  play: "bg-pink-400/10 text-pink-400 border-pink-400/20",
};

const DONUT_COLORS: Record<string, string> = {
  rumble: "#C4A46C",
  trumpet: "#A8873B",
  roar: "#EF4444",
  bark: "#F5A025",
  cry: "#A78BFA",
  "contact call": "#10C876",
  greeting: "#60A5FA",
  play: "#F472B6",
};

const RADAR_AXES: {
  key: keyof ElephantProfile["acoustic_signature"];
  label: string;
  max: number;
}[] = [
  { key: "fundamental_frequency_hz", label: "Fund. Freq", max: 30 },
  { key: "harmonicity", label: "Harmonicity", max: 1 },
  { key: "bandwidth_hz", label: "Bandwidth", max: 500 },
  { key: "snr_db", label: "SNR", max: 40 },
  { key: "spectral_centroid_hz", label: "Spectral Ctr.", max: 300 },
  { key: "duration_s", label: "Duration", max: 10 },
  { key: "pitch_contour_slope", label: "Pitch Slope", max: 100 },
  { key: "spectral_entropy", label: "Spec. Entropy", max: 1 },
];

/* ------------------------------------------------------------------ */
/*  Small components                                                   */
/* ------------------------------------------------------------------ */

function CallTypeBadge({ type }: { type: string }) {
  const c =
    CALL_TYPE_COLORS[type.toLowerCase()] ||
    "bg-ev-warm-gray/10 text-ev-warm-gray border-ev-warm-gray/20";
  return (
    <span
      className={`px-2 py-0.5 rounded-md text-[11px] font-semibold border ${c}`}
    >
      {type}
    </span>
  );
}

function formatDate(dateStr: string): string {
  try {
    const d = new Date(dateStr);
    return d.toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
      year: "numeric",
    });
  } catch {
    return dateStr;
  }
}

function formatTimestamp(dateStr: string): string {
  try {
    const d = new Date(dateStr);
    return d.toLocaleString("en-US", {
      month: "short",
      day: "numeric",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return dateStr;
  }
}

/* ------------------------------------------------------------------ */
/*  Radar Chart (SVG)                                                  */
/* ------------------------------------------------------------------ */

function RadarChart({
  signature,
}: {
  signature: ElephantProfile["acoustic_signature"];
}) {
  const size = 260;
  const cx = size / 2;
  const cy = size / 2;
  const radius = 100;
  const levels = 4;
  const n = RADAR_AXES.length;

  function angle(i: number) {
    return (Math.PI * 2 * i) / n - Math.PI / 2;
  }

  function pointOnAxis(i: number, r: number): [number, number] {
    const a = angle(i);
    return [cx + r * Math.cos(a), cy + r * Math.sin(a)];
  }

  // Normalized values (0-1)
  const values = RADAR_AXES.map((ax) => {
    const raw = signature[ax.key] ?? 0;
    return Math.min(1, Math.max(0, Math.abs(raw) / ax.max));
  });

  // Polygon points
  const polyPoints = values
    .map((v, i) => pointOnAxis(i, v * radius).join(","))
    .join(" ");

  return (
    <svg
      width={size}
      height={size}
      viewBox={`0 0 ${size} ${size}`}
      className="mx-auto"
    >
      {/* Grid levels */}
      {Array.from({ length: levels }).map((_, li) => {
        const r = (radius * (li + 1)) / levels;
        const pts = Array.from({ length: n })
          .map((_, i) => pointOnAxis(i, r).join(","))
          .join(" ");
        return (
          <polygon
            key={li}
            points={pts}
            fill="none"
            stroke="#D4CCC3"
            strokeWidth={0.5}
            opacity={0.6}
          />
        );
      })}

      {/* Axis lines */}
      {RADAR_AXES.map((_, i) => {
        const [ex, ey] = pointOnAxis(i, radius);
        return (
          <line
            key={i}
            x1={cx}
            y1={cy}
            x2={ex}
            y2={ey}
            stroke="#D4CCC3"
            strokeWidth={0.5}
            opacity={0.6}
          />
        );
      })}

      {/* Data polygon */}
      <polygon
        points={polyPoints}
        fill="rgba(196, 164, 108, 0.18)"
        stroke="#C4A46C"
        strokeWidth={2}
        strokeLinejoin="round"
      />

      {/* Data points */}
      {values.map((v, i) => {
        const [px, py] = pointOnAxis(i, v * radius);
        return (
          <circle key={i} cx={px} cy={py} r={3.5} fill="#C4A46C" stroke="#fff" strokeWidth={1.5} />
        );
      })}

      {/* Labels */}
      {RADAR_AXES.map((ax, i) => {
        const [lx, ly] = pointOnAxis(i, radius + 22);
        return (
          <text
            key={ax.key}
            x={lx}
            y={ly}
            textAnchor="middle"
            dominantBaseline="central"
            className="fill-ev-warm-gray"
            fontSize={9}
            fontWeight={500}
          >
            {ax.label}
          </text>
        );
      })}
    </svg>
  );
}

/* ------------------------------------------------------------------ */
/*  Donut Chart (SVG)                                                  */
/* ------------------------------------------------------------------ */

function DonutChart({
  distribution,
}: {
  distribution: Record<string, number>;
}) {
  const size = 200;
  const cx = size / 2;
  const cy = size / 2;
  const outerR = 80;
  const innerR = 50;

  const entries = Object.entries(distribution).sort((a, b) => b[1] - a[1]);
  const total = entries.reduce((s, [, v]) => s + v, 0);

  if (total === 0) {
    return (
      <div className="text-center text-sm text-ev-warm-gray py-8">
        No call type data
      </div>
    );
  }

  let cumAngle = -Math.PI / 2;
  const arcs = entries.map(([type, count]) => {
    const frac = count / total;
    const startAngle = cumAngle;
    const endAngle = cumAngle + frac * 2 * Math.PI;
    cumAngle = endAngle;
    const color = DONUT_COLORS[type.toLowerCase()] || "#8A837B";

    const largeArc = frac > 0.5 ? 1 : 0;
    const x1 = cx + outerR * Math.cos(startAngle);
    const y1 = cy + outerR * Math.sin(startAngle);
    const x2 = cx + outerR * Math.cos(endAngle);
    const y2 = cy + outerR * Math.sin(endAngle);
    const x3 = cx + innerR * Math.cos(endAngle);
    const y3 = cy + innerR * Math.sin(endAngle);
    const x4 = cx + innerR * Math.cos(startAngle);
    const y4 = cy + innerR * Math.sin(startAngle);

    const d = [
      `M ${x1} ${y1}`,
      `A ${outerR} ${outerR} 0 ${largeArc} 1 ${x2} ${y2}`,
      `L ${x3} ${y3}`,
      `A ${innerR} ${innerR} 0 ${largeArc} 0 ${x4} ${y4}`,
      "Z",
    ].join(" ");

    return { type, count, frac, d, color };
  });

  return (
    <div className="flex flex-col items-center gap-4">
      <svg
        width={size}
        height={size}
        viewBox={`0 0 ${size} ${size}`}
        className="mx-auto"
      >
        {arcs.map((arc) => (
          <path key={arc.type} d={arc.d} fill={arc.color} stroke="#F0EBE3" strokeWidth={1.5} />
        ))}
        <text
          x={cx}
          y={cy - 6}
          textAnchor="middle"
          className="fill-ev-charcoal"
          fontSize={20}
          fontWeight={700}
        >
          {total}
        </text>
        <text
          x={cx}
          y={cy + 12}
          textAnchor="middle"
          className="fill-ev-warm-gray"
          fontSize={10}
        >
          total calls
        </text>
      </svg>

      {/* Legend */}
      <div className="flex flex-wrap justify-center gap-x-4 gap-y-1.5">
        {arcs.map((arc) => (
          <div key={arc.type} className="flex items-center gap-1.5 text-xs">
            <span
              className="w-2.5 h-2.5 rounded-full shrink-0"
              style={{ backgroundColor: arc.color }}
            />
            <span className="text-ev-elephant capitalize">{arc.type}</span>
            <span className="text-ev-warm-gray tabular-nums">
              ({Math.round(arc.frac * 100)}%)
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Main Page                                                          */
/* ------------------------------------------------------------------ */

export default function ElephantProfilePage() {
  const params = useParams();
  const router = useRouter();
  const id = typeof params.id === "string" ? decodeURIComponent(params.id) : "";

  const [profile, setProfile] = useState<ElephantProfile | null>(null);
  const [calls, setCalls] = useState<Call[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchData = useCallback(async () => {
    if (!id) return;
    try {
      setLoading(true);
      setError(null);
      const [profileData, callsData] = await Promise.all([
        getElephant(id),
        getElephantCalls(id),
      ]);
      setProfile(profileData);
      setCalls(callsData.calls);
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Failed to load elephant profile"
      );
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const sortedDates = useMemo(() => {
    if (!profile) return [];
    return [...profile.dates].sort();
  }, [profile]);

  const firstSeen = sortedDates[0];
  const lastSeen = sortedDates[sortedDates.length - 1];

  /* ---- Loading ---- */
  if (loading) {
    return (
      <div className="p-6 lg:p-8 max-w-6xl mx-auto space-y-6">
        <div className="flex items-center gap-3">
          <div className="h-10 w-10 rounded-full bg-ev-sand/50 animate-pulse" />
          <div className="h-6 w-48 bg-ev-sand/50 rounded animate-pulse" />
        </div>
        <div className="grid md:grid-cols-2 gap-6">
          {Array.from({ length: 4 }).map((_, i) => (
            <div
              key={i}
              className="h-64 rounded-xl border border-ev-sand/40 bg-ev-cream/60 animate-pulse"
              style={{ animationDelay: `${i * 0.08}s` }}
            />
          ))}
        </div>
      </div>
    );
  }

  /* ---- Error ---- */
  if (error || !profile) {
    return (
      <div className="p-6 lg:p-8 max-w-6xl mx-auto">
        <Link
          href="/elephants"
          className="mb-6 inline-flex min-h-[44px] items-center gap-2 rounded-full border border-ev-sand/40 bg-white/80 px-4 py-2.5 text-sm font-medium text-ev-elephant shadow-sm transition-all hover:border-ev-warm-gray/30 hover:bg-white"
        >
          <ArrowLeft className="h-4 w-4" />
          Back to Elephants
        </Link>
        <div className="p-8 rounded-xl border border-ev-sand/40 bg-ev-cream/60 text-center">
          <AlertCircle className="w-8 h-8 text-danger mx-auto mb-3" />
          <p className="text-danger mb-4">
            {error || "Elephant not found"}
          </p>
          <motion.button
            whileHover={{ scale: 1.02 }}
            whileTap={{ scale: 0.98 }}
            onClick={fetchData}
            className="px-5 py-2 bg-ev-cream text-ev-elephant rounded-xl hover:text-ev-charcoal transition-colors text-sm font-medium inline-flex items-center gap-1.5"
          >
            <RefreshCw className="w-3.5 h-3.5" />
            Retry
          </motion.button>
        </div>
      </div>
    );
  }

  return (
    <div className="p-6 lg:p-8 max-w-6xl mx-auto space-y-8">
      {/* ── Section 1: Identity Header ── */}
      <motion.div
        initial={{ opacity: 0, y: -8 }}
        animate={{ opacity: 1, y: 0 }}
      >
        <Link
          href="/elephants"
          className="mb-4 inline-flex min-h-[44px] items-center gap-2 rounded-full border border-ev-sand/40 bg-white/80 px-4 py-2.5 text-sm font-medium text-ev-elephant shadow-sm transition-all hover:border-ev-warm-gray/30 hover:bg-white"
        >
          <ArrowLeft className="h-4 w-4" />
          Back to Elephants
        </Link>

        <div className="p-6 rounded-xl border border-ev-sand/40 bg-ev-cream/60">
          <h1 className="text-2xl font-bold text-ev-charcoal mb-3">
            {profile.individual_id}
          </h1>

          {/* Date range */}
          {firstSeen && (
            <p className="text-sm text-ev-warm-gray mb-4 flex items-center gap-1.5">
              <Calendar className="w-3.5 h-3.5" />
              First seen {formatDate(firstSeen)}
              {lastSeen && lastSeen !== firstSeen && (
                <> &mdash; Last seen {formatDate(lastSeen)}</>
              )}
            </p>
          )}

          {/* Stat badges */}
          <div className="flex flex-wrap gap-3">
            <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-accent-savanna/10 text-accent-savanna text-sm font-medium">
              <Mic className="w-3.5 h-3.5" />
              {profile.call_count} call
              {profile.call_count !== 1 ? "s" : ""}
            </span>
            <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-accent-gold/10 text-accent-gold text-sm font-medium">
              <FileAudio className="w-3.5 h-3.5" />
              {profile.recording_count} recording
              {profile.recording_count !== 1 ? "s" : ""}
            </span>
            {profile.locations.map((loc) => (
              <span
                key={loc}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-ev-sand/30 text-ev-elephant text-sm font-medium"
              >
                <MapPin className="w-3.5 h-3.5" />
                {loc}
              </span>
            ))}
          </div>
        </div>
      </motion.div>

      {/* ── Sections Grid ── */}
      <motion.div
        variants={staggerContainer}
        initial="initial"
        animate="animate"
        className="grid md:grid-cols-2 gap-6"
      >
        {/* ── Section 2: Acoustic Signature Radar Chart ── */}
        <motion.div
          variants={fadeUp}
          className="p-6 rounded-xl border border-ev-sand/40 bg-ev-cream/60"
        >
          <h2 className="text-base font-bold text-ev-charcoal mb-4">
            Acoustic Signature
          </h2>
          <RadarChart signature={profile.acoustic_signature} />

          {/* Raw values */}
          <div className="mt-4 grid grid-cols-2 gap-x-4 gap-y-1.5">
            {RADAR_AXES.map((ax) => {
              const val = profile.acoustic_signature[ax.key];
              return (
                <div key={ax.key} className="flex items-center justify-between text-xs">
                  <span className="text-ev-warm-gray">{ax.label}</span>
                  <span className="text-ev-charcoal font-medium tabular-nums">
                    {typeof val === "number" ? val.toFixed(2) : "--"}
                  </span>
                </div>
              );
            })}
          </div>
        </motion.div>

        {/* ── Section 3: Call Type Breakdown ── */}
        <motion.div
          variants={fadeUp}
          className="p-6 rounded-xl border border-ev-sand/40 bg-ev-cream/60"
        >
          <h2 className="text-base font-bold text-ev-charcoal mb-4">
            Call Type Breakdown
          </h2>
          <DonutChart distribution={profile.call_type_distribution} />
        </motion.div>

        {/* ── Section 4: Recent Calls Timeline ── */}
        <motion.div
          variants={fadeUp}
          className="p-6 rounded-xl border border-ev-sand/40 bg-ev-cream/60"
        >
          <h2 className="text-base font-bold text-ev-charcoal mb-4 flex items-center gap-2">
            <Clock className="w-4 h-4 text-accent-savanna" />
            Recent Calls
          </h2>

          {calls.length === 0 ? (
            <p className="text-sm text-ev-warm-gray py-4 text-center">
              No calls recorded yet.
            </p>
          ) : (
            <div className="space-y-2 max-h-80 overflow-y-auto pr-1">
              {calls.slice(0, 20).map((call) => (
                <div
                  key={call.id}
                  className="flex items-center gap-3 p-3 rounded-lg bg-white/50 border border-ev-sand/20"
                >
                  {/* Timeline dot */}
                  <div className="w-2 h-2 rounded-full bg-accent-savanna shrink-0" />

                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <CallTypeBadge type={call.call_type} />
                      {call.confidence !== undefined && (
                        <span className="text-[11px] text-ev-warm-gray tabular-nums">
                          {(call.confidence * 100).toFixed(0)}% conf.
                        </span>
                      )}
                    </div>
                    <p className="text-[11px] text-ev-warm-gray mt-0.5 truncate">
                      {call.date
                        ? formatTimestamp(call.date)
                        : `${call.start_time.toFixed(2)}s - ${call.end_time.toFixed(2)}s`}
                    </p>
                  </div>

                  {/* Duration */}
                  <span className="text-xs text-ev-elephant tabular-nums shrink-0">
                    {(call.end_time - call.start_time).toFixed(2)}s
                  </span>
                </div>
              ))}
              {calls.length > 20 && (
                <p className="text-center text-xs text-ev-warm-gray pt-2">
                  + {calls.length - 20} more calls
                </p>
              )}
            </div>
          )}
        </motion.div>

        {/* ── Section 5: Social Connections ── */}
        <motion.div
          variants={fadeUp}
          className="p-6 rounded-xl border border-ev-sand/40 bg-ev-cream/60"
        >
          <h2 className="text-base font-bold text-ev-charcoal mb-4 flex items-center gap-2">
            <Users className="w-4 h-4 text-accent-savanna" />
            Social Connections
          </h2>

          {profile.social_connections.length === 0 ? (
            <p className="text-sm text-ev-warm-gray py-4 text-center">
              No social connections detected.
            </p>
          ) : (
            <div className="flex flex-wrap gap-2">
              {profile.social_connections.map((connId) => (
                <motion.button
                  key={connId}
                  whileHover={{ scale: 1.04 }}
                  whileTap={{ scale: 0.96 }}
                  onClick={() =>
                    router.push(
                      `/elephants/${encodeURIComponent(connId)}`
                    )
                  }
                  className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg bg-white/60 border border-ev-sand/30 text-sm text-ev-charcoal font-medium hover:border-accent-savanna/40 hover:shadow-sm transition-all"
                >
                  <div className="w-6 h-6 rounded-full bg-gradient-to-br from-accent-savanna/20 to-accent-gold/10 flex items-center justify-center text-[10px] font-bold text-accent-savanna">
                    {connId.charAt(0).toUpperCase()}
                  </div>
                  {connId}
                </motion.button>
              ))}
            </div>
          )}
        </motion.div>
      </motion.div>
    </div>
  );
}
