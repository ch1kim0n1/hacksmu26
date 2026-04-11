import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { renderHook, act } from "@testing-library/react";
import useWebSocket from "@/hooks/useWebSocket";

// Mock WebSocket
class MockWebSocket {
  static CONNECTING = 0;
  static OPEN = 1;
  static CLOSING = 2;
  static CLOSED = 3;
  static instances: MockWebSocket[] = [];
  url: string;
  onopen: ((ev: Event) => void) | null = null;
  onclose: ((ev: CloseEvent) => void) | null = null;
  onmessage: ((ev: MessageEvent) => void) | null = null;
  onerror: ((ev: Event) => void) | null = null;
  readyState = 0; // CONNECTING
  close = vi.fn();
  send = vi.fn();

  constructor(url: string) {
    this.url = url;
    MockWebSocket.instances.push(this);
  }

  simulateOpen() {
    this.readyState = 1; // OPEN
    this.onopen?.(new Event("open"));
  }

  simulateMessage(data: Record<string, unknown>) {
    this.onmessage?.(new MessageEvent("message", { data: JSON.stringify(data) }));
  }

  simulateClose() {
    this.readyState = 3; // CLOSED
    this.onclose?.({} as CloseEvent);
  }

  simulateError() {
    this.onerror?.(new Event("error"));
  }

  static reset() {
    MockWebSocket.instances = [];
  }
}

describe("useWebSocket", () => {
  beforeEach(() => {
    MockWebSocket.reset();
    vi.stubGlobal("WebSocket", MockWebSocket);
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it("returns initial disconnected state", () => {
    const { result } = renderHook(() => useWebSocket(null));
    expect(result.current.isConnected).toBe(false);
    expect(result.current.lastMessage).toBeNull();
  });

  it("connects when URL is provided", () => {
    renderHook(() => useWebSocket("ws://localhost:8000/ws/test"));
    expect(MockWebSocket.instances.length).toBe(1);
    expect(MockWebSocket.instances[0].url).toBe("ws://localhost:8000/ws/test");
  });

  it("does not connect when URL is null", () => {
    renderHook(() => useWebSocket(null));
    expect(MockWebSocket.instances.length).toBe(0);
  });

  it("sets isConnected to true on open", () => {
    const { result } = renderHook(() => useWebSocket("ws://localhost:8000/ws/test"));

    act(() => {
      MockWebSocket.instances[0].simulateOpen();
    });

    expect(result.current.isConnected).toBe(true);
  });

  it("parses JSON messages and updates lastMessage", () => {
    const { result } = renderHook(() => useWebSocket("ws://localhost:8000/ws/test"));

    act(() => {
      MockWebSocket.instances[0].simulateOpen();
      MockWebSocket.instances[0].simulateMessage({
        type: "STAGE_UPDATE",
        recording_id: "abc",
        data: { stage: "ingestion" },
        timestamp: "2026-04-11T12:00:00Z",
      });
    });

    expect(result.current.lastMessage).toEqual({
      type: "STAGE_UPDATE",
      recording_id: "abc",
      data: { stage: "ingestion" },
      timestamp: "2026-04-11T12:00:00Z",
    });
  });

  it("send() calls ws.send with JSON data", () => {
    const { result } = renderHook(() => useWebSocket("ws://localhost:8000/ws/test"));
    const ws = MockWebSocket.instances[0];

    act(() => {
      ws.simulateOpen();
      ws.readyState = 1; // WebSocket.OPEN
    });

    act(() => {
      result.current.send({ action: "subscribe" });
    });

    expect(ws.send).toHaveBeenCalledWith(JSON.stringify({ action: "subscribe" }));
  });

  it("cleans up WebSocket on unmount", () => {
    const { unmount } = renderHook(() => useWebSocket("ws://localhost:8000/ws/test"));
    const ws = MockWebSocket.instances[0];

    unmount();

    expect(ws.close).toHaveBeenCalled();
  });

  it("reconnects on close with exponential backoff", () => {
    renderHook(() => useWebSocket("ws://localhost:8000/ws/test"));

    expect(MockWebSocket.instances.length).toBe(1);

    // Simulate connection close
    act(() => {
      MockWebSocket.instances[0].simulateClose();
    });

    // First reconnect after 1s backoff
    act(() => {
      vi.advanceTimersByTime(1000);
    });

    expect(MockWebSocket.instances.length).toBe(2);
  });

  it("sets isConnected to false on close", () => {
    const { result } = renderHook(() => useWebSocket("ws://localhost:8000/ws/test"));

    act(() => {
      MockWebSocket.instances[0].simulateOpen();
    });
    expect(result.current.isConnected).toBe(true);

    act(() => {
      MockWebSocket.instances[0].simulateClose();
    });
    expect(result.current.isConnected).toBe(false);
  });
});
