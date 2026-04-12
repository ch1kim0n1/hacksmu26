"use client";

import { useRef } from "react";
import Link from "next/link";
import { motion, useInView } from "framer-motion";
import {
  CloudUpload,
  Sparkles,
  Music,
  Zap,
  Mic,
  BarChart3,
  Download,
  Heart,
  ArrowRight,
} from "lucide-react";
import { SoundWave } from "@/components/ui/motion-primitives";

/* ── Data ── */

const TEAM_MEMBERS = [
  { name: "Dmitry Moiseenko", role: "Full-Stack & Design", initials: "DM" },
  { name: "Team Member", role: "ML Pipeline", initials: "ML" },
  { name: "Team Member", role: "Frontend Lead", initials: "FE" },
  { name: "Team Member", role: "Backend Lead", initials: "BE" },
];

const STEPS = [
  {
    number: "01",
    title: "Upload",
    description:
      "Drop field recordings into EchoField. We accept WAV, MP3, and FLAC at any sample rate.",
    Icon: CloudUpload,
    color: "text-accent-savanna bg-accent-savanna/10",
  },
  {
    number: "02",
    title: "AI Denoise",
    description:
      "Spectral gating and hybrid denoising isolate elephant vocalizations from environmental noise in seconds.",
    Icon: Sparkles,
    color: "text-success bg-success/10",
  },
  {
    number: "03",
    title: "Analyze",
    description:
      "View spectrograms, listen to cleaned audio, review acoustic metrics, and export research data.",
    Icon: Music,
    color: "text-nature-sage bg-nature-sage/10",
  },
];

const FEATURES = [
  {
    title: "Spectral Gating",
    description: "Removes stationary noise using frequency-domain analysis",
    Icon: Zap,
  },
  {
    title: "Call Detection",
    description:
      "Classifies rumbles, trumpets, roars, and 6 more call types",
    Icon: Mic,
  },
  {
    title: "12 Acoustic Metrics",
    description:
      "From fundamental frequency to MFCCs and spectral centroid",
    Icon: BarChart3,
  },
  {
    title: "Research Export",
    description: "CSV, JSON, and ZIP bundles ready for analysis workflows",
    Icon: Download,
  },
];

/* ── Animated Section ── */

function AnimatedSection({
  children,
  className = "",
}: {
  children: React.ReactNode;
  className?: string;
}) {
  const ref = useRef(null);
  const isInView = useInView(ref, { once: true, margin: "-60px" });

  return (
    <motion.section
      ref={ref}
      initial={{ opacity: 0, y: 30 }}
      animate={isInView ? { opacity: 1, y: 0 } : {}}
      transition={{ duration: 0.6, ease: "easeOut" }}
      className={className}
    >
      {children}
    </motion.section>
  );
}

/* ── Page ── */

