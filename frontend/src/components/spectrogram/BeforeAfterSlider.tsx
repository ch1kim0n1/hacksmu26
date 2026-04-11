"use client";

import React, { useState, useRef, useCallback, useEffect } from "react";

interface BeforeAfterSliderProps {
  beforeSrc: string;
  afterSrc: string;
  beforeLabel?: string;
  afterLabel?: string;
}

export default function BeforeAfterSlider({
  beforeSrc,
  afterSrc,
  beforeLabel = "Before",
  afterLabel = "After",
}: BeforeAfterSliderProps) {
  const [sliderPosition, setSliderPosition] = useState(50);
  const [isDragging, setIsDragging] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  const getPositionFromEvent = useCallback(
    (clientX: number) => {
      if (!containerRef.current) return sliderPosition;
      const rect = containerRef.current.getBoundingClientRect();
      const x = clientX - rect.left;
      const percentage = (x / rect.width) * 100;
      return Math.min(100, Math.max(0, percentage));
    },
    [sliderPosition]
  );

  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    setIsDragging(true);
  }, []);

  const handleTouchStart = useCallback((e: React.TouchEvent) => {
    setIsDragging(true);
  }, []);

  useEffect(() => {
    if (!isDragging) return;

    const handleMouseMove = (e: MouseEvent) => {
      setSliderPosition(getPositionFromEvent(e.clientX));
    };

    const handleTouchMove = (e: TouchEvent) => {
      if (e.touches.length > 0) {
        setSliderPosition(getPositionFromEvent(e.touches[0].clientX));
      }
    };

    const handleEnd = () => {
      setIsDragging(false);
    };

    window.addEventListener("mousemove", handleMouseMove);
    window.addEventListener("mouseup", handleEnd);
    window.addEventListener("touchmove", handleTouchMove);
    window.addEventListener("touchend", handleEnd);

    return () => {
      window.removeEventListener("mousemove", handleMouseMove);
      window.removeEventListener("mouseup", handleEnd);
      window.removeEventListener("touchmove", handleTouchMove);
      window.removeEventListener("touchend", handleEnd);
    };
  }, [isDragging, getPositionFromEvent]);

  const handleContainerClick = useCallback(
    (e: React.MouseEvent) => {
      if (!isDragging) {
        setSliderPosition(getPositionFromEvent(e.clientX));
      }
    },
    [isDragging, getPositionFromEvent]
  );

  return (
    <div
      ref={containerRef}
      className="relative rounded-lg border border-echofield-border bg-echofield-surface overflow-hidden select-none cursor-ew-resize shadow-lg shadow-accent-teal/5"
      onClick={handleContainerClick}
    >
      {/* Before image (full, underneath) */}
      <img
        src={beforeSrc}
        alt={beforeLabel}
        className="block w-full h-auto"
        draggable={false}
      />

      {/* After image (clipped overlay) */}
      <img
        src={afterSrc}
        alt={afterLabel}
        className="absolute inset-0 w-full h-full object-cover"
        style={{
          clipPath: `inset(0 0 0 ${sliderPosition}%)`,
        }}
        draggable={false}
      />

      {/* Slider divider line */}
      <div
        className="absolute top-0 bottom-0 w-0.5 bg-white z-10"
        style={{ left: `${sliderPosition}%`, transform: "translateX(-50%)" }}
        onMouseDown={handleMouseDown}
        onTouchStart={handleTouchStart}
      >
        {/* Drag handle */}
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-8 h-8 rounded-full bg-white/90 border-2 border-white flex items-center justify-center shadow-lg backdrop-blur-sm">
          <svg
            width="16"
            height="16"
            viewBox="0 0 16 16"
            fill="none"
            className="text-echofield-bg"
          >
            <path
              d="M4 8L6 6M4 8L6 10M4 8H12M12 8L10 6M12 8L10 10"
              stroke="currentColor"
              strokeWidth="1.5"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        </div>
      </div>

      {/* Before label */}
      <div className="absolute top-3 left-3 z-20">
        <span className="px-2 py-1 rounded bg-danger/80 text-white text-xs font-semibold uppercase tracking-wider backdrop-blur-sm">
          {beforeLabel}
        </span>
      </div>

      {/* After label */}
      <div className="absolute top-3 right-3 z-20">
        <span className="px-2 py-1 rounded bg-success/80 text-white text-xs font-semibold uppercase tracking-wider backdrop-blur-sm">
          {afterLabel}
        </span>
      </div>
    </div>
  );
}
