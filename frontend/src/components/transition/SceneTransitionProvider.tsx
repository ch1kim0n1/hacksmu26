"use client";

import { AnimatePresence, motion } from "framer-motion";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
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
const ZOOM_MS = 500;
const CLOUD_MS = 760;
const REVEAL_MS = 320;

export function SceneTransitionProvider({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  const router = useRouter();
  const pathname = usePathname();
  const [isTransitioning, setIsTransitioning] = useState(false);
  const [phase, setPhase] = useState<"idle" | "zoom" | "clouds" | "reveal">(
    "idle"
  );
  const [globeRect, setGlobeRect] = useState<GlobeRect | null>(null);
  const [globeSnapshotUrl, setGlobeSnapshotUrl] = useState<string | null>(null);
  const timeoutsRef = useRef<number[]>([]);
  const startTimeRef = useRef(0);
  const hasNavigatedRef = useRef(false);
  const cloudRevealScheduledRef = useRef(false);

  const clearTimers = useCallback(() => {
    timeoutsRef.current.forEach((timeout) => window.clearTimeout(timeout));
    timeoutsRef.current = [];
  }, []);

  useEffect(() => {
    router.prefetch(DASHBOARD_ROUTE);
  }, [router]);

  useEffect(() => {
    return () => {
      clearTimers();
    };
  }, [clearTimers]);

  useEffect(() => {
    if (
      !isTransitioning ||
      phase !== "clouds" ||
      pathname !== DASHBOARD_ROUTE ||
      cloudRevealScheduledRef.current
    ) {
      return;
    }

    cloudRevealScheduledRef.current = true;
    const elapsed = performance.now() - startTimeRef.current;
    const remainingCloudTime = Math.max(80, ZOOM_MS + CLOUD_MS - elapsed);

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
      if (isTransitioning) {
        return;
      }

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
    () => ({
      isTransitioning,
      startDashboardTransition,
    }),
    [isTransitioning, startDashboardTransition]
  );

  const globeStyle =
    globeRect == null
      ? undefined
      : ({
          left: `${globeRect.left}px`,
          top: `${globeRect.top}px`,
          width: `${globeRect.width}px`,
          height: `${globeRect.height}px`,
        } as React.CSSProperties);

  return (
    <SceneTransitionContext.Provider value={contextValue}>
      {children}

      <AnimatePresence>
        {phase !== "idle" && (
          <motion.div
            key="scene-transition-overlay"
            className="pointer-events-none fixed inset-0 z-[200] overflow-hidden"
            aria-hidden="true"
            initial={{ opacity: 1 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.24, ease: [0.22, 1, 0.36, 1] }}
          >
            {globeRect && (
              <motion.div
                className="absolute rounded-full bg-[radial-gradient(circle_at_35%_35%,rgba(145,189,255,0.86)_0%,rgba(42,91,177,0.9)_36%,rgba(8,24,54,0.98)_72%,rgba(3,10,24,1)_100%)] shadow-[0_0_80px_rgba(50,104,196,0.22)]"
                style={{
                  ...globeStyle,
                  backgroundImage: globeSnapshotUrl
                    ? `url(${globeSnapshotUrl})`
                    : undefined,
                  backgroundPosition: "center",
                  backgroundRepeat: "no-repeat",
                  backgroundSize: "cover",
                  willChange: "transform, opacity, filter",
                }}
                initial={{ opacity: 1, scale: 1, filter: "blur(0px)" }}
                animate={
                  phase === "zoom"
                    ? {
                        opacity: 1,
                        scale: 15,
                        filter: "blur(0px)",
                      }
                    : {
                        opacity: 0,
                        scale: 19,
                        filter: "blur(18px)",
                      }
                }
                transition={{
                  duration: ZOOM_MS / 1000,
                  ease: [0.22, 1, 0.36, 1],
                }}
              >
                <motion.div
                  className="absolute inset-0 rounded-full bg-[radial-gradient(circle_at_34%_28%,rgba(255,255,255,0.16)_0%,rgba(255,255,255,0)_36%),radial-gradient(circle_at_52%_58%,rgba(255,255,255,0)_44%,rgba(194,222,255,0.16)_68%,rgba(194,222,255,0)_100%)]"
                  initial={{ opacity: 1 }}
                  animate={{ opacity: phase === "zoom" ? 1 : 0 }}
                  transition={{ duration: 0.16 }}
                />
              </motion.div>
            )}

            {(phase === "clouds" || phase === "reveal") && (
              <CloudTransitionScene phase={phase} />
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </SceneTransitionContext.Provider>
  );
}

export function useSceneTransition() {
  const context = useContext(SceneTransitionContext);

  if (!context) {
    throw new Error(
      "useSceneTransition must be used within a SceneTransitionProvider."
    );
  }

  return context;
}
