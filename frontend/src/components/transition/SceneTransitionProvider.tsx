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
  startDashboardTransition: (
    globeRect: GlobeRect,
    globeSnapshotUrl?: string
  ) => void;
};

const SceneTransitionContext = createContext<SceneTransitionContextValue | null>(
  null
);

const DASHBOARD_ROUTE = "/dashboard";
const ZOOM_MS = 620;
const CLOUD_MS = 260;
const REVEAL_MS = 380;

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

      <div
        className={`pointer-events-none fixed inset-0 z-[200] overflow-hidden ${
          phase === "idle" ? "invisible" : "visible"
        }`}
        aria-hidden="true"
      >
        <div
          className={`absolute inset-0 bg-[#07101d] transition-opacity duration-300 ${
            phase === "zoom" ? "opacity-0" : "opacity-100"
          }`}
        />

        {globeRect && (
          <div
            className={`absolute rounded-full bg-[radial-gradient(circle_at_35%_35%,rgba(145,189,255,0.86)_0%,rgba(42,91,177,0.9)_36%,rgba(8,24,54,0.98)_72%,rgba(3,10,24,1)_100%)] shadow-[0_0_80px_rgba(50,104,196,0.22)] transition-[transform,opacity,filter] duration-[620ms] ease-[cubic-bezier(0.22,1,0.36,1)] ${
              phase === "zoom"
                ? "opacity-100 scale-[14] blur-0"
                : "opacity-0 scale-[18] blur-[24px]"
            }`}
            style={{
              ...globeStyle,
              backgroundImage: globeSnapshotUrl
                ? `url(${globeSnapshotUrl})`
                : undefined,
              backgroundPosition: "center",
              backgroundRepeat: "no-repeat",
              backgroundSize: "cover",
            }}
          >
            <div className="absolute inset-0 rounded-full bg-[radial-gradient(circle_at_34%_28%,rgba(255,255,255,0.16)_0%,rgba(255,255,255,0)_36%),radial-gradient(circle_at_52%_58%,rgba(255,255,255,0)_44%,rgba(194,222,255,0.16)_68%,rgba(194,222,255,0)_100%)]" />
          </div>
        )}

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
    throw new Error(
      "useSceneTransition must be used within a SceneTransitionProvider."
    );
  }

  return context;
}
