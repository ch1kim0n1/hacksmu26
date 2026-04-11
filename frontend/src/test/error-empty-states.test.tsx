import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import {
  EmptyState,
  EmptyRecordings,
  EmptyCalls,
  ErrorState,
  ProcessingError,
  ConnectionLost,
} from "@/components/ui/empty-state";
import GlobalError from "@/app/error";
import NotFound from "@/app/not-found";

// Mock next/link for not-found page
vi.mock("next/link", () => ({
  default: ({ children, href, ...props }: { children: React.ReactNode; href: string; [key: string]: unknown }) => (
    <a href={href} {...props}>{children}</a>
  ),
}));

// ── EmptyState ──

describe("EmptyState", () => {
  it("renders title and description", () => {
    render(
      <EmptyState title="No data" description="Nothing here yet." />
    );
    expect(screen.getByText("No data")).toBeInTheDocument();
    expect(screen.getByText("Nothing here yet.")).toBeInTheDocument();
  });

  it("renders action button when provided", () => {
    render(
      <EmptyState
        title="Empty"
        action={<button>Add Item</button>}
      />
    );
    expect(screen.getByText("Add Item")).toBeInTheDocument();
  });

  it("renders custom icon", () => {
    render(
      <EmptyState
        title="Custom"
        icon={<span data-testid="custom-icon">ICON</span>}
      />
    );
    expect(screen.getByTestId("custom-icon")).toBeInTheDocument();
  });

  it("applies custom className", () => {
    const { container } = render(
      <EmptyState title="Test" className="custom-empty" />
    );
    expect(container.firstElementChild?.className).toContain("custom-empty");
  });

  it("omits description when not provided", () => {
    render(<EmptyState title="Title Only" />);
    expect(screen.getByText("Title Only")).toBeInTheDocument();
    // Only one text node expected beyond the title
    const paras = screen.queryAllByRole("paragraph");
    // No description paragraph
    expect(paras.length).toBe(0);
  });
});

// ── EmptyRecordings ──

describe("EmptyRecordings", () => {
  it("renders recording-specific empty state", () => {
    render(<EmptyRecordings />);
    expect(screen.getByText("No recordings yet")).toBeInTheDocument();
    expect(screen.getByText(/Upload your first elephant/)).toBeInTheDocument();
  });
});

// ── EmptyCalls ──

describe("EmptyCalls", () => {
  it("renders calls-specific empty state", () => {
    render(<EmptyCalls />);
    expect(screen.getByText("No processed calls yet")).toBeInTheDocument();
    expect(screen.getByText(/Process a recording/)).toBeInTheDocument();
  });
});

// ── ErrorState ──

describe("ErrorState", () => {
  it("renders error message", () => {
    render(<ErrorState message="Network error" />);
    expect(screen.getByText("Error")).toBeInTheDocument();
    expect(screen.getByText("Network error")).toBeInTheDocument();
  });

  it("renders default message when none provided", () => {
    render(<ErrorState />);
    expect(screen.getByText("Something went wrong")).toBeInTheDocument();
  });

  it("renders retry button when onRetry is provided", () => {
    const onRetry = vi.fn();
    render(<ErrorState message="Failed" onRetry={onRetry} />);
    const btn = screen.getByText("Try again");
    expect(btn).toBeInTheDocument();
    fireEvent.click(btn);
    expect(onRetry).toHaveBeenCalledOnce();
  });

  it("does not render retry button when onRetry is not provided", () => {
    render(<ErrorState message="Fatal" />);
    expect(screen.queryByText("Try again")).not.toBeInTheDocument();
  });
});

// ── ProcessingError ──

describe("ProcessingError", () => {
  it("renders processing-specific error message", () => {
    render(<ProcessingError />);
    expect(screen.getByText(/Processing failed/)).toBeInTheDocument();
  });

  it("has retry button", () => {
    const onRetry = vi.fn();
    render(<ProcessingError onRetry={onRetry} />);
    fireEvent.click(screen.getByText("Try again"));
    expect(onRetry).toHaveBeenCalledOnce();
  });
});

// ── ConnectionLost ──

describe("ConnectionLost", () => {
  it("renders connection lost banner", () => {
    render(<ConnectionLost />);
    expect(screen.getByText("Connection lost")).toBeInTheDocument();
    expect(screen.getByText(/real-time updates paused/)).toBeInTheDocument();
  });

  it("has warning styling", () => {
    const { container } = render(<ConnectionLost />);
    const root = container.firstElementChild as HTMLElement;
    expect(root.className).toContain("border-warning");
  });
});

// ── Global Error Page ──

describe("GlobalError (error.tsx)", () => {
  it("renders error message and retry button", () => {
    const reset = vi.fn();
    render(<GlobalError error={new Error("test")} reset={reset} />);
    expect(screen.getByText("Something went wrong")).toBeInTheDocument();
    expect(screen.getByText("Try again")).toBeInTheDocument();
  });

  it("calls reset when retry is clicked", () => {
    const reset = vi.fn();
    render(<GlobalError error={new Error("test")} reset={reset} />);
    fireEvent.click(screen.getByText("Try again"));
    expect(reset).toHaveBeenCalledOnce();
  });
});

// ── Not Found Page ──

describe("NotFound (not-found.tsx)", () => {
  it("renders 404 page", () => {
    render(<NotFound />);
    expect(screen.getByText("404")).toBeInTheDocument();
    expect(screen.getByText("Page not found")).toBeInTheDocument();
  });

  it("has link back to home", () => {
    render(<NotFound />);
    const link = screen.getByText("Back to Home");
    expect(link).toBeInTheDocument();
    expect(link.closest("a")).toHaveAttribute("href", "/");
  });
});
