import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import GlobalError from "@/app/error";
import NotFound from "@/app/not-found";
import {
  EmptyRecordings,
  ErrorState,
} from "@/components/ui/empty-state";

// Mock next/link for not-found page
vi.mock("next/link", () => ({
  default: ({
    children,
    href,
    className,
    ...props
  }: {
    children: React.ReactNode;
    href: string;
    className?: string;
    [key: string]: unknown;
  }) => (
    <a href={href} className={className} {...props}>
      {children}
    </a>
  ),
}));

// ── error.tsx — retry button uses accent-savanna ──

describe("error.tsx accent color", () => {
  it("retry button has bg-accent-savanna class", () => {
    const reset = vi.fn();
    render(<GlobalError error={new Error("test")} reset={reset} />);
    const button = screen.getByRole("button", { name: /try again/i });
    expect(button.className).toContain("bg-accent-savanna");
    expect(button.className).not.toContain("accent-teal");
  });

  it("retry button has hover:bg-accent-savanna/90 class", () => {
    const reset = vi.fn();
    render(<GlobalError error={new Error("test")} reset={reset} />);
    const button = screen.getByRole("button", { name: /try again/i });
    expect(button.className).toContain("hover:bg-accent-savanna/90");
  });
});

// ── not-found.tsx — back-to-home link uses accent-savanna ──

describe("not-found.tsx accent color", () => {
  it("back-to-home link has bg-accent-savanna class", () => {
    render(<NotFound />);
    const link = screen.getByRole("link", { name: /back to home/i });
    expect(link.className).toContain("bg-accent-savanna");
    expect(link.className).not.toContain("accent-teal");
  });

  it("back-to-home link has hover:bg-accent-savanna/90 class", () => {
    render(<NotFound />);
    const link = screen.getByRole("link", { name: /back to home/i });
    expect(link.className).toContain("hover:bg-accent-savanna/90");
  });
});

// ── empty-state.tsx — no accent-teal classes remain ──

describe("empty-state.tsx accent color", () => {
  it("EmptyRecordings icon uses accent-savanna instead of accent-teal", () => {
    const { container } = render(<EmptyRecordings />);
    const svgs = container.querySelectorAll("svg");
    const hasAccentTeal = Array.from(svgs).some((svg) =>
      svg.className.baseVal.includes("accent-teal")
    );
    expect(hasAccentTeal).toBe(false);
    const hasAccentSavanna = Array.from(svgs).some((svg) =>
      svg.className.baseVal.includes("accent-savanna")
    );
    expect(hasAccentSavanna).toBe(true);
  });

  it("ErrorState retry button uses accent-savanna", () => {
    const onRetry = vi.fn();
    const { container } = render(
      <ErrorState message="Fail" onRetry={onRetry} />
    );
    const button = screen.getByRole("button", { name: /try again/i });
    expect(button.className).toContain("bg-accent-savanna");
    expect(button.className).not.toContain("accent-teal");

    // Also verify no accent-teal anywhere in the entire tree
    expect(container.innerHTML).not.toContain("accent-teal");
  });
});
