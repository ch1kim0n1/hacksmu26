import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";

// ── Shared mocks ────────────────────────────────────────────────────────────

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

vi.mock("next/image", () => ({
  // eslint-disable-next-line jsx-a11y/alt-text, @next/next/no-img-element, @typescript-eslint/no-explicit-any
  default: (props: any) => <img src={props.src} alt={props.alt} />,
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn() }),
}));

vi.mock("framer-motion", () => ({
  motion: {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    div: ({ children, className }: any) => <div className={className}>{children}</div>,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    button: ({ children, className, onClick }: any) => (
      <button className={className} onClick={onClick}>
        {children}
      </button>
    ),
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    p: ({ children }: any) => <p>{children}</p>,
  },
  AnimatePresence: ({ children }: { children: React.ReactNode }) => (
    <>{children}</>
  ),
}));

vi.mock("@/components/ui/motion-primitives", () => ({
  staggerContainer: {},
  fadeUp: {},
}));

vi.mock("@/hooks/useKeyboardShortcuts", () => ({
  useKeyboardShortcuts: vi.fn(),
}));

vi.mock("@/components/layout/ShortcutHelp", () => ({
  default: () => null,
}));

// ── API mock (will be overridden per-test) ──────────────────────────────────

const mockGetRecordings = vi.fn();
const mockGetCalls = vi.fn();
const mockGetReferenceCalls = vi.fn();
const mockExportResearch = vi.fn();

vi.mock("@/lib/audio-api", () => ({
  getRecordings: (...args: unknown[]) => mockGetRecordings(...args),
  getCalls: (...args: unknown[]) => mockGetCalls(...args),
  getReferenceCalls: (...args: unknown[]) => mockGetReferenceCalls(...args),
  exportResearch: (...args: unknown[]) => mockExportResearch(...args),
  compareCrossSpecies: vi.fn(),
  API_BASE: "http://localhost:8000",
}));

// ── Imports (after mocks) ───────────────────────────────────────────────────

import ResultsPage from "@/app/results/page";
import ExportPage from "@/app/export/page";
import ComparePage from "@/app/compare/page";

// ═════════════════════════════════════════════════════════════════════════════
// Results page error handling
// ═════════════════════════════════════════════════════════════════════════════

describe("Results page — API error handling", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("displays an error banner when getRecordings rejects", async () => {
    mockGetRecordings.mockRejectedValueOnce(new Error("Network error"));

    render(<ResultsPage />);

    expect(
      await screen.findByText("Network error"),
    ).toBeInTheDocument();
  });

  it("displays a fallback message for non-Error rejections", async () => {
    mockGetRecordings.mockRejectedValueOnce("string throw");

    render(<ResultsPage />);

    expect(
      await screen.findByText("Failed to load results"),
    ).toBeInTheDocument();
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// Export page error handling
// ═════════════════════════════════════════════════════════════════════════════

describe("Export page — API error handling", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("displays an error banner when fetchRecordings rejects", async () => {
    mockGetRecordings.mockRejectedValueOnce(new Error("Server error"));

    render(<ExportPage />);

    expect(
      await screen.findByText("Server error"),
    ).toBeInTheDocument();
  });

  it("displays a fallback message for non-Error rejections in fetchRecordings", async () => {
    mockGetRecordings.mockRejectedValueOnce(42);

    render(<ExportPage />);

    expect(
      await screen.findByText("Failed to load recordings"),
    ).toBeInTheDocument();
  });

  it("displays an error banner when handleExport rejects", async () => {
    mockGetRecordings.mockResolvedValueOnce({
      recordings: [
        {
          id: "rec-1",
          filename: "test.wav",
          status: "complete",
          duration_s: 30,
          uploaded_at: "2026-04-11T08:00:00Z",
        },
      ],
      total: 1,
    });
    mockExportResearch.mockRejectedValueOnce(new Error("Export timed out"));

    render(<ExportPage />);

    // Wait for recordings to load, then select one
    const label = await screen.findByText("test.wav");
    fireEvent.click(label);

    // Click the export button
    const exportButton = screen.getByText(/Export 1 recording/);
    fireEvent.click(exportButton);

    expect(
      await screen.findByText("Export timed out"),
    ).toBeInTheDocument();
  });

  it("displays a fallback message for non-Error rejections in handleExport", async () => {
    mockGetRecordings.mockResolvedValueOnce({
      recordings: [
        {
          id: "rec-1",
          filename: "test.wav",
          status: "complete",
          duration_s: 30,
          uploaded_at: "2026-04-11T08:00:00Z",
        },
      ],
      total: 1,
    });
    mockExportResearch.mockRejectedValueOnce(undefined);

    render(<ExportPage />);

    const label = await screen.findByText("test.wav");
    fireEvent.click(label);

    const exportButton = screen.getByText(/Export 1 recording/);
    fireEvent.click(exportButton);

    expect(
      await screen.findByText("Export failed"),
    ).toBeInTheDocument();
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// Compare page error handling
// ═════════════════════════════════════════════════════════════════════════════

describe("Compare page — API error handling", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("displays an error when getCalls rejects", async () => {
    mockGetCalls.mockRejectedValueOnce(new Error("Calls endpoint down"));
    mockGetReferenceCalls.mockResolvedValueOnce([]);

    render(<ComparePage />);

    expect(
      await screen.findByText("Calls endpoint down"),
    ).toBeInTheDocument();
  });

  it("displays an error when getReferenceCalls rejects", async () => {
    mockGetCalls.mockResolvedValueOnce({ calls: [], total: 0 });
    mockGetReferenceCalls.mockRejectedValueOnce(
      new Error("References unavailable"),
    );

    render(<ComparePage />);

    expect(
      await screen.findByText("References unavailable"),
    ).toBeInTheDocument();
  });

  it("displays fallback message for non-Error rejection in getCalls", async () => {
    mockGetCalls.mockRejectedValueOnce(null);
    mockGetReferenceCalls.mockResolvedValueOnce([]);

    render(<ComparePage />);

    expect(
      await screen.findByText("Failed to load calls"),
    ).toBeInTheDocument();
  });

  it("displays fallback message for non-Error rejection in getReferenceCalls", async () => {
    mockGetCalls.mockResolvedValueOnce({ calls: [], total: 0 });
    mockGetReferenceCalls.mockRejectedValueOnce("boom");

    render(<ComparePage />);

    expect(
      await screen.findByText("Failed to load reference calls"),
    ).toBeInTheDocument();
  });
});
