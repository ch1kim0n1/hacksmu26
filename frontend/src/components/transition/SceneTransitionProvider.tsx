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

type Phase = "idle" | "zoom" | "clouds" | "reveal" | "fadeout";

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
const ZOOM_MS     = 750;   // globe zooms toward viewer
const CLOUD_MS    = 1050;  // falling through clouds
const REVEAL_MS   = 450;   // white fades in over clouds
const FADEOUT_MS  = 650;   // white fades out revealing dashboard

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

  // Once dashboard has loaded during clouds phase, schedule reveal → fadeout
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
        // White fades IN over the cloud scene
        setPhase("reveal");
        timeoutsRef.current.push(
          window.setTimeout(() => {
            // White fades OUT revealing the dashboard underneath
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

      // After zoom, switch to clouds and start navigating
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
        {/* Globe zoom — no background, scales over the landing page */}
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
                ? { scale: 18, opacity: [1, 1, 0] }
                : { scale: 1, opacity: 0 }
            }
            transition={
              isZooming
                ? {
                    duration: ZOOM_MS / 1000,
                    ease: [0.1, 0.0, 0.2, 1.0],
                    opacity: { times: [0, 0.55, 1], duration: ZOOM_MS / 1000 },
                  }
                : { duration: 0.1 }
            }
          />
        )}

        {/* Falling-through-clouds scene */}
        <CloudTransitionScene active={phase === "clouds"} />

        {/* White overlay — fades IN on reveal, fades OUT on fadeout over the dashboard */}
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
