"use client";

import { motion } from "framer-motion";
import { ArrowRight, Volume2, VolumeX } from "lucide-react";

interface SNRContextProps {
  snrBefore?: number;
  snrAfter?: number;
}

function getSNRMetaphor(snrDb: number): { text: string; quality: string; color: string } {
  if (snrDb >= 30) return { text: "Alone with the elephant in a silent savanna", quality: "Pristine", color: "#10C876" };
  if (snrDb >= 25) return { text: "Like a quiet library — every rumble is clear", quality: "Excellent", color: "#10C876" };
  if (snrDb >= 20) return { text: "Like stepping inside from a busy street", quality: "Good", color: "#C4A46C" };
  if (snrDb >= 15) return { text: "Like hearing someone across a busy cafe", quality: "Fair", color: "#F5A025" };
  if (snrDb >= 10) return { text: "Like a conversation at a party", quality: "Marginal", color: "#F5A025" };
  return { text: "Like shouting across a construction site", quality: "Poor", color: "#EF4444" };
}

export default function SNRContext({ snrBefore, snrAfter }: SNRContextProps) {
  if (snrBefore === undefined || snrAfter === undefined) return null;

  const before = getSNRMetaphor(snrBefore);
  const after = getSNRMetaphor(snrAfter);
  const improvement = snrAfter - snrBefore;

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: 0.3 }}
      className="space-y-3"
    >
      {/* Before */}
      <div className="flex items-start gap-2.5">
        <div className="mt-0.5 w-5 h-5 rounded-full bg-dark-surface-overlay flex items-center justify-center shrink-0">
          <VolumeX className="w-3 h-3" style={{ color: before.color }} />
        </div>
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <span className="text-[10px] font-medium text-dark-text-muted uppercase tracking-wider">Before</span>
            <span className="text-[10px] font-mono tabular-nums" style={{ color: before.color }}>{snrBefore.toFixed(1)} dB</span>
          </div>
          <p className="text-[11px] text-dark-text-secondary mt-0.5 italic leading-snug">&ldquo;{before.text}&rdquo;</p>
        </div>
      </div>

      {/* Arrow */}
      <div className="flex items-center gap-2 pl-2">
        <ArrowRight className="w-3.5 h-3.5 text-accent-savanna" />
        <span className="text-[10px] font-bold text-success tabular-nums">+{improvement.toFixed(1)} dB improvement</span>
      </div>

      {/* After */}
      <div className="flex items-start gap-2.5">
        <div className="mt-0.5 w-5 h-5 rounded-full bg-dark-surface-overlay flex items-center justify-center shrink-0">
          <Volume2 className="w-3 h-3" style={{ color: after.color }} />
        </div>
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <span className="text-[10px] font-medium text-dark-text-muted uppercase tracking-wider">After</span>
            <span className="text-[10px] font-mono tabular-nums" style={{ color: after.color }}>{snrAfter.toFixed(1)} dB</span>
          </div>
          <p className="text-[11px] text-dark-text-secondary mt-0.5 italic leading-snug">&ldquo;{after.text}&rdquo;</p>
        </div>
      </div>
    </motion.div>
  );
}
