import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import AboutPage from "@/app/about/page";

vi.mock("next/link", () => ({
  default: ({ children, href, ...props }: { children: React.ReactNode; href: string; [key: string]: unknown }) => (
    <a href={href} {...props}>{children}</a>
  ),
}));

describe("About Page", () => {
  it("renders the page title", () => {
    render(<AboutPage />);
    expect(screen.getByText("About EchoField")).toBeInTheDocument();
  });

  it("renders the Why This Matters section", () => {
    render(<AboutPage />);
    expect(screen.getByText("Why This Matters")).toBeInTheDocument();
    expect(screen.getByText(/Elephant communication research/)).toBeInTheDocument();
  });

  it("renders the How It Works section with 3 steps", () => {
    render(<AboutPage />);
    expect(screen.getByText("How It Works")).toBeInTheDocument();
    expect(screen.getByText("Upload")).toBeInTheDocument();
    expect(screen.getByText("AI Denoise")).toBeInTheDocument();
    expect(screen.getByText("Analyze")).toBeInTheDocument();
  });

  it("renders step numbers", () => {
    render(<AboutPage />);
    expect(screen.getByText("Step 01")).toBeInTheDocument();
    expect(screen.getByText("Step 02")).toBeInTheDocument();
    expect(screen.getByText("Step 03")).toBeInTheDocument();
  });

  it("renders the Team section with members", () => {
    render(<AboutPage />);
    expect(screen.getByText("The Team")).toBeInTheDocument();
    expect(screen.getByText("Dmitry Moiseenko")).toBeInTheDocument();
    expect(screen.getByText("Full-Stack & Design")).toBeInTheDocument();
  });

  it("renders ElephantVoices credit", () => {
    render(<AboutPage />);
    expect(screen.getByText("In Partnership with ElephantVoices")).toBeInTheDocument();
    expect(screen.getByText(/ElephantVoices is a nonprofit/)).toBeInTheDocument();
  });

  it("renders HackSMU credit", () => {
    render(<AboutPage />);
    expect(screen.getByText(/Built in 36 hours at HackSMU 2026/)).toBeInTheDocument();
  });

  it("has a link back to home", () => {
    render(<AboutPage />);
    const link = screen.getByText("Back to EchoField");
    expect(link.closest("a")).toHaveAttribute("href", "/");
  });

  it("uses dark theme classes consistently", () => {
    const { container } = render(<AboutPage />);
    // All section headers should use echofield-text-primary
    const h2s = container.querySelectorAll("h2");
    h2s.forEach((h2) => {
      expect(h2.className).toContain("text-echofield-text-primary");
    });
  });

  it("renders methodology cards with border styling", () => {
    const { container } = render(<AboutPage />);
    const cards = container.querySelectorAll(".border-echofield-border.bg-echofield-surface");
    expect(cards.length).toBeGreaterThanOrEqual(3); // 3 step cards + team cards
  });
});
