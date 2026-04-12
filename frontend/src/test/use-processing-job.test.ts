import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { renderHook } from "@testing-library/react";

// Mock useWebSocket — we test useProcessingJob's state machine, not the socket itself
const mockUseWebSocket = vi.fn();
vi.mock("@/hooks/useWebSocket", () => ({
  default: (...args: unknown[]) => mockUseWebSocket(...args),
}));

import useProcessingJob from "@/hooks/useProcessingJob";
import type { WSMessage } from "@/hooks/useWebSocket";

function makeMessage(type: string, data: Record<string, unknown> = {}): WSMessage {
  return { type, recording_id: "rec-1", data, timestamp: new Date().toISOString() };
}

describe("useProcessingJob", () => {
  beforeEach(() => {
    mockUseWebSocket.mockReturnValue({
      lastMessage: null,
      isConnected: false,
      send: vi.fn(),
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("returns idle state when recordingId is null", () => {
    const { result } = renderHook(() => useProcessingJob(null));
    expect(result.current.status).toBe("idle");
    expect(result.current.progress).toBe(0);
    expect(result.current.stages.length).toBeGreaterThan(0);
    expect(result.current.quality).toBeNull();
    expect(result.current.error).toBeNull();
  });

  it("builds WS URL from recording ID", () => {
    renderHook(() => useProcessingJob("rec-1"));
    const calls = mockUseWebSocket.mock.calls;
    const lastUrl = calls[calls.length - 1][0] as string;
    expect(lastUrl).toContain("ws");
    expect(lastUrl).toContain("rec-1");
  });

  it("passes null URL when recordingId is null", () => {
    renderHook(() => useProcessingJob(null));
    expect(mockUseWebSocket).toHaveBeenCalledWith(null);
  });

  it("initializes with all stages pending", () => {
    const { result } = renderHook(() => useProcessingJob("rec-1"));
    result.current.stages.forEach((stage) => {
      expect(stage.status).toBe("pending");
    });
  });

  it("transitions to processing on PROCESSING_STARTED", () => {
    const { result, rerender } = renderHook(() => useProcessingJob("rec-1"));

    mockUseWebSocket.mockReturnValue({
      lastMessage: makeMessage("PROCESSING_STARTED"),
      isConnected: true,
      send: vi.fn(),
    });
    rerender();

    expect(result.current.status).toBe("processing");
  });

  it("updates stage on STAGE_UPDATE", () => {
    const { result, rerender } = renderHook(() => useProcessingJob("rec-1"));

    mockUseWebSocket.mockReturnValue({
      lastMessage: makeMessage("STAGE_UPDATE", {
        stage: "spectrogram",
        status: "active",
        progress: 30,
      }),
      isConnected: true,
      send: vi.fn(),
    });
    rerender();

    expect(result.current.currentStage).toBe("spectrogram");
    expect(result.current.progress).toBe(30);

    const spectrogramStage = result.current.stages.find((s) => s.name === "spectrogram");
    expect(spectrogramStage?.status).toBe("active");
  });

  it("marks earlier stages as complete on STAGE_UPDATE", () => {
    const { result, rerender } = renderHook(() => useProcessingJob("rec-1"));

    mockUseWebSocket.mockReturnValue({
      lastMessage: makeMessage("STAGE_UPDATE", {
        stage: "noise_removal",
        status: "active",
        progress: 60,
      }),
      isConnected: true,
      send: vi.fn(),
    });
    rerender();

    const ingestion = result.current.stages.find((s) => s.name === "ingestion");
    const spectrogram = result.current.stages.find((s) => s.name === "spectrogram");
    expect(ingestion?.status).toBe("complete");
    expect(spectrogram?.status).toBe("complete");
  });

  it("normalizes backend sub-stage events to canonical stages", () => {
    const { result, rerender } = renderHook(() => useProcessingJob("rec-1"));

    mockUseWebSocket.mockReturnValue({
      lastMessage: makeMessage("STAGE_UPDATE", {
        stage: "denoising:started",
        status: "active",
        progress: 50,
      }),
      isConnected: true,
      send: vi.fn(),
    });
    rerender();

    expect(result.current.currentStage).toBe("noise_removal");
    expect(result.current.progress).toBe(50);
  });

  it("does not regress to an earlier canonical stage on repeated sub-steps", () => {
    const { result, rerender } = renderHook(() => useProcessingJob("rec-1"));

    mockUseWebSocket.mockReturnValue({
      lastMessage: makeMessage("STAGE_UPDATE", {
        stage: "noise_removal",
        status: "active",
        progress: 50,
      }),
      isConnected: true,
      send: vi.fn(),
    });
    rerender();

    mockUseWebSocket.mockReturnValue({
      lastMessage: makeMessage("STAGE_UPDATE", {
        stage: "spectrogram:after_complete",
        status: "complete",
        progress: 65,
      }),
      isConnected: true,
      send: vi.fn(),
    });
    rerender();

    expect(result.current.currentStage).toBe("noise_removal");
    expect(result.current.progress).toBe(65);
  });

  it("stores quality on QUALITY_SCORE", () => {
    const { result, rerender } = renderHook(() => useProcessingJob("rec-1"));

    mockUseWebSocket.mockReturnValue({
      lastMessage: makeMessage("QUALITY_SCORE", {
        snr_before: 3.2,
        snr_after: 18.5,
        improvement: 15.3,
        score: 0.87,
      }),
      isConnected: true,
      send: vi.fn(),
    });
    rerender();

    expect(result.current.quality).toEqual({
      snr_before: 3.2,
      snr_after: 18.5,
      improvement: 15.3,
      score: 0.87,
    });
  });

  it("transitions to complete on PROCESSING_COMPLETE", () => {
    const { result, rerender } = renderHook(() => useProcessingJob("rec-1"));

    mockUseWebSocket.mockReturnValue({
      lastMessage: makeMessage("PROCESSING_COMPLETE", {
        quality: {
          snr_before_db: 3,
          snr_after_db: 18,
          snr_improvement_db: 15,
          quality_score: 0.9,
        },
      }),
      isConnected: true,
      send: vi.fn(),
    });
    rerender();

    expect(result.current.status).toBe("complete");
    expect(result.current.progress).toBe(100);
    result.current.stages.forEach((stage) => {
      expect(stage.status).toBe("complete");
    });
  });

  it("transitions to error on PROCESSING_FAILED", () => {
    const { result, rerender } = renderHook(() => useProcessingJob("rec-1"));

    mockUseWebSocket.mockReturnValue({
      lastMessage: makeMessage("PROCESSING_FAILED", {
        error: "Out of memory",
      }),
      isConnected: true,
      send: vi.fn(),
    });
    rerender();

    expect(result.current.status).toBe("error");
    expect(result.current.error).toBe("Out of memory");
  });

  it("resets state when recordingId changes to null", () => {
    const { result, rerender } = renderHook(
      ({ id }: { id: string | null }) => useProcessingJob(id),
      { initialProps: { id: "rec-1" as string | null } }
    );

    // Simulate processing
    mockUseWebSocket.mockReturnValue({
      lastMessage: makeMessage("PROCESSING_STARTED"),
      isConnected: true,
      send: vi.fn(),
    });
    rerender({ id: "rec-1" });
    expect(result.current.status).toBe("processing");

    // Reset
    mockUseWebSocket.mockReturnValue({
      lastMessage: null,
      isConnected: false,
      send: vi.fn(),
    });
    rerender({ id: null });
    expect(result.current.status).toBe("idle");
    expect(result.current.progress).toBe(0);
  });
});
