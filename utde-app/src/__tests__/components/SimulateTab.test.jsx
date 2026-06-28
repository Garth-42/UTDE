import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import SimulateTab from "../../components/simulate/SimulateTab";
import { useToolpathStore } from "../../store/toolpathStore";
import { useUiStore } from "../../store/uiStore";

vi.mock("../../components/viewport/StepViewport", () => ({
  default: () => <div data-testid="step-viewport" />,
}));

vi.mock("../../lib/templateLoader", () => ({
  useTemplates: () => ({ templates: [], loading: false, error: null }),
}));

const POCKET_PATH = {
  id: "op_a", label: "Pocket A", kind: "sub", color: "var(--sub)",
  visible: true, gcodeStartLine: 0, gcodeEndLine: 100,
  points: Array.from({ length: 80 }, (_, i) => ({
    x: i, y: 0, z: 0,
    nx: 0, ny: 0, nz: -1,
    feed_rate: 1200,
    process_params: { tool: "T11 — Ø10 end mill", spindle_rpm: 9500 },
  })),
};
const DEPOSIT_PATH = {
  id: "op_b", label: "Deposit B", kind: "add", color: "var(--add)",
  visible: true, gcodeStartLine: 100, gcodeEndLine: 200,
  points: Array.from({ length: 80 }, (_, i) => ({
    x: 0, y: i, z: 0,
    nx: 0, ny: 0, nz: -1,
    feed_rate: 1800,
    process_params: { tool: "T03", spindle_rpm: 0 },
  })),
};

function seedTwoToolpaths() {
  useToolpathStore.setState({
    toolpaths: [POCKET_PATH, DEPOSIT_PATH],
    activeIds: new Set(["op_a", "op_b"]),
    animProgress: 0,
    isAnimating:  false,
    simSpeed:     1,
    opRanges:     [
      { idx: 0, templateId: "pocket",        kind: "sub", point_start: 0,  point_end: 80 },
      { idx: 1, templateId: "deposit-layer", kind: "add", point_start: 80, point_end: 160 },
    ],
    gcode: "",
    warnings: [],
    isCompiling: false,
    compileError: null,
  });
}

beforeEach(() => {
  useUiStore.setState({ tab: "simulate", showToolpaths: false });
});

afterEach(() => {
  // Stop any timer the play button may have started.
  const ref = useToolpathStore.getState().animRef;
  if (ref) {
    clearInterval(ref);
    useToolpathStore.setState({ animRef: null, isAnimating: false });
  }
});

describe("SimulateTab — empty state", () => {
  it("shows the run-setup nudge when no toolpaths exist", () => {
    useToolpathStore.setState({
      toolpaths: [], activeIds: new Set(), animProgress: 0,
      opRanges: [], isAnimating: false, simSpeed: 1,
    });
    render(<SimulateTab />);
    expect(screen.getByText(/Run the setup/i)).toBeInTheDocument();
  });
});

