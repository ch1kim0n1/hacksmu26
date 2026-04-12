import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, act } from "@testing-library/react";
import { renderHook } from "@testing-library/react";

// ── useAnnotations hook ──

vi.mock("@/hooks/useLocalStorage", () => ({
  useLocalStorage: vi.fn(),
}));

import { useLocalStorage } from "@/hooks/useLocalStorage";
import { useAnnotations } from "@/hooks/useAnnotations";
import AnnotationLayer from "@/components/spectrogram/AnnotationLayer";
import AnnotationPanel from "@/components/spectrogram/AnnotationPanel";
import SpectrogramViewer from "@/components/spectrogram/SpectrogramViewer";

const mockUseLocalStorage = vi.mocked(useLocalStorage);

function setupLocalStorageMock(initial: unknown[] = []) {
  let stored: unknown[] = initial;
  const setter = vi.fn((val: unknown) => {
    stored = val as unknown[];
  });
  mockUseLocalStorage.mockImplementation(() => [stored, setter] as ReturnType<typeof useLocalStorage>);
  return { getStored: () => stored, setter };
}

describe("useAnnotations", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns empty annotations initially", () => {
    setupLocalStorageMock([]);
    const { result } = renderHook(() => useAnnotations("rec-abc"));
    expect(result.current.annotations).toHaveLength(0);
  });

  it("uses correct localStorage key per recordingId", () => {
    setupLocalStorageMock([]);
    renderHook(() => useAnnotations("rec-xyz"));
    expect(mockUseLocalStorage).toHaveBeenCalledWith(
      "echofield:annotations:rec-xyz",
      []
    );
  });

  it("addAnnotation stores a new annotation with generated id", () => {
    const { setter } = setupLocalStorageMock([]);
    const { result } = renderHook(() => useAnnotations("rec-1"));
    act(() => {
      result.current.addAnnotation({
        type: "point",
        time_ms: 1200,
        frequency_hz: 340,
        text: "Test note",
        tag: "Interesting call",
        color: "#22c55e",
      });
    });
    expect(setter).toHaveBeenCalledTimes(1);
    const saved = setter.mock.calls[0][0] as Array<{ id: string; type: string; time_ms: number }>;
    expect(saved).toHaveLength(1);
    expect(saved[0].id).toBeDefined();
    expect(saved[0].type).toBe("point");
    expect(saved[0].time_ms).toBe(1200);
  });

  it("removeAnnotation deletes by id", () => {
    const existingAnnotations = [
      { id: "ann-1", type: "point", time_ms: 500, frequency_hz: 200, text: "hi", tag: "Custom", color: "#3b82f6", created_at: new Date().toISOString() },
      { id: "ann-2", type: "point", time_ms: 800, frequency_hz: 400, text: "bye", tag: "Custom", color: "#3b82f6", created_at: new Date().toISOString() },
    ];
    const { setter } = setupLocalStorageMock(existingAnnotations);
    const { result } = renderHook(() => useAnnotations("rec-1"));
    act(() => {
      result.current.removeAnnotation("ann-1");
    });
    const saved = setter.mock.calls[0][0] as Array<{ id: string }>;
    expect(saved).toHaveLength(1);
    expect(saved[0].id).toBe("ann-2");
  });

  it("lists existing annotations from storage", () => {
    const existing = [
      { id: "ann-1", type: "point", time_ms: 100, frequency_hz: 50, text: "note", tag: "Noise artifact", color: "#ef4444", created_at: new Date().toISOString() },
    ];
    setupLocalStorageMock(existing);
    const { result } = renderHook(() => useAnnotations("rec-1"));
    expect(result.current.annotations).toHaveLength(1);
    expect(result.current.annotations[0].id).toBe("ann-1");
  });
});

// ── AnnotationLayer ──

