"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import { motion, AnimatePresence } from "framer-motion";
import { Mic, MicOff, Activity, Radio, AlertCircle } from "lucide-react";

// ── Constants ──────────────────────────────────────────────────────────────────

const SAMPLE_RATE = 44_100;
/** Samples per WebSocket binary frame (matches backend live_chunk_size_s = 1.0). */
const CHUNK_SAMPLES = SAMPLE_RATE;

/** Derive WebSocket base URL from the REST API base env var. */
function wsBase(): string {
  const api =
    (typeof process !== "undefined" &&
      process.env.NEXT_PUBLIC_API_URL) ||
    "http://localhost:8000";
  return api.replace(/^http/, "ws");
}

// ── Types ──────────────────────────────────────────────────────────────────────

type RecorderStatus =
  | "idle"
  | "requesting"
  | "recording"
  | "stopping"
  | "error";

interface ChunkData {
  chunk_index: number;
  noise_type: string;
  confidence: number;
  snr_before: number;
  snr_after: number;
  cleaned_audio_b64: string;
  spectrogram_columns: number[][];
}

interface CompleteData {
  recording_id: string;
  duration_s: number;
  total_chunks: number;
  output_path: string;
}

type IncomingWSMessage =
  | { type: "CHUNK_PROCESSED"; data: ChunkData }
  | { type: "RECORDING_COMPLETE"; data: CompleteData }
  | { type: "SESSION_STARTED"; recording_id: string; session_id: string }
  | { type: string; data?: unknown };

// ── Drawing helpers ────────────────────────────────────────────────────────────

/**
 * Draw a waveform from AnalyserNode float time-domain data onto a canvas.
 * Renders a single-frame oscilloscope line in the savanna accent colour.
 */
function drawWaveform(
  canvas: HTMLCanvasElement,
  analyser: AnalyserNode,
  buffer: Float32Array
): void {
  const ctx = canvas.getContext("2d");
  if (!ctx) return;
  analyser.getFloatTimeDomainData(buffer);

  const { width, height } = canvas;
  ctx.clearRect(0, 0, width, height);
  ctx.lineWidth = 1.5;
  ctx.strokeStyle = "#C4A46C"; // ev-sand accent
  ctx.beginPath();

  const step = width / buffer.length;
  for (let i = 0; i < buffer.length; i++) {
    const y = ((buffer[i] + 1) / 2) * height;
    if (i === 0) ctx.moveTo(0, y);
    else ctx.lineTo(i * step, y);
  }
  ctx.stroke();
}

/**
 * Append new STFT columns to the spectrogram canvas, scrolling left.
 * Each column maps freq bins (rows) to pixel rows; amplitude is mapped to
 * a warm amber-to-bright colour scale matching the app palette.
 */
function appendSpectrogramColumns(
  canvas: HTMLCanvasElement,
  columns: number[][]
): void {
  const ctx = canvas.getContext("2d");
  if (!ctx || columns.length === 0) return;

  const { width, height } = canvas;
  const colW = Math.max(1, Math.floor(width / 120)); // ~120 columns visible

  // Scroll existing image left by colW pixels
  try {
    const imgData = ctx.getImageData(colW, 0, width - colW, height);
    ctx.putImageData(imgData, 0, 0);
  } catch {
    // getImageData may fail on a blank canvas — ignore
  }

  // Paint the new column(s) on the right edge
  const nBins = columns[0]?.length ?? 0;
  if (nBins === 0) return;

  for (let c = 0; c < columns.length; c++) {
    const x = width - colW * (columns.length - c);
    const col = columns[c];
    for (let row = 0; row < col.length; row++) {
      // Map dB value (typical range -80..0) to [0,1]
      const val = Math.min(1, Math.max(0, (col[row] + 80) / 80));
      const r = Math.floor(val * 255);
      const g = Math.floor(val * 160);
      const b = Math.floor(val * 50);
      ctx.fillStyle = `rgb(${r},${g},${b})`;
      // Flip: row 0 = lowest freq → bottom of canvas
      const y = height - Math.floor(((row + 1) / col.length) * height);
      ctx.fillRect(x, y, colW, Math.max(1, Math.floor(height / col.length)));
    }
  }
}

