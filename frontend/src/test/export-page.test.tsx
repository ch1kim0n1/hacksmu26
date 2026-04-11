import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";

vi.mock("next/link", () => ({
  default: ({ children, href, ...props }: { children: React.ReactNode; href: string; [key: string]: unknown }) => (
    <a href={href} {...props}>{children}</a>
  ),
}));

vi.mock("@/lib/audio-api", () => ({
  getRecordings: vi.fn().mockResolvedValue({
    recordings: [
      { id: "rec-1", filename: "dawn_chorus.wav", status: "complete", duration_s: 30, uploaded_at: "2026-04-11T08:00:00Z" },
      { id: "rec-2", filename: "waterhole.wav", status: "complete", duration_s: 45, uploaded_at: "2026-04-11T09:00:00Z" },
    ],
    total: 2,
  }),
  exportResearch: vi.fn().mockResolvedValue(new Blob(["test"])),
}));

import ExportPage from "@/app/export/page";

describe("Export Page", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("renders page title", () => {
    render(<ExportPage />);
    expect(screen.getByText("Export Research Data")).toBeInTheDocument();
  });

  it("renders format selection options", () => {
    render(<ExportPage />);
    expect(screen.getByText("CSV")).toBeInTheDocument();
    expect(screen.getByText("JSON")).toBeInTheDocument();
    expect(screen.getByText("ZIP")).toBeInTheDocument();
  });

  it("renders recording list after loading", async () => {
    render(<ExportPage />);
    const name = await screen.findByText("dawn_chorus.wav");
    expect(name).toBeInTheDocument();
    expect(screen.getByText("waterhole.wav")).toBeInTheDocument();
  });

  it("renders export button", () => {
    render(<ExportPage />);
    expect(screen.getByText(/Export 0 recordings as CSV/)).toBeInTheDocument();
  });

  it("has select all checkbox", async () => {
    render(<ExportPage />);
    await screen.findByText("dawn_chorus.wav");
    const checkboxes = screen.getAllByRole("checkbox");
    expect(checkboxes.length).toBeGreaterThan(0);
  });
});
