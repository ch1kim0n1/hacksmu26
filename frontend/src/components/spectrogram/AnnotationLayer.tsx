"use client";

import React, { useRef, useState, useCallback } from "react";
import type { Annotation, NewAnnotation } from "@/hooks/useAnnotations";

export interface AnnotationLayerProps {
  annotations: Annotation[];
  maxTime: number;
  maxFrequency: number;
  annotateMode: boolean;
  onAdd: (ann: Omit<NewAnnotation, "text" | "tag" | "color">) => void;
  selectedId?: string | null;
  onSelect?: (id: string) => void;
}

interface CursorPos {
  x: number;
  y: number;
  time_ms: number;
  frequency_hz: number;
}

interface DragState {
  startX: number;
  startY: number;
  currentX: number;
  currentY: number;
  moved: boolean;
}

export default function AnnotationLayer({
  annotations,
  maxTime,
  maxFrequency,
  annotateMode,
  onAdd,
  selectedId,
  onSelect,
}: AnnotationLayerProps) {
  const surfaceRef = useRef<HTMLDivElement>(null);
  const [cursor, setCursor] = useState<CursorPos | null>(null);
  const [drag, setDrag] = useState<DragState | null>(null);

  const getRelCoords = useCallback(
    (clientX: number, clientY: number) => {
      const rect = surfaceRef.current?.getBoundingClientRect();
      if (!rect || rect.width === 0 || rect.height === 0) return null;
      const relX = Math.max(0, Math.min(clientX - rect.left, rect.width));
      const relY = Math.max(0, Math.min(clientY - rect.top, rect.height));
      const time_ms = (relX / rect.width) * maxTime * 1000;
      // Top of image = maxFrequency, bottom = 0
      const frequency_hz = ((rect.height - relY) / rect.height) * maxFrequency;
      return { relX, relY, time_ms, frequency_hz };
    },
    [maxTime, maxFrequency]
  );

  const handleMouseMove = useCallback(
    (e: React.MouseEvent<HTMLDivElement>) => {
      const coords = getRelCoords(e.clientX, e.clientY);
      if (!coords) return;
      setCursor({ x: coords.relX, y: coords.relY, time_ms: coords.time_ms, frequency_hz: coords.frequency_hz });
      if (annotateMode && drag) {
        const dx = Math.abs(coords.relX - drag.startX);
        const dy = Math.abs(coords.relY - drag.startY);
        setDrag((prev) =>
          prev ? { ...prev, currentX: coords.relX, currentY: coords.relY, moved: dx > 6 || dy > 6 } : null
        );
      }
    },
    [getRelCoords, annotateMode, drag]
  );

  const handleMouseLeave = useCallback(() => {
    setCursor(null);
    setDrag(null);
  }, []);

  const handleMouseDown = useCallback(
    (e: React.MouseEvent<HTMLDivElement>) => {
      if (!annotateMode) return;
      const coords = getRelCoords(e.clientX, e.clientY);
      if (!coords) return;
      setDrag({ startX: coords.relX, startY: coords.relY, currentX: coords.relX, currentY: coords.relY, moved: false });
    },
    [annotateMode, getRelCoords]
  );

  const handleMouseUp = useCallback(
    (e: React.MouseEvent<HTMLDivElement>) => {
      if (!annotateMode || !drag) return;
      const coords = getRelCoords(e.clientX, e.clientY);
      setDrag(null);
      if (!coords) return;

      if (drag.moved) {
        // Region annotation
        const rect = surfaceRef.current?.getBoundingClientRect();
        if (!rect) return;
        const startTime = (drag.startX / rect.width) * maxTime * 1000;
        const startFreq = ((rect.height - drag.startY) / rect.height) * maxFrequency;
        const time_ms = Math.min(startTime, coords.time_ms);
        const end_time_ms = Math.max(startTime, coords.time_ms);
        const frequency_hz = Math.min(startFreq, coords.frequency_hz);
        const freq_max_hz = Math.max(startFreq, coords.frequency_hz);
        onAdd({ type: "region", time_ms, frequency_hz, end_time_ms, freq_max_hz });
      } else {
        // Point annotation
        onAdd({ type: "point", time_ms: coords.time_ms, frequency_hz: coords.frequency_hz });
      }
    },
    [annotateMode, drag, getRelCoords, maxTime, maxFrequency, onAdd]
  );

  const handleClick = useCallback(
    (e: React.MouseEvent<HTMLDivElement>) => {
      if (!annotateMode) return;
      // Handles simple clicks (e.g. fireEvent.click in tests where mousedown/mouseup may not both fire)
      const coords = getRelCoords(e.clientX, e.clientY);
      if (!coords) return;
      onAdd({ type: "point", time_ms: coords.time_ms, frequency_hz: coords.frequency_hz });
    },
    [annotateMode, getRelCoords, onAdd]
  );

  const pctX = (time_ms: number) => `${((time_ms / 1000) / maxTime) * 100}%`;
  const pctY = (frequency_hz: number) => `${(1 - frequency_hz / maxFrequency) * 100}%`;

  return (
    <div className="absolute inset-0" style={{ zIndex: 20 }}>
      {/* Annotation markers layer — always visible, pointer-events-none container */}
      <div className="absolute inset-0 pointer-events-none">
        {annotations.map((ann) => {
          const isSelected = ann.id === selectedId;
          if (ann.type === "point") {
            return (
              <button
                key={ann.id}
                type="button"
                aria-label={`Annotation: ${ann.text}`}
                title={ann.text}
                onClick={() => onSelect?.(ann.id)}
                className="absolute -translate-x-1/2 -translate-y-1/2 pointer-events-auto focus:outline-none group"
                style={{ left: pctX(ann.time_ms), top: pctY(ann.frequency_hz) }}
              >
                <span
                  className={`block w-3 h-3 rounded-full ring-2 ring-white/80 shadow-md transition-transform ${
                    isSelected ? "scale-150" : "scale-100 group-hover:scale-125"
                  }`}
                  style={{ backgroundColor: ann.color }}
                />
              </button>
            );
          }
          // Region annotation
          if (ann.end_time_ms == null || ann.freq_max_hz == null) return null;
          const left = pctX(Math.min(ann.time_ms, ann.end_time_ms));
          const rightPct = pctX(Math.max(ann.time_ms, ann.end_time_ms));
          const top = pctY(Math.max(ann.frequency_hz, ann.freq_max_hz));
          const bottomPct = pctY(Math.min(ann.frequency_hz, ann.freq_max_hz));
          return (
            <button
              key={ann.id}
              type="button"
              aria-label={`Region annotation: ${ann.text}`}
              title={ann.text}
              onClick={() => onSelect?.(ann.id)}
              className="absolute pointer-events-auto focus:outline-none"
              style={{
                left,
                top,
                right: `calc(100% - ${rightPct})`,
                bottom: `calc(100% - ${bottomPct})`,
                backgroundColor: `${ann.color}26`,
                border: `1.5px solid ${ann.color}`,
                borderRadius: "2px",
                boxShadow: isSelected ? `0 0 0 2px ${ann.color}` : undefined,
              }}
            />
          );
        })}
      </div>

      {/* Drag preview rectangle */}
      {annotateMode && drag?.moved && (() => {
        const x1 = Math.min(drag.startX, drag.currentX);
        const y1 = Math.min(drag.startY, drag.currentY);
        const w = Math.abs(drag.currentX - drag.startX);
        const h = Math.abs(drag.currentY - drag.startY);
        return (
          <div
            className="absolute pointer-events-none border border-accent-savanna bg-accent-savanna/10 rounded-sm"
            style={{ left: x1, top: y1, width: w, height: h }}
          />
        );
      })()}

      {/* Cursor tooltip */}
      {cursor && (
        <div
          role="tooltip"
          data-testid="cursor-tooltip"
          className="absolute pointer-events-none z-30"
          style={{
            left: cursor.x + 12,
            top: cursor.y - 32,
          }}
        >
          <span className="bg-ev-charcoal/90 text-ev-cream text-[10px] font-mono px-2 py-1 rounded-md shadow-lg whitespace-nowrap">
            Time: {(cursor.time_ms / 1000).toFixed(2)}s &nbsp; Freq: {Math.round(cursor.frequency_hz)} Hz
          </span>
        </div>
      )}

      {/* Interactive surface — pointer-events-none in view mode, active in annotate mode */}
      <div
        ref={surfaceRef}
        data-annotation-surface
        className={`absolute inset-0 ${annotateMode ? "cursor-crosshair" : "pointer-events-none"}`}
        onMouseMove={handleMouseMove}
        onMouseLeave={handleMouseLeave}
        onMouseDown={handleMouseDown}
        onMouseUp={handleMouseUp}
        onClick={handleClick}
      />
    </div>
  );
}
