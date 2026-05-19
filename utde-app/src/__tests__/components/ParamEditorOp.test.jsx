import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import ParamEditorOp from "../../components/setup/ParamEditorOp";
import { useOpsStore } from "../../store/opsStore";
import { useUiStore } from "../../store/uiStore";
import { useStepStore } from "../../store/stepStore";

const POCKET = {
  id: "pocket", label: "Pocket", kind: "sub", icon: "pocket",
  requires: [{ type: "face", label: "Pocket floor" }],
  params: [
    { id: "depth",    type: "number",  default: 8.0, unit: "mm", label: "Total depth" },
    { id: "stepdown", type: "number",  default: 1.5, unit: "mm", label: "Step down" },
    { id: "tool",     type: "select",  default: "T11", options: ["T07", "T11"], label: "Tool" },
    { id: "climb",    type: "segment", default: "climb", options: ["climb", "conv."], label: "Cut direction" },
  ],
  est_time: 4.6, est_volume: 2.2,
};

const PRUSASLICER = {
  id: "prusaslicer", label: "PrusaSlicer", kind: "add", icon: "add-layer",
  requires: [{ type: "model", label: "Model to slice", count: 1 }],
  params: [
    { id: "layer_height", type: "number",  default: 0.2, unit: "mm", label: "Layer height" },
    { id: "config_file",  type: "text",    default: "",  label: "Profile path (.ini)",
      hint: "Optional — load a PrusaSlicer .ini profile" },
  ],
  est_time: 45.0, est_volume: 18.0,
};

vi.mock("../../lib/templateLoader", () => ({
  useTemplates: () => ({ templates: [POCKET, PRUSASLICER], loading: false, error: null }),
  getTemplate: (id) => ({ pocket: POCKET, prusaslicer: PRUSASLICER }[id] ?? null),
}));

const previewActiveOp = vi.fn();
vi.mock("../../lib/timelineCompiler", () => ({
  previewActiveOp: (...a) => previewActiveOp(...a),
  compileTimeline: vi.fn(),
}));

beforeEach(() => {
  useOpsStore.getState().reset();
  useOpsStore.setState({ entries: [] });
  useUiStore.setState({ tab: "setup", filter: "face", scriptOverlayOpen: false });
  useStepStore.setState({ fileName: null, selectedFaceIds: new Set(), selectedEdgeIds: new Set(), selectedVertexIds: new Set() });
});

function setupActivePocket() {
  useOpsStore.getState().applyTemplate(POCKET);
}

