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
        <Image
          src="/background_texture.jpg"
          alt=""
          fill
          priority
          className="pointer-events-none object-cover opacity-[0.3] mix-blend-multiply"
          sizes="100vw"
        />
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_20%_24%,rgba(255,255,255,0.22),transparent_22%),radial-gradient(circle_at_72%_32%,rgba(255,255,255,0.16),transparent_18%),radial-gradient(circle_at_48%_68%,rgba(196,156,92,0.14),transparent_24%)]" />
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

      <div
        className={`absolute inset-0 z-[3] transform-gpu transition-all duration-[1250ms] ease-[cubic-bezier(0.22,1,0.36,1)] ${
          isTransitioning ? "scale-[1.02] opacity-70 blur-[2px]" : "scale-100 opacity-100 blur-0"
        }`}
      >
        <div className="absolute bottom-[-1vh] left-[-3vw] h-[68vh] w-[50vw] min-w-[520px] max-w-[900px] sm:bottom-[-1vh] sm:left-[-2vw] sm:h-[70vh] sm:w-[48vw] lg:bottom-0 lg:left-[-1vw] lg:h-[72vh] lg:w-[46vw] lg:max-w-[940px]">
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
          className={`pointer-events-auto absolute left-[49%] top-[41%] h-[clamp(280px,34vw,500px)] w-[clamp(280px,34vw,500px)] -translate-x-1/2 -translate-y-1/2 transform-gpu rounded-full transition-all duration-[1250ms] ease-[cubic-bezier(0.22,1,0.36,1)] ${
              isTransitioning
                ? "z-[20] scale-[3.4] opacity-0"
                : "z-[10] scale-100 opacity-100 hover:scale-[1.03]"
            } ${isTransitioning ? "cursor-default" : "cursor-pointer"}`}
        >
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
              cameraPosition: { x: 0, y: 8, z: 248 },
              controls: { minDistance: 180, maxDistance: 280 },
            }}
          />
        </button>
      </div>

      <div className="pointer-events-none absolute right-[4vw] top-[31%] z-[8] hidden max-w-[28rem] px-7 py-7 text-[#4e3b28] lg:block">
        <p className="font-[Arial] text-sm font-semibold uppercase tracking-[0.28em] text-[#7b6246] underline underline-offset-[6px]">
          Mission Statement
        </p>
        <h2 className="mt-4 text-[2.15rem] font-bold leading-tight tracking-[-0.04em] text-[#3f3121]">
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
    </section>
  );
}
