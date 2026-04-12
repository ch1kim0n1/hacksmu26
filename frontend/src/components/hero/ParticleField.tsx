"use client";

import { Canvas, useFrame } from "@react-three/fiber";
import { useMemo, useRef } from "react";
import * as THREE from "three";

function Dust({
  count = 250,
  color = "#C4A46C",
  speed = 0.012,
  spread = 14,
  size = 0.035,
}: {
  count?: number;
  color?: string;
  speed?: number;
  spread?: number;
  size?: number;
}) {
  const ref = useRef<THREE.Points>(null!);
  const seeds = useMemo(
    () => Array.from({ length: count }, () => Math.random()),
    [count],
  );

  const positions = useMemo(() => {
    const arr = new Float32Array(count * 3);
    for (let i = 0; i < count; i++) {
      arr[i * 3] = (Math.random() - 0.5) * spread;
      arr[i * 3 + 1] = (Math.random() - 0.5) * spread;
      arr[i * 3 + 2] = (Math.random() - 0.5) * spread * 0.5;
    }
    return arr;
  }, [count, spread]);

  useFrame(({ clock }) => {
    const t = clock.elapsedTime;
    const attr = ref.current.geometry.attributes
      .position as THREE.BufferAttribute;
    const a = attr.array as Float32Array;
    const half = spread / 2;

    for (let i = 0; i < count; i++) {
      const s = seeds[i];
      a[i * 3] += Math.sin(t * 0.2 + s * 20) * speed * 0.08;
      a[i * 3 + 1] += speed * (0.15 + s * 0.15);
      if (a[i * 3 + 1] > half) a[i * 3 + 1] = -half;
    }
    attr.needsUpdate = true;
    ref.current.rotation.y = t * 0.006;
  });

  return (
    <points ref={ref}>
      <bufferGeometry>
        <bufferAttribute
          attach="attributes-position"
          count={count}
          array={positions}
          itemSize={3}
        />
      </bufferGeometry>
      <pointsMaterial
        color={color}
        size={size}
        transparent
        opacity={0.5}
        sizeAttenuation
        depthWrite={false}
        blending={THREE.AdditiveBlending}
      />
    </points>
  );
}

export default function ParticleField({
  className = "",
  count = 250,
  color = "#C4A46C",
  speed = 0.012,
  size = 0.035,
}: {
  className?: string;
  count?: number;
  color?: string;
  speed?: number;
  size?: number;
}) {
  return (
    <div className={`absolute inset-0 pointer-events-none ${className}`}>
      <Canvas
        camera={{ position: [0, 0, 8], fov: 50 }}
        gl={{ alpha: true, antialias: false, powerPreference: "low-power" }}
        dpr={[1, 1.5]}
        style={{ background: "transparent" }}
      >
        <Dust count={count} color={color} speed={speed} size={size} />
      </Canvas>
    </div>
  );
}
