"use client";

import Link from "next/link";
import { useState, useEffect, useCallback, useRef, useMemo } from "react";
import {
  ArrowLeft,
  Loader2,
  Layers,
  GitBranch,
  X,
  Volume2,
  Eye,
  EyeOff,
  Target,
} from "lucide-react";
import {
  getEmbedding,
  getSimilarityGraph,
  getCall,
  type EmbeddingData,
  type EmbeddingPoint,
  type SimilarityGraphData,
  type Call,
  API_BASE,
} from "@/lib/audio-api";
import WaveformPlayer from "@/components/audio/WaveformPlayer";

/* ── type colors (shared with social-network page) ── */
const TYPE_COLORS: Record<string, string> = {
  rumble: "#C4A46C",
  trumpet: "#E67E22",
  roar: "#EF4444",
  bark: "#F5A025",
  cry: "#A855F7",
  "contact call": "#10C876",
  greeting: "#60A5FA",
  play: "#EC4899",
};

const COMMUNITY_COLORS = [
  "#C4A46C", "#10C876", "#60A5FA", "#EF4444", "#A855F7",
  "#EC4899", "#E67E22", "#F5A025", "#14B8A6", "#6366F1",
  "#F43F5E", "#84CC16",
];

function colorForType(type: string): string {
  return TYPE_COLORS[type.toLowerCase()] ?? "#8A837B";
}

function communityColor(id: number | null): string {
  if (id === null || id === undefined) return "#8A837B";
  return COMMUNITY_COLORS[id % COMMUNITY_COLORS.length];
}

/* ── coordinate mapping ── */
interface MappedPoint extends EmbeddingPoint {
  svgX: number;
  svgY: number;
  community_id: number | null;
}

function mapPoints(
  points: EmbeddingPoint[],
  graph: SimilarityGraphData | null,
  width: number,
  height: number,
): MappedPoint[] {
  if (points.length === 0) return [];

  const xs = points.map((p) => p.x);
  const ys = points.map((p) => p.y);
  const minX = Math.min(...xs);
  const maxX = Math.max(...xs);
  const minY = Math.min(...ys);
  const maxY = Math.max(...ys);

  const rangeX = maxX - minX || 1;
  const rangeY = maxY - minY || 1;
  const pad = 0.1;

  const communityMap = new Map<string, number | null>();
  if (graph) {
    for (const node of graph.nodes) {
      communityMap.set(node.id, node.community_id);
    }
  }

  return points.map((p) => ({
    ...p,
    svgX: ((p.x - minX) / rangeX) * width * (1 - 2 * pad) + width * pad,
    svgY: ((p.y - minY) / rangeY) * height * (1 - 2 * pad) + height * pad,
    community_id: communityMap.get(p.call_id) ?? null,
  }));
}

/* ── call type badge ── */
function CallTypeBadge({ type }: { type: string }) {
  const color = colorForType(type);
  return (
    <span
      className="inline-flex items-center gap-1 rounded-md border px-2 py-0.5 text-[11px] font-semibold capitalize"
      style={{ borderColor: `${color}40`, backgroundColor: `${color}15`, color }}
    >
      <span className="h-2 w-2 rounded-full" style={{ backgroundColor: color }} />
      {type}
    </span>
  );
}

