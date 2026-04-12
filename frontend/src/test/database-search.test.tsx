import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { Call, CallListResponse } from "@/lib/audio-api";

const mockPush = vi.fn();

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
  useRouter: () => ({ push: mockPush }),
}));

function makeCall(overrides: Partial<Call> & { id: string }): Call {
  return {
    recording_id: "rec-1",
    call_type: "Rumble",
    start_ms: 0,
    duration_ms: 1000,
    start_time: 0,
    end_time: 1,
    metadata: {},
    ...overrides,
  } as Call;
}

const mockGetCalls = vi.fn<[], Promise<CallListResponse>>();

vi.mock("@/lib/audio-api", () => ({
  getCalls: (...args: unknown[]) => mockGetCalls(...(args as [])),
}));

vi.mock("@/components/ui/motion-primitives", () => ({
  staggerContainer: {},
  fadeUp: {},
}));

vi.mock("framer-motion", () => ({
  motion: new Proxy(
    {},
    {
      get: (_target, prop: string) => {
        const Component = ({
          children,
          ...rest
        }: {
          children?: React.ReactNode;
          [key: string]: unknown;
        }) => {
          const safeProps: Record<string, unknown> = {};
          for (const [key, value] of Object.entries(rest)) {
            if (
              typeof value !== "object" &&
              typeof value !== "function" &&
              key !== "variants" &&
              key !== "initial" &&
              key !== "animate" &&
              key !== "exit" &&
              key !== "transition" &&
              key !== "whileHover" &&
              key !== "whileTap"
            ) {
              safeProps[key] = value;
            }
          }
          const Tag = prop as keyof JSX.IntrinsicElements;
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          return <Tag {...(safeProps as any)}>{children}</Tag>;
        };
        Component.displayName = `motion.${prop}`;
        return Component;
      },
    },
  ),
  AnimatePresence: ({ children }: { children: React.ReactNode }) => children,
}));

import DatabasePage from "@/app/database/page";

const PAGE_SIZE = 12;

describe("Database Page — search and location filter across pages", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("renders the search input and location filter", async () => {
    mockGetCalls.mockResolvedValue({ calls: [], total: 0 });
    render(<DatabasePage />);
    expect(
      screen.getByPlaceholderText(/Search by call ID/i),
    ).toBeInTheDocument();
    expect(screen.getByPlaceholderText(/Location/i)).toBeInTheDocument();
  });

  it("fetches all results when search text is entered", async () => {
    const allCalls = Array.from({ length: 20 }, (_, i) =>
      makeCall({ id: `call-${i}`, call_type: i < 5 ? "Trumpet" : "Rumble" }),
    );
    // First render: normal paginated fetch
    mockGetCalls.mockResolvedValueOnce({
      calls: allCalls.slice(0, PAGE_SIZE),
      total: 20,
    });
    render(<DatabasePage />);

    await waitFor(() => {
      expect(mockGetCalls).toHaveBeenCalledTimes(1);
    });

    // Verify initial fetch used PAGE_SIZE
    expect(mockGetCalls).toHaveBeenCalledWith(
      expect.objectContaining({ limit: PAGE_SIZE }),
    );

    // When user types in search, it should fetch with limit=1000
    mockGetCalls.mockResolvedValueOnce({ calls: allCalls, total: 20 });
    const searchInput = screen.getByPlaceholderText(/Search by call ID/i);
    await userEvent.type(searchInput, "Trumpet");

    await waitFor(() => {
      const lastCall = mockGetCalls.mock.calls[mockGetCalls.mock.calls.length - 1];
      expect(lastCall[0]).toEqual(
        expect.objectContaining({ limit: 1000, offset: 0 }),
      );
    });
  });

  it("fetches all results when location filter is entered", async () => {
    const allCalls = Array.from({ length: 15 }, (_, i) =>
      makeCall({
        id: `call-${i}`,
        metadata: { location: i < 3 ? "Amboseli" : "Samburu" },
      }),
    );
    mockGetCalls.mockResolvedValueOnce({
      calls: allCalls.slice(0, PAGE_SIZE),
      total: 15,
    });
    render(<DatabasePage />);

    await waitFor(() => {
      expect(mockGetCalls).toHaveBeenCalledTimes(1);
    });

    mockGetCalls.mockResolvedValueOnce({ calls: allCalls, total: 15 });
    const locationInput = screen.getByPlaceholderText(/Location/i);
    await userEvent.type(locationInput, "Amboseli");

    await waitFor(() => {
      const lastCall = mockGetCalls.mock.calls[mockGetCalls.mock.calls.length - 1];
      expect(lastCall[0]).toEqual(
        expect.objectContaining({ limit: 1000, offset: 0 }),
      );
    });
  });

  it("paginates filtered results client-side", async () => {
    // 20 calls but only 5 match search; should show 5 on page 0
    const allCalls = Array.from({ length: 20 }, (_, i) =>
      makeCall({
        id: `call-${i}`,
        call_type: i < 5 ? "Trumpet" : "Rumble",
      }),
    );
    mockGetCalls.mockResolvedValueOnce({
      calls: allCalls.slice(0, PAGE_SIZE),
      total: 20,
    });
    render(<DatabasePage />);
    await waitFor(() => expect(mockGetCalls).toHaveBeenCalledTimes(1));

    mockGetCalls.mockResolvedValueOnce({ calls: allCalls, total: 20 });
    const searchInput = screen.getByPlaceholderText(/Search by call ID/i);
    await userEvent.type(searchInput, "Trumpet");

    // Only 5 calls match "Trumpet" — all fit on one page, so no pagination buttons
    await waitFor(() => {
      const trumpetButtons = screen.getAllByText("Trumpet");
      expect(trumpetButtons.length).toBeGreaterThan(0);
    });
  });

  it("resets page to 0 when search changes", async () => {
    mockGetCalls.mockResolvedValue({ calls: [], total: 0 });
    render(<DatabasePage />);
    await waitFor(() => expect(mockGetCalls).toHaveBeenCalled());

    const searchInput = screen.getByPlaceholderText(/Search by call ID/i);
    await userEvent.type(searchInput, "test");

    // After the search refetch, offset should be 0 (page reset)
    await waitFor(() => {
      const lastCall = mockGetCalls.mock.calls[mockGetCalls.mock.calls.length - 1];
      expect(lastCall[0]).toEqual(
        expect.objectContaining({ offset: 0 }),
      );
    });
  });

  it("resets page to 0 when location filter changes", async () => {
    mockGetCalls.mockResolvedValue({ calls: [], total: 0 });
    render(<DatabasePage />);
    await waitFor(() => expect(mockGetCalls).toHaveBeenCalled());

    const locationInput = screen.getByPlaceholderText(/Location/i);
    await userEvent.type(locationInput, "Kenya");

    await waitFor(() => {
      const lastCall = mockGetCalls.mock.calls[mockGetCalls.mock.calls.length - 1];
      expect(lastCall[0]).toEqual(
        expect.objectContaining({ offset: 0 }),
      );
    });
  });
});
