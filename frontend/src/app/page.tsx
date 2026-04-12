"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import Image from "next/image";
import gsap from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import HeroGlobe from "@/components/hero/HeroGlobe";
import { useSceneTransition } from "@/components/transition/SceneTransitionProvider";
import ImpactDashboard from "@/components/research/ImpactDashboard";

const landingNavItems = [
  { href: "/upload", label: "Upload" },
  { href: "/recordings", label: "Recordings" },
  { href: "/database", label: "Database" },
  { href: "#get-started", label: "Get Started" },
] as const;

/* ────────────────────────────────────────────
   Animated counter (counts up on scroll)
   ──────────────────────────────────────────── */
function Counter({
  target,
  suffix = "",
  prefix = "",
}: {
  target: number;
  suffix?: string;
  prefix?: string;
}) {
  const [count, setCount] = useState(0);
  const ref = useRef<HTMLSpanElement>(null);
  const started = useRef(false);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const obs = new IntersectionObserver(
      ([e]) => {
        if (e.isIntersecting && !started.current) {
          started.current = true;
          const t0 = performance.now();
          const dur = 2200;
          const tick = (now: number) => {
            const p = Math.min((now - t0) / dur, 1);
            const ease = 1 - Math.pow(1 - p, 3);
            setCount(Math.round(target * ease));
            if (p < 1) requestAnimationFrame(tick);
          };
          requestAnimationFrame(tick);
        }
      },
      { threshold: 0.3 }
    );
    obs.observe(el);
    return () => obs.disconnect();
  }, [target]);

  return (
    <span ref={ref}>
      {prefix}
      {count.toLocaleString()}
      {suffix}
    </span>
  );
}

/* ────────────────────────────────────────────
   SVG Wave Divider — smooth section transitions
   ──────────────────────────────────────────── */
function WaveDivider({
  topColor,
  bottomColor,
  variant = 1,
}: {
  topColor: string;
  bottomColor: string;
  variant?: 1 | 2 | 3 | 4;
}) {
  const paths: Record<number, string> = {
    1: "M0,0 L1440,0 L1440,30 C1200,110 900,10 600,60 C300,110 120,40 0,80 L0,0 Z",
    2: "M0,0 L1440,0 L1440,50 Q1200,0 960,40 Q720,80 480,30 Q240,-10 0,50 L0,0 Z",
    3: "M0,0 L1440,0 L1440,45 C1320,90 1080,15 840,55 C600,95 360,20 0,65 L0,0 Z",
    4: "M0,0 L1440,0 L1440,35 Q1080,100 720,40 Q360,-20 0,60 L0,0 Z",
  };

  return (
    <div className="wave-divider" style={{ background: bottomColor, marginTop: "-1px", marginBottom: "-6px", position: "relative", zIndex: 2 }}>
      <svg
        viewBox="0 0 1440 120"
        preserveAspectRatio="none"
        aria-hidden="true"
      >
        <path d={paths[variant]} fill={topColor} />
      </svg>
    </div>
  );
}

/* ────────────────────────────────────────────
   Main Landing Page
   ──────────────────────────────────────────── */
