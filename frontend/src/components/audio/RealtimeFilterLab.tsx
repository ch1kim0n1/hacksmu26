"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { CheckCircle2, Loader2, Mic2, Pause, Play, UploadCloud } from "lucide-react";

function formatTime(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds <= 0) return "0:00";
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  return `${mins}:${secs.toString().padStart(2, "0")}`;
}

function pickRecorderMimeType(): string | undefined {
  const options = [
    "audio/webm;codecs=opus",
    "audio/webm",
    "audio/ogg;codecs=opus",
  ];
  return options.find((mime) => MediaRecorder.isTypeSupported(mime));
}

export default function RealtimeFilterLab() {
  const inputRef = useRef<HTMLInputElement>(null);
  const audioRef = useRef<HTMLAudioElement>(null);
  const objectUrlRef = useRef<string | null>(null);
  const renderedUrlRef = useRef<string | null>(null);
  const rafRef = useRef<number | null>(null);

  const contextRef = useRef<AudioContext | null>(null);
  const sourceRef = useRef<MediaElementAudioSourceNode | null>(null);
  const highPassRef = useRef<BiquadFilterNode | null>(null);
  const lowPassRef = useRef<BiquadFilterNode | null>(null);
  const compressorRef = useRef<DynamicsCompressorNode | null>(null);
  const dryGainRef = useRef<GainNode | null>(null);
  const wetGainRef = useRef<GainNode | null>(null);
  const outputGainRef = useRef<GainNode | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const destinationRef = useRef<MediaStreamAudioDestinationNode | null>(null);

  const recorderRef = useRef<MediaRecorder | null>(null);
  const recorderChunksRef = useRef<BlobPart[]>([]);

  const [fileName, setFileName] = useState<string>("");
  const [audioUrl, setAudioUrl] = useState<string | null>(null);
  const [filteredUrl, setFilteredUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const [isPlaying, setIsPlaying] = useState(false);
  const [isRendering, setIsRendering] = useState(false);
  const [level, setLevel] = useState(0);

  const [position, setPosition] = useState(0);
  const [duration, setDuration] = useState(0);

  const [highPassHz, setHighPassHz] = useState(18);
  const [lowPassHz, setLowPassHz] = useState(1200);
  const [mixPct, setMixPct] = useState(88);
  const [outputGainDb, setOutputGainDb] = useState(0);

  const outputGainLinear = useMemo(
    () => Math.pow(10, outputGainDb / 20),
    [outputGainDb]
  );

  const stopMeter = useCallback(() => {
    if (rafRef.current != null) {
      cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
    }
  }, []);

  const startMeter = useCallback(() => {
    const analyser = analyserRef.current;
    if (!analyser) return;

    const samples = new Uint8Array(analyser.fftSize);
    const tick = () => {
      analyser.getByteTimeDomainData(samples);
      let sumSq = 0;
      for (let i = 0; i < samples.length; i += 1) {
        const normalized = (samples[i] - 128) / 128;
        sumSq += normalized * normalized;
      }
      const rms = Math.sqrt(sumSq / samples.length);
      setLevel(Math.min(1, rms * 4.2));
      rafRef.current = requestAnimationFrame(tick);
    };
    tick();
  }, []);

  const applyFilterSettings = useCallback(() => {
    const ctx = contextRef.current;
    if (!ctx) return;

    if (highPassRef.current) {
      highPassRef.current.frequency.setTargetAtTime(
        highPassHz,
        ctx.currentTime,
        0.015
      );
    }
    if (lowPassRef.current) {
      lowPassRef.current.frequency.setTargetAtTime(
        lowPassHz,
        ctx.currentTime,
        0.015
      );
    }

    const wet = mixPct / 100;
    if (wetGainRef.current) {
      wetGainRef.current.gain.setTargetAtTime(wet, ctx.currentTime, 0.02);
    }
    if (dryGainRef.current) {
      dryGainRef.current.gain.setTargetAtTime(1 - wet, ctx.currentTime, 0.02);
    }
    if (outputGainRef.current) {
      outputGainRef.current.gain.setTargetAtTime(
        outputGainLinear,
        ctx.currentTime,
        0.02
      );
    }
  }, [highPassHz, lowPassHz, mixPct, outputGainLinear]);

  const ensureGraph = useCallback(async () => {
    const audio = audioRef.current;
    if (!audio) {
      throw new Error("Audio element is not ready.");
    }

    if (!contextRef.current) {
      contextRef.current = new AudioContext({ latencyHint: "interactive" });
    }

    const ctx = contextRef.current;
    if (ctx.state === "suspended") {
      await ctx.resume();
    }

    if (!sourceRef.current) {
      const source = ctx.createMediaElementSource(audio);

      const highPass = ctx.createBiquadFilter();
      highPass.type = "highpass";
      highPass.Q.value = 0.707;

      const lowPass = ctx.createBiquadFilter();
      lowPass.type = "lowpass";
      lowPass.Q.value = 0.707;

      const compressor = ctx.createDynamicsCompressor();
      compressor.threshold.value = -33;
      compressor.knee.value = 24;
      compressor.ratio.value = 10;
      compressor.attack.value = 0.003;
      compressor.release.value = 0.18;

      const dryGain = ctx.createGain();
      const wetGain = ctx.createGain();
      const outputGain = ctx.createGain();
      const analyser = ctx.createAnalyser();
      analyser.fftSize = 2048;
      analyser.smoothingTimeConstant = 0.75;
      const destination = ctx.createMediaStreamDestination();

      source.connect(dryGain);
      source.connect(highPass);
      highPass.connect(lowPass);
      lowPass.connect(compressor);
      compressor.connect(wetGain);

      dryGain.connect(outputGain);
      wetGain.connect(outputGain);
      outputGain.connect(analyser);
      outputGain.connect(ctx.destination);
      outputGain.connect(destination);

      sourceRef.current = source;
      highPassRef.current = highPass;
      lowPassRef.current = lowPass;
      compressorRef.current = compressor;
      dryGainRef.current = dryGain;
      wetGainRef.current = wetGain;
      outputGainRef.current = outputGain;
      analyserRef.current = analyser;
      destinationRef.current = destination;

      audio.muted = true;
    }

    applyFilterSettings();
  }, [applyFilterSettings]);

  const stopRecorder = useCallback(() => {
    const recorder = recorderRef.current;
    if (recorder && recorder.state !== "inactive") {
      recorder.stop();
    } else {
      setIsRendering(false);
    }
  }, []);

  const startRecorder = useCallback(() => {
    const destination = destinationRef.current;
    if (!destination) return;

    const mimeType = pickRecorderMimeType();
    const recorder = mimeType
      ? new MediaRecorder(destination.stream, { mimeType })
      : new MediaRecorder(destination.stream);

    recorderChunksRef.current = [];
    recorder.ondataavailable = (event) => {
      if (event.data.size > 0) {
        recorderChunksRef.current.push(event.data);
      }
    };

    recorder.onstop = () => {
      const blob = new Blob(recorderChunksRef.current, {
        type: recorder.mimeType || "audio/webm",
      });
      const url = URL.createObjectURL(blob);

      if (renderedUrlRef.current) {
        URL.revokeObjectURL(renderedUrlRef.current);
      }
      renderedUrlRef.current = url;
      setFilteredUrl(url);
      setIsRendering(false);
      recorderRef.current = null;
    };

    recorder.start(250);
    recorderRef.current = recorder;
    setIsRendering(true);
  }, []);

  const stopPlayback = useCallback(() => {
    const audio = audioRef.current;
    if (audio) {
      audio.pause();
    }
    setIsPlaying(false);
    stopRecorder();
    stopMeter();
    setLevel(0);
  }, [stopMeter, stopRecorder]);

  const playFiltered = useCallback(
    async (render: boolean) => {
      setError(null);
      if (!audioUrl || !audioRef.current) {
        setError("Choose a recording first.");
        return;
      }

      try {
        await ensureGraph();
        const audio = audioRef.current;
        await audio.play();
        setIsPlaying(true);
        startMeter();

        if (render) {
          if (filteredUrl && renderedUrlRef.current) {
            URL.revokeObjectURL(renderedUrlRef.current);
            renderedUrlRef.current = null;
            setFilteredUrl(null);
          }
          startRecorder();
        }
      } catch (err) {
        const message =
          err instanceof Error ? err.message : "Unable to start filtered playback.";
        setError(message);
      }
    },
    [audioUrl, ensureGraph, filteredUrl, startMeter, startRecorder]
  );

  useEffect(() => {
    applyFilterSettings();
  }, [applyFilterSettings]);

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;

    const onLoadedMetadata = () => {
      setDuration(audio.duration || 0);
      setPosition(audio.currentTime || 0);
    };
    const onTimeUpdate = () => setPosition(audio.currentTime || 0);
    const onEnded = () => {
      setIsPlaying(false);
      stopRecorder();
      stopMeter();
      setLevel(0);
    };

    audio.addEventListener("loadedmetadata", onLoadedMetadata);
    audio.addEventListener("timeupdate", onTimeUpdate);
    audio.addEventListener("ended", onEnded);

    return () => {
      audio.removeEventListener("loadedmetadata", onLoadedMetadata);
      audio.removeEventListener("timeupdate", onTimeUpdate);
      audio.removeEventListener("ended", onEnded);
    };
  }, [stopMeter, stopRecorder]);

  useEffect(() => {
    const audio = audioRef.current;

    return () => {
      stopMeter();
      stopRecorder();
      audio?.pause();

      if (objectUrlRef.current) {
        URL.revokeObjectURL(objectUrlRef.current);
        objectUrlRef.current = null;
      }
      if (renderedUrlRef.current) {
        URL.revokeObjectURL(renderedUrlRef.current);
        renderedUrlRef.current = null;
      }

      const ctx = contextRef.current;
      if (ctx) {
        void ctx.close();
        contextRef.current = null;
      }
    };
  }, [stopMeter, stopRecorder]);

  const handleFileSelect = useCallback(
    (event: React.ChangeEvent<HTMLInputElement>) => {
      const file = event.target.files?.[0];
      if (!file) return;
      if (!file.type.startsWith("audio/")) {
        setError("Please choose an audio file.");
        return;
      }

      stopPlayback();
      setError(null);

      if (objectUrlRef.current) {
        URL.revokeObjectURL(objectUrlRef.current);
      }
      const url = URL.createObjectURL(file);
      objectUrlRef.current = url;
      setAudioUrl(url);
      setFileName(file.name);
      setPosition(0);
      setDuration(0);

      if (renderedUrlRef.current) {
        URL.revokeObjectURL(renderedUrlRef.current);
        renderedUrlRef.current = null;
      }
      setFilteredUrl(null);
    },
    [stopPlayback]
  );

  return (
    <section className="rounded-2xl border border-ev-sand/30 bg-white/40 p-5 shadow-sm">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-base font-semibold text-ev-charcoal">
            Real-Time Filter Lab
          </h2>
          <p className="mt-1 text-xs text-ev-warm-gray">
            Play any recording through a live denoise chain and export the filtered
            version.
          </p>
        </div>
        <span className="inline-flex items-center gap-1.5 rounded-full border border-success/20 bg-success/10 px-2.5 py-1 text-[11px] font-medium text-success">
          <Mic2 className="h-3.5 w-3.5" />
          Low-latency demo mode
        </span>
      </div>

      <div className="grid gap-3 lg:grid-cols-[1fr_auto_auto_auto]">
        <button
          type="button"
          onClick={() => inputRef.current?.click()}
          className="inline-flex items-center justify-center gap-2 rounded-xl border border-ev-sand/50 bg-background-elevated px-3 py-2 text-sm font-medium text-ev-charcoal hover:border-accent-savanna/40 hover:text-accent-savanna"
        >
          <UploadCloud className="h-4 w-4" />
          {fileName ? "Replace Recording" : "Choose Recording"}
        </button>
        <button
          type="button"
          onClick={() => void playFiltered(false)}
          disabled={!audioUrl || isPlaying}
          className="inline-flex items-center justify-center gap-2 rounded-xl bg-accent-savanna px-3 py-2 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:opacity-60"
        >
          <Play className="h-4 w-4" />
          Play Filtered
        </button>
        <button
          type="button"
          onClick={() => void playFiltered(true)}
          disabled={!audioUrl || isRendering}
          className="inline-flex items-center justify-center gap-2 rounded-xl bg-success px-3 py-2 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:opacity-60"
        >
          {isRendering ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <CheckCircle2 className="h-4 w-4" />
          )}
          {isRendering ? "Rendering..." : "Play + Render"}
        </button>
        <button
          type="button"
          onClick={stopPlayback}
          disabled={!isPlaying && !isRendering}
          className="inline-flex items-center justify-center gap-2 rounded-xl border border-ev-sand/60 bg-white px-3 py-2 text-sm font-semibold text-ev-elephant disabled:cursor-not-allowed disabled:opacity-60"
        >
          <Pause className="h-4 w-4" />
          Stop
        </button>
      </div>

      <input
        ref={inputRef}
        type="file"
        accept="audio/*,.wav,.mp3,.flac"
        className="hidden"
        onChange={handleFileSelect}
      />
      <audio ref={audioRef} src={audioUrl ?? undefined} preload="metadata" />

      <div className="mt-4 rounded-xl border border-ev-sand/40 bg-ev-cream/70 p-3">
        <div className="mb-1 flex items-center justify-between text-[11px] text-ev-warm-gray">
          <span>{fileName || "No file selected"}</span>
          <span className="tabular-nums">
            {formatTime(position)} / {formatTime(duration)}
          </span>
        </div>
        <div className="h-2 rounded-full bg-ev-sand/40">
          <div
            className="h-full rounded-full bg-accent-savanna transition-[width]"
            style={{
              width:
                duration > 0
                  ? `${Math.min(100, (position / duration) * 100).toFixed(2)}%`
                  : "0%",
            }}
          />
        </div>
      </div>

      <div className="mt-4 grid gap-4 md:grid-cols-2">
        <label className="block">
          <div className="mb-1 text-xs font-medium text-ev-elephant">
            High-pass cutoff: <span className="tabular-nums">{highPassHz} Hz</span>
          </div>
          <input
            type="range"
            min={8}
            max={120}
            step={1}
            value={highPassHz}
            onChange={(e) => setHighPassHz(Number(e.target.value))}
            className="w-full"
          />
        </label>

        <label className="block">
          <div className="mb-1 text-xs font-medium text-ev-elephant">
            Low-pass cutoff: <span className="tabular-nums">{lowPassHz} Hz</span>
          </div>
          <input
            type="range"
            min={400}
            max={4000}
            step={10}
            value={lowPassHz}
            onChange={(e) => setLowPassHz(Number(e.target.value))}
            className="w-full"
          />
        </label>

        <label className="block">
          <div className="mb-1 text-xs font-medium text-ev-elephant">
            Filter mix: <span className="tabular-nums">{mixPct}%</span>
          </div>
          <input
            type="range"
            min={0}
            max={100}
            step={1}
            value={mixPct}
            onChange={(e) => setMixPct(Number(e.target.value))}
            className="w-full"
          />
        </label>

        <label className="block">
          <div className="mb-1 text-xs font-medium text-ev-elephant">
            Output gain: <span className="tabular-nums">{outputGainDb} dB</span>
          </div>
          <input
            type="range"
            min={-12}
            max={12}
            step={1}
            value={outputGainDb}
            onChange={(e) => setOutputGainDb(Number(e.target.value))}
            className="w-full"
          />
        </label>
      </div>

      <div className="mt-4">
        <div className="mb-1 text-xs text-ev-warm-gray">
          Live level
        </div>
        <div className="h-2 rounded-full bg-ev-sand/40">
          <div
            className="h-full rounded-full bg-gradient-to-r from-success to-accent-savanna transition-[width] duration-100"
            style={{ width: `${Math.round(level * 100)}%` }}
          />
        </div>
      </div>

      {filteredUrl && (
        <div className="mt-4 rounded-xl border border-success/20 bg-success/5 p-3">
          <p className="text-xs text-success">
            Filtered render is ready.
          </p>
          <div className="mt-2 flex flex-wrap items-center gap-2">
            <a
              href={filteredUrl}
              download={`${fileName.replace(/\.[^/.]+$/, "") || "filtered"}-filtered.webm`}
              className="inline-flex items-center rounded-lg bg-success px-3 py-1.5 text-xs font-semibold text-white"
            >
              Download filtered audio
            </a>
            <audio src={filteredUrl} controls className="h-8" />
          </div>
        </div>
      )}

      {error && (
        <p className="mt-3 text-xs text-danger">{error}</p>
      )}
    </section>
  );
}
