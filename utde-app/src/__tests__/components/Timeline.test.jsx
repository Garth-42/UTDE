import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, within } from "@testing-library/react";
import Timeline from "../../components/setup/Timeline";
import { useOpsStore } from "../../store/opsStore";

const POCKET = {
  id: "pocket", label: "Pocket", kind: "sub", icon: "pocket",
  requires: [{ type: "face", label: "Pocket floor" }],
  params: [], est_time: 4.6, est_volume: 2.2,
};
const DEPOSIT = {
  id: "deposit-layer", label: "Deposit Layer", kind: "add", icon: "add-layer",
  requires: [{ type: "face", label: "Build surface" }],
  params: [], est_time: 14.2, est_volume: 6.8,
};

vi.mock("../../lib/templateLoader", () => ({
  useTemplates: () => ({
    templates: [POCKET, DEPOSIT],
    loading: false,
    error: null,
  }),
  getTemplate: (id) => [POCKET, DEPOSIT].find((t) => t.id === id) || null,
}));

beforeEach(() => {
  useOpsStore.getState().reset();
  useOpsStore.setState({ entries: [] });
});

describe("Timeline", () => {
  it("renders the panel header", () => {
    render(<Timeline />);
    expect(screen.getByText(/Setup & Operations/i)).toBeInTheDocument();
  });

  it("shows '0 entries' divider when timeline is empty", () => {
    render(<Timeline />);
    expect(screen.getByText(/Operations · 0/i)).toBeInTheDocument();
  });

  it("renders an op row with name and template metadata", () => {
    useOpsStore.getState().applyTemplate(POCKET);
    render(<Timeline />);
    expect(screen.getByText("Pocket")).toBeInTheDocument();
    expect(screen.getByText(/Operations · 1/i)).toBeInTheDocument();
    // "4.6 min" appears both in the row chip and in the cycle summary
    expect(screen.getAllByText("4.6 min").length).toBeGreaterThan(0);
  });

  it("renders an orient row with rule count chip", () => {
    useOpsStore.getState().applyOrient();
    render(<Timeline />);
    expect(screen.getByText("Orient")).toBeInTheDocument();
    expect(screen.getByText("no rules")).toBeInTheDocument();

    useOpsStore.getState().addOrientRule(0, { type: "to_normal" });
    useOpsStore.getState().addOrientRule(0, { type: "lead", angle: 10 });
    expect(useOpsStore.getState().entries[0].rules).toHaveLength(2);
  });

  it("clicking a row activates it", () => {
    useOpsStore.getState().applyTemplate(POCKET);
    useOpsStore.getState().applyTemplate(DEPOSIT);
    useOpsStore.getState().pickActive(null);  // start with no active
    render(<Timeline />);
    fireEvent.click(screen.getByText("Deposit Layer"));
    expect(useOpsStore.getState().activeIdx).toBe(1);
  });

  it("'Add operation' button switches rpMode to library", () => {
    render(<Timeline />);
    useOpsStore.getState().setRpMode("params");
    fireEvent.click(screen.getByText(/Add operation/i));
    expect(useOpsStore.getState().rpMode).toBe("library");
  });


  it("visibility toggle flips entry.visible", () => {
    useOpsStore.getState().applyTemplate(POCKET);
    render(<Timeline />);
    const visBtns = screen.getAllByTitle(/Hide|Show/);
    fireEvent.click(visBtns[0]);
    expect(useOpsStore.getState().entries[0].visible).toBe(false);
  });

  it("each row has a trash button that removes it from the timeline", () => {
    useOpsStore.getState().applyTemplate(POCKET);
    useOpsStore.getState().applyTemplate(DEPOSIT);
    render(<Timeline />);
    expect(useOpsStore.getState().entries).toHaveLength(2);
    const trashBtns = screen.getAllByTitle(/Remove from timeline/);
    expect(trashBtns).toHaveLength(2);
    fireEvent.click(trashBtns[0]);
    const ids = useOpsStore.getState().entries.map((e) => e.templateId);
    expect(ids).toEqual(["deposit-layer"]);
  });

  it("cycle summary aggregates time and volume by op kind", () => {
    useOpsStore.getState().applyTemplate(POCKET);    // sub: time 4.6, removed 2.2
    useOpsStore.getState().applyTemplate(DEPOSIT);   // add: time 14.2, deposited 6.8
    render(<Timeline />);
    expect(screen.getByText("18.8 min")).toBeInTheDocument();
    expect(screen.getByText("2.2 cm³")).toBeInTheDocument();   // removed
    expect(screen.getByText("6.8 cm³")).toBeInTheDocument();   // deposited
  });
});
