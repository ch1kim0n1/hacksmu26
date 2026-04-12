import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { MetricCard } from "@/components/ui/metric-card";

describe("MetricCard", () => {
  it("renders the label text", () => {
    render(<MetricCard label="Quality Score">content</MetricCard>);
    expect(screen.getByText("Quality Score")).toBeInTheDocument();
  });

  it("renders children", () => {
    render(
      <MetricCard label="Test Label">
        <span data-testid="child">Hello</span>
      </MetricCard>,
    );
    expect(screen.getByTestId("child")).toBeInTheDocument();
    expect(screen.getByText("Hello")).toBeInTheDocument();
  });

  it("displays label as an uppercase heading", () => {
    render(<MetricCard label="Signal Info">content</MetricCard>);
    const heading = screen.getByText("Signal Info");
    expect(heading.tagName).toBe("H3");
    expect(heading.className).toContain("uppercase");
  });

  it("wraps children in a min-h-0 container", () => {
    render(
      <MetricCard label="Wrapper Test">
        <p>wrapped</p>
      </MetricCard>,
    );
    const child = screen.getByText("wrapped");
    expect(child.parentElement?.className).toContain("min-h-0");
  });
});
