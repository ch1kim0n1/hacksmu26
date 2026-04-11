"use client";

import React, { useRef, useEffect, useCallback, useState } from "react";
import { cn } from "@/lib/utils";

interface SpectrumAnalyzerProps {
  audioElement?: HTMLAudioElement | null;
  maxFrequency?: number;
  barCount?: number;
  className?: string;
  elephantRange?: [number, number];
}

export default function SpectrumAnalyzer({
  audioElement,
  maxFrequency = 1000,
  barCount = 64,
  className,
  elephantRange = [8, 200],
}: SpectrumAnalyzerProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const animationRef = useRef<number>(0);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const sourceRef = useRef<MediaElementAudioSourceNode | null>(null);
  const contextRef = useRef<AudioContext | null>(null);
  const [isActive, setIsActive] = useState(false);

  const getBarColor = useCallback(
    (frequency: number, magnitude: number): string => {
      const inElephantRange =
        frequency >= elephantRange[0] && frequency <= elephantRange[1];

      if (inElephantRange && magnitude > 0.3) {
        // Elephant frequency range — highlight with teal/cyan
        if (magnitude > 0.7) return "#C4A46C"; // accent-savanna
        if (magnitude > 0.5) return "#00B8D9";
        return "#0097B2";
      }

      // Normal frequency coloring based on spectrogram palette
      if (magnitude > 0.8) return "#EF4444"; // spectrogram-peak
      if (magnitude > 0.6) return "#FFD700"; // spectrogram-high
      if (magnitude > 0.3) return "#C4A46C"; // spectrogram-mid
      return "#1E2A32"; // background-elevated (dim)
    },
    [elephantRange]
  );

  const draw = useCallback(() => {
    const canvas = canvasRef.current;
    const analyser = analyserRef.current;
    if (!canvas || !analyser) return;

    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const dataArray = new Uint8Array(analyser.frequencyBinCount);
    analyser.getByteFrequencyData(dataArray);

    const width = canvas.width;
    const height = canvas.height;
    const sampleRate = contextRef.current?.sampleRate ?? 44100;
    const nyquist = sampleRate / 2;
    const binsForRange = Math.floor(
      (maxFrequency / nyquist) * dataArray.length
    );

    // Clear
    ctx.fillStyle = "#F8F5F0"; // ev-ivory
    ctx.fillRect(0, 0, width, height);

    const barWidth = width / barCount;
    const binsPerBar = Math.max(1, Math.floor(binsForRange / barCount));

    for (let i = 0; i < barCount; i++) {
      // Average bins for this bar
      let sum = 0;
      const startBin = i * binsPerBar;
      for (let j = 0; j < binsPerBar; j++) {
        const idx = startBin + j;
        sum += idx < dataArray.length ? dataArray[idx] : 0;
      }
      const magnitude = sum / binsPerBar / 255;

      const barHeight = magnitude * height;
      const x = i * barWidth;
      const frequency = (startBin / dataArray.length) * nyquist;

      ctx.fillStyle = getBarColor(frequency, magnitude);
      ctx.fillRect(x, height - barHeight, barWidth - 1, barHeight);
    }

    // Draw elephant range indicator line
    const elephantStartX =
      (elephantRange[0] / maxFrequency) * width;
    const elephantEndX =
      Math.min(elephantRange[1] / maxFrequency, 1) * width;

    ctx.strokeStyle = "rgba(0, 217, 255, 0.3)";
    ctx.lineWidth = 1;
    ctx.setLineDash([4, 4]);
    ctx.beginPath();
    ctx.moveTo(elephantStartX, 0);
    ctx.lineTo(elephantStartX, height);
    ctx.moveTo(elephantEndX, 0);
    ctx.lineTo(elephantEndX, height);
    ctx.stroke();
    ctx.setLineDash([]);

    animationRef.current = requestAnimationFrame(draw);
  }, [barCount, maxFrequency, elephantRange, getBarColor]);

  useEffect(() => {
    if (!audioElement) {
      setIsActive(false);
      return;
    }

    try {
      if (!contextRef.current) {
        contextRef.current = new AudioContext();
      }
      const audioCtx = contextRef.current;

      if (!sourceRef.current) {
        sourceRef.current = audioCtx.createMediaElementSource(audioElement);
      }

      const analyser = audioCtx.createAnalyser();
      analyser.fftSize = 2048;
      analyser.smoothingTimeConstant = 0.8;

      sourceRef.current.connect(analyser);
      analyser.connect(audioCtx.destination);
      analyserRef.current = analyser;

      setIsActive(true);
      animationRef.current = requestAnimationFrame(draw);
    } catch (err: unknown) {
      // Audio context may already be connected — ignore
      void err;
      setIsActive(false);
    }

    return () => {
      cancelAnimationFrame(animationRef.current);
    };
  }, [audioElement, draw]);

  // Handle canvas resize
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const resizeObserver = new ResizeObserver(() => {
      const rect = canvas.getBoundingClientRect();
      canvas.width = rect.width * window.devicePixelRatio;
      canvas.height = rect.height * window.devicePixelRatio;
      const ctx = canvas.getContext("2d");
      if (ctx) {
        ctx.scale(window.devicePixelRatio, window.devicePixelRatio);
      }
    });

    resizeObserver.observe(canvas);
    return () => resizeObserver.disconnect();
  }, []);

  return (
    <div
      className={cn(
        "rounded-xl border border-ev-sand bg-ev-cream overflow-hidden",
        className
      )}
    >
      <div className="flex items-center justify-between px-4 py-2 border-b border-ev-sand">
        <h3 className="text-sm font-semibold text-ev-charcoal">
          Frequency Spectrum
        </h3>
        <div className="flex items-center gap-2">
          <div
            className={cn(
              "h-2 w-2 rounded-full",
              isActive ? "bg-success animate-pulse" : "bg-ev-warm-gray"
            )}
          />
          <span className="text-xs text-ev-warm-gray">
            {isActive ? "Live" : "Idle"}
          </span>
        </div>
      </div>

      <div className="relative">
        <canvas
          ref={canvasRef}
          className="w-full h-32"
          style={{ imageRendering: "pixelated" }}
        />

        {/* Frequency labels */}
        <div className="flex justify-between px-2 py-1 border-t border-ev-sand">
          {[0, 250, 500, 750, 1000].map((freq) => (
            <span key={freq} className="text-[10px] font-mono text-ev-warm-gray">
              {freq} Hz
            </span>
          ))}
        </div>
      </div>

      {/* Elephant range legend */}
      <div className="flex items-center gap-2 px-4 py-1.5 border-t border-ev-sand">
        <div className="h-2 w-4 rounded-sm bg-accent-savanna/50" />
        <span className="text-[10px] text-ev-warm-gray">
          Elephant call range ({elephantRange[0]}-{elephantRange[1]} Hz)
        </span>
      </div>
    </div>
  );
}