// ── AudioWorklet processor source (inlined as a Blob URL) ─────────────────────

const PROCESSOR_SOURCE = `
class PCMProcessor extends AudioWorkletProcessor {
  process(inputs) {
    const ch = inputs[0]?.[0];
    if (ch) this.port.postMessage(ch.slice());
    return true;
  }
}
registerProcessor('pcm-processor', PCMProcessor);
`;

// ── Component ──────────────────────────────────────────────────────────────────

export default function LiveRecorderPage() {
  const router = useRouter();

  // ── UI state ────────────────────────────────────────────────────────────────
  const [status, setStatus] = useState<RecorderStatus>("idle");
  const [noiseType, setNoiseType] = useState<string>("—");
  const [chunkCount, setChunkCount] = useState(0);
  const [avgSnrImprovement, setAvgSnrImprovement] = useState(0);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // Running SNR average accumulators (refs: updated without re-render)
  const totalSnrDeltaRef = useRef(0);
  const chunkCountRef = useRef(0);

  // ── Audio pipeline refs ──────────────────────────────────────────────────────
  const audioContextRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const animationFrameRef = useRef<number | null>(null);
  const waveformBufferRef = useRef<Float32Array>(new Float32Array(2048));

  // ── Gapless playback context ─────────────────────────────────────────────────
  const playbackCtxRef = useRef<AudioContext | null>(null);
  const nextPlaybackTimeRef = useRef(0);

  // ── WebSocket + sample buffer ────────────────────────────────────────────────
  const wsRef = useRef<WebSocket | null>(null);
  /** Accumulated Float32 samples waiting to be flushed as a chunk. */
  const sampleBufferRef = useRef<number[]>([]);

  // ── Canvas refs ──────────────────────────────────────────────────────────────
  const waveformCanvasRef = useRef<HTMLCanvasElement>(null);
  const spectrogramCanvasRef = useRef<HTMLCanvasElement>(null);

  // ── Cleanup on unmount ───────────────────────────────────────────────────────
  useEffect(() => {
    return () => {
      if (animationFrameRef.current != null)
        cancelAnimationFrame(animationFrameRef.current);
      wsRef.current?.close();
      (streamRef.current?.getTracks() ?? []).forEach((t) => t.stop());
      void audioContextRef.current?.close();
      void playbackCtxRef.current?.close();
    };
  }, []);

  // ── Gapless playback: enqueue decoded float32 chunk ─────────────────────────
  const schedulePlayback = useCallback((samples: Float32Array) => {
    if (!playbackCtxRef.current) {
      playbackCtxRef.current = new AudioContext({
        sampleRate: SAMPLE_RATE,
      } as AudioContextOptions);
      nextPlaybackTimeRef.current =
        playbackCtxRef.current.currentTime + 0.1;
    }
    const ctx = playbackCtxRef.current;
    const buf = ctx.createBuffer(1, samples.length, SAMPLE_RATE);
    buf.getChannelData(0).set(samples);
    const src = ctx.createBufferSource();
    src.buffer = buf;
    src.connect(ctx.destination);
    const startAt = Math.max(
      nextPlaybackTimeRef.current,
      ctx.currentTime + 0.02
    );
    src.start(startAt);
    nextPlaybackTimeRef.current = startAt + samples.length / SAMPLE_RATE;
  }, []);

  // ── Waveform animation loop ──────────────────────────────────────────────────
  const drawLoop = useCallback(() => {
    if (!analyserRef.current || !waveformCanvasRef.current) return;
    drawWaveform(
      waveformCanvasRef.current,
      analyserRef.current,
      waveformBufferRef.current
    );
    animationFrameRef.current = requestAnimationFrame(drawLoop);
  }, []);

  // ── Handle CHUNK_PROCESSED message ──────────────────────────────────────────
  const handleChunkProcessed = useCallback(
    (data: ChunkData) => {
      // Update noise type badge
      setNoiseType(data.noise_type);

      // Running SNR average
      const delta = data.snr_after - data.snr_before;
      totalSnrDeltaRef.current += delta;
      chunkCountRef.current += 1;
      setChunkCount(chunkCountRef.current);
      setAvgSnrImprovement(totalSnrDeltaRef.current / chunkCountRef.current);

      // Decode base64 cleaned PCM and schedule gapless playback
      try {
        const binaryStr = atob(data.cleaned_audio_b64);
        const bytes = new Uint8Array(binaryStr.length);
        for (let i = 0; i < binaryStr.length; i++)
          bytes[i] = binaryStr.charCodeAt(i);
        schedulePlayback(new Float32Array(bytes.buffer));
      } catch {
        // Non-fatal: playback decode failed (e.g. bad base64 in tests)
      }

      // Append STFT columns to spectrogram canvas
      if (
        spectrogramCanvasRef.current &&
        data.spectrogram_columns.length > 0
      ) {
        appendSpectrogramColumns(
          spectrogramCanvasRef.current,
          data.spectrogram_columns
        );
      }
    },
    [schedulePlayback]
  );

  // ── Start recording ──────────────────────────────────────────────────────────
  const handleStart = useCallback(async () => {
    setErrorMessage(null);
    setStatus("requesting");
    sampleBufferRef.current = [];
    totalSnrDeltaRef.current = 0;
    chunkCountRef.current = 0;
    setChunkCount(0);
    setAvgSnrImprovement(0);
    setNoiseType("—");

    // 1. Request microphone
    let stream: MediaStream;
    try {
      stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    } catch {
      setErrorMessage(
        "Microphone access denied. Please allow microphone permissions and try again."
      );
      setStatus("error");
      return;
    }
    streamRef.current = stream;

    // 2. Build audio pipeline
    const audioCtx = new AudioContext({
      sampleRate: SAMPLE_RATE,
    } as AudioContextOptions);
    audioContextRef.current = audioCtx;

    const analyser = audioCtx.createAnalyser();
    analyser.fftSize = 2048;
    analyserRef.current = analyser;
    waveformBufferRef.current = new Float32Array(analyser.fftSize);

    const source = audioCtx.createMediaStreamSource(stream);
    source.connect(analyser);

    // 3. Chunk flusher: sends exactly CHUNK_SAMPLES frames per binary frame
    const flushChunks = () => {
      const buf = sampleBufferRef.current;
      while (buf.length >= CHUNK_SAMPLES) {
        const chunk = new Float32Array(buf.splice(0, CHUNK_SAMPLES));
        wsRef.current?.send(chunk.buffer);
      }
    };

    // 4. Capture node: AudioWorkletNode preferred, ScriptProcessorNode fallback
    try {
      if (typeof globalThis.AudioWorkletNode === "undefined") {
        throw new Error("AudioWorkletNode unavailable");
      }
      const blob = new Blob([PROCESSOR_SOURCE], {
        type: "application/javascript",
      });
      const workletUrl = URL.createObjectURL(blob);
      await audioCtx.audioWorklet.addModule(workletUrl);
      URL.revokeObjectURL(workletUrl);

      const worklet = new AudioWorkletNode(audioCtx, "pcm-processor");
      worklet.port.onmessage = (e: MessageEvent<Float32Array>) => {
        sampleBufferRef.current.push(...e.data);
        flushChunks();
      };
      source.connect(worklet);
    } catch {
      // ScriptProcessorNode fallback (deprecated but universally supported)
      const processor = audioCtx.createScriptProcessor(4096, 1, 1);
      processor.onaudioprocess = (e: AudioProcessingEvent) => {
        const ch = e.inputBuffer.getChannelData(0);
        sampleBufferRef.current.push(...ch);
        flushChunks();
      };
      source.connect(processor);
      processor.connect(audioCtx.destination); // keep alive
    }

    // 5. Open WebSocket
    const sessionId = crypto.randomUUID();
    const ws = new WebSocket(`${wsBase()}/ws/record/${sessionId}`);
    wsRef.current = ws;

    ws.onopen = () => {
      ws.send(JSON.stringify({ action: "start", sample_rate: SAMPLE_RATE }));
      setStatus("recording");
      animationFrameRef.current = requestAnimationFrame(drawLoop);
    };

    ws.onmessage = (event: MessageEvent<string>) => {
      let msg: IncomingWSMessage;
      try {
        msg = JSON.parse(event.data) as IncomingWSMessage;
      } catch {
        return;
      }
      if (msg.type === "CHUNK_PROCESSED") {
        handleChunkProcessed(msg.data as ChunkData);
      } else if (msg.type === "RECORDING_COMPLETE") {
        const d = msg.data as CompleteData;
        if (animationFrameRef.current != null) {
          cancelAnimationFrame(animationFrameRef.current);
          animationFrameRef.current = null;
        }
        setStatus("idle");
        router.push(`/processing/${d.recording_id}`);
      }
    };

    ws.onerror = () => {
      setErrorMessage("WebSocket connection failed. Please try again.");
      setStatus("error");
    };
  }, [drawLoop, handleChunkProcessed, router]);

  // ── Stop recording ───────────────────────────────────────────────────────────
  const handleStop = useCallback(() => {
    setStatus("stopping");
    wsRef.current?.send(JSON.stringify({ action: "stop" }));
    if (animationFrameRef.current != null) {
      cancelAnimationFrame(animationFrameRef.current);
      animationFrameRef.current = null;
    }
    (streamRef.current?.getTracks() ?? []).forEach((t) => t.stop());
    void audioContextRef.current?.close();
  }, []);

  // ── Noise type badge colour ──────────────────────────────────────────────────
  const noiseBadgeClass: Record<string, string> = {
    airplane: "bg-blue-500/20 text-blue-300 border-blue-500/30",
    car: "bg-amber-500/20 text-amber-300 border-amber-500/30",
    generator: "bg-orange-500/20 text-orange-300 border-orange-500/30",
    wind: "bg-teal-500/20 text-teal-300 border-teal-500/30",
  };
  const badgeClass =
    noiseBadgeClass[noiseType] ??
    "bg-ev-warm-gray/20 text-ev-warm-gray border-ev-warm-gray/30";

  // ── Render ───────────────────────────────────────────────────────────────────
  return (
    <div className="min-h-screen bg-background text-ev-charcoal">
      <div className="max-w-4xl mx-auto px-4 py-8 space-y-6">
        {/* Page header */}
        <div className="space-y-1">
          <h1 className="text-2xl font-bold text-ev-charcoal">
            Live Recording
          </h1>
          <p className="text-sm text-ev-elephant">
            Capture live audio and remove field noise in real time.
          </p>
        </div>

        {/* Error banner */}
        <AnimatePresence>
          {errorMessage && (
            <motion.div
              initial={{ opacity: 0, y: -8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -8 }}
              className="flex items-start gap-3 rounded-lg border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-400"
            >
              <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
              <span>{errorMessage}</span>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Live waveform canvas */}
        <div className="rounded-xl border border-ev-sand bg-ev-cream overflow-hidden">
          <div className="px-4 py-2.5 border-b border-ev-sand flex items-center gap-2">
            <Activity className="h-4 w-4 text-ev-elephant" />
            <span className="text-sm font-semibold text-ev-charcoal">
              Live Waveform
            </span>
            {status === "recording" && (
              <span className="ml-auto flex items-center gap-1.5 text-xs text-red-400 font-medium">
                <span className="inline-block h-2 w-2 rounded-full bg-red-400 animate-pulse" />
                REC
              </span>
            )}
          </div>
          <canvas
            ref={waveformCanvasRef}
            width={800}
            height={96}
            className="block w-full"
            aria-label="Live waveform"
          />
        </div>

        {/* Live spectrogram canvas */}
        <div className="rounded-xl border border-ev-sand bg-ev-cream overflow-hidden">
          <div className="px-4 py-2.5 border-b border-ev-sand flex items-center gap-2">
            <Radio className="h-4 w-4 text-ev-elephant" />
            <span className="text-sm font-semibold text-ev-charcoal">
              Live Spectrogram
            </span>
            <span className="ml-auto text-xs text-ev-warm-gray font-mono">
              Cleaned output
            </span>
          </div>
          <canvas
            ref={spectrogramCanvasRef}
            width={800}
            height={128}
            className="block w-full"
            aria-label="Live spectrogram"
          />
        </div>

        {/* Metrics row */}
        <div className="grid grid-cols-3 gap-4">
          {/* Noise type */}
          <div className="rounded-xl border border-ev-sand bg-ev-cream p-4 space-y-2">
            <span className="text-xs text-ev-warm-gray font-medium uppercase tracking-wide">
              Noise Type
            </span>
            <div
              className={`inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-semibold ${badgeClass}`}
            >
              {noiseType}
            </div>
          </div>

          {/* Avg SNR improvement */}
          <div className="rounded-xl border border-ev-sand bg-ev-cream p-4 space-y-2">
            <span className="text-xs text-ev-warm-gray font-medium uppercase tracking-wide">
              Avg SNR Improvement
            </span>
            <p className="text-xl font-bold text-ev-charcoal font-mono">
              {avgSnrImprovement >= 0 ? "+" : ""}
              {avgSnrImprovement.toFixed(1)} dB
            </p>
          </div>

          {/* Chunks processed */}
          <div className="rounded-xl border border-ev-sand bg-ev-cream p-4 space-y-2">
            <span className="text-xs text-ev-warm-gray font-medium uppercase tracking-wide">
              Chunks Processed
            </span>
            <p className="text-xl font-bold text-ev-charcoal font-mono">
              {chunkCount}
            </p>
          </div>
        </div>

        {/* Record / Stop button */}
        <div className="flex justify-center pt-2">
          {status === "idle" || status === "error" ? (
            <motion.button
              whileTap={{ scale: 0.95 }}
              onClick={() => void handleStart()}
              aria-label="Start Recording"
              className="flex items-center gap-2 rounded-full bg-red-500 px-8 py-3 text-sm font-semibold text-white shadow-lg hover:bg-red-600 transition-colors"
            >
              <Mic className="h-4 w-4" />
              Start Recording
            </motion.button>
          ) : status === "requesting" ? (
            <button
              disabled
              aria-label="Requesting microphone"
              className="flex items-center gap-2 rounded-full bg-ev-warm-gray px-8 py-3 text-sm font-semibold text-white cursor-not-allowed opacity-70"
            >
              <Mic className="h-4 w-4 animate-pulse" />
              Requesting Microphone…
            </button>
          ) : status === "recording" ? (
            <motion.button
              whileTap={{ scale: 0.95 }}
              onClick={handleStop}
              aria-label="Stop Recording"
              className="flex items-center gap-2 rounded-full bg-ev-charcoal px-8 py-3 text-sm font-semibold text-white shadow-lg hover:bg-ev-charcoal/90 transition-colors"
            >
              <MicOff className="h-4 w-4" />
              Stop Recording
            </motion.button>
          ) : (
            <button
              disabled
              aria-label="Finishing"
              className="flex items-center gap-2 rounded-full bg-ev-warm-gray px-8 py-3 text-sm font-semibold text-white cursor-not-allowed opacity-70"
            >
              <MicOff className="h-4 w-4 animate-pulse" />
              Finishing…
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
