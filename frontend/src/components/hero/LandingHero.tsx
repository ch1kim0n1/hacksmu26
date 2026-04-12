"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import Image from "next/image";
import HeroGlobe from "@/components/hero/HeroGlobe";
import Header from "@/components/layout/Header";

const DASHBOARD_ROUTE = "/dashboard";
const TRANSITION_MS = 1350;

export default function LandingHero() {
  const router = useRouter();
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [isTransitioning, setIsTransitioning] = useState(false);

  useEffect(() => {
    router.prefetch(DASHBOARD_ROUTE);

    return () => {
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
      }
    };
  }, [router]);

  const handleGlobeClick = () => {
    if (isTransitioning) {
      return;
    }

    setIsTransitioning(true);
    timeoutRef.current = setTimeout(() => {
      router.push(DASHBOARD_ROUTE);
    }, TRANSITION_MS);
  };

  return (
    <section className="relative min-h-screen overflow-hidden bg-[#d8ccb9] text-white">
      <Header variant="overlay" />

      <div
        className={`absolute inset-0 z-0 transform-gpu transition-all duration-[1200ms] ease-[cubic-bezier(0.22,1,0.36,1)] ${
          isTransitioning ? "scale-[1.04] blur-[6px]" : "scale-100 blur-0"
        }`}
      >
        <div className="absolute inset-0 bg-[linear-gradient(180deg,#e9dfcf_0%,#d9c7ac_38%,#ccb08a_100%)]" />
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_52%_26%,rgba(255,250,240,0.68),transparent_24%),radial-gradient(circle_at_78%_36%,rgba(255,240,204,0.26),transparent_20%),radial-gradient(circle_at_18%_18%,rgba(128,95,52,0.16),transparent_18%)]" />
        <div className="absolute inset-0 bg-[linear-gradient(180deg,rgba(255,255,255,0.16)_0%,rgba(255,255,255,0)_20%,rgba(123,89,49,0.08)_62%,rgba(88,61,32,0.14)_100%)]" />
      </div>

      <div
        className={`absolute inset-0 z-[1] bg-[radial-gradient(circle_at_80%_26%,rgba(255,255,255,0.16),transparent_16%),linear-gradient(180deg,rgba(255,255,255,0.08)_0%,rgba(255,255,255,0)_24%,rgba(95,64,31,0.08)_100%)] transition-opacity duration-[900ms] ${
          isTransitioning ? "opacity-35" : "opacity-100"
        }`}
      />
      <div
        className={`absolute inset-x-0 bottom-0 z-[2] h-[32vh] bg-[linear-gradient(180deg,rgba(208,177,124,0)_0%,rgba(198,161,104,0.14)_40%,rgba(132,96,48,0.22)_100%)] transition-opacity duration-[900ms] ${
          isTransitioning ? "opacity-30" : "opacity-100"
        }`}
      />

      <div className="pointer-events-none absolute inset-x-0 top-16 z-[11] flex items-center justify-end px-5 pt-3 text-[10px] uppercase tracking-[0.28em] text-[#5d4a34] sm:px-8 md:px-12 lg:px-16">
        <div className="hidden text-right leading-relaxed sm:block">
          Cinematic Wildlife
          <br />
          Globe Study
        </div>
      </div>

      <div
        className={`absolute inset-0 z-[3] transform-gpu transition-all duration-[1250ms] ease-[cubic-bezier(0.22,1,0.36,1)] ${
          isTransitioning ? "scale-[1.02] opacity-70 blur-[2px]" : "scale-100 opacity-100 blur-0"
        }`}
      >
        <div className="absolute bottom-[-1vh] left-[-2vw] h-[58vh] w-[44vw] min-w-[420px] max-w-[760px] sm:bottom-[-1vh] sm:left-[-1vw] sm:h-[60vh] sm:w-[42vw] lg:bottom-0 lg:left-[0vw] lg:h-[62vh] lg:w-[40vw] lg:max-w-[780px]">
          <Image
            src="/elephant-background.png"
            alt="Elephant holding the globe on its trunk"
            fill
            priority
            className="object-contain object-left-bottom drop-shadow-[0_28px_38px_rgba(67,43,16,0.18)]"
            sizes="(min-width: 1024px) 40vw, 44vw"
          />
        </div>

        <button
          type="button"
          onClick={handleGlobeClick}
          disabled={isTransitioning}
          aria-label="Enter EchoField dashboard"
          className={`pointer-events-auto absolute left-[49%] top-[34%] h-[clamp(220px,28vw,420px)] w-[clamp(220px,28vw,420px)] -translate-x-1/2 -translate-y-1/2 transform-gpu rounded-full transition-all duration-[1250ms] ease-[cubic-bezier(0.22,1,0.36,1)] ${
              isTransitioning
                ? "z-[20] scale-[3.4] opacity-0"
                : "z-[10] scale-100 opacity-100 hover:scale-[1.03]"
            } ${isTransitioning ? "cursor-default" : "cursor-pointer"}`}
        >
          <div className="absolute inset-[-8%] rounded-full bg-[radial-gradient(circle,rgba(82,138,238,0.18)_0%,rgba(82,138,238,0.08)_36%,rgba(82,138,238,0)_72%)] blur-xl" />
          <div className="absolute inset-0 rounded-full shadow-[0_18px_34px_rgba(40,48,71,0.16)]" />
          <HeroGlobe
            wrapperClassName="absolute inset-0 z-[1] overflow-visible"
            globeClassName="absolute inset-0"
            showSceneBackdrop={false}
            showGrid={false}
            showGlow={false}
            sceneOptions={{
              backgroundColor: "rgba(0,0,0,0)",
              showStars: false,
              atmosphereColor: "#4f7fc4",
              atmosphereAltitude: 0.1,
              idleRotationSpeed: 0.03,
              cameraPosition: { x: 0, y: 8, z: 242 },
              controls: { minDistance: 180, maxDistance: 280 },
            }}
          />
        </button>
      </div>

      <div className="pointer-events-none absolute right-[5vw] top-[26%] z-[8] hidden max-w-[24rem] rounded-[2rem] border border-[#b59a76]/26 bg-white/24 p-6 text-[#4e3b28] shadow-[0_24px_50px_rgba(125,98,63,0.12)] backdrop-blur-md lg:block">
        <p className="text-[11px] font-semibold uppercase tracking-[0.34em] text-[#7b6246]">
          Mission Statement
        </p>
        <h2 className="mt-4 text-3xl font-semibold leading-tight tracking-[-0.04em] text-[#3f3121]">
          Reveal the intelligence hidden inside every field recording.
        </h2>
        <p className="mt-4 text-sm leading-7 text-[#5d4a34]">
          EchoField helps researchers isolate elephant vocalizations, reduce
          environmental noise, and move from raw capture to meaningful acoustic
          insight with clarity, speed, and confidence.
        </p>
      </div>

      <div
        className={`pointer-events-none absolute inset-0 z-[30] bg-[radial-gradient(circle_at_center,rgba(25,54,104,0.28)_0%,rgba(12,25,49,0.72)_42%,rgba(5,10,20,0.96)_100%)] transition-opacity duration-[1100ms] ease-out ${
          isTransitioning ? "opacity-100" : "opacity-0"
        }`}
      />
      <div
        className={`pointer-events-none absolute inset-0 z-[31] bg-[#07101d] transition-opacity duration-[1350ms] ease-out ${
          isTransitioning ? "opacity-100" : "opacity-0"
        }`}
      />

      <div className="pointer-events-none absolute inset-x-0 bottom-0 z-[5] flex justify-end px-5 pb-5 sm:px-8 md:px-12 lg:px-16">
        <div className="h-7 w-7 rotate-45 rounded-[0.4rem] border border-white/28 bg-white/14 backdrop-blur-sm" />
      </div>
    </section>
  );
}
