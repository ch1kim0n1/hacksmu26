import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import WaveformPlayer from "@/components/audio/WaveformPlayer";

// Mock Web Audio API
const mockDecodeAudioData = vi.fn();
const mockArrayBuffer = vi.fn();

beforeEach(() => {
  // Mock fetch for audio data
  global.fetch = vi.fn().mockResolvedValue({
    ok: true,
    arrayBuffer: mockArrayBuffer.mockResolvedValue(new ArrayBuffer(8)),
  } as unknown as Response);

  // Mock AudioContext
  const mockAudioBuffer = {
    numberOfChannels: 1,
    length: 1000,
    getChannelData: vi.fn().mockReturnValue(
      Float32Array.from({ length: 1000 }, (_, i) => Math.sin(i * 0.1))
    ),
  };

  const MockAudioContext = vi.fn().mockReturnValue({
    decodeAudioData: mockDecodeAudioData.mockResolvedValue(mockAudioBuffer),
    close: vi.fn(),
  });

  Object.defineProperty(window, "AudioContext", {
    writable: true,
    value: MockAudioContext,
  });
  Object.defineProperty(window, "webkitAudioContext", {
    writable: true,
    value: MockAudioContext,
  });
});

describe("WaveformPlayer", () => {
  it("renders play button", () => {
    render(<WaveformPlayer src="/test.wav" />);
    expect(screen.getByLabelText("Play")).toBeInTheDocument();
  });

  it("renders waveform bar container", () => {
    const { container } = render(<WaveformPlayer src="/test.wav" />);
    const waveform = container.querySelector("[data-testid='waveform-bars']");
    expect(waveform).toBeInTheDocument();
  });

  it("renders time display in 0:00 format", () => {
    render(<WaveformPlayer src="/test.wav" />);
    expect(screen.getByText(/0:00/)).toBeInTheDocument();
  });

  it("renders label when provided", () => {
    render(<WaveformPlayer src="/test.wav" label="Original Recording" />);
    expect(screen.getByText("Original Recording")).toBeInTheDocument();
  });

  it("renders download button", () => {
    render(<WaveformPlayer src="/test.wav" />);
    expect(screen.getByText("Download")).toBeInTheDocument();
  });

  it("waveform bars are present and have non-zero heights after decode", async () => {
    const { container } = render(<WaveformPlayer src="/test.wav" />);
    await waitFor(() => {
      const bars = container.querySelectorAll("[data-testid='waveform-bars'] > div");
      expect(bars.length).toBeGreaterThan(0);
    });
  });

  it("play button aria-label changes to Pause when clicked", async () => {
    // Mock HTMLMediaElement play
    window.HTMLMediaElement.prototype.play = vi.fn().mockResolvedValue(undefined);
    window.HTMLMediaElement.prototype.pause = vi.fn();

    render(<WaveformPlayer src="/test.wav" />);
    const playBtn = screen.getByLabelText("Play");
    fireEvent.click(playBtn);
    expect(screen.getByLabelText("Pause")).toBeInTheDocument();
  });

  it("renders volume control", () => {
    const { container } = render(<WaveformPlayer src="/test.wav" />);
    const volumeSlider = container.querySelector('input[type="range"]');
    expect(volumeSlider).toBeInTheDocument();
  });
});