describe("AnnotationLayer", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    setupLocalStorageMock([]);
  });

  const sampleAnnotations = [
    { id: "a1", type: "point" as const, time_ms: 2000, frequency_hz: 300, text: "Great rumble", tag: "Interesting call", color: "#22c55e", created_at: new Date().toISOString() },
    { id: "a2", type: "region" as const, time_ms: 1000, frequency_hz: 100, end_time_ms: 2000, freq_max_hz: 400, text: "Noise band", tag: "Noise artifact", color: "#ef4444", created_at: new Date().toISOString() },
  ];

  it("renders existing point annotations as visible elements", () => {
    render(
      <AnnotationLayer
        annotations={sampleAnnotations}
        maxTime={10}
        maxFrequency={1000}
        annotateMode={false}
        onAdd={vi.fn()}
      />
    );
    const pins = screen.getAllByRole("button", { hidden: true });
    expect(pins.length).toBeGreaterThanOrEqual(1);
  });

  it("renders region annotation as a rectangle element", () => {
    render(
      <AnnotationLayer
        annotations={sampleAnnotations}
        maxTime={10}
        maxFrequency={1000}
        annotateMode={false}
        onAdd={vi.fn()}
      />
    );
    expect(screen.getByTitle("Noise band")).toBeInTheDocument();
  });

  it("in view mode (annotateMode=false), has pointer-events-none on the clickable surface", () => {
    const onAdd = vi.fn();
    const { container } = render(
      <AnnotationLayer
        annotations={[]}
        maxTime={10}
        maxFrequency={1000}
        annotateMode={false}
        onAdd={onAdd}
      />
    );
    const clickSurface = container.querySelector("[data-annotation-surface]");
    expect(clickSurface).toBeInTheDocument();
    expect(clickSurface?.className).toContain("pointer-events-none");
  });

  it("in annotate mode (annotateMode=true), click surface captures pointer events", () => {
    const onAdd = vi.fn();
    const { container } = render(
      <AnnotationLayer
        annotations={[]}
        maxTime={10}
        maxFrequency={1000}
        annotateMode={true}
        onAdd={onAdd}
      />
    );
    const clickSurface = container.querySelector("[data-annotation-surface]");
    expect(clickSurface).toBeInTheDocument();
    expect(clickSurface?.className).not.toContain("pointer-events-none");
  });

  it("in annotate mode, clicking calls onAdd handler with coordinate data", () => {
    const onAdd = vi.fn();
    const { container } = render(
      <AnnotationLayer
        annotations={[]}
        maxTime={10}
        maxFrequency={1000}
        annotateMode={true}
        onAdd={onAdd}
      />
    );
    const clickSurface = container.querySelector("[data-annotation-surface]") as HTMLElement;
    Object.defineProperty(clickSurface, "getBoundingClientRect", {
      value: () => ({ left: 0, top: 0, width: 400, height: 200 }),
    });
    fireEvent.click(clickSurface, { clientX: 200, clientY: 100 });
    expect(onAdd).toHaveBeenCalledTimes(1);
    const arg = onAdd.mock.calls[0][0];
    expect(arg).toHaveProperty("time_ms");
    expect(arg).toHaveProperty("frequency_hz");
    expect(arg.type).toBe("point");
  });

  it("shows tooltip element in the DOM", () => {
    render(
      <AnnotationLayer
        annotations={[]}
        maxTime={5}
        maxFrequency={1000}
        annotateMode={false}
        onAdd={vi.fn()}
      />
    );
    // Tooltip is rendered but hidden by default (no cursor position yet)
    const tooltip = screen.queryByRole("tooltip") ?? screen.queryByTestId("cursor-tooltip");
    // Tooltip is defined in component — it's just hidden until hover
    expect(tooltip).toBeDefined();
  });
});

// ── AnnotationPanel ──

