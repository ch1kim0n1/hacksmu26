"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  CheckCircle2,
  Loader2,
  Mic,
  Square,
  Upload,
  Zap,
  Wind,
  Volume2,
  VolumeX,
  TrendingUp,
  ArrowRight,
  Smartphone,
} from "lucide-react";
import { uploadFiles, processRecording, API_BASE } from "@/lib/audio-api";

/* ── Constants ─────────────────────────────────────────────────── */

const CHUNK_SECONDS = 2.5;

/* ── Types ──────────────────────────────────────────────────────── */

interface ChunkStat {
  noiseType: string;
  confidence: number;
  snrBefore: number;
  snrAfter: number;
}

/* ── Helpers ────────────────────────────────────────────────────── */

function formatDuration(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds <= 0) return "0:00";
  return `${Math.floor(seconds / 60)}:${String(Math.floor(seconds % 60)).padStart(2, "0")}`;
}

function rmsFromAnalyser(analyser: AnalyserNode, data: Uint8Array): number {
  analyser.getByteTimeDomainData(data);
  let sumSq = 0;
  for (let i = 0; i < data.length; i++) { const s = (data[i] - 128) / 128; sumSq += s * s; }
  return Math.min(1, Math.sqrt(sumSq / data.length) * 4.2);
}

function concatFloat32(arrays: Float32Array[]): Float32Array {
  const total = arrays.reduce((n, a) => n + a.length, 0);
  const out = new Float32Array(total);
  let offset = 0;
  for (const a of arrays) { out.set(a, offset); offset += a.length; }
  return out;
}

function encodeWav(samples: Float32Array, sampleRate: number): Blob {
  const buf = new ArrayBuffer(44 + samples.length * 4);
  const v = new DataView(buf);
  const str = (o: number, s: string) => { for (let i = 0; i < s.length; i++) v.setUint8(o + i, s.charCodeAt(i)); };
  str(0, "RIFF"); v.setUint32(4, 36 + samples.length * 4, true);
  str(8, "WAVE"); str(12, "fmt ");
  v.setUint32(16, 16, true); v.setUint16(20, 3, true);
  v.setUint16(22, 1, true);
  v.setUint32(24, sampleRate, true); v.setUint32(28, sampleRate * 4, true);
  v.setUint16(32, 4, true); v.setUint16(34, 32, true);
  str(36, "data"); v.setUint32(40, samples.length * 4, true);
  new Float32Array(buf, 44).set(samples);
  return new Blob([buf], { type: "audio/wav" });
}

function noiseColor(type: string | null) {
  switch (type) {
    case "airplane": return "text-blue-500 border-blue-200 bg-blue-50";
    case "car":      return "text-orange-500 border-orange-200 bg-orange-50";
    case "generator":return "text-yellow-600 border-yellow-200 bg-yellow-50";
    case "wind":     return "text-cyan-500 border-cyan-200 bg-cyan-50";
    default:         return "text-accent-savanna border-accent-savanna/20 bg-accent-savanna/10";
  }
}

function NoiseIcon({ type }: { type: string | null }) {
  if (type === "wind") return <Wind className="h-3.5 w-3.5" />;
  return <Zap className="h-3.5 w-3.5" />;
}

/* ── Sub-components ─────────────────────────────────────────────── */

function ConfidenceBar({ label, value, color }: { label: string; value: number; color: string }) {
  return (
    <div>
      <div className="mb-1 flex items-center justify-between text-[11px]">
        <span className="text-ev-warm-gray">{label}</span>
        <span className="font-mono font-semibold text-ev-charcoal">{Math.round(value * 100)}%</span>
      </div>
      <div className="h-1.5 rounded-full bg-ev-sand/40">
        <div
          className={`h-full rounded-full transition-[width] duration-500 ${color}`}
          style={{ width: `${Math.round(value * 100)}%` }}
        />
      </div>
    </div>
  );
}

