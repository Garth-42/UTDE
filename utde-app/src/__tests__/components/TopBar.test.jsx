import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import TopBar from "../../components/TopBar";
import { useUiStore } from "../../store/uiStore";
import { useStepStore } from "../../store/stepStore";
import { useToolpathStore } from "../../store/toolpathStore";

vi.mock("../../lib/backend", () => ({
  IS_TAURI: false,
  openStepFileDialog: vi.fn(),
  saveGcodeDialog: vi.fn(),
  getBaseUrl: vi.fn().mockResolvedValue("/api"),
  waitForServer: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("../../lib/timelineCompiler", () => ({
  compileTimeline: vi.fn().mockResolvedValue({ points: [], op_ranges: [], gcode: "" }),
}));

beforeEach(() => {
  useUiStore.setState({
    tab: "setup", filter: "face", scriptOverlayOpen: false,
  });
  useStepStore.setState({
    faces: [], edges: [], vertices: [], fileName: null,
    selectedFaceIds: new Set(), selectedEdgeIds: new Set(),
    selectedVertexIds: new Set(),
    isLoading: false, error: null,
  });
  useToolpathStore.setState({
    isCompiling: false, compileError: null,
  });
});

describe("TopBar — tabs", () => {
  it("switches the active tab when a button is clicked", () => {
    render(<TopBar />);
    fireEvent.click(screen.getByRole("tab", { name: /Simulate/i }));
    expect(useUiStore.getState().tab).toBe("simulate");
    fireEvent.click(screen.getByRole("tab", { name: /Post/i }));
    expect(useUiStore.getState().tab).toBe("post");
  });
});

describe("TopBar — brand", () => {
  it("shows 'no file' when nothing is imported", () => {
    render(<TopBar />);
    expect(screen.getByText("no file")).toBeInTheDocument();
  });

  it("shows the linked file name once a STEP is loaded", () => {
    useStepStore.setState({ fileName: "bracket.step" });
    render(<TopBar />);
    expect(screen.getByText("bracket.step")).toBeInTheDocument();
  });
});

describe("TopBar — script toggle", () => {
  it("toggles scriptOverlayOpen on each click", () => {
    render(<TopBar />);
    const btn = screen.getByTitle(/Show generated Python/i);
    fireEvent.click(btn);
    expect(useUiStore.getState().scriptOverlayOpen).toBe(true);
    fireEvent.click(btn);
    expect(useUiStore.getState().scriptOverlayOpen).toBe(false);
  });
});

describe("TopBar — Run setup", () => {
  it("disables and shows Compiling… while compileTimeline is in flight", () => {
    useToolpathStore.setState({ isCompiling: true });
    render(<TopBar />);
    const btn = screen.getByRole("button", { name: /Compiling/i });
    expect(btn).toBeDisabled();
  });
});
