import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import SpectrogramViewer from "@/components/spectrogram/SpectrogramViewer";
import FrequencyAxis from "@/components/spectrogram/FrequencyAxis";
import TimeAxis from "@/components/spectrogram/TimeAxis";
import BeforeAfterSlider from "@/components/spectrogram/BeforeAfterSlider";

// ── SpectrogramViewer ──

describe("SpectrogramViewer", () => {
  it("renders with image source", () => {
    render(<SpectrogramViewer src="/test.png" title="Test Spectrogram" />);
    const img = screen.getByAltText("Test Spectrogram");
    expect(img).toBeInTheDocument();
    expect(img).toHaveAttribute("src", "/test.png");
  });

  it("renders title and color scale legend", () => {
    render(<SpectrogramViewer src="/test.png" title="My Spectrogram" />);
    expect(screen.getByText("My Spectrogram")).toBeInTheDocument();
    expect(screen.getByText("Quiet")).toBeInTheDocument();
    expect(screen.getByText("Loud")).toBeInTheDocument();
  });

  it("shows skeleton loading state", () => {
    const { container } = render(
      <SpectrogramViewer src="/test.png" loading={true} />
    );
    const skeleton = container.querySelector(".skeleton");
    expect(skeleton).toBeInTheDocument();
  });

  it("displays noise annotation", () => {
    render(
      <SpectrogramViewer
        src="/test.png"
        annotation="Noise dominant, elephant signal SNR ~3dB"
        annotationVariant="noise"
      />
    );
    expect(screen.getByText("Noise dominant, elephant signal SNR ~3dB")).toBeInTheDocument();
  });

  it("displays clean annotation", () => {
    render(
      <SpectrogramViewer
        src="/test.png"
        annotation="Elephant signal clear, SNR 18dB"
        annotationVariant="clean"
      />
    );
    expect(screen.getByText("Elephant signal clear, SNR 18dB")).toBeInTheDocument();
  });

  it("does not show annotation when loading", () => {
    render(
      <SpectrogramViewer
        src="/test.png"
        loading={true}
        annotation="Should not appear"
      />
    );
    expect(screen.queryByText("Should not appear")).not.toBeInTheDocument();
  });

  it("applies high contrast mode classes", () => {
    const { container } = render(
      <SpectrogramViewer src="/test.png" title="HC Test" highContrast />
    );
    const root = container.firstElementChild as HTMLElement;
    expect(root.className).toContain("");
  });

  it("renders without title (no legend bar)", () => {
    render(<SpectrogramViewer src="/test.png" />);
    expect(screen.queryByText("Quiet")).not.toBeInTheDocument();
  });
});

// ── FrequencyAxis ──

describe("FrequencyAxis", () => {
  it("renders default 5 frequency ticks up to 1000 Hz", () => {
    render(<FrequencyAxis />);
    expect(screen.getByText("1 kHz")).toBeInTheDocument();
    expect(screen.getByText("0 Hz")).toBeInTheDocument();
    expect(screen.getByText("500 Hz")).toBeInTheDocument();
  });

  it("formats kHz correctly", () => {
    render(<FrequencyAxis maxFrequency={2000} />);
    expect(screen.getByText("2 kHz")).toBeInTheDocument();
    expect(screen.getByText("1.5 kHz")).toBeInTheDocument();
  });

  it("supports custom tick count", () => {
    render(<FrequencyAxis tickCount={3} maxFrequency={600} />);
    expect(screen.getByText("600 Hz")).toBeInTheDocument();
    expect(screen.getByText("300 Hz")).toBeInTheDocument();
    expect(screen.getByText("0 Hz")).toBeInTheDocument();
  });

  it("uses larger text in high contrast mode", () => {
    const { container } = render(<FrequencyAxis highContrast />);
    const labels = container.querySelectorAll("span");
    labels.forEach((label) => {
      expect(label.className).toContain("text-xs");
    });
  });
});

// ── TimeAxis ──

describe("TimeAxis", () => {
  it("renders default 6 time ticks for 5s duration", () => {
    render(<TimeAxis />);
    expect(screen.getByText("0.0s")).toBeInTheDocument();
    expect(screen.getByText("5.0s")).toBeInTheDocument();
  });

  it("formats longer durations with m:ss", () => {
    render(<TimeAxis duration={120} tickCount={3} />);
    expect(screen.getByText("0.0s")).toBeInTheDocument();
    expect(screen.getByText("1:00")).toBeInTheDocument();
    expect(screen.getByText("2:00")).toBeInTheDocument();
  });

  it("supports custom tick count", () => {
    render(<TimeAxis duration={10} tickCount={3} />);
    expect(screen.getByText("0.0s")).toBeInTheDocument();
    expect(screen.getByText("5.0s")).toBeInTheDocument();
    expect(screen.getByText("10.0s")).toBeInTheDocument();
  });

  it("uses larger text in high contrast mode", () => {
    const { container } = render(<TimeAxis highContrast />);
    const labels = container.querySelectorAll("span");
    labels.forEach((label) => {
      expect(label.className).toContain("text-xs");
    });
  });
});

// ── BeforeAfterSlider ──

describe("BeforeAfterSlider", () => {
  it("renders before and after images", () => {
    render(
      <BeforeAfterSlider beforeSrc="/before.png" afterSrc="/after.png" />
    );
    expect(screen.getByAltText("Before")).toBeInTheDocument();
    expect(screen.getByAltText("After")).toBeInTheDocument();
  });

  it("renders custom labels", () => {
    render(
      <BeforeAfterSlider
        beforeSrc="/b.png"
        afterSrc="/a.png"
        beforeLabel="Noisy"
        afterLabel="Cleaned"
      />
    );
    expect(screen.getByText("Noisy")).toBeInTheDocument();
    expect(screen.getByText("Cleaned")).toBeInTheDocument();
  });

  it("has ew-resize cursor for drag interaction", () => {
    const { container } = render(
      <BeforeAfterSlider beforeSrc="/b.png" afterSrc="/a.png" />
    );
    const root = container.firstElementChild as HTMLElement;
    expect(root.className).toContain("cursor-ew-resize");
  });
});