export default function AboutPage() {
  return (
    <div className="p-6 lg:p-8 max-w-4xl mx-auto space-y-12 pb-12">
      {/* Hero */}
      <motion.section
        initial={{ opacity: 0, y: -10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5 }}
        className="text-center pt-4"
      >
        <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-accent-savanna/10 text-accent-savanna text-xs font-medium mb-4">
          <SoundWave bars={3} className="h-3" color="bg-accent-savanna/60" />
          HackSMU 2026 &middot; ElephantVoices Track
        </div>
        <h1 className="text-3xl font-bold text-ev-charcoal mb-3">
          About EchoField
        </h1>
        <p className="text-base text-ev-elephant max-w-2xl mx-auto leading-relaxed">
          An interactive platform that removes overlapping noise from elephant
          field recordings, revealing hidden vocalizations for conservation
          research.
        </p>
      </motion.section>

      {/* Why It Matters */}
      <AnimatedSection className="rounded-2xl glass-strong border border-ev-sand/30 p-6 lg:p-8">
        <h2 className="text-xl font-bold text-ev-charcoal mb-4">
          Why This Matters
        </h2>
        <div className="space-y-3 text-sm text-ev-elephant leading-relaxed">
          <p>
            Elephant communication research is blocked by noise. Field
            recordings from Africa contain overlapping sounds from aircraft,
            vehicles, generators, wind, and rain that mask the very
            vocalizations researchers need to study.
          </p>
          <p>
            Elephants communicate at frequencies as low as 8 Hz &mdash; well
            below human hearing &mdash; with harmonic structures extending up
            to 1000 Hz. These rumbles carry information about identity,
            emotional state, reproductive status, and social coordination
            across distances of several kilometers.
          </p>
          <p>
            Without clean recordings, researchers cannot reliably measure
            fundamental frequencies, harmonic richness, formant structures, or
            temporal patterns. EchoField changes that by making the hidden
            voice visible and analyzable.
          </p>
        </div>
      </AnimatedSection>

      {/* How It Works */}
      <AnimatedSection>
        <h2 className="text-xl font-bold text-ev-charcoal mb-6">
          How It Works
        </h2>
        <div className="grid md:grid-cols-3 gap-4">
          {STEPS.map((step, idx) => (
            <motion.div
              key={step.number}
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.1 + idx * 0.12, duration: 0.5 }}
              className="rounded-xl glass border border-ev-sand/30 p-5 card-hover"
            >
              <div className="flex items-center gap-3 mb-4">
                <div
                  className={`flex h-10 w-10 items-center justify-center rounded-xl ${step.color}`}
                >
                  <step.Icon className="h-5 w-5" />
                </div>
                <span className="text-xs font-bold text-ev-warm-gray uppercase tracking-wider">
                  Step {step.number}
                </span>
              </div>
              <h3 className="text-base font-semibold text-ev-charcoal mb-1.5">
                {step.title}
              </h3>
              <p className="text-sm text-ev-elephant leading-relaxed">
                {step.description}
              </p>
            </motion.div>
          ))}
        </div>
      </AnimatedSection>

      {/* Capabilities */}
      <AnimatedSection>
        <h2 className="text-xl font-bold text-ev-charcoal mb-6">
          Capabilities
        </h2>
        <div className="grid sm:grid-cols-2 gap-3">
          {FEATURES.map((feat, idx) => (
            <motion.div
              key={feat.title}
              initial={{ opacity: 0, x: idx % 2 === 0 ? -12 : 12 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: 0.05 + idx * 0.08, duration: 0.45 }}
              className="flex items-start gap-3.5 rounded-xl glass border border-ev-sand/30 p-4 card-hover"
            >
              <div className="w-9 h-9 rounded-lg bg-gradient-to-br from-accent-savanna/10 to-accent-gold/5 flex items-center justify-center flex-shrink-0">
                <feat.Icon className="w-4 h-4 text-accent-savanna" />
              </div>
              <div>
                <h3 className="text-sm font-semibold text-ev-charcoal">
                  {feat.title}
                </h3>
                <p className="text-xs text-ev-warm-gray mt-0.5 leading-relaxed">
                  {feat.description}
                </p>
              </div>
            </motion.div>
          ))}
        </div>
      </AnimatedSection>

      {/* Team */}
      <AnimatedSection>
        <h2 className="text-xl font-bold text-ev-charcoal mb-6">The Team</h2>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          {TEAM_MEMBERS.map((member, i) => (
            <motion.div
              key={i}
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ delay: 0.05 + i * 0.08, duration: 0.4 }}
              whileHover={{ y: -3 }}
              className="rounded-xl glass border border-ev-sand/30 p-4 text-center card-hover"
            >
              <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-gradient-to-br from-accent-savanna/20 to-accent-gold/10 shadow-sm">
                <span className="text-xs font-bold text-accent-savanna">
                  {member.initials}
                </span>
              </div>
              <p className="text-sm font-semibold text-ev-charcoal">
                {member.name}
              </p>
              <p className="text-xs text-ev-warm-gray mt-0.5">
                {member.role}
              </p>
            </motion.div>
          ))}
        </div>
      </AnimatedSection>

      {/* ElephantVoices Credit */}
      <AnimatedSection className="rounded-2xl border border-accent-savanna/15 bg-gradient-to-br from-accent-savanna/5 to-accent-gold/3 p-6 lg:p-8">
        <div className="flex flex-col md:flex-row items-center gap-5">
          <motion.div
            whileHover={{ scale: 1.05, rotate: -3 }}
            className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl bg-accent-savanna/10 shadow-glow"
          >
            <Heart className="h-7 w-7 text-accent-savanna" />
          </motion.div>
          <div>
            <h3 className="text-base font-bold text-accent-savanna mb-1">
              In Partnership with ElephantVoices
            </h3>
            <p className="text-sm text-ev-elephant leading-relaxed">
              EchoField was built for the ElephantVoices track at HackSMU
              2026. ElephantVoices is a nonprofit dedicated to elephant
              cognition, communication, and conservation. Their decades of
              field research and acoustic data make this work possible.
            </p>
          </div>
        </div>
      </AnimatedSection>

      {/* Bottom CTA */}
      <motion.section
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 0.3 }}
        className="text-center space-y-4"
      >
        <p className="text-xs text-ev-warm-gray">
          Built in 36 hours at HackSMU 2026 &mdash; April 2026, Dallas, TX
        </p>
        <motion.div whileHover={{ scale: 1.03 }} whileTap={{ scale: 0.97 }}>
          <Link
            href="/upload"
            className="inline-flex items-center gap-2 rounded-xl bg-gradient-to-r from-accent-savanna to-accent-gold px-6 py-2.5 text-sm font-medium text-white shadow-sm shadow-accent-savanna/20 hover:shadow-md hover:shadow-accent-savanna/25 transition-shadow"
          >
            Get Started
            <ArrowRight className="w-4 h-4" />
          </Link>
        </motion.div>
      </motion.section>
    </div>
  );
}
