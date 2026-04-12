import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { fireEvent } from "@testing-library/react";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn() }),
}));

import { useKeyboardShortcuts } from "@/hooks/useKeyboardShortcuts";

function fireKeydown(key: string, target?: Element) {
  const event = new KeyboardEvent("keydown", { key, bubbles: true });
  (target ?? document).dispatchEvent(event);
}

describe("useKeyboardShortcuts", () => {
  let handler: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    handler = vi.fn();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("fires handler when registered key is pressed", () => {
    renderHook(() => useKeyboardShortcuts({ " ": handler }, true));
    act(() => {
      fireKeydown(" ");
    });
    expect(handler).toHaveBeenCalledTimes(1);
  });

  it("fires handler for arrow keys", () => {
    const nextHandler = vi.fn();
    const prevHandler = vi.fn();
    renderHook(() =>
      useKeyboardShortcuts(
        { ArrowRight: nextHandler, ArrowLeft: prevHandler },
        true
      )
    );
    act(() => {
      fireKeydown("ArrowRight");
      fireKeydown("ArrowLeft");
    });
    expect(nextHandler).toHaveBeenCalledTimes(1);
    expect(prevHandler).toHaveBeenCalledTimes(1);
  });

  it("does NOT fire when enabled=false", () => {
    renderHook(() => useKeyboardShortcuts({ " ": handler }, false));
    act(() => {
      fireKeydown(" ");
    });
    expect(handler).not.toHaveBeenCalled();
  });

  it("does NOT fire when an input element is focused", () => {
    renderHook(() => useKeyboardShortcuts({ " ": handler }, true));

    // Attach an input to the document so it can receive focus
    const input = document.createElement("input");
    document.body.appendChild(input);
    input.focus();

    act(() => {
      const event = new KeyboardEvent("keydown", { key: " ", bubbles: true });
      input.dispatchEvent(event);
    });

    expect(handler).not.toHaveBeenCalled();
    document.body.removeChild(input);
  });

  it("does NOT fire when a textarea element is focused", () => {
    renderHook(() => useKeyboardShortcuts({ " ": handler }, true));

    const textarea = document.createElement("textarea");
    document.body.appendChild(textarea);
    textarea.focus();

    act(() => {
      const event = new KeyboardEvent("keydown", { key: " ", bubbles: true });
      textarea.dispatchEvent(event);
    });

    expect(handler).not.toHaveBeenCalled();
    document.body.removeChild(textarea);
  });

  it("does NOT fire when a select element is focused", () => {
    renderHook(() => useKeyboardShortcuts({ " ": handler }, true));

    const select = document.createElement("select");
    document.body.appendChild(select);
    select.focus();

    act(() => {
      const event = new KeyboardEvent("keydown", { key: " ", bubbles: true });
      select.dispatchEvent(event);
    });

    expect(handler).not.toHaveBeenCalled();
    document.body.removeChild(select);
  });

  it("cleans up listener on unmount", () => {
    const { unmount } = renderHook(() =>
      useKeyboardShortcuts({ " ": handler }, true)
    );
    unmount();
    act(() => {
      fireKeydown(" ");
    });
    expect(handler).not.toHaveBeenCalled();
  });

  it("fires the correct handler for multiple registered keys", () => {
    const aHandler = vi.fn();
    const bHandler = vi.fn();
    renderHook(() =>
      useKeyboardShortcuts({ a: aHandler, b: bHandler }, true)
    );
    act(() => {
      fireKeydown("a");
    });
    expect(aHandler).toHaveBeenCalledTimes(1);
    expect(bHandler).not.toHaveBeenCalled();
  });

  it("does not fire for unregistered keys", () => {
    renderHook(() => useKeyboardShortcuts({ " ": handler }, true));
    act(() => {
      fireKeydown("x");
    });
    expect(handler).not.toHaveBeenCalled();
  });
});
