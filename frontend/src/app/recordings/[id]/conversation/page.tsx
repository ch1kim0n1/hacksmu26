"use client";

import Link from "next/link";
import { useState, useEffect, useCallback, useMemo, useRef } from "react";
import { useParams } from "next/navigation";
import { motion } from "framer-motion";
import {
  ArrowLeft,
  Users,
  MessageSquare,
  Repeat,
  ZoomIn,
  ZoomOut,
  Loader2,
  AlertCircle,
  RefreshCw,
} from "lucide-react";
import {
  getRecordingConversation,
  type ConversationData,
} from "@/lib/audio-api";
import { fadeUp, staggerContainer } from "@/components/ui/motion-primitives";

/* ── call type color map ── */
const CALL_TYPE_COLORS: Record<string, string> = {
  rumble: "#C4A46C",
  trumpet: "#E67E22",
  roar: "#EF4444",
  bark: "#F5A025",
  cry: "#A855F7",
  "contact call": "#10C876",
  greeting: "#60A5FA",
  play: "#EC4899",
};

function colorForType(type: string): string {
  return CALL_TYPE_COLORS[type.toLowerCase()] ?? "#8A837B";
}

/* ── helpers ── */
function formatMs(ms: number): string {
  if (ms >= 1000) return `${(ms / 1000).toFixed(1)}s`;
  return `${Math.round(ms)}ms`;
}


