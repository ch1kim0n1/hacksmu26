"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import { motion } from "framer-motion";
import { staggerContainer, fadeUp } from "@/components/ui/motion-primitives";
import { Volume2, CheckCircle, Users, Zap, Save, AudioWaveform, Clock } from "lucide-react";
import { getResearchImpactStats, type ResearchImpactStats } from "@/lib/audio-api";

/* ── Animated counter with IntersectionObserver ── */

function AnimatedCounter({
  target,
  suffix = "",
  decimals = 0,
}: {
  target: number;
  suffix?: string;
  decimals?: number;
}) {
  const [display, setDisplay] = useState("0");
  const ref = useRef<HTMLSpanElement>(null);
  const started = useRef(false);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;

    const obs = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting && !started.current) {
          started.current = true;
          const t0 = performance.now();
          const duration = 2400;

          const tick = (now: number) => {
            const progress = Math.min((now - t0) / duration, 1);
            // ease-out cubic
            const ease = 1 - Math.pow(1 - progress, 3);
            const value = target * ease;
            setDisplay(
              decimals > 0
                ? value.toFixed(decimals)
                : Math.round(value).toLocaleString()
            );
            if (progress < 1) requestAnimationFrame(tick);
          };

          requestAnimationFrame(tick);
        }
      },
      { threshold: 0.3 }
    );

    obs.observe(el);
    return () => obs.disconnect();
  }, [target, decimals]);

  return (
    <span ref={ref} className="tabular-nums">
      {display}
      {suffix}
    </span>
  );
}

/* ── Skeleton card ── */

function SkeletonCard({ large }: { large?: boolean }) {
  return (
    <div
      className={`rounded-xl border border-white/10 bg-white/5 p-6 ${large ? "min-h-[140px]" : "min-h-[110px]"}`}
    >
      <div className="h-4 w-20 rounded bg-white/10 animate-shimmer mb-4" />
      <div
        className={`rounded bg-white/10 animate-shimmer ${large ? "h-10 w-28" : "h-8 w-20"}`}
      />
    </div>
  );
}

/* ── Main impact card ── */

function ImpactCard({
  icon: Icon,
  label,
  value,
  suffix,
  decimals,
  large,
}: {
  icon: React.ElementType;
  label: string;
  value: number;
  suffix?: string;
  decimals?: number;
  large?: boolean;
}) {
  return (
    <motion.div
      variants={fadeUp}
      className={`group relative rounded-xl border border-white/10 bg-white/[0.04] backdrop-blur-sm p-6 transition-colors hover:bg-white/[0.08] hover:border-accent-savanna/30 ${
        large ? "min-h-[140px]" : ""
      }`}
    >
      <div className="flex items-center gap-2 mb-3">
        <div className="flex items-center justify-center w-8 h-8 rounded-lg bg-accent-savanna/15">
          <Icon className="w-4 h-4 text-accent-savanna" />
        </div>
        <span className="text-xs uppercase tracking-wider text-ev-dust font-medium">
          {label}
        </span>
      </div>

      <div
        className={`font-bold text-ev-cream leading-none ${
          large ? "text-4xl md:text-5xl" : "text-2xl md:text-3xl"
        }`}
      >
        <AnimatedCounter
          target={value}
          suffix={suffix}
          decimals={decimals}
        />
      </div>

      {/* Subtle glow on hover */}
      <div className="absolute inset-0 rounded-xl opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none bg-gradient-to-br from-accent-savanna/5 to-transparent" />
    </motion.div>
  );
}

/* ── Progress bar at bottom ── */

