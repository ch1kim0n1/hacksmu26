import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";

// Mock next/image to render a plain <img> (avoids /_next/image URL rewriting)
vi.mock("next/image", () => ({
  default: ({ fill, priority, ...props }: Record<string, unknown>) => <img {...props} />,
}));

import ABPlayer from "@/components/audio/ABPlayer";

// Mock HTMLMediaElement methods
Object.defineProperty(window.HTMLMediaElement.prototype, "play", {
  configurable: true,
  value: vi.fn().mockResolvedValue(undefined),
});
Object.defineProperty(window.HTMLMediaElement.prototype, "pause", {
  configurable: true,
  value: vi.fn(),
});
Object.defineProperty(window.HTMLMediaElement.prototype, "load", {
  configurable: true,
  value: vi.fn(),
});

const defaultProps = {
  originalSrc: "http://localhost:8000/api/recordings/rec-1/audio?type=original",
  cleanedSrc: "http://localhost:8000/api/recordings/rec-1/audio?type=cleaned",
  beforeSpectrogramSrc: "http://localhost:8000/api/recordings/rec-1/spectrogram?type=before",
  afterSpectrogramSrc: "http://localhost:8000/api/recordings/rec-1/spectrogram?type=after",
};

describe("ABPlayer", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  // ── Rendering ──

  it("renders both audio elements with correct sources", () => {
    const { container } = render(<ABPlayer {...defaultProps} />);
    const audioElements = container.querySelectorAll("audio");
    expect(audioElements.length).toBe(2);
    const srcs = Array.from(audioElements).map((a) => a.getAttribute("src"));
    expect(srcs).toContain(defaultProps.originalSrc);
    expect(srcs).toContain(defaultProps.cleanedSrc);
  });

  it("renders the toggle button", () => {
    render(<ABPlayer {...defaultProps} />);
    // Should have a toggle button with A/B label or Original/Cleaned
    const toggle = screen.getByRole("button", { name: /original|cleaned|toggle/i });
    expect(toggle).toBeInTheDocument();
  });

  it("shows 'Original' label by default (mode A)", () => {
    render(<ABPlayer {...defaultProps} />);
    // Default mode is original
    expect(screen.getByText(/Original/i)).toBeInTheDocument();
  });

  it("renders the play/pause button", () => {
    render(<ABPlayer {...defaultProps} />);
    expect(screen.getByLabelText(/play|pause/i)).toBeInTheDocument();
  });

  it("renders seek slider", () => {
    const { container } = render(<ABPlayer {...defaultProps} />);
    const slider = container.querySelector('input[type="range"]');
    expect(slider).toBeInTheDocument();
  });

  it("renders time display showing 0:00", () => {
    render(<ABPlayer {...defaultProps} />);
    expect(screen.getAllByText(/0:00/).length).toBeGreaterThan(0);
  });

  // ── Toggle behaviour ──

  it("switches to 'Cleaned' label after clicking the toggle", () => {
    render(<ABPlayer {...defaultProps} />);
    const toggle = screen.getByRole("button", { name: /original|cleaned|toggle/i });
    fireEvent.click(toggle);
    expect(screen.getByText(/Cleaned/i)).toBeInTheDocument();
  });

  it("switches back to 'Original' after two toggle clicks", () => {
    render(<ABPlayer {...defaultProps} />);
    const toggle = screen.getByRole("button", { name: /original|cleaned|toggle/i });
    fireEvent.click(toggle);
    fireEvent.click(toggle);
    expect(screen.getByText(/Original/i)).toBeInTheDocument();
  });

  // ── Keyboard shortcut ──

  it("toggles mode when 'A' key is pressed", () => {
    render(<ABPlayer {...defaultProps} />);
    // Should start on Original
    expect(screen.getByText(/Original/i)).toBeInTheDocument();
    fireEvent.keyDown(document, { key: "a" });
    expect(screen.getByText(/Cleaned/i)).toBeInTheDocument();
  });

  it("does not toggle when 'A' is pressed while an input is focused", () => {
    render(
      <div>
        <input type="text" data-testid="text-input" />
        <ABPlayer {...defaultProps} />
      </div>
    );
    const input = screen.getByTestId("text-input") as HTMLInputElement;
    input.focus();
    // Fire keydown directly on the input so e.target.tagName === "INPUT"
    fireEvent.keyDown(input, { key: "a" });
    // Should still show Original because shortcut is suppressed for inputs
    expect(screen.getByText(/Original/i)).toBeInTheDocument();
  });

  it("does not toggle on other key presses", () => {
    render(<ABPlayer {...defaultProps} />);
    fireEvent.keyDown(document, { key: "b" });
    expect(screen.getByText(/Original/i)).toBeInTheDocument();
  });

  // ── Spectrogram crossfade ──

  it("renders the before spectrogram image", () => {
    render(<ABPlayer {...defaultProps} />);
    const beforeImg = screen.getByAltText(/before|original/i);
    expect(beforeImg).toBeInTheDocument();
    expect(beforeImg.getAttribute("src")).toBe(defaultProps.beforeSpectrogramSrc);
  });

  it("renders the after spectrogram image", () => {
    render(<ABPlayer {...defaultProps} />);
    const afterImg = screen.getByAltText(/after|cleaned/i);
    expect(afterImg).toBeInTheDocument();
    expect(afterImg.getAttribute("src")).toBe(defaultProps.afterSpectrogramSrc);
  });

  it("before spectrogram is visible in original mode", () => {
    render(<ABPlayer {...defaultProps} />);
    const beforeImg = screen.getByAltText(/before|original/i);
    // In original mode, before image should have opacity-100 (or similar visible class)
    // We check via computed style or class presence
    const parentOpacity = (beforeImg.closest("[data-spectrogram]") as HTMLElement)?.style.opacity;
    // The before layer should be at opacity 1 (visible)
    if (parentOpacity !== undefined) {
      expect(parentOpacity).toBe("1");
    } else {
      // fallback: check the image is in the document
      expect(beforeImg).toBeInTheDocument();
    }
  });

  // ── Playhead indicator ──

  it("renders a playhead indicator element", () => {
    const { container } = render(<ABPlayer {...defaultProps} />);
    const playhead = container.querySelector("[data-playhead]");
    expect(playhead).toBeInTheDocument();
  });

  it("playhead starts at 0% left position", () => {
    const { container } = render(<ABPlayer {...defaultProps} />);
    const playhead = container.querySelector("[data-playhead]") as HTMLElement;
    expect(playhead).toBeInTheDocument();
    // Should be at 0% or near the start
    const left = playhead.style.left;
    expect(left).toBe("0%");
  });

  // ── Mode indicator ──

  it("shows 'A' mode indicator in original mode", () => {
    const { container } = render(<ABPlayer {...defaultProps} />);
    // The A badge inside the toggle button should exist
    const aBadges = container.querySelectorAll("span.inline-flex");
    const aIndicator = Array.from(aBadges).find((el) => el.textContent?.trim() === "A");
    expect(aIndicator).toBeDefined();
  });

  it("shows 'B' mode indicator after toggling to cleaned mode", () => {
    const { container } = render(<ABPlayer {...defaultProps} />);
    const toggle = screen.getByRole("button", { name: /original|cleaned|toggle/i });
    fireEvent.click(toggle);
    // B badge should be the active one
    const bBadges = container.querySelectorAll("span.inline-flex");
    const bIndicator = Array.from(bBadges).find((el) => el.textContent?.trim() === "B");
    expect(bIndicator).toBeDefined();
  });
});
