"use client";

import React, { useRef, useMemo, useState, useCallback, useEffect } from "react";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { OrbitControls, Text, Grid } from "@react-three/drei";
import * as THREE from "three";
import { getSpectrogramData, type SpectrogramData } from "@/lib/audio-api";

// Viridis-inspired colormap for scientific spectrograms
function viridisColor(t: number): THREE.Color {
  const r = Math.max(0, Math.min(1, -0.35 + 2.5 * t - 1.7 * t * t));
  const g = Math.max(0, Math.min(1, -0.05 + 1.5 * t - 0.5 * t * t));
  const b = Math.max(0, Math.min(1, 0.5 + 0.8 * t - 2.0 * t * t + 1.2 * t * t * t));
  return new THREE.Color(r, g, b);
}

function magmaColor(t: number): THREE.Color {
  const r = Math.max(0, Math.min(1, -0.02 + 2.5 * t - 1.3 * t * t));
  const g = Math.max(0, Math.min(1, -0.2 + 0.8 * t + 0.5 * t * t));
  const b = Math.max(0, Math.min(1, 0.4 + 1.2 * t - 2.5 * t * t + 1.8 * t * t * t));
  return new THREE.Color(r, g, b);
}

interface TerrainMeshProps {
  data: SpectrogramData;
  heightScale: number;
  colormap: "viridis" | "magma";
}

function TerrainMesh({ data, heightScale, colormap }: TerrainMeshProps) {
  const meshRef = useRef<THREE.Mesh>(null);

  const geometry = useMemo(() => {
    const rows = data.height;
    const cols = data.width;
    const geo = new THREE.PlaneGeometry(10, 6, cols - 1, rows - 1);

    const positions = geo.attributes.position.array as Float32Array;
    const colors = new Float32Array(positions.length);
    const colorFn = colormap === "magma" ? magmaColor : viridisColor;

    for (let i = 0; i < rows; i++) {
      for (let j = 0; j < cols; j++) {
        const vertexIndex = i * cols + j;
        const posIndex = vertexIndex * 3;
        const magnitude = data.magnitudes[rows - 1 - i]?.[j] ?? 0;

        // Set height (Z becomes Y after rotation)
        positions[posIndex + 2] = magnitude * heightScale;

        // Set color
        const color = colorFn(magnitude);
        colors[posIndex] = color.r;
        colors[posIndex + 1] = color.g;
        colors[posIndex + 2] = color.b;
      }
    }

    geo.setAttribute("color", new THREE.BufferAttribute(colors, 3));
    geo.computeVertexNormals();
    return geo;
  }, [data, heightScale, colormap]);

  return (
    <mesh ref={meshRef} geometry={geometry} rotation={[-Math.PI / 2, 0, 0]} position={[0, 0, 0]}>
      <meshStandardMaterial vertexColors side={THREE.DoubleSide} roughness={0.7} metalness={0.1} />
    </mesh>
  );
}

interface FlyThroughCameraProps {
  active: boolean;
  onComplete: () => void;
}

function FlyThroughCamera({ active, onComplete }: FlyThroughCameraProps) {
  const { camera } = useThree();
  const startTimeRef = useRef(0);
  const duration = 8; // seconds

  useEffect(() => {
    if (active) {
      startTimeRef.current = 0;
    }
  }, [active]);

  useFrame((_, delta) => {
    if (!active) return;

    startTimeRef.current += delta;
    const t = Math.min(startTimeRef.current / duration, 1);

    // Camera path: sweep from front-high to side-low to back-high
    const angle = t * Math.PI * 1.5;
    const radius = 8 + Math.sin(t * Math.PI) * 3;
    const height = 3 + Math.cos(t * Math.PI) * 4;

    camera.position.set(
      Math.cos(angle) * radius,
      height,
      Math.sin(angle) * radius
    );
    camera.lookAt(0, 0.5, 0);

    if (t >= 1) {
      onComplete();
    }
  });

  return null;
}

interface AxisLabelsProps {
  durationS: number;
  freqMaxHz: number;
}

function AxisLabels({ durationS, freqMaxHz }: AxisLabelsProps) {
  return (
    <group>
      {/* Time axis labels */}
      {[0, 0.25, 0.5, 0.75, 1].map((t) => (
        <Text
          key={`time-${t}`}
          position={[-5 + t * 10, -0.3, 3.5]}
          fontSize={0.2}
          color="#8A837B"
          anchorX="center"
        >
          {(t * durationS).toFixed(1)}s
        </Text>
      ))}
      <Text position={[0, -0.3, 4.2]} fontSize={0.22} color="#6B6560" anchorX="center">
        Time
      </Text>

      {/* Frequency axis labels */}
      {[0, 0.25, 0.5, 0.75, 1].map((t) => (
        <Text
          key={`freq-${t}`}
          position={[-5.8, -0.3, 3 - t * 6]}
          fontSize={0.2}
          color="#8A837B"
          anchorX="right"
        >
          {Math.round(t * freqMaxHz)}Hz
        </Text>
      ))}
      <Text position={[-6.5, -0.3, 0]} fontSize={0.22} color="#6B6560" anchorX="center" rotation={[0, Math.PI / 2, 0]}>
        Frequency
      </Text>
    </group>
  );
}

interface Spectrogram3DProps {
  recordingId: string;
  onClose?: () => void;
}

