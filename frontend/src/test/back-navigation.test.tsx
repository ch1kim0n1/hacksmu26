import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";

vi.mock("next/link", () => ({
  default: ({ children, href, ...props }: { children: React.ReactNode; href: string; [key: string]: unknown }) => (
    <a href={href} {...props}>{children}</a>
  ),
}));
vi.mock("next/image", () => ({
  // eslint-disable-next-line jsx-a11y/alt-text, @next/next/no-img-element
  default: (props: Record<string, unknown>) => <img src={props.src as string} alt={props.alt as string} />,
}));
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn() }),
}));

vi.mock("@/lib/audio-api", () => ({
  getCalls: vi.fn().mockResolvedValue({ calls: [], total: 0 }),
  getRecordings: vi.fn().mockResolvedValue({ recordings: [], total: 0 }),
  exportResearch: vi.fn().mockResolvedValue(new Blob(["test"])),
  API_BASE: "http://localhost:8000",
}));

vi.mock("@/hooks/useKeyboardShortcuts", () => ({
  useKeyboardShortcuts: vi.fn(),
}));
vi.mock("@/components/layout/ShortcutHelp", () => ({
  default: () => null,
}));

import DatabasePage from "@/app/database/page";
import ResultsPage from "@/app/results/page";
import ExportPage from "@/app/export/page";

describe("Back navigation — issue #209", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("Database page", () => {
    it("does not render a 'Back to Upload' link", () => {
      render(<DatabasePage />);
      const backLink = screen.queryByText("Back to Upload");
      expect(backLink).not.toBeInTheDocument();
    });
  });

  describe("Results page", () => {
    it("does not render a 'Back to Upload' link", () => {
      render(<ResultsPage />);
      const backLink = screen.queryByText("Back to Upload");
      expect(backLink).not.toBeInTheDocument();
    });
  });

  describe("Export page", () => {
    it("renders a back link to /results", () => {
      render(<ExportPage />);
      const backLink = screen.getByText("Back to Results");
      expect(backLink).toBeInTheDocument();
      const anchor = backLink.closest("a");
      expect(anchor).toHaveAttribute("href", "/results");
    });

    it("does not link back to the landing page", () => {
      render(<ExportPage />);
      const allLinks = screen.getAllByRole("link");
      const landingLinks = allLinks.filter((link) => link.getAttribute("href") === "/");
      expect(landingLinks).toHaveLength(0);
    });
  });
});
