import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";

// Mock next/image to render a plain <img> so we can simulate onError
vi.mock("next/image", () => ({
  default: ({ onError, fill, ...props }: Record<string, unknown>) => (
    // eslint-disable-next-line jsx-a11y/alt-text, @next/next/no-img-element
    <img
      data-fill={fill ? "true" : undefined}
      {...props}
      onError={onError as React.ReactEventHandler<HTMLImageElement>}
    />
  ),
}));

import { SpectrogramImage } from "@/components/spectrogram/SpectrogramImage";

describe("SpectrogramImage", () => {
  it("renders an image when no error occurs", () => {
    render(
      <SpectrogramImage
        src="/api/recordings/123/spectrogram"
        alt="Test spectrogram"
        width={800}
        height={400}
      />
    );
    const img = screen.getByAltText("Test spectrogram");
    expect(img).toBeInTheDocument();
    expect(img.tagName).toBe("IMG");
  });

  it("shows fallback placeholder after image error", () => {
    render(
      <SpectrogramImage
        src="/api/recordings/bad/spectrogram"
        alt="Broken spectrogram"
        width={800}
        height={400}
      />
    );
    const img = screen.getByAltText("Broken spectrogram");
    fireEvent.error(img);

    expect(screen.queryByAltText("Broken spectrogram")).not.toBeInTheDocument();
    expect(screen.getByText("Spectrogram unavailable")).toBeInTheDocument();
  });

  it("shows custom fallback text", () => {
    render(
      <SpectrogramImage
        src="/api/recordings/bad/spectrogram"
        alt="Custom fallback"
        width={800}
        height={400}
        fallbackText="Image failed to load"
      />
    );
    const img = screen.getByAltText("Custom fallback");
    fireEvent.error(img);

    expect(screen.getByText("Image failed to load")).toBeInTheDocument();
  });

  it("applies className to both image and fallback", () => {
    const { container, rerender } = render(
      <SpectrogramImage
        src="/api/recordings/123/spectrogram"
        alt="Styled"
        width={800}
        height={400}
        className="rounded-lg border"
      />
    );
    const img = screen.getByAltText("Styled");
    expect(img).toHaveClass("rounded-lg", "border");

    // Trigger error to show fallback
    fireEvent.error(img);

    // Re-query — the fallback div should have the className
    rerender(
      <SpectrogramImage
        src="/api/recordings/123/spectrogram"
        alt="Styled"
        width={800}
        height={400}
        className="rounded-lg border"
      />
    );
    const fallback = container.querySelector(".rounded-lg.border");
    expect(fallback).toBeInTheDocument();
  });

  it("sets absolute positioning on fallback when fill prop is true", () => {
    render(
      <SpectrogramImage
        src="/api/recordings/bad/spectrogram"
        alt="Fill mode"
        fill
      />
    );
    const img = screen.getByAltText("Fill mode");
    fireEvent.error(img);

    const fallback = screen.getByText("Spectrogram unavailable").closest("div[style]");
    expect(fallback).toHaveStyle({ position: "absolute", inset: "0" });
  });

  it("does not set absolute positioning on fallback without fill prop", () => {
    render(
      <SpectrogramImage
        src="/api/recordings/bad/spectrogram"
        alt="No fill"
        width={800}
        height={400}
      />
    );
    const img = screen.getByAltText("No fill");
    fireEvent.error(img);

    const fallbackText = screen.getByText("Spectrogram unavailable");
    const outerDiv = fallbackText.closest(".flex.items-center.justify-center");
    expect(outerDiv).not.toHaveAttribute("style");
  });

  it("renders the broken-image SVG icon in fallback", () => {
    const { container } = render(
      <SpectrogramImage
        src="/api/recordings/bad/spectrogram"
        alt="SVG check"
        width={800}
        height={400}
      />
    );
    fireEvent.error(screen.getByAltText("SVG check"));

    const svg = container.querySelector("svg");
    expect(svg).toBeInTheDocument();
  });
});
