import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";

const mockPush = vi.fn();
const mockSearchParams = new URLSearchParams();

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

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: mockPush }),
  useSearchParams: () => mockSearchParams,
}));

vi.mock("@/components/research/AnalysisLabels", () => ({
  AnalysisLabelsBadge: () => null,
}));

vi.mock("@/lib/audio-api", () => ({
  getRecordings: vi.fn().mockResolvedValue({ recordings: [], total: 0 }),
  processRecording: vi.fn(),
  downloadRecording: vi.fn(),
}));

import RecordingsPage from "@/app/recordings/page";

describe("Recordings Page", () => {
  beforeEach(() => {
    mockPush.mockClear();
    mockSearchParams.delete("status");
  });

  it("renders page title", () => {
    render(<RecordingsPage />);
    expect(screen.getByRole("heading", { name: "Recordings" })).toBeInTheDocument();
  });

  it("renders filter links", () => {
    render(<RecordingsPage />);
    expect(screen.getByRole("link", { name: "All" })).toHaveAttribute(
      "href",
      "/recordings",
    );
    expect(screen.getByRole("link", { name: "Pending" })).toHaveAttribute(
      "href",
      "/recordings?status=pending",
    );
    expect(screen.getByRole("link", { name: "Completed" })).toHaveAttribute(
      "href",
      "/recordings?status=complete",
    );
  });

  it("renders AI enhancement toggle", () => {
    render(<RecordingsPage />);
    expect(screen.getByText("AI Enhance")).toBeInTheDocument();
    expect(screen.getByLabelText("Toggle AI enhancement")).toBeInTheDocument();
  });

  it("shows empty state when no recordings", async () => {
    render(<RecordingsPage />);
    expect(await screen.findByText("No recordings yet")).toBeInTheDocument();
  });
});
