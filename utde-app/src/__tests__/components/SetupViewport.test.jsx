import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import SetupViewport from "../../components/setup/SetupViewport";
import { useOpsStore } from "../../store/opsStore";
import { useUiStore } from "../../store/uiStore";
import { useStepStore } from "../../store/stepStore";

const POCKET = {
  id: "pocket", label: "Pocket", kind: "sub", icon: "pocket",
  requires: [{ type: "face", label: "Pocket floor", count: 1 }],
  params: [], est_time: 4.6, est_volume: 2.2,
};
const TWO_SLOT_OP = {
  id: "two-slot", label: "Two Slot", kind: "sub", icon: "pocket",
  requires: [
    { type: "face", label: "Floor",  count: 1 },
    { type: "edge", label: "Profile", count: 0 },
  ],
  params: [],
};

vi.mock("../../lib/templateLoader", () => ({
  useTemplates: () => ({ templates: [POCKET, TWO_SLOT_OP], loading: false, error: null }),
  getTemplate: (id) => [POCKET, TWO_SLOT_OP].find((t) => t.id === id) || null,
}));

// StepViewport pulls in Three.js / WebGL — stub it out.
vi.mock("../../components/viewport/StepViewport", () => ({
  default: () => <div data-testid="step-viewport" />,
}));

beforeEach(() => {
  useOpsStore.getState().reset();
  useOpsStore.setState({ entries: [] });
  useUiStore.setState({
    tab: "setup", filter: "face", scriptOverlayOpen: false,
    selectionMode: "both",
  });
  useStepStore.setState({
    selectedFaceIds:   new Set(),
    selectedEdgeIds:   new Set(),
    selectedVertexIds: new Set(),
  });
});

describe("Filter chip", () => {
  it("renders three buttons and highlights the active one", () => {
    render(<SetupViewport />);
    expect(screen.getByTitle(/Face \(1\)/)).toBeInTheDocument();
    expect(screen.getByTitle(/Edge \(2\)/)).toBeInTheDocument();
    expect(screen.getByTitle(/Vertex \(3\)/)).toBeInTheDocument();
  });

  it("clicking a button updates uiStore.filter", () => {
    render(<SetupViewport />);
    fireEvent.click(screen.getByTitle(/Edge \(2\)/));
    expect(useUiStore.getState().filter).toBe("edge");
  });

  it("syncs filter into legacy selectionMode", () => {
    render(<SetupViewport />);
    fireEvent.click(screen.getByTitle(/Edge \(2\)/));
    expect(useUiStore.getState().selectionMode).toBe("edges");
    fireEvent.click(screen.getByTitle(/Vertex \(3\)/));
    expect(useUiStore.getState().selectionMode).toBe("both");
    fireEvent.click(screen.getByTitle(/Face \(1\)/));
    expect(useUiStore.getState().selectionMode).toBe("faces");
  });

  it("shows non-zero selection counts on the chips", () => {
    useStepStore.setState({
      selectedFaceIds: new Set(["F1", "F2"]),
      selectedEdgeIds: new Set(["E1"]),
    });
    render(<SetupViewport />);
    const faceBtn = screen.getByTitle(/Face \(1\)/);
    const edgeBtn = screen.getByTitle(/Edge \(2\)/);
    expect(faceBtn.textContent).toMatch(/2/);
    expect(edgeBtn.textContent).toMatch(/1/);
  });
});

describe("Prompt banner", () => {
  it("does not appear when no prompt is active", () => {
    render(<SetupViewport />);
    expect(screen.queryByRole("dialog", { name: /Geometry prompt/i })).toBeNull();
  });

  it("appears when applyTemplate sets a prompt slot", () => {
    useOpsStore.getState().applyTemplate(POCKET);
    render(<SetupViewport />);
    expect(screen.getByRole("dialog", { name: /Geometry prompt/i })).toBeInTheDocument();
    expect(screen.getByText("Pocket floor")).toBeInTheDocument();
    expect(screen.getByText(/for Pocket/)).toBeInTheDocument();
  });

  it("shows the slot's pick count and confirms only when ≥1 pick", () => {
    useOpsStore.getState().applyTemplate(POCKET);
    const { rerender } = render(<SetupViewport />);

    const confirmBtn = screen.getByRole("button", { name: /Confirm/i });
    expect(confirmBtn).toBeDisabled();
    expect(screen.getByText(/0 picks/)).toBeInTheDocument();

    useStepStore.setState({ selectedFaceIds: new Set(["F1"]) });
    rerender(<SetupViewport />);
    expect(screen.getByText(/1 pick/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Confirm/i })).not.toBeDisabled();
  });

  it("Confirm writes picks to the active op and clears single-slot prompt", () => {
    useOpsStore.getState().applyTemplate(POCKET);
    useStepStore.setState({ selectedFaceIds: new Set(["F3", "F4"]) });
    render(<SetupViewport />);
    fireEvent.click(screen.getByRole("button", { name: /Confirm/i }));
    const op = useOpsStore.getState().entries[0];
    expect(op.geometry[0]).toEqual(["F3", "F4"]);
    expect(op.geomSummary).toBe("face × 2");
    expect(useOpsStore.getState().promptSlot).toBeNull();
    // Selection cleared
    expect(useStepStore.getState().selectedFaceIds.size).toBe(0);
  });

  it("Confirm advances to the next slot for multi-slot templates", () => {
    useOpsStore.getState().applyTemplate(TWO_SLOT_OP);
    useStepStore.setState({ selectedFaceIds: new Set(["F1"]) });
    render(<SetupViewport />);
    fireEvent.click(screen.getByRole("button", { name: /Confirm/i }));
    const { promptSlot } = useOpsStore.getState();
    expect(promptSlot).toEqual({ entryIdx: 0, slotIdx: 1 });
    // Filter advanced to the next slot's required type
    expect(useUiStore.getState().filter).toBe("edge");
  });

  it("Cancel clears the prompt and selection", () => {
    useOpsStore.getState().applyTemplate(POCKET);
    useStepStore.setState({ selectedFaceIds: new Set(["F1"]) });
    render(<SetupViewport />);
    fireEvent.click(screen.getByRole("button", { name: /Cancel/i }));
    expect(useOpsStore.getState().promptSlot).toBeNull();
    expect(useStepStore.getState().selectedFaceIds.size).toBe(0);
  });
});

describe("Status pills", () => {
  it("renders the units chip and the machine pill", () => {
    render(<SetupViewport />);
    expect(screen.getByText("mm")).toBeInTheDocument();
    expect(screen.getByText("1.00×")).toBeInTheDocument();
    expect(screen.getByText("HMC-470 · Hybrid")).toBeInTheDocument();
  });
});
