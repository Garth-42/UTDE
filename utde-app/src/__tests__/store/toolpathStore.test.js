import { describe, it, expect, beforeEach } from "vitest";
import { useToolpathStore } from "../../store/toolpathStore";

beforeEach(() => {
  useToolpathStore.setState({
    toolpaths: [],
    activeIds: new Set(),
    gcode: "",
    opRanges: [],
    warnings: [],
    selectedLine: null,
  });
});

describe("toolpathStore selectedLine", () => {
  it("sets a line", () => {
    useToolpathStore.getState().setSelectedLine(7);
    expect(useToolpathStore.getState().selectedLine).toBe(7);
  });

  it("toggles the same line off, switches to a different one", () => {
    const { toggleSelectedLine } = useToolpathStore.getState();
    toggleSelectedLine(3);
    expect(useToolpathStore.getState().selectedLine).toBe(3);
    toggleSelectedLine(3);
    expect(useToolpathStore.getState().selectedLine).toBeNull();
    toggleSelectedLine(5);
    expect(useToolpathStore.getState().selectedLine).toBe(5);
  });

  it("clears the selection on a new compile result", () => {
    useToolpathStore.getState().setSelectedLine(4);
    useToolpathStore.getState().setCompileResult({
      toolpaths: [],
      gcode: "G1 X0",
      opRanges: [],
      warnings: [],
    });
    expect(useToolpathStore.getState().selectedLine).toBeNull();
  });

  it("clears the selection when toolpaths are cleared", () => {
    useToolpathStore.getState().setSelectedLine(2);
    useToolpathStore.getState().clearToolpaths();
    expect(useToolpathStore.getState().selectedLine).toBeNull();
  });
});
