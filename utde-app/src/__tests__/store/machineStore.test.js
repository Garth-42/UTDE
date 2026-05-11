import { describe, it, expect, beforeEach } from "vitest";
import { useMachineStore } from "../../store/machineStore";

const INITIAL = {
  available: [], currentId: null, loading: false, error: null,
};

beforeEach(() => useMachineStore.setState(INITIAL));

const A = { id: "ac",  name: "5-Axis AC",  axis_count: 5 };
const B = { id: "bc",  name: "5-Axis BC",  axis_count: 5 };
const C = { id: "rob", name: "6-DOF Robot", axis_count: 6 };

describe("setAvailable", () => {
  it("populates the list and defaults currentId to the first entry", () => {
    useMachineStore.getState().setAvailable([A, B]);
    expect(useMachineStore.getState().available).toHaveLength(2);
    expect(useMachineStore.getState().currentId).toBe("ac");
  });

  it("preserves currentId when the chosen machine is still present", () => {
    useMachineStore.setState({ ...INITIAL, currentId: "bc" })   /* merge keeps actions */;
    useMachineStore.getState().setAvailable([A, B]);
    expect(useMachineStore.getState().currentId).toBe("bc");
  });

  it("falls back to the first machine when currentId is gone", () => {
    useMachineStore.setState({ ...INITIAL, currentId: "bc" })   /* merge keeps actions */;
    useMachineStore.getState().setAvailable([A]);
    expect(useMachineStore.getState().currentId).toBe("ac");
  });

  it("falls back to null when the list is empty", () => {
    useMachineStore.setState({ ...INITIAL, currentId: "bc" })   /* merge keeps actions */;
    useMachineStore.getState().setAvailable([]);
    expect(useMachineStore.getState().currentId).toBeNull();
  });
});

describe("setCurrentId", () => {
  it("updates currentId directly", () => {
    useMachineStore.getState().setAvailable([A, B]);
    useMachineStore.getState().setCurrentId("bc");
    expect(useMachineStore.getState().currentId).toBe("bc");
  });
});

describe("appendMachine", () => {
  it("adds a new machine, sorts alphabetically, and selects it", () => {
    useMachineStore.getState().setAvailable([A]);
    useMachineStore.getState().appendMachine(C);
    const ids = useMachineStore.getState().available.map((m) => m.id);
    // "5-Axis AC" sorts before "6-DOF Robot" alphabetically
    expect(ids).toEqual(["ac", "rob"]);
    expect(useMachineStore.getState().currentId).toBe("rob");
  });

  it("replaces an existing entry with the same id", () => {
    useMachineStore.getState().setAvailable([A, B]);
    const updated = { ...A, name: "5-Axis AC (revised)" };
    useMachineStore.getState().appendMachine(updated);
    const ac = useMachineStore.getState().available.find((m) => m.id === "ac");
    expect(ac.name).toBe("5-Axis AC (revised)");
    expect(useMachineStore.getState().available).toHaveLength(2);
    expect(useMachineStore.getState().currentId).toBe("ac");
  });
});
