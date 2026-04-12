/**
 * Tests for the LiveRecorderPage (/record).
 *
 * Coverage:
 *   - Mic permission request (getUserMedia called with { audio: true })
 *   - Record / Stop button state transitions
 *   - WebSocket CHUNK_PROCESSED handling (noise badge, SNR display)
 *   - Waveform and spectrogram canvas elements are present
 *   - Redirect to /processing/{recording_id} on RECORDING_COMPLETE
 */

import React from "react";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, waitFor, act } from "@testing-library/react";

// ── hoisted values (available inside vi.mock factories) ──────────────────────
const mockPush = vi.hoisted(() => vi.fn());

// ── module mocks ─────────────────────────────────────────────────────────────

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: mockPush }),
}));

vi.mock("next/link", () => ({
  default: ({
    children,
    href,
    ...rest
  }: {
    children: React.ReactNode;
    href: string;
    [k: string]: unknown;
  }) => (
    <a href={href} {...rest}>
      {children}
    </a>
  ),
}));

// ── import component AFTER mocks ─────────────────────────────────────────────
import LiveRecorderPage from "@/app/record/page";

// ── MockWebSocket ────────────────────────────────────────────────────────────

class MockWebSocket {
  static CONNECTING = 0;
  static OPEN = 1;
  static CLOSING = 2;
  static CLOSED = 3;
  static instances: MockWebSocket[] = [];

  url: string;
  readyState = 0;
  onopen: ((e: Event) => void) | null = null;
  onclose: ((e: CloseEvent) => void) | null = null;
  onmessage: ((e: MessageEvent) => void) | null = null;
  onerror: ((e: Event) => void) | null = null;
  send = vi.fn();
  close = vi.fn();

  constructor(url: string) {
    this.url = url;
    MockWebSocket.instances.push(this);
  }

  simulateOpen() {
    this.readyState = 1;
    this.onopen?.(new Event("open"));
  }

  simulateMessage(data: Record<string, unknown>) {
    this.onmessage?.(
      new MessageEvent("message", { data: JSON.stringify(data) })
    );
  }

  static reset() {
    MockWebSocket.instances = [];
  }
}

// ── MockAudioContext and friends ─────────────────────────────────────────────

const makeMockAnalyser = () => ({
  fftSize: 2048,
  frequencyBinCount: 1024,
  connect: vi.fn(),
  disconnect: vi.fn(),
  getFloatTimeDomainData: vi.fn((arr: Float32Array) => arr.fill(0)),
});

const makeMockScriptProcessor = () => ({
  connect: vi.fn(),
  disconnect: vi.fn(),
  onaudioprocess: null as ((e: AudioProcessingEvent) => void) | null,
});

const makeMockSource = () => ({
  connect: vi.fn(),
  disconnect: vi.fn(),
  start: vi.fn(),
  stop: vi.fn(),
  buffer: null as AudioBuffer | null,
});

class MockAudioContext {
  static instances: MockAudioContext[] = [];

  sampleRate = 44100;
  currentTime = 0;
  state: AudioContextState = "running";
  destination = { connect: vi.fn() };
  audioWorklet = {
    addModule: vi.fn().mockResolvedValue(undefined as void),
  };

  _analyser = makeMockAnalyser();
  _processor = makeMockScriptProcessor();

  constructor(_options?: AudioContextOptions) {
    MockAudioContext.instances.push(this);
  }

  createAnalyser() {
    return this._analyser;
  }
  createScriptProcessor(_bufferSize: number) {
    return this._processor;
  }
  createMediaStreamSource(_stream: MediaStream) {
    return makeMockSource();
  }
  createBufferSource() {
    return makeMockSource();
  }
  createBuffer(_channels: number, length: number, _sr: number) {
    return { getChannelData: vi.fn(() => new Float32Array(length)) };
  }
  close = vi.fn().mockResolvedValue(undefined as void);

  static reset() {
    MockAudioContext.instances = [];
  }
}

// ── Canvas 2D context mock ───────────────────────────────────────────────────

