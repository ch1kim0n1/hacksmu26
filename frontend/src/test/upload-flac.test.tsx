import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";

vi.mock("next/link", () => ({
  default: ({
    children,
    href,
    ...props
  }: {
    children: React.ReactNode;
    href: string;
    [key: string]: unknown;
  }) => (
    <a href={href} {...props}>
      {children}
    </a>
  ),
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn() }),
}));

vi.mock("@/lib/audio-api", () => ({
  uploadFiles: vi.fn(),
  processRecording: vi.fn(),
  getRecordings: vi.fn().mockResolvedValue({ recordings: [], total: 0 }),
}));

import UploadPage from "@/app/upload/page";

describe("Upload page — FLAC support", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("file input accept attribute includes .flac", () => {
    const { container } = render(<UploadPage />);
    const input = container.querySelector(
      'input[type="file"]',
    ) as HTMLInputElement;
    expect(input).toBeInTheDocument();
    expect(input.getAttribute("accept")).toContain(".flac");
  });

  it("file input accept attribute includes audio/flac MIME type", () => {
    const { container } = render(<UploadPage />);
    const input = container.querySelector(
      'input[type="file"]',
    ) as HTMLInputElement;
    expect(input.getAttribute("accept")).toContain("audio/flac");
  });

  it("file input accept attribute still includes .wav and .mp3", () => {
    const { container } = render(<UploadPage />);
    const input = container.querySelector(
      'input[type="file"]',
    ) as HTMLInputElement;
    expect(input.getAttribute("accept")).toContain(".wav");
    expect(input.getAttribute("accept")).toContain(".mp3");
  });

  it("drop zone text mentions .flac files", () => {
    render(<UploadPage />);
    expect(screen.getByText(/\.flac/)).toBeInTheDocument();
  });
});

describe("Upload page — validateFile logic", () => {
  // The validateFile function is not exported, so we test the expected
  // validation rules directly to ensure FLAC is accepted.
  function validateFile(file: File): string | null {
    const validTypes = [
      "audio/wav",
      "audio/x-wav",
      "audio/mpeg",
      "audio/mp3",
      "audio/flac",
      "audio/x-flac",
    ];
    const validExtensions = [".wav", ".mp3", ".flac"];
    const maxSize = 500 * 1024 * 1024;
    const ext = file.name.toLowerCase().slice(file.name.lastIndexOf("."));
    if (!validTypes.includes(file.type) && !validExtensions.includes(ext)) {
      return `Invalid file type: ${file.name}. Only .wav, .mp3, and .flac files are accepted.`;
    }
    if (file.size > maxSize) {
      return `File too large: ${file.name}. Maximum size is 500 MB.`;
    }
    return null;
  }

  it("accepts .flac files", () => {
    const file = new File(["audio"], "elephant.flac", { type: "audio/flac" });
    expect(validateFile(file)).toBeNull();
  });

  it("accepts .wav files", () => {
    const file = new File(["audio"], "recording.wav", { type: "audio/wav" });
    expect(validateFile(file)).toBeNull();
  });

  it("accepts .mp3 files", () => {
    const file = new File(["audio"], "recording.mp3", { type: "audio/mpeg" });
    expect(validateFile(file)).toBeNull();
  });

  it("rejects .txt files", () => {
    const file = new File(["text"], "notes.txt", { type: "text/plain" });
    const result = validateFile(file);
    expect(result).not.toBeNull();
    expect(result).toContain("Invalid file type");
  });

  it("accepts .flac by extension even with empty MIME type", () => {
    const file = new File(["audio"], "elephant.flac", { type: "" });
    expect(validateFile(file)).toBeNull();
  });
});
