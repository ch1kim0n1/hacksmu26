"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { motion } from "framer-motion";
import {
  ArrowLeft,
  RefreshCw,
  AlertCircle,
  Radio,
  Clock,
  Activity,
  Users,
  Heart,
  MessageCircle,
  BookOpen,
  Ear,
} from "lucide-react";
import {
  getEthologyAnnotations,
  type EthologyAnnotation,
} from "@/lib/audio-api";
import { staggerContainer, fadeUp } from "@/components/ui/motion-primitives";

/* ── Color mapping for the left accent bar on each call card ── */

const CALL_BAR_COLORS: Record<string, string> = {
  rumble: "#C4A46C",
  trumpet: "#E67E22",
  roar: "#C0392B",
  bark: "#E74C3C",
  cry: "#9B59B6",
  contact_call: "#27AE60",
  greeting: "#3498DB",
  play: "#E91E8A",
};

const CALL_BG_COLORS: Record<string, string> = {
  rumble: "rgba(196, 164, 108, 0.06)",
  trumpet: "rgba(230, 126, 34, 0.06)",
  roar: "rgba(192, 57, 43, 0.06)",
  bark: "rgba(231, 76, 60, 0.06)",
  cry: "rgba(155, 89, 182, 0.06)",
  contact_call: "rgba(39, 174, 96, 0.06)",
  greeting: "rgba(52, 152, 219, 0.06)",
  play: "rgba(233, 30, 138, 0.06)",
};

/* ── Skeleton card for loading state ── */

function SkeletonCard() {
  return (
    <div className="rounded-xl border border-ev-sand/40 bg-ev-cream/60 overflow-hidden animate-pulse">
      <div className="flex">
        <div className="w-1.5 shrink-0 bg-ev-sand/60" />
        <div className="flex-1 p-6 space-y-4">
          <div className="h-6 w-32 bg-ev-sand/80 rounded" />
          <div className="h-4 w-full bg-ev-sand/60 rounded" />
          <div className="h-4 w-3/4 bg-ev-sand/60 rounded" />
          <div className="grid grid-cols-2 gap-3 pt-2">
            {Array.from({ length: 6 }).map((_, i) => (
              <div key={i} className="space-y-1.5">
                <div className="h-3 w-20 bg-ev-sand/50 rounded" />
                <div className="h-3.5 w-28 bg-ev-sand/70 rounded" />
              </div>
            ))}
          </div>
          <div className="h-3 w-48 bg-ev-sand/40 rounded mt-3" />
        </div>
      </div>
    </div>
  );
}

/* ── Metadata row component ── */

function MetaItem({
  icon: Icon,
  label,
  value,
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  value: string;
}) {
  return (
    <div className="flex items-start gap-2">
      <Icon className="w-3.5 h-3.5 text-ev-warm-gray mt-0.5 shrink-0" />
      <div className="min-w-0">
        <p className="text-[10px] uppercase tracking-wider text-ev-warm-gray font-medium leading-none mb-1">
          {label}
        </p>
        <p className="text-xs text-ev-charcoal leading-snug">{value}</p>
      </div>
    </div>
  );
}

/* ── Call type card ── */

function CallCard({
  callKey,
  annotation,
}: {
  callKey: string;
  annotation: EthologyAnnotation;
}) {
  const barColor = CALL_BAR_COLORS[callKey] || "#8A837B";
  const bgColor = CALL_BG_COLORS[callKey] || "rgba(138, 131, 123, 0.06)";

  const freqRange =
    annotation.typical_frequency_hz[0] === annotation.typical_frequency_hz[1]
      ? `${annotation.typical_frequency_hz[0]} Hz`
      : `${annotation.typical_frequency_hz[0]}\u2013${annotation.typical_frequency_hz[1]} Hz`;

  const durationRange =
    annotation.typical_duration_s[0] === annotation.typical_duration_s[1]
      ? `${annotation.typical_duration_s[0]}s`
      : `${annotation.typical_duration_s[0]}\u2013${annotation.typical_duration_s[1]}s`;

  return (
    <motion.div
      variants={fadeUp}
      className="group rounded-xl border border-ev-sand/40 bg-ev-cream/60 overflow-hidden
                 shadow-card hover:shadow-card-hover transition-shadow duration-300"
    >
      <div className="flex h-full">
        {/* Left accent bar */}
        <div
          className="w-1.5 shrink-0 transition-all duration-300 group-hover:w-2"
          style={{ backgroundColor: barColor }}
        />

        <div className="flex-1 p-5 sm:p-6" style={{ backgroundColor: bgColor }}>
          {/* Call type label */}
          <h3 className="font-display text-xl font-bold text-ev-charcoal mb-2 leading-tight">
            {annotation.label}
          </h3>

          {/* Meaning */}
          <p className="text-sm text-ev-elephant leading-relaxed mb-4">
            {annotation.meaning}
          </p>

          {/* Metadata grid */}
          <div className="grid grid-cols-2 gap-x-4 gap-y-3">
            <MetaItem
              icon={Heart}
              label="Behavioral Context"
              value={annotation.behavioral_context}
            />
            <MetaItem
              icon={Users}
              label="Social Function"
              value={annotation.social_function}
            />
            <MetaItem
              icon={Radio}
              label="Range"
              value={`${annotation.range_km} km`}
            />
            <MetaItem
              icon={Clock}
              label="Typical Duration"
              value={durationRange}
            />
            <MetaItem
              icon={Activity}
              label="Frequency"
              value={freqRange}
            />
            <MetaItem
              icon={MessageCircle}
              label="Caller State"
              value={annotation.caller_state}
            />
            <MetaItem
              icon={Ear}
              label="Common Response"
              value={annotation.common_response}
            />
          </div>

          {/* Source citation */}
          <div className="mt-4 pt-3 border-t border-ev-sand/30">
            <p className="text-[10px] text-ev-warm-gray flex items-center gap-1.5">
              <BookOpen className="w-3 h-3 shrink-0" />
              <span className="italic">{annotation.source}</span>
            </p>
          </div>
        </div>
      </div>
    </motion.div>
  );
}