function LexiconProgress({ callsRecovered }: { callsRecovered: number }) {
  const ref = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(0);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;

    const obs = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          // Map calls to a progress percentage (cap at 85% to show ongoing work)
          const progress = Math.min((callsRecovered / 500) * 100, 85);
          setTimeout(() => setWidth(progress), 200);
        }
      },
      { threshold: 0.3 }
    );

    obs.observe(el);
    return () => obs.disconnect();
  }, [callsRecovered]);

  return (
    <div ref={ref} className="mt-12 px-2">
      <div className="flex items-center justify-between text-xs text-ev-dust mb-3 font-medium tracking-wide">
        <span>7 reference rumbles</span>
        <span className="text-accent-savanna">
          {callsRecovered.toLocaleString()} calls cleaned
        </span>
        <span className="text-ev-warm-gray">
          building toward complete elephant lexicon
        </span>
      </div>

      <div className="h-2.5 rounded-full bg-white/10 overflow-hidden">
        <div
          className="h-full rounded-full transition-all duration-[2000ms] ease-out"
          style={{
            width: `${width}%`,
            background:
              "linear-gradient(90deg, #C4A46C 0%, #A8873B 40%, #10C876 100%)",
          }}
        />
      </div>

      <div className="flex justify-between mt-2">
        {/* Milestone markers */}
        {[
          { pct: "0%", label: "Baseline" },
          { pct: "33%", label: "Core calls" },
          { pct: "66%", label: "Variants" },
          { pct: "100%", label: "Full lexicon" },
        ].map((m) => (
          <div
            key={m.label}
            className="flex flex-col items-center"
            style={{ width: "1px" }}
          >
            <div className="w-1 h-1 rounded-full bg-ev-dust mb-1" />
            <span className="text-[10px] text-ev-warm-gray whitespace-nowrap">
              {m.label}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

/* ── Exported component ── */

export default function ImpactDashboard() {
  const [stats, setStats] = useState<ResearchImpactStats | null>(null);
  const [error, setError] = useState(false);

  const fetchStats = useCallback(async () => {
    try {
      const data = await getResearchImpactStats();
      setStats(data);
    } catch {
      setError(true);
    }
  }, []);

  useEffect(() => {
    fetchStats();
  }, [fetchStats]);

  if (error) return null;

  return (
    <section className="relative w-full bg-gradient-to-b from-ev-charcoal to-ev-elephant overflow-hidden">
      {/* Ambient decoration */}
      <div className="absolute inset-0 pointer-events-none">
        <div className="absolute top-0 left-1/4 w-96 h-96 rounded-full bg-accent-savanna/[0.04] blur-3xl" />
        <div className="absolute bottom-0 right-1/4 w-80 h-80 rounded-full bg-accent-gold/[0.03] blur-3xl" />
      </div>

      <div className="relative max-w-6xl mx-auto px-6 py-20 md:py-28">
        {/* Header */}
        <motion.div
          initial="initial"
          whileInView="animate"
          viewport={{ once: true, margin: "-100px" }}
          variants={staggerContainer}
          className="text-center mb-14"
        >
          <motion.p
            variants={fadeUp}
            className="text-xs uppercase tracking-[0.2em] text-accent-savanna font-medium mb-3"
          >
            Research Impact
          </motion.p>
          <motion.h2
            variants={fadeUp}
            className="text-3xl md:text-4xl font-display font-bold text-ev-cream mb-4"
          >
            Unlocking elephant language through acoustic analysis
          </motion.h2>
          <motion.p
            variants={fadeUp}
            className="text-ev-dust max-w-xl mx-auto text-sm leading-relaxed"
          >
            Every recording processed brings us closer to understanding the
            complex communication systems of the world&apos;s largest land
            animals.
          </motion.p>
        </motion.div>

        {/* Top row: 4 big cards */}
        <motion.div
          initial="initial"
          whileInView="animate"
          viewport={{ once: true, margin: "-80px" }}
          variants={staggerContainer}
          className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-4"
        >
          {stats ? (
            <>
              <ImpactCard
                icon={Volume2}
                label="Calls Isolated"
                value={stats.calls_recovered}
                large
              />
              <ImpactCard
                icon={CheckCircle}
                label="Publishable Quality"
                value={stats.publishable_calls}
                large
              />
              <ImpactCard
                icon={Users}
                label="Individuals Identified"
                value={stats.speakers_identified}
                large
              />
              <ImpactCard
                icon={Zap}
                label="Avg Noise Removed"
                value={stats.total_noise_energy_removed_pct}
                suffix="%"
                decimals={1}
                large
              />
            </>
          ) : (
            Array.from({ length: 4 }).map((_, i) => (
              <SkeletonCard key={i} large />
            ))
          )}
        </motion.div>

        {/* Bottom row: 3 smaller cards */}
        <motion.div
          initial="initial"
          whileInView="animate"
          viewport={{ once: true, margin: "-60px" }}
          variants={staggerContainer}
          className="grid grid-cols-3 gap-4"
        >
          {stats ? (
            <>
              <ImpactCard
                icon={Save}
                label="Recordings Saved"
                value={stats.recordings_saved}
              />
              <ImpactCard
                icon={AudioWaveform}
                label="SNR Improvement"
                value={stats.avg_snr_improvement_db}
                suffix=" dB"
                decimals={1}
              />
              <ImpactCard
                icon={Clock}
                label="Clean Audio"
                value={stats.hours_of_clean_audio}
                suffix=" hrs"
                decimals={1}
              />
            </>
          ) : (
            Array.from({ length: 3 }).map((_, i) => <SkeletonCard key={i} />)
          )}
        </motion.div>

        {/* Lexicon progress */}
        {stats && <LexiconProgress callsRecovered={stats.calls_recovered} />}
      </div>
    </section>
  );
}
