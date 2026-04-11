import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { fetchAPI, ApiError, API_BASE } from "@/lib/api";
import {
  formatDuration,
  formatFrequency,
  formatFileSize,
  formatPercentage,
  formatDate,
  formatSnr,
} from "@/lib/format";
import {
  validateAudioFile,
  ACCEPTED_FORMATS,
  MAX_FILE_SIZE,
} from "@/lib/validation";
import { API_ENDPOINTS, PROCESSING_STAGES, PROCESSING_STAGE_MAP } from "@/lib/constants";

// ── fetchAPI ──

describe("fetchAPI", () => {
  const mockFetch = vi.fn();

  beforeEach(() => {
    mockFetch.mockReset();
    vi.stubGlobal("fetch", mockFetch);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("calls fetch with correct URL and JSON content-type", async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      status: 200,
      headers: new Headers({ "content-type": "application/json" }),
      json: () => Promise.resolve({ data: "test" }),
    });

    const result = await fetchAPI("/api/test");
    expect(mockFetch).toHaveBeenCalledWith(
      `${API_BASE}/api/test`,
      expect.objectContaining({
        headers: expect.objectContaining({
          "Content-Type": "application/json",
        }),
      })
    );
    expect(result).toEqual({ data: "test" });
  });

  it("passes FormData body through to fetch", async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      status: 200,
      headers: new Headers({ "content-type": "application/json" }),
      json: () => Promise.resolve({ ok: true }),
    });

    const form = new FormData();
    form.append("file", new Blob(["audio"]), "test.wav");
    await fetchAPI("/api/upload", { method: "POST", body: form });

    expect(mockFetch).toHaveBeenCalledTimes(1);
    const calledOptions = mockFetch.mock.calls[0][1];
    expect(calledOptions.body).toBeInstanceOf(FormData);
  });

  it("throws ApiError on non-ok response with detail string", async () => {
    mockFetch.mockResolvedValue({
      ok: false,
      status: 404,
      statusText: "Not Found",
      headers: new Headers(),
      json: () => Promise.resolve({ detail: "Recording not found" }),
    });

    await expect(fetchAPI("/api/recordings/bad")).rejects.toThrow(ApiError);
    try {
      await fetchAPI("/api/recordings/bad");
    } catch (e) {
      const err = e as ApiError;
      expect(err.status).toBe(404);
      expect(err.message).toBe("Recording not found");
    }
  });

  it("throws ApiError with validation detail array", async () => {
    mockFetch.mockResolvedValue({
      ok: false,
      status: 422,
      statusText: "Unprocessable Entity",
      headers: new Headers(),
      json: () =>
        Promise.resolve({
          detail: [{ msg: "field required", loc: ["body", "file"] }],
        }),
    });

    await expect(fetchAPI("/api/upload")).rejects.toThrow("field required");
  });

  it("returns undefined for 204 No Content", async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      status: 204,
      headers: new Headers(),
    });

    const result = await fetchAPI("/api/recordings/123");
    expect(result).toBeUndefined();
  });

  it("returns undefined for non-JSON content-type", async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      status: 200,
      headers: new Headers({ "content-type": "audio/wav" }),
    });

    const result = await fetchAPI("/api/recordings/123/download");
    expect(result).toBeUndefined();
  });
});

// ── API_BASE ──

describe("API_BASE", () => {
  it("defaults to localhost:8000", () => {
    expect(API_BASE).toBe("http://localhost:8000");
  });
});

// ── API_ENDPOINTS ──

describe("API_ENDPOINTS", () => {
  it("has all required endpoints", () => {
    expect(API_ENDPOINTS.RECORDINGS).toBe("/api/recordings");
    expect(API_ENDPOINTS.RECORDING("abc")).toBe("/api/recordings/abc");
    expect(API_ENDPOINTS.RECORDING_PROCESS("abc")).toBe("/api/recordings/abc/process");
    expect(API_ENDPOINTS.RECORDING_SPECTROGRAM("abc")).toBe("/api/recordings/abc/spectrogram");
    expect(API_ENDPOINTS.RECORDING_DOWNLOAD("abc")).toBe("/api/recordings/abc/download");
    expect(API_ENDPOINTS.CALLS).toBe("/api/calls");
    expect(API_ENDPOINTS.CALL("xyz")).toBe("/api/calls/xyz");
    expect(API_ENDPOINTS.STATS).toBe("/api/stats");
    expect(API_ENDPOINTS.EXPORT).toBe("/api/export");
  });
});

// ── PROCESSING_STAGES ──

describe("PROCESSING_STAGES", () => {
  it("has at least uploaded, completed, and failed stages", () => {
    const keys = PROCESSING_STAGES.map((s) => s.key);
    expect(keys).toContain("uploaded");
    expect(keys).toContain("completed");
    expect(keys).toContain("failed");
  });

  it("PROCESSING_STAGE_MAP maps keys to stages", () => {
    expect(PROCESSING_STAGE_MAP["uploaded"]?.label).toBe("Uploaded");
    expect(PROCESSING_STAGE_MAP["completed"]?.label).toBe("Completed");
  });
});

