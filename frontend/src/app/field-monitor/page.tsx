"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Activity,
  Radio,
  ChevronDown,
  Play,
  Square,
  Volume2,
  Users,
  Shield,
  Waves,
} from "lucide-react";
import {
  getRecordings,
  getRecording,
  API_BASE,
  type Recording,
} from "@/lib/audio-api";

/* ── Types for simulated detections ── */

interface DetectedCall {
  id: string;
  callType: string;
  individual: string;
  meaning: string;
  confidence: number;
  timestamp: number;
}

const CALL_TYPES = ["contact", "alarm", "social", "feeding", "mating", "song"];

const CALL_TYPE_COLORS: Record<string, string> = {
  contact: "bg-accent-savanna text-ev-charcoal",
  alarm: "bg-danger text-white",
  social: "bg-success text-ev-charcoal",
  feeding: "bg-warning text-ev-charcoal",
  mating: "bg-[#A78BFA] text-white",
  song: "bg-accent-gold text-ev-charcoal",
};

const CALL_MEANINGS: Record<string, string[]> = {
  contact: [
    "Let's go — coordination rumble",
    "I'm here — group cohesion signal",
    "Where are you? — long-range contact",
  ],
  alarm: [
    "Danger nearby — alert signal",
    "Threat detected — warning blast",
    "Rally together — defensive call",
  ],
  social: [
    "Greeting — close-range hello",
    "Play invitation — social bond",
    "Reassurance — calming exchange",
  ],
  feeding: [
    "Food source found — foraging rumble",
    "Share this — resource announcement",
    "Move on — patch exhausted signal",
  ],
  mating: [
    "I am ready — estrus rumble",
    "Announcing presence — musth call",
    "Courtship display — harmonic signal",
  ],
  song: [
    "Morning ceremony — tonal greeting",
    "Dusk chorus — group bonding",
    "Celebration — reunion vocalization",
  ],
};

const INDIVIDUAL_IDS = [
  "EL-047",
  "EL-112",
  "EL-089",
  "EL-203",
  "EL-156",
  "EL-031",
  "EL-078",
];

const NOISE_TYPES = [
  "airplane",
  "wind",
  "generator",
  "traffic",
  "insects",
];

/* ── Animated sine wave canvas ── */

function WaveformCanvas({ active }: { active: boolean }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const animRef = useRef<number>(0);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const resize = () => {
      canvas.width = canvas.offsetWidth * 2;
      canvas.height = canvas.offsetHeight * 2;
      ctx.scale(2, 2);
    };
    resize();

    let phase = 0;

    const draw = () => {
      const w = canvas.offsetWidth;
      const h = canvas.offsetHeight;
      ctx.clearRect(0, 0, w, h);

      if (!active) {
        // Flat line when inactive
        ctx.beginPath();
        ctx.moveTo(0, h / 2);
        ctx.lineTo(w, h / 2);
        ctx.strokeStyle = "rgba(196, 164, 108, 0.2)";
        ctx.lineWidth = 1;
        ctx.stroke();
        animRef.current = requestAnimationFrame(draw);
        return;
      }

      // Multiple overlapping waves for organic look
      const waves = [
        { freq: 0.008, amp: h * 0.25, speed: 0.03, color: "rgba(196, 164, 108, 0.6)" },
        { freq: 0.015, amp: h * 0.15, speed: 0.05, color: "rgba(16, 200, 118, 0.4)" },
        { freq: 0.025, amp: h * 0.08, speed: 0.07, color: "rgba(168, 135, 59, 0.3)" },
      ];

      for (const wave of waves) {
        ctx.beginPath();
        for (let x = 0; x < w; x++) {
          const y =
            h / 2 +
            Math.sin(x * wave.freq + phase * wave.speed) * wave.amp +
            Math.sin(x * wave.freq * 2.3 + phase * wave.speed * 1.7) *
              wave.amp *
              0.3;
          if (x === 0) ctx.moveTo(x, y);
          else ctx.lineTo(x, y);
        }
        ctx.strokeStyle = wave.color;
        ctx.lineWidth = 1.5;
        ctx.stroke();
      }

      phase += 1;
      animRef.current = requestAnimationFrame(draw);
    };

    draw();
    const ro = new ResizeObserver(resize);
    ro.observe(canvas);

    return () => {
      cancelAnimationFrame(animRef.current);
      ro.disconnect();
    };
  }, [active]);

  return (
    <canvas
      ref={canvasRef}
      className="w-full h-full"
      style={{ imageRendering: "auto" }}
    />
  );
}

