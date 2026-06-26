import { describe, it, expect, beforeEach } from "vitest";
import { renderHook } from "@testing-library/react";
import { useCursorLineSync } from "../../lib/useCursorLineSync";
import { useToolpathStore } from "../../store/toolpathStore";

const pt = (x = 0) => ({ x, y: 0, z: 0 });

const GCODE = [
  "(--- OP 01 ---)", // 0
  "G17", //            1
  "G1 X0 Y0 Z0", //    2 -> point 0
  "G1 X10 Y0 Z0", //   3 -> point 1
  "(--- OP 02 ---)", // 4
  "G1 X10 Y10 Z0", //  5 -> point 2
  "G1 X0 Y10 Z0", //   6 -> point 3
].join("\n");

const OP_RANGES = [
  { gcode_start_line: 0, gcode_end_line: 4, point_start: 0, point_end: 2 },
  { gcode_start_line: 4, gcode_end_line: 7, point_start: 2, point_end: 4 },
];

const TOOLPATHS = [
  { points: [pt(0), pt(1)] },
  { points: [pt(2), pt(3)] },
];

beforeEach(() => {
  useToolpathStore.setState({
    toolpaths: TOOLPATHS,
    gcode: GCODE,
    opRanges: OP_RANGES,
    animProgress: 1,
    isAnimating: false,
    selectedLine: null,
  });
});

describe("useCursorLineSync", () => {
  it("drives selectedLine from the cursor while scrubbing (engaged)", () => {
    useToolpathStore.setState({ animProgress: 0, selectedLine: null });
    const { result } = renderHook(() => useCursorLineSync());
    // point 0 → line 2
    expect(result.current).toBe(2);
    expect(useToolpathStore.getState().selectedLine).toBe(2);
  });

  it("returns the last line at full progress but does NOT force a selection at rest", () => {
    useToolpathStore.setState({ animProgress: 1, isAnimating: false, selectedLine: 99 });
    const { result } = renderHook(() => useCursorLineSync());
    expect(result.current).toBe(6); // point 3 → line 6 (for the HUD)
    expect(useToolpathStore.getState().selectedLine).toBe(99); // untouched
  });

  it("engages while animating even at full progress", () => {
    useToolpathStore.setState({ animProgress: 1, isAnimating: true, selectedLine: null });
    renderHook(() => useCursorLineSync());
    expect(useToolpathStore.getState().selectedLine).toBe(6);
  });

  it("returns -1 with no toolpaths", () => {
    useToolpathStore.setState({ toolpaths: [], animProgress: 0.5 });
    const { result } = renderHook(() => useCursorLineSync());
    expect(result.current).toBe(-1);
  });
});
