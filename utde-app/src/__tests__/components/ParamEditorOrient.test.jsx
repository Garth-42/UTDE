import { describe, it, expect, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import ParamEditorOrient from "../../components/setup/ParamEditorOrient";
import { useOpsStore } from "../../store/opsStore";

beforeEach(() => {
  useOpsStore.getState().reset();
  useOpsStore.setState({ entries: [] });
});

function setupActiveOrient() {
  useOpsStore.getState().applyOrient();
}

describe("ParamEditorOrient", () => {
  it("renders the panel with the orient summary", () => {
    setupActiveOrient();
    render(<ParamEditorOrient />);
    // Panel-head shows "Orientation" (uppercase) and summary shows "Orient"
    expect(screen.getByText("Orientation")).toBeInTheDocument();
    expect(screen.getByText("Orient")).toBeInTheDocument();
  });

  it("shows an empty-state when the chain has no rules", () => {
    setupActiveOrient();
    render(<ParamEditorOrient />);
    expect(screen.getByText(/No rules yet/i)).toBeInTheDocument();
  });

  it("Add inserts the picked rule type with its defaults", () => {
    setupActiveOrient();
    render(<ParamEditorOrient />);
    fireEvent.click(screen.getByRole("button", { name: /Add/i }));
    const rules = useOpsStore.getState().entries[0].rules;
    expect(rules).toEqual([{ type: "fixed", x: 0, y: 0, z: -1 }]);
  });

  it("Add respects the rule-type dropdown selection", () => {
    setupActiveOrient();
    render(<ParamEditorOrient />);
    fireEvent.change(screen.getByRole("combobox"), { target: { value: "lead" } });
    fireEvent.click(screen.getByRole("button", { name: /Add/i }));
    const rules = useOpsStore.getState().entries[0].rules;
    expect(rules).toEqual([{ type: "lead", angle: 10 }]);
  });

  it("editing a rule field updates the store", () => {
    setupActiveOrient();
    useOpsStore.getState().addOrientRule(0, { type: "lead", angle: 10 });
    render(<ParamEditorOrient />);
    const input = screen.getByRole("spinbutton");
    fireEvent.change(input, { target: { value: "25" } });
    expect(useOpsStore.getState().entries[0].rules[0].angle).toBe(25);
  });

  it("Remove deletes a rule by index", () => {
    setupActiveOrient();
    useOpsStore.getState().addOrientRule(0, { type: "lead", angle: 10 });
    useOpsStore.getState().addOrientRule(0, { type: "side_tilt", angle: 5 });
    render(<ParamEditorOrient />);
    const removeBtns = screen.getAllByTitle(/Remove rule/i);
    fireEvent.click(removeBtns[0]);
    const rules = useOpsStore.getState().entries[0].rules;
    expect(rules).toEqual([{ type: "side_tilt", angle: 5 }]);
  });

  it("preview line reflects the current chain", () => {
    setupActiveOrient();
    useOpsStore.getState().addOrientRule(0, { type: "fixed", x: 0, y: 0, z: -1 });
    useOpsStore.getState().addOrientRule(0, { type: "lead",  angle: 15 });
    render(<ParamEditorOrient />);
    expect(screen.getByText(/\.orient\(fixed\(0, 0, -1\)\)/)).toBeInTheDocument();
    expect(screen.getByText(/\.orient\(lead\(15\)\)/)).toBeInTheDocument();
  });

  it("renders nothing when the active entry is not an orient row", () => {
    useOpsStore.getState().applyTemplate({
      id: "x", label: "X", kind: "sub",
      requires: [], params: [],
    });
    const { container } = render(<ParamEditorOrient />);
    expect(container.firstChild).toBeNull();
  });
});