/* ── Spectrogram sweep ── */

function SpectrogramSweep({
  recordingId,
  progress,
}: {
  recordingId: string;
  progress: number; // 0 to 1
}) {
  const beforeUrl = `${API_BASE}/api/recordings/${recordingId}/spectrogram?type=before`;
  const afterUrl = `${API_BASE}/api/recordings/${recordingId}/spectrogram?type=after`;

  return (
    <div className="relative w-full h-full overflow-hidden rounded-lg bg-ev-charcoal">
      {/* Before image (full) */}
      {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
        src={beforeUrl}
        alt="Original spectrogram"
        className="absolute inset-0 w-full h-full object-cover"
        onError={(e) => {
          (e.target as HTMLImageElement).style.display = "none";
        }}
      />

      {/* After image (revealed by clip) */}
      <div
        className="absolute inset-0 transition-[clip-path] duration-300 ease-linear"
        style={{
          clipPath: `inset(0 ${(1 - progress) * 100}% 0 0)`,
        }}
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={afterUrl}
          alt="Cleaned spectrogram"
          className="w-full h-full object-cover"
          onError={(e) => {
            (e.target as HTMLImageElement).style.display = "none";
          }}
        />
      </div>

      {/* Sweep line */}
      <div
        className="absolute top-0 bottom-0 w-0.5 bg-accent-savanna shadow-[0_0_8px_rgba(196,164,108,0.6)] transition-[left] duration-300 ease-linear z-10"
        style={{ left: `${progress * 100}%` }}
      />

      {/* Labels */}
      <div className="absolute top-3 left-3 px-2 py-1 rounded bg-black/50 text-[10px] text-ev-dust uppercase tracking-wider">
        Original
      </div>
      {progress > 0.05 && (
        <div className="absolute top-3 right-3 px-2 py-1 rounded bg-success/20 text-[10px] text-success uppercase tracking-wider border border-success/30">
          Cleaned
        </div>
      )}

      {/* Placeholder when no spectrogram */}
      <div className="absolute inset-0 flex items-center justify-center text-ev-warm-gray text-sm pointer-events-none">
        <div className="flex flex-col items-center gap-2 opacity-30">
          <Waves className="w-8 h-8" />
          <span>Spectrogram feed</span>
        </div>
      </div>
    </div>
  );
}

/* ── Detected call card ── */

function DetectionCard({ call }: { call: DetectedCall }) {
  const typeColor =
    CALL_TYPE_COLORS[call.callType] || "bg-ev-warm-gray text-white";

  return (
    <motion.div
      initial={{ opacity: 0, x: 40 }}
      animate={{ opacity: 1, x: 0 }}
      transition={{ duration: 0.35, ease: "easeOut" }}
      className="rounded-lg border border-white/10 bg-white/[0.04] p-3 space-y-2"
    >
      {/* Header */}
      <div className="flex items-center justify-between">
        <span
          className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider ${typeColor}`}
        >
          {call.callType}
        </span>
        <span className="text-[10px] text-ev-warm-gray font-mono">
          {call.individual}
        </span>
      </div>

      {/* Meaning */}
      <p className="text-xs text-ev-dust leading-relaxed">
        Decoded:{" "}
        <span className="text-ev-cream italic">{call.meaning}</span>
      </p>

      {/* Confidence bar */}
      <div className="space-y-1">
        <div className="flex justify-between text-[10px] text-ev-warm-gray">
          <span>Confidence</span>
          <span className="font-mono">
            {Math.round(call.confidence * 100)}%
          </span>
        </div>
        <div className="h-1 rounded-full bg-white/10 overflow-hidden">
          <div
            className="h-full rounded-full transition-all duration-700"
            style={{
              width: `${call.confidence * 100}%`,
              backgroundColor:
                call.confidence >= 0.8
                  ? "#10C876"
                  : call.confidence >= 0.6
                    ? "#F5A025"
                    : "#EF4444",
            }}
          />
        </div>
      </div>
    </motion.div>
  );
}

/* ── Blinking live dot ── */

function LiveDot() {
  return (
    <span className="relative flex h-2.5 w-2.5">
      <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-success opacity-75" />
      <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-success" />
    </span>
  );
}

/* ── SNR meter ── */

function SNRMeter({ value, active }: { value: number; active: boolean }) {
  const pct = Math.min(Math.max((value + 5) / 35, 0), 1) * 100;

  return (
    <div className="flex items-center gap-2">
      <span className="text-[10px] text-ev-warm-gray uppercase tracking-wider w-8">
        SNR
      </span>
      <div className="flex-1 h-2 rounded-full bg-white/10 overflow-hidden">
        <motion.div
          className="h-full rounded-full"
          initial={{ width: 0 }}
          animate={{ width: active ? `${pct}%` : "0%" }}
          transition={{ duration: 0.8, ease: "easeOut" }}
          style={{
            background:
              "linear-gradient(90deg, #EF4444, #F5A025, #10C876)",
          }}
        />
      </div>
      <span className="text-xs font-mono text-ev-cream w-12 text-right">
        {active ? `${value.toFixed(1)} dB` : "-- dB"}
      </span>
    </div>
  );
}

/* ── Main page ── */

export default function FieldMonitorPage() {
  const [recordings, setRecordings] = useState<Recording[]>([]);
  const [selectedId, setSelectedId] = useState<string>("");
  const [selectedRecording, setSelectedRecording] = useState<Recording | null>(
    null
  );
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const [running, setRunning] = useState(false);
  const [progress, setProgress] = useState(0);
  const [detections, setDetections] = useState<DetectedCall[]>([]);
  const [currentSNR, setCurrentSNR] = useState(0);
  const [currentNoise, setCurrentNoise] = useState("--");
  const [complete, setComplete] = useState(false);
  const [playbackSpeed, setPlaybackSpeed] = useState<1 | 2 | 4>(1);

  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const detectionTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Fetch recordings list on mount
  useEffect(() => {
    getRecordings({ limit: 50 })
      .then((res) => {
        setRecordings(res.recordings);
        if (res.recordings.length > 0) {
          setSelectedId((prev) => prev || res.recordings[0].id);
        }
      })
      .catch(() => {});
  }, []);

  // Fetch selected recording detail
  useEffect(() => {
    if (!selectedId) return;
    getRecording(selectedId)
      .then(setSelectedRecording)
      .catch(() => {});
  }, [selectedId]);

  const activeSpeakers = new Set(detections.map((d) => d.individual)).size;

  const stopMonitor = useCallback(() => {
    setRunning(false);
    if (timerRef.current) clearInterval(timerRef.current);
    if (detectionTimerRef.current) clearInterval(detectionTimerRef.current);
    timerRef.current = null;
    detectionTimerRef.current = null;
  }, []);

  const startMonitor = useCallback(() => {
    if (!selectedId) return;

    setRunning(true);
    setProgress(0);
    setDetections([]);
    setComplete(false);
    setCurrentNoise(
      NOISE_TYPES[Math.floor(Math.random() * NOISE_TYPES.length)]
    );

    const duration = selectedRecording?.duration_s
      ? Math.max(selectedRecording.duration_s * 1000, 15000)
      : 30000;

    const totalSteps = 200;
    const stepMs = duration / totalSteps / playbackSpeed;
    let step = 0;

    // Progress timer
    timerRef.current = setInterval(() => {
      step++;
      const p = Math.min(step / totalSteps, 1);
      setProgress(p);
      setCurrentSNR(8 + Math.random() * 18 + p * 6);

      if (p >= 1) {
        setComplete(true);
        stopMonitor();
      }
    }, stepMs);

    // Detection timer: add a call every 2-3.5 seconds
    const addDetection = () => {
      const callType =
        CALL_TYPES[Math.floor(Math.random() * CALL_TYPES.length)];
      const meanings = CALL_MEANINGS[callType] || ["Unknown vocalization"];
      const meaning = meanings[Math.floor(Math.random() * meanings.length)];
      const individual =
        INDIVIDUAL_IDS[Math.floor(Math.random() * INDIVIDUAL_IDS.length)];

      const newCall: DetectedCall = {
        id: `det-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
        callType,
        individual,
        meaning,
        confidence: 0.55 + Math.random() * 0.4,
        timestamp: Date.now(),
      };

      setDetections((prev) => [newCall, ...prev]);

      // Schedule next detection at random interval
      const nextDelay = (2000 + Math.random() * 1500) / playbackSpeed;
      detectionTimerRef.current = setTimeout(addDetection, nextDelay) as unknown as ReturnType<typeof setInterval>;
    };

    // First detection after initial delay
    detectionTimerRef.current = setTimeout(addDetection, 1500 / playbackSpeed) as unknown as ReturnType<typeof setInterval>;
  }, [playbackSpeed, selectedId, selectedRecording, stopMonitor]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
      if (detectionTimerRef.current) clearInterval(detectionTimerRef.current);
    };
  }, []);

  return (
    <div className="min-h-screen bg-ev-charcoal text-ev-cream flex flex-col">
      {/* ── Top bar ── */}
      <header className="flex items-center justify-between px-6 py-4 border-b border-white/10">
        <div className="flex items-center gap-3">
          <Activity className="w-5 h-5 text-accent-savanna" />
          <h1 className="text-lg font-bold tracking-tight">
            EchoField{" "}
            <span className="text-ev-warm-gray font-normal">
              — Field Monitor
            </span>
          </h1>
        </div>

        <div className="flex items-center gap-3">
          <LiveDot />
          <span className="text-xs uppercase tracking-wider text-success font-medium">
            Live
          </span>
        </div>
      </header>

      {/* ── Controls bar ── */}
      <div className="flex items-center gap-4 px-6 py-3 border-b border-white/10 bg-white/[0.02]">
        {/* Recording selector dropdown */}
        <div className="relative">
          <button
            onClick={() => setDropdownOpen(!dropdownOpen)}
            disabled={running}
            className="flex items-center gap-2 px-3 py-2 rounded-lg border border-white/10 bg-white/[0.04] hover:bg-white/[0.08] transition-colors text-sm disabled:opacity-50 min-w-[240px]"
          >
            <Radio className="w-3.5 h-3.5 text-accent-savanna" />
            <span className="flex-1 text-left truncate">
              {selectedRecording?.filename || "Select recording..."}
            </span>
            <ChevronDown
              className={`w-3.5 h-3.5 text-ev-warm-gray transition-transform ${dropdownOpen ? "rotate-180" : ""}`}
            />
          </button>

          <AnimatePresence>
            {dropdownOpen && (
              <motion.div
                initial={{ opacity: 0, y: -4 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -4 }}
                className="absolute top-full left-0 mt-1 w-80 max-h-60 overflow-y-auto rounded-lg border border-white/10 bg-ev-charcoal shadow-xl z-30"
              >
                {recordings.map((rec) => (
                  <button
                    key={rec.id}
                    onClick={() => {
                      setSelectedId(rec.id);
                      setDropdownOpen(false);
                    }}
                    className={`w-full text-left px-3 py-2 text-sm hover:bg-white/[0.06] transition-colors flex items-center justify-between ${
                      rec.id === selectedId
                        ? "bg-white/[0.04] text-accent-savanna"
                        : "text-ev-dust"
                    }`}
                  >
                    <span className="truncate">{rec.filename}</span>
                    <span className="text-[10px] text-ev-warm-gray ml-2 shrink-0">
                      {rec.duration_s
                        ? `${rec.duration_s.toFixed(1)}s`
                        : "--"}
                    </span>
                  </button>
                ))}

                {recordings.length === 0 && (
                  <div className="px-3 py-4 text-sm text-ev-warm-gray text-center">
                    No recordings available
                  </div>
                )}
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        {/* Start / Stop button */}
        <button
          onClick={running ? stopMonitor : startMonitor}
          disabled={!selectedId}
          className={`flex items-center gap-2 px-5 py-2 rounded-lg text-sm font-medium transition-all disabled:opacity-40 ${
            running
              ? "bg-danger/20 text-danger border border-danger/30 hover:bg-danger/30"
              : "bg-success/20 text-success border border-success/30 hover:bg-success/30"
          }`}
        >
          {running ? (
            <>
              <Square className="w-3.5 h-3.5" />
              Stop Monitor
            </>
          ) : (
            <>
              <Play className="w-3.5 h-3.5" />
              Start Monitor
            </>
          )}
        </button>

        <div className="flex items-center gap-1 rounded-lg border border-white/10 bg-white/[0.04] p-1">
          {[1, 2, 4].map((speed) => (
            <button
              key={speed}
              type="button"
              onClick={() => setPlaybackSpeed(speed as 1 | 2 | 4)}
              disabled={running}
              className={`rounded-md px-2.5 py-1 text-xs font-semibold transition-colors disabled:opacity-60 ${
                playbackSpeed === speed
                  ? "bg-accent-savanna text-ev-charcoal"
                  : "text-ev-warm-gray hover:text-ev-cream"
              }`}
            >
              {speed}x
            </button>
          ))}
        </div>

        {/* Duration progress */}
        <div className="flex-1">
          <div className="h-1.5 rounded-full bg-white/10 overflow-hidden">
            <div
              className="h-full rounded-full transition-all duration-300 ease-linear"
              style={{
                width: `${progress * 100}%`,
                background:
                  "linear-gradient(90deg, #C4A46C, #10C876)",
              }}
            />
          </div>
        </div>

        <span className="text-xs font-mono text-ev-warm-gray">
          {Math.round(progress * 100)}%
        </span>
      </div>

      {/* ── Main content ── */}
      <div className="flex-1 flex min-h-0">
        {/* Left panel: spectrogram + waveform (70%) */}
        <div className="flex-[7] flex flex-col border-r border-white/10 min-h-0">
          {/* Spectrogram */}
          <div className="flex-[3] p-4 min-h-0">
            {selectedId ? (
              <SpectrogramSweep
                recordingId={selectedId}
                progress={progress}
              />
            ) : (
              <div className="w-full h-full rounded-lg border border-white/10 bg-white/[0.02] flex items-center justify-center">
                <p className="text-sm text-ev-warm-gray">
                  Select a recording to begin
                </p>
              </div>
            )}
          </div>

          {/* Waveform */}
          <div className="flex-[1] px-4 pb-4 min-h-[100px]">
            <div className="w-full h-full rounded-lg border border-white/10 bg-white/[0.02] overflow-hidden">
              <WaveformCanvas active={running} />
            </div>
          </div>
        </div>

        {/* Right panel: detections (30%) */}
        <div className="flex-[3] flex flex-col min-h-0">
          <div className="px-4 py-3 border-b border-white/10 flex items-center justify-between">
            <h2 className="text-sm font-semibold text-ev-cream flex items-center gap-2">
              <Shield className="w-3.5 h-3.5 text-accent-savanna" />
              Detected Events
            </h2>
            <span className="text-xs font-mono text-accent-savanna">
              {detections.length}
            </span>
          </div>

          <div className="flex-1 overflow-y-auto p-3 space-y-2 min-h-0">
            <AnimatePresence mode="popLayout">
              {detections.map((call) => (
                <DetectionCard key={call.id} call={call} />
              ))}
            </AnimatePresence>

            {detections.length === 0 && (
              <div className="flex flex-col items-center justify-center h-full text-ev-warm-gray gap-2 opacity-40">
                <Waves className="w-6 h-6" />
                <span className="text-xs">
                  {running
                    ? "Listening for calls..."
                    : "Start monitor to detect calls"}
                </span>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* ── Bottom status bar ── */}
      <footer className="flex items-center gap-6 px-6 py-3 border-t border-white/10 bg-white/[0.02] text-xs">
        <div className="flex items-center gap-2">
          <Volume2 className="w-3.5 h-3.5 text-ev-warm-gray" />
          <span className="text-ev-dust">
            Calls Detected:{" "}
            <span className="font-mono text-ev-cream">
              {detections.length}
            </span>
          </span>
        </div>

        <div className="flex items-center gap-2">
          <Users className="w-3.5 h-3.5 text-ev-warm-gray" />
          <span className="text-ev-dust">
            Active Speakers:{" "}
            <span className="font-mono text-ev-cream">
              {activeSpeakers}
            </span>
          </span>
        </div>

        <div className="flex items-center gap-2">
          <Shield className="w-3.5 h-3.5 text-ev-warm-gray" />
          <span className="text-ev-dust">
            Noise Type:{" "}
            <span
              className={`font-mono px-1.5 py-0.5 rounded text-[10px] uppercase tracking-wider ${
                running
                  ? "bg-warning/20 text-warning"
                  : "text-ev-warm-gray"
              }`}
            >
              {currentNoise}
            </span>
          </span>
        </div>

        <div className="flex-1">
          <SNRMeter value={currentSNR} active={running} />
        </div>
      </footer>

      {/* ── Processing complete banner ── */}
      <AnimatePresence>
        {complete && (
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 20 }}
            className="fixed inset-x-0 bottom-20 flex justify-center z-50 pointer-events-none"
          >
            <div className="bg-success/20 border border-success/40 backdrop-blur-md rounded-xl px-8 py-4 flex items-center gap-3 pointer-events-auto shadow-xl">
              <div className="w-8 h-8 rounded-full bg-success/20 flex items-center justify-center">
                <Activity className="w-4 h-4 text-success" />
              </div>
              <div>
                <p className="text-sm font-semibold text-success">
                  Processing Complete
                </p>
                <p className="text-xs text-ev-dust">
                  {detections.length} calls detected across{" "}
                  {activeSpeakers} individuals
                </p>
              </div>
              <button
                onClick={() => setComplete(false)}
                className="ml-4 px-3 py-1 rounded text-xs text-ev-warm-gray hover:text-ev-cream transition-colors"
              >
                Dismiss
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
