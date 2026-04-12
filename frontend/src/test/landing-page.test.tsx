import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";

vi.mock("next/link", () => ({
  default: ({ children, href, ...props }: { children: React.ReactNode; href: string; [key: string]: unknown }) => (
    <a href={href} {...props}>{children}</a>
  ),
}));

// Mock IntersectionObserver for AnimatedCounter
class MockIntersectionObserver {
  constructor(callback: IntersectionObserverCallback) {
    setTimeout(() => {
      callback(
        [{ isIntersecting: true } as IntersectionObserverEntry],
        this as unknown as IntersectionObserver
      );
    }, 0);
  }
  observe() {}
  disconnect() {}
  unobserve() {}
}
vi.stubGlobal("IntersectionObserver", MockIntersectionObserver);

import LandingPage from "@/app/page";

describe("Landing Page", () => {
  it("renders hero headline", () => {
    render(<LandingPage />);
    expect(screen.getByText("Elephant Vocalization")).toBeInTheDocument();
  });

  it("renders hero subheadline", () => {
    render(<LandingPage />);
    expect(screen.getByText(/Hear what researchers hear/)).toBeInTheDocument();
  });

  it("renders Upload Recording CTA", () => {
    render(<LandingPage />);
    const cta = screen.getByText("Upload Recording");
    expect(cta).toBeInTheDocument();
    expect(cta.closest("a")?.getAttribute("href")).toBe("/upload");
  });

  it("renders How It Works CTA and section", () => {
    render(<LandingPage />);
    const elements = screen.getAllByText("How It Works");
    expect(elements.length).toBe(2); // CTA button + section heading
  });

  it("renders stat counters", () => {
    render(<LandingPage />);
    expect(screen.getByText("Recordings")).toBeInTheDocument();
    expect(screen.getByText("Calls Detected")).toBeInTheDocument();
    expect(screen.getByText("Success Rate")).toBeInTheDocument();
  });

  it("renders Why This Matters section", () => {
    render(<LandingPage />);
    expect(screen.getByText("Why This Matters")).toBeInTheDocument();
    expect(screen.getByText("Infrasound Below Human Hearing")).toBeInTheDocument();
    expect(screen.getByText("Field Recordings Are Noisy")).toBeInTheDocument();
    expect(screen.getByText("Conservation Depends on Data")).toBeInTheDocument();
    expect(screen.getByText("Reproducible Research")).toBeInTheDocument();
  });

  it("renders How It Works section with three steps", () => {
    render(<LandingPage />);
    expect(screen.getAllByText("Upload").length).toBeGreaterThan(0);
    expect(screen.getByText("AI Denoise")).toBeInTheDocument();
    expect(screen.getByText("Analyze")).toBeInTheDocument();
  });

  it("renders footer CTA to get started", () => {
    render(<LandingPage />);
    expect(screen.getByText("Get Started")).toBeInTheDocument();
    const link = screen.getByText("Get Started").closest("a");
    expect(link?.getAttribute("href")).toBe("/upload");
  });

  it("renders hero navbar links", () => {
    render(<LandingPage />);
    expect(screen.getByRole("link", { name: "About" })).toHaveAttribute("href", "/about");
    expect(screen.getAllByRole("link", { name: "Upload" })[0]).toHaveAttribute("href", "/upload");
    expect(screen.getByRole("link", { name: "Database" })).toHaveAttribute("href", "/database");
    expect(screen.getByRole("link", { name: "Get Started" })).toHaveAttribute("href", "#get-started");
  });

  it("renders HackSMU badge", () => {
    render(<LandingPage />);
    expect(screen.getByText(/HackSMU 2026/)).toBeInTheDocument();
  });
});