describe("SimulateTab — with toolpaths", () => {
  beforeEach(seedTwoToolpaths);

  it("forces showToolpaths on mount", () => {
    expect(useUiStore.getState().showToolpaths).toBe(false);
    render(<SimulateTab />);
    expect(useUiStore.getState().showToolpaths).toBe(true);
  });

  it("renders the HUD with the active op's name and stats", () => {
    render(<SimulateTab />);
    expect(screen.getByText(/Now running/i)).toBeInTheDocument();
    // At progress 0 the cursor lives in the first op.
    expect(screen.getByText("Pocket A")).toBeInTheDocument();
    expect(screen.getByText("Subtractive")).toBeInTheDocument();
    expect(screen.getByText("01/02")).toBeInTheDocument();
  });

  it("HUD updates the active op when progress lands in the second toolpath", () => {
    useToolpathStore.setState({ animProgress: 0.75 });
    render(<SimulateTab />);
    expect(screen.getByText("Deposit B")).toBeInTheDocument();
    expect(screen.getByText("Additive")).toBeInTheDocument();
    expect(screen.getByText("02/02")).toBeInTheDocument();
  });

  it("status pill flips between paused and simulating", () => {
    render(<SimulateTab />);
    expect(screen.getByText("paused")).toBeInTheDocument();
    fireEvent.click(screen.getByTitle("Play"));
    expect(useToolpathStore.getState().isAnimating).toBe(true);
  });

  it("rewind resets progress and stops animation", () => {
    useToolpathStore.setState({ animProgress: 0.5, isAnimating: true });
    render(<SimulateTab />);
    fireEvent.click(screen.getByTitle("Rewind"));
    expect(useToolpathStore.getState().animProgress).toBe(0);
    expect(useToolpathStore.getState().isAnimating).toBe(false);
  });

  it("step forward bumps progress by 0.05", () => {
    useToolpathStore.setState({ animProgress: 0.2 });
    render(<SimulateTab />);
    fireEvent.click(screen.getByTitle("Step forward"));
    expect(useToolpathStore.getState().animProgress).toBeCloseTo(0.25, 5);
  });

  it("speed buttons set simSpeed", () => {
    render(<SimulateTab />);
    fireEvent.click(screen.getByRole("button", { name: "0.5×" }));
    expect(useToolpathStore.getState().simSpeed).toBe(0.5);
    fireEvent.click(screen.getByRole("button", { name: "4×" }));
    expect(useToolpathStore.getState().simSpeed).toBe(4);
  });

  it("pointer-down on the track seeks to the pressed position", () => {
    render(<SimulateTab />);
    const track = screen.getByRole("slider");
    track.getBoundingClientRect = () => ({ left: 0, width: 200 });
    fireEvent.pointerDown(track, { clientX: 50 });
    expect(useToolpathStore.getState().animProgress).toBeCloseTo(0.25, 5);
  });

  it("dragging after pointer-down scrubs continuously (touch + mouse + pen)", () => {
    render(<SimulateTab />);
    const track = screen.getByRole("slider");
    track.getBoundingClientRect = () => ({ left: 0, width: 200 });
    fireEvent.pointerDown(track, { clientX: 0, pointerType: "touch" });
    expect(useToolpathStore.getState().animProgress).toBeCloseTo(0, 5);
    // Move events on the window continue the scrub while the pointer is held.
    fireEvent.pointerMove(window, { clientX: 150, pointerType: "touch" });
    expect(useToolpathStore.getState().animProgress).toBeCloseTo(0.75, 5);
    fireEvent.pointerMove(window, { clientX: 200, pointerType: "touch" });
    expect(useToolpathStore.getState().animProgress).toBeCloseTo(1, 5);
  });

  it("drag clamps progress to the [0, 1] range", () => {
    render(<SimulateTab />);
    const track = screen.getByRole("slider");
    track.getBoundingClientRect = () => ({ left: 0, width: 200 });
    fireEvent.pointerDown(track, { clientX: -80 });
    expect(useToolpathStore.getState().animProgress).toBe(0);
    fireEvent.pointerMove(window, { clientX: 999 });
    expect(useToolpathStore.getState().animProgress).toBe(1);
  });

  it("stops scrubbing after the pointer is released", () => {
    render(<SimulateTab />);
    const track = screen.getByRole("slider");
    track.getBoundingClientRect = () => ({ left: 0, width: 200 });
    fireEvent.pointerDown(track, { clientX: 100 });
    expect(useToolpathStore.getState().animProgress).toBeCloseTo(0.5, 5);
    fireEvent.pointerUp(window);
    // Further moves are ignored once the listeners are detached.
    fireEvent.pointerMove(window, { clientX: 0 });
    expect(useToolpathStore.getState().animProgress).toBeCloseTo(0.5, 5);
  });

  it("pointercancel (e.g. interrupted touch) ends the scrub", () => {
    render(<SimulateTab />);
    const track = screen.getByRole("slider");
    track.getBoundingClientRect = () => ({ left: 0, width: 200 });
    fireEvent.pointerDown(track, { clientX: 100, pointerType: "touch" });
    expect(useToolpathStore.getState().animProgress).toBeCloseTo(0.5, 5);
    fireEvent.pointerCancel(window);
    // Listeners detached on cancel — later moves are ignored.
    fireEvent.pointerMove(window, { clientX: 0 });
    expect(useToolpathStore.getState().animProgress).toBeCloseTo(0.5, 5);
  });
});
