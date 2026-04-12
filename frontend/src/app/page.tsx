"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import Link from "next/link";
import gsap from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";

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
    <div className="wave-divider" style={{ background: bottomColor, marginTop: "-1px" }}>
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

  const [ripples, setRipples] = useState<
    { id: number; x: number; y: number }[]
  >([]);
  const [mobileNav, setMobileNav] = useState(false);

  /* ── Globe click ── */
  const handleGlobeClick = useCallback(
    (e: React.MouseEvent) => {
      const id = Date.now();
      setRipples((prev) => [...prev, { id, x: e.clientX, y: e.clientY }]);
      setTimeout(
        () => setRipples((prev) => prev.filter((r) => r.id !== id)),
        1500
      );

      gsap.to("[data-globe-sphere]", {
        attr: { r: 36 },
        duration: 0.25,
        yoyo: true,
        repeat: 1,
      });
      gsap.to("[data-globe-glow]", {
        attr: { r: 65 },
        opacity: 0.9,
        duration: 0.35,
        yoyo: true,
        repeat: 1,
      });

      setTimeout(
        () =>
          document
            .getElementById("crisis")
            ?.scrollIntoView({ behavior: "smooth" }),
        700
      );
    },
    []
  );

  /* ── GSAP orchestration ── */
  useEffect(() => {
    gsap.registerPlugin(ScrollTrigger);

    const ctx = gsap.context(() => {
      /* ═══ HERO INTRO ═══ */
      const hero = gsap.timeline({ defaults: { ease: "power3.out" } });
      hero
        .from("[data-nav]", { y: -50, opacity: 0, duration: 0.8 })
        .from("[data-badge]", { scale: 0.8, opacity: 0, duration: 0.5 }, "-=0.3")
        .from("[data-hero-word]", {
          y: 70,
          opacity: 0,
          rotateX: -15,
          stagger: 0.07,
          duration: 0.75,
        }, "-=0.2")
        .from("[data-hero-sub]", { y: 30, opacity: 0, duration: 0.6 }, "-=0.3")
        .from("[data-hero-cta]", {
          x: -30,
          opacity: 0,
          stagger: 0.12,
          duration: 0.5,
        }, "-=0.3")
        .from("[data-elephant]", {
          x: 120,
          y: 60,
          scale: 0.85,
          opacity: 0,
          duration: 1.2,
          ease: "power2.out",
        }, "-=0.7")
        .from("[data-globe-sphere]", {
          scale: 0,
          opacity: 0,
          duration: 0.8,
          ease: "power4.out",
        }, "-=0.3")
        .from("[data-globe-glow]", { scale: 0, opacity: 0, duration: 0.5 }, "-=0.5")
        .from("[data-scroll-ind]", { opacity: 0, y: -10, duration: 0.4 }, "-=0.2");

      /* ═══ HERO SCROLL PARALLAX ═══ */
      /* nav blur + solidify on scroll */
      ScrollTrigger.create({
        trigger: heroRef.current,
        start: "5% top",
        onEnter: () => {
          gsap.to("[data-nav]", {
            backgroundColor: "rgba(44,41,38,0.85)",
            backdropFilter: "blur(16px)",
            duration: 0.3,
          });
          gsap.to("[data-nav-edge-path]", {
            attr: { fill: "rgba(44,41,38,0.85)" },
            duration: 0.3,
          });
        },
        onLeaveBack: () => {
          gsap.to("[data-nav]", {
            backgroundColor: "transparent",
            backdropFilter: "none",
            duration: 0.3,
          });
          gsap.to("[data-nav-edge-path]", {
            attr: { fill: "rgba(44,41,38,0)" },
            duration: 0.3,
          });
        },
      });

      /* Hero text parallax — moves up faster than scroll */
      gsap.to("[data-hero-content]", {
        y: -100,
        opacity: 0.3,
        scrollTrigger: {
          trigger: heroRef.current,
          start: "top top",
          end: "bottom top",
          scrub: 1,
        },
      });

      /* Elephant parallax — moves down slower */
      gsap.to("[data-elephant]", {
        y: 80,
        scale: 1.05,
        scrollTrigger: {
          trigger: heroRef.current,
          start: "top top",
          end: "bottom top",
          scrub: 1.5,
        },
      });

      /* BG blobs parallax */
      gsap.to("[data-hero-blob]", {
        y: -120,
        scrollTrigger: {
          trigger: heroRef.current,
          start: "top top",
          end: "bottom top",
          scrub: 1.2,
        },
      });

      /* particles drift */
      gsap.utils.toArray<HTMLElement>("[data-particle]").forEach((p) => {
        gsap.to(p, {
          y: -(30 + Math.random() * 60),
          x: Math.random() * 30 - 15,
          scrollTrigger: {
            trigger: heroRef.current,
            start: "top top",
            end: "bottom top",
            scrub: 1 + Math.random(),
          },
        });
      });

      /* globe float */
      gsap.to("[data-globe-group]", {
        y: -8,
        duration: 2.5,
        ease: "sine.inOut",
        yoyo: true,
        repeat: -1,
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

  /* ── Particles seed (stable across renders) ── */
  const particles = useRef(
    Array.from({ length: 22 }, () => ({
      x: 5 + Math.random() * 90,
      y: 5 + Math.random() * 90,
      size: 1 + Math.random() * 2.5,
      opacity: 0.06 + Math.random() * 0.12,
    }))
  ).current;

  return (
    <div ref={containerRef} className="landing-page">
      {/* ── Ripple overlays from globe press ── */}
      {ripples.map((r) => (
        <div
          key={r.id}
          className="fixed pointer-events-none z-[100]"
          style={{ left: r.x, top: r.y }}
        >
          {[0, 1, 2].map((i) => (
            <div
              key={i}
              className="absolute w-14 h-14 rounded-full border-2 border-accent-savanna/50"
              style={{
                animation: `ripple 1.2s ease-out ${i * 0.2}s forwards`,
              }}
            />
          ))}
        </div>
      ))}

      {/* ═══════════════════════════════════════════
          NAV
         ═══════════════════════════════════════════ */}
      <nav
        data-nav
        className="fixed top-0 left-0 right-0 z-50 transition-colors"
      >
        <div className="max-w-7xl mx-auto flex items-center justify-between px-6 py-4">
          <Link
            href="/"
            className="text-2xl font-display font-semibold text-accent-savanna"
          >
            EchoField
          </Link>

          {/* Desktop */}
          <div className="hidden md:flex items-center gap-8">
            {["About", "Upload", "Database"].map((item) => (
              <Link
                key={item}
                href={`/${item.toLowerCase()}`}
                className="text-sm font-medium text-ev-dust/80 hover:text-accent-savanna transition-colors duration-300"
              >
                {item}
              </Link>
            ))}
            <Link
              href="/upload"
              className="px-5 py-2 rounded-full bg-accent-savanna text-ev-ivory text-sm font-semibold hover:bg-accent-gold transition-colors duration-300"
            >
              Get Started
            </Link>
          </div>

          {/* Mobile hamburger */}
          <button
            onClick={() => setMobileNav(!mobileNav)}
            className="md:hidden flex items-center justify-center w-10 h-10 text-ev-dust"
            aria-label="Menu"
            aria-expanded={mobileNav}
          >
            <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              {mobileNav ? (
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              ) : (
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
              )}
            </svg>
          </button>
        </div>

        {/* Mobile menu */}
        <div
          className={`md:hidden bg-ev-charcoal/95 backdrop-blur-md border-t border-ev-charcoal-light/20 px-6 overflow-hidden transition-all duration-300 ease-out ${
            mobileNav ? "max-h-60 py-4 opacity-100" : "max-h-0 py-0 opacity-0"
          }`}
        >
          {["About", "Upload", "Database"].map((item) => (
            <Link
              key={item}
              href={`/${item.toLowerCase()}`}
              onClick={() => setMobileNav(false)}
              className="block py-3 text-sm font-medium text-ev-dust hover:text-accent-savanna transition-colors"
            >
              {item}
            </Link>
          ))}
        </div>

        {/* Decorative bottom edge */}
        <svg
          className="absolute left-0 right-0 top-full w-full h-3 pointer-events-none"
          viewBox="0 0 1440 12"
          preserveAspectRatio="none"
          aria-hidden="true"
          data-nav-edge
        >
          <path
            d="M0,0 C240,12 480,4 720,8 C960,12 1200,2 1440,6 L1440,0 L0,0 Z"
            fill="rgba(44,41,38,0)"
            data-nav-edge-path
          />
        </svg>
      </nav>

      {/* ═══════════════════════════════════════════
          HERO
         ═══════════════════════════════════════════ */}
      <section
        ref={heroRef}
        className="relative min-h-screen flex items-center bg-ev-charcoal overflow-hidden"
      >
        {/* BG blobs */}
        <div
          data-hero-blob
          className="absolute top-[-8%] left-[8%] w-[500px] h-[500px] rounded-full bg-accent-savanna/[0.04] blur-[140px]"
        />
        <div
          data-hero-blob
          className="absolute bottom-[5%] right-[25%] w-[400px] h-[400px] rounded-full bg-accent-gold/[0.04] blur-[120px]"
        />
        <div
          data-hero-blob
          className="absolute top-[40%] right-[5%] w-[350px] h-[350px] rounded-full bg-nature-terracotta/[0.03] blur-[100px]"
        />

        {/* Particles */}
        {particles.map((p, i) => (
          <div
            key={i}
            data-particle
            className="absolute rounded-full bg-accent-savanna"
            style={{
              left: `${p.x}%`,
              top: `${p.y}%`,
              width: p.size,
              height: p.size,
              opacity: p.opacity,
            }}
          />
        ))}

        {/* Noise texture */}
        <div
          className="absolute inset-0 opacity-[0.025]"
          style={{
            backgroundImage:
              "url(\"data:image/svg+xml,%3Csvg viewBox='0 0 256 256' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.85' numOctaves='4' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)'/%3E%3C/svg%3E\")",
          }}
        />

        {/* Content */}
        <div data-hero-content className="relative z-10 max-w-7xl mx-auto px-6 pt-28 pb-20 w-full">
          <div className="max-w-2xl">
            {/* Badge */}
            <div
              data-badge
              className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full border border-accent-savanna/25 bg-accent-savanna/[0.08] mb-10"
            >
              <span className="w-2 h-2 rounded-full bg-accent-savanna animate-pulse" />
              <span className="text-accent-savanna text-sm font-medium tracking-wide">
                HackSMU 2026 &times; ElephantVoices
              </span>
            </div>

            {/* Headline */}
            <h1 className="mb-8 leading-[1.08]">
              {[
                { text: "Every", accent: false },
                { text: "Voice", accent: true },
                { text: "Deserves", accent: false },
                { text: "to\u00A0Be", accent: false },
                { text: "Heard.", accent: true },
              ].map((w, i) => (
                <span
                  key={i}
                  data-hero-word
                  className={`inline-block mr-3 md:mr-5 text-5xl sm:text-6xl md:text-7xl lg:text-[5.5rem] font-display font-semibold ${
                    w.accent ? "text-accent-savanna" : "text-ev-cream"
                  }`}
                  style={{ perspective: "600px" }}
                >
                  {w.text}
                </span>
              ))}
            </h1>

            {/* Sub */}
            <p
              data-hero-sub
              className="text-lg md:text-xl text-ev-dust/70 max-w-lg mb-12 leading-relaxed"
            >
              Remove noise from elephant field recordings, reveal hidden
              vocalizations, and help protect Earth&apos;s most magnificent
              creatures.
            </p>

            {/* CTAs */}
            <div className="flex flex-wrap gap-4">
              <Link
                href="/upload"
                data-hero-cta
                className="group inline-flex items-center gap-2 px-8 py-4 bg-accent-savanna text-ev-ivory font-semibold rounded-full hover:bg-accent-gold transition-all duration-300 hover:shadow-lg hover:shadow-accent-savanna/20"
              >
                Start Analyzing
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
              <a
                href="#crisis"
                data-hero-cta
                className="inline-flex items-center gap-2 px-8 py-4 border border-ev-dust/25 text-ev-dust font-semibold rounded-full hover:border-accent-savanna hover:text-accent-savanna transition-all duration-300"
              >
                Learn More
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 14l-7 7m0 0l-7-7" />
                </svg>
              </a>
            </div>
          </div>
        </div>

        {/* ── Elephant Illustration ── */}
        <div
          data-elephant
          className="absolute bottom-0 right-0 w-[280px] sm:w-[360px] md:w-[440px] lg:w-[520px] xl:w-[580px] pointer-events-none"
          style={{
            aspectRatio: "6 / 7",
            transform: "translate(18%, 16%)",
          }}
        >
          <svg
            viewBox="0 0 600 700"
            className="w-full h-full"
            fill="none"
            aria-hidden="true"
          >
            <defs>
              <radialGradient id="gg" cx="50%" cy="50%" r="50%">
                <stop offset="0%" stopColor="#c4a46c" stopOpacity="0.5" />
                <stop offset="60%" stopColor="#c4a46c" stopOpacity="0.12" />
                <stop offset="100%" stopColor="#c4a46c" stopOpacity="0" />
              </radialGradient>
              {/* Body depth gradient */}
              <radialGradient id="el-body-grad" cx="40%" cy="35%" r="65%">
                <stop offset="0%" stopColor="#4a453f" />
                <stop offset="60%" stopColor="#3d3835" />
                <stop offset="100%" stopColor="#332f2b" />
              </radialGradient>
              {/* Head gradient */}
              <radialGradient id="el-head-grad" cx="45%" cy="35%" r="60%">
                <stop offset="0%" stopColor="#4d4842" />
                <stop offset="50%" stopColor="#423d39" />
                <stop offset="100%" stopColor="#3a3632" />
              </radialGradient>
              {/* Ear gradient */}
              <radialGradient id="el-ear-grad" cx="45%" cy="40%" r="60%">
                <stop offset="0%" stopColor="#3a3632" />
                <stop offset="60%" stopColor="#302c29" />
                <stop offset="100%" stopColor="#282522" />
              </radialGradient>
              {/* Ear inner skin */}
              <radialGradient id="el-ear-inner" cx="50%" cy="45%" r="50%">
                <stop offset="0%" stopColor="#5a4f45" stopOpacity="0.15" />
                <stop offset="100%" stopColor="#3a3632" stopOpacity="0" />
              </radialGradient>
              {/* Tusk gradient */}
              <linearGradient id="el-tusk-grad" x1="0" y1="0" x2="0.3" y2="1">
                <stop offset="0%" stopColor="#f0ebe3" />
                <stop offset="50%" stopColor="#e8e0d5" />
                <stop offset="100%" stopColor="#d4ccc3" />
              </linearGradient>
              {/* Trunk gradient */}
              <linearGradient id="el-trunk-grad" x1="0" y1="0" x2="1" y2="1">
                <stop offset="0%" stopColor="#423d39" />
                <stop offset="100%" stopColor="#3a3632" />
              </linearGradient>
              {/* Ambient glow behind elephant */}
              <radialGradient id="el-ambient" cx="50%" cy="50%" r="50%">
                <stop offset="0%" stopColor="#c4a46c" stopOpacity="0.06" />
                <stop offset="100%" stopColor="#c4a46c" stopOpacity="0" />
              </radialGradient>
            </defs>

            {/* Ambient glow */}
            <ellipse cx="380" cy="380" rx="280" ry="320" fill="url(#el-ambient)" />

            {/* ── Ear (behind head) ── */}
            <ellipse
              cx="280"
              cy="310"
              rx="165"
              ry="210"
              fill="url(#el-ear-grad)"
              opacity="0.92"
              transform="rotate(-12 280 310)"
            />
            {/* Ear inner color */}
            <ellipse
              cx="278"
              cy="315"
              rx="130"
              ry="170"
              fill="url(#el-ear-inner)"
              transform="rotate(-12 278 315)"
            />
            {/* Ear veins/ridges */}
            <path d="M230 200 Q255 290 248 390 Q258 430 275 455" stroke="#4a453f" strokeWidth="1.8" opacity="0.18" fill="none" />
            <path d="M255 215 Q272 300 266 400 Q270 430 280 450" stroke="#4a453f" strokeWidth="1.2" opacity="0.14" fill="none" />
            <path d="M210 260 Q235 310 240 360" stroke="#4a453f" strokeWidth="1" opacity="0.1" fill="none" />
            {/* Ear rim detail */}
            <ellipse
              cx="280"
              cy="312"
              rx="148"
              ry="190"
              fill="none"
              stroke="#4a453f"
              strokeWidth="1.5"
              opacity="0.12"
              transform="rotate(-12 280 312)"
            />
            <ellipse
              cx="280"
              cy="318"
              rx="110"
              ry="145"
              fill="none"
              stroke="#4a453f"
              strokeWidth="1"
              opacity="0.08"
              transform="rotate(-12 280 318)"
            />

            {/* ── Body ── */}
            <ellipse cx="520" cy="530" rx="190" ry="295" fill="url(#el-body-grad)" />
            {/* Body contour lines */}
            <path d="M380 350 Q400 420 410 520" stroke="#4a453f" strokeWidth="1" opacity="0.08" fill="none" />
            <path d="M560 300 Q580 400 575 520" stroke="#504b45" strokeWidth="0.8" opacity="0.06" fill="none" />

            {/* ── Head ── */}
            <path
              d="M360 185 Q410 155 480 170 Q530 195 548 260 Q560 340 535 420 Q510 470 460 475 Q420 472 385 440 Q350 395 340 330 Q330 260 345 210 Z"
              fill="url(#el-head-grad)"
            />
            {/* Forehead dome highlight */}
            <ellipse cx="430" cy="200" rx="60" ry="30" fill="#504b45" opacity="0.12" />

            {/* Brow ridges */}
            <path d="M375 210 Q420 190 475 205" stroke="#504b45" strokeWidth="2" opacity="0.18" fill="none" />
            <path d="M380 225 Q420 208 470 220" stroke="#504b45" strokeWidth="1.5" opacity="0.12" fill="none" />
            <path d="M385 240 Q420 228 465 238" stroke="#504b45" strokeWidth="1" opacity="0.08" fill="none" />

            {/* ── Trunk ── */}
            <path
              d="M385 430 Q350 480 310 505 Q260 535 200 540 Q150 535 115 505 Q75 465 55 405 Q35 340 30 270 Q28 200 50 150 Q68 110 90 85"
              stroke="url(#el-trunk-grad)"
              strokeWidth="52"
              strokeLinecap="round"
              fill="none"
            />
            {/* Trunk tip curl */}
            <path
              d="M90 85 Q78 60 82 45 Q88 30 102 40"
              stroke="#3d3835"
              strokeWidth="30"
              strokeLinecap="round"
              fill="none"
            />
            {/* Trunk underside — lighter edge */}
            <path
              d="M395 420 Q360 470 320 495 Q270 525 210 530"
              stroke="#504b45"
              strokeWidth="2"
              opacity="0.12"
              fill="none"
            />

            {/* Trunk wrinkle rings */}
            {[
              { d: "M350 460 Q325 468 305 462", o: 0.28 },
              { d: "M315 485 Q290 495 268 488", o: 0.25 },
              { d: "M275 508 Q248 518 222 514", o: 0.22 },
              { d: "M225 525 Q200 530 178 522", o: 0.2 },
              { d: "M178 520 Q155 510 135 495", o: 0.18 },
              { d: "M130 488 Q112 468 98 442", o: 0.16 },
              { d: "M92 430 Q78 400 68 365", o: 0.14 },
              { d: "M62 350 Q52 310 48 275", o: 0.12 },
              { d: "M48 260 Q48 228 55 198", o: 0.1 },
              { d: "M58 185 Q68 155 82 130", o: 0.09 },
              { d: "M85 120 Q92 105 98 92", o: 0.08 },
            ].map((w, i) => (
              <path key={i} d={w.d} stroke="#5a5550" strokeWidth="1.5" opacity={w.o} fill="none" />
            ))}

            {/* ── Eye ── */}
            {/* Eye socket shadow */}
            <ellipse cx="458" cy="282" rx="18" ry="14" fill="#2c2926" opacity="0.2" />
            {/* Eye white */}
            <ellipse cx="458" cy="280" rx="13" ry="10" fill="#35312d" />
            {/* Iris */}
            <circle cx="458" cy="278" r="7.5" fill="#c4a46c" opacity="0.95" />
            {/* Pupil */}
            <circle cx="459" cy="277" r="3.5" fill="#1a1815" />
            {/* Eye highlight */}
            <circle cx="455" cy="275" r="2.5" fill="white" opacity="0.35" />
            <circle cx="462" cy="280" r="1" fill="white" opacity="0.15" />
            {/* Crow's feet / expression lines */}
            <path d="M473 274 Q480 270 487 272" stroke="#504b45" strokeWidth="0.8" opacity="0.18" fill="none" />
            <path d="M474 280 Q480 280 486 278" stroke="#504b45" strokeWidth="0.8" opacity="0.14" fill="none" />
            <path d="M474 286 Q479 288 484 286" stroke="#504b45" strokeWidth="0.7" opacity="0.1" fill="none" />
            {/* Under-eye */}
            <path d="M445 290 Q455 296 468 292" stroke="#504b45" strokeWidth="0.8" opacity="0.12" fill="none" />

            {/* ── Tusks ── */}
            {/* Main tusk */}
            <path
              d="M452 440 Q470 490 465 545 Q460 590 445 620"
              stroke="url(#el-tusk-grad)"
              strokeWidth="11"
              strokeLinecap="round"
              fill="none"
            />
            {/* Tusk highlight edge */}
            <path
              d="M450 445 Q466 488 463 535 Q459 575 447 605"
              stroke="white"
              strokeWidth="2"
              strokeLinecap="round"
              fill="none"
              opacity="0.12"
            />
            {/* Second tusk (behind, partially visible) */}
            <path
              d="M420 445 Q432 485 430 530 Q428 560 420 580"
              stroke="#d4ccc3"
              strokeWidth="7"
              strokeLinecap="round"
              fill="none"
              opacity="0.35"
            />

            {/* ── Skin texture dots ── */}
            {[
              [480, 340], [500, 370], [465, 390], [510, 320],
              [490, 410], [520, 360], [475, 350], [530, 400],
              [445, 370], [395, 350], [410, 310], [435, 340],
            ].map(([cx, cy], i) => (
              <circle key={i} cx={cx} cy={cy} r={0.8 + (i % 3) * 0.4} fill="#5a5550" opacity={0.06 + (i % 4) * 0.02} />
            ))}

            {/* ── Globe group ── */}
            <g data-globe-group>
              <circle
                data-globe-glow
                cx="100"
                cy="30"
                r="50"
                fill="url(#gg)"
                className="globe-pulse"
              />
              <circle
                data-globe-sphere
                cx="100"
                cy="30"
                r="28"
                fill="#c4a46c"
              />
              {/* Africa silhouette */}
              <path
                d="M95 12 Q98 10 102 12 Q108 18 110 28 Q112 38 108 48 Q104 52 100 50 Q94 46 92 38 Q88 28 90 18 Q92 14 95 12Z"
                fill="#8b6e2f"
                opacity="0.4"
              />
              {/* Grid lines */}
              <ellipse cx="100" cy="30" rx="28" ry="10" stroke="#8b6e2f" strokeWidth="0.5" opacity="0.2" fill="none" />
              <ellipse cx="100" cy="30" rx="14" ry="28" stroke="#8b6e2f" strokeWidth="0.5" opacity="0.2" fill="none" />
              <line x1="72" y1="30" x2="128" y2="30" stroke="#8b6e2f" strokeWidth="0.3" opacity="0.15" />
              {/* Highlight */}
              <circle cx="90" cy="20" r="8" fill="white" opacity="0.12" />
            </g>
          </svg>

          {/* Globe click target */}
          <button
            onClick={handleGlobeClick}
            className="absolute rounded-full pointer-events-auto hover:scale-110 transition-transform duration-300 focus:outline-none focus:ring-2 focus:ring-accent-savanna/50 focus:ring-offset-2 focus:ring-offset-ev-charcoal"
            style={{
              left: "16.7%",
              top: "4.3%",
              width: "10%",
              aspectRatio: "1",
              transform: "translate(-50%,-50%)",
            }}
            aria-label="Explore the elephant crisis"
          />
        </div>

        {/* Scroll indicator */}
        <div
          data-scroll-ind
          className="absolute bottom-8 left-1/2 -translate-x-1/2 flex flex-col items-center gap-2 z-10"
        >
          <span className="text-[11px] text-ev-dust/50 tracking-[0.25em] uppercase font-medium">
            Scroll
          </span>
          <svg className="w-4 h-4 text-ev-dust/40" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 14l-7 7m0 0l-7-7" />
          </svg>
        </div>
      </section>

      {/* ── Wave: Hero → Crisis ── */}
      <WaveDivider topColor="#2C2926" bottomColor="#8B5E3C" variant={1} />

      {/* ═══════════════════════════════════════════
          CRISIS / STATS
         ═══════════════════════════════════════════ */}
      <section
        ref={crisisRef}
        id="crisis"
        className="relative py-20 md:py-28"
        style={{
          background:
            "linear-gradient(180deg, #8B5E3C 0%, #B0764E 15%, #C4785A 30%, #C48B5A 50%, #C89E60 70%, #C4A46C 100%)",
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
        className="relative py-20 md:py-28 bg-ev-charcoal overflow-hidden"
      >
        {/* BG waves */}
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

        <div className="relative max-w-7xl mx-auto px-6">
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
                className="text-4xl md:text-5xl font-display font-semibold text-ev-cream mb-8"
              >
                Communication Beyond Human Hearing
              </h2>

              <div className="space-y-5">
                {[
                  "Elephants communicate using infrasound — frequencies below 20\u00A0Hz that travel up to 10\u00A0kilometers through ground and air.",
                  "These calls carry complex social information: warnings, greetings, mating signals, and emotional states we\u2019re only beginning to understand.",
                  "Field recordings capture these vocalizations, but environmental noise — wind, vehicles, aircraft — buries the signals researchers need.",
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
                    stroke="#C4A46C"
                    strokeWidth={2.5 - i * 0.35}
                    opacity={0.7 - i * 0.1}
                  />
                ))}
                {/* Background oscillation waves */}
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
                {/* Frequency labels */}
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

              {/* Decorative rings */}
              <div className="absolute top-4 right-4 w-20 h-20 rounded-full border border-accent-savanna/10" />
              <div className="absolute top-8 right-8 w-12 h-12 rounded-full border border-accent-savanna/20" />
              <div className="absolute top-[2.75rem] right-[2.75rem] w-4 h-4 rounded-full bg-accent-savanna/30" />
            </div>
          </div>
        </div>
      </section>

      {/* ── Wave: Voice → Solution ── */}
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
                {/* Noise bands */}
                {[12, 22, 35, 45, 58, 68, 78, 88].map((top, i) => (
                  <div
                    key={i}
                    className="absolute h-[2px] left-[5%] right-[5%] bg-spectrogram-mid/20"
                    style={{ top: `${top}%`, opacity: 0.15 + (i % 3) * 0.08 }}
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
