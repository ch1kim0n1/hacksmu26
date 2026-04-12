import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";

const pushMock = vi.fn();

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
  useRouter: () => ({ push: pushMock, back: vi.fn() }),
}));

vi.mock("@/components/ui/motion-primitives", () => ({
  staggerContainer: {},
  fadeUp: {},
  QualityRing: () => null,
}));

vi.mock("@/lib/audio-api", () => ({
  getCalls: vi.fn().mockResolvedValue({
    calls: [
      {
        id: "call-111",
        recording_id: "rec-999",
        call_type: "Rumble",
        start_time: 2.5,
        end_time: 5.0,
        start_ms: 2500,
        duration_ms: 2500,
        confidence: 0.92,
        metadata: {},
      },
    ],
    total: 1,
  }),
  API_BASE: "http://localhost:8000",
}));

import DatabasePage from "@/app/database/page";

describe("Database page – call card navigation", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("navigates to /results/{recording_id} when a call card is clicked", async () => {
    render(<DatabasePage />);

    // Wait for the call card to appear (getCalls resolves with our mock)
    const card = await screen.findByRole("button", {
      name: /View call Rumble call-111/i,
    });

    fireEvent.click(card);

    // Must navigate using the recording_id, NOT the call id
    expect(pushMock).toHaveBeenCalledWith("/results/rec-999");
    expect(pushMock).not.toHaveBeenCalledWith("/results/call-111");
  });
});