const mockCtx2d = {
  clearRect: vi.fn(),
  fillRect: vi.fn(),
  beginPath: vi.fn(),
  moveTo: vi.fn(),
  lineTo: vi.fn(),
  stroke: vi.fn(),
  save: vi.fn(),
  restore: vi.fn(),
  drawImage: vi.fn(),
  getImageData: vi.fn(() => ({
    data: new Uint8ClampedArray(4),
    width: 1,
    height: 1,
  })),
  putImageData: vi.fn(),
  scale: vi.fn(),
  translate: vi.fn(),
  fillStyle: "" as string | CanvasGradient | CanvasPattern,
  strokeStyle: "" as string | CanvasGradient | CanvasPattern,
  lineWidth: 1,
  canvas: { width: 800, height: 128 },
};

// ── fake base64 PCM helper ────────────────────────────────────────────────────

/** Build a fake base64 string of N float32 samples (all zero). */
function fakeB64(samples: number): string {
  const bytes = new Uint8Array(samples * 4);
  // Build base64 manually compatible with atob in jsdom
  return btoa(String.fromCharCode(...bytes));
}

// ── setup / teardown ─────────────────────────────────────────────────────────

describe("LiveRecorderPage", () => {
  let getUserMediaMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    MockWebSocket.reset();
    MockAudioContext.reset();
    mockPush.mockClear();

    // Canvas getContext → return mock 2D context
    vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue(
      mockCtx2d as unknown as CanvasRenderingContext2D
    );

    // crypto.randomUUID → deterministic in tests
    vi.stubGlobal("crypto", {
      randomUUID: vi.fn().mockReturnValue("test-session-uuid"),
    });

    // WebSocket
    vi.stubGlobal("WebSocket", MockWebSocket);

    // AudioContext
    vi.stubGlobal("AudioContext", MockAudioContext);

    // navigator.mediaDevices.getUserMedia
    const mockStream: Partial<MediaStream> = {
      getTracks: vi
        .fn()
        .mockReturnValue([{ stop: vi.fn(), kind: "audio" as MediaStreamTrackKind }]),
      getAudioTracks: vi.fn().mockReturnValue([{ stop: vi.fn() }]),
    };
    getUserMediaMock = vi.fn().mockResolvedValue(mockStream as MediaStream);
    Object.defineProperty(navigator, "mediaDevices", {
      configurable: true,
      value: { getUserMedia: getUserMediaMock },
    });

    // requestAnimationFrame / cancelAnimationFrame (do nothing in tests)
    vi.stubGlobal("requestAnimationFrame", vi.fn().mockReturnValue(1));
    vi.stubGlobal("cancelAnimationFrame", vi.fn());

    // URL.createObjectURL / revokeObjectURL
    vi.stubGlobal("URL", {
      ...URL,
      createObjectURL: vi.fn().mockReturnValue("blob:fake-url"),
      revokeObjectURL: vi.fn(),
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  // ── Helper: advance async pipeline to "recording" state ──────────────────

  async function startSession() {
    render(<LiveRecorderPage />);
    fireEvent.click(screen.getByRole("button", { name: /start recording/i }));

    // Wait for WebSocket to be created (async after getUserMedia + AudioContext setup)
    await waitFor(() => expect(MockWebSocket.instances.length).toBeGreaterThan(0));

    // Simulate WebSocket open → component transitions to 'recording'
    act(() => {
      MockWebSocket.instances[0].simulateOpen();
    });

    // Wait for button to reflect the recording state
    await waitFor(() =>
      screen.getByRole("button", { name: /stop recording/i })
    );

    return MockWebSocket.instances[0];
  }

  // ────────────────────────────────────────────────────────────────────────────
  // 1. Microphone permission request
  // ────────────────────────────────────────────────────────────────────────────

  describe("microphone permission", () => {
    it("calls getUserMedia({ audio: true }) when Start Recording is clicked", async () => {
      render(<LiveRecorderPage />);
      fireEvent.click(screen.getByRole("button", { name: /start recording/i }));
      await waitFor(() => {
        expect(getUserMediaMock).toHaveBeenCalledOnce();
        expect(getUserMediaMock).toHaveBeenCalledWith({ audio: true });
      });
    });

    it("shows an error message when mic permission is denied", async () => {
      getUserMediaMock.mockRejectedValue(new DOMException("Permission denied", "NotAllowedError"));
      render(<LiveRecorderPage />);
      fireEvent.click(screen.getByRole("button", { name: /start recording/i }));
      await waitFor(() => {
        expect(
          screen.getByText(/microphone|permission|denied|not allowed/i)
        ).toBeInTheDocument();
      });
    });

    it("shows a requesting state while awaiting permission", async () => {
      // getUserMedia never resolves — keeps component in 'requesting' state
      getUserMediaMock.mockReturnValue(new Promise(() => {}));
      render(<LiveRecorderPage />);
      fireEvent.click(screen.getByRole("button", { name: /start recording/i }));
      await waitFor(() => {
        expect(
          screen.getByRole("button", { name: /requesting microphone/i })
        ).toBeInTheDocument();
      });
    });
  });

  // ────────────────────────────────────────────────────────────────────────────
  // 2. Record / Stop button state transitions
  // ────────────────────────────────────────────────────────────────────────────

  describe("button state transitions", () => {
    it("shows 'Start Recording' in the initial idle state", () => {
      render(<LiveRecorderPage />);
      expect(
        screen.getByRole("button", { name: /start recording/i })
      ).toBeInTheDocument();
    });

    it("shows 'Stop Recording' while the session is active", async () => {
      await startSession();
      expect(
        screen.getByRole("button", { name: /stop recording/i })
      ).toBeInTheDocument();
    });

    it("sends start JSON frame on WebSocket open", async () => {
      await startSession();
      const ws = MockWebSocket.instances[0];
      expect(ws.send).toHaveBeenCalledWith(
        expect.stringContaining('"action":"start"')
      );
    });

    it("opens WebSocket with the session_id in the URL", async () => {
      await startSession();
      const ws = MockWebSocket.instances[0];
      expect(ws.url).toContain("test-session-uuid");
    });

    it("sends stop JSON frame when Stop Recording is clicked", async () => {
      const ws = await startSession();
      fireEvent.click(screen.getByRole("button", { name: /stop recording/i }));
      expect(ws.send).toHaveBeenCalledWith(
        expect.stringContaining('"action":"stop"')
      );
    });
  });

  // ────────────────────────────────────────────────────────────────────────────
  // 3. WebSocket CHUNK_PROCESSED handling
  // ────────────────────────────────────────────────────────────────────────────

  describe("CHUNK_PROCESSED message handling", () => {
    it("updates the noise type badge when a chunk is processed", async () => {
      const ws = await startSession();

      act(() => {
        ws.simulateMessage({
          type: "CHUNK_PROCESSED",
          data: {
            chunk_index: 0,
            noise_type: "airplane",
            confidence: 0.9,
            snr_before: 5.0,
            snr_after: 15.0,
            cleaned_audio_b64: fakeB64(1024),
            spectrogram_columns: [[0.1, 0.2], [0.3, 0.4]],
          },
        });
      });

      await waitFor(() => {
        expect(screen.getByText(/airplane/i)).toBeInTheDocument();
      });
    });

    it("displays average SNR improvement from received chunks", async () => {
      const ws = await startSession();

      act(() => {
        ws.simulateMessage({
          type: "CHUNK_PROCESSED",
          data: {
            chunk_index: 0,
            noise_type: "car",
            confidence: 0.8,
            snr_before: 4.0,
            snr_after: 14.0,
            cleaned_audio_b64: fakeB64(1024),
            spectrogram_columns: [[0.1], [0.2]],
          },
        });
      });

      await waitFor(() => {
        // SNR improvement = 14.0 - 4.0 = 10.0 dB
        expect(screen.getByText(/\+10\.0/)).toBeInTheDocument();
      });
    });

    it("averages SNR improvement across multiple chunks", async () => {
      const ws = await startSession();

      act(() => {
        // Chunk 1: +10 dB
        ws.simulateMessage({
          type: "CHUNK_PROCESSED",
          data: {
            chunk_index: 0,
            noise_type: "wind",
            confidence: 0.7,
            snr_before: 5.0,
            snr_after: 15.0,
            cleaned_audio_b64: fakeB64(1024),
            spectrogram_columns: [[0.1]],
          },
        });
      });

      act(() => {
        // Chunk 2: +6 dB  → avg = (10 + 6) / 2 = 8 dB
        ws.simulateMessage({
          type: "CHUNK_PROCESSED",
          data: {
            chunk_index: 1,
            noise_type: "wind",
            confidence: 0.7,
            snr_before: 4.0,
            snr_after: 10.0,
            cleaned_audio_b64: fakeB64(1024),
            spectrogram_columns: [[0.1]],
          },
        });
      });

      await waitFor(() => {
        expect(screen.getByText(/\+8\.0/)).toBeInTheDocument();
      });
    });

    it("increments chunk count display on each CHUNK_PROCESSED", async () => {
      const ws = await startSession();

      for (let i = 0; i < 3; i++) {
        act(() => {
          ws.simulateMessage({
            type: "CHUNK_PROCESSED",
            data: {
              chunk_index: i,
              noise_type: "other",
              confidence: 0.5,
              snr_before: 3.0,
              snr_after: 8.0,
              cleaned_audio_b64: fakeB64(512),
              spectrogram_columns: [[0.1]],
            },
          });
        });
      }

      await waitFor(() => {
        // "3" somewhere in a chunk counter card
        expect(screen.getByText("3")).toBeInTheDocument();
      });
    });
  });

  // ────────────────────────────────────────────────────────────────────────────
  // 4. Canvas rendering
  // ────────────────────────────────────────────────────────────────────────────

  describe("canvas elements", () => {
    it("renders a waveform canvas element", () => {
      const { container } = render(<LiveRecorderPage />);
      const waveformCanvas = container.querySelector(
        "canvas[aria-label='Live waveform']"
      );
      expect(waveformCanvas).toBeInTheDocument();
    });

    it("renders a spectrogram canvas element", () => {
      const { container } = render(<LiveRecorderPage />);
      const spectrogramCanvas = container.querySelector(
        "canvas[aria-label='Live spectrogram']"
      );
      expect(spectrogramCanvas).toBeInTheDocument();
    });

    it("has at least two canvas elements total", () => {
      const { container } = render(<LiveRecorderPage />);
      expect(container.querySelectorAll("canvas").length).toBeGreaterThanOrEqual(2);
    });
  });

  // ────────────────────────────────────────────────────────────────────────────
  // 5. Redirect on RECORDING_COMPLETE
  // ────────────────────────────────────────────────────────────────────────────

  describe("RECORDING_COMPLETE redirect", () => {
    it("calls router.push('/processing/{recording_id}') on RECORDING_COMPLETE", async () => {
      const ws = await startSession();

      act(() => {
        ws.simulateMessage({
          type: "RECORDING_COMPLETE",
          data: {
            recording_id: "rec-abc-123",
            duration_s: 10.0,
            total_chunks: 10,
            output_path: "/tmp/live_rec-abc-123.wav",
          },
        });
      });

      await waitFor(() => {
        expect(mockPush).toHaveBeenCalledOnce();
        expect(mockPush).toHaveBeenCalledWith("/processing/rec-abc-123");
      });
    });

    it("uses the recording_id from the server message (not session_id)", async () => {
      const ws = await startSession();

      act(() => {
        ws.simulateMessage({
          type: "RECORDING_COMPLETE",
          data: {
            recording_id: "server-generated-id-999",
            duration_s: 5.0,
            total_chunks: 5,
            output_path: "/tmp/out.wav",
          },
        });
      });

      await waitFor(() => {
        expect(mockPush).toHaveBeenCalledWith("/processing/server-generated-id-999");
      });
    });
  });
});