function SNRArrow({ before, after }: { before: number; after: number }) {
  const improvement = after - before;
  return (
    <div className="flex items-center gap-1.5 font-mono text-[11px]">
      <span className="text-ev-warm-gray">{before.toFixed(1)} dB</span>
      <ArrowRight className="h-3 w-3 text-ev-dust" />
      <span className={improvement >= 0 ? "font-semibold text-success" : "text-danger"}>
        {after.toFixed(1)} dB
      </span>
      <span className={`ml-1 rounded px-1 py-0.5 text-[10px] font-semibold ${improvement >= 0 ? "bg-success/10 text-success" : "bg-danger/10 text-danger"}`}>
        {improvement >= 0 ? "+" : ""}{improvement.toFixed(1)}
      </span>
    </div>
  );
}

/* ── Main component ─────────────────────────────────────────────── */

export default function RealtimeMicTest({ onUploaded }: { onUploaded?: () => void } = {}) {
  /* refs — audio graph */
  const contextRef        = useRef<AudioContext | null>(null);
  const mediaStreamRef    = useRef<MediaStream | null>(null);
  const rawAnalyserRef    = useRef<AnalyserNode | null>(null);
  const processorRef      = useRef<ScriptProcessorNode | null>(null);

  /* refs — recording */
  const rawRecorderRef    = useRef<MediaRecorder | null>(null);
  const rawChunksRef      = useRef<BlobPart[]>([]);
  const rawBlobRef        = useRef<Blob | null>(null);
  const rawUrlRef         = useRef<string | null>(null);
  const filteredUrlRef    = useRef<string | null>(null);
  const pendingStopsRef   = useRef(0);

  /* refs — PCM / chunk pipeline */
  const pcmBufferRef      = useRef<Float32Array[]>([]);
  const filteredBufsRef   = useRef<Float32Array[]>([]);
  const chunkChainRef     = useRef<Promise<void>>(Promise.resolve());
  const isActiveRef       = useRef(false);
  const nextPlayTimeRef   = useRef(0);
  const monitorEnabledRef = useRef(false);
  const phoneModeRef      = useRef(false);
  const sampleRateRef     = useRef(44100);

  /* refs — timers */
  const rafRef            = useRef<number | null>(null);
  const timerRef          = useRef<ReturnType<typeof setInterval> | null>(null);
  const stopRecordingRef  = useRef<() => void>(() => undefined);

  /* state */
  const [isRecording,      setIsRecording]      = useState(false);
  const [isStopping,       setIsStopping]       = useState(false);
  const [error,            setError]            = useState<string | null>(null);
  const [elapsedSec,       setElapsedSec]       = useState(0);
  const [rawLevel,         setRawLevel]         = useState(0);
  const [filteredLevel,    setFilteredLevel]    = useState(0);
  const [chunkStats,       setChunkStats]       = useState<ChunkStat[]>([]);
  const [isFiltering,      setIsFiltering]      = useState(false);
  const [monitorEnabled,   setMonitorEnabled]   = useState(false);
  const [rawUrl,           setRawUrl]           = useState<string | null>(null);
  const [filteredUrl,      setFilteredUrl]      = useState<string | null>(null);
  const [sessionLabel,     setSessionLabel]     = useState("");
  const [isSendingToQueue, setIsSendingToQueue] = useState(false);
  const [queuedId,         setQueuedId]         = useState<string | null>(null);
  const [queueError,       setQueueError]       = useState<string | null>(null);
  const [phoneMode,        setPhoneMode]        = useState(false);

  /* derived from chunk history */
  const latestStat   = chunkStats.at(-1) ?? null;
  const avgSnrBefore = chunkStats.length ? chunkStats.reduce((s, c) => s + c.snrBefore, 0) / chunkStats.length : null;
  const avgSnrAfter  = chunkStats.length ? chunkStats.reduce((s, c) => s + c.snrAfter,  0) / chunkStats.length : null;
  const avgImprovement = avgSnrBefore !== null && avgSnrAfter !== null ? avgSnrAfter - avgSnrBefore : null;

  useEffect(() => { monitorEnabledRef.current = monitorEnabled; }, [monitorEnabled]);
  useEffect(() => { phoneModeRef.current = phoneMode; }, [phoneMode]);

  /* ── Cleanup helpers ───────────────────────────────────────── */

  const clearAnimation = useCallback(() => {
    if (rafRef.current != null) { cancelAnimationFrame(rafRef.current); rafRef.current = null; }
  }, []);

  const clearTimer = useCallback(() => {
    if (timerRef.current) { clearInterval(timerRef.current); timerRef.current = null; }
  }, []);

  const revokeOutputUrls = useCallback(() => {
    if (rawUrlRef.current)      { URL.revokeObjectURL(rawUrlRef.current);      rawUrlRef.current = null; }
    if (filteredUrlRef.current) { URL.revokeObjectURL(filteredUrlRef.current); filteredUrlRef.current = null; }
    setRawUrl(null);
    setFilteredUrl(null);
  }, []);

  const closeAudioGraph = useCallback(() => {
    clearAnimation(); clearTimer();
    mediaStreamRef.current?.getTracks().forEach((t) => t.stop());
    mediaStreamRef.current = null;
    processorRef.current = null;
    rawAnalyserRef.current = null;
    setRawLevel(0); setFilteredLevel(0);
    if (contextRef.current) { void contextRef.current.close(); contextRef.current = null; }
  }, [clearAnimation, clearTimer]);

  /* ── Backend chunk sender ──────────────────────────────────── */

  const sendChunk = useCallback(async (chunk: Float32Array, sr: number) => {
    const ctx = contextRef.current;
    setIsFiltering(true);
    try {
      const phone = phoneModeRef.current;
      const params = new URLSearchParams({
        sr: String(sr),
        preserve_harmonics: "true",
        aggressiveness: phone ? "0.45" : "1.0",
        high_hz: phone ? "4000" : "1200",
      });
      const resp = await fetch(
        `${API_BASE}/api/filter-chunk?${params}`,
        { method: "POST", body: chunk.buffer, headers: { "Content-Type": "application/octet-stream" } }
      );
      if (!resp.ok) return;

      const nType = resp.headers.get("X-Noise-Type") ?? "other";
      const nConf = parseFloat(resp.headers.get("X-Noise-Confidence") ?? "0");
      const snrB  = parseFloat(resp.headers.get("X-SNR-Before-DB") ?? "NaN");
      const snrA  = parseFloat(resp.headers.get("X-SNR-After-DB") ?? "NaN");

      if (isFinite(snrB) && isFinite(snrA)) {
        setChunkStats((prev) => [...prev, { noiseType: nType, confidence: nConf, snrBefore: snrB, snrAfter: snrA }]);
      }

      const filteredBytes = await resp.arrayBuffer();
      const filtered = new Float32Array(filteredBytes);
      filteredBufsRef.current.push(filtered);

      if (filtered.length > 0) {
        let sumSq = 0;
        for (let i = 0; i < filtered.length; i++) sumSq += filtered[i] * filtered[i];
        setFilteredLevel(Math.min(1, Math.sqrt(sumSq / filtered.length) * 4.2));
      }

      if (monitorEnabledRef.current && ctx && ctx.state !== "closed" && filtered.length > 0) {
        const audioBuf = ctx.createBuffer(1, filtered.length, sr);
        audioBuf.copyToChannel(filtered, 0);
        const when = Math.max(ctx.currentTime + 0.05, nextPlayTimeRef.current);
        nextPlayTimeRef.current = when + audioBuf.duration;
        const src = ctx.createBufferSource();
        src.buffer = audioBuf;
        src.connect(ctx.destination);
        src.start(when);
      }
    } catch { /* backend offline */ }
    finally { setIsFiltering(false); }
  }, []);

  /* ── Start ─────────────────────────────────────────────────── */

  const startRecording = useCallback(async () => {
    if (isRecording || isStopping) return;
    setError(null); setQueueError(null); setQueuedId(null);
    setChunkStats([]);

    revokeOutputUrls();
    closeAudioGraph();
    rawBlobRef.current = null;

    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: false, channelCount: 1 },
      });
      mediaStreamRef.current = stream;

      const ctx = new AudioContext({ latencyHint: "interactive" });
      contextRef.current = ctx;
      const sr = ctx.sampleRate;
      sampleRateRef.current = sr;
      nextPlayTimeRef.current = 0;
      pcmBufferRef.current = [];
      filteredBufsRef.current = [];
      chunkChainRef.current = Promise.resolve();
      isActiveRef.current = true;

      const source = ctx.createMediaStreamSource(stream);

      const rawAnalyser = ctx.createAnalyser();
      rawAnalyser.fftSize = 2048;
      rawAnalyser.smoothingTimeConstant = 0.75;
      rawAnalyserRef.current = rawAnalyser;
      source.connect(rawAnalyser);

      const processor = ctx.createScriptProcessor(4096, 1, 1);
      processorRef.current = processor;
      processor.onaudioprocess = (event) => {
        if (!isActiveRef.current) return;
        pcmBufferRef.current.push(new Float32Array(event.inputBuffer.getChannelData(0)));
        const total = pcmBufferRef.current.reduce((n, a) => n + a.length, 0);
        if (total >= CHUNK_SECONDS * sr) {
          const chunk = concatFloat32(pcmBufferRef.current);
          pcmBufferRef.current = [];
          chunkChainRef.current = chunkChainRef.current.then(() => sendChunk(chunk, sr));
        }
      };
      const silence = ctx.createGain();
      silence.gain.value = 0;
      source.connect(processor);
      processor.connect(silence);
      silence.connect(ctx.destination);

      const rawDest = ctx.createMediaStreamDestination();
      source.connect(rawDest);
      const mimeType = ["audio/webm;codecs=opus", "audio/webm", "audio/ogg;codecs=opus"]
        .find((m) => MediaRecorder.isTypeSupported(m));
      const rawRecorder = mimeType
        ? new MediaRecorder(rawDest.stream, { mimeType })
        : new MediaRecorder(rawDest.stream);
      rawChunksRef.current = [];
      rawRecorder.ondataavailable = (e) => { if (e.data.size > 0) rawChunksRef.current.push(e.data); };

      const stamp = new Date().toISOString().replace(/[:.]/g, "-");
      const label = `mic-${stamp}`;

      rawRecorder.onstop = () => {
        const blob = new Blob(rawChunksRef.current, { type: rawRecorder.mimeType || "audio/webm" });
        rawBlobRef.current = blob;
        const url = URL.createObjectURL(blob);
        if (rawUrlRef.current) URL.revokeObjectURL(rawUrlRef.current);
        rawUrlRef.current = url;
        setRawUrl(url);

        pendingStopsRef.current = Math.max(0, pendingStopsRef.current - 1);
        if (pendingStopsRef.current === 0) {
          if (filteredBufsRef.current.length > 0) {
            const allFiltered = concatFloat32(filteredBufsRef.current);
            const wavBlob = encodeWav(allFiltered, sr);
            const fUrl = URL.createObjectURL(wavBlob);
            if (filteredUrlRef.current) URL.revokeObjectURL(filteredUrlRef.current);
            filteredUrlRef.current = fUrl;
            setFilteredUrl(fUrl);
          }
          closeAudioGraph();
          setIsStopping(false);
        }
      };

      rawRecorderRef.current = rawRecorder;
      rawRecorder.start(250);
      setSessionLabel(label);
      setIsRecording(true);
      setIsStopping(false);

      const rawData = new Uint8Array(rawAnalyser.fftSize);
      const tick = () => { setRawLevel(rmsFromAnalyser(rawAnalyser, rawData)); rafRef.current = requestAnimationFrame(tick); };
      tick();

      setElapsedSec(0);
      const t0 = Date.now();
      timerRef.current = setInterval(() => setElapsedSec(Math.floor((Date.now() - t0) / 1000)), 200);
    } catch (err) {
      closeAudioGraph();
      setError(err instanceof Error ? err.message : "Microphone access failed.");
    }
  }, [closeAudioGraph, isRecording, isStopping, revokeOutputUrls, sendChunk]);

  /* ── Stop ──────────────────────────────────────────────────── */

  const stopRecording = useCallback(() => {
    if (!isRecording || isStopping) return;
    isActiveRef.current = false;
    setIsRecording(false);
    setIsStopping(true);
    clearAnimation(); clearTimer();
    setRawLevel(0);

    pendingStopsRef.current = 0;
    const rec = rawRecorderRef.current;
    if (rec && rec.state !== "inactive") { pendingStopsRef.current += 1; rec.stop(); }
    rawRecorderRef.current = null;
    if (pendingStopsRef.current === 0) { closeAudioGraph(); setIsStopping(false); }
  }, [clearAnimation, clearTimer, closeAudioGraph, isRecording, isStopping]);

  useEffect(() => { stopRecordingRef.current = stopRecording; }, [stopRecording]);

  useEffect(() => {
    return () => { stopRecordingRef.current(); closeAudioGraph(); revokeOutputUrls(); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /* ── Send to pipeline ──────────────────────────────────────── */

  const handleSendToPipeline = useCallback(async () => {
    const blob = rawBlobRef.current;
    if (!blob) return;
    setIsSendingToQueue(true);
    setQueueError(null);
    setQueuedId(null);
    try {
      const ext = blob.type.includes("ogg") ? "ogg" : "webm";
      const file = new File([blob], `${sessionLabel}.${ext}`, { type: blob.type });
      const { recording_ids } = await uploadFiles([file]);
      const id = recording_ids[0];
      await processRecording(id, { method: "hybrid" });
      setQueuedId(id);
      onUploaded?.();
    } catch (err) {
      setQueueError(err instanceof Error ? err.message : "Failed to send to pipeline.");
    } finally {
      setIsSendingToQueue(false);
    }
  }, [onUploaded, sessionLabel]);

  /* ── Render ────────────────────────────────────────────────── */

  const hasResults = rawUrl || filteredUrl;

  return (
    <div className="rounded-2xl border border-ev-sand/30 bg-white/40 p-5 space-y-4">

      {/* Header */}
      <div className="flex items-start justify-between gap-3">
        <div>
          <h3 className="text-base font-semibold text-ev-charcoal">Live Mic Filter</h3>
          <p className="mt-0.5 text-xs text-ev-warm-gray">
            Filtered in real time by the same AI pipeline used for recordings.
          </p>
        </div>
        <span className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px] font-medium ${
          isRecording
            ? "border-danger/20 bg-danger/10 text-danger"
            : "border-accent-savanna/20 bg-accent-savanna/10 text-accent-savanna"
        }`}>
          <Mic className="h-3.5 w-3.5" />
          {isRecording ? "● Recording" : "Ready"}
        </span>
      </div>

      {/* Controls */}
      <div className="grid gap-2 sm:grid-cols-4">
        <button type="button" onClick={() => void startRecording()} disabled={isRecording || isStopping}
          className="inline-flex items-center justify-center gap-2 rounded-xl bg-success px-3 py-2 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:opacity-60">
          {isRecording ? <Loader2 className="h-4 w-4 animate-spin" /> : <Mic className="h-4 w-4" />}
          Start Mic
        </button>
        <button type="button" onClick={stopRecording} disabled={!isRecording || isStopping}
          className="inline-flex items-center justify-center gap-2 rounded-xl border border-ev-sand/60 bg-white px-3 py-2 text-sm font-semibold text-ev-elephant disabled:cursor-not-allowed disabled:opacity-60">
          <Square className="h-4 w-4" />
          Stop
        </button>
        <button type="button" onClick={() => setMonitorEnabled((v) => !v)}
          className={`inline-flex items-center justify-center gap-2 rounded-xl border px-3 py-2 text-xs font-medium transition-colors ${
            monitorEnabled ? "border-accent-savanna/30 bg-accent-savanna/10 text-accent-savanna" : "border-ev-sand/60 bg-white text-ev-elephant"
          }`}>
          {monitorEnabled ? <Volume2 className="h-4 w-4" /> : <VolumeX className="h-4 w-4" />}
          {monitorEnabled ? "Monitor on" : "Monitor off"}
        </button>

        <button type="button" onClick={() => setPhoneMode((v) => !v)}
          title="Use when playing audio through a phone or speaker near the mic"
          className={`inline-flex items-center justify-center gap-2 rounded-xl border px-3 py-2 text-xs font-medium transition-colors ${
            phoneMode ? "border-blue-300 bg-blue-50 text-blue-600" : "border-ev-sand/60 bg-white text-ev-elephant"
          }`}>
          <Smartphone className="h-4 w-4" />
          {phoneMode ? "Phone mode on" : "Phone mode"}
        </button>
      </div>

      {/* Live meters */}
      <div className="rounded-xl border border-ev-sand/40 bg-ev-cream/70 p-3 space-y-3">
        <div className="flex items-center justify-between text-xs text-ev-warm-gray">
          <span>Elapsed</span>
          <span className="font-mono tabular-nums">{formatDuration(elapsedSec)}</span>
        </div>

        <ConfidenceBar label="Raw input level" value={rawLevel} color="bg-gradient-to-r from-danger/70 to-warning/80" />

        <div>
          <div className="mb-1 flex items-center justify-between text-[11px] text-ev-warm-gray">
            <span className="flex items-center gap-1">
              Filtered output level
              {isFiltering && <Loader2 className="h-3 w-3 animate-spin text-accent-savanna" />}
            </span>
            <span>{Math.round(filteredLevel * 100)}%</span>
          </div>
          <div className="h-1.5 rounded-full bg-ev-sand/40">
            <div className="h-full rounded-full bg-gradient-to-r from-success/80 to-accent-savanna/80 transition-[width] duration-500"
              style={{ width: `${Math.round(filteredLevel * 100)}%` }} />
          </div>
        </div>

        {phoneMode && (
          <p className="text-[10px] text-blue-500/80">
            Phone mode — lower aggressiveness (0.45×), wider band (up to 4 kHz) to preserve signal played through a speaker.
          </p>
        )}
        {monitorEnabled && isRecording && (
          <p className="text-[10px] text-ev-warm-gray/70">
            Live preview has ~{CHUNK_SECONDS}s lag — use headphones to avoid feedback.
          </p>
        )}
      </div>

      {/* AI stats panel — shows after first chunk returns */}
      {latestStat && (
        <div className="rounded-xl border border-ev-sand/40 bg-ev-cream/50 p-3 space-y-3">
          <p className="text-[11px] font-semibold text-ev-elephant uppercase tracking-wide">
            AI Analysis · {chunkStats.length} chunk{chunkStats.length !== 1 ? "s" : ""}
          </p>

          {/* Noise type badge */}
          <div className="flex items-center justify-between">
            <span className="text-[11px] text-ev-warm-gray">Detected noise</span>
            <span className={`inline-flex items-center gap-1 rounded-full border px-2.5 py-0.5 text-[11px] font-semibold capitalize ${noiseColor(latestStat.noiseType)}`}>
              <NoiseIcon type={latestStat.noiseType} />
              {latestStat.noiseType}
            </span>
          </div>

          {/* Confidence bar */}
          <ConfidenceBar
            label="Noise classification confidence"
            value={latestStat.confidence}
            color="bg-gradient-to-r from-accent-savanna/70 to-accent-gold"
          />

          {/* SNR latest chunk */}
          <div className="flex items-center justify-between">
            <span className="text-[11px] text-ev-warm-gray">SNR (last chunk)</span>
            <SNRArrow before={latestStat.snrBefore} after={latestStat.snrAfter} />
          </div>

          {/* SNR average across all chunks */}
          {chunkStats.length > 1 && avgSnrBefore !== null && avgSnrAfter !== null && (
            <div className="flex items-center justify-between">
              <span className="text-[11px] text-ev-warm-gray">SNR (session avg)</span>
              <SNRArrow before={avgSnrBefore} after={avgSnrAfter} />
            </div>
          )}

          {/* Overall improvement pill */}
          {avgImprovement !== null && (
            <div className="flex items-center gap-2 rounded-lg bg-success/8 px-3 py-2">
              <TrendingUp className="h-4 w-4 shrink-0 text-success" />
              <span className="text-[11px] text-ev-elephant">
                Pipeline removed <span className="font-semibold text-success">
                  {Math.abs(avgImprovement).toFixed(1)} dB
                </span> of noise on average
              </span>
            </div>
          )}
        </div>
      )}

      {/* Post-recording: players + actions */}
      {hasResults && (
        <div className="rounded-xl border border-success/20 bg-success/5 p-3 space-y-3">
          <div className="flex items-center gap-2 text-xs text-success">
            <CheckCircle2 className="h-4 w-4 shrink-0" />
            <span className="font-medium">Recording complete — A/B comparison ready</span>
          </div>

          {/* Audio players */}
          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <p className="mb-1 text-[11px] font-medium text-ev-elephant">Unfiltered (raw mic)</p>
              {rawUrl && (
                <>
                  <audio controls src={rawUrl} className="h-8 w-full" />
                  <a href={rawUrl} download={`${sessionLabel}-raw.webm`}
                    className="mt-1 inline-flex text-xs font-medium text-accent-savanna hover:underline">
                    Download raw
                  </a>
                </>
              )}
            </div>
            <div>
              <p className="mb-1 text-[11px] font-medium text-ev-elephant">AI-filtered (pipeline)</p>
              {filteredUrl ? (
                <>
                  <audio controls src={filteredUrl} className="h-8 w-full" />
                  <a href={filteredUrl} download={`${sessionLabel}-filtered.wav`}
                    className="mt-1 inline-flex text-xs font-medium text-success hover:underline">
                    Download filtered
                  </a>
                </>
              ) : (
                <p className="text-[11px] text-ev-warm-gray italic">
                  No filtered audio — was the backend running?
                </p>
              )}
            </div>
          </div>

          {/* Send to pipeline button */}
          <div className="pt-1 border-t border-success/15">
            {queuedId ? (
              <div className="flex items-center gap-2 text-xs text-success">
                <CheckCircle2 className="h-4 w-4" />
                <span>
                  Added to Your Recordings — full pipeline running.{" "}
                  <a href="/upload" className="font-semibold underline hover:no-underline">
                    View in Upload page →
                  </a>
                </span>
              </div>
            ) : (
              <button
                type="button"
                onClick={() => void handleSendToPipeline()}
                disabled={isSendingToQueue || !rawBlobRef.current}
                className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-accent-savanna to-accent-gold px-4 py-2.5 text-sm font-semibold text-white shadow-sm disabled:cursor-not-allowed disabled:opacity-60 hover:shadow-md transition-shadow"
              >
                {isSendingToQueue ? (
                  <><Loader2 className="h-4 w-4 animate-spin" /> Processing…</>
                ) : (
                  <><Upload className="h-4 w-4" /> Add to Your Recordings &amp; Run Full Pipeline</>
                )}
              </button>
            )}
            {queueError && <p className="mt-1 text-xs text-danger">{queueError}</p>}
          </div>
        </div>
      )}

      {error && <p className="text-xs text-danger">{error}</p>}
    </div>
  );
}