export default function Spectrogram3D({ recordingId, onClose }: Spectrogram3DProps) {
  const [data, setData] = useState<SpectrogramData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [heightScale, setHeightScale] = useState(3);
  const [colormap, setColormap] = useState<"viridis" | "magma">("viridis");
  const [isFlying, setIsFlying] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  React.useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        setLoading(true);
        const result = await getSpectrogramData(recordingId, { width: 256, height: 128 });
        if (!cancelled) setData(result);
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : "Failed to load spectrogram data");
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    load();
    return () => { cancelled = true; };
  }, [recordingId]);

  const toggleFullscreen = useCallback(() => {
    if (!containerRef.current) return;
    if (!isFullscreen) {
      containerRef.current.requestFullscreen?.();
    } else {
      document.exitFullscreen?.();
    }
    setIsFullscreen(!isFullscreen);
  }, [isFullscreen]);

  useEffect(() => {
    const handleFullscreenChange = () => {
      setIsFullscreen(!!document.fullscreenElement);
    };
    document.addEventListener("fullscreenchange", handleFullscreenChange);
    return () => document.removeEventListener("fullscreenchange", handleFullscreenChange);
  }, []);

  if (loading) {
    return (
      <div className="p-5 rounded-xl bg-white/50 border border-ev-sand/40">
        <div className="flex flex-col items-center gap-3 py-12">
          <div className="w-8 h-8 border-2 border-accent-savanna border-t-transparent rounded-full animate-spin" />
          <p className="text-sm text-ev-elephant">Loading 3D spectrogram data...</p>
        </div>
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="p-5 rounded-xl bg-white/50 border border-ev-sand/40">
        <p className="text-sm text-danger text-center py-8">{error || "No data available"}</p>
      </div>
    );
  }

  return (
    <div ref={containerRef} className="rounded-xl bg-[#0C1A2A] border border-ev-sand/40 overflow-hidden">
      {/* Toolbar */}
      <div className="flex items-center justify-between px-4 py-2.5 bg-[#0C1A2A]/90 border-b border-white/10">
        <div className="flex items-center gap-3">
          <h3 className="text-sm font-semibold text-white/90">3D Spectrogram</h3>
          <span className="text-[10px] text-white/40 font-mono">
            {data.duration_s}s · {data.freq_max_hz}Hz
          </span>
        </div>
        <div className="flex items-center gap-2">
          {/* Height scale */}
          <label className="flex items-center gap-1.5 text-[10px] text-white/50">
            Height
            <input
              type="range"
              min={0.5}
              max={6}
              step={0.5}
              value={heightScale}
              onChange={(e) => setHeightScale(parseFloat(e.target.value))}
              className="w-16 h-1 rounded-full appearance-none cursor-pointer accent-accent-savanna"
            />
          </label>
          {/* Colormap toggle */}
          <button
            onClick={() => setColormap(colormap === "viridis" ? "magma" : "viridis")}
            className="px-2 py-1 text-[10px] text-white/60 hover:text-white rounded border border-white/10 hover:border-white/25 transition-colors"
          >
            {colormap === "viridis" ? "Viridis" : "Magma"}
          </button>
          {/* Fly through */}
          <button
            onClick={() => setIsFlying(true)}
            disabled={isFlying}
            className="px-2.5 py-1 text-[10px] font-medium text-white bg-accent-savanna/80 hover:bg-accent-savanna rounded transition-colors disabled:opacity-50"
          >
            {isFlying ? "Flying..." : "Fly Through"}
          </button>
          {/* Fullscreen */}
          <button
            onClick={toggleFullscreen}
            className="p-1 text-white/50 hover:text-white transition-colors"
            title="Toggle fullscreen"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M3.75 3.75v4.5m0-4.5h4.5m-4.5 0L9 9M3.75 20.25v-4.5m0 4.5h4.5m-4.5 0L9 15M20.25 3.75h-4.5m4.5 0v4.5m0-4.5L15 9m5.25 11.25h-4.5m4.5 0v-4.5m0 4.5L15 15" />
            </svg>
          </button>
          {/* Close */}
          {onClose && (
            <button
              onClick={onClose}
              className="p-1 text-white/50 hover:text-white transition-colors"
            >
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          )}
        </div>
      </div>

      {/* 3D Canvas */}
      <div className={isFullscreen ? "w-full h-full" : "w-full aspect-[16/9]"}>
        <Canvas camera={{ position: [0, 6, 8], fov: 50 }}>
          <ambientLight intensity={0.4} />
          <directionalLight position={[5, 8, 5]} intensity={0.8} />
          <directionalLight position={[-3, 5, -3]} intensity={0.3} />

          <TerrainMesh data={data} heightScale={heightScale} colormap={colormap} />
          <AxisLabels durationS={data.duration_s} freqMaxHz={data.freq_max_hz} />

          {/* Base grid */}
          <Grid
            position={[0, -0.01, 0]}
            args={[12, 8]}
            cellSize={0.5}
            cellThickness={0.3}
            cellColor="#1a3a4a"
            sectionSize={2}
            sectionThickness={0.6}
            sectionColor="#2a5a6a"
            fadeDistance={20}
            infiniteGrid={false}
          />

          <OrbitControls
            enableDamping
            dampingFactor={0.05}
            minDistance={3}
            maxDistance={20}
            maxPolarAngle={Math.PI / 2}
          />

          <FlyThroughCamera active={isFlying} onComplete={() => setIsFlying(false)} />
        </Canvas>
      </div>

      {/* Footer info */}
      <div className="px-4 py-2 bg-[#0C1A2A]/90 border-t border-white/10 flex items-center justify-between">
        <p className="text-[10px] text-white/40">
          Drag to orbit · Scroll to zoom · Right-click to pan
        </p>
        <p className="text-[10px] text-white/40 font-mono">
          {data.width}x{data.height} vertices
        </p>
      </div>
    </div>
  );
}
