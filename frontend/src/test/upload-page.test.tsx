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

vi.mock("@/lib/audio-api", () => ({
  uploadFiles: vi.fn(),
  getRecordings: vi.fn().mockResolvedValue({ recordings: [], total: 0 }),
}));

import UploadPage from "@/app/upload/page";

describe("Upload Page", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("renders page title", () => {
    render(<UploadPage />);
    expect(screen.getByText("Upload Recordings")).toBeInTheDocument();
  });

  it("renders description text", () => {
    render(<UploadPage />);
    expect(screen.getByText(/AI-powered noise removal/)).toBeInTheDocument();
  });

  it("renders drag-drop zone", () => {
    render(<UploadPage />);
    expect(screen.getByText(/Drop .wav or .mp3 files here/)).toBeInTheDocument();
  });

  it("renders browse files button", () => {
    render(<UploadPage />);
    expect(screen.getByText("Browse Files")).toBeInTheDocument();
  });

  it("renders file input for audio files", () => {
    const { container } = render(<UploadPage />);
    const input = container.querySelector('input[type="file"]');
    expect(input).toBeInTheDocument();
    expect(input?.getAttribute("accept")).toContain(".wav");
    expect(input?.getAttribute("accept")).toContain(".mp3");
  });

  it("renders stat cards as links", () => {
    render(<UploadPage />);
    expect(screen.getByRole("link", { name: /Total Recordings/i })).toHaveAttribute(
      "href",
      "/recordings",
    );
    expect(screen.getByRole("link", { name: /Completed/i })).toHaveAttribute(
      "href",
      "/results",
    );
    expect(screen.getByRole("link", { name: /Pending/i })).toHaveAttribute(
      "href",
      "/recordings?status=pending",
    );
    expect(screen.getByRole("link", { name: /Processing/i })).toHaveAttribute(
      "href",
      "/recordings?status=processing",
    );
  });

  it("renders recordings management link", () => {
    render(<UploadPage />);
    expect(screen.getByRole("link", { name: /Open Recordings/i })).toHaveAttribute(
      "href",
      "/recordings",
    );
  });
});
