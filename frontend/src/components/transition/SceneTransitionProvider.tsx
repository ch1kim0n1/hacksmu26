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

type Phase = "idle" | "zoom" | "clouds" | "linger" | "reveal" | "fadeout";

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
const ZOOM_MS    = 1100;  // globe rushes toward viewer
const CLOUD_MS   = 1100;  // flying through clouds
const LINGER_MS  = 1100;  // a few clouds hovering before fade
const REVEAL_MS  = 500;   // white fades in
const FADEOUT_MS = 800;   // white fades out over dashboard

export function SceneTransitionProvider({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  const router = useRouter();
  const pathname = usePathname();
  const [isTransitioning, setIsTransitioning] = useState(false);
  const [phase, setPhase] = useState<Phase>("idle");
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

  // Once the dashboard route has loaded during clouds phase, chain linger → reveal → fadeout
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
        setPhase("linger");
        timeoutsRef.current.push(
          window.setTimeout(() => {
            setPhase("reveal");
            timeoutsRef.current.push(
              window.setTimeout(() => {
                setPhase("fadeout");
                timeoutsRef.current.push(
                  window.setTimeout(() => {
                    setPhase("idle");
                    setGlobeRect(null);
                    setGlobeSnapshotUrl(null);
                    setIsTransitioning(false);
                    hasNavigatedRef.current = false;
                    cloudRevealScheduledRef.current = false;
                  }, FADEOUT_MS)
                );
              }, REVEAL_MS)
            );
          }, LINGER_MS)
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
        {/* ── Globe ── scales from its landing-page position toward the viewer */}
        {globeRect && (
          <motion.div
            className="absolute rounded-full"
            style={{
              ...globeStyle,
              backgroundImage: globeSnapshotUrl ? `url(${globeSnapshotUrl})` : undefined,
              backgroundPosition: "center",
              backgroundRepeat: "no-repeat",
              backgroundSize: "cover",
              // Fallback: a convincing Earth-from-space gradient
              background: globeSnapshotUrl
                ? undefined
                : "radial-gradient(circle at 38% 32%, rgba(168,215,255,0.95) 0%, rgba(78,151,210,0.98) 18%, rgba(30,90,170,1) 40%, rgba(18,60,130,1) 62%, rgba(8,28,68,1) 80%, rgba(2,8,22,1) 100%)",
            }}
            initial={{ scale: 1, opacity: 1 }}
            animate={
              isZooming
                ? { scale: 28, opacity: [1, 1, 1, 0] }
                : { scale: 1, opacity: 0 }
            }
            transition={
              isZooming
                ? {
                    duration: ZOOM_MS / 1000,
                    ease: [0.06, 0.0, 0.14, 1.0],
                    // Stay fully opaque until 75% of the zoom, then fade out
                    opacity: { times: [0, 0.5, 0.75, 1], duration: ZOOM_MS / 1000 },
                  }
                : { duration: 0.1 }
            }
          />
        )}

        {/* ── Atmosphere ── sky-blue gradient fades in at 55% of zoom duration,
            bridging the globe zoom into the cloud scene */}
        <div
          className="absolute inset-0 bg-[linear-gradient(180deg,#1a5fa8_0%,#2e7cc8_40%,#6db5ea_100%)]"
          style={{
            opacity: isZooming ? 1 : 0,
            transition: isZooming
              ? `opacity 0.52s ease-in ${(ZOOM_MS * 0.52) / 1000}s`
              : "opacity 0.15s ease-out",
          }}
        />

        {/* ── Cloud scene ── */}
        <CloudTransitionScene
          active={phase === "clouds"}
          linger={phase === "linger" || phase === "reveal"}
        />

        {/* ── White overlay ── fades IN during reveal, fades OUT during fadeout */}
        <motion.div
          className="absolute inset-0 bg-white"
          initial={{ opacity: 0 }}
          animate={{ opacity: phase === "reveal" ? 1 : 0 }}
          transition={{
            duration: phase === "reveal" ? REVEAL_MS / 1000 : FADEOUT_MS / 1000,
            ease: phase === "reveal" ? "easeIn" : "easeOut",
          }}
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
