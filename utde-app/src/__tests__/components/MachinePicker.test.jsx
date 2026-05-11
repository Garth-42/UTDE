import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import MachinePicker from "../../components/MachinePicker";
import { useMachineStore } from "../../store/machineStore";

const fetchMachines  = vi.fn();
const importMachine  = vi.fn();
vi.mock("../../lib/machineLoader", () => ({
  fetchMachines: (...args) => fetchMachines(...args),
  importMachine: (...args) => importMachine(...args),
  useMachines:   () => {
    const s = useMachineStore.getState();
    return {
      available: s.available,
      currentId: s.currentId,
      loading:   s.loading,
      error:     s.error,
    };
  },
}));

const AC = {
  id: "generic_5axis_ac", name: "generic_5axis_ac",
  axis_count: 5, tool_axes: ["X", "Y", "Z"], workpiece_axes: ["A", "C"],
};
const ROB = {
  id: "generic_6dof_robot", name: "generic_6dof_robot",
  axis_count: 6, tool_axes: ["J1","J2","J3","J4","J5","J6"], workpiece_axes: [],
};

beforeEach(() => {
  fetchMachines.mockReset();
  importMachine.mockReset();
  useMachineStore.setState({
    available: [AC, ROB], currentId: "generic_5axis_ac",
    loading: false, error: null,
  });
});

describe("MachinePicker", () => {
  it("renders nothing when closed", () => {
    const { container } = render(
      <MachinePicker open={false} onClose={() => {}} />
    );
    expect(container.firstChild).toBeNull();
  });

  it("lists every available machine when open", () => {
    render(<MachinePicker open={true} onClose={() => {}} />);
    expect(screen.getByText("generic_5axis_ac")).toBeInTheDocument();
    expect(screen.getByText("generic_6dof_robot")).toBeInTheDocument();
    // Axis chip shows both kinematic chains
    expect(screen.getByText(/5-axis · X Y Z A C/)).toBeInTheDocument();
    expect(screen.getByText(/6-axis · J1 J2 J3 J4 J5 J6/)).toBeInTheDocument();
  });

  it("clicking a machine sets it as current and closes the popover", () => {
    const onClose = vi.fn();
    render(<MachinePicker open={true} onClose={onClose} />);
    fireEvent.click(screen.getByText("generic_6dof_robot"));
    expect(useMachineStore.getState().currentId).toBe("generic_6dof_robot");
    expect(onClose).toHaveBeenCalled();
  });

  it("Refresh calls fetchMachines", () => {
    render(<MachinePicker open={true} onClose={() => {}} />);
    fetchMachines.mockResolvedValue([]);
    fireEvent.click(screen.getByTitle("Refresh list"));
    expect(fetchMachines).toHaveBeenCalled();
  });

  it("Import button triggers the hidden file input", () => {
    render(<MachinePicker open={true} onClose={() => {}} />);
    const input = document.querySelector('input[type="file"]');
    const clickSpy = vi.fn();
    input.click = clickSpy;
    fireEvent.click(screen.getByRole("button", { name: /Import YAML/i }));
    expect(clickSpy).toHaveBeenCalled();
  });

  it("a chosen YAML calls importMachine", async () => {
    importMachine.mockResolvedValue({ id: "new", name: "new", axis_count: 3 });
    render(<MachinePicker open={true} onClose={() => {}} />);
    const input = document.querySelector('input[type="file"]');
    const file = new File(["name: x"], "myrig.yaml", { type: "application/x-yaml" });
    fireEvent.change(input, { target: { files: [file] } });
    await waitFor(() => expect(importMachine).toHaveBeenCalledWith(file));
  });

  it("renders an empty-state when no machines are available", () => {
    useMachineStore.setState({ available: [], currentId: null, loading: false, error: null });
    render(<MachinePicker open={true} onClose={() => {}} />);
    expect(screen.getByText(/No machines/i)).toBeInTheDocument();
  });

  it("surfaces the store error", () => {
    useMachineStore.setState({
      available: [AC], currentId: "generic_5axis_ac",
      loading: false, error: "kaboom",
    });
    render(<MachinePicker open={true} onClose={() => {}} />);
    expect(screen.getByText("kaboom")).toBeInTheDocument();
  });
});
