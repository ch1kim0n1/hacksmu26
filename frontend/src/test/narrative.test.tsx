import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";

// Mock next/link
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

// Mock framer-motion to avoid animation issues in tests
vi.mock("framer-motion", () => ({
  motion: {
    div: ({ children, ...props }: { children: React.ReactNode; [key: string]: unknown }) => <div {...props}>{children}</div>,
    section: ({ children, ...props }: { children: React.ReactNode; [key: string]: unknown }) => <section {...props}>{children}</section>,
    p: ({ children, ...props }: { children: React.ReactNode; [key: string]: unknown }) => <p {...props}>{children}</p>,
  },
  useInView: () => true,
  AnimatePresence: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));

// Mock SoundWave component
vi.mock("@/components/ui/motion-primitives", () => ({
  SoundWave: () => <span data-testid="sound-wave" />,
  staggerContainer: {},
  fadeUp: {},
}));

// ── Landing Page Narrative Tests ──

// Mock GSAP for landing page
vi.mock("gsap", () => ({
  default: {
    registerPlugin: vi.fn(),
    context: vi.fn(() => ({ revert: vi.fn() })),
    timeline: vi.fn(() => ({ from: vi.fn().mockReturnThis() })),
    from: vi.fn(),
    to: vi.fn(),
    fromTo: vi.fn(),
    utils: { toArray: vi.fn(() => []) },
    set: vi.fn(),
  },
}));

vi.mock("gsap/ScrollTrigger", () => ({
  ScrollTrigger: {},
}));

vi.mock("next/image", () => ({
  default: ({ alt, ...props }: { alt: string; [key: string]: unknown }) => (
    // eslint-disable-next-line @next/next/no-img-element
    <img alt={alt} {...props} />
  ),
}));

vi.mock("@/components/hero/HeroGlobe", () => ({
  default: () => <div data-testid="hero-globe" />,
}));

// Mock IntersectionObserver
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

import AboutPage from "@/app/about/page";
import CallCard from "@/components/research/CallCard";

// ── About Page Narrative Tests ──

describe("About Page — Narrative Framing (#130)", () => {
  it("renders the mission headline about decoding elephant communication", () => {
    render(<AboutPage />);
    expect(screen.getByText("About EchoField")).toBeInTheDocument();
  });

  it("renders mission statement about elephant communication research", () => {
    render(<AboutPage />);
    // Check for mission-framing text
    expect(
      screen.getByText(/reveals the hidden voice of elephants/i)
    ).toBeInTheDocument();
  });

  it("renders the Rosetta Stone framing", () => {
    render(<AboutPage />);
    const matches = screen.getAllByText(/Rosetta Stone/i);
    expect(matches.length).toBeGreaterThanOrEqual(1);
  });

  it("renders ElephantVoices partnership badge prominently", () => {
    render(<AboutPage />);
    expect(
      screen.getByText("In Partnership with ElephantVoices")
    ).toBeInTheDocument();
    expect(
      screen.getByText(/ElephantVoices is a nonprofit/i)
    ).toBeInTheDocument();
  });

  it("renders technical approach paragraph", () => {
    render(<AboutPage />);
    // Should describe the technical pipeline
    const matches = screen.getAllByText(/spectral gating/i);
    expect(matches.length).toBeGreaterThanOrEqual(1);
  });

  it("renders the conservation connection", () => {
    render(<AboutPage />);
    const matches = screen.getAllByText(/conservation/i);
    expect(matches.length).toBeGreaterThanOrEqual(1);
  });

  it("renders team section with roles", () => {
    render(<AboutPage />);
    expect(screen.getByText("The Team")).toBeInTheDocument();
    expect(screen.getByText("Dmitry Moiseenko")).toBeInTheDocument();
  });

  it("renders HackSMU attribution", () => {
    render(<AboutPage />);
    const matches = screen.getAllByText(/HackSMU 2026/i);
    expect(matches.length).toBeGreaterThanOrEqual(1);
  });
});

// ── CallCard Narrative Tests ──

describe("CallCard — Scientific Context (#130)", () => {
  const baseCall = {
    id: "abc12345-0000-0000-0000-000000000000",
    recording_id: "rec-001",
    call_type: "contact",
    duration_ms: 3200,
    frequency_min_hz: 14,
    frequency_max_hz: 115,
    confidence: 0.88,
  };

  it("renders call type label", () => {
    render(<CallCard call={baseCall} />);
    expect(screen.getByText("contact")).toBeInTheDocument();
  });

  it("renders scientific description for contact call type", () => {
    render(<CallCard call={baseCall} />);
    // description should be rendered for contact calls
    expect(
      screen.getByText(/social bond/i)
    ).toBeInTheDocument();
  });

  it("renders scientific description for alarm call type", () => {
    render(<CallCard call={{ ...baseCall, call_type: "alarm" }} />);
    expect(
      screen.getByText(/predator/i)
    ).toBeInTheDocument();
  });

  it("renders scientific description for mating call type", () => {
    render(<CallCard call={{ ...baseCall, call_type: "mating" }} />);
    expect(
      screen.getByText(/reproductive/i)
    ).toBeInTheDocument();
  });

  it("renders scientific description for feeding call type", () => {
    render(<CallCard call={{ ...baseCall, call_type: "feeding" }} />);
    expect(
      screen.getByText(/foraging/i)
    ).toBeInTheDocument();
  });

  it("renders scientific description for social call type", () => {
    render(<CallCard call={{ ...baseCall, call_type: "social" }} />);
    expect(
      screen.getByText(/group coordination/i)
    ).toBeInTheDocument();
  });

  it("renders scientific description for song call type", () => {
    render(<CallCard call={{ ...baseCall, call_type: "song" }} />);
    expect(
      screen.getByText(/harmonic/i)
    ).toBeInTheDocument();
  });

  it("renders frequency and duration metrics as before", () => {
    render(<CallCard call={baseCall} />);
    expect(screen.getByText("14 - 115 Hz")).toBeInTheDocument();
    expect(screen.getByText("3.2s")).toBeInTheDocument();
  });

  it("renders confidence bar as before", () => {
    render(<CallCard call={baseCall} />);
    expect(screen.getByText("88%")).toBeInTheDocument();
  });
});