describe("ParamEditorOp", () => {
  it("shows the empty state when nothing is active", () => {
    render(<ParamEditorOp />);
    expect(screen.getByText(/No operation selected/i)).toBeInTheDocument();
  });

  it("renders the op name and 'op 01' summary when active", () => {
    setupActivePocket();
    render(<ParamEditorOp />);
    expect(screen.getByText("Pocket")).toBeInTheDocument();
    expect(screen.getByText(/Subtractive · op 01/i)).toBeInTheDocument();
  });

  it("renders a geometry slot per requires entry", () => {
    setupActivePocket();
    render(<ParamEditorOp />);
    expect(screen.getByText("Pocket floor")).toBeInTheDocument();
    expect(screen.getByText(/Click to pick/i)).toBeInTheDocument();
  });

  it("clicking a geometry slot opens the prompt for that slot", () => {
    setupActivePocket();
    useOpsStore.setState({ promptSlot: null });   // clear initial prompt
    render(<ParamEditorOp />);
    fireEvent.click(screen.getByText("Pocket floor"));
    expect(useOpsStore.getState().promptSlot).toEqual({ entryIdx: 0, slotIdx: 0 });
    expect(useUiStore.getState().filter).toBe("face");
  });

  it("number field updates store via updateParam", () => {
    setupActivePocket();
    render(<ParamEditorOp />);
    const inputs = screen.getAllByRole("spinbutton");
    fireEvent.change(inputs[0], { target: { value: "12.5" } });
    expect(useOpsStore.getState().entries[0].params.depth).toBe(12.5);
  });

  it("select field updates store via updateParam", () => {
    setupActivePocket();
    render(<ParamEditorOp />);
    const select = screen.getByRole("combobox");
    fireEvent.change(select, { target: { value: "T07" } });
    expect(useOpsStore.getState().entries[0].params.tool).toBe("T07");
  });

  it("segment buttons update store via updateParam", () => {
    setupActivePocket();
    render(<ParamEditorOp />);
    fireEvent.click(screen.getByRole("button", { name: "conv." }));
    expect(useOpsStore.getState().entries[0].params.climb).toBe("conv.");
  });

  it("preview strip shows est_time, est_volume, and total picks", () => {
    setupActivePocket();
    useOpsStore.getState().setGeometryForSlot(0, 0, ["F1", "F2"]);
    render(<ParamEditorOp />);
    expect(screen.getByText("4.6 min")).toBeInTheDocument();
    expect(screen.getByText("2.20 cm³")).toBeInTheDocument();
    // 2 picks
    expect(screen.getByText("2")).toBeInTheDocument();
  });

  it("close button switches back to library mode", () => {
    setupActivePocket();
    render(<ParamEditorOp />);
    fireEvent.click(screen.getByTitle(/Back to library/i));
    expect(useOpsStore.getState().rpMode).toBe("library");
    expect(useOpsStore.getState().promptSlot).toBeNull();
  });

  it("renders a Preview toolpath button that calls previewActiveOp", async () => {
    previewActiveOp.mockReset();
    previewActiveOp.mockResolvedValue({});
    setupActivePocket();
    render(<ParamEditorOp />);
    fireEvent.click(screen.getByRole("button", { name: /Preview toolpath/i }));
    expect(previewActiveOp).toHaveBeenCalled();
  });

  it("surfaces a preview error inline", async () => {
    previewActiveOp.mockReset();
    previewActiveOp.mockRejectedValue(new Error("oof"));
    setupActivePocket();
    render(<ParamEditorOp />);
    fireEvent.click(screen.getByRole("button", { name: /Preview toolpath/i }));
    await screen.findByText("oof");
  });

  describe("model slot (prusaslicer)", () => {
    function setupActivePrusaSlicer() {
      useOpsStore.getState().applyTemplate(PRUSASLICER);
    }

    it("shows 'Click to select model' when model slot is empty", () => {
      setupActivePrusaSlicer();
      render(<ParamEditorOp />);
      expect(screen.getByText(/Click to select model/i)).toBeInTheDocument();
    });

    it("shows filename when model slot is filled with __model__", () => {
      setupActivePrusaSlicer();
      useStepStore.setState({ fileName: "bracket.step" });
      useOpsStore.getState().setGeometryForSlot(0, 0, ["__model__"]);
      render(<ParamEditorOp />);
      expect(screen.getByText("bracket.step")).toBeInTheDocument();
    });

    it("shows 'model' as the fallback when slot filled but no file loaded", () => {
      setupActivePrusaSlicer();
      useOpsStore.getState().setGeometryForSlot(0, 0, ["__model__"]);
      render(<ParamEditorOp />);
      expect(screen.getByText("model")).toBeInTheDocument();
    });

    it("slot shows 'whole model' in meta row", () => {
      setupActivePrusaSlicer();
      render(<ParamEditorOp />);
      expect(screen.getByText("whole model")).toBeInTheDocument();
    });
  });

  describe("text param field", () => {
    function setupActivePrusaSlicer() {
      useOpsStore.getState().applyTemplate(PRUSASLICER);
    }

    it("renders a text input for config_file param", () => {
      setupActivePrusaSlicer();
      render(<ParamEditorOp />);
      const textInputs = screen.getAllByRole("textbox");
      expect(textInputs.length).toBeGreaterThan(0);
    });

    it("text input fires updateParam with the typed value", () => {
      setupActivePrusaSlicer();
      render(<ParamEditorOp />);
      const textInputs = screen.getAllByRole("textbox");
      fireEvent.change(textInputs[0], { target: { value: "/home/user/profile.ini" } });
      expect(useOpsStore.getState().entries[0].params.config_file).toBe("/home/user/profile.ini");
    });
  });
});
