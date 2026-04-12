"use client";

import React, { useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";

interface ShortcutHelpProps {
  isOpen: boolean;
  onClose: () => void;
}

interface ShortcutEntry {
  key: string;
  description: string;
}

const SHORTCUTS: ShortcutEntry[] = [
  { key: "Space", description: "Play / pause audio" },
  { key: "→", description: "Next call" },
  { key: "←", description: "Previous call" },
  { key: "A", description: "Toggle A/B (original vs cleaned)" },
  { key: "1", description: "Reclassify → Rumble" },
  { key: "2", description: "Reclassify → Trumpet" },
  { key: "3", description: "Reclassify → Roar" },
  { key: "4", description: "Reclassify → Bark" },
  { key: "5", description: "Reclassify → Cry" },
  { key: "Esc", description: "Deselect current call" },
  { key: "?", description: "Toggle shortcuts overlay" },
];

function KbdBadge({ children }: { children: React.ReactNode }) {
  return (
    <kbd className="inline-flex items-center justify-center min-w-[2rem] px-2 py-0.5 rounded-md border border-ev-sand bg-ev-ivory text-ev-charcoal font-mono text-xs font-semibold shadow-sm">
      {children}
    </kbd>
  );
}

export default function ShortcutHelp({ isOpen, onClose }: ShortcutHelpProps) {
  // Close on Escape
  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        onClose();
      }
    };
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [isOpen, onClose]);

  return (
    <AnimatePresence>
      {isOpen && (
        <>
          {/* Backdrop */}
          <motion.div
            data-testid="shortcut-help-backdrop"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.18 }}
            className="fixed inset-0 z-40 bg-ev-charcoal/40 backdrop-blur-sm"
            onClick={onClose}
            aria-hidden="true"
          />

          {/* Panel */}
          <motion.div
            data-testid="shortcut-help-panel"
            role="dialog"
            aria-modal="true"
            aria-label="Keyboard shortcuts"
            initial={{ opacity: 0, scale: 0.96, y: 8 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.96, y: 8 }}
            transition={{ duration: 0.2, ease: "easeOut" }}
            className="fixed inset-0 z-50 flex items-center justify-center p-4 pointer-events-none"
            onClick={(e) => e.stopPropagation()}
          >
            <div
              className="pointer-events-auto w-full max-w-md rounded-2xl border border-ev-sand/40 bg-ev-ivory shadow-xl overflow-hidden"
              onClick={(e) => e.stopPropagation()}
            >
              {/* Header */}
              <div className="flex items-center justify-between px-5 py-4 border-b border-ev-sand/30 bg-gradient-to-r from-accent-savanna/8 to-transparent">
                <div>
                  <h2 className="text-sm font-semibold text-ev-charcoal">
                    Keyboard Shortcuts
                  </h2>
                  <p className="text-xs text-ev-warm-gray mt-0.5">
                    Power-user navigation for the results page
                  </p>
                </div>
                <button
                  onClick={onClose}
                  aria-label="Close shortcuts overlay"
                  className="w-7 h-7 rounded-lg flex items-center justify-center text-ev-warm-gray hover:text-ev-charcoal hover:bg-ev-sand/40 transition-colors"
                >
                  <svg
                    width="14"
                    height="14"
                    viewBox="0 0 14 14"
                    fill="none"
                    aria-hidden="true"
                  >
                    <path
                      d="M1 1L13 13M13 1L1 13"
                      stroke="currentColor"
                      strokeWidth="1.5"
                      strokeLinecap="round"
                    />
                  </svg>
                </button>
              </div>

              {/* Shortcut list */}
              <div className="px-5 py-4 space-y-1">
                {SHORTCUTS.map(({ key, description }) => (
                  <div
                    key={key}
                    className="flex items-center justify-between gap-4 py-1.5"
                  >
                    <span className="text-sm text-ev-elephant">
                      {description}
                    </span>
                    <KbdBadge>{key}</KbdBadge>
                  </div>
                ))}
              </div>

              {/* Footer hint */}
              <div className="px-5 py-3 border-t border-ev-sand/30 bg-ev-cream/50">
                <p className="text-xs text-ev-warm-gray text-center">
                  Shortcuts are disabled when typing in input fields
                </p>
              </div>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}
