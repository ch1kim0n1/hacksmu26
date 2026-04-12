"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { motion } from "framer-motion";
import { usePathname, useRouter } from "next/navigation";
import CloudTransitionScene from "@/components/transition/CloudTransitionScene";

type GlobeRect = {
  left: number;
  top: number;
  width: number;
  height: number;
};

type SceneTransitionContextValue = {
  isTransitioning: boolean;
  startDashboardTransition: (
    globeRect: GlobeRect,
    globeSnapshotUrl?: string
  ) => void;
};

const SceneTransitionContext = createContext<SceneTransitionContextValue | null>(
  null
);

const DASHBOARD_ROUTE = "/dashboard";
const ZOOM_MS  = 1300;   // time to fall toward Earth and enter atmosphere
const CLOUD_MS = 1050;   // time falling through clouds
const REVEAL_MS = 520;   // fade to dashboard

export function SceneTransitionProvider({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  const router = useRouter();
  const pathname = usePathname();
  const [isTransitioning, setIsTransitioning] = useState(false);
  const [phase, setPhase] = useState<"idle" | "zoom" | "clouds" | "reveal">("idle");
  const [globeRect, setGlobeRect] = useState<GlobeRect | null>(null);
  const [globeSnapshotUrl, setGlobeSnapshotUrl] = useState<string | null>(null);
  const timeoutsRef = useRef<number[]>([]);
  const startTimeRef = useRef(0);
  const hasNavigatedRef = useRef(false);
  const cloudRevealScheduledRef = useRef(false);

  const clearTimers = useCallback(() => {
    timeoutsRef.current.forEach((t) => window.clearTimeout(t));
    timeoutsRef.current = [];
  }, []);

  useEffect(() => { router.prefetch(DASHBOARD_ROUTE); }, [router]);
  useEffect(() => () => clearTimers(), [clearTimers]);

  useEffect(() => {
    if (
      !isTransitioning ||
      phase !== "clouds" ||
      pathname !== DASHBOARD_ROUTE ||
      cloudRevealScheduledRef.current
    ) return;

    cloudRevealScheduledRef.current = true;
    const elapsed = performance.now() - startTimeRef.current;
    const remainingCloudTime = Math.max(220, ZOOM_MS + CLOUD_MS - elapsed);

    timeoutsRef.current.push(
      window.setTimeout(() => {
        setPhase("reveal");
        timeoutsRef.current.push(
          window.setTimeout(() => {
            setPhase("idle");
            setGlobeRect(null);
            setGlobeSnapshotUrl(null);
            setIsTransitioning(false);
            hasNavigatedRef.current = false;
            cloudRevealScheduledRef.current = false;
          }, REVEAL_MS)
        );
      }, remainingCloudTime)
    );
  }, [isTransitioning, pathname, phase]);

  const startDashboardTransition = useCallback(
    (nextGlobeRect: GlobeRect, nextGlobeSnapshotUrl?: string) => {
      if (isTransitioning) return;

      clearTimers();
      setGlobeRect(nextGlobeRect);
      setGlobeSnapshotUrl(nextGlobeSnapshotUrl ?? null);
      setIsTransitioning(true);
      setPhase("zoom");
      startTimeRef.current = performance.now();
      hasNavigatedRef.current = false;
      cloudRevealScheduledRef.current = false;

      timeoutsRef.current.push(
        window.setTimeout(() => {
          setPhase("clouds");
          if (!hasNavigatedRef.current) {
            hasNavigatedRef.current = true;
            router.push(DASHBOARD_ROUTE);
          }
        }, ZOOM_MS)
      );
    },
    [clearTimers, isTransitioning, router]
  );

  const contextValue = useMemo(
    () => ({ isTransitioning, startDashboardTransition }),
    [isTransitioning, startDashboardTransition]
  );

  const globeStyle: React.CSSProperties | undefined =
    globeRect == null
      ? undefined
      : {
          left: `${globeRect.left}px`,
          top: `${globeRect.top}px`,
          width: `${globeRect.width}px`,
          height: `${globeRect.height}px`,
        };

  const isZooming = phase === "zoom";

  return (
    <SceneTransitionContext.Provider value={contextValue}>
      {children}

      <div
        className={`pointer-events-none fixed inset-0 z-[200] overflow-hidden ${
          phase === "idle" ? "invisible" : "visible"
        }`}
        aria-hidden="true"
      >
        {/* Dark base — always behind everything, fades away during zoom */}
        <div
          className="absolute inset-0 bg-[#02050e] transition-opacity duration-300"
          style={{ opacity: isZooming ? 0 : 1 }}
        />

        {/* ── Earth globe: scales from its screen position toward the viewer ── */}
        {globeRect && (
          <motion.div
            className="absolute rounded-full"
            style={{
              ...globeStyle,
              backgroundImage: globeSnapshotUrl
                ? `url(${globeSnapshotUrl})`
                : undefined,
              backgroundPosition: "center",
              backgroundRepeat: "no-repeat",
              backgroundSize: "cover",
              background: globeSnapshotUrl
                ? undefined
                : "radial-gradient(circle at 35% 35%, rgba(145,189,255,0.9) 0%, rgba(42,91,177,0.92) 36%, rgba(8,24,54,0.98) 70%, rgba(3,10,24,1) 100%)",
            }}
            initial={{ scale: 1, opacity: 1 }}
            animate={
              isZooming
                ? { scale: 24, opacity: [1, 1, 0] }
                : { scale: 1, opacity: 0 }
            }
            transition={
              isZooming
                ? {
                    duration: ZOOM_MS / 1000,
                    ease: [0.06, 0.0, 0.16, 1.0],
                    opacity: { times: [0, 0.62, 1], duration: ZOOM_MS / 1000 },
                  }
                : { duration: 0.15 }
            }
          >
            {/* Specular highlight */}
            <div className="absolute inset-0 rounded-full bg-[radial-gradient(circle_at_34%_28%,rgba(255,255,255,0.18)_0%,rgba(255,255,255,0)_38%)]" />
          </motion.div>
        )}

        {/* ── Atmosphere glow ring ── */}
        {globeRect && (
          <motion.div
            className="absolute rounded-full"
            style={globeStyle}
            initial={{ scale: 1, opacity: 0 }}
            animate={
              isZooming
                ? {
                    scale: [1, 26],
                    opacity: [0, 0.55, 0],
                    boxShadow: [
                      "0 0 60px 28px rgba(80,150,255,0.65)",
                      "0 0 140px 90px rgba(100,190,255,0.08)",
                    ],
                  }
                : { scale: 1, opacity: 0 }
            }
            transition={
              isZooming
                ? { duration: ZOOM_MS / 1000, ease: [0.06, 0.0, 0.16, 1.0] }
                : { duration: 0.15 }
            }
          />
        )}

        {/* ── Sky gradient — fades in as you enter atmosphere (~60% into zoom) ── */}
        <div
          className="absolute inset-0 bg-[linear-gradient(180deg,#1a4a8a_0%,#2e7cc8_40%,#6db5ea_100%)]"
          style={{
            opacity: isZooming ? 1 : 0,
            transition: isZooming
              ? `opacity 0.45s ease-in ${(ZOOM_MS * 0.58) / 1000}s`
              : "opacity 0.2s ease-out",
          }}
        />

        {/* ── Falling-through-clouds scene ── */}
        <CloudTransitionScene
          active={phase === "clouds" || phase === "reveal"}
          reveal={phase === "reveal"}
        />
      </div>
    </SceneTransitionContext.Provider>
  );
}

export function useSceneTransition() {
  const context = useContext(SceneTransitionContext);
  if (!context) {
    throw new Error("useSceneTransition must be used within a SceneTransitionProvider.");
  }
  return context;
}