export default function LandingPage() {
  const { isTransitioning, startDashboardTransition } = useSceneTransition();
  const [isGlobeActivated, setIsGlobeActivated] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const heroRef = useRef<HTMLElement>(null);
  const crisisRef = useRef<HTMLElement>(null);
  const threatsRef = useRef<HTMLElement>(null);
  const voiceRef = useRef<HTMLElement>(null);
  const solutionRef = useRef<HTMLElement>(null);
  const stepsRef = useRef<HTMLElement>(null);
  const ctaRef = useRef<HTMLElement>(null);
  const teamRef = useRef<HTMLElement>(null);


  /* ── GSAP orchestration ── */
  useEffect(() => {
    gsap.registerPlugin(ScrollTrigger);

    const ctx = gsap.context(() => {
      /* ═══ HERO INTRO ═══ */
      const hero = gsap.timeline({ defaults: { ease: "power3.out" } });
      hero
        .from("[data-nav]", { y: -50, opacity: 0, duration: 0.8 })
        .from("[data-scroll-ind]", { opacity: 0, y: -10, duration: 0.4 }, "-=0.2");

      /* nav fades from transparent to solid as the hero scrolls away */
      gsap.set("[data-nav]", {
        backgroundColor: "rgba(44,41,38,0)",
        backdropFilter: "blur(0px)",
        borderBottomColor: "rgba(255,255,255,0)",
      });
      gsap.set("[data-nav-brand]", {
        color: "#3f3121",
      });
      gsap.set("[data-nav-link]", {
        color: "#4b3520",
      });
      gsap.set("[data-nav-logo]", {
        filter: "brightness(0) saturate(100%)",
      });
      gsap.to("[data-nav]", {
        backgroundColor: "rgba(44,41,38,0.92)",
        backdropFilter: "blur(16px)",
        borderBottomColor: "rgba(255,255,255,0.1)",
        ease: "none",
        scrollTrigger: {
          trigger: heroRef.current,
          start: "top top",
          end: "+=180",
          scrub: true,
        },
      });
      gsap.to("[data-nav-brand]", {
        color: "#F7F3EA",
        ease: "none",
        scrollTrigger: {
          trigger: heroRef.current,
          start: "top top",
          end: "+=180",
          scrub: true,
        },
      });
      gsap.to("[data-nav-link]", {
        color: "#F2EADD",
        ease: "none",
        scrollTrigger: {
          trigger: heroRef.current,
          start: "top top",
          end: "+=180",
          scrub: true,
        },
      });
      gsap.to("[data-nav-logo]", {
        filter: "brightness(1) saturate(100%)",
        ease: "none",
        scrollTrigger: {
          trigger: heroRef.current,
          start: "top top",
          end: "+=180",
          scrub: true,
        },
      });

      /* scroll indicator bounce */
      gsap.to("[data-scroll-ind]", {
        y: 10,
        duration: 1.4,
        ease: "sine.inOut",
        yoyo: true,
        repeat: -1,
      });

      /* ═══ CRISIS — scrub-driven stat entrance ═══ */
      gsap.from("[data-crisis-label]", {
        x: -60,
        opacity: 0,
        duration: 0.6,
        scrollTrigger: { trigger: crisisRef.current, start: "top 85%" },
      });
      gsap.from("[data-crisis-title]", {
        y: 60,
        opacity: 0,
        duration: 0.8,
        scrollTrigger: { trigger: crisisRef.current, start: "top 80%" },
      });

      /* Stats: scrub-based scale + fade for dramatic entrance */
      gsap.utils.toArray<HTMLElement>("[data-crisis-stat]").forEach((el, i) => {
        gsap.from(el, {
          y: 80,
          opacity: 0,
          scale: 0.8,
          duration: 0.7,
          delay: i * 0.12,
          ease: "power3.out",
          scrollTrigger: {
            trigger: "[data-crisis-stats]",
            start: "top 88%",
          },
        });
      });

      /* ═══ THREATS — 3D card entrance ═══ */
      gsap.from("[data-threat-title]", {
        y: 40,
        opacity: 0,
        duration: 0.7,
        scrollTrigger: { trigger: threatsRef.current, start: "top 80%" },
      });

      gsap.utils.toArray<HTMLElement>("[data-threat-card]").forEach((card, i) => {
        gsap.from(card, {
          y: 80,
          opacity: 0,
          scale: 0.82,
          duration: 0.75,
          delay: i * 0.12,
          ease: "back.out(1.8)",
          scrollTrigger: {
            trigger: card,
            start: "top 90%",
          },
        });
      });

      /* Background decorative shapes float in */
      gsap.utils.toArray<HTMLElement>("[data-threat-deco]").forEach((el, i) => {
        gsap.from(el, {
          scale: 0,
          opacity: 0,
          rotation: -45,
          duration: 1.2,
          delay: 0.3 + i * 0.2,
          ease: "power4.out",
          scrollTrigger: { trigger: threatsRef.current, start: "top 75%" },
        });
        /* Continuous float */
        gsap.to(el, {
          y: -15 + Math.random() * 30,
          x: -10 + Math.random() * 20,
          duration: 3 + Math.random() * 2,
          ease: "sine.inOut",
          yoyo: true,
          repeat: -1,
        });
      });

      /* ═══ VOICE — wave drawing with scrub ═══ */
      const voiceTl = gsap.timeline({
        scrollTrigger: { trigger: voiceRef.current, start: "top 70%" },
      });
      voiceTl
        .from("[data-voice-title]", { y: 40, opacity: 0, duration: 0.6 })
        .from("[data-voice-text]", {
          y: 25,
          opacity: 0,
          stagger: 0.1,
          duration: 0.5,
        }, "-=0.3")
        .from("[data-voice-visual]", {
          scale: 0.85,
          opacity: 0,
          duration: 0.8,
        }, "-=0.4");

      /* Wave lines scrub animation — stroke draws on as you scroll */
      gsap.utils.toArray<SVGPathElement>("[data-voice-wave]").forEach((path) => {
        const length = path.getTotalLength?.() || 400;
        gsap.set(path, { strokeDasharray: length, strokeDashoffset: length });
        gsap.to(path, {
          strokeDashoffset: 0,
          ease: "none",
          scrollTrigger: {
            trigger: voiceRef.current,
            start: "top 60%",
            end: "bottom 70%",
            scrub: 1.5,
          },
        });
      });

      /* Continuous wave oscillation */
      gsap.to("[data-wave-line]", {
        y: 8,
        duration: 2,
        ease: "sine.inOut",
        yoyo: true,
        repeat: -1,
        stagger: 0.25,
      });

      /* ═══ SOLUTION — slide in from sides ═══ */
      gsap.from("[data-sol-left]", {
        x: -80,
        opacity: 0,
        duration: 1,
        ease: "power2.out",
        scrollTrigger: { trigger: solutionRef.current, start: "top 75%" },
      });
      gsap.from("[data-sol-right]", {
        x: 80,
        opacity: 0,
        duration: 1,
        ease: "power2.out",
        scrollTrigger: { trigger: solutionRef.current, start: "top 75%" },
      });

      /* Spectrogram scanning line */
      gsap.fromTo(
        "[data-scan-line]",
        { left: "5%" },
        {
          left: "95%",
          ease: "none",
          scrollTrigger: {
            trigger: solutionRef.current,
            start: "top 60%",
            end: "bottom 60%",
            scrub: 2,
          },
        }
      );

      /* Feature items stagger in */
      gsap.from("[data-sol-feature]", {
        x: 30,
        opacity: 0,
        stagger: 0.12,
        duration: 0.5,
        scrollTrigger: { trigger: "[data-sol-features]", start: "top 85%" },
      });

      /* ═══ STEPS — dramatic stagger with scale ═══ */
      gsap.utils.toArray<HTMLElement>("[data-step-card]").forEach((card, i) => {
        gsap.from(card, {
          y: 80,
          opacity: 0,
          scale: 0.85,
          rotateY: i % 2 === 0 ? -8 : 8,
          duration: 0.8,
          delay: i * 0.2,
          ease: "power3.out",
          scrollTrigger: {
            trigger: stepsRef.current,
            start: "top 75%",
          },
        });
      });

      /* Step connector lines draw on */
      gsap.from("[data-step-line]", {
        scaleX: 0,
        transformOrigin: "left center",
        stagger: 0.2,
        duration: 0.8,
        ease: "power2.inOut",
        scrollTrigger: { trigger: stepsRef.current, start: "top 65%" },
      });

      /* Step numbers count up */
      gsap.from("[data-step-num]", {
        scale: 0,
        opacity: 0,
        stagger: 0.15,
        duration: 0.6,
        ease: "power4.out",
        scrollTrigger: { trigger: stepsRef.current, start: "top 70%" },
      });

      /* ═══ CTA — expanding rings + content rise ═══ */
      gsap.from("[data-cta-inner]", {
        y: 60,
        opacity: 0,
        scale: 0.95,
        duration: 1,
        ease: "power2.out",
        scrollTrigger: { trigger: ctaRef.current, start: "top 80%" },
      });

      /* CTA background rings expand with scrub */
      gsap.utils.toArray<HTMLElement>("[data-cta-ring]").forEach((ring, i) => {
        gsap.from(ring, {
          scale: 0.3,
          opacity: 0,
          duration: 1.2,
          delay: i * 0.15,
          ease: "power1.out",
          scrollTrigger: {
            trigger: ctaRef.current,
            start: "top 85%",
          },
        });
      });

      /* ═══ TEAM — staggered card entrance ═══ */
      gsap.from("[data-team-label]", {
        y: 30,
        opacity: 0,
        duration: 0.7,
        scrollTrigger: { trigger: teamRef.current, start: "top 85%" },
      });
      gsap.from("[data-team-desc]", {
        y: 20,
        opacity: 0,
        duration: 0.6,
        delay: 0.15,
        scrollTrigger: { trigger: teamRef.current, start: "top 85%" },
      });

      gsap.utils.toArray<HTMLElement>("[data-team-card]").forEach((card, i) => {
        gsap.from(card, {
          y: 50,
          opacity: 0,
          scale: 0.9,
          duration: 0.7,
          delay: 0.1 + i * 0.12,
          ease: "back.out(1.4)",
          scrollTrigger: {
            trigger: teamRef.current,
            start: "top 78%",
          },
        });
      });

      /* Team divider line draws on */
      gsap.from("[data-team-divider]", {
        scaleX: 0,
        transformOrigin: "center center",
        duration: 1,
        ease: "power2.inOut",
        scrollTrigger: { trigger: teamRef.current, start: "top 75%" },
      });

      /* ElephantVoices badge */
      gsap.from("[data-ev-badge]", {
        y: 30,
        opacity: 0,
        duration: 0.8,
        ease: "power2.out",
        scrollTrigger: { trigger: "[data-ev-badge]", start: "top 90%" },
      });
    }, containerRef);

    return () => ctx.revert();
  }, []);

  return (
    <div ref={containerRef} className="landing-page">
      {/* ═══════════════════════════════════════════
          NAV
         ═══════════════════════════════════════════ */}
      <nav
        data-nav
        className="fixed top-0 left-0 right-0 z-50 border-b border-transparent bg-transparent"
      >
          <div className="flex w-full items-center gap-6 px-3 py-4 sm:px-4 lg:px-5">
            <Link href="/" className="flex items-center gap-2">
            <div className="flex h-[72px] w-[72px] items-center justify-center overflow-hidden">
              <Image
                src="/logo.png"
                alt="EchoField logo"
                width={72}
                height={72}
                className="scale-[1.35] object-contain brightness-0 opacity-90"
                data-nav-logo
              />
            </div>
            <span className="text-[2.35rem] font-display font-semibold leading-none text-[#3f3121] sm:text-[2.6rem]" data-nav-brand>EchoField</span>
          </Link>

          <div className="ml-auto flex items-center gap-2 sm:gap-3">
            {landingNavItems.map((item) => (
              <Link
                key={item.label}
                href={item.href}
                data-nav-link
                className={`rounded-full px-3 py-2 text-sm font-medium tracking-[0.02em] transition-all duration-300 sm:px-4 ${
                  item.label === "Get Started"
                    ? "border border-[#4b3520]/25 bg-white/20 text-[#3f3121] shadow-[0_10px_24px_rgba(75,53,32,0.08)] hover:border-white/70 hover:bg-white/24 hover:text-white"
                    : "text-[#4b3520] hover:text-white"
                }`}
              >
                {item.label}
              </Link>
            ))}
          </div>

        </div>
      </nav>

      {/* ═══════════════════════════════════════════
          HERO — Globe
         ═══════════════════════════════════════════ */}
      <section
        ref={heroRef}
        className={`relative min-h-screen bg-[#c5b294] text-white ${isTransitioning ? "overflow-visible" : "overflow-hidden"}`}
      >
        {/* Background layers */}
        <div className="absolute inset-0 z-0">
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

        {/* Light overlays */}
        <div className="absolute inset-0 z-[1] bg-[radial-gradient(circle_at_80%_26%,rgba(255,255,255,0.12),transparent_16%),linear-gradient(180deg,rgba(255,255,255,0.05)_0%,rgba(255,255,255,0)_24%,rgba(76,50,24,0.14)_100%)]" />
        <div className="absolute inset-x-0 bottom-0 z-[2] h-[32vh] bg-[linear-gradient(180deg,rgba(208,177,124,0)_0%,rgba(167,130,78,0.16)_40%,rgba(90,61,27,0.3)_100%)]" />

        {/* Elephant + Globe composition */}
        <div className="absolute inset-0 z-[3]">
          {/* Elephant image */}
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

          {/* Interactive globe */}
            <button
              id="landing-globe-trigger"
              type="button"
              onClick={() => {
                if (isTransitioning) return;
                setIsGlobeActivated(true);
                const el = document.getElementById("landing-globe-trigger");
                const rect = el?.getBoundingClientRect();
                if (!rect) return;
                startDashboardTransition({ left: rect.left, top: rect.top, width: rect.width, height: rect.height });
              }}
            disabled={isTransitioning}
            aria-label="Enter EchoField dashboard"
            className={`pointer-events-auto absolute left-[49%] top-[41%] h-[clamp(280px,34vw,500px)] w-[clamp(280px,34vw,500px)] -translate-x-1/2 -translate-y-1/2 transform-gpu rounded-full transition-transform ease-[cubic-bezier(0.2,0,0.8,1)] ${
              isTransitioning
                ? "z-[250] scale-[22] duration-[2200ms] cursor-default"
                : "z-[10] scale-100 duration-[400ms] hover:scale-[1.03] cursor-pointer"
            }`}
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
            <div className="pointer-events-none absolute inset-0 z-[2] flex items-center justify-center">
              <span className="max-w-[9ch] text-center text-xl font-semibold italic leading-tight tracking-[0.02em] text-white/92 drop-shadow-[0_2px_12px_rgba(18,34,58,0.55)] sm:text-2xl">
                Ready to Listen?
              </span>
            </div>
          </button>
          </div>

          {/* Mission text */}
          <div
            className={`pointer-events-none absolute right-[4vw] top-[31%] z-[8] hidden max-w-[28rem] px-7 py-7 text-[#4e3b28] lg:block ${
              isGlobeActivated ? "invisible opacity-0" : "visible opacity-100"
            }`}
          >
            <p className="font-[Arial] text-sm font-semibold uppercase tracking-[0.28em] text-[#7b6246] underline underline-offset-[6px]">
              Mission Statement
            </p>
          <h2 className="mt-4 text-[2.15rem] font-bold leading-tight tracking-[-0.04em] text-[#3f3121]">
            To give elephants a voice by revealing their hidden language through noise-free sound
          </h2>
        </div>
        {/* Scroll indicator */}
          <div
            data-scroll-ind
            className="absolute bottom-8 left-1/2 -translate-x-1/2 flex flex-col items-center gap-2 z-10"
          >
            <span className="text-[11px] text-[#4b3520]/90 tracking-[0.25em] uppercase font-medium">
              Scroll
            </span>
            <svg className="w-4 h-4 text-[#4b3520]/85" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 14l-7 7m0 0l-7-7" />
            </svg>
          </div>

      </section>

      {/* ═══════════════════════════════════════════
          CRISIS / STATS
         ═══════════════════════════════════════════ */}
      <section
        ref={crisisRef}
        id="crisis"
        className="relative pt-16 pb-20 md:pt-24 md:pb-28"
        style={{
          background:
            "linear-gradient(180deg, #a8875c 0%, #9e6e45 8%, #B0764E 22%, #C4785A 38%, #C48B5A 55%, #C89E60 75%, #C4A46C 100%)",
        }}
      >
        {/* Subtle texture overlay */}
        <div
          className="absolute inset-0 opacity-[0.03]"
          style={{
            backgroundImage:
              "url(\"data:image/svg+xml,%3Csvg viewBox='0 0 256 256' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.7' numOctaves='3' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)'/%3E%3C/svg%3E\")",
          }}
        />

        <div className="relative max-w-7xl mx-auto px-6">
          <div className="mb-14">
            <span data-crisis-label className="text-sm font-semibold text-white/50 tracking-[0.2em] uppercase mb-4 block">
              The Crisis
            </span>
            <h2 data-crisis-title className="text-4xl md:text-5xl lg:text-6xl font-display font-semibold text-white mb-5">
              They&apos;re Disappearing
            </h2>
            <p data-crisis-title className="text-lg text-white/60 max-w-xl">
              African elephant populations have plummeted. Without action, these
              keystone species face extinction within our lifetime.
            </p>
          </div>

          <div
            data-crisis-stats
            className="grid grid-cols-2 md:grid-cols-4 gap-8 md:gap-10"
          >
            {[
              {
                n: 415000,
                label: "Elephants Remaining",
                sub: "Down from 10 million in 1900",
              },
              {
                n: 96,
                suffix: "%",
                label: "Population Lost",
                sub: "In the last century alone",
              },
              {
                n: 20000,
                label: "Killed Each Year",
                sub: "One every 26 minutes",
              },
              {
                n: 10,
                label: "Years to Act",
                sub: "Before irreversible decline",
              },
            ].map((s, i) => (
              <div
                key={i}
                data-crisis-stat
                className="text-center md:text-left"
              >
                <div className="text-4xl md:text-5xl font-display font-bold text-white mb-2">
                  <Counter target={s.n} suffix={s.suffix} />
                </div>
                <div className="text-sm font-semibold text-white/85 mb-1">
                  {s.label}
                </div>
                <div className="text-xs text-white/45">{s.sub}</div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── Wave: Crisis → Threats ── */}
      <WaveDivider topColor="#C4A46C" bottomColor="#F8F5F0" variant={2} />

      {/* ═══════════════════════════════════════════
          THREATS
         ═══════════════════════════════════════════ */}
      <section
        ref={threatsRef}
        className="relative py-20 md:py-28 overflow-hidden"
        style={{
          background: "linear-gradient(180deg, #F8F5F0 0%, #F0EBE3 40%, #EDE7DF 100%)",
        }}
      >
        {/* Background decorative elements */}
        <div className="absolute inset-0 dot-pattern opacity-[0.3]" />

        {/* Floating decorative shapes */}
        <div data-threat-deco className="absolute top-16 right-[10%] w-24 h-24 rounded-full border border-accent-savanna/10" />
        <div data-threat-deco className="absolute top-40 left-[8%] w-16 h-16 rounded-xl border border-nature-sage/10 rotate-12" />
        <div data-threat-deco className="absolute bottom-20 right-[20%] w-20 h-20 rounded-full border border-nature-terracotta/10" />
        <div data-threat-deco className="absolute bottom-32 left-[15%] w-12 h-12 rounded-lg border border-accent-gold/10 -rotate-6" />

        {/* Large background numbers */}
        <div className="absolute top-1/2 -translate-y-1/2 left-0 right-0 flex justify-around pointer-events-none select-none opacity-[0.03]">
          <span className="text-[20rem] font-display font-bold text-ev-charcoal leading-none">01</span>
          <span className="text-[20rem] font-display font-bold text-ev-charcoal leading-none">02</span>
          <span className="text-[20rem] font-display font-bold text-ev-charcoal leading-none">03</span>
        </div>

        <div className="relative max-w-7xl mx-auto px-6">
          <div data-threat-title className="text-center mb-16">
            <span className="text-xs font-semibold text-accent-savanna tracking-[0.28em] uppercase mb-8 block">
              Why This Happens
            </span>
            <h2 className="font-display leading-[1.05] text-ev-charcoal mb-6">
              <span className="block text-[clamp(3.2rem,7vw,6.5rem)] font-light">Three Forces</span>
              <span
                className="block text-[clamp(3rem,6.5vw,6rem)] font-light"
                style={{ WebkitTextStroke: "2px #2C2926", color: "transparent" }}
              >
                of Extinction
              </span>
            </h2>
            <p className="text-ev-elephant max-w-xl mx-auto text-lg leading-relaxed">
              Understanding the threats is the first step to protecting these
              incredible creatures.
            </p>
          </div>

          <div className="grid md:grid-cols-3 gap-8">
            {[
              {
                icon: (
                  <svg className="w-7 h-7" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                  </svg>
                ),
                title: "Poaching for Ivory",
                desc: "The illegal ivory trade drives the slaughter of tens of thousands of elephants each year. Despite international bans, demand persists, fueling organized networks across Africa.",
                stat: "35,000",
                statLabel: "killed annually at peak",
                iconBg: "bg-nature-terracotta/10 text-nature-terracotta",
                tintBg: "bg-nature-terracotta/[0.03]",
                accentColor: "#C4785A",
              },
              {
                icon: (
                  <svg className="w-7 h-7" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" />
                  </svg>
                ),
                title: "Human-Wildlife Conflict",
                desc: "As settlements expand into elephant habitats, deadly confrontations increase. Elephants raid crops, communities retaliate — a cycle that costs lives on both sides.",
                stat: "500+",
                statLabel: "human deaths per year",
                iconBg: "bg-accent-savanna/10 text-accent-savanna",
                tintBg: "bg-accent-savanna/[0.03]",
                accentColor: "#C4A46C",
              },
              {
                icon: (
                  <svg className="w-7 h-7" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M3.055 11H5a2 2 0 012 2v1a2 2 0 002 2 2 2 0 012 2v2.945M8 3.935V5.5A2.5 2.5 0 0010.5 8h.5a2 2 0 012 2 2 2 0 104 0 2 2 0 012-2h1.064M15 20.488V18a2 2 0 012-2h3.064M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                ),
                title: "Habitat Destruction",
                desc: "Deforestation, agriculture, and infrastructure fragment migration corridors. Without connected habitats, populations become isolated and genetically vulnerable.",
                stat: "75%",
                statLabel: "of habitat lost since 1900",
                iconBg: "bg-nature-sage/10 text-nature-deep-sage",
                tintBg: "bg-nature-sage/[0.03]",
                accentColor: "#5A6B4F",
              },
            ].map((t, i) => (
              <div
                key={i}
                data-threat-card
                className={`threat-card relative p-8 rounded-2xl bg-white/80 backdrop-blur-sm border border-ev-sand/60 shadow-sm hover:shadow-2xl transition-all duration-500 group hover:-translate-y-3 ${t.tintBg}`}
                style={{ perspective: "800px" }}
              >
                <div
                  className={`w-14 h-14 rounded-xl ${t.iconBg} flex items-center justify-center mb-6 group-hover:scale-110 transition-transform duration-300`}
                >
                  {t.icon}
                </div>
                <h3 className="text-xl font-bold text-ev-charcoal mb-3">
                  {t.title}
                </h3>
                <p className="text-ev-elephant text-sm leading-relaxed mb-6">
                  {t.desc}
                </p>
                {/* Stat badge */}
                <div className="pt-4 border-t border-ev-cream flex items-baseline gap-2">
                  <span className="text-2xl font-display font-bold" style={{ color: t.accentColor }}>
                    {t.stat}
                  </span>
                  <span className="text-xs text-ev-warm-gray">{t.statLabel}</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── Wave: Threats → Voice ── */}
      <WaveDivider topColor="#EDE7DF" bottomColor="#2C2926" variant={3} />

      {/* ═══════════════════════════════════════════
          THEIR VOICE
         ═══════════════════════════════════════════ */}
      <section
        ref={voiceRef}
        className="relative overflow-hidden bg-[#2f2823] py-24 md:py-32"
      >
        {/* Floating dots */}
        <div className="pointer-events-none absolute inset-0">
          {[
            { left: "6%", top: "34%", size: "10px", opacity: 0.26 },
            { left: "22%", top: "20%", size: "5px", opacity: 0.28 },
            { left: "41%", top: "11%", size: "4px", opacity: 0.2 },
            { left: "52%", top: "17%", size: "3px", opacity: 0.18 },
            { left: "64%", top: "29%", size: "12px", opacity: 0.95 },
            { left: "73%", top: "24%", size: "4px", opacity: 0.22 },
            { left: "85%", top: "14%", size: "3px", opacity: 0.16 },
            { left: "89%", top: "52%", size: "4px", opacity: 0.2 },
            { left: "78%", top: "72%", size: "3px", opacity: 0.18 },
            { left: "92%", top: "88%", size: "4px", opacity: 0.18 },
            { left: "67%", top: "84%", size: "3px", opacity: 0.16 },
          ].map((dot, i) => (
            <div
              key={i}
              className="absolute rounded-full bg-[#f3eadc]"
              style={{
                left: dot.left,
                top: dot.top,
                width: dot.size,
                height: dot.size,
                opacity: dot.opacity,
                animation: `float ${8 + i * 0.7}s ease-in-out ${i * 0.35}s infinite`,
              }}
            />
          ))}
        </div>

        {/* BG waves */}
        <div className="absolute inset-0 opacity-[0.08]">
          <svg
            className="w-full h-full"
            viewBox="0 0 1440 400"
            preserveAspectRatio="none"
          >
            {[0, 1, 2].map((i) => (
              <path
                key={i}
                data-wave-line
                d={`M0 ${230 + i * 22} Q360 ${150 + i * 26} 720 ${215 + i * 18} Q1080 ${285 - i * 18} 1440 ${248 + i * 20}`}
                stroke="#8b7a63"
                strokeWidth={2.5 - i * 0.45}
                fill="none"
              />
            ))}
          </svg>
        </div>

        <div className="relative mx-auto max-w-7xl px-6">
          <div className="grid items-center gap-12 md:grid-cols-[minmax(0,1.35fr)_minmax(320px,0.85fr)] lg:gap-20">
            <div className="max-w-5xl">
              <span
                data-voice-title
                className="mb-5 block text-sm font-semibold uppercase tracking-[0.24em] text-[#d5b171]"
              >
                Their Voice
              </span>
              <h2
                data-voice-title
                className="max-w-6xl text-5xl font-display font-semibold leading-[0.95] text-[#f3eadc] md:text-6xl lg:text-[5.8rem]"
              >
                Communication{" "}
                <span className="text-[#d5b171]">Beyond</span> Human Hearing
              </h2>

              <div className="mt-10 max-w-4xl space-y-8">
                {[
                  "Elephants communicate using infrasound — frequencies below 20\u00A0Hz that travel up to 10\u00A0kilometers through ground and air.",
                  "These calls carry complex social information: warnings, greetings, mating signals, and emotional states we\u2019re only beginning to understand.",
                  "Field recordings capture these vocalizations, but environmental noise — wind, vehicles, aircraft — buries the signals researchers need.",
                ].map((txt, i) => (
                  <p
                    key={i}
                    data-voice-text
                    className="max-w-4xl text-lg leading-relaxed text-[#b7aca0] md:text-[1.05rem]"
                  >
                    {txt}
                  </p>
                ))}
              </div>
            </div>

            {/* Sound-wave visual */}
            <div data-voice-visual className="relative min-h-[280px]">
              <svg
                viewBox="0 0 400 300"
                className="w-full"
                fill="none"
              >
                {/* Scrub-drawn waves */}
                {[0, 1, 2, 3, 4].map((i) => (
                  <path
                    key={i}
                    data-voice-wave
                    d={`M50 ${150} Q125 ${100 - i * 18} 200 ${150} Q275 ${200 + i * 18} 350 ${150}`}
                    stroke="#d5b171"
                    strokeWidth={2.5 - i * 0.35}
                    opacity={0.78 - i * 0.1}
                  />
                ))}
                {/* Background oscillation waves */}
                {[0, 1, 2, 3, 4].map((i) => (
                  <path
                    key={`bg-${i}`}
                    data-wave-line
                    d={`M50 ${150} Q125 ${100 - i * 18} 200 ${150} Q275 ${200 + i * 18} 350 ${150}`}
                    stroke="#d5b171"
                    strokeWidth={2.5 - i * 0.35}
                    opacity={0.12}
                  />
                ))}
                {/* Frequency labels */}
                <text
                  x="200"
                  y="258"
                  textAnchor="middle"
                  fill="#a79888"
                  fontSize="11"
                  fontFamily="var(--font-jakarta)"
                >
                  14 Hz — 120 Hz
                </text>
                <text
                  x="200"
                  y="278"
                  textAnchor="middle"
                  fill="#85786d"
                  fontSize="9"
                  fontFamily="var(--font-jakarta)"
                >
                  Elephant vocalization frequency range
                </text>
              </svg>

              {/* Decorative rings */}
              <div className="absolute right-6 top-5 h-24 w-24 rounded-full border border-[#d5b171]/12" />
              <div className="absolute right-10 top-9 h-14 w-14 rounded-full border border-[#d5b171]/18" />
              <div className="absolute right-[3.15rem] top-[3.2rem] h-4 w-4 rounded-full bg-[#f3eadc]/90" />
            </div>
          </div>
        </div>
      </section>

      {/* ── Wave: Voice → Solution ── */}
      <WaveDivider topColor="#2C2926" bottomColor="#F0EBE3" variant={4} />

      {/* ═══════════════════════════════════════════
          SOLUTION
         ═══════════════════════════════════════════ */}
      <section ref={solutionRef} className="bg-ev-cream py-24 md:py-32">
        <div className="mx-auto max-w-7xl px-6">
          <div className="grid items-center gap-14 md:grid-cols-[minmax(0,1.05fr)_minmax(360px,0.95fr)] lg:gap-24">
            {/* Spectrogram mockup */}
            <div
              data-sol-left
              className="relative overflow-hidden rounded-[1.9rem] bg-[#0b1722] p-1.5 shadow-[0_22px_46px_rgba(16,24,40,0.24),0_48px_90px_rgba(12,33,61,0.14)]"
            >
              <div className="relative overflow-hidden rounded-[1.55rem] bg-gradient-to-br from-[#0d2245] via-[#0e2348] to-[#0d2140]" style={{ paddingBottom: "75%" }}>
                <div className="absolute inset-0 flex">
                  {/* Y-axis labels */}
                  <div className="flex flex-col justify-between py-3 pl-2 pr-1 text-right" style={{ minWidth: "44px" }}>
                    {["500Hz", "200Hz", "100Hz", "50Hz", "20Hz", "0Hz"].map((label) => (
                      <span key={label} className="text-[9px] text-white/30 font-mono leading-none">{label}</span>
                    ))}
                  </div>

                  {/* Main spectrogram area */}
                  <div className="relative flex-1">
                    {/* Legend top-right */}
                    <div className="absolute top-3 right-3 z-10 flex flex-col gap-1.5">
                      {[
                        { label: "aircraft", color: "#3b7fcc" },
                        { label: "wind", color: "#5593d4" },
                        { label: "vocalization", color: "#FFD700" },
                      ].map((item) => (
                        <div key={item.label} className="flex items-center gap-1.5 rounded-md bg-black/40 px-2 py-1 backdrop-blur-sm">
                          <div className="h-[3px] w-5 rounded-full" style={{ background: item.color }} />
                          <span className="text-[9px] text-white/70 font-mono">{item.label}</span>
                        </div>
                      ))}
                    </div>

                    {/* Noise bands */}
                    {[8, 18, 28, 38, 48, 62, 72, 82].map((top, i) => (
                      <div
                        key={i}
                        className="absolute left-0 right-0 h-[2px] bg-[#1d5583]/20"
                        style={{ top: `${top}%`, opacity: 0.12 + (i % 3) * 0.07 }}
                      />
                    ))}
                    {[25, 50, 75].map((left, i) => (
                      <div
                        key={`col-${i}`}
                        className="absolute top-0 bottom-[18%] w-[1px] bg-[#285785]/15"
                        style={{ left: `${left}%` }}
                      />
                    ))}

                    {/* Blurry noise blobs */}
                    <div className="absolute rounded-full blur-2xl" style={{ top: "15%", left: "10%", width: "35%", height: "25%", background: "radial-gradient(circle, rgba(29,85,131,0.35) 0%, transparent 70%)" }} />
                    <div className="absolute rounded-full blur-xl" style={{ top: "30%", left: "55%", width: "30%", height: "20%", background: "radial-gradient(circle, rgba(29,85,131,0.25) 0%, transparent 70%)" }} />

                    {/* Elephant call signal */}
                    <div
                      className="absolute h-3 rounded-full blur-[2px]"
                      style={{ top: "55%", left: "10%", right: "18%", background: "linear-gradient(90deg,transparent,#FFD700,#C4A46C,#FFD700,transparent)", opacity: 0.75 }}
                    />
                    <div
                      className="absolute h-2 rounded-full blur-[1px]"
                      style={{ top: "62%", left: "14%", right: "25%", background: "linear-gradient(90deg,transparent,#C4A46C,transparent)", opacity: 0.45 }}
                    />

                    {/* Scanning line */}
                    <div
                      data-scan-line
                      className="absolute top-0 bottom-[18%] w-[2px] bg-gradient-to-b from-transparent via-accent-savanna to-transparent opacity-70"
                      style={{ left: "5%" }}
                    />

                    {/* X-axis labels */}
                    <div className="absolute bottom-0 left-0 right-0 flex justify-between px-1 pb-1">
                      {["0s", "5s", "10s", "15s", "20s"].map((label) => (
                        <span key={label} className="text-[9px] text-white/30 font-mono">{label}</span>
                      ))}
                    </div>
                  </div>
                </div>

                {/* Bottom label */}
                <div className="absolute bottom-4 left-1/2 -translate-x-1/2 px-3 py-1.5 rounded-lg bg-black/50 backdrop-blur-sm whitespace-nowrap">
                  <span className="text-xs text-white/55">
                    raw_recording.wav — signal buried in noise
                  </span>
                </div>
              </div>
            </div>

            <div data-sol-right>
              <span className="text-xs font-semibold text-accent-savanna tracking-[0.2em] uppercase mb-5 block">
                Our Solution
              </span>
              <h2 className="font-display leading-[1.1] text-ev-charcoal mb-6">
                <span className="block text-4xl md:text-5xl font-normal">AI-Powered</span>
                <span
                  className="block text-4xl md:text-5xl font-light"
                  style={{ WebkitTextStroke: "2px #2C2926", color: "transparent" }}
                >
                  Noise Removal
                </span>
              </h2>
              <p className="text-ev-elephant mb-8 leading-relaxed">
                EchoField uses spectral gating and AI classification to identify
                and remove overlapping noise — airplanes, cars, generators, wind
                — while preserving the elephant vocalizations researchers need.
              </p>

              <div data-sol-features className="space-y-4">
                {[
                  {
                    label: "Noise Classification",
                    desc: "Identifies airplane, vehicle, wind, and generator noise",
                  },
                  {
                    label: "Spectral Gating",
                    desc: "Surgically removes noise while preserving calls",
                  },
                  {
                    label: "Quality Assurance",
                    desc: "SNR measurement, energy preservation, distortion checks",
                  },
                  {
                    label: "Research Export",
                    desc: "CSV, JSON, and ZIP exports for peer review",
                  },
                ].map((item, i) => (
                  <div key={i} data-sol-feature className="flex items-start gap-3">
                    <div className="w-6 h-6 rounded-full bg-accent-savanna/10 flex items-center justify-center mt-0.5 flex-shrink-0">
                      <svg
                        className="w-3.5 h-3.5 text-accent-savanna"
                        fill="none"
                        viewBox="0 0 24 24"
                        stroke="currentColor"
                      >
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          strokeWidth={3}
                          d="M5 13l4 4L19 7"
                        />
                      </svg>
                    </div>
                    <div>
                      <div className="text-sm font-semibold text-ev-charcoal">
                        {item.label}
                      </div>
                      <div className="text-xs text-ev-elephant">{item.desc}</div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ── Wave: Solution → Steps ── */}
      <WaveDivider topColor="#F0EBE3" bottomColor="#1c1710" variant={1} />

      {/* ═══════════════════════════════════════════
          HOW IT WORKS
         ═══════════════════════════════════════════ */}
      <section ref={stepsRef} className="py-20 md:py-28" style={{ background: "#1c1710" }}>
        <div className="max-w-7xl mx-auto px-6">
          <div className="text-center mb-16">
            <div className="flex items-center justify-center gap-4 mb-6">
              <div className="h-px w-10 bg-[#d5b171]/35" />
              <span className="text-xs font-semibold text-[#d5b171] tracking-[0.28em] uppercase">How It Works</span>
              <div className="h-px w-10 bg-[#d5b171]/35" />
            </div>
            <h2 className="font-display font-bold leading-[0.95] text-white" style={{ fontSize: "clamp(3.5rem,9vw,8rem)" }}>
              Three Steps
            </h2>
            <h2
              className="font-display font-light leading-[0.95] mb-6"
              style={{ fontSize: "clamp(2.8rem,7vw,6.5rem)", WebkitTextStroke: "2px #C4A46C", color: "transparent" }}
            >
              to Clarity
            </h2>
            <p className="text-[#b7aca0] text-base max-w-md mx-auto leading-relaxed">
              From raw field recording to publishable research data — automated end-to-end.
            </p>
          </div>

          {/* Icons row with connector line */}
          <div className="relative flex justify-around mb-8 px-[10%]">
            <div
              data-step-line
              className="hidden md:block absolute top-1/2 left-[15%] right-[15%] h-px -translate-y-1/2"
              style={{ background: "linear-gradient(90deg, #C4A46C, #C4A46C88, #5A6B4F)" }}
            />
            {[
              { color: "bg-accent-savanna", icon: <svg className="w-6 h-6 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" /></svg> },
              { color: "bg-accent-gold", icon: <svg className="w-6 h-6 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 3v4M3 5h4M6 17v4m-2-2h4m5-16l2.286 6.857L21 12l-5.714 2.143L13 21l-2.286-6.857L5 12l5.714-2.143L13 3z" /></svg> },
              { color: "bg-nature-sage", icon: <svg className="w-6 h-6 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" /></svg> },
            ].map((s, i) => (
              <div
                key={i}
                data-step-num
                className={`relative z-10 w-14 h-14 ${s.color} rounded-2xl flex items-center justify-center shadow-lg`}
              >
                {s.icon}
              </div>
            ))}
          </div>

          {/* Step cards */}
          <div className="grid md:grid-cols-3 gap-5">
            {[
              {
                step: "STEP 01",
                title: "Upload",
                desc: "Drop your WAV, MP3, or FLAC field recordings. Any sample rate, any bit depth — we handle it all.",
              },
              {
                step: "STEP 02",
                title: "Process",
                desc: "AI identifies noise types, applies spectral gating, and extracts clean elephant vocalizations in seconds.",
              },
              {
                step: "STEP 03",
                title: "Analyze",
                desc: "Compare spectrograms, listen to cleaned audio, review detected calls, and export research-grade data.",
              },
            ].map((s, i) => (
              <div
                key={i}
                data-step-card
                className="rounded-2xl p-6 text-center"
                style={{ background: "#2a2318", border: "1px solid rgba(255,255,255,0.06)", perspective: "600px" }}
              >
                <p className="text-xs tracking-[0.22em] uppercase font-medium mb-3" style={{ color: "#d5b17166" }}>{s.step}</p>
                <h3 className="text-2xl font-display text-white mb-3">{s.title}</h3>
                <p className="text-[#b7aca0] text-sm leading-relaxed">{s.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── Wave: Steps → Impact ── */}
      <WaveDivider topColor="#1c1710" bottomColor="#2C2926" variant={2} />

      {/* ═══════════════════════════════════════════
          RESEARCH IMPACT DASHBOARD
         ═══════════════════════════════════════════ */}
      <ImpactDashboard />

      {/* ═══════════════════════════════════════════
          CTA
         ═══════════════════════════════════════════ */}
      <section
        ref={ctaRef}
        id="get-started"
        className="relative py-24 md:py-32 overflow-hidden"
        style={{ background: "linear-gradient(180deg, #2C2926 0%, #1a1714 100%)" }}
      >
        {/* Animated BG rings */}
        <div className="absolute inset-0 flex items-center justify-center">
          {[90, 140, 200, 270, 350].map((r, i) => (
            <svg
              key={i}
              data-cta-ring
              viewBox="0 0 200 200"
              className="absolute"
              style={{ width: `${r * 3.5}px`, height: `${r * 3.5}px` }}
            >
              <circle
                cx="100"
                cy="100"
                r={r / 4}
                stroke="white"
                strokeWidth={0.3 - i * 0.04}
                fill="none"
                opacity={0.06 - i * 0.008}
              />
            </svg>
          ))}
        </div>

        {/* Pulsing rings */}
        <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
          <div className="w-40 h-40 rounded-full border border-accent-savanna/10 ring-pulse" />
          <div className="absolute w-40 h-40 rounded-full border border-accent-savanna/10 ring-pulse ring-pulse-delay-1" />
          <div className="absolute w-40 h-40 rounded-full border border-accent-savanna/10 ring-pulse ring-pulse-delay-2" />
        </div>

        <div
          data-cta-inner
          className="relative max-w-3xl mx-auto px-6 text-center"
        >
          <h2 className="text-4xl md:text-5xl lg:text-6xl font-display font-semibold text-ev-cream mb-6">
            Help Protect{" "}
            <span className="text-accent-savanna">Their Voice</span>
          </h2>
          <p className="text-lg text-ev-dust/60 mb-10 max-w-xl mx-auto leading-relaxed">
            Upload your first field recording and experience AI-driven noise
            removal. Every cleaned recording brings us closer to understanding
            — and protecting — these remarkable animals.
          </p>
          <Link
            href="/upload"
            className="group inline-flex items-center gap-3 px-10 py-5 bg-accent-savanna text-ev-ivory text-lg font-semibold rounded-full hover:bg-accent-gold transition-all duration-300 hover:shadow-xl hover:shadow-accent-savanna/20"
          >
            Get Started
            <svg
              className="w-5 h-5 transition-transform group-hover:translate-x-1"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M17 8l4 4m0 0l-4 4m4-4H3"
              />
            </svg>
          </Link>
        </div>
      </section>

      {/* ═══════════════════════════════════════════
          TEAM & ABOUT
         ═══════════════════════════════════════════ */}
      <section
        ref={teamRef}
        className="relative py-20 md:py-28 overflow-hidden"
        style={{ background: "linear-gradient(180deg, #1a1714 0%, #141210 50%, #1a1714 100%)" }}
      >
        {/* Subtle grain texture */}
        <div className="absolute inset-0 opacity-[0.03]" style={{ backgroundImage: "url(\"data:image/svg+xml,%3Csvg viewBox='0 0 256 256' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='4' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)' opacity='1'/%3E%3C/svg%3E\")" }} />

        {/* Floating ambient dots */}
        <div className="pointer-events-none absolute inset-0">
          {[
            { left: "8%", top: "20%", size: "3px", opacity: 0.12 },
            { left: "18%", top: "65%", size: "2px", opacity: 0.1 },
            { left: "82%", top: "30%", size: "3px", opacity: 0.08 },
            { left: "92%", top: "70%", size: "2px", opacity: 0.1 },
            { left: "45%", top: "15%", size: "2px", opacity: 0.08 },
            { left: "65%", top: "85%", size: "3px", opacity: 0.1 },
          ].map((dot, i) => (
            <div
              key={i}
              className="absolute rounded-full bg-accent-savanna"
              style={{
                left: dot.left,
                top: dot.top,
                width: dot.size,
                height: dot.size,
                opacity: dot.opacity,
                animation: `float ${10 + i * 1.2}s ease-in-out ${i * 0.5}s infinite`,
              }}
            />
          ))}
        </div>

        <div className="relative max-w-5xl mx-auto px-6">
          {/* Section header */}
          <div className="text-center mb-14">
            <div className="flex items-center justify-center gap-4 mb-5" data-team-label>
              <div className="h-px w-10 bg-[#d5b171]/30" />
              <span className="text-xs font-semibold uppercase tracking-[0.28em] text-[#d5b171]">
                The Team
              </span>
              <div className="h-px w-10 bg-[#d5b171]/30" />
            </div>
            <p className="text-sm text-[#b7aca0]/70 max-w-md mx-auto leading-relaxed" data-team-desc>
              Built in 36 hours at HackSMU 2026 — April 2026, Dallas, TX
            </p>
          </div>

          {/* Team cards */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-5 md:gap-6 max-w-3xl mx-auto mb-16">
            {[
              { name: "Dmitry Moiseenko", initials: "DM", linkedin: "https://www.linkedin.com/in/moiseenko-dmitry/" },
              { name: "Vladislav Kondratyev", initials: "VK", linkedin: "https://www.linkedin.com/in/vladislav-kondratyev/" },
              { name: "Arnav Kumar", initials: "AK", linkedin: "https://www.linkedin.com/in/arnav-kumar2932/" },
              { name: "Tanish Murali", initials: "TM", linkedin: "https://www.linkedin.com/in/tanish-murali/" },
            ].map((member, i) => (
              <a
                key={i}
                href={member.linkedin}
                target="_blank"
                rel="noopener noreferrer"
                data-team-card
                className="group relative rounded-2xl p-5 md:p-6 text-center transition-all duration-500 hover:-translate-y-2"
                style={{
                  background: "linear-gradient(135deg, rgba(255,255,255,0.04) 0%, rgba(255,255,255,0.01) 100%)",
                  border: "1px solid rgba(255,255,255,0.06)",
                }}
              >
                {/* Hover glow */}
                <div className="absolute inset-0 rounded-2xl opacity-0 group-hover:opacity-100 transition-opacity duration-500" style={{ background: "radial-gradient(circle at 50% 30%, rgba(196,164,108,0.08) 0%, transparent 70%)" }} />

                <div className="relative">
                  {/* Avatar */}
                  <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-full transition-all duration-500 group-hover:scale-110 group-hover:shadow-lg group-hover:shadow-accent-savanna/10" style={{ background: "linear-gradient(135deg, rgba(196,164,108,0.15) 0%, rgba(196,164,108,0.05) 100%)", border: "1px solid rgba(196,164,108,0.15)" }}>
                    <span className="text-sm font-bold text-accent-savanna/80 group-hover:text-accent-savanna transition-colors duration-300">
                      {member.initials}
                    </span>
                  </div>

                  {/* Name */}
                  <p className="text-sm font-medium text-ev-cream/80 group-hover:text-ev-cream transition-colors duration-300 mb-3">
                    {member.name}
                  </p>

                  {/* LinkedIn icon */}
                  <div className="flex justify-center">
                    <svg className="w-4 h-4 text-[#b7aca0]/30 group-hover:text-accent-savanna/70 transition-all duration-300 group-hover:scale-110" viewBox="0 0 24 24" fill="currentColor">
                      <path d="M20.447 20.452h-3.554v-5.569c0-1.328-.027-3.037-1.852-3.037-1.853 0-2.136 1.445-2.136 2.939v5.667H9.351V9h3.414v1.561h.046c.477-.9 1.637-1.85 3.37-1.85 3.601 0 4.267 2.37 4.267 5.455v6.286zM5.337 7.433a2.062 2.062 0 01-2.063-2.065 2.064 2.064 0 112.063 2.065zm1.782 13.019H3.555V9h3.564v11.452zM22.225 0H1.771C.792 0 0 .774 0 1.729v20.542C0 23.227.792 24 1.771 24h20.451C23.2 24 24 23.227 24 22.271V1.729C24 .774 23.2 0 22.222 0h.003z"/>
                    </svg>
                  </div>
                </div>
              </a>
            ))}
          </div>

          {/* Divider */}
          <div className="flex items-center justify-center mb-14">
            <div
              data-team-divider
              className="h-px w-48 md:w-64"
              style={{ background: "linear-gradient(90deg, transparent 0%, rgba(196,164,108,0.25) 50%, transparent 100%)" }}
            />
          </div>

          {/* ElephantVoices partnership */}
          <div
            data-ev-badge
            className="max-w-lg mx-auto text-center"
          >
            <div className="inline-flex items-center gap-2 mb-4">
              <svg className="w-5 h-5 text-accent-savanna/50" fill="currentColor" viewBox="0 0 24 24">
                <path d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z"/>
              </svg>
              <span className="text-xs font-semibold uppercase tracking-[0.2em] text-accent-savanna/50">
                In Partnership With
              </span>
              <svg className="w-5 h-5 text-accent-savanna/50" fill="currentColor" viewBox="0 0 24 24">
                <path d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z"/>
              </svg>
            </div>
            <a href="https://www.elephantvoices.org" target="_blank" rel="noopener noreferrer" className="text-xl md:text-2xl font-display font-semibold text-ev-cream/60 mb-3 hover:text-accent-savanna/60 transition-colors">
              ElephantVoices
            </a>
            <p className="text-sm text-[#b7aca0]/50 leading-relaxed max-w-sm mx-auto">
              A nonprofit dedicated to elephant cognition, communication, and
              conservation — whose decades of field research make this work possible.
            </p>
          </div>
        </div>
      </section>

      {/* ═══════════════════════════════════════════
          FOOTER
         ═══════════════════════════════════════════ */}
      <footer className="py-6 px-6" style={{ background: "#1a1714", borderTop: "1px solid rgba(255,255,255,0.04)" }}>
        <div className="max-w-5xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-3">
          <Link
            href="/"
            className="text-base font-display font-semibold text-accent-savanna/60 hover:text-accent-savanna transition-colors"
          >
            EchoField
          </Link>
          <div className="flex items-center gap-5">
            {["Upload", "Recordings", "Database"].map((item) => (
              <Link
                key={item}
                href={`/${item.toLowerCase()}`}
                className="text-xs text-[#b7aca0]/30 hover:text-accent-savanna/60 transition-colors"
              >
                {item}
              </Link>
            ))}
            <a
              href="https://www.elephantvoices.org"
              target="_blank"
              rel="noopener noreferrer"
              className="text-xs text-[#b7aca0]/30 hover:text-accent-savanna/60 transition-colors"
            >
              ElephantVoices
            </a>
          </div>
          <p className="text-xs text-[#b7aca0]/20">
            &copy; 2026 EchoField &middot; HackSMU
          </p>
        </div>
      </footer>
    </div>
  );
}
