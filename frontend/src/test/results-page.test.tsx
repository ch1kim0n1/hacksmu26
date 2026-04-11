import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";

vi.mock("next/link", () => ({
  default: ({ children, href, ...props }: { children: React.ReactNode; href: string; [key: string]: unknown }) => (
    <a href={href} {...props}>{children}</a>
  ),
}));
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn() }),
}));

vi.mock("@/lib/audio-api", () => ({
  getRecordings: vi.fn().mockResolvedValue({
    recordings: [
      {
        id: "rec-1",
        filename: "savanna_dawn.wav",
        status: "complete",
        duration_s: 45,
        duration: 45,
        filesize_mb: 8.2,
        uploaded_at: "2026-04-11T08:00:00Z",
        result: {
          status: "complete",
          quality: { snr_before_db: 3.2, snr_after_db: 18.5, quality_score: 0.87 },
        },
      },
    ],
    total: 1,
  }),
  API_BASE: "http://localhost:8000",
}));

import ResultsPage from "@/app/results/page";

describe("Results Page", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("renders page title", () => {
    render(<ResultsPage />);
    expect(screen.getByText("Results")).toBeInTheDocument();
  });

  it("renders results gallery after loading", async () => {
    render(<ResultsPage />);
    const filename = await screen.findByText("savanna_dawn.wav");
    expect(filename).toBeInTheDocument();
  });

  it("shows quality score for completed recordings", async () => {
    render(<ResultsPage />);
    await screen.findByText("savanna_dawn.wav");
    expect(screen.getByText(/87/)).toBeInTheDocument();
  });

  it("renders back navigation", () => {
    render(<ResultsPage />);
    const link = screen.getByText(/Back/).closest("a");
    expect(link).toBeInTheDocument();
  });
});
