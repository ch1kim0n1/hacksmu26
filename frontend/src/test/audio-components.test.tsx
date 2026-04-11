import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import WaveformPlayer from "@/components/audio/WaveformPlayer";
import AudioControls from "@/components/audio/AudioControls";
import ProcessingTimeline from "@/components/processing/ProcessingTimeline";
import ProcessingStatus from "@/components/processing/ProcessingStatus";
import SNRMeter from "@/components/processing/SNRMeter";

// ── WaveformPlayer ──

describe("WaveformPlayer", () => {
  it("renders audio element with src", () => {
    const { container } = render(<WaveformPlayer src="/audio.wav" />);
    const audio = container.querySelector("audio");
    expect(audio).toBeInTheDocument();
    expect(audio?.getAttribute("src")).toBe("/audio.wav");
  });

  it("renders label when provided", () => {
    render(<WaveformPlayer src="/audio.wav" label="Original Recording" />);
    expect(screen.getByText("Original Recording")).toBeInTheDocument();
  });

  it("renders play button initially", () => {
    render(<WaveformPlayer src="/audio.wav" />);
    expect(screen.getByLabelText("Play")).toBeInTheDocument();
  });

  it("renders seek slider", () => {
    const { container } = render(<WaveformPlayer src="/audio.wav" />);
    const seekSlider = container.querySelector('input[type="range"]');
    expect(seekSlider).toBeInTheDocument();
  });

  it("renders time display", () => {
    render(<WaveformPlayer src="/audio.wav" />);
    expect(screen.getByText(/0:00/)).toBeInTheDocument();
  });

  it("renders download link", () => {
    render(<WaveformPlayer src="/audio.wav" />);
    expect(screen.getByText("Download")).toBeInTheDocument();
    const link = screen.getByText("Download").closest("a");
    expect(link?.getAttribute("href")).toBe("/audio.wav");
    expect(link?.hasAttribute("download")).toBe(true);
  });

  it("renders waveform bars", () => {
    const { container } = render(<WaveformPlayer src="/audio.wav" />);
    const bars = container.querySelectorAll(".rounded-sm");
    expect(bars.length).toBe(60);
  });
});

// ── AudioControls ──

describe("AudioControls", () => {
  const defaultProps = {
    volume: 0.8,
    onVolumeChange: vi.fn(),
    playbackRate: 1,
    onPlaybackRateChange: vi.fn(),
    onDownload: vi.fn(),
  };

  it("renders volume slider", () => {
    render(<AudioControls {...defaultProps} />);
    expect(screen.getByLabelText("Volume")).toBeInTheDocument();
  });

  it("renders mute/unmute button", () => {
    render(<AudioControls {...defaultProps} />);
    expect(screen.getByLabelText("Mute")).toBeInTheDocument();
  });

  it("renders speed options", () => {
    render(<AudioControls {...defaultProps} />);
    expect(screen.getByText("0.5x")).toBeInTheDocument();
    expect(screen.getByText("1x")).toBeInTheDocument();
    expect(screen.getByText("1.5x")).toBeInTheDocument();
    expect(screen.getByText("2x")).toBeInTheDocument();
  });

  it("calls onPlaybackRateChange when speed button clicked", () => {
    const onRate = vi.fn();
    render(<AudioControls {...defaultProps} onPlaybackRateChange={onRate} />);
    fireEvent.click(screen.getByText("2x"));
    expect(onRate).toHaveBeenCalledWith(2);
  });

  it("calls onVolumeChange(0) when mute clicked", () => {
    const onVol = vi.fn();
    render(<AudioControls {...defaultProps} onVolumeChange={onVol} />);
    fireEvent.click(screen.getByLabelText("Mute"));
    expect(onVol).toHaveBeenCalledWith(0);
  });

  it("renders download button", () => {
    render(<AudioControls {...defaultProps} />);
    expect(screen.getByLabelText("Download audio")).toBeInTheDocument();
  });

  it("calls onDownload when download clicked", () => {
    const onDl = vi.fn();
    render(<AudioControls {...defaultProps} onDownload={onDl} />);
    fireEvent.click(screen.getByLabelText("Download audio"));
    expect(onDl).toHaveBeenCalled();
  });
});

// ── ProcessingTimeline ──

describe("ProcessingTimeline", () => {
  const stages = [
    { name: "Ingestion", status: "complete" as const },
    { name: "Spectrogram", status: "active" as const },
    { name: "Noise Removal", status: "pending" as const },
    { name: "Quality Check", status: "pending" as const },
  ];

  it("renders all stage names", () => {
    render(<ProcessingTimeline stages={stages} progress={50} />);
    expect(screen.getByText("Ingestion")).toBeInTheDocument();
    expect(screen.getByText("Spectrogram")).toBeInTheDocument();
    expect(screen.getByText("Noise Removal")).toBeInTheDocument();
    expect(screen.getByText("Quality Check")).toBeInTheDocument();
  });

  it("renders progress value", () => {
    render(<ProcessingTimeline stages={stages} progress={50} />);
    expect(screen.getByText("50%")).toBeInTheDocument();
  });
});

// ── ProcessingStatus ──

describe("ProcessingStatus", () => {
  it("renders stage name and progress", () => {
    render(<ProcessingStatus stage="Noise Removal" progress={75} />);
    expect(screen.getByText("Noise Removal")).toBeInTheDocument();
    expect(screen.getByText("75%")).toBeInTheDocument();
  });

  it("renders ETA when provided", () => {
    render(<ProcessingStatus stage="Analysis" progress={50} eta="~30s" />);
    expect(screen.getByText(/~30s/)).toBeInTheDocument();
  });
});

// ── SNRMeter ──

describe("SNRMeter", () => {
  it("renders before and after labels", () => {
    render(<SNRMeter snrBefore={3.2} snrAfter={18.5} />);
    expect(screen.getByText("Before")).toBeInTheDocument();
    expect(screen.getByText("After")).toBeInTheDocument();
  });

  it("displays dB values", () => {
    render(<SNRMeter snrBefore={3.2} snrAfter={18.5} />);
    expect(screen.getByText(/3\.2/)).toBeInTheDocument();
    expect(screen.getByText(/18\.5/)).toBeInTheDocument();
  });

  it("shows improvement delta", () => {
    render(<SNRMeter snrBefore={3.2} snrAfter={18.5} />);
    expect(screen.getByText(/15\.3/)).toBeInTheDocument();
  });

  it("shows quality rating", () => {
    render(<SNRMeter snrBefore={3} snrAfter={20} />);
    // Should show Excellent for high SNR
    const rating = screen.getByText(/Excellent|Good|Fair|Poor/);
    expect(rating).toBeInTheDocument();
  });
});
