"use client";

import Link from "next/link";
import { useState, useEffect, useCallback, useRef, useMemo } from "react";
import { motion } from "framer-motion";
import {
  ArrowLeft,
  Users,
  GitBranch,
  Crown,
  Loader2,
  AlertCircle,
  RefreshCw,
  X,
} from "lucide-react";
import { getSocialNetwork, type SocialNetworkData } from "@/lib/audio-api";
import { fadeUp, staggerContainer } from "@/components/ui/motion-primitives";

/* ── node color by most_common_type ── */
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

function colorForType(type: string): string {
  return TYPE_COLORS[type.toLowerCase()] ?? "#8A837B";
}

/* ── force simulation types ── */
interface SimNode {
  id: string;
  x: number;
  y: number;
  vx: number;
  vy: number;
  radius: number;
  color: string;
  call_count: number;
  most_common_type: string;
  locations: string[];
  dates: string[];
}

interface SimEdge {
  source: string;
  target: string;
  shared_recordings: number;
  call_response_pairs: number;
  weight: number;
}

/* ── force simulation hook ── */
function useForceSimulation(
  rawNodes: SocialNetworkData["nodes"],
  rawEdges: SocialNetworkData["edges"],
  width: number,
  height: number
) {
  const nodesRef = useRef<SimNode[]>([]);
  const edgesRef = useRef<SimEdge[]>([]);
  const frameRef = useRef<number>(0);
  const [tick, setTick] = useState(0);

  // Initialize / reset when data changes
  useEffect(() => {
    const maxCalls = Math.max(1, ...rawNodes.map((n) => n.call_count));

    nodesRef.current = rawNodes.map((n, i) => {
      const angle = (2 * Math.PI * i) / rawNodes.length;
      const spread = Math.min(width, height) * 0.3;
      return {
        id: n.id,
        x: width / 2 + Math.cos(angle) * spread + (Math.random() - 0.5) * 40,
        y: height / 2 + Math.sin(angle) * spread + (Math.random() - 0.5) * 40,
        vx: 0,
        vy: 0,
        radius: 15 + (n.call_count / maxCalls) * 25, // 15..40
        color: colorForType(n.most_common_type),
        call_count: n.call_count,
        most_common_type: n.most_common_type,
        locations: n.locations,
        dates: n.dates,
      };
    });

    edgesRef.current = rawEdges.map((e) => ({
      source: e.source,
      target: e.target,
      shared_recordings: e.shared_recordings,
      call_response_pairs: e.call_response_pairs,
      weight: e.weight,
    }));

    // Run simulation
    let iterCount = 0;
    const MAX_ITERS = 300;

    const nodeMap = new Map<string, SimNode>();
    nodesRef.current.forEach((n) => nodeMap.set(n.id, n));

    function step() {
      const nodes = nodesRef.current;
      const edges = edgesRef.current;
      const damping = 0.85;
      const repulsion = 3000;
      const springK = 0.005;
      const centerPull = 0.01;

      // Reset forces
      for (const n of nodes) {
        n.vx *= damping;
        n.vy *= damping;
      }

      // Repulsion (Coulomb)
      for (let i = 0; i < nodes.length; i++) {
        for (let j = i + 1; j < nodes.length; j++) {
          const a = nodes[i];
          const b = nodes[j];
          const dx = a.x - b.x;
          const dy = a.y - b.y;
          const dist = Math.sqrt(dx * dx + dy * dy) || 1;
          const minDist = a.radius + b.radius + 10;
          const force = repulsion / (dist * dist);
          const fx = (dx / dist) * force;
          const fy = (dy / dist) * force;
          a.vx += fx;
          a.vy += fy;
          b.vx -= fx;
          b.vy -= fy;

          // Hard collision
          if (dist < minDist) {
            const overlap = (minDist - dist) / 2;
            const ox = (dx / dist) * overlap;
            const oy = (dy / dist) * overlap;
            a.x += ox;
            a.y += oy;
            b.x -= ox;
            b.y -= oy;
          }
        }
      }

      // Spring attraction (edges)
      for (const edge of edges) {
        const a = nodeMap.get(edge.source);
        const b = nodeMap.get(edge.target);
        if (!a || !b) continue;
        const dx = b.x - a.x;
        const dy = b.y - a.y;
        const dist = Math.sqrt(dx * dx + dy * dy) || 1;
        const force = springK * dist * (1 + edge.weight * 0.5);
        const fx = (dx / dist) * force;
        const fy = (dy / dist) * force;
        a.vx += fx;
        a.vy += fy;
        b.vx -= fx;
        b.vy -= fy;
      }

      // Center pull
      for (const n of nodes) {
        n.vx += (width / 2 - n.x) * centerPull;
        n.vy += (height / 2 - n.y) * centerPull;
      }

      // Apply velocity
      for (const n of nodes) {
        n.x += n.vx;
        n.y += n.vy;
        // Bound within viewport
        n.x = Math.max(n.radius + 4, Math.min(width - n.radius - 4, n.x));
        n.y = Math.max(n.radius + 4, Math.min(height - n.radius - 4, n.y));
      }

      iterCount++;
      setTick((t) => t + 1);

      if (iterCount < MAX_ITERS) {
        frameRef.current = requestAnimationFrame(step);
      }
    }

    frameRef.current = requestAnimationFrame(step);

    return () => {
      cancelAnimationFrame(frameRef.current);
    };
  }, [rawNodes, rawEdges, width, height]);

  return { nodes: nodesRef.current, edges: edgesRef.current, tick };
}

