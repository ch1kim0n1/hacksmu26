"use client";

import Image from "next/image";
import HeroGlobe from "@/components/hero/HeroGlobe";
import Header from "@/components/layout/Header";
import { useSceneTransition } from "@/components/transition/SceneTransitionProvider";

export default function LandingHero() {
  const { isTransitioning, startDashboardTransition } = useSceneTransition();

  const handleGlobeClick = () => {
    if (isTransitioning) {
      return;
    }

    const globe = document.getElementById("landing-globe-trigger");
    const rect = globe?.getBoundingClientRect();
    const globeCanvas = globe?.querySelector("canvas") as HTMLCanvasElement | null;

    if (!rect) {
      return;
    }

    let globeSnapshotUrl: string | undefined;

    if (globeCanvas) {
      try {
        globeSnapshotUrl = globeCanvas.toDataURL("image/png");
      } catch {}
    }

    startDashboardTransition(
      {
        left: rect.left,
        top: rect.top,
        width: rect.width,
        height: rect.height,
      },
      globeSnapshotUrl
    );
  };

  return (
    <section className="relative min-h-screen overflow-hidden bg-[#c5b294] text-white">
      <Header variant="overlay" />

      <div
        className={`absolute inset-0 z-0 transform-gpu transition-all duration-[1200ms] ease-[cubic-bezier(0.22,1,0.36,1)] ${
          isTransitioning ? "scale-[1.04] blur-[6px]" : "scale-100 blur-0"
        }`}
      >
        <div className="absolute inset-0 bg-[linear-gradient(180deg,#dcccb6_0%,#c3ab88_38%,#a8875c_100%)]" />
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_52%_26%,rgba(255,248,236,0.52),transparent_24%),radial-gradient(circle_at_78%_36%,rgba(255,236,196,0.18),transparent_20%),radial-gradient(circle_at_18%_18%,rgba(104,75,38,0.22),transparent_18%)]" />
        <div className="absolute inset-0 bg-[linear-gradient(180deg,rgba(255,255,255,0.1)_0%,rgba(255,255,255,0)_18%,rgba(103,73,37,0.14)_62%,rgba(55,37,18,0.28)_100%)]" />
        <Image
          src="/background_texture.jpg"
          alt=""
          fill
          priority
          className="pointer-events-none object-cover opacity-[0.3] mix-blend-multiply"
          sizes="100vw"
        />
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_20%_24%,rgba(255,255,255,0.16),transparent_22%),radial-gradient(circle_at_72%_32%,rgba(255,255,255,0.1),transparent_18%),radial-gradient(circle_at_48%_68%,rgba(162,121,64,0.18),transparent_24%)]" />
      </div>

      <div
        className={`absolute inset-0 z-[1] bg-[radial-gradient(circle_at_80%_26%,rgba(255,255,255,0.12),transparent_16%),linear-gradient(180deg,rgba(255,255,255,0.05)_0%,rgba(255,255,255,0)_24%,rgba(76,50,24,0.14)_100%)] transition-opacity duration-[900ms] ${
          isTransitioning ? "opacity-35" : "opacity-100"
        }`}
      />
      <div
        className={`absolute inset-x-0 bottom-0 z-[2] h-[32vh] bg-[linear-gradient(180deg,rgba(208,177,124,0)_0%,rgba(167,130,78,0.16)_40%,rgba(90,61,27,0.3)_100%)] transition-opacity duration-[900ms] ${
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
          id="landing-globe-trigger"
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
      </div>

    </section>
  );
}
