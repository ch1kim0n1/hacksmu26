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
  startDashboardTransition: (globeRect: GlobeRect) => void;
};

const SceneTransitionContext = createContext<SceneTransitionContextValue | null>(null);

const DASHBOARD_ROUTE = "/dashboard";
const ZOOM_MS   = 1400;
const CLOUD_MS  = 1800;
const REVEAL_MS = 600;

export function SceneTransitionProvider({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  const router   = useRouter();
  const pathname = usePathname();

  const [isTransitioning, setIsTransitioning] = useState(false);
  const [phase, setPhase] = useState<"idle" | "zoom" | "clouds" | "reveal">("idle");

  const timeoutsRef             = useRef<number[]>([]);
  const startTimeRef            = useRef(0);
  const hasNavigatedRef         = useRef(false);
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
    const elapsed   = performance.now() - startTimeRef.current;
    const remaining = Math.max(220, ZOOM_MS + CLOUD_MS - elapsed);

    timeoutsRef.current.push(
      window.setTimeout(() => {
        setPhase("reveal");
        timeoutsRef.current.push(
          window.setTimeout(() => {
            setPhase("idle");
            setIsTransitioning(false);
            hasNavigatedRef.current = false;
            cloudRevealScheduledRef.current = false;
          }, REVEAL_MS)
        );
      }, remaining)
    );
  }, [isTransitioning, pathname, phase]);

  const startDashboardTransition = useCallback(
    (_globeRect: GlobeRect) => {
      if (isTransitioning) return;

      clearTimers();
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

  return (
    <SceneTransitionContext.Provider value={contextValue}>
      {children}

      <div
        className={`pointer-events-none fixed inset-0 z-[200] ${
          phase === "idle" ? "invisible" : "visible"
        }`}
        aria-hidden="true"
      >
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
