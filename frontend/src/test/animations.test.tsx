import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { Skeleton, SkeletonCard, SkeletonSpectrogram, SkeletonMetricPanel } from "@/components/ui/skeleton";
import { FadeIn, StaggerChildren, StaggerItem } from "@/components/ui/fade-in";
import { PageTransition } from "@/components/ui/page-transition";

// Mock next/navigation
vi.mock("next/navigation", () => ({
  usePathname: () => "/test",
}));

// ── Skeleton Components ──

describe("Skeleton", () => {
  it("renders default skeleton with shimmer", () => {
    render(<Skeleton data-testid="skel" />);
    const el = screen.getByTestId("skel");
    expect(el.className).toContain("skeleton");
    expect(el.className).toContain("h-4");
    expect(el.className).toContain("w-full");
  });

  it("renders card variant", () => {
    render(<Skeleton variant="card" data-testid="card" />);
    expect(screen.getByTestId("card").className).toContain("h-32");
    expect(screen.getByTestId("card").className).toContain("rounded-xl");
  });

  it("renders spectrogram variant", () => {
    render(<Skeleton variant="spectrogram" data-testid="spec" />);
    expect(screen.getByTestId("spec").className).toContain("h-48");
  });

  it("renders waveform variant", () => {
    render(<Skeleton variant="waveform" data-testid="wave" />);
    expect(screen.getByTestId("wave").className).toContain("h-16");
  });

  it("renders metric variant", () => {
    render(<Skeleton variant="metric" data-testid="met" />);
    expect(screen.getByTestId("met").className).toContain("h-10");
    expect(screen.getByTestId("met").className).toContain("w-24");
  });

  it("accepts custom className", () => {
    render(<Skeleton className="custom-class" data-testid="custom" />);
    expect(screen.getByTestId("custom").className).toContain("custom-class");
  });
});

describe("SkeletonCard", () => {
  it("renders card structure with skeleton elements", () => {
    const { container } = render(<SkeletonCard />);
    const skeletons = container.querySelectorAll(".skeleton");
    expect(skeletons.length).toBeGreaterThanOrEqual(5);
  });

  it("has rounded border container", () => {
    const { container } = render(<SkeletonCard />);
    const root = container.firstElementChild as HTMLElement;
    expect(root.className).toContain("rounded-xl");
    expect(root.className).toContain("border");
  });
});

describe("SkeletonSpectrogram", () => {
  it("renders spectrogram placeholder with axis area", () => {
    const { container } = render(<SkeletonSpectrogram />);
    const skeletons = container.querySelectorAll(".skeleton");
    expect(skeletons.length).toBeGreaterThanOrEqual(6);
  });

  it("has header bar placeholder", () => {
    const { container } = render(<SkeletonSpectrogram />);
    const header = container.querySelector(".border-b");
    expect(header).not.toBeNull();
  });
});

describe("SkeletonMetricPanel", () => {
  it("renders metric skeleton elements", () => {
    const { container } = render(<SkeletonMetricPanel />);
    const skeletons = container.querySelectorAll(".skeleton");
    expect(skeletons.length).toBe(3);
  });
});

// ── FadeIn ──

describe("FadeIn", () => {
  it("renders children", () => {
    render(<FadeIn>Hello World</FadeIn>);
    expect(screen.getByText("Hello World")).toBeInTheDocument();
  });

  it("applies custom className", () => {
    const { container } = render(<FadeIn className="test-class">Content</FadeIn>);
    const motion = container.firstElementChild as HTMLElement;
    expect(motion.className).toContain("test-class");
  });

  it("renders with different directions", () => {
    const directions = ["up", "down", "left", "right", "none"] as const;
    directions.forEach((dir) => {
      const { unmount } = render(<FadeIn direction={dir}>Dir: {dir}</FadeIn>);
      expect(screen.getByText(`Dir: ${dir}`)).toBeInTheDocument();
      unmount();
    });
  });
});

// ── StaggerChildren + StaggerItem ──

describe("StaggerChildren and StaggerItem", () => {
  it("renders staggered children", () => {
    render(
      <StaggerChildren>
        <StaggerItem>Item 1</StaggerItem>
        <StaggerItem>Item 2</StaggerItem>
        <StaggerItem>Item 3</StaggerItem>
      </StaggerChildren>
    );
    expect(screen.getByText("Item 1")).toBeInTheDocument();
    expect(screen.getByText("Item 2")).toBeInTheDocument();
    expect(screen.getByText("Item 3")).toBeInTheDocument();
  });

  it("accepts className on container and items", () => {
    const { container } = render(
      <StaggerChildren className="stagger-container">
        <StaggerItem className="stagger-item">A</StaggerItem>
      </StaggerChildren>
    );
    expect(container.querySelector(".stagger-container")).not.toBeNull();
    expect(container.querySelector(".stagger-item")).not.toBeNull();
  });
});

// ── PageTransition ──

describe("PageTransition", () => {
  it("renders children inside motion wrapper", () => {
    render(
      <PageTransition>
        <div>Page Content</div>
      </PageTransition>
    );
    expect(screen.getByText("Page Content")).toBeInTheDocument();
  });
});
