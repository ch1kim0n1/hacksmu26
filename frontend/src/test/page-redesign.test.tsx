import { describe, it, expect, vi, beforeEach } from "vitest";
import { render } from "@testing-library/react";

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
vi.mock("next/navigation", () => ({
  useParams: () => ({ batchId: "batch-test-123" }),
  useRouter: () => ({ push: vi.fn(), back: vi.fn() }),
}));

// Mock framer-motion to render immediately without animation
vi.mock("framer-motion", () => ({
  motion: {
    div: ({ children, className, ...props }: Record<string, unknown>) => (
      <div className={className as string} {...props}>{children as React.ReactNode}</div>
    ),
    main: ({ children, className, ...props }: Record<string, unknown>) => (
      <main className={className as string} {...props}>{children as React.ReactNode}</main>
    ),
    section: ({ children, className, ...props }: Record<string, unknown>) => (
      <section className={className as string} {...props}>{children as React.ReactNode}</section>
    ),
    article: ({ children, className, ...props }: Record<string, unknown>) => (
      <article className={className as string} {...props}>{children as React.ReactNode}</article>
    ),
  },
  AnimatePresence: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));

// Mock audio-api
vi.mock("@/lib/audio-api", () => ({
  API_BASE: "http://localhost:8000",
  getCalls: vi.fn().mockResolvedValue({ calls: [], total: 0 }),
  getReferenceCalls: vi.fn().mockResolvedValue([]),
  compareCrossSpecies: vi.fn().mockResolvedValue(null),
  getReviewQueue: vi.fn().mockResolvedValue({ items: [], total: 0 }),
  reviewCall: vi.fn().mockResolvedValue({}),
  retrainClassifier: vi.fn().mockResolvedValue({ samples: 10 }),
  getBatchSummary: vi.fn().mockResolvedValue({
    status: "complete",
    recordings: 3,
    total_calls_detected: 12,
    quality_scores: { avg: 8.5 },
    call_type_distribution: { rumble: 8, trumpet: 4 },
    recordings_summary: [],
    shared_patterns: [],
  }),
  getRecordings: vi.fn().mockResolvedValue({ recordings: [], total: 0 }),
  exportResearch: vi.fn().mockResolvedValue(new Blob(["test"])),
}));

import ComparePage from "@/app/compare/page";
import ReviewPage from "@/app/review/page";
import BatchPage from "@/app/batch/[batchId]/page";
import ExportPage from "@/app/export/page";

/** Collect every class attribute in the rendered tree */
function collectClasses(container: HTMLElement): string {
  const allEls = container.querySelectorAll("*");
  return Array.from(allEls)
    .map((el) => el.getAttribute("class") || "")
    .join(" ");
}

// ── Compare Page ──

describe("Compare Page — glass-morphism redesign", () => {
  beforeEach(() => vi.clearAllMocks());

  it("does not use text-4xl on any element", () => {
    const { container } = render(<ComparePage />);
    expect(collectClasses(container)).not.toContain("text-4xl");
  });

  it("uses text-2xl on the heading", () => {
    const { container } = render(<ComparePage />);
    expect(collectClasses(container)).toContain("text-2xl");
  });

  it("does not use bg-ev-cream on cards", () => {
    const { container } = render(<ComparePage />);
    expect(collectClasses(container)).not.toContain("bg-ev-cream");
  });

  it("does not use bg-background-elevated", () => {
    const { container } = render(<ComparePage />);
    expect(collectClasses(container)).not.toContain("bg-background-elevated");
  });
});

// ── Review Page ──

describe("Review Page — glass-morphism redesign", () => {
  beforeEach(() => vi.clearAllMocks());

  it("does not use text-4xl on any element", () => {
    const { container } = render(<ReviewPage />);
    expect(collectClasses(container)).not.toContain("text-4xl");
  });

  it("uses text-2xl on the heading", () => {
    const { container } = render(<ReviewPage />);
    expect(collectClasses(container)).toContain("text-2xl");
  });

  it("does not use bg-ev-cream on cards", () => {
    const { container } = render(<ReviewPage />);
    expect(collectClasses(container)).not.toContain("bg-ev-cream");
  });
});

// ── Batch Page ──

describe("Batch Page — glass-morphism redesign", () => {
  beforeEach(() => vi.clearAllMocks());

  it("does not use text-4xl on any element", () => {
    const { container } = render(<BatchPage />);
    expect(collectClasses(container)).not.toContain("text-4xl");
  });

  it("uses text-2xl on the heading", () => {
    const { container } = render(<BatchPage />);
    expect(collectClasses(container)).toContain("text-2xl");
  });

  it("does not use bg-background-elevated", () => {
    const { container } = render(<BatchPage />);
    expect(collectClasses(container)).not.toContain("bg-background-elevated");
  });
});

// ── Export Page ──

describe("Export Page — glass-morphism redesign", () => {
  beforeEach(() => vi.clearAllMocks());

  it("does not use text-4xl on any element", () => {
    const { container } = render(<ExportPage />);
    expect(collectClasses(container)).not.toContain("text-4xl");
  });

  it("uses text-2xl on the heading", () => {
    const { container } = render(<ExportPage />);
    expect(collectClasses(container)).toContain("text-2xl");
  });

  it("does not use bg-ev-cream on cards or list items", () => {
    const { container } = render(<ExportPage />);
    expect(collectClasses(container)).not.toContain("bg-ev-cream");
  });
});
