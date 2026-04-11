import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { useLocalStorage } from "@/hooks/useLocalStorage";

describe("useLocalStorage", () => {
  beforeEach(() => {
    localStorage.clear();
    vi.restoreAllMocks();
  });

  it("returns initial value when localStorage is empty", () => {
    const { result } = renderHook(() => useLocalStorage("test-key", "default"));
    expect(result.current[0]).toBe("default");
  });

  it("returns stored value when localStorage has data", () => {
    localStorage.setItem("volume", JSON.stringify(0.8));
    const { result } = renderHook(() => useLocalStorage("volume", 0.5));
    expect(result.current[0]).toBe(0.8);
  });

  it("persists value to localStorage on set", () => {
    const { result } = renderHook(() => useLocalStorage("speed", 1));

    act(() => {
      result.current[1](2);
    });

    expect(result.current[0]).toBe(2);
    expect(JSON.parse(localStorage.getItem("speed")!)).toBe(2);
  });

  it("works with object values", () => {
    const initial = { sidebar: true, volume: 0.5 };
    const { result } = renderHook(() => useLocalStorage("prefs", initial));

    expect(result.current[0]).toEqual(initial);

    const updated = { sidebar: false, volume: 0.8 };
    act(() => {
      result.current[1](updated);
    });

    expect(result.current[0]).toEqual(updated);
    expect(JSON.parse(localStorage.getItem("prefs")!)).toEqual(updated);
  });

  it("works with boolean values", () => {
    const { result } = renderHook(() => useLocalStorage("collapsed", false));

    act(() => {
      result.current[1](true);
    });

    expect(result.current[0]).toBe(true);
    expect(JSON.parse(localStorage.getItem("collapsed")!)).toBe(true);
  });

  it("handles corrupted localStorage data gracefully", () => {
    localStorage.setItem("broken", "not-valid-json{{{");
    const consoleSpy = vi.spyOn(console, "warn").mockImplementation(() => {});

    const { result } = renderHook(() => useLocalStorage("broken", "fallback"));
    expect(result.current[0]).toBe("fallback");

    consoleSpy.mockRestore();
  });

  it("uses different keys independently", () => {
    const { result: hook1 } = renderHook(() => useLocalStorage("key-a", 1));
    const { result: hook2 } = renderHook(() => useLocalStorage("key-b", 2));

    act(() => {
      hook1.current[1](10);
    });

    expect(hook1.current[0]).toBe(10);
    expect(hook2.current[0]).toBe(2);
  });

  it("returns stable setter function reference", () => {
    const { result, rerender } = renderHook(() => useLocalStorage("stable", 0));
    const firstSetter = result.current[1];

    rerender();

    expect(result.current[1]).toBe(firstSetter);
  });
});
