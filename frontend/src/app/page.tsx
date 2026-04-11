"use client";

import { useState, useEffect, useRef } from "react";
import Link from "next/link";

function AnimatedCounter({
  target,
  suffix = "",
  duration = 2000,
}: {
  target: number;
  suffix?: string;
  duration?: number;
}) {
  const [count, setCount] = useState(0);
  const ref = useRef<HTMLSpanElement>(null);
  const hasAnimated = useRef(false);

  useEffect(() => {
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting && !hasAnimated.current) {
          hasAnimated.current = true;
          const startTime = performance.now();
          const animate = (now: number) => {
            const elapsed = now - startTime;
            const progress = Math.min(elapsed / duration, 1);
            const eased = 1 - Math.pow(1 - progress, 3);
            setCount(Math.round(target * eased));
            if (progress < 1) requestAnimationFrame(animate);
          };
          requestAnimationFrame(animate);
        }
      },
      { threshold: 0.3 }
    );
    if (ref.current) observer.observe(ref.current);
    return () => observer.disconnect();
  }, [target, duration]);

  return (
    <span ref={ref}>
      {count}
      {suffix}
    </span>
  );
}

export default function LandingPage() {
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  return (
    <div className="min-h-screen bg-ev-ivory">
      {/* Hero Section */}
      <section className="relative overflow-hidden">
        <div className="absolute inset-0 pointer-events-none">
          <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[800px] h-[600px] bg-accent-savanna/5 rounded-full blur-[120px]" />
          <div className="absolute bottom-0 right-0 w-[400px] h-[400px] bg-accent-gold/5 rounded-full blur-[100px]" />
        </div>

        <div className="relative max-w-6xl mx-auto px-6 pt-24 pb-20">
          <div
            className={`inline-flex items-center gap-2 px-4 py-1.5 rounded-full border border-accent-gold/30 bg-accent-gold/5 mb-8 transition-all duration-700 ${
              mounted ? "opacity-100 translate-y-0" : "opacity-0 translate-y-4"
            }`}
          >
            <span className="w-2 h-2 rounded-full bg-accent-gold animate-pulse" />
            <span className="text-accent-gold text-sm font-medium">
              HackSMU 2026 &middot; ElephantVoices Track
            </span>
          </div>

          <h1
            className={`text-5xl md:text-7xl font-bold leading-tight mb-6 transition-all duration-700 delay-100 ${
              mounted ? "opacity-100 translate-y-0" : "opacity-0 translate-y-4"
            }`}
          >
            <span className="text-accent-gold">Elephant Vocalization</span>
            <br />
            <span className="text-ev-charcoal">
              Noise Removal &amp; Research
            </span>
          </h1>

          <p
            className={`text-xl md:text-2xl text-ev-elephant max-w-2xl mb-12 transition-all duration-700 delay-200 ${
              mounted ? "opacity-100 translate-y-0" : "opacity-0 translate-y-4"
            }`}
          >
            Hear what researchers hear. Remove the noise, reveal the voice.
          </p>

          <div
            className={`flex flex-wrap gap-4 mb-20 transition-all duration-700 delay-300 ${
              mounted ? "opacity-100 translate-y-0" : "opacity-0 translate-y-4"
            }`}
          >
            <Link
              href="/upload"
              className="inline-flex items-center gap-2 px-8 py-4 bg-success text-white font-semibold rounded-xl hover:bg-success/90 transition-all hover:shadow-lg hover:shadow-success/20 hover:-translate-y-0.5"
            >
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
              </svg>
              Upload Recording
            </Link>
            <a
              href="#how-it-works"
              className="inline-flex items-center gap-2 px-8 py-4 border border-accent-savanna text-accent-savanna font-semibold rounded-xl hover:bg-accent-savanna/10 transition-all hover:-translate-y-0.5"
            >
              How It Works
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
              </svg>
            </a>
          </div>

          <div
            className={`grid grid-cols-3 gap-8 max-w-xl transition-all duration-700 delay-[400ms] ${
              mounted ? "opacity-100 translate-y-0" : "opacity-0 translate-y-4"
            }`}
          >
            <div className="text-center">
              <div className="text-4xl font-bold text-accent-savanna">
                <AnimatedCounter target={44} />
              </div>
              <div className="text-sm text-ev-warm-gray mt-1">Recordings</div>
            </div>
            <div className="text-center">
              <div className="text-4xl font-bold text-accent-gold">
                <AnimatedCounter target={212} />
              </div>
              <div className="text-sm text-ev-warm-gray mt-1">Calls Detected</div>
            </div>
            <div className="text-center">
              <div className="text-4xl font-bold text-success">
                <AnimatedCounter target={89} suffix="%" />
              </div>
              <div className="text-sm text-ev-warm-gray mt-1">Success Rate</div>
            </div>
          </div>
        </div>
      </section>

      {/* Why This Matters */}
      <section className="py-20 bg-ev-cream">
        <div className="max-w-6xl mx-auto px-6">
          <h2 className="text-3xl font-bold text-ev-charcoal mb-4">
            Why This Matters
          </h2>
          <p className="text-ev-elephant mb-12 max-w-2xl">
            Elephant communication holds keys to understanding their social
            structures, emotional states, and conservation needs.
          </p>

          <div className="grid md:grid-cols-2 gap-6">
            {[
              {
                icon: "M9 19V6l12-3v13M9 19c0 1.105-1.343 2-3 2s-3-.895-3-2 1.343-2 3-2 3 .895 3 2zm12-3c0 1.105-1.343 2-3 2s-3-.895-3-2 1.343-2 3-2 3 .895 3 2zM9 10l12-3",
                title: "Infrasound Below Human Hearing",
                desc: "Elephants communicate at frequencies as low as 14 Hz, well below human perception. Our tools make these calls visible and analyzable.",
              },
              {
                icon: "M3.055 11H5a2 2 0 012 2v1a2 2 0 002 2 2 2 0 012 2v2.945M8 3.935V5.5A2.5 2.5 0 0010.5 8h.5a2 2 0 012 2 2 2 0 104 0 2 2 0 012-2h1.064M15 20.488V18a2 2 0 012-2h3.064M21 12a9 9 0 11-18 0 9 9 0 0118 0z",
                title: "Field Recordings Are Noisy",
                desc: "Wind, rain, insects, and human activity contaminate field recordings. AI-powered spectral gating strips noise while preserving elephant vocalizations.",
              },
              {
                icon: "M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z",
                title: "Conservation Depends on Data",
                desc: "Tracking vocalization patterns helps researchers monitor herd health, detect distress, and inform anti-poaching strategies.",
              },
              {
                icon: "M19.428 15.428a2 2 0 00-1.022-.547l-2.387-.477a6 6 0 00-3.86.517l-.318.158a6 6 0 01-3.86.517L6.05 15.21a2 2 0 00-1.806.547M8 2h8l-1 1v5.172a2 2 0 00.586 1.414l5 5c1.26 1.26.367 3.414-1.415 3.414H4.828c-1.782 0-2.674-2.154-1.414-3.414l5-5A2 2 0 009 8.172V3L8 2z",
                title: "Reproducible Research",
                desc: "Export cleaned audio, spectrograms, and acoustic metrics in standard formats for peer review and cross-study comparison.",
              },
            ].map((item, i) => (
              <div
                key={i}
                className="flex gap-4 p-6 rounded-xl bg-ev-ivory border border-ev-sand hover:border-accent-savanna/30 transition-colors"
              >
                <div className="flex-shrink-0 w-12 h-12 rounded-lg bg-accent-savanna/10 flex items-center justify-center">
                  <svg className="w-6 h-6 text-accent-savanna" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d={item.icon} />
                  </svg>
                </div>
                <div>
                  <h3 className="text-lg font-semibold text-ev-charcoal mb-1">
                    {item.title}
                  </h3>
                  <p className="text-ev-elephant text-sm leading-relaxed">
                    {item.desc}
                  </p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* How It Works */}
      <section id="how-it-works" className="py-20 bg-ev-ivory">
        <div className="max-w-6xl mx-auto px-6">
          <h2 className="text-3xl font-bold text-ev-charcoal mb-4 text-center">
            How It Works
          </h2>
          <p className="text-ev-elephant mb-16 text-center max-w-xl mx-auto">
            Three simple steps from raw field recording to research-ready data.
          </p>

          <div className="grid md:grid-cols-3 gap-8">
            {[
              {
                step: "01",
                title: "Upload",
                desc: "Drop your .wav or .mp3 field recordings into EchoField. We accept any sample rate and bit depth.",
                color: "text-accent-savanna/20",
              },
              {
                step: "02",
                title: "AI Denoise",
                desc: "Spectral gating powered by AI isolates elephant vocalizations from environmental noise in seconds.",
                color: "text-accent-gold/20",
              },
              {
                step: "03",
                title: "Analyze",
                desc: "View spectrograms, listen to cleaned audio, review detected calls, and export your research data.",
                color: "text-success/20",
              },
            ].map((item, i) => (
              <div key={i} className="relative group">
                <div className="p-8 rounded-2xl bg-ev-cream border border-ev-sand hover:border-ev-sand/80 transition-all group-hover:-translate-y-1">
                  <div className={`text-5xl font-black mb-4 ${item.color}`}>
                    {item.step}
                  </div>
                  <h3 className="text-xl font-bold text-ev-charcoal mb-2">
                    {item.title}
                  </h3>
                  <p className="text-ev-elephant text-sm leading-relaxed">
                    {item.desc}
                  </p>
                </div>
                {i < 2 && (
                  <div className="hidden md:block absolute top-1/2 -right-4 transform -translate-y-1/2 z-10">
                    <svg className="w-8 h-8 text-ev-sand" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                    </svg>
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Footer CTA */}
      <section className="py-16 bg-ev-cream border-t border-ev-sand">
        <div className="max-w-6xl mx-auto px-6 text-center">
          <h2 className="text-2xl font-bold text-ev-charcoal mb-4">
            Ready to start analyzing?
          </h2>
          <p className="text-ev-elephant mb-8">
            Upload your first recording and see the difference AI denoising makes.
          </p>
          <Link
            href="/upload"
            className="inline-flex items-center gap-2 px-8 py-4 bg-accent-savanna text-ev-ivory font-semibold rounded-xl hover:bg-accent-savanna/90 transition-all hover:shadow-lg hover:shadow-accent-savanna/20 hover:-translate-y-0.5"
          >
            Get Started
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7l5 5m0 0l-5 5m5-5H6" />
            </svg>
          </Link>
        </div>
      </section>
    </div>
  );
}