export default function ConversationPage() {
  const params = useParams();
  const recordingId = params.id as string;

  const [data, setData] = useState<ConversationData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [zoom, setZoom] = useState(1);

  const scrollRef = useRef<HTMLDivElement>(null);

  const fetchData = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const result = await getRecordingConversation(recordingId);
      setData(result);
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Failed to load conversation data"
      );
    } finally {
      setLoading(false);
    }
  }, [recordingId]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  /* ── derived layout values ── */
  const ROW_HEIGHT = 56;
  const HEADER_HEIGHT = 32;
  const LABEL_WIDTH = 120;
  const BLOCK_HEIGHT = 28;
  const MIN_BLOCK_WIDTH = 6;

  const { maxMs, pxPerMs, totalWidth, speakerMap } = useMemo(() => {
    if (!data || data.calls.length === 0)
      return { maxMs: 1000, pxPerMs: 0.5, totalWidth: 800, speakerMap: new Map<string, number>() };

    const max = Math.max(...data.calls.map((c) => c.start_ms + c.duration_ms));
    const ppm = (0.8 * zoom) / 1; // 0.8 px per ms at 1x zoom
    const tw = Math.max(800, max * ppm + LABEL_WIDTH + 60);
    const sm = new Map<string, number>();
    data.speakers.forEach((s, i) => sm.set(s.id, i));
    return { maxMs: max, pxPerMs: ppm, totalWidth: tw, speakerMap: sm };
  }, [data, zoom]);

  /* ── time axis ticks ── */
  const ticks = useMemo(() => {
    const out: number[] = [];
    // Choose nice interval based on zoom
    const intervals = [100, 200, 500, 1000, 2000, 5000, 10000];
    const pixelTarget = 100; // ~100px between ticks
    let interval = intervals[0];
    for (const iv of intervals) {
      if (iv * pxPerMs >= pixelTarget) {
        interval = iv;
        break;
      }
      interval = iv;
    }
    for (let t = 0; t <= maxMs; t += interval) {
      out.push(t);
    }
    return out;
  }, [maxMs, pxPerMs]);

  /* ── response pair lookup (used for future tooltip enrichment) ── */
  type ResponsePair = NonNullable<typeof data>["response_pairs"][number];
  const _pairsByCallId = useMemo(() => {
    if (!data) return new Map<string, ResponsePair[]>();
    const m = new Map<string, ResponsePair[]>();
    for (const pair of data.response_pairs) {
      const existing = m.get(pair.call_id) ?? [];
      existing.push(pair);
      m.set(pair.call_id, existing);
    }
    return m;
  }, [data]);
  void _pairsByCallId;

  /* ── call position lookup ── */
  const callPositions = useMemo(() => {
    if (!data) return new Map<string, { x: number; y: number; w: number }>();
    const m = new Map<string, { x: number; y: number; w: number }>();
    for (const call of data.calls) {
      const row = speakerMap.get(call.speaker_id) ?? 0;
      const x = LABEL_WIDTH + call.start_ms * pxPerMs;
      const w = Math.max(MIN_BLOCK_WIDTH, call.duration_ms * pxPerMs);
      const y = HEADER_HEIGHT + row * ROW_HEIGHT + (ROW_HEIGHT - BLOCK_HEIGHT) / 2;
      m.set(call.call_id, { x, y, w });
    }
    return m;
  }, [data, speakerMap, pxPerMs]);

  const svgHeight =
    HEADER_HEIGHT + (data?.speakers.length ?? 1) * ROW_HEIGHT + 20;

  return (
    <div className="p-6 lg:p-8 max-w-[100vw] mx-auto space-y-6">
      {/* Header */}
      <motion.div
        initial={{ opacity: 0, y: -8 }}
        animate={{ opacity: 1, y: 0 }}
        className="flex flex-col sm:flex-row sm:items-end justify-between gap-4"
      >
        <div>
          <Link
            href={`/processing/${recordingId}`}
            className="mb-4 inline-flex min-h-[44px] items-center gap-2 rounded-full border border-ev-sand/40 bg-white/80 px-4 py-2.5 text-sm font-medium text-ev-elephant shadow-sm transition-all hover:border-ev-warm-gray/30 hover:bg-white"
          >
            <ArrowLeft className="h-4 w-4" />
            Back to Recording
          </Link>
          <h1 className="text-2xl font-bold text-ev-charcoal">
            Conversation Analysis
          </h1>
          <p className="text-sm text-ev-warm-gray mt-1">
            Recording{" "}
            <span className="font-mono text-ev-elephant">
              {recordingId.slice(0, 12)}
            </span>
          </p>
        </div>
      </motion.div>

      {/* Loading */}
      {loading && (
        <div className="flex flex-col items-center justify-center py-24 gap-4">
          <Loader2 className="w-8 h-8 text-accent-savanna animate-spin" />
          <p className="text-sm text-ev-warm-gray">
            Analyzing conversation patterns...
          </p>
        </div>
      )}

      {/* Error */}
      {!loading && error && (
        <div className="p-8 rounded-xl border border-ev-sand/40 bg-ev-cream/60 text-center">
          <AlertCircle className="w-8 h-8 text-danger mx-auto mb-3" />
          <p className="text-danger mb-4">{error}</p>
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
      )}

      {/* Empty */}
      {!loading && !error && data && data.calls.length === 0 && (
        <motion.div
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          className="p-16 rounded-2xl border border-dashed border-ev-sand/60 bg-ev-cream/60 text-center"
        >
          <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-accent-savanna/10 to-accent-gold/5 flex items-center justify-center mx-auto mb-4">
            <MessageSquare className="w-7 h-7 text-accent-savanna/50" />
          </div>
          <p className="text-ev-elephant font-medium mb-1">
            No conversation detected
          </p>
          <p className="text-ev-warm-gray text-sm">
            This recording does not have enough calls to form conversation
            patterns.
          </p>
        </motion.div>
      )}

      {/* Main content */}
      {!loading && !error && data && data.calls.length > 0 && (
        <>
          {/* Summary cards */}
          <motion.div
            variants={staggerContainer}
            initial="initial"
            animate="animate"
            className="grid grid-cols-1 sm:grid-cols-3 gap-4"
          >
            <motion.div
              variants={fadeUp}
              className="rounded-xl border border-ev-sand/40 bg-ev-cream/60 p-5"
            >
              <div className="flex items-center gap-3 mb-2">
                <div className="w-9 h-9 rounded-lg bg-gradient-to-br from-accent-savanna/15 to-accent-gold/10 flex items-center justify-center">
                  <Users className="w-4.5 h-4.5 text-accent-savanna" />
                </div>
                <div>
                  <p className="text-[11px] uppercase tracking-wider text-ev-warm-gray/70 font-medium">
                    Speakers
                  </p>
                  <p className="text-xl font-bold text-ev-charcoal tabular-nums">
                    {data.speakers.length}
                  </p>
                </div>
              </div>
              <div className="flex flex-wrap gap-1.5 mt-2">
                {data.speakers.map((s) => (
                  <span
                    key={s.id}
                    className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[11px] font-medium border border-ev-sand/30 bg-white/80 text-ev-elephant"
                  >
                    <span
                      className="w-2 h-2 rounded-full flex-shrink-0"
                      style={{
                        backgroundColor: colorForType(s.dominant_type),
                      }}
                    />
                    {s.id}
                  </span>
                ))}
              </div>
            </motion.div>

            <motion.div
              variants={fadeUp}
              className="rounded-xl border border-ev-sand/40 bg-ev-cream/60 p-5"
            >
              <div className="flex items-center gap-3 mb-2">
                <div className="w-9 h-9 rounded-lg bg-gradient-to-br from-accent-savanna/15 to-accent-gold/10 flex items-center justify-center">
                  <Repeat className="w-4.5 h-4.5 text-accent-savanna" />
                </div>
                <div>
                  <p className="text-[11px] uppercase tracking-wider text-ev-warm-gray/70 font-medium">
                    Exchanges
                  </p>
                  <p className="text-xl font-bold text-ev-charcoal tabular-nums">
                    {data.total_exchanges}
                  </p>
                </div>
              </div>
              <p className="text-xs text-ev-warm-gray mt-1">
                Call-response pairs detected
              </p>
            </motion.div>

            <motion.div
              variants={fadeUp}
              className="rounded-xl border border-ev-sand/40 bg-ev-cream/60 p-5"
            >
              <div className="flex items-center gap-3 mb-2">
                <div className="w-9 h-9 rounded-lg bg-gradient-to-br from-accent-savanna/15 to-accent-gold/10 flex items-center justify-center">
                  <MessageSquare className="w-4.5 h-4.5 text-accent-savanna" />
                </div>
                <div>
                  <p className="text-[11px] uppercase tracking-wider text-ev-warm-gray/70 font-medium">
                    Longest Sequence
                  </p>
                  <p className="text-xl font-bold text-ev-charcoal tabular-nums">
                    {data.longest_sequence_length}
                  </p>
                </div>
              </div>
              <p className="text-xs text-ev-warm-gray mt-1">
                Consecutive call-response chain
              </p>
            </motion.div>
          </motion.div>

          {/* Zoom controls */}
          <div className="flex items-center gap-2">
            <span className="text-xs text-ev-warm-gray font-medium mr-1">
              Zoom
            </span>
            <motion.button
              whileHover={{ scale: 1.05 }}
              whileTap={{ scale: 0.95 }}
              onClick={() => setZoom((z) => Math.max(1, z - 0.5))}
              disabled={zoom <= 1}
              aria-label="Zoom out"
              className="w-8 h-8 rounded-lg border border-ev-sand/40 bg-ev-cream/60 flex items-center justify-center text-ev-elephant hover:text-ev-charcoal transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
            >
              <ZoomOut className="w-3.5 h-3.5" />
            </motion.button>
            <span className="text-xs text-ev-charcoal font-bold tabular-nums w-10 text-center">
              {zoom}x
            </span>
            <motion.button
              whileHover={{ scale: 1.05 }}
              whileTap={{ scale: 0.95 }}
              onClick={() => setZoom((z) => Math.min(4, z + 0.5))}
              disabled={zoom >= 4}
              aria-label="Zoom in"
              className="w-8 h-8 rounded-lg border border-ev-sand/40 bg-ev-cream/60 flex items-center justify-center text-ev-elephant hover:text-ev-charcoal transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
            >
              <ZoomIn className="w-3.5 h-3.5" />
            </motion.button>
          </div>

          {/* Timeline */}
          <motion.div
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.15 }}
            className="rounded-xl border border-ev-sand/40 bg-ev-cream/60 overflow-hidden"
          >
            <div
              ref={scrollRef}
              className="overflow-x-auto overflow-y-hidden"
              style={{ maxHeight: svgHeight + 20 }}
            >
              <svg
                width={totalWidth}
                height={svgHeight}
                className="select-none"
              >
                {/* Time axis */}
                {ticks.map((t) => {
                  const x = LABEL_WIDTH + t * pxPerMs;
                  return (
                    <g key={t}>
                      <line
                        x1={x}
                        y1={HEADER_HEIGHT - 4}
                        x2={x}
                        y2={svgHeight}
                        stroke="#D4CCC3"
                        strokeWidth={0.5}
                        strokeDasharray="4 4"
                      />
                      <text
                        x={x}
                        y={HEADER_HEIGHT - 10}
                        textAnchor="middle"
                        className="text-[10px] fill-ev-warm-gray"
                        style={{ fontSize: 10, fill: "#8A837B" }}
                      >
                        {formatMs(t)}
                      </text>
                    </g>
                  );
                })}

                {/* Speaker rows */}
                {data.speakers.map((speaker, rowIdx) => {
                  const y = HEADER_HEIGHT + rowIdx * ROW_HEIGHT;
                  return (
                    <g key={speaker.id}>
                      {/* Row background stripe */}
                      {rowIdx % 2 === 0 && (
                        <rect
                          x={0}
                          y={y}
                          width={totalWidth}
                          height={ROW_HEIGHT}
                          fill="#F8F5F0"
                          opacity={0.5}
                        />
                      )}
                      {/* Speaker label */}
                      <foreignObject x={8} y={y + 8} width={LABEL_WIDTH - 16} height={ROW_HEIGHT - 16}>
                        <div className="flex items-center gap-1.5 h-full">
                          <span
                            className="w-2.5 h-2.5 rounded-full flex-shrink-0"
                            style={{
                              backgroundColor: colorForType(
                                speaker.dominant_type
                              ),
                            }}
                          />
                          <span className="text-xs font-semibold text-ev-charcoal truncate">
                            {speaker.id}
                          </span>
                          <span className="text-[10px] text-ev-warm-gray ml-auto tabular-nums">
                            {speaker.call_count}
                          </span>
                        </div>
                      </foreignObject>
                    </g>
                  );
                })}

                {/* Response pair arrows */}
                {data.response_pairs.map((pair, i) => {
                  const from = callPositions.get(pair.call_id);
                  const to = callPositions.get(pair.response_id);
                  if (!from || !to) return null;

                  const x1 = from.x + from.w;
                  const y1 = from.y + BLOCK_HEIGHT / 2;
                  const x2 = to.x;
                  const y2 = to.y + BLOCK_HEIGHT / 2;
                  const midX = (x1 + x2) / 2;
                  const midY = Math.min(y1, y2) - 20;

                  return (
                    <g key={`pair-${i}`}>
                      <path
                        d={`M${x1},${y1} Q${midX},${midY} ${x2},${y2}`}
                        fill="none"
                        stroke="#C4A46C"
                        strokeWidth={1.5}
                        strokeDasharray="4 3"
                        opacity={0.6}
                        markerEnd="url(#arrowhead)"
                      />
                      {/* Gap label */}
                      <text
                        x={midX}
                        y={midY - 4}
                        textAnchor="middle"
                        style={{ fontSize: 9, fill: "#8A837B" }}
                      >
                        {formatMs(pair.gap_ms)}
                      </text>
                    </g>
                  );
                })}

                {/* Call blocks */}
                {data.calls.map((call) => {
                  const pos = callPositions.get(call.call_id);
                  if (!pos) return null;
                  const fill = colorForType(call.call_type);

                  return (
                    <g key={call.call_id}>
                      <rect
                        x={pos.x}
                        y={pos.y}
                        width={pos.w}
                        height={BLOCK_HEIGHT}
                        rx={4}
                        fill={fill}
                        opacity={0.85}
                        className="transition-opacity hover:opacity-100"
                      />
                      {/* Call type label (only if block wide enough) */}
                      {pos.w > 40 && (
                        <text
                          x={pos.x + pos.w / 2}
                          y={pos.y + BLOCK_HEIGHT / 2 + 3.5}
                          textAnchor="middle"
                          style={{
                            fontSize: 9,
                            fill: "#fff",
                            fontWeight: 600,
                          }}
                        >
                          {call.call_type}
                        </text>
                      )}
                      {/* Confidence indicator */}
                      <rect
                        x={pos.x}
                        y={pos.y + BLOCK_HEIGHT - 3}
                        width={pos.w * call.confidence}
                        height={3}
                        rx={1.5}
                        fill="#fff"
                        opacity={0.35}
                      />
                      <title>
                        {call.call_type} | {formatMs(call.duration_ms)} |{" "}
                        {(call.confidence * 100).toFixed(0)}% confidence
                      </title>
                    </g>
                  );
                })}

                {/* Arrow marker definition */}
                <defs>
                  <marker
                    id="arrowhead"
                    markerWidth="8"
                    markerHeight="6"
                    refX="7"
                    refY="3"
                    orient="auto"
                  >
                    <polygon
                      points="0 0, 8 3, 0 6"
                      fill="#C4A46C"
                      opacity={0.6}
                    />
                  </marker>
                </defs>
              </svg>
            </div>
          </motion.div>

          {/* Legend */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.25 }}
            className="rounded-xl border border-ev-sand/40 bg-ev-cream/60 p-4"
          >
            <p className="text-xs font-semibold text-ev-elephant mb-2">
              Call Types
            </p>
            <div className="flex flex-wrap gap-3">
              {Object.entries(CALL_TYPE_COLORS).map(([type, color]) => (
                <div key={type} className="flex items-center gap-1.5">
                  <span
                    className="w-3 h-3 rounded"
                    style={{ backgroundColor: color }}
                  />
                  <span className="text-[11px] text-ev-warm-gray capitalize">
                    {type}
                  </span>
                </div>
              ))}
            </div>
            <div className="flex items-center gap-2 mt-3 pt-2 border-t border-ev-sand/30">
              <svg width={40} height={10}>
                <line
                  x1={0}
                  y1={5}
                  x2={36}
                  y2={5}
                  stroke="#C4A46C"
                  strokeWidth={1.5}
                  strokeDasharray="4 3"
                />
                <polygon points="32,2 40,5 32,8" fill="#C4A46C" />
              </svg>
              <span className="text-[11px] text-ev-warm-gray">
                Response pair (dashed arrow with gap time)
              </span>
            </div>
          </motion.div>
        </>
      )}
    </div>
  );
}
