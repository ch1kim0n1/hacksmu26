import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, act } from "@testing-library/react";

// Mock next/navigation
vi.mock("next/navigation", () => ({
  useParams: () => ({ batchId: "batch-test-1" }),
}));

// Mock next/link
vi.mock("next/link", () => ({
  default: ({
    children,
    href,
    ...props
  }: {
    children: React.ReactNode;
    href: string;
    [key: string]: unknown;
  }) => (
    <a href={href} {...props}>
      {children}
    </a>
  ),
}));

// Track calls to getBatchSummary so we can assert polling behavior
const mockGetBatchSummary = vi.fn();
vi.mock("@/lib/audio-api", () => ({
  getBatchSummary: (...args: unknown[]) => mockGetBatchSummary(...args),
}));

import BatchPage from "@/app/batch/[batchId]/page";
import type { BatchSummary } from "@/lib/audio-api";

function makeSummary(overrides: Partial<BatchSummary> = {}): BatchSummary {
  return {
    batch_id: "batch-test-1",
    status: "processing",
    recordings: 3,
    total_calls_detected: 5,
    call_type_distribution: { rumble: 3, trumpet: 2 },
    quality_scores: { avg: 0.85 },
    avg_snr_improvement_db: 12.3,
    total_processing_time_s: 45,
    recordings_summary: [],
    shared_patterns: [],
    ...overrides,
  };
}

describe("BatchPage polling", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    mockGetBatchSummary.mockReset();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it("fetches summary immediately on mount", async () => {
    mockGetBatchSummary.mockResolvedValue(makeSummary({ status: "processing" }));

    await act(async () => {
      render(<BatchPage />);
    });

    expect(mockGetBatchSummary).toHaveBeenCalledWith("batch-test-1");
  });

  it("continues polling while status is processing", async () => {
    mockGetBatchSummary.mockResolvedValue(makeSummary({ status: "processing" }));

    await act(async () => {
      render(<BatchPage />);
    });

    const callsAfterMount = mockGetBatchSummary.mock.calls.length;

    // Advance 4 seconds — one interval tick
    await act(async () => {
      vi.advanceTimersByTime(4000);
    });

    expect(mockGetBatchSummary.mock.calls.length).toBeGreaterThan(callsAfterMount);

    // Advance another 4 seconds
    await act(async () => {
      vi.advanceTimersByTime(4000);
    });

    expect(mockGetBatchSummary.mock.calls.length).toBeGreaterThan(callsAfterMount + 1);
  });

  it("stops polling when status is complete", async () => {
    mockGetBatchSummary.mockResolvedValue(makeSummary({ status: "complete" }));

    await act(async () => {
      render(<BatchPage />);
    });

    const callsAfterMount = mockGetBatchSummary.mock.calls.length;

    // Advance several intervals — should NOT make additional calls
    await act(async () => {
      vi.advanceTimersByTime(12000);
    });

    expect(mockGetBatchSummary.mock.calls.length).toBe(callsAfterMount);
  });

  it("stops polling when status is failed", async () => {
    mockGetBatchSummary.mockResolvedValue(makeSummary({ status: "failed" }));

    await act(async () => {
      render(<BatchPage />);
    });

    const callsAfterMount = mockGetBatchSummary.mock.calls.length;

    // Advance several intervals — should NOT make additional calls
    await act(async () => {
      vi.advanceTimersByTime(12000);
    });

    expect(mockGetBatchSummary.mock.calls.length).toBe(callsAfterMount);
  });

  it("stops polling when status transitions from processing to complete", async () => {
    // First call: still processing
    mockGetBatchSummary.mockResolvedValueOnce(makeSummary({ status: "processing" }));

    await act(async () => {
      render(<BatchPage />);
    });

    // Second call after interval: now complete
    mockGetBatchSummary.mockResolvedValue(makeSummary({ status: "complete" }));

    await act(async () => {
      vi.advanceTimersByTime(4000);
    });

    const callsAfterComplete = mockGetBatchSummary.mock.calls.length;

    // Further intervals should not trigger more calls
    await act(async () => {
      vi.advanceTimersByTime(12000);
    });

    expect(mockGetBatchSummary.mock.calls.length).toBe(callsAfterComplete);
  });
});
