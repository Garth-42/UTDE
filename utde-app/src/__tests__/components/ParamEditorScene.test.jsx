import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import ParamEditorScene from "../../components/setup/ParamEditorScene";
import { useOpsStore } from "../../store/opsStore";
import { useStepStore } from "../../store/stepStore";

const importStepFromFile = vi.fn();
const importStepViaTauri = vi.fn();
const clearImportedStep  = vi.fn();

vi.mock("../../lib/stepImporter", () => ({
  importStepFromFile: (...a) => importStepFromFile(...a),
  importStepViaTauri: (...a) => importStepViaTauri(...a),
  clearImportedStep:  (...a) => clearImportedStep(...a),
}));

vi.mock("../../lib/backend", () => ({
  IS_TAURI: false,
  openStepFileDialog: vi.fn(),
  saveGcodeDialog: vi.fn(),
  getBaseUrl: vi.fn().mockResolvedValue("/api"),
  waitForServer: vi.fn().mockResolvedValue(undefined),
}));

beforeEach(() => {
  importStepFromFile.mockReset();
  importStepViaTauri.mockReset();
  clearImportedStep.mockReset();
  useOpsStore.getState().reset();
  useOpsStore.setState({ entries: [] });
  useStepStore.setState({
    faces: [], edges: [], vertices: [], fileName: null,
    selectedFaceIds: new Set(), selectedEdgeIds: new Set(),
    selectedVertexIds: new Set(),
    isLoading: false, error: null,
  });
});

describe("ParamEditorScene", () => {
  it("renders nothing when active is not a scene row", () => {
    useOpsStore.getState().applyOrient();
    const { container } = render(<ParamEditorScene />);
    expect(container.firstChild).toBeNull();
  });

  it("import: shows current file label + Choose file… label-as-button", () => {
    useOpsStore.getState().applyScene("import");
    render(<ParamEditorScene />);
    expect(screen.getByText(/Import CAD/)).toBeInTheDocument();
    expect(screen.getByText(/no file loaded/i)).toBeInTheDocument();
    const trigger = screen.getByText(/Choose file/i);
    expect(trigger.closest("label")).not.toBeNull();
  });

  it("import: reflects the linked filename from stepStore", () => {
    useStepStore.setState({ fileName: "bracket.step" });
    useOpsStore.getState().applyScene("import");
    render(<ParamEditorScene />);
    expect(screen.getByText("bracket.step")).toBeInTheDocument();
  });

  it("import: choosing a file forwards to importStepFromFile", async () => {
    useOpsStore.getState().applyScene("import");
    render(<ParamEditorScene />);
    const input = document.querySelector('input[type="file"]');
    const file = new File(["dummy"], "rev3.step");
    fireEvent.change(input, { target: { files: [file] } });
    expect(importStepFromFile).toHaveBeenCalledWith(file);
  });

  it("clear: shows current file + disabled button when nothing loaded", () => {
    useOpsStore.getState().applyScene("clear");
    render(<ParamEditorScene />);
    expect(screen.getByText(/Clear part/i)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Clear build area/i })).toBeDisabled();
  });

  it("clear: button enabled when something is loaded, calls clearImportedStep", () => {
    useStepStore.setState({ fileName: "bracket.step" });
    useOpsStore.getState().applyScene("clear");
    render(<ParamEditorScene />);
    const btn = screen.getByRole("button", { name: /Clear build area/i });
    expect(btn).not.toBeDisabled();
    fireEvent.click(btn);
    expect(clearImportedStep).toHaveBeenCalled();
  });

  it("close button switches back to library mode", () => {
    useOpsStore.getState().applyScene("import");
    render(<ParamEditorScene />);
    fireEvent.click(screen.getByTitle(/Back to library/i));
    expect(useOpsStore.getState().rpMode).toBe("library");
  });
});
