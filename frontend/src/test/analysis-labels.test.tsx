import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";

// Mock next/navigation
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn() }),
  useParams: () => ({ jobId: "rec-001" }),
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

import type { Recording } from "@/lib/audio-api";

// ── Helper: build a mock recording ──

function makeRecording(overrides: Partial<Recording> = {}): Recording {
  return {
    id: "rec-001",
    filename: "test-field.wav",
    status: "complete",
    duration_s: 120,
    duration: 120,
    filesize_mb: 24.5,
    file_size: 24.5,
    uploaded_at: "2026-04-10T08:00:00Z",
    created_at: "2026-04-10T08:00:00Z",
    sample_rate: 44100,
    ...overrides,
  };
}

// ── AnalysisLabels component (extracted for testability) ──
// We import the components used in both the upload list and the detail sidebar.
// Since they're inline in the pages, we test via the shared AnalysisLabels component
// that we'll create.

import { AnalysisLabels, AnalysisWindow } from "@/components/research/AnalysisLabels";

describe("AnalysisLabels", () => {
  it("renders animal_id when present", () => {
    render(<AnalysisLabels recording={makeRecording({ animal_id: "EL-042" })} />);
    expect(screen.getByText("EL-042")).toBeInTheDocument();
    expect(screen.getByText("Animal")).toBeInTheDocument();
  });

  it("renders noise_type_ref when present", () => {
    render(
      <AnalysisLabels recording={makeRecording({ noise_type_ref: "vehicle" })} />
    );
    expect(screen.getByText("vehicle")).toBeInTheDocument();
    expect(screen.getByText("Noise Ref")).toBeInTheDocument();
  });

  it("renders call_id when present", () => {
    render(<AnalysisLabels recording={makeRecording({ call_id: "CALL-789" })} />);
    expect(screen.getByText("CALL-789")).toBeInTheDocument();
    expect(screen.getByText("Call ID")).toBeInTheDocument();
  });

  it("renders all labels together", () => {
    render(
      <AnalysisLabels
        recording={makeRecording({
          animal_id: "EL-042",
          noise_type_ref: "airplane",
          call_id: "C-100",
        })}
      />
    );
    expect(screen.getByText("EL-042")).toBeInTheDocument();
    expect(screen.getByText("airplane")).toBeInTheDocument();
    expect(screen.getByText("C-100")).toBeInTheDocument();
  });

  it("renders nothing when no analysis fields are present", () => {
    const { container } = render(<AnalysisLabels recording={makeRecording()} />);
    expect(container.innerHTML).toBe("");
  });

  it("renders nothing for empty-string fields", () => {
    const { container } = render(
      <AnalysisLabels
        recording={makeRecording({
          animal_id: "",
          noise_type_ref: "",
          call_id: "",
        })}
      />
    );
    expect(container.innerHTML).toBe("");
  });
});

describe("AnalysisWindow", () => {
  it("renders time window when both start_sec and end_sec are present", () => {
    render(
      <AnalysisWindow recording={makeRecording({ start_sec: 10.5, end_sec: 45.2 })} />
    );
    expect(screen.getByText("Analysis Window")).toBeInTheDocument();
    expect(screen.getByText("10.5s")).toBeInTheDocument();
    expect(screen.getByText("45.2s")).toBeInTheDocument();
    // Duration should be displayed
    expect(screen.getByText("34.7s")).toBeInTheDocument();
  });

  it("renders nothing when start_sec and end_sec are absent", () => {
    const { container } = render(<AnalysisWindow recording={makeRecording()} />);
    expect(container.innerHTML).toBe("");
  });

  it("renders nothing when only start_sec is present", () => {
    const { container } = render(
      <AnalysisWindow recording={makeRecording({ start_sec: 10 })} />
    );
    expect(container.innerHTML).toBe("");
  });

  it("handles zero values correctly", () => {
    render(
      <AnalysisWindow recording={makeRecording({ start_sec: 0, end_sec: 30 })} />
    );
    expect(screen.getByText("0.0s")).toBeInTheDocument();
    // "30.0s" appears twice: once for End and once for Duration
    const thirtyEls = screen.getAllByText("30.0s");
    expect(thirtyEls).toHaveLength(2);
  });
});

// ── AnalysisLabelsBadge (compact badge variant for list rows) ──

import { AnalysisLabelsBadge } from "@/components/research/AnalysisLabels";

describe("AnalysisLabelsBadge", () => {
  it("renders compact badges for animal_id and noise_type_ref", () => {
    render(
      <AnalysisLabelsBadge
        recording={makeRecording({
          animal_id: "EL-007",
          noise_type_ref: "generator",
        })}
      />
    );
    expect(screen.getByText("EL-007")).toBeInTheDocument();
    expect(screen.getByText("generator")).toBeInTheDocument();
  });

  it("renders nothing when no analysis fields are present", () => {
    const { container } = render(
      <AnalysisLabelsBadge recording={makeRecording()} />
    );
    expect(container.innerHTML).toBe("");
  });
});