/* ── main page ── */
export default function SoundVectorsPage() {
  /* data */
  const [embedding, setEmbedding] = useState<EmbeddingData | null>(null);
  const [graph, setGraph] = useState<SimilarityGraphData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  /* controls */
  const [method, setMethod] = useState<"pca" | "umap">("pca");
  const [threshold, setThreshold] = useState(0.75);
  const [colorMode, setColorMode] = useState<"type" | "community">("type");
  const [showEdges, setShowEdges] = useState(true);

  /* selection */
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [selectedCall, setSelectedCall] = useState<Call | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [hoveredId, setHoveredId] = useState<string | null>(null);

  /* SVG interaction */
  const svgRef = useRef<SVGSVGElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [dims, setDims] = useState({ w: 900, h: 560 });

  /* canvas constants */
  const BLOCK_SIZE = 14;
  const SVG_W = 1000;
  const SVG_H = 650;

  /* ── measure container ── */
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const obs = new ResizeObserver(([entry]) => {
      if (entry) setDims({ w: entry.contentRect.width, h: Math.max(400, entry.contentRect.height) });
    });
    obs.observe(el);
    return () => obs.disconnect();
  }, []);

  /* ── fetch embedding ── */
  const fetchEmbedding = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const data = await getEmbedding(method);
      setEmbedding(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load embedding");
    } finally {
      setLoading(false);
    }
  }, [method]);

  useEffect(() => { fetchEmbedding(); }, [fetchEmbedding]);

  /* ── fetch similarity graph (debounced threshold) ── */
  const thresholdTimer = useRef<ReturnType<typeof setTimeout>>();
  const fetchGraph = useCallback(async (t: number) => {
    try {
      const data = await getSimilarityGraph(t, 500);
      setGraph(data);
    } catch {
      /* graph is optional — silently fail */
    }
  }, []);

  useEffect(() => {
    clearTimeout(thresholdTimer.current);
    thresholdTimer.current = setTimeout(() => fetchGraph(threshold), 300);
    return () => clearTimeout(thresholdTimer.current);
  }, [threshold, fetchGraph]);

  /* ── fetch call detail on selection ── */
  useEffect(() => {
    if (!selectedId) { setSelectedCall(null); return; }
    let cancelled = false;
    setDetailLoading(true);
    getCall(selectedId)
      .then((c) => { if (!cancelled) setSelectedCall(c); })
      .catch(() => { if (!cancelled) setSelectedCall(null); })
      .finally(() => { if (!cancelled) setDetailLoading(false); });
    return () => { cancelled = true; };
  }, [selectedId]);

  /* ── keyboard ── */
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") setSelectedId(null);
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, []);

  /* ── mapped points ── */
  const mapped = useMemo(
    () => mapPoints(embedding?.points ?? [], graph, SVG_W, SVG_H),
    [embedding, graph],
  );

  const pointMap = useMemo(() => {
    const m = new Map<string, MappedPoint>();
    for (const p of mapped) m.set(p.call_id, p);
    return m;
  }, [mapped]);

  /* connected edges for selected node */
  const connectedIds = useMemo(() => {
    if (!selectedId || !graph) return new Set<string>();
    const ids = new Set<string>();
    for (const e of graph.edges) {
      if (e.source === selectedId) ids.add(e.target);
      if (e.target === selectedId) ids.add(e.source);
    }
    return ids;
  }, [selectedId, graph]);

  /* top similar for detail panel */
  const topSimilar = useMemo(() => {
    if (!selectedId || !graph) return [];
    return graph.edges
      .filter((e) => e.source === selectedId || e.target === selectedId)
      .map((e) => ({
        call_id: e.source === selectedId ? e.target : e.source,
        weight: e.weight,
      }))
      .sort((a, b) => b.weight - a.weight)
      .slice(0, 5);
  }, [selectedId, graph]);

  /* unique call types for legend */
  const uniqueTypes = useMemo(() => {
    const types = new Set<string>();
    for (const p of mapped) types.add(p.call_type);
    return Array.from(types).sort();
  }, [mapped]);

  /* ── pan & zoom state ── */
  const [viewBox, setViewBox] = useState({ x: 0, y: 0, w: SVG_W, h: SVG_H });
  const dragRef = useRef<{ startX: number; startY: number; vx: number; vy: number } | null>(null);

  const handleWheel = useCallback((e: React.WheelEvent<SVGSVGElement>) => {
    e.preventDefault();
    const svg = svgRef.current;
    if (!svg) return;
    const rect = svg.getBoundingClientRect();
    const mx = ((e.clientX - rect.left) / rect.width) * viewBox.w + viewBox.x;
    const my = ((e.clientY - rect.top) / rect.height) * viewBox.h + viewBox.y;
    const factor = e.deltaY > 0 ? 1.1 : 0.9;
    const nw = viewBox.w * factor;
    const nh = viewBox.h * factor;
    setViewBox({
      x: mx - (mx - viewBox.x) * factor,
      y: my - (my - viewBox.y) * factor,
      w: nw,
      h: nh,
    });
  }, [viewBox]);

  const handleMouseDown = useCallback((e: React.MouseEvent<SVGSVGElement>) => {
    if ((e.target as SVGElement).tagName !== "svg") return;
    dragRef.current = { startX: e.clientX, startY: e.clientY, vx: viewBox.x, vy: viewBox.y };
  }, [viewBox]);

  const handleMouseMove = useCallback((e: React.MouseEvent<SVGSVGElement>) => {
    if (!dragRef.current || !svgRef.current) return;
    const rect = svgRef.current.getBoundingClientRect();
    const dx = ((e.clientX - dragRef.current.startX) / rect.width) * viewBox.w;
    const dy = ((e.clientY - dragRef.current.startY) / rect.height) * viewBox.h;
    setViewBox((v) => ({ ...v, x: dragRef.current!.vx - dx, y: dragRef.current!.vy - dy }));
  }, [viewBox.w, viewBox.h]);

  const handleMouseUp = useCallback(() => { dragRef.current = null; }, []);

  const resetView = useCallback(() => {
    setViewBox({ x: 0, y: 0, w: SVG_W, h: SVG_H });
  }, []);

  /* ── hover tooltip position ── */
  const hoveredPoint = hoveredId ? pointMap.get(hoveredId) : null;

  /* ── render ── */
  if (loading && !embedding) {
    return (
      <main className="p-6 lg:p-8 max-w-6xl mx-auto space-y-6">
        <div className="rounded-lg border border-ev-sand bg-ev-cream p-16 text-center">
          <Loader2 className="mx-auto h-8 w-8 animate-spin text-ev-elephant" />
          <p className="mt-4 text-ev-elephant">Loading sound vector embedding...</p>
        </div>
      </main>
    );
  }

  if (error) {
    return (
      <main className="p-6 lg:p-8 max-w-6xl mx-auto space-y-6">
        <div className="rounded-lg border border-danger/20 bg-danger/10 p-8 text-center text-danger">
          <p>{error}</p>
          <button onClick={fetchEmbedding} className="mt-4 rounded-lg bg-accent-savanna px-4 py-2 text-sm font-semibold text-ev-ivory hover:bg-accent-savanna/90">
            Retry
          </button>
        </div>
      </main>
    );
  }

  return (
    <main className="p-6 lg:p-8 max-w-6xl mx-auto space-y-6">
      {/* ── Header ── */}
      <div>
        <Link href="/database" className="mb-3 inline-flex items-center gap-1.5 text-sm text-ev-warm-gray hover:text-ev-elephant">
          <ArrowLeft className="h-4 w-4" /> Call Database
        </Link>
        <h1 className="text-4xl font-bold text-ev-charcoal">Sound Vectors</h1>
        <p className="mt-2 text-ev-elephant">
          Acoustic fingerprints visualized in 2D — each block is a call positioned by its vector similarity.
          Click to hear, explore clusters, and discover patterns.
        </p>
      </div>

      {/* ── Control Bar ── */}
      <div className="flex flex-wrap items-center gap-4 rounded-lg border border-ev-sand bg-ev-cream p-4">
        {/* Method toggle */}
        <div className="flex items-center gap-2">
          <span className="text-xs text-ev-warm-gray font-medium">Projection</span>
          <div className="flex rounded-lg border border-ev-sand overflow-hidden">
            {(["pca", "umap"] as const).map((m) => (
              <button
                key={m}
                onClick={() => setMethod(m)}
                className={`px-3 py-1.5 text-xs font-semibold uppercase transition-colors ${
                  method === m
                    ? "bg-accent-savanna text-ev-ivory"
                    : "bg-white text-ev-elephant hover:bg-ev-sand/30"
                }`}
              >
                {m}
              </button>
            ))}
          </div>
        </div>

        {/* Threshold slider */}
        <div className="flex items-center gap-2">
          <span className="text-xs text-ev-warm-gray font-medium">Similarity</span>
          <input
            type="range"
            min={0.5}
            max={1}
            step={0.05}
            value={threshold}
            onChange={(e) => setThreshold(Number(e.target.value))}
            className="w-24 accent-[#C4A46C]"
          />
          <span className="text-xs font-mono text-ev-elephant w-8">{threshold.toFixed(2)}</span>
        </div>

        {/* Color mode */}
        <div className="flex items-center gap-2">
          <span className="text-xs text-ev-warm-gray font-medium">Color</span>
          <div className="flex rounded-lg border border-ev-sand overflow-hidden">
            {(["type", "community"] as const).map((c) => (
              <button
                key={c}
                onClick={() => setColorMode(c)}
                className={`px-3 py-1.5 text-xs font-semibold capitalize transition-colors ${
                  colorMode === c
                    ? "bg-accent-savanna text-ev-ivory"
                    : "bg-white text-ev-elephant hover:bg-ev-sand/30"
                }`}
              >
                {c === "type" ? "Call Type" : "Community"}
              </button>
            ))}
          </div>
        </div>

        {/* Edge toggle */}
        <button
          onClick={() => setShowEdges((v) => !v)}
          className={`flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-xs font-medium transition-colors ${
            showEdges
              ? "border-accent-savanna/30 bg-accent-savanna/10 text-accent-savanna"
              : "border-ev-sand text-ev-warm-gray hover:bg-ev-sand/20"
          }`}
        >
          {showEdges ? <Eye className="h-3.5 w-3.5" /> : <EyeOff className="h-3.5 w-3.5" />}
          Edges
        </button>

        {/* Reset view */}
        <button onClick={resetView} className="flex items-center gap-1.5 rounded-lg border border-ev-sand px-3 py-1.5 text-xs font-medium text-ev-warm-gray hover:bg-ev-sand/20">
          <Target className="h-3.5 w-3.5" /> Reset
        </button>

        {/* Stats */}
        <div className="ml-auto flex items-center gap-3 text-xs text-ev-warm-gray">
          <span className="flex items-center gap-1"><Layers className="h-3.5 w-3.5" /> {mapped.length} calls</span>
          {graph && <span className="flex items-center gap-1"><GitBranch className="h-3.5 w-3.5" /> {graph.edges.length} edges</span>}
        </div>
      </div>

      {/* ── Main content: canvas + detail panel ── */}
      <div className="flex gap-6">
        {/* SVG Canvas */}
        <div ref={containerRef} className="flex-1 min-w-0">
          <div className="relative rounded-lg border border-ev-sand bg-white overflow-hidden" style={{ height: dims.h < 400 ? 500 : dims.h }}>
            {loading && (
              <div className="absolute inset-0 z-10 flex items-center justify-center bg-white/60">
                <Loader2 className="h-6 w-6 animate-spin text-ev-elephant" />
              </div>
            )}
            <svg
              ref={svgRef}
              viewBox={`${viewBox.x} ${viewBox.y} ${viewBox.w} ${viewBox.h}`}
              className="h-full w-full cursor-grab active:cursor-grabbing"
              onWheel={handleWheel}
              onMouseDown={handleMouseDown}
              onMouseMove={handleMouseMove}
              onMouseUp={handleMouseUp}
              onMouseLeave={handleMouseUp}
              onClick={() => setSelectedId(null)}
            >
              {/* Edges */}
              {showEdges && graph && (
                <g>
                  {graph.edges.map((edge, i) => {
                    const a = pointMap.get(edge.source);
                    const b = pointMap.get(edge.target);
                    if (!a || !b) return null;
                    const isConnected = selectedId && (edge.source === selectedId || edge.target === selectedId);
                    const opacity = selectedId
                      ? isConnected ? 0.6 : 0.04
                      : 0.12 + edge.weight * 0.2;
                    return (
                      <line
                        key={i}
                        x1={a.svgX}
                        y1={a.svgY}
                        x2={b.svgX}
                        y2={b.svgY}
                        stroke={isConnected ? "#C4A46C" : "#B5ADA4"}
                        strokeWidth={1 + edge.weight * 2}
                        opacity={opacity}
                      />
                    );
                  })}
                </g>
              )}

              {/* Blocks */}
              <g>
                {mapped.map((p) => {
                  const isSelected = p.call_id === selectedId;
                  const isHovered = p.call_id === hoveredId;
                  const isConnected = connectedIds.has(p.call_id);
                  const dimmed = selectedId && !isSelected && !isConnected;

                  const fill =
                    colorMode === "type"
                      ? colorForType(p.call_type)
                      : communityColor(p.community_id);

                  return (
                    <g
                      key={p.call_id}
                      onClick={(e) => { e.stopPropagation(); setSelectedId(p.call_id); }}
                      onMouseEnter={() => setHoveredId(p.call_id)}
                      onMouseLeave={() => setHoveredId(null)}
                      className="cursor-pointer"
                      style={{ transition: "opacity 0.2s" }}
                      opacity={dimmed ? 0.2 : 1}
                    >
                      {/* Selection ring */}
                      {isSelected && (
                        <rect
                          x={p.svgX - BLOCK_SIZE / 2 - 3}
                          y={p.svgY - BLOCK_SIZE / 2 - 3}
                          width={BLOCK_SIZE + 6}
                          height={BLOCK_SIZE + 6}
                          rx={5}
                          fill="none"
                          stroke="#C4A46C"
                          strokeWidth={2.5}
                          opacity={0.8}
                        />
                      )}
                      {/* Block */}
                      <rect
                        x={p.svgX - BLOCK_SIZE / 2}
                        y={p.svgY - BLOCK_SIZE / 2}
                        width={BLOCK_SIZE}
                        height={BLOCK_SIZE}
                        rx={3}
                        fill={fill}
                        stroke="white"
                        strokeWidth={isHovered ? 2 : 1}
                        opacity={isSelected ? 1 : isHovered ? 0.95 : 0.8}
                      />
                      {/* Confidence dot */}
                      {p.confidence >= 0.8 && (
                        <circle
                          cx={p.svgX + BLOCK_SIZE / 2 - 1}
                          cy={p.svgY - BLOCK_SIZE / 2 + 1}
                          r={2}
                          fill="white"
                          opacity={0.7}
                        />
                      )}
                    </g>
                  );
                })}
              </g>
            </svg>

            {/* Hover tooltip */}
            {hoveredPoint && !selectedId && (
              <div
                className="pointer-events-none absolute z-20 rounded-lg border border-ev-sand bg-white/95 px-3 py-2 shadow-card"
                style={{
                  left: `${(hoveredPoint.svgX / SVG_W) * 100}%`,
                  top: `${(hoveredPoint.svgY / SVG_H) * 100}%`,
                  transform: "translate(-50%, -120%)",
                }}
              >
                <p className="text-xs font-semibold text-ev-charcoal capitalize">{hoveredPoint.call_type}</p>
                <p className="text-[10px] text-ev-warm-gray">
                  {Math.round(hoveredPoint.confidence * 100)}% confidence
                </p>
              </div>
            )}

            {/* Legend */}
            <div className="absolute bottom-3 left-3 flex flex-wrap gap-2">
              {colorMode === "type"
                ? uniqueTypes.map((t) => (
                    <span key={t} className="flex items-center gap-1 text-[10px] text-ev-elephant">
                      <span className="h-2.5 w-2.5 rounded-sm" style={{ backgroundColor: colorForType(t) }} />
                      {t}
                    </span>
                  ))
                : Array.from(new Set(mapped.map((p) => p.community_id).filter((c) => c !== null)))
                    .sort((a, b) => (a ?? 0) - (b ?? 0))
                    .map((c) => (
                      <span key={c} className="flex items-center gap-1 text-[10px] text-ev-elephant">
                        <span className="h-2.5 w-2.5 rounded-sm" style={{ backgroundColor: communityColor(c) }} />
                        Cluster {c}
                      </span>
                    ))}
            </div>
          </div>
        </div>

        {/* Detail panel */}
        {selectedId && (
          <div className="w-80 shrink-0">
            <div className="rounded-lg border border-ev-sand bg-ev-cream p-5 space-y-4">
              <div className="flex items-start justify-between">
                <h3 className="text-sm font-semibold text-ev-charcoal">Call Detail</h3>
                <button onClick={() => setSelectedId(null)} className="text-ev-warm-gray hover:text-ev-charcoal">
                  <X className="h-4 w-4" />
                </button>
              </div>

              {detailLoading ? (
                <div className="py-8 text-center">
                  <Loader2 className="mx-auto h-5 w-5 animate-spin text-ev-elephant" />
                </div>
              ) : selectedCall ? (
                <>
                  {/* ID */}
                  <p className="font-mono text-xs text-ev-warm-gray">{selectedCall.id}</p>

                  {/* Type & confidence */}
                  <div className="flex items-center gap-2">
                    <CallTypeBadge type={selectedCall.call_type} />
                    <span className="text-xs text-ev-warm-gray">
                      {Math.round((selectedCall.confidence ?? 0) * 100)}%
                    </span>
                  </div>

                  {/* Metrics */}
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <p className="text-xs text-ev-warm-gray">Frequency</p>
                      <p className="text-sm text-ev-charcoal">
                        {selectedCall.frequency_low && selectedCall.frequency_high
                          ? `${selectedCall.frequency_low}–${selectedCall.frequency_high} Hz`
                          : "—"}
                      </p>
                    </div>
                    <div>
                      <p className="text-xs text-ev-warm-gray">Duration</p>
                      <p className="text-sm text-ev-charcoal">
                        {selectedCall.duration_ms ? `${selectedCall.duration_ms.toFixed(0)} ms` : "—"}
                      </p>
                    </div>
                    {selectedCall.speaker_id && (
                      <div>
                        <p className="text-xs text-ev-warm-gray">Speaker</p>
                        <p className="text-sm font-mono text-ev-charcoal">{selectedCall.speaker_id}</p>
                      </div>
                    )}
                    {selectedCall.cluster_id && (
                      <div>
                        <p className="text-xs text-ev-warm-gray">Cluster</p>
                        <p className="text-sm font-mono text-ev-charcoal">{selectedCall.cluster_id}</p>
                      </div>
                    )}
                  </div>

                  {/* Audio */}
                  {selectedCall.recording_id && (
                    <div>
                      <div className="mb-2 flex items-center gap-1.5 text-xs text-ev-warm-gray">
                        <Volume2 className="h-3.5 w-3.5" /> Audio
                      </div>
                      <WaveformPlayer
                        src={`${API_BASE}/api/recordings/${selectedCall.recording_id}/download`}
                        label={selectedCall.call_type}
                        accentColor={colorForType(selectedCall.call_type)}
                      />
                    </div>
                  )}

                  {/* Acoustic features */}
                  {selectedCall.acoustic_features && Object.keys(selectedCall.acoustic_features).length > 0 && (
                    <div>
                      <p className="mb-2 text-xs font-medium text-ev-warm-gray">Acoustic Features</p>
                      <div className="max-h-40 overflow-y-auto space-y-1">
                        {Object.entries(selectedCall.acoustic_features).map(([key, val]) => (
                          <div key={key} className="flex justify-between text-[11px]">
                            <span className="text-ev-warm-gray truncate mr-2">{key.replace(/_/g, " ")}</span>
                            <span className="text-ev-charcoal font-mono shrink-0">
                              {typeof val === "number" ? val.toFixed(2) : String(val)}
                            </span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Similar calls */}
                  {topSimilar.length > 0 && (
                    <div>
                      <p className="mb-2 text-xs font-medium text-ev-warm-gray">Most Similar</p>
                      <div className="space-y-1.5">
                        {topSimilar.map((s) => {
                          const pt = pointMap.get(s.call_id);
                          return (
                            <button
                              key={s.call_id}
                              onClick={() => setSelectedId(s.call_id)}
                              className="flex w-full items-center gap-2 rounded-md border border-ev-sand/60 bg-white px-2.5 py-1.5 text-left hover:bg-ev-sand/10 transition-colors"
                            >
                              <span
                                className="h-3 w-3 rounded-sm shrink-0"
                                style={{ backgroundColor: pt ? colorForType(pt.call_type) : "#8A837B" }}
                              />
                              <span className="text-[11px] text-ev-elephant truncate flex-1 font-mono">
                                {s.call_id.slice(0, 12)}
                              </span>
                              <span className="text-[11px] font-semibold text-accent-savanna">
                                {Math.round(s.weight * 100)}%
                              </span>
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  )}

                  {/* Link to full detail */}
                  <Link
                    href={`/results/${selectedCall.id}`}
                    className="block w-full rounded-lg bg-accent-savanna px-4 py-2 text-center text-sm font-semibold text-ev-ivory hover:bg-accent-savanna/90 transition-colors"
                  >
                    Full Detail
                  </Link>
                </>
              ) : (
                <p className="text-sm text-ev-elephant">Call not found</p>
              )}
            </div>
          </div>
        )}
      </div>

      {/* Empty state */}
      {!loading && mapped.length === 0 && (
        <div className="rounded-lg border border-ev-sand bg-ev-cream p-10 text-center text-ev-elephant">
          No calls with acoustic fingerprints found. Process some recordings first.
        </div>
      )}
    </main>
  );
}