// ── formatDuration ──

describe("formatDuration", () => {
  it("formats seconds to M:SS", () => {
    expect(formatDuration(0)).toBe("0:00");
    expect(formatDuration(5)).toBe("0:05");
    expect(formatDuration(65)).toBe("1:05");
    expect(formatDuration(600)).toBe("10:00");
  });

  it("formats hours to H:MM:SS", () => {
    expect(formatDuration(3661)).toBe("1:01:01");
  });

  it("handles edge cases", () => {
    expect(formatDuration(-1)).toBe("0:00");
    expect(formatDuration(NaN)).toBe("0:00");
    expect(formatDuration(Infinity)).toBe("0:00");
  });
});

// ── formatFrequency ──

describe("formatFrequency", () => {
  it("formats Hz below 1000", () => {
    expect(formatFrequency(440)).toBe("440.0 Hz");
    expect(formatFrequency(20)).toBe("20.0 Hz");
  });

  it("formats kHz for 1000+", () => {
    expect(formatFrequency(1000)).toBe("1.0 kHz");
    expect(formatFrequency(2500)).toBe("2.5 kHz");
  });

  it("handles edge cases", () => {
    expect(formatFrequency(-10)).toBe("0 Hz");
    expect(formatFrequency(NaN)).toBe("0 Hz");
  });
});

// ── formatFileSize ──

describe("formatFileSize", () => {
  it("formats bytes", () => {
    expect(formatFileSize(500)).toBe("500 B");
  });

  it("formats KB", () => {
    expect(formatFileSize(1024)).toBe("1.0 KB");
  });

  it("formats MB", () => {
    expect(formatFileSize(1024 * 1024 * 5)).toBe("5.0 MB");
  });

  it("handles edge cases", () => {
    expect(formatFileSize(0)).toBe("0 B");
    expect(formatFileSize(-1)).toBe("0 B");
  });
});

// ── formatPercentage ──

describe("formatPercentage", () => {
  it("formats decimal to percentage", () => {
    expect(formatPercentage(0.5)).toBe("50%");
    expect(formatPercentage(0.89)).toBe("89%");
    expect(formatPercentage(1)).toBe("100%");
  });

  it("handles edge cases", () => {
    expect(formatPercentage(NaN)).toBe("0%");
  });
});

// ── formatDate ──

describe("formatDate", () => {
  it("formats ISO date to localized string", () => {
    const result = formatDate("2026-04-11T12:00:00Z");
    expect(result).toContain("Apr");
    expect(result).toContain("11");
    expect(result).toContain("2026");
  });

  it("handles invalid date input", () => {
    const result = formatDate("not-a-date");
    // Invalid Date objects produce "Invalid Date" from toLocaleDateString
    expect(typeof result).toBe("string");
    expect(result.length).toBeGreaterThan(0);
  });
});

// ── formatSnr ──

describe("formatSnr", () => {
  it("formats positive dB with + sign", () => {
    expect(formatSnr(15.3)).toBe("+15.3 dB");
  });

  it("formats negative dB", () => {
    expect(formatSnr(-3.5)).toBe("-3.5 dB");
  });

  it("handles edge cases", () => {
    expect(formatSnr(NaN)).toBe("0.0 dB");
  });
});

// ── validateAudioFile ──

describe("validateAudioFile", () => {
  function makeFile(name: string, size: number): File {
    return new File([new ArrayBuffer(size)], name, { type: "audio/wav" });
  }

  it("accepts valid WAV file", () => {
    const result = validateAudioFile(makeFile("test.wav", 1024));
    expect(result.valid).toBe(true);
    expect(result.error).toBeUndefined();
  });

  it("accepts valid MP3 file", () => {
    const result = validateAudioFile(makeFile("test.mp3", 1024));
    expect(result.valid).toBe(true);
  });

  it("accepts valid FLAC file", () => {
    const result = validateAudioFile(makeFile("recording.flac", 1024));
    expect(result.valid).toBe(true);
  });

  it("rejects unsupported format", () => {
    const result = validateAudioFile(makeFile("test.ogg", 1024));
    expect(result.valid).toBe(false);
    expect(result.error).toContain("Invalid file format");
  });

  it("rejects file exceeding size limit", () => {
    const result = validateAudioFile(makeFile("big.wav", MAX_FILE_SIZE + 1));
    expect(result.valid).toBe(false);
    expect(result.error).toContain("too large");
  });

  it("rejects empty file", () => {
    const result = validateAudioFile(makeFile("empty.wav", 0));
    expect(result.valid).toBe(false);
    expect(result.error).toContain("empty");
  });

  it("ACCEPTED_FORMATS includes wav, mp3, flac", () => {
    expect(ACCEPTED_FORMATS).toContain(".wav");
    expect(ACCEPTED_FORMATS).toContain(".mp3");
    expect(ACCEPTED_FORMATS).toContain(".flac");
  });
});
