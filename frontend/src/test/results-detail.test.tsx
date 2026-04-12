import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";

// Mock next/navigation
vi.mock("next/navigation", () => ({
  useParams: () => ({ id: "test-recording-id" }),
  useRouter: () => ({ push: vi.fn(), back: vi.fn() }),
}));

// Mock audio-api
vi.mock("@/lib/audio-api", () => ({
  API_BASE: "http://localhost:8000",
  getCall: vi.fn(),
  getRecording: vi.fn().mockResolvedValue({
    id: "test-recording-id",
    filename: "elephant_rumble.wav",
    status: "complete",
    duration: 13.2,
    sample_rate: 44100,
    result: {
      calls: [
        {
          id: "call-1",
          call_type: "rumble",
          start_ms: 1000,
          end_ms: 3500,
          confidence: 0.92,
          frequency_hz: 18,
        },
      ],
      quality: {
        snr_before_db: 8.2,
        snr_after_db: 22.4,
        quality_score: 87,
        snr_improvement_db: 14.2,
      },
      speaker_separation: {
        speaker_count: 1,
        speakers: [
          {
            id: "speaker_1",
            fundamental_hz: 18,
            harmonic_count: 8,
            energy_ratio: 1,
            duration_s: 13.2,
          },
        ],
      },
    },
  }),
  getCallHarmonics: vi.fn().mockResolvedValue({
    fundamental_hz: 18,
    harmonics: [],
    total_harmonics_detected: 0,
  }),
  getRecordingSpeakers: vi.fn().mockResolvedValue({
    speaker_count: 1,
    speakers: [
      {
        id: "speaker_1",
        fundamental_hz: 18,
        harmonic_count: 8,
        energy_ratio: 1,
        duration_s: 13.2,
      },
    ],
  }),
  getSpeakerAudioUrl: vi.fn(
    (recordingId: string, speakerId: string) =>
      `http://localhost:8000/api/recordings/${recordingId}/speakers/${speakerId}/download`,
  ),
}));

// Lazy import to let mocks settle
const getResultsDetailPage = () =>
  import("@/app/results/[id]/page").then((m) => m.default);

describe("Results detail page /results/[id]", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("renders the recording filename as the page title", async () => {
    const ResultsDetailPage = await getResultsDetailPage();
    render(<ResultsDetailPage />);
    await waitFor(() => {
      const matches = screen.getAllByText(/elephant_rumble\.wav/i);
      expect(matches.length).toBeGreaterThan(0);
    });
  });

  it("renders Before and Cleaned spectrogram sections", async () => {
    const ResultsDetailPage = await getResultsDetailPage();
    render(<ResultsDetailPage />);
    await waitFor(() => {
      expect(screen.getByAltText(/original spectrogram/i)).toBeInTheDocument();
      expect(screen.getByAltText(/cleaned spectrogram/i)).toBeInTheDocument();
    });
  });

  it("renders audio waveform players for original and cleaned audio", async () => {
    const ResultsDetailPage = await getResultsDetailPage();
    render(<ResultsDetailPage />);
    await waitFor(() => {
      expect(screen.getByText(/original recording/i)).toBeInTheDocument();
      expect(screen.getByText(/cleaned audio/i)).toBeInTheDocument();
    });
  });

  it("renders detected call type from result", async () => {
    const ResultsDetailPage = await getResultsDetailPage();
    render(<ResultsDetailPage />);
    await waitFor(() => {
      const matches = screen.getAllByText(/rumble/i);
      expect(matches.length).toBeGreaterThan(0);
    });
  });

  it("renders SNR quality metrics", async () => {
    const ResultsDetailPage = await getResultsDetailPage();
    render(<ResultsDetailPage />);
    await waitFor(() => {
      expect(screen.getByText(/8\.2/)).toBeInTheDocument();  // snr_before
      expect(screen.getByText(/22\.4/)).toBeInTheDocument(); // snr_after
    });
  });

  it("renders a back/breadcrumb navigation link", async () => {
    const ResultsDetailPage = await getResultsDetailPage();
    render(<ResultsDetailPage />);
    await waitFor(() => {
      const backLink = screen.getByRole("link", { name: /results|back/i });
      expect(backLink).toBeInTheDocument();
    });
  });

  it("renders export data link", async () => {
    const ResultsDetailPage = await getResultsDetailPage();
    render(<ResultsDetailPage />);
    await waitFor(() => {
      expect(screen.getByText(/export/i)).toBeInTheDocument();
    });
  });
});