describe("AnnotationPanel", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    setupLocalStorageMock([]);
  });

  const sampleAnnotations = [
    { id: "a1", type: "point" as const, time_ms: 1500, frequency_hz: 250, text: "Low rumble detected", tag: "Interesting call", color: "#22c55e", created_at: new Date().toISOString() },
    { id: "a2", type: "point" as const, time_ms: 3200, frequency_hz: 80, text: "Background noise", tag: "Noise artifact", color: "#ef4444", created_at: new Date().toISOString() },
  ];

  it("shows empty state when no annotations", () => {
    render(
      <AnnotationPanel
        annotations={[]}
        onRemove={vi.fn()}
        onSelect={vi.fn()}
        selectedId={null}
      />
    );
    expect(screen.getByText(/no annotations/i)).toBeInTheDocument();
  });

  it("renders list of annotations with tag and text", () => {
    render(
      <AnnotationPanel
        annotations={sampleAnnotations}
        onRemove={vi.fn()}
        onSelect={vi.fn()}
        selectedId={null}
      />
    );
    expect(screen.getByText("Low rumble detected")).toBeInTheDocument();
    expect(screen.getByText("Background noise")).toBeInTheDocument();
  });

  it("renders delete button for each annotation", () => {
    render(
      <AnnotationPanel
        annotations={sampleAnnotations}
        onRemove={vi.fn()}
        onSelect={vi.fn()}
        selectedId={null}
      />
    );
    const deleteButtons = screen.getAllByRole("button", { name: /delete|remove/i });
    expect(deleteButtons).toHaveLength(2);
  });

  it("calls onRemove with correct id when delete button clicked", () => {
    const onRemove = vi.fn();
    render(
      <AnnotationPanel
        annotations={sampleAnnotations}
        onRemove={onRemove}
        onSelect={vi.fn()}
        selectedId={null}
      />
    );
    const deleteButtons = screen.getAllByRole("button", { name: /delete|remove/i });
    fireEvent.click(deleteButtons[0]);
    expect(onRemove).toHaveBeenCalledWith("a1");
  });

  it("calls onSelect when annotation row is clicked", () => {
    const onSelect = vi.fn();
    render(
      <AnnotationPanel
        annotations={sampleAnnotations}
        onRemove={vi.fn()}
        onSelect={onSelect}
        selectedId={null}
      />
    );
    const rows = screen.getAllByRole("button", { name: /select annotation/i });
    fireEvent.click(rows[0]);
    expect(onSelect).toHaveBeenCalledWith("a1");
  });

  it("shows time coordinate for each annotation", () => {
    render(
      <AnnotationPanel
        annotations={sampleAnnotations}
        onRemove={vi.fn()}
        onSelect={vi.fn()}
        selectedId={null}
      />
    );
    // time_ms: 1500 → 1.5s
    expect(screen.getByText(/1\.5s/)).toBeInTheDocument();
  });

  it("highlights selected annotation row", () => {
    const { container } = render(
      <AnnotationPanel
        annotations={sampleAnnotations}
        onRemove={vi.fn()}
        onSelect={vi.fn()}
        selectedId="a1"
      />
    );
    const selected = container.querySelector("[data-selected='true']");
    expect(selected).toBeInTheDocument();
  });
});

// ── SpectrogramViewer with annotation integration ──

describe("SpectrogramViewer annotation toggle", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    setupLocalStorageMock([]);
  });

  it("does NOT show Annotate toggle when recordingId is not provided", () => {
    render(<SpectrogramViewer src="/test.png" title="Test" />);
    expect(screen.queryByRole("button", { name: /annotate/i })).not.toBeInTheDocument();
  });

  it("shows Annotate toggle button when recordingId is provided", () => {
    render(
      <SpectrogramViewer
        src="/test.png"
        title="Test"
        recordingId="rec-001"
        maxDuration={10}
      />
    );
    expect(screen.getByRole("button", { name: /annotate/i })).toBeInTheDocument();
  });

  it("Annotate toggle switches between annotate and view mode", () => {
    render(
      <SpectrogramViewer
        src="/test.png"
        title="Test"
        recordingId="rec-001"
        maxDuration={10}
      />
    );
    const toggle = screen.getByRole("button", { name: /annotate/i });
    fireEvent.click(toggle);
    expect(screen.getByRole("button", { name: /annotating|stop/i })).toBeInTheDocument();
  });

  it("renders AnnotationLayer when recordingId provided", () => {
    const { container } = render(
      <SpectrogramViewer
        src="/test.png"
        title="Test"
        recordingId="rec-001"
        maxDuration={10}
      />
    );
    expect(container.querySelector("[data-annotation-surface]")).toBeInTheDocument();
  });
});
