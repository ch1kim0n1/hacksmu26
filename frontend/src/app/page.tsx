"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import Image from "next/image";
import gsap from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import HeroGlobe from "@/components/hero/HeroGlobe";
import { useSceneTransition } from "@/components/transition/SceneTransitionProvider";

const landingNavItems = [
  { href: "/about", label: "About" },
  { href: "/upload", label: "Upload" },
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
          y: 100,
          opacity: 0,
          rotateX: -12,
          scale: 0.9,
          duration: 0.9,
          delay: i * 0.15,
          ease: "power3.out",
          scrollTrigger: {
            trigger: threatsRef.current,
            start: "top 70%",
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
                Ready to Explore?
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
        className="relative pt-0 pb-20 md:pb-28"
        style={{
          background:
            "linear-gradient(180deg, #8B5E3C 0%, #B0764E 15%, #C4785A 30%, #C48B5A 50%, #C89E60 70%, #C4A46C 100%)",
        }}
      >
        {/* ── Wave: Hero → Crisis (inside section so no seam) ── */}
        <div className="w-full" style={{ marginTop: "-1px", marginBottom: "-1px" }}>
          <svg viewBox="0 0 1440 120" preserveAspectRatio="none" aria-hidden="true" className="block w-full" style={{ height: "clamp(60px, 10vw, 140px)" }}>
            <path d="M0,0 L1440,0 L1440,30 C1200,110 900,10 600,60 C300,110 120,40 0,80 L0,0 Z" fill="#c5b294" />
          </svg>
        </div>
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
            <span className="text-sm font-semibold text-accent-savanna tracking-[0.2em] uppercase mb-4 block">
              Why This Happens
            </span>
            <h2 className="text-4xl md:text-5xl font-display font-semibold text-ev-charcoal mb-4">
              Three Forces of Extinction
            </h2>
            <p className="text-ev-elephant max-w-xl mx-auto">
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
              className="relative aspect-[4/3] overflow-hidden rounded-[1.9rem] bg-[#0b1722] p-1.5 shadow-[0_22px_46px_rgba(16,24,40,0.24),0_48px_90px_rgba(12,33,61,0.14)]"
            >
              <div className="relative h-full w-full overflow-hidden rounded-[1.55rem] bg-gradient-to-br from-[#11284e] via-[#10284a] to-[#112744]">
                {/* Noise bands */}
                {[12, 22, 35, 45, 58, 68, 78, 88].map((top, i) => (
                  <div
                    key={i}
                    className="absolute left-[5%] right-[5%] h-[2px] bg-[#1d5583]/26"
                    style={{ top: `${top}%`, opacity: 0.15 + (i % 3) * 0.08 }}
                  />
                ))}
                {[24, 50, 76].map((left, i) => (
                  <div
                    key={`col-${i}`}
                    className="absolute top-[4%] bottom-[4%] w-[1px] bg-[#285785]/18"
                    style={{ left: `${left}%` }}
                  />
                ))}
                {/* Elephant call signal */}
                <div
                  className="absolute h-3 rounded-full"
                  style={{
                    top: "52%",
                    left: "18%",
                    right: "28%",
                    background:
                      "linear-gradient(90deg,transparent,#FFD700,#C4A46C,#FFD700,transparent)",
                    opacity: 0.55,
                  }}
                />
                <div
                  className="absolute h-2 rounded-full"
                  style={{
                    top: "58%",
                    left: "22%",
                    right: "34%",
                    background:
                      "linear-gradient(90deg,transparent,#C4A46C,transparent)",
                    opacity: 0.35,
                  }}
                />
                {/* Scanning line */}
                <div
                  data-scan-line
                  className="absolute top-[3%] bottom-[3%] w-[2px] bg-gradient-to-b from-transparent via-accent-savanna to-transparent opacity-60"
                  style={{ left: "5%" }}
                />
                {/* Label */}
                <div className="absolute bottom-4 left-4 px-3 py-1.5 rounded-lg bg-black/40 backdrop-blur-sm">
                  <span className="text-xs text-white/60">
                    Raw Recording — Signal Buried in Noise
                  </span>
                </div>
              </div>
            </div>

            <div data-sol-right>
              <span className="text-sm font-semibold text-accent-savanna tracking-[0.2em] uppercase mb-4 block">
                Our Solution
              </span>
              <h2 className="text-4xl md:text-5xl font-display font-semibold text-ev-charcoal mb-6">
                AI-Powered
                <br />
                Noise Removal
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
      <WaveDivider topColor="#F0EBE3" bottomColor="#F8F5F0" variant={1} />

      {/* ═══════════════════════════════════════════
          HOW IT WORKS
         ═══════════════════════════════════════════ */}
      <section ref={stepsRef} className="py-20 md:py-28 bg-ev-ivory">
        <div className="max-w-7xl mx-auto px-6">
          <div className="text-center mb-20">
            <span className="text-sm font-semibold text-accent-savanna tracking-[0.2em] uppercase mb-4 block">
              How It Works
            </span>
            <h2 className="text-4xl md:text-5xl font-display font-semibold text-ev-charcoal">
              Three Steps to Clarity
            </h2>
          </div>

          <div className="relative grid md:grid-cols-3 gap-12">
            {/* Connector lines */}
            <div className="hidden md:block absolute top-[3.5rem] left-[33%] right-[33%] h-0.5">
              <div
                data-step-line
                className="absolute left-0 right-[50%] h-full bg-gradient-to-r from-accent-savanna to-accent-gold"
              />
              <div
                data-step-line
                className="absolute left-[50%] right-0 h-full bg-gradient-to-r from-accent-gold to-nature-sage"
              />
            </div>

            {[
              {
                step: "01",
                title: "Upload",
                desc: "Drop your WAV, MP3, or FLAC field recordings. Any sample rate, any bit depth — we handle it all.",
                color: "bg-accent-savanna",
                icon: (
                  <svg className="w-6 h-6 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
                  </svg>
                ),
              },
              {
                step: "02",
                title: "Process",
                desc: "AI identifies noise types, applies spectral gating, and extracts clean elephant vocalizations in seconds.",
                color: "bg-accent-gold",
                icon: (
                  <svg className="w-6 h-6 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
                  </svg>
                ),
              },
              {
                step: "03",
                title: "Analyze",
                desc: "Compare spectrograms, listen to cleaned audio, review detected calls, and export research-grade data.",
                color: "bg-nature-sage",
                icon: (
                  <svg className="w-6 h-6 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
                  </svg>
                ),
              },
            ].map((s, i) => (
              <div key={i} data-step-card className="relative text-center" style={{ perspective: "600px" }}>
                <div
                  className={`w-14 h-14 ${s.color} rounded-2xl flex items-center justify-center mx-auto mb-6 shadow-lg group-hover:shadow-xl transition-shadow`}
                >
                  {s.icon}
                </div>
                <div data-step-num className="text-5xl font-display font-bold text-ev-sand/30 mb-3">
                  {s.step}
                </div>
                <h3 className="text-xl font-bold text-ev-charcoal mb-3">
                  {s.title}
                </h3>
                <p className="text-ev-elephant text-sm leading-relaxed">
                  {s.desc}
                </p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── Wave: Steps → CTA ── */}
      <WaveDivider topColor="#F8F5F0" bottomColor="#2C2926" variant={2} />

      {/* ═══════════════════════════════════════════
          CTA
         ═══════════════════════════════════════════ */}
      <section
        ref={ctaRef}
        id="get-started"
        className="relative py-20 md:py-28 bg-ev-charcoal overflow-hidden"
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
          <button
            onClick={() => window.scrollTo({ top: 0, behavior: "smooth" })}
            className="group inline-flex items-center gap-3 px-10 py-5 bg-accent-savanna text-ev-ivory text-lg font-semibold rounded-full hover:bg-accent-gold transition-all duration-300 hover:shadow-xl hover:shadow-accent-savanna/20"
          >
            Back to the Top
            <svg
              className="w-5 h-5 transition-transform group-hover:-translate-y-1"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M5 10l7-7m0 0l7 7m-7-7v18"
              />
            </svg>
          </button>
          <p className="mt-10 text-sm text-ev-dust/35">
            Built in partnership with{" "}
            <span className="text-accent-savanna/50">ElephantVoices</span>
            {" "}for HackSMU 2026
          </p>
        </div>
      </section>

      {/* ═══════════════════════════════════════════
          FOOTER
         ═══════════════════════════════════════════ */}
      <footer className="bg-ev-charcoal border-t border-ev-charcoal-light/20 py-8 px-6">
        <div className="max-w-7xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-4">
          <Link
            href="/"
            className="text-lg font-display font-semibold text-accent-savanna"
          >
            EchoField
          </Link>
          <div className="flex items-center gap-6">
            {["About", "Upload", "Database"].map((item) => (
              <Link
                key={item}
                href={`/${item.toLowerCase()}`}
                className="text-xs text-ev-dust/40 hover:text-accent-savanna transition-colors"
              >
                {item}
              </Link>
            ))}
          </div>
          <p className="text-xs text-ev-dust/25">
            &copy; 2026 EchoField &middot; HackSMU
          </p>
        </div>
      </footer>
    </div>
  );
}