export default function SocialNetworkPage() {
  const [data, setData] = useState<SocialNetworkData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedNode, setSelectedNode] = useState<string | null>(null);

  const svgContainerRef = useRef<HTMLDivElement>(null);
  const [dimensions, setDimensions] = useState({ width: 800, height: 550 });

  const fetchData = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const result = await getSocialNetwork();
      setData(result);
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Failed to load social network"
      );
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  // Measure container
  useEffect(() => {
    function measure() {
      if (svgContainerRef.current) {
        const rect = svgContainerRef.current.getBoundingClientRect();
        setDimensions({
          width: Math.max(400, rect.width),
          height: Math.max(400, 550),
        });
      }
    }
    measure();
    window.addEventListener("resize", measure);
    return () => window.removeEventListener("resize", measure);
  }, [loading]);

  const { nodes, edges, tick } = useForceSimulation(
    data?.nodes ?? [],
    data?.edges ?? [],
    dimensions.width,
    dimensions.height
  );

  const nodeMap = useMemo(() => {
    const m = new Map<string, SimNode>();
    nodes.forEach((n) => m.set(n.id, n));
    return m;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [nodes, tick]);

  const maxEdgeWeight = useMemo(
    () => Math.max(1, ...edges.map((e) => e.weight)),
    [edges]
  );

  const topEdges = useMemo(() => {
    if (!data) return [];
    return [...data.edges].sort((a, b) => b.weight - a.weight).slice(0, 5);
  }, [data]);

  const selectedNodeData = useMemo(() => {
    if (!selectedNode) return null;
    return nodeMap.get(selectedNode) ?? null;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedNode, nodeMap, tick]);

  return (
    <div className="p-6 lg:p-8 max-w-7xl mx-auto space-y-6">
      {/* Header */}
      <motion.div
        initial={{ opacity: 0, y: -8 }}
        animate={{ opacity: 1, y: 0 }}
        className="flex flex-col sm:flex-row sm:items-end justify-between gap-4"
      >
        <div>
          <Link
            href="/database"
            className="mb-4 inline-flex min-h-[44px] items-center gap-2 rounded-full border border-ev-sand/40 bg-white/80 px-4 py-2.5 text-sm font-medium text-ev-elephant shadow-sm transition-all hover:border-ev-warm-gray/30 hover:bg-white"
          >
            <ArrowLeft className="h-4 w-4" />
            Back to Database
          </Link>
          <h1 className="text-2xl font-bold text-ev-charcoal">
            Elephant Social Network
          </h1>
          <p className="text-sm text-ev-warm-gray mt-1">
            Visualizing communication relationships between individuals
          </p>
        </div>
      </motion.div>

      {/* Loading */}
      {loading && (
        <div className="flex flex-col items-center justify-center py-24 gap-4">
          <Loader2 className="w-8 h-8 text-accent-savanna animate-spin" />
          <p className="text-sm text-ev-warm-gray">
            Building social network graph...
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
      {!loading && !error && data && data.nodes.length === 0 && (
        <motion.div
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          className="p-16 rounded-2xl border border-dashed border-ev-sand/60 bg-ev-cream/60 text-center"
        >
          <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-accent-savanna/10 to-accent-gold/5 flex items-center justify-center mx-auto mb-4">
            <Users className="w-7 h-7 text-accent-savanna/50" />
          </div>
          <p className="text-ev-elephant font-medium mb-1">
            No social network data
          </p>
          <p className="text-ev-warm-gray text-sm">
            Process recordings with identified individuals to build a social
            network.
          </p>
        </motion.div>
      )}

      {/* Main content */}
      {!loading && !error && data && data.nodes.length > 0 && (
        <>
          {/* Stats summary */}
          <motion.div
            variants={staggerContainer}
            initial="initial"
            animate="animate"
            className="grid grid-cols-2 sm:grid-cols-4 gap-4"
          >
            {[
              {
                label: "Individuals",
                value: data.stats.total_individuals,
                icon: Users,
              },
              {
                label: "Connections",
                value: data.stats.total_connections,
                icon: GitBranch,
              },
              {
                label: "Most Connected",
                value: data.stats.most_connected,
                icon: Crown,
                isText: true,
              },
              {
                label: "Avg Connections",
                value: data.stats.avg_connections.toFixed(1),
                icon: GitBranch,
              },
            ].map((stat) => (
              <motion.div
                key={stat.label}
                variants={fadeUp}
                className="rounded-xl border border-ev-sand/40 bg-ev-cream/60 p-4"
              >
                <div className="flex items-center gap-2 mb-1">
                  <stat.icon className="w-3.5 h-3.5 text-accent-savanna" />
                  <p className="text-[10px] uppercase tracking-wider text-ev-warm-gray/70 font-medium">
                    {stat.label}
                  </p>
                </div>
                <p
                  className={`font-bold text-ev-charcoal tabular-nums ${
                    stat.isText ? "text-sm truncate" : "text-lg"
                  }`}
                >
                  {stat.value}
                </p>
              </motion.div>
            ))}
          </motion.div>

          {/* Graph + Sidebar */}
          <div className="grid grid-cols-1 lg:grid-cols-[1fr_280px] gap-4">
            {/* SVG graph */}
            <motion.div
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.1 }}
              className="rounded-xl border border-ev-sand/40 bg-ev-cream/60 overflow-hidden relative"
              ref={svgContainerRef}
            >
              <svg
                width={dimensions.width}
                height={dimensions.height}
                className="select-none cursor-default"
                onClick={() => setSelectedNode(null)}
              >
                {/* Edges */}
                {edges.map((edge, i) => {
                  const a = nodeMap.get(edge.source);
                  const b = nodeMap.get(edge.target);
                  if (!a || !b) return null;
                  const thickness =
                    1 + (edge.weight / maxEdgeWeight) * 4;
                  const strokeColor =
                    edge.call_response_pairs > 0 ? "#E67E22" : "#B5ADA4";
                  const opacity =
                    edge.call_response_pairs > 0 ? 0.6 : 0.3;

                  return (
                    <line
                      key={`edge-${i}`}
                      x1={a.x}
                      y1={a.y}
                      x2={b.x}
                      y2={b.y}
                      stroke={strokeColor}
                      strokeWidth={thickness}
                      opacity={opacity}
                    />
                  );
                })}

                {/* Nodes */}
                {nodes.map((node) => {
                  const isSelected = selectedNode === node.id;
                  return (
                    <g
                      key={node.id}
                      onClick={(e) => {
                        e.stopPropagation();
                        setSelectedNode(
                          isSelected ? null : node.id
                        );
                      }}
                      className="cursor-pointer"
                    >
                      {/* Glow ring for selected */}
                      {isSelected && (
                        <circle
                          cx={node.x}
                          cy={node.y}
                          r={node.radius + 6}
                          fill="none"
                          stroke={node.color}
                          strokeWidth={2.5}
                          opacity={0.4}
                        />
                      )}
                      {/* Main circle */}
                      <circle
                        cx={node.x}
                        cy={node.y}
                        r={node.radius}
                        fill={node.color}
                        opacity={0.85}
                        stroke="#fff"
                        strokeWidth={2}
                        className="transition-opacity hover:opacity-100"
                      />
                      {/* Call count inside node */}
                      <text
                        x={node.x}
                        y={node.y + 1}
                        textAnchor="middle"
                        dominantBaseline="central"
                        style={{
                          fontSize: Math.max(9, node.radius * 0.45),
                          fill: "#fff",
                          fontWeight: 700,
                        }}
                      >
                        {node.call_count}
                      </text>
                      {/* Label below */}
                      <text
                        x={node.x}
                        y={node.y + node.radius + 13}
                        textAnchor="middle"
                        style={{
                          fontSize: 10,
                          fill: "#4A453F",
                          fontWeight: 600,
                        }}
                      >
                        {node.id}
                      </text>
                    </g>
                  );
                })}
              </svg>

              {/* Tooltip for selected node */}
              {selectedNodeData && (
                <motion.div
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="absolute bottom-4 left-4 rounded-xl border border-ev-sand/40 bg-white/95 backdrop-blur-sm p-4 shadow-card max-w-[260px]"
                >
                  <div className="flex items-start justify-between gap-2 mb-2">
                    <div className="flex items-center gap-2">
                      <span
                        className="w-3 h-3 rounded-full flex-shrink-0"
                        style={{
                          backgroundColor: selectedNodeData.color,
                        }}
                      />
                      <span className="font-bold text-sm text-ev-charcoal">
                        {selectedNodeData.id}
                      </span>
                    </div>
                    <button
                      onClick={() => setSelectedNode(null)}
                      className="text-ev-warm-gray hover:text-ev-charcoal transition-colors"
                    >
                      <X className="w-3.5 h-3.5" />
                    </button>
                  </div>
                  <div className="space-y-1.5 text-xs text-ev-warm-gray">
                    <div className="flex justify-between">
                      <span>Calls</span>
                      <span className="text-ev-charcoal font-medium tabular-nums">
                        {selectedNodeData.call_count}
                      </span>
                    </div>
                    <div className="flex justify-between">
                      <span>Dominant type</span>
                      <span className="text-ev-charcoal font-medium capitalize">
                        {selectedNodeData.most_common_type}
                      </span>
                    </div>
                    {selectedNodeData.locations.length > 0 && (
                      <div>
                        <span className="text-ev-warm-gray/70 text-[10px] uppercase tracking-wider font-medium">
                          Locations
                        </span>
                        <p className="text-ev-charcoal text-xs mt-0.5">
                          {selectedNodeData.locations.join(", ")}
                        </p>
                      </div>
                    )}
                    {selectedNodeData.dates.length > 0 && (
                      <div>
                        <span className="text-ev-warm-gray/70 text-[10px] uppercase tracking-wider font-medium">
                          Dates
                        </span>
                        <p className="text-ev-charcoal text-xs mt-0.5">
                          {selectedNodeData.dates.slice(0, 3).join(", ")}
                          {selectedNodeData.dates.length > 3 &&
                            ` +${selectedNodeData.dates.length - 3} more`}
                        </p>
                      </div>
                    )}
                  </div>
                </motion.div>
              )}
            </motion.div>

            {/* Sidebar */}
            <motion.div
              initial={{ opacity: 0, x: 12 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: 0.2 }}
              className="space-y-4"
            >
              {/* Network stats card */}
              <div className="rounded-xl border border-ev-sand/40 bg-ev-cream/60 p-4">
                <h3 className="text-xs font-semibold text-ev-elephant uppercase tracking-wider mb-3">
                  Network Stats
                </h3>
                <div className="space-y-2.5">
                  <div className="flex justify-between items-center">
                    <span className="text-xs text-ev-warm-gray">Density</span>
                    <span className="text-xs font-medium text-ev-charcoal tabular-nums">
                      {data.nodes.length > 1
                        ? (
                            (2 * data.edges.length) /
                            (data.nodes.length * (data.nodes.length - 1))
                          ).toFixed(2)
                        : "N/A"}
                    </span>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="text-xs text-ev-warm-gray">
                      Active pairs
                    </span>
                    <span className="text-xs font-medium text-ev-charcoal tabular-nums">
                      {data.edges.filter((e) => e.call_response_pairs > 0).length}
                    </span>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="text-xs text-ev-warm-gray">
                      Total call-responses
                    </span>
                    <span className="text-xs font-medium text-ev-charcoal tabular-nums">
                      {data.edges.reduce((s, e) => s + e.call_response_pairs, 0)}
                    </span>
                  </div>
                </div>
              </div>

              {/* Key relationships */}
              <div className="rounded-xl border border-ev-sand/40 bg-ev-cream/60 p-4">
                <h3 className="text-xs font-semibold text-ev-elephant uppercase tracking-wider mb-3">
                  Key Relationships
                </h3>
                {topEdges.length === 0 ? (
                  <p className="text-xs text-ev-warm-gray">
                    No relationships found.
                  </p>
                ) : (
                  <div className="space-y-2">
                    {topEdges.map((edge, i) => (
                      <div
                        key={`top-${i}`}
                        className="rounded-lg border border-ev-sand/30 bg-white/60 p-2.5"
                      >
                        <div className="flex items-center gap-1.5 mb-1">
                          <span
                            className="w-2 h-2 rounded-full"
                            style={{
                              backgroundColor: colorForType(
                                data.nodes.find((n) => n.id === edge.source)
                                  ?.most_common_type ?? ""
                              ),
                            }}
                          />
                          <span className="text-xs font-semibold text-ev-charcoal">
                            {edge.source}
                          </span>
                          <span className="text-[10px] text-ev-warm-gray mx-0.5">
                            --
                          </span>
                          <span
                            className="w-2 h-2 rounded-full"
                            style={{
                              backgroundColor: colorForType(
                                data.nodes.find((n) => n.id === edge.target)
                                  ?.most_common_type ?? ""
                              ),
                            }}
                          />
                          <span className="text-xs font-semibold text-ev-charcoal">
                            {edge.target}
                          </span>
                        </div>
                        <div className="flex gap-3 text-[10px] text-ev-warm-gray">
                          <span>
                            Wt:{" "}
                            <span className="text-ev-charcoal font-medium tabular-nums">
                              {edge.weight.toFixed(1)}
                            </span>
                          </span>
                          <span>
                            Shared:{" "}
                            <span className="text-ev-charcoal font-medium tabular-nums">
                              {edge.shared_recordings}
                            </span>
                          </span>
                          {edge.call_response_pairs > 0 && (
                            <span>
                              Pairs:{" "}
                              <span className="text-ev-charcoal font-medium tabular-nums">
                                {edge.call_response_pairs}
                              </span>
                            </span>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Legend */}
              <div className="rounded-xl border border-ev-sand/40 bg-ev-cream/60 p-4">
                <h3 className="text-xs font-semibold text-ev-elephant uppercase tracking-wider mb-3">
                  Legend
                </h3>
                <div className="space-y-2">
                  <div className="flex flex-wrap gap-x-3 gap-y-1.5">
                    {Object.entries(TYPE_COLORS).map(([type, color]) => (
                      <div
                        key={type}
                        className="flex items-center gap-1.5"
                      >
                        <span
                          className="w-2.5 h-2.5 rounded-full"
                          style={{ backgroundColor: color }}
                        />
                        <span className="text-[10px] text-ev-warm-gray capitalize">
                          {type}
                        </span>
                      </div>
                    ))}
                  </div>
                  <div className="pt-2 border-t border-ev-sand/30 space-y-1.5">
                    <div className="flex items-center gap-2">
                      <span className="w-6 h-[3px] rounded-full bg-[#E67E22]" />
                      <span className="text-[10px] text-ev-warm-gray">
                        Call-response edge
                      </span>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="w-6 h-[2px] rounded-full bg-ev-dust" />
                      <span className="text-[10px] text-ev-warm-gray">
                        Shared recordings only
                      </span>
                    </div>
                    <p className="text-[10px] text-ev-warm-gray/70 mt-1">
                      Node size = call count. Edge thickness = weight.
                    </p>
                  </div>
                </div>
              </div>
            </motion.div>
          </div>
        </>
      )}
    </div>
  );
}
