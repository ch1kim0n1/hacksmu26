import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import SpectrumAnalyzer from "@/components/audio/SpectrumAnalyzer";

// Mock ResizeObserver (not available in jsdom)
class MockResizeObserver {
  observe = vi.fn();
  unobserve = vi.fn();
  disconnect = vi.fn();
}
vi.stubGlobal("ResizeObserver", MockResizeObserver);

describe("SpectrumAnalyzer", () => {
  it("renders with title", () => {
    render(<SpectrumAnalyzer />);
    expect(screen.getByText("Frequency Spectrum")).toBeInTheDocument();
  });

  it("shows idle state when no audio element provided", () => {
    render(<SpectrumAnalyzer />);
    expect(screen.getByText("Idle")).toBeInTheDocument();
  });

  it("renders canvas element", () => {
    const { container } = render(<SpectrumAnalyzer />);
    const canvas = container.querySelector("canvas");
    expect(canvas).toBeInTheDocument();
  });

  it("renders frequency axis labels", () => {
    render(<SpectrumAnalyzer />);
    expect(screen.getByText("0 Hz")).toBeInTheDocument();
    expect(screen.getByText("500 Hz")).toBeInTheDocument();
    expect(screen.getByText("1000 Hz")).toBeInTheDocument();
  });

  it("renders elephant range legend with default range", () => {
    render(<SpectrumAnalyzer />);
    expect(screen.getByText(/Elephant call range \(8-200 Hz\)/)).toBeInTheDocument();
  });

  it("renders custom elephant range", () => {
    render(<SpectrumAnalyzer elephantRange={[10, 150]} />);
    expect(screen.getByText(/10-150 Hz/)).toBeInTheDocument();
  });

  it("applies custom className", () => {
    const { container } = render(<SpectrumAnalyzer className="custom-class" />);
    const root = container.firstElementChild as HTMLElement;
    expect(root.className).toContain("custom-class");
  });

  it("has dark theme border and background", () => {
    const { container } = render(<SpectrumAnalyzer />);
    const root = container.firstElementChild as HTMLElement;
    expect(root.className).toContain("border-ev-sand");
    expect(root.className).toContain("bg-ev-cream");
  });

  it("renders status indicator dot", () => {
    const { container } = render(<SpectrumAnalyzer />);
    // When idle, the dot should have the muted color
    const dot = container.querySelector(".bg-ev-warm-gray");
    expect(dot).toBeInTheDocument();
  });

  it("renders elephant range color swatch", () => {
    const { container } = render(<SpectrumAnalyzer />);
    const swatch = container.querySelector(".bg-accent-savanna\\/50");
    expect(swatch).toBeInTheDocument();
  });
});
