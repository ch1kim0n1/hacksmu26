import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";

vi.mock("framer-motion", () => ({
  motion: {
    div: ({ children, ...props }: React.HTMLAttributes<HTMLDivElement> & { children?: React.ReactNode }) => (
      <div {...props}>{children}</div>
    ),
  },
  AnimatePresence: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));

import ShortcutHelp from "@/components/layout/ShortcutHelp";

describe("ShortcutHelp", () => {
  it("renders all shortcut entries when visible", () => {
    render(<ShortcutHelp isOpen={true} onClose={() => {}} />);

    // Key labels
    expect(screen.getByText("Space")).toBeInTheDocument();
    expect(screen.getByText("→")).toBeInTheDocument();
    expect(screen.getByText("←")).toBeInTheDocument();
    expect(screen.getByText("A")).toBeInTheDocument();
    expect(screen.getByText("Esc")).toBeInTheDocument();
    expect(screen.getByText("?")).toBeInTheDocument();
  });

  it("renders action descriptions", () => {
    render(<ShortcutHelp isOpen={true} onClose={() => {}} />);

    expect(screen.getByText(/Play \/ pause/i)).toBeInTheDocument();
    expect(screen.getByText(/Next call/i)).toBeInTheDocument();
    expect(screen.getByText(/Previous call/i)).toBeInTheDocument();
    expect(screen.getByText(/Deselect/i)).toBeInTheDocument();
    expect(screen.getByText(/Toggle shortcuts overlay/i)).toBeInTheDocument();
  });

  it("renders number key shortcuts 1–5 with call type labels", () => {
    render(<ShortcutHelp isOpen={true} onClose={() => {}} />);

    expect(screen.getByText("1")).toBeInTheDocument();
    expect(screen.getByText("2")).toBeInTheDocument();
    expect(screen.getByText("3")).toBeInTheDocument();
    expect(screen.getByText("4")).toBeInTheDocument();
    expect(screen.getByText("5")).toBeInTheDocument();
  });

  it("calls onClose when backdrop is clicked", () => {
    const onClose = vi.fn();
    render(<ShortcutHelp isOpen={true} onClose={onClose} />);

    const backdrop = screen.getByTestId("shortcut-help-backdrop");
    fireEvent.click(backdrop);
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("calls onClose when Esc is pressed", () => {
    const onClose = vi.fn();
    render(<ShortcutHelp isOpen={true} onClose={onClose} />);

    fireEvent.keyDown(document, { key: "Escape" });
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("does not render content when isOpen=false", () => {
    render(<ShortcutHelp isOpen={false} onClose={() => {}} />);
    expect(screen.queryByText("Space")).not.toBeInTheDocument();
  });

  it("clicking the panel itself does not close the overlay", () => {
    const onClose = vi.fn();
    render(<ShortcutHelp isOpen={true} onClose={onClose} />);

    const panel = screen.getByTestId("shortcut-help-panel");
    fireEvent.click(panel);
    expect(onClose).not.toHaveBeenCalled();
  });
});
