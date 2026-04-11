"use client";

import React, { useState, useEffect } from "react";

interface ExportOptions {
  format: "csv" | "json" | "zip";
  includeAudio: boolean;
  includeSpectrograms: boolean;
}

interface ExportModalProps {
  isOpen: boolean;
  onClose: () => void;
  onExport: (options: ExportOptions) => void;
}

export default function ExportModal({
  isOpen,
  onClose,
  onExport,
}: ExportModalProps) {
  const [format, setFormat] = useState<ExportOptions["format"]>("csv");
  const [includeAudio, setIncludeAudio] = useState(false);
  const [includeSpectrograms, setIncludeSpectrograms] = useState(false);

  // Close on Escape key
  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isOpen, onClose]);

  // Prevent body scroll when open
  useEffect(() => {
    if (isOpen) {
      document.body.style.overflow = "hidden";
    } else {
      document.body.style.overflow = "";
    }
    return () => {
      document.body.style.overflow = "";
    };
  }, [isOpen]);

  if (!isOpen) return null;

  const handleExport = () => {
    onExport({ format, includeAudio, includeSpectrograms });
  };

  const formatOptions: { value: ExportOptions["format"]; label: string; description: string }[] = [
    { value: "csv", label: "CSV", description: "Spreadsheet-compatible data" },
    { value: "json", label: "JSON", description: "Structured data format" },
    { value: "zip", label: "ZIP Archive", description: "Bundled data with files" },
  ];

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center"
      role="dialog"
      aria-modal="true"
      aria-label="Export data"
    >
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/60 backdrop-blur-sm"
        onClick={onClose}
      />

      {/* Modal content */}
      <div className="relative w-full max-w-md mx-4 rounded-xl border border-echofield-border bg-echofield-surface shadow-2xl">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-echofield-border">
          <h2 className="text-lg font-semibold text-echofield-text-primary">
            Export Data
          </h2>
          <button
            onClick={onClose}
            className="w-8 h-8 rounded-lg flex items-center justify-center text-echofield-text-muted hover:text-echofield-text-primary hover:bg-echofield-surface-elevated transition-colors"
            aria-label="Close modal"
          >
            <svg
              width="16"
              height="16"
              viewBox="0 0 16 16"
              fill="none"
            >
              <path
                d="M4 4L12 12M12 4L4 12"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
              />
            </svg>
          </button>
        </div>

        {/* Body */}
        <div className="px-6 py-5 space-y-5">
          {/* Format selection */}
          <div className="space-y-2">
            <label className="text-xs uppercase tracking-wide text-echofield-text-muted font-medium">
              Export Format
            </label>
            <div className="space-y-2">
              {formatOptions.map((option) => (
                <label
                  key={option.value}
                  className={`flex items-center gap-3 p-3 rounded-lg border cursor-pointer transition-colors ${
                    format === option.value
                      ? "border-accent-teal bg-accent-teal/5"
                      : "border-echofield-border hover:border-echofield-text-muted"
                  }`}
                >
                  <input
                    type="radio"
                    name="export-format"
                    value={option.value}
                    checked={format === option.value}
                    onChange={() => setFormat(option.value)}
                    className="sr-only"
                  />
                  <div
                    className={`w-4 h-4 rounded-full border-2 flex items-center justify-center shrink-0 ${
                      format === option.value
                        ? "border-accent-teal"
                        : "border-echofield-border"
                    }`}
                  >
                    {format === option.value && (
                      <div className="w-2 h-2 rounded-full bg-accent-teal" />
                    )}
                  </div>
                  <div>
                    <span className="text-sm font-medium text-echofield-text-primary">
                      {option.label}
                    </span>
                    <span className="text-xs text-echofield-text-muted ml-2">
                      {option.description}
                    </span>
                  </div>
                </label>
              ))}
            </div>
          </div>

          {/* Include options */}
          <div className="space-y-2">
            <label className="text-xs uppercase tracking-wide text-echofield-text-muted font-medium">
              Include Files
            </label>
            <div className="space-y-2">
              <label className="flex items-center gap-3 cursor-pointer">
                <div
                  className={`w-5 h-5 rounded border-2 flex items-center justify-center transition-colors ${
                    includeAudio
                      ? "border-accent-teal bg-accent-teal"
                      : "border-echofield-border"
                  }`}
                  onClick={() => setIncludeAudio(!includeAudio)}
                >
                  {includeAudio && (
                    <svg
                      width="12"
                      height="12"
                      viewBox="0 0 12 12"
                      fill="none"
                    >
                      <path
                        d="M2 6L5 9L10 3"
                        stroke="#0A1A1F"
                        strokeWidth="2"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      />
                    </svg>
                  )}
                </div>
                <span className="text-sm text-echofield-text-primary">
                  Audio recordings
                </span>
              </label>
              <label className="flex items-center gap-3 cursor-pointer">
                <div
                  className={`w-5 h-5 rounded border-2 flex items-center justify-center transition-colors ${
                    includeSpectrograms
                      ? "border-accent-teal bg-accent-teal"
                      : "border-echofield-border"
                  }`}
                  onClick={() => setIncludeSpectrograms(!includeSpectrograms)}
                >
                  {includeSpectrograms && (
                    <svg
                      width="12"
                      height="12"
                      viewBox="0 0 12 12"
                      fill="none"
                    >
                      <path
                        d="M2 6L5 9L10 3"
                        stroke="#0A1A1F"
                        strokeWidth="2"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      />
                    </svg>
                  )}
                </div>
                <span className="text-sm text-echofield-text-primary">
                  Spectrogram images
                </span>
              </label>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end gap-3 px-6 py-4 border-t border-echofield-border">
          <button
            onClick={onClose}
            className="px-4 py-2 rounded-lg text-sm font-medium text-echofield-text-secondary hover:text-echofield-text-primary border border-echofield-border hover:border-echofield-text-muted transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={handleExport}
            className="px-4 py-2 rounded-lg text-sm font-medium text-echofield-bg bg-accent-teal hover:bg-accent-teal/90 transition-colors"
          >
            Export
          </button>
        </div>
      </div>
    </div>
  );
}
