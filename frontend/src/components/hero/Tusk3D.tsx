"use client";

import { useMemo, useRef } from "react";
import { Canvas, useFrame } from "@react-three/fiber";
import * as THREE from "three";

/* ─────────────────────────────────────────────
   Single curved tusk built from TubeGeometry
   ───────────────────────────────────────────── */
function Tusk({ side }: { side: "left" | "right" }) {
  const ref = useRef<THREE.Mesh>(null);
  const d = side === "right" ? 1 : -1;

  /* Geometry only recalculated when side changes */
  const geo = useMemo(() => {
    const pts = [
      new THREE.Vector3(0, 0, 0),
      new THREE.Vector3(d * 0.28, -0.9, 0.18),
      new THREE.Vector3(d * 0.60, -1.95, 0.38),
      new THREE.Vector3(d * 0.85, -3.0,  0.42),
      new THREE.Vector3(d * 1.02, -3.95, 0.26),
      new THREE.Vector3(d * 1.12, -4.65, 0.04),
    ];
    return new THREE.TubeGeometry(
      new THREE.CatmullRomCurve3(pts),
      60,   // tubular segments
      0.10, // radius at base, tapered below via custom…
      12,   // radial segments
      false,
    );
  }, [d]);

  /* Gentle float + sway */
  useFrame(({ clock }) => {
    if (!ref.current) return;
    const t = clock.elapsedTime;
    const phase = side === "left" ? 0 : Math.PI;
    ref.current.rotation.z = Math.sin(t * 0.38 + phase) * 0.028;
    ref.current.position.y = Math.sin(t * 0.55 + phase * 0.5) * 0.055;
  });

  return (
    <mesh ref={ref} geometry={geo} castShadow>
      <meshStandardMaterial
        color="#D8CBA8"
        roughness={0.32}
        metalness={0.04}
        envMapIntensity={0.6}
      />
    </mesh>
  );
}

/* ─────────────────────────────────────────────
   Root: two tusks on a transparent Canvas
   ───────────────────────────────────────────── */
export default function Tusk3D({ className }: { className?: string }) {
  return (
    <Canvas
      className={className}
      camera={{ position: [0, -1.8, 8], fov: 36 }}
      gl={{ antialias: true, alpha: true }}
      style={{ background: "transparent" }}
    >
      {/* Warm ivory lighting matching hero bg */}
      <ambientLight intensity={0.75} color="#FFF3E0" />
      <directionalLight
        position={[4, 7, 4]}
        intensity={1.4}
        color="#FFE4A8"
        castShadow
      />
      <pointLight position={[-3, 2, 3]} intensity={0.4} color="#C4A46C" />
      <pointLight position={[3, -1, 2]} intensity={0.15} color="#3D2010" />

      {/* Pair of tusks centered, rotated slightly outward */}
      <group position={[0, 2.2, 0]}>
        <group position={[-0.55, 0, 0]} rotation={[0.08, -0.05, 0.12]}>
          <Tusk side="left" />
        </group>
        <group position={[0.55, 0, 0]} rotation={[0.08, 0.05, -0.12]}>
          <Tusk side="right" />
        </group>
      </group>
    </Canvas>
  );
}
