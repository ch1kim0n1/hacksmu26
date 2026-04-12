"use client";

import { useEffect, useRef, useState, type ComponentType } from "react";
import Link from "next/link";
import Image from "next/image";
import gsap from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import HeroGlobe from "@/components/hero/HeroGlobe";

type ParticleFieldProps = {
  className?: string;
  count?: number;
  color?: string;
  speed?: number;
  size?: number;
};

function LazyParticleField(props: ParticleFieldProps) {
  const [Comp, setComp] = useState<ComponentType<ParticleFieldProps> | null>(
    null,
  );
  useEffect(() => {
    import("@/components/hero/ParticleField").then((m) =>
      setComp(() => m.default),
    );
  }, []);
  return Comp ? <Comp {...props} /> : null;
}

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
      { threshold: 0.3 },
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
   SVG Wave Divider
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
    <div
      className="wave-divider"
      style={{
        background: bottomColor,
        marginTop: "-1px",
        marginBottom: "-6px",
        position: "relative",
        zIndex: 2,
      }}
    >
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
  const containerRef = useRef<HTMLDivElement>(null);
  const heroRef = useRef<HTMLElement>(null);
  const crisisRef = useRef<HTMLElement>(null);
  const threatsRef = useRef<HTMLElement>(null);
  const voiceRef = useRef<HTMLElement>(null);
  const solutionRef = useRef<HTMLElement>(null);
  const stepsRef = useRef<HTMLElement>(null);
  const ctaRef = useRef<HTMLElement>(null);

  const [mobileNav, setMobileNav] = useState(false);

  /* ── GSAP orchestration ── */
  useEffect(() => {
    gsap.registerPlugin(ScrollTrigger);

    const ctx = gsap.context(() => {
      /* ═══ HERO INTRO ═══ */
      const heroTl = gsap.timeline({ defaults: { ease: "power3.out" } });
      heroTl
        .from("[data-nav]", { y: -40, opacity: 0, duration: 0.8 })
        .from(
          "[data-hero-line]",
          {
            y: 120,
            opacity: 0,
            stagger: 0.18,
            duration: 1.1,
            ease: "power4.out",
          },
          "-=0.4",
        )
        .from(
          "[data-hero-sub]",
          { y: 40, opacity: 0, duration: 0.8 },
          "-=0.5",
        )
        .from(
          "[data-hero-cta]",
          { y: 30, opacity: 0, duration: 0.6 },
          "-=0.4",
        )
        .from(
          "[data-scroll-ind]",
          { opacity: 0, y: -10, duration: 0.4 },
          "-=0.2",
        );

      /* Nav solidify on scroll */
      ScrollTrigger.create({
        trigger: heroRef.current,
        start: "5% top",
        onEnter: () => {
          gsap.to("[data-nav]", {
            backgroundColor: "rgba(44,41,38,0.92)",
            backdropFilter: "blur(20px)",
            duration: 0.4,
          });
          gsap.to("[data-nav-gradient]", { opacity: 0, duration: 0.3 });
        },
        onLeaveBack: () => {
          gsap.to("[data-nav]", {
            backgroundColor: "transparent",
            backdropFilter: "none",
            duration: 0.4,
          });
          gsap.to("[data-nav-gradient]", { opacity: 1, duration: 0.3 });
        },
      });

      /* Hero parallax on scroll */
      gsap.to("[data-hero-content]", {
        y: -80,
        opacity: 0,
        ease: "none",
        scrollTrigger: {
          trigger: heroRef.current,
          start: "60% top",
          end: "bottom top",
          scrub: 1,
        },
      });

      /* Scroll indicator bounce */
      gsap.to("[data-scroll-ind]", {
        y: 10,
        duration: 1.4,
        ease: "sine.inOut",
        yoyo: true,
        repeat: -1,
      });

      /* ═══ CRISIS ═══ */
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

      /* ═══ THREATS ═══ */
      gsap.from("[data-threat-title]", {
        y: 40,
        opacity: 0,
        duration: 0.7,
        scrollTrigger: { trigger: threatsRef.current, start: "top 80%" },
      });

      gsap.utils
        .toArray<HTMLElement>("[data-threat-card]")
        .forEach((card, i) => {
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

      /* ═══ VOICE ═══ */
      const voiceTl = gsap.timeline({
        scrollTrigger: { trigger: voiceRef.current, start: "top 70%" },
      });
      voiceTl
        .from("[data-voice-title]", { y: 40, opacity: 0, duration: 0.6 })
        .from(
          "[data-voice-text]",
          { y: 25, opacity: 0, stagger: 0.1, duration: 0.5 },
          "-=0.3",
        )
        .from(
          "[data-voice-visual]",
          { scale: 0.85, opacity: 0, duration: 0.8 },
          "-=0.4",
        );

      gsap.utils
        .toArray<SVGPathElement>("[data-voice-wave]")
        .forEach((path) => {
          const length = path.getTotalLength?.() || 400;
          gsap.set(path, {
            strokeDasharray: length,
            strokeDashoffset: length,
          });
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

      gsap.to("[data-wave-line]", {
        y: 8,
        duration: 2,
        ease: "sine.inOut",
        yoyo: true,
        repeat: -1,
        stagger: 0.25,
      });

      /* ═══ SOLUTION ═══ */
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
        },
      );

      gsap.from("[data-sol-feature]", {
        x: 30,
        opacity: 0,
        stagger: 0.12,
        duration: 0.5,
        scrollTrigger: { trigger: "[data-sol-features]", start: "top 85%" },
      });

      /* ═══ STEPS ═══ */
      gsap.utils
        .toArray<HTMLElement>("[data-step-card]")
        .forEach((card, i) => {
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

      gsap.from("[data-step-line]", {
        scaleX: 0,
        transformOrigin: "left center",
        stagger: 0.2,
        duration: 0.8,
        ease: "power2.inOut",
        scrollTrigger: { trigger: stepsRef.current, start: "top 65%" },
      });

      gsap.from("[data-step-num]", {
        scale: 0,
        opacity: 0,
        stagger: 0.15,
        duration: 0.6,
        ease: "power4.out",
        scrollTrigger: { trigger: stepsRef.current, start: "top 70%" },
      });

      /* ═══ CTA ═══ */
      gsap.from("[data-cta-inner]", {
        y: 60,
        opacity: 0,
        scale: 0.95,
        duration: 1,
        ease: "power2.out",
        scrollTrigger: { trigger: ctaRef.current, start: "top 80%" },
      });

      gsap.utils
        .toArray<HTMLElement>("[data-cta-ring]")
        .forEach((ring, i) => {
          gsap.from(ring, {
            scale: 0.3,
            opacity: 0,
            duration: 1.2,
            delay: i * 0.15,
            ease: "power1.out",
            scrollTrigger: { trigger: ctaRef.current, start: "top 85%" },
          });
        });
    }, containerRef);

    return () => ctx.revert();
  }, []);

  return (
    <div ref={containerRef} className="landing-page">
      {/* ═══════════════════════════════════════════
          NAV — single, clean, no decorative edge
         ═══════════════════════════════════════════ */}
      <nav data-nav className="fixed top-0 left-0 right-0 z-50">
        {/* Gradient for text legibility over hero */}
        <div
          data-nav-gradient
          className="absolute inset-0 bg-gradient-to-b from-black/40 via-black/10 to-transparent pointer-events-none"
        />

        <div className="relative max-w-7xl mx-auto flex items-center justify-between px-6 lg:px-10 py-5">
          <Link
            href="/"
            className="text-xl font-display font-semibold text-white/90 tracking-wide"
          >
            EchoField
          </Link>

          {/* Desktop links */}
          <div className="hidden md:flex items-center gap-10">
            {["About", "Upload", "Database"].map((item) => (
              <Link
                key={item}
                href={`/${item.toLowerCase()}`}
                className="text-sm font-medium text-white/60 hover:text-white transition-colors duration-300"
              >
                {item}
              </Link>
            ))}
            <Link
              href="/upload"
              className="px-6 py-2.5 rounded-full bg-white/10 border border-white/20 text-white text-sm font-semibold hover:bg-white/20 transition-all duration-300 backdrop-blur-sm"
            >
              Get Started
            </Link>
          </div>

          {/* Mobile hamburger */}
          <button
            onClick={() => setMobileNav(!mobileNav)}
            className="md:hidden flex items-center justify-center w-10 h-10 text-white/80"
            aria-label="Menu"
            aria-expanded={mobileNav}
          >
            <svg
              className="w-6 h-6"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
            >
              {mobileNav ? (
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M6 18L18 6M6 6l12 12"
                />
              ) : (
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M4 6h16M4 12h16M4 18h16"
                />
              )}
            </svg>
          </button>
        </div>

        {/* Mobile menu */}
        <div
          className={`md:hidden bg-ev-charcoal/95 backdrop-blur-xl border-t border-white/10 px-6 overflow-hidden transition-all duration-300 ease-out ${
            mobileNav ? "max-h-60 py-4 opacity-100" : "max-h-0 py-0 opacity-0"
          }`}
        >
          {["About", "Upload", "Database"].map((item) => (
            <Link
              key={item}
              href={`/${item.toLowerCase()}`}
              onClick={() => setMobileNav(false)}
              className="block py-3 text-sm font-medium text-white/60 hover:text-accent-savanna transition-colors"
            >
              {item}
            </Link>
          ))}
        </div>
      </nav>

      {/* ═══════════════════════════════════════════
          HERO — massive typography + elephant + globe
         ═══════════════════════════════════════════ */}
      <section
        ref={heroRef}
        className="relative min-h-screen overflow-hidden"
        style={{
          background:
            "linear-gradient(180deg, #dcccb6 0%, #c3ab88 38%, #a8875c 100%)",
        }}
      >
        {/* Background layers */}
        <div className="absolute inset-0 z-0">
          <div className="absolute inset-0 bg-[radial-gradient(circle_at_52%_26%,rgba(255,248,236,0.52),transparent_24%),radial-gradient(circle_at_78%_36%,rgba(255,236,196,0.18),transparent_20%)]" />
          <div className="absolute inset-0 bg-[linear-gradient(180deg,rgba(255,255,255,0.1)_0%,rgba(255,255,255,0)_18%,rgba(103,73,37,0.14)_62%,rgba(55,37,18,0.28)_100%)]" />
          <Image
            src="/background_texture.jpg"
            alt=""
            fill
            priority
            className="pointer-events-none object-cover opacity-[0.25] mix-blend-multiply"
            sizes="100vw"
          />
        </div>

        {/* Vignette */}
        <div className="absolute inset-0 z-[1] bg-[radial-gradient(circle_at_80%_26%,rgba(255,255,255,0.12),transparent_16%)]" />
        <div className="absolute inset-x-0 bottom-0 z-[2] h-[32vh] bg-[linear-gradient(180deg,rgba(208,177,124,0)_0%,rgba(167,130,78,0.16)_40%,rgba(90,61,27,0.3)_100%)]" />

        {/* Composition layer */}
        <div data-hero-content className="absolute inset-0 z-[3]">
          {/* Elephant */}
          <div className="absolute bottom-0 left-[-5vw] h-[50vh] w-[75vw] sm:left-[-3vw] sm:h-[60vh] sm:w-[55vw] md:h-[65vh] md:w-[50vw] lg:left-[-1vw] lg:h-[72vh] lg:w-[44vw] lg:max-w-[940px]">
            <Image
              src="/elephant-background.png"
              alt="Elephant holding the globe on its trunk"
              fill
              priority
              quality={95}
              className="object-contain object-left-bottom"
              sizes="(min-width: 1024px) 44vw, (min-width: 768px) 50vw, 75vw"
            />
          </div>

          {/* Globe */}
          <button
            type="button"
            onClick={() =>
              document
                .getElementById("crisis")
                ?.scrollIntoView({ behavior: "smooth" })
            }
            aria-label="Explore the elephant crisis"
            className="pointer-events-auto absolute left-[38%] top-[48%] h-[160px] w-[160px] sm:left-[42%] sm:top-[44%] sm:h-[220px] sm:w-[220px] md:left-[46%] md:top-[42%] md:h-[280px] md:w-[280px] lg:left-[49%] lg:top-[41%] lg:h-[clamp(300px,26vw,440px)] lg:w-[clamp(300px,26vw,440px)] -translate-x-1/2 -translate-y-1/2 transform-gpu rounded-full z-[10] cursor-pointer transition-transform duration-300 hover:scale-[1.03]"
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
                atmosphereColor: "#C4A46C",
                atmosphereAltitude: 0.06,
                idleRotationSpeed: 0.03,
                cameraPosition: { x: 0, y: 8, z: 248 },
                controls: { minDistance: 180, maxDistance: 280 },
              }}
            />
          </button>

          {/* ── Desktop hero text (lg+) ── */}
          <div className="absolute inset-0 z-[8] hidden lg:flex items-center justify-end pointer-events-none">
            <div className="pr-[5vw] max-w-[55vw]">
              <div className="overflow-hidden">
                <h1
                  data-hero-line
                  className="text-[clamp(5rem,9vw,11rem)] font-display font-bold leading-[0.88] tracking-[-0.04em] text-[#2C2926]"
                >
                  ECHO
                </h1>
              </div>
              <div className="overflow-hidden mt-1">
                <h1
                  data-hero-line
                  className="text-[clamp(5rem,9vw,11rem)] font-display font-bold leading-[0.88] tracking-[-0.04em] hero-text-outline"
                >
                  FIELD
                </h1>
              </div>
              <div className="mt-8 max-w-md">
                <p
                  data-hero-sub
                  className="text-lg text-[#3f3121]/80 leading-relaxed font-sans"
                >
                  Reveal the intelligence hidden inside every elephant field
                  recording. AI-powered noise removal for conservation research.
                </p>
                <Link
                  href="/upload"
                  data-hero-cta
                  className="pointer-events-auto inline-flex items-center gap-3 mt-8 px-8 py-4 bg-[#2C2926] text-ev-cream text-sm font-semibold rounded-full hover:bg-[#4A453F] transition-all duration-300 group"
                >
                  Start Analyzing
                  <svg
                    className="w-4 h-4 transition-transform group-hover:translate-x-1"
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M13 7l5 5m0 0l-5 5m5-5H6"
                    />
                  </svg>
                </Link>
              </div>
            </div>
          </div>

          {/* ── Mobile/Tablet hero text ── */}
          <div className="lg:hidden absolute top-24 left-0 right-0 z-[8] px-6 pointer-events-none">
            <div className="overflow-hidden">
              <h1
                data-hero-line
                className="text-[clamp(3rem,13vw,5.5rem)] font-display font-bold leading-[0.88] tracking-[-0.04em] text-[#2C2926]"
              >
                ECHO
              </h1>
            </div>
            <div className="overflow-hidden mt-1">
              <h1
                data-hero-line
                className="text-[clamp(3rem,13vw,5.5rem)] font-display font-bold leading-[0.88] tracking-[-0.04em] hero-text-outline"
              >
                FIELD
              </h1>
            </div>
            <p
              data-hero-sub
              className="mt-4 text-sm text-[#3f3121]/70 max-w-xs leading-relaxed"
            >
              AI-powered noise removal for elephant conservation research.
            </p>
            <Link
              href="/upload"
              data-hero-cta
              className="pointer-events-auto inline-flex items-center gap-2 mt-5 px-6 py-3 bg-[#2C2926] text-ev-cream text-sm font-semibold rounded-full"
            >
              Start Analyzing
              <svg
                className="w-4 h-4"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M13 7l5 5m0 0l-5 5m5-5H6"
                />
              </svg>
            </Link>
          </div>
        </div>

        {/* Scroll indicator */}
        <div
          data-scroll-ind
          className="absolute bottom-8 left-1/2 -translate-x-1/2 flex flex-col items-center gap-2 z-10"
        >
          <span className="text-[11px] text-[#5d4a34]/60 tracking-[0.25em] uppercase font-medium">
            Scroll
          </span>
          <svg
            className="w-4 h-4 text-[#5d4a34]/50"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M19 14l-7 7m0 0l-7-7"
            />
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
        {/* Wave: Hero -> Crisis */}
        <div
          className="w-full"
          style={{ marginTop: "-1px", marginBottom: "-1px" }}
        >
          <svg
            viewBox="0 0 1440 120"
            preserveAspectRatio="none"
            aria-hidden="true"
            className="block w-full"
            style={{ height: "clamp(60px, 10vw, 140px)" }}
          >
            <path
              d="M0,0 L1440,0 L1440,30 C1200,110 900,10 600,60 C300,110 120,40 0,80 L0,0 Z"
              fill="#a8875c"
            />
          </svg>
        </div>

        {/* Subtle texture */}
        <div
          className="absolute inset-0 opacity-[0.03]"
          style={{
            backgroundImage:
              "url(\"data:image/svg+xml,%3Csvg viewBox='0 0 256 256' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.7' numOctaves='3' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)'/%3E%3C/svg%3E\")",
          }}
        />

        <div className="relative max-w-7xl mx-auto px-6">
          <div className="mb-14">
            <span
              data-crisis-label
              className="text-sm font-semibold text-white/50 tracking-[0.2em] uppercase mb-4 block"
            >
              The Crisis
            </span>
            <h2
              data-crisis-title
              className="text-4xl md:text-5xl lg:text-6xl font-display font-semibold text-white mb-5"
            >
              They&apos;re Disappearing
            </h2>
            <p
              data-crisis-title
              className="text-lg text-white/60 max-w-xl"
            >
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

      {/* Wave: Crisis -> Threats */}
      <WaveDivider topColor="#C4A46C" bottomColor="#F8F5F0" variant={2} />

      {/* ═══════════════════════════════════════════
          THREATS — clean cards
         ═══════════════════════════════════════════ */}
      <section
        ref={threatsRef}
        className="relative py-20 md:py-28 overflow-hidden"
        style={{
          background:
            "linear-gradient(180deg, #F8F5F0 0%, #F0EBE3 40%, #EDE7DF 100%)",
        }}
      >
        <div className="relative max-w-7xl mx-auto px-6">
          <div data-threat-title className="text-center mb-16">
            <span className="text-sm font-semibold text-accent-savanna tracking-[0.2em] uppercase mb-4 block">
              Why This Happens
            </span>
            <h2 className="text-4xl md:text-5xl lg:text-6xl font-display font-semibold text-ev-charcoal mb-4">
              Three Forces
              <br />
              <span className="hero-text-outline text-[clamp(2.5rem,5.5vw,4.5rem)]">
                of Extinction
              </span>
            </h2>
            <p className="text-ev-elephant max-w-xl mx-auto mt-6">
              Understanding the threats is the first step to protecting these
              incredible creatures.
            </p>
          </div>

          <div className="grid md:grid-cols-3 gap-8">
            {[
              {
                icon: (
                  <svg
                    className="w-7 h-7"
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={1.5}
                      d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"
                    />
                  </svg>
                ),
                title: "Poaching for Ivory",
                desc: "The illegal ivory trade drives the slaughter of tens of thousands of elephants each year. Despite international bans, demand persists, fueling organized networks across Africa.",
                stat: "35,000",
                statLabel: "killed annually at peak",
                iconBg: "bg-nature-terracotta/10 text-nature-terracotta",
                accentColor: "#C4785A",
              },
              {
                icon: (
                  <svg
                    className="w-7 h-7"
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={1.5}
                      d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4"
                    />
                  </svg>
                ),
                title: "Human-Wildlife Conflict",
                desc: "As settlements expand into elephant habitats, deadly confrontations increase. Elephants raid crops, communities retaliate — a cycle that costs lives on both sides.",
                stat: "500+",
                statLabel: "human deaths per year",
                iconBg: "bg-accent-savanna/10 text-accent-savanna",
                accentColor: "#C4A46C",
              },
              {
                icon: (
                  <svg
                    className="w-7 h-7"
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={1.5}
                      d="M3.055 11H5a2 2 0 012 2v1a2 2 0 002 2 2 2 0 012 2v2.945M8 3.935V5.5A2.5 2.5 0 0010.5 8h.5a2 2 0 012 2 2 2 0 104 0 2 2 0 012-2h1.064M15 20.488V18a2 2 0 012-2h3.064M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
                    />
                  </svg>
                ),
                title: "Habitat Destruction",
                desc: "Deforestation, agriculture, and infrastructure fragment migration corridors. Without connected habitats, populations become isolated and genetically vulnerable.",
                stat: "75%",
                statLabel: "of habitat lost since 1900",
                iconBg: "bg-nature-sage/10 text-nature-deep-sage",
                accentColor: "#5A6B4F",
              },
            ].map((t, i) => (
              <div
                key={i}
                data-threat-card
                className="threat-card relative p-8 rounded-2xl bg-white/80 backdrop-blur-sm border border-ev-sand/60 shadow-sm hover:shadow-2xl transition-all duration-500 group hover:-translate-y-3"
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
                <div className="pt-4 border-t border-ev-cream flex items-baseline gap-2">
                  <span
                    className="text-2xl font-display font-bold"
                    style={{ color: t.accentColor }}
                  >
                    {t.stat}
                  </span>
                  <span className="text-xs text-ev-warm-gray">
                    {t.statLabel}
                  </span>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Wave: Threats -> Voice */}
      <WaveDivider topColor="#EDE7DF" bottomColor="#2C2926" variant={3} />

      {/* ═══════════════════════════════════════════
          THEIR VOICE — with particle field
         ═══════════════════════════════════════════ */}
      <section
        ref={voiceRef}
        className="relative py-20 md:py-28 bg-ev-charcoal overflow-hidden"
      >
        {/* WebGL particles */}
        <LazyParticleField
          className="z-0 opacity-60"
          count={180}
          color="#C4A46C"
          speed={0.008}
          size={0.03}
        />

        {/* Background waves */}
        <div className="absolute inset-0 opacity-[0.04]">
          <svg
            className="w-full h-full"
            viewBox="0 0 1440 400"
            preserveAspectRatio="none"
          >
            {[0, 1, 2].map((i) => (
              <path
                key={i}
                data-wave-line
                d={`M0 ${200 + i * 15} Q360 ${120 + i * 30} 720 ${200 + i * 15} Q1080 ${280 - i * 30} 1440 ${200 + i * 15}`}
                stroke="#C4A46C"
                strokeWidth={2 - i * 0.5}
                fill="none"
              />
            ))}
          </svg>
        </div>

        <div className="relative z-[1] max-w-7xl mx-auto px-6">
          <div className="grid md:grid-cols-2 gap-12 lg:gap-20 items-center">
            <div>
              <span
                data-voice-title
                className="text-sm font-semibold text-accent-savanna tracking-[0.2em] uppercase mb-4 block"
              >
                Their Voice
              </span>
              <h2
                data-voice-title
                className="text-4xl md:text-5xl lg:text-6xl font-display font-semibold text-ev-cream mb-8"
              >
                Communication
                <br />
                <span className="text-accent-savanna">Beyond</span> Human
                Hearing
              </h2>

              <div className="space-y-5">
                {[
                  "Elephants communicate using infrasound \u2014 frequencies below 20\u00A0Hz that travel up to 10\u00A0kilometers through ground and air.",
                  "These calls carry complex social information: warnings, greetings, mating signals, and emotional states we\u2019re only beginning to understand.",
                  "Field recordings capture these vocalizations, but environmental noise \u2014 wind, vehicles, aircraft \u2014 buries the signals researchers need.",
                ].map((txt, i) => (
                  <p
                    key={i}
                    data-voice-text
                    className="text-ev-dust/70 leading-relaxed"
                  >
                    {txt}
                  </p>
                ))}
              </div>
            </div>

            {/* Sound-wave visual */}
            <div data-voice-visual className="relative">
              <svg viewBox="0 0 400 300" className="w-full" fill="none">
                {[0, 1, 2, 3, 4].map((i) => (
                  <path
                    key={i}
                    data-voice-wave
                    d={`M50 ${150} Q125 ${100 - i * 18} 200 ${150} Q275 ${200 + i * 18} 350 ${150}`}
                    stroke="#C4A46C"
                    strokeWidth={2.5 - i * 0.35}
                    opacity={0.7 - i * 0.1}
                  />
                ))}
                {[0, 1, 2, 3, 4].map((i) => (
                  <path
                    key={`bg-${i}`}
                    data-wave-line
                    d={`M50 ${150} Q125 ${100 - i * 18} 200 ${150} Q275 ${200 + i * 18} 350 ${150}`}
                    stroke="#C4A46C"
                    strokeWidth={2.5 - i * 0.35}
                    opacity={0.1}
                  />
                ))}
                <text
                  x="200"
                  y="258"
                  textAnchor="middle"
                  fill="#8A837B"
                  fontSize="11"
                  fontFamily="var(--font-jakarta)"
                >
                  14 Hz — 120 Hz
                </text>
                <text
                  x="200"
                  y="278"
                  textAnchor="middle"
                  fill="#6B6560"
                  fontSize="9"
                  fontFamily="var(--font-jakarta)"
                >
                  Elephant vocalization frequency range
                </text>
              </svg>

              <div className="absolute top-4 right-4 w-20 h-20 rounded-full border border-accent-savanna/10" />
              <div className="absolute top-8 right-8 w-12 h-12 rounded-full border border-accent-savanna/20" />
              <div className="absolute top-[2.75rem] right-[2.75rem] w-4 h-4 rounded-full bg-accent-savanna/30" />
            </div>
          </div>
        </div>
      </section>

      {/* Wave: Voice -> Solution */}
      <WaveDivider topColor="#2C2926" bottomColor="#F0EBE3" variant={4} />

      {/* ═══════════════════════════════════════════
          SOLUTION
         ═══════════════════════════════════════════ */}
      <section ref={solutionRef} className="py-20 md:py-28 bg-ev-cream">
        <div className="max-w-7xl mx-auto px-6">
          <div className="grid md:grid-cols-2 gap-12 lg:gap-20 items-center">
            {/* Spectrogram mockup */}
            <div
              data-sol-left
              className="relative aspect-[4/3] rounded-2xl overflow-hidden bg-ev-charcoal p-1"
            >
              <div className="w-full h-full rounded-xl overflow-hidden relative bg-gradient-to-br from-spectrogram-low via-[#0a2540] to-spectrogram-low">
                {[12, 22, 35, 45, 58, 68, 78, 88].map((top, i) => (
                  <div
                    key={i}
                    className="absolute h-[2px] left-[5%] right-[5%] bg-spectrogram-mid/20"
                    style={{
                      top: `${top}%`,
                      opacity: 0.15 + (i % 3) * 0.08,
                    }}
                  />
                ))}
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
                <div
                  data-scan-line
                  className="absolute top-[3%] bottom-[3%] w-[2px] bg-gradient-to-b from-transparent via-accent-savanna to-transparent opacity-60"
                  style={{ left: "5%" }}
                />
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
              <h2 className="text-4xl md:text-5xl lg:text-6xl font-display font-semibold text-ev-charcoal mb-6">
                AI-Powered
                <br />
                <span className="hero-text-outline text-[clamp(2.5rem,5.5vw,4.5rem)]">
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
                  <div
                    key={i}
                    data-sol-feature
                    className="flex items-start gap-3"
                  >
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
                      <div className="text-xs text-ev-elephant">
                        {item.desc}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Wave: Solution -> Steps */}
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
            <h2 className="text-4xl md:text-5xl lg:text-6xl font-display font-semibold text-ev-charcoal">
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
                  <svg
                    className="w-6 h-6 text-white"
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12"
                    />
                  </svg>
                ),
              },
              {
                step: "02",
                title: "Process",
                desc: "AI identifies noise types, applies spectral gating, and extracts clean elephant vocalizations in seconds.",
                color: "bg-accent-gold",
                icon: (
                  <svg
                    className="w-6 h-6 text-white"
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M13 10V3L4 14h7v7l9-11h-7z"
                    />
                  </svg>
                ),
              },
              {
                step: "03",
                title: "Analyze",
                desc: "Compare spectrograms, listen to cleaned audio, review detected calls, and export research-grade data.",
                color: "bg-nature-sage",
                icon: (
                  <svg
                    className="w-6 h-6 text-white"
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z"
                    />
                  </svg>
                ),
              },
            ].map((s, i) => (
              <div
                key={i}
                data-step-card
                className="relative text-center"
                style={{ perspective: "600px" }}
              >
                <div
                  className={`w-14 h-14 ${s.color} rounded-2xl flex items-center justify-center mx-auto mb-6 shadow-lg`}
                >
                  {s.icon}
                </div>
                <div
                  data-step-num
                  className="text-5xl font-display font-bold text-ev-sand/30 mb-3"
                >
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

      {/* Wave: Steps -> CTA */}
      <WaveDivider topColor="#F8F5F0" bottomColor="#2C2926" variant={2} />

      {/* ═══════════════════════════════════════════
          CTA — with particle field
         ═══════════════════════════════════════════ */}
      <section
        ref={ctaRef}
        className="relative py-24 md:py-32 bg-ev-charcoal overflow-hidden"
      >
        {/* WebGL particles */}
        <LazyParticleField
          className="z-0 opacity-50"
          count={200}
          color="#C4A46C"
          speed={0.01}
          size={0.04}
        />

        {/* Animated rings */}
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
          className="relative z-[1] max-w-3xl mx-auto px-6 text-center"
        >
          <h2 className="text-4xl md:text-5xl lg:text-7xl font-display font-semibold text-ev-cream mb-6 leading-[0.95]">
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
            Upload a Recording
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
                d="M13 7l5 5m0 0l-5 5m5-5H6"
              />
            </svg>
          </Link>
          <p className="mt-10 text-sm text-ev-dust/35">
            Built in partnership with{" "}
            <span className="text-accent-savanna/50">ElephantVoices</span> for
            HackSMU 2026
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