/* ── Main page ── */

export default function EthologyPage() {
  const [annotations, setAnnotations] = useState<Record<
    string,
    EthologyAnnotation
  > | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchData = async () => {
    try {
      setLoading(true);
      setError(null);
      const data = await getEthologyAnnotations();
      setAnnotations(data);
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "Failed to load ethology annotations"
      );
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, []);

  return (
    <main className="min-h-screen bg-background-page">
      {/* Header */}
      <div className="border-b border-ev-sand/60 bg-ev-cream/40 backdrop-blur-sm sticky top-0 z-10">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 py-4 flex items-center gap-4">
          <Link
            href="/database"
            className="flex items-center gap-2 text-ev-elephant hover:text-ev-charcoal
                       transition-colors text-sm font-medium"
          >
            <ArrowLeft className="w-4 h-4" />
            <span className="hidden sm:inline">Database</span>
          </Link>
          <div className="h-5 w-px bg-ev-sand/60" />
          <h1 className="font-display text-xl sm:text-2xl font-bold text-ev-charcoal">
            Elephant Communication Guide
          </h1>
        </div>
      </div>

      <div className="max-w-6xl mx-auto px-4 sm:px-6 py-8 sm:py-12">
        {/* Intro */}
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5 }}
          className="max-w-3xl mb-10"
        >
          <p className="text-ev-elephant text-base sm:text-lg leading-relaxed">
            Elephants communicate through a rich repertoire of vocalizations that
            carry specific meanings depending on context, social relationships,
            and emotional state. From low-frequency rumbles that travel kilometers
            across the savanna to sharp trumpets of alarm, each call type plays
            a vital role in maintaining social bonds, coordinating group movement,
            and ensuring the survival of the herd.
          </p>
        </motion.div>

        {/* Error state */}
        {error && (
          <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            className="rounded-xl border border-danger/20 bg-danger/5 p-6 mb-8
                       flex flex-col sm:flex-row items-start sm:items-center gap-4"
          >
            <div className="flex items-center gap-3 text-danger">
              <AlertCircle className="w-5 h-5 shrink-0" />
              <p className="text-sm font-medium">{error}</p>
            </div>
            <button
              onClick={fetchData}
              className="ml-auto flex items-center gap-2 px-4 py-2 rounded-lg
                         bg-ev-charcoal text-ev-cream text-sm font-medium
                         hover:bg-ev-charcoal-light transition-colors"
            >
              <RefreshCw className="w-3.5 h-3.5" />
              Retry
            </button>
          </motion.div>
        )}

        {/* Loading skeleton grid */}
        {loading && (
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-5">
            {Array.from({ length: 9 }).map((_, i) => (
              <SkeletonCard key={i} />
            ))}
          </div>
        )}

        {/* Call type cards */}
        {!loading && annotations && (
          <motion.div
            variants={staggerContainer}
            initial="initial"
            animate="animate"
            className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-5"
          >
            {Object.entries(annotations).map(([key, annotation]) => (
              <CallCard key={key} callKey={key} annotation={annotation} />
            ))}
          </motion.div>
        )}

        {/* Empty state (no error, not loading, but no data) */}
        {!loading && !error && annotations && Object.keys(annotations).length === 0 && (
          <div className="text-center py-16">
            <p className="text-ev-warm-gray text-sm">
              No call type annotations found.
            </p>
          </div>
        )}
      </div>
    </main>
  );
}
