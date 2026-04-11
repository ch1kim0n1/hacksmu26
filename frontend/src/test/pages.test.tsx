import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";

// Mock next modules
vi.mock("next/link", () => ({
  default: ({ children, href, ...props }: { children: React.ReactNode; href: string; [key: string]: unknown }) => (
    <a href={href} {...props}>{children}</a>
  ),
}));
vi.mock("next/navigation", () => ({
  useParams: () => ({ jobId: "test-job-123" }),
  useRouter: () => ({ push: vi.fn(), back: vi.fn() }),
}));

// Mock hooks
vi.mock("@/hooks/useProcessingJob", () => ({
  default: () => ({
    status: "idle",
    currentStage: "",
    progress: 0,
    stages: [
      { name: "ingestion", status: "pending" },
      { name: "spectrogram", status: "pending" },
      { name: "noise_removal", status: "pending" },
    ],
    quality: null,
    error: null,
  }),
}));

// Mock API
vi.mock("@/lib/audio-api", () => ({
  getRecording: vi.fn().mockResolvedValue({
    id: "test-job-123",
    filename: "elephant_call.wav",
    status: "pending",
    duration_s: 30,
    duration: 30,
    filesize_mb: 5.2,
    uploaded_at: "2026-04-11T12:00:00Z",
    sample_rate: 44100,
    metadata: {},
  }),
  getCalls: vi.fn().mockResolvedValue({ calls: [], total: 0 }),
  API_BASE: "http://localhost:8000",
}));

// Mock AnalysisLabels
vi.mock("@/components/research/AnalysisLabels", () => ({
  AnalysisLabels: () => null,
  AnalysisWindow: () => null,
}));

import ProcessingPage from "@/app/processing/[jobId]/page";
import DatabasePage from "@/app/database/page";

// ── Processing Page ──

describe("Processing Page", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("shows loading state initially", () => {
    render(<ProcessingPage />);
    expect(screen.getByText("Loading recording...")).toBeInTheDocument();
  });

  it("renders the pipeline stages after loading", async () => {
    render(<ProcessingPage />);
    const stage = await screen.findByText("Ingestion");
    expect(stage).toBeInTheDocument();
    expect(screen.getByText("Spectrogram")).toBeInTheDocument();
    expect(screen.getByText("Noise Removal")).toBeInTheDocument();
  });

  it("renders back link to upload after loading", async () => {
    render(<ProcessingPage />);
    const link = await screen.findByText("Back to Recordings");
    expect(link.closest("a")?.getAttribute("href")).toBe("/upload");
  });

  it("renders recording info section after loading", async () => {
    render(<ProcessingPage />);
    const title = await screen.findByText("elephant_call.wav");
    expect(title).toBeInTheDocument();
  });
});

// ── Database Page ──

describe("Database Page", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("renders page title", () => {
    render(<DatabasePage />);
    expect(screen.getByText("Call Database")).toBeInTheDocument();
  });

  it("renders search input", () => {
    render(<DatabasePage />);
    expect(screen.getByPlaceholderText(/Search/)).toBeInTheDocument();
  });

  it("renders call type filter", () => {
    render(<DatabasePage />);
    expect(screen.getByText("All Types")).toBeInTheDocument();
  });

  it("shows empty state when no calls", async () => {
    render(<DatabasePage />);
    const empty = await screen.findByText("No calls found");
    expect(empty).toBeInTheDocument();
  });
});
