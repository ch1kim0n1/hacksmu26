"use client";

import { useEffect, useRef } from "react";

type HeroGlobeProps = {
  wrapperClassName?: string;
  globeClassName?: string;
  showSceneBackdrop?: boolean;
  showGrid?: boolean;
  showGlow?: boolean;
  sceneOptions?: {
    backgroundColor?: string;
    showStars?: boolean;
    atmosphereColor?: string;
    atmosphereAltitude?: number;
    idleRotationSpeed?: number;
    cameraPosition?: { x: number; y: number; z: number };
    controls?: { minDistance: number; maxDistance: number };
    elephantRing?: {
      enabled?: boolean;
      count?: number;
      radiusOffset?: number;
      minScale?: number;
      maxScale?: number;
      walkFrameRate?: number;
      opacity?: number;
    };
  };
};

export default function HeroGlobe({
  wrapperClassName = "absolute inset-0 z-[1] overflow-hidden",
  globeClassName = "absolute left-1/2 top-[53%] h-[135vh] w-[135vh] min-h-[920px] min-w-[920px] -translate-x-1/2 -translate-y-1/2 md:h-[122vh] md:w-[122vh] lg:top-[52%]",
  showSceneBackdrop = true,
  showGrid = true,
  showGlow = true,
  sceneOptions,
}: HeroGlobeProps) {
  const globeRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const globeContainer = globeRef.current;
    let isDisposed = false;
    let frameId = 0;
    let sceneCleanup = () => {};

    if (!globeContainer) {
      return;
    }

    const globeSceneModulePromise = import("@/lib/hero-globe-scene.js");

    const preloadEarthTexture = async () => {
      const { EARTH_TEXTURE_URL } = await globeSceneModulePromise;
      const image = new window.Image();
      image.decoding = "async";
      image.setAttribute("fetchpriority", "high");
      image.src = EARTH_TEXTURE_URL;

      try {
        await image.decode?.();
      } catch {}
    };

    void preloadEarthTexture();

    void globeSceneModulePromise.then(({ HeroGlobeScene }) => {
      if (isDisposed) {
        return;
      }

      const globeScene = new HeroGlobeScene(sceneOptions);
      globeScene.mount(globeContainer);

      const render = () => {
        globeScene.update();
        frameId = window.requestAnimationFrame(render);
      };

      const handleResize = () => {
        globeScene.resize();
      };

      render();
      window.addEventListener("resize", handleResize);

      sceneCleanup = () => {
        window.cancelAnimationFrame(frameId);
        window.removeEventListener("resize", handleResize);
        globeScene.destroy();
      };
    });

    return () => {
      isDisposed = true;
      sceneCleanup();
    };
  }, [sceneOptions]);

  return (
    <div className={wrapperClassName}>
      {showSceneBackdrop && (
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_50%_38%,rgba(77,163,255,0.24),transparent_26%),radial-gradient(circle_at_18%_18%,rgba(60,90,160,0.2),transparent_22%),radial-gradient(circle_at_84%_14%,rgba(37,99,235,0.12),transparent_18%),linear-gradient(180deg,#081120_0%,#040814_58%,#020307_100%)]" />
      )}
      {showGrid && (
        <div className="absolute inset-0 opacity-[0.16] [background-image:linear-gradient(rgba(142,180,255,0.18)_1px,transparent_1px),linear-gradient(90deg,rgba(142,180,255,0.18)_1px,transparent_1px)] [background-size:72px_72px]" />
      )}
      {showSceneBackdrop && (
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_center,rgba(7,15,28,0)_24%,rgba(2,3,7,0.22)_60%,rgba(2,3,7,0.7)_100%)]" />
      )}
      <div
        ref={globeRef}
        className={globeClassName}
        aria-label="3D globe background"
      />
      {showGlow && (
        <div className="absolute left-1/2 top-[51%] h-[56rem] w-[56rem] -translate-x-1/2 -translate-y-1/2 rounded-full bg-[radial-gradient(circle,rgba(71,138,255,0.28)_0%,rgba(71,138,255,0.12)_36%,rgba(71,138,255,0)_70%)] blur-3xl" />
      )}
    </div>
  );
}
