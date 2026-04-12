import { useEffect } from "react";

type KeyMap = Record<string, (e: KeyboardEvent) => void>;

const INPUT_TAGS = new Set(["INPUT", "TEXTAREA", "SELECT"]);

/**
 * Registers keyboard shortcuts on the document.
 *
 * @param keyMap  Map of key string → handler. Keys match KeyboardEvent.key.
 * @param enabled When false, no handlers fire (e.g. when a modal is open).
 */
export function useKeyboardShortcuts(keyMap: KeyMap, enabled: boolean): void {
  useEffect(() => {
    if (!enabled) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      // Do not fire when the user is typing inside form controls
      const target = e.target as HTMLElement | null;
      if (target && INPUT_TAGS.has(target.tagName)) return;
      if (target && (target as HTMLElement).isContentEditable) return;

      const handler = keyMap[e.key];
      if (handler) {
        handler(e);
      }
    };

    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("keydown", handleKeyDown);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabled, keyMap]);
}
