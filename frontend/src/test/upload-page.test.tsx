import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";

// Mock next modules
vi.mock("next/link", () => ({
  default: ({ children, href, ...props }: { children: React.ReactNode; href: string; [key: string]: unknown }) => (
    <a href={href} {...props}>{children}</a>
  ),
}));
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn() }),
}));

// Mock API
vi.mock("@/lib/audio-api", () => ({
  uploadFiles: vi.fn(),
  getRecordings: vi.fn().mockResolvedValue({ recordings: [], total: 0 }),
  processRecording: vi.fn(),
  downloadRecording: vi.fn(),
}));

// Mock AnalysisLabels
vi.mock("@/components/research/AnalysisLabels", () => ({
  AnalysisLabelsBadge: () => null,
}));

import UploadPage from "@/app/upload/page";

describe("Upload Page", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("renders page title", async () => {
    render(<UploadPage />);
    expect(screen.getByText("Upload Recordings")).toBeInTheDocument();
  });

  it("renders description text", () => {
    render(<UploadPage />);
    expect(screen.getByText(/AI-powered noise removal/)).toBeInTheDocument();
  });

  it("renders back to home link", () => {
    render(<UploadPage />);
    const link = screen.getByText("Back to Home").closest("a");
    expect(link?.getAttribute("href")).toBe("/");
  });

  it("renders drag-drop zone", () => {
    render(<UploadPage />);
    expect(screen.getByText(/Drop .wav or .mp3 here/)).toBeInTheDocument();
  });

  it("renders browse files button", () => {
    render(<UploadPage />);
    expect(screen.getByText("Browse Files")).toBeInTheDocument();
  });

  it("renders file input for audio files", () => {
    const { container } = render(<UploadPage />);
    const input = container.querySelector('input[type="file"]');
    expect(input).toBeInTheDocument();
    expect(input?.getAttribute("accept")).toContain(".wav");
    expect(input?.getAttribute("accept")).toContain(".mp3");
  });

  it("renders Your Recordings section", () => {
    render(<UploadPage />);
    expect(screen.getByText("Your Recordings")).toBeInTheDocument();
  });

  it("renders AI enhancement toggle", () => {
    render(<UploadPage />);
    expect(screen.getByText("Enhance with AI")).toBeInTheDocument();
    expect(screen.getByLabelText("Toggle AI enhancement")).toBeInTheDocument();
  });

  it("shows empty state when no recordings", async () => {
    render(<UploadPage />);
    // Wait for loading to finish
    const empty = await screen.findByText("No recordings yet");
    expect(empty).toBeInTheDocument();
  });

  it("toggles AI enhancement on click", () => {
    render(<UploadPage />);
    const toggle = screen.getByLabelText("Toggle AI enhancement");
    expect(toggle.getAttribute("aria-pressed")).toBe("true");
    fireEvent.click(toggle);
    expect(toggle.getAttribute("aria-pressed")).toBe("false");
  });
});
