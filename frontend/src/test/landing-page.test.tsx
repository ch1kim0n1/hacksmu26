import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";

// Mock next modules
vi.mock("next/link", () => ({
  default: ({ children, href, ...props }: { children: React.ReactNode; href: string; [key: string]: unknown }) => (
    <a href={href} {...props}>{children}</a>
  ),
}));
vi.mock("next/image", () => ({
  // eslint-disable-next-line jsx-a11y/alt-text, @next/next/no-img-element
  default: (props: Record<string, unknown>) => <img src={props.src as string} alt={props.alt as string} />,
}));

// Mock GSAP and ScrollTrigger — stub every method the landing page calls
vi.mock("gsap", () => {
  const tl = {
    from: vi.fn().mockReturnThis(),
    to: vi.fn().mockReturnThis(),
    fromTo: vi.fn().mockReturnThis(),
  };
  return {
    default: {
      registerPlugin: vi.fn(),
      context: () => ({ revert: vi.fn() }),
      from: vi.fn(),
      to: vi.fn(),
      set: vi.fn(),
      fromTo: vi.fn(),
      timeline: () => tl,
      utils: { toArray: () => [] },
    },
  };
});
vi.mock("gsap/ScrollTrigger", () => ({
  ScrollTrigger: { refresh: vi.fn() },
}));

// Mock heavy components
vi.mock("@/components/hero/HeroGlobe", () => ({
  default: () => <div data-testid="hero-globe" />,
}));
vi.mock("@/components/transition/SceneTransitionProvider", () => ({
  useSceneTransition: () => ({ isTransitioning: false, startDashboardTransition: vi.fn() }),
}));
vi.mock("@/components/research/ImpactDashboard", () => ({
  default: () => <div data-testid="impact-dashboard" />,
}));

// Mock IntersectionObserver for Counter
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
  it("renders EchoField brand", () => {
    render(<LandingPage />);
    const matches = screen.getAllByText("EchoField");
    expect(matches.length).toBeGreaterThan(0);
  });

  it("renders nav links", () => {
    render(<LandingPage />);
    const uploadLinks = screen.getAllByRole("link", { name: "Upload" });
    expect(uploadLinks[0]).toHaveAttribute("href", "/upload");
    const recordingsLinks = screen.getAllByRole("link", { name: "Recordings" });
    expect(recordingsLinks[0]).toHaveAttribute("href", "/recordings");
    const databaseLinks = screen.getAllByRole("link", { name: "Database" });
    expect(databaseLinks[0]).toHaveAttribute("href", "/database");
    const getStartedLinks = screen.getAllByRole("link", { name: "Get Started" });
    expect(getStartedLinks[0]).toHaveAttribute("href", "#get-started");
  });

  it("renders globe trigger button", () => {
    render(<LandingPage />);
    expect(screen.getByLabelText("Enter EchoField dashboard")).toBeInTheDocument();
  });

  it("renders crisis section heading", () => {
    render(<LandingPage />);
    expect(screen.getByText(/They.*re Disappearing/)).toBeInTheDocument();
  });

  it("renders crisis stat labels", () => {
    render(<LandingPage />);
    expect(screen.getByText("Elephants Remaining")).toBeInTheDocument();
    expect(screen.getByText("Population Lost")).toBeInTheDocument();
    expect(screen.getByText("Killed Each Year")).toBeInTheDocument();
    expect(screen.getByText("Years to Act")).toBeInTheDocument();
  });

  it("renders threats section", () => {
    render(<LandingPage />);
    expect(screen.getByText("Why This Happens")).toBeInTheDocument();
    expect(screen.getByText("Poaching for Ivory")).toBeInTheDocument();
    expect(screen.getByText("Human-Wildlife Conflict")).toBeInTheDocument();
    expect(screen.getByText("Habitat Destruction")).toBeInTheDocument();
  });

  it("renders How It Works section with three steps", () => {
    render(<LandingPage />);
    expect(screen.getByText("How It Works")).toBeInTheDocument();
    expect(screen.getAllByText("Upload").length).toBeGreaterThan(0);
    expect(screen.getByText("Process")).toBeInTheDocument();
    expect(screen.getByText("Analyze")).toBeInTheDocument();
  });

  it("renders CTA with link to upload", () => {
    render(<LandingPage />);
    const links = screen.getAllByRole("link", { name: /Get Started/ });
    const ctaLink = links.find((link) => link.getAttribute("href") === "/upload");
    expect(ctaLink).toBeDefined();
  });

  it("renders impact dashboard", () => {
    render(<LandingPage />);
    expect(screen.getByTestId("impact-dashboard")).toBeInTheDocument();
  });

  it("renders HackSMU 2026 mention", () => {
    render(<LandingPage />);
    expect(screen.getByText(/HackSMU 2026/)).toBeInTheDocument();
  });
});
