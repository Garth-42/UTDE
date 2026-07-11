import { describe, it, expect } from "vitest";
import {
  isMotionLine,
  buildLineToPointMap,
  buildPointToLineMap,
  cursorGlobalIndex,
  nearestToolpathPointIndex,
  gcodeLineForPoint,
} from "../../lib/gcodeSync";

const pt = (x = 0) => ({ x, y: 0, z: 0 });
const TOOLPATHS = [
  { points: [pt(0), pt(1)] }, // global 0,1
  { points: [pt(2), pt(3)] }, // global 2,3
];

describe("isMotionLine", () => {
  it("is true for lines with X/Y/Z coordinates", () => {
    expect(isMotionLine("G1 X0 Y0 Z0 F600")).toBe(true);
    expect(isMotionLine("G0 Z50")).toBe(true);
    expect(isMotionLine("g1 x10")).toBe(true);
  });

  it("is false for comments, setup codes, and blanks", () => {
    expect(isMotionLine("(--- OP 01  First ---)")).toBe(false);
    expect(isMotionLine("( Toolpath: op_0 )")).toBe(false);
    expect(isMotionLine("G17")).toBe(false);
    expect(isMotionLine("M30")).toBe(false);
    expect(isMotionLine("F600")).toBe(false); // feed only, no motion
    expect(isMotionLine("")).toBe(false);
  });
});

// Two ops; motion lines within each op map 1:1 to that op's points.
const GCODE = [
  "(--- OP 01  First ---)", // 0
  "( Toolpath: op_0 )", //      1
  "G17", //                     2
  "G1 X0 Y0 Z0 F600", //        3 -> point 0
  "G1 X10 Y0 Z0", //            4 -> point 1
  "M30", //                     5
  "(--- OP 02  Second ---)", // 6
  "G1 X10 Y10 Z0", //          7 -> point 2
  "G1 X0 Y10 Z0", //           8 -> point 3
].join("\n");

const OP_RANGES = [
  { gcode_start_line: 0, gcode_end_line: 6, point_start: 0, point_end: 2 },
  { gcode_start_line: 6, gcode_end_line: 9, point_start: 2, point_end: 4 },
];

describe("buildLineToPointMap", () => {
  it("maps motion lines to global point indices, others to -1", () => {
    const map = buildLineToPointMap(GCODE, OP_RANGES);
    expect(map[3]).toBe(0);
    expect(map[4]).toBe(1);
    expect(map[7]).toBe(2);
    expect(map[8]).toBe(3);
    // non-motion lines
    expect(map[0]).toBe(-1);
    expect(map[2]).toBe(-1);
    expect(map[5]).toBe(-1);
    expect(map[6]).toBe(-1);
  });

  it("handles empty input", () => {
    expect(buildLineToPointMap("", [])).toEqual([-1]);
    expect(buildLineToPointMap(GCODE, [])).not.toContain(0);
  });
});

describe("buildPointToLineMap", () => {
  it("inverts the mapping (point → first rendering line)", () => {
    const rev = buildPointToLineMap(GCODE, OP_RANGES, 4);
    expect(rev).toEqual([3, 4, 7, 8]);
  });
});

describe("cursorGlobalIndex", () => {
  it("returns the first point at progress 0 and the last at 1", () => {
    expect(cursorGlobalIndex(TOOLPATHS, 0)).toBe(0);
    expect(cursorGlobalIndex(TOOLPATHS, 1)).toBe(3);
  });

  it("returns -1 with no toolpaths", () => {
    expect(cursorGlobalIndex([], 0.5)).toBe(-1);
  });

  it("composes with the reverse map to give the cursor's G-code line", () => {
    const rev = buildPointToLineMap(GCODE, OP_RANGES, 4);
    expect(rev[cursorGlobalIndex(TOOLPATHS, 1)]).toBe(8); // last point → line 8
    expect(rev[cursorGlobalIndex(TOOLPATHS, 0)]).toBe(3); // first point → line 3
  });
});

describe("nearestToolpathPointIndex", () => {
  it("returns the global index of the closest point", () => {
    expect(nearestToolpathPointIndex(TOOLPATHS, [0.1, 0, 0])).toBe(0);
    expect(nearestToolpathPointIndex(TOOLPATHS, [1.4, 0, 0])).toBe(1); // closer to x=1
    expect(nearestToolpathPointIndex(TOOLPATHS, [2.1, 0, 0])).toBe(2);
    expect(nearestToolpathPointIndex(TOOLPATHS, [3.0, 0, 0])).toBe(3);
  });
  it("returns -1 with no toolpaths", () => {
    expect(nearestToolpathPointIndex([], [0, 0, 0])).toBe(-1);
  });
});

describe("gcodeLineForPoint", () => {
  it("maps a 3D click to the nearest point's G-code line", () => {
    expect(gcodeLineForPoint(TOOLPATHS, GCODE, OP_RANGES, [0.1, 0, 0])).toBe(3);
    expect(gcodeLineForPoint(TOOLPATHS, GCODE, OP_RANGES, [2.1, 0, 0])).toBe(7);
    expect(gcodeLineForPoint(TOOLPATHS, GCODE, OP_RANGES, [3.0, 0, 0])).toBe(8);
  });
  it("returns -1 with no toolpaths", () => {
    expect(gcodeLineForPoint([], GCODE, OP_RANGES, [0, 0, 0])).toBe(-1);
  });
});

// The post-processor supplies an exact point→line table (point_lines). It's
// robust where the text heuristic isn't: modally-suppressed duplicate points
// share the previous point's motion line, so there are fewer motion lines than
// points and the "one line per point" assumption drifts.
describe("explicit pointLines map", () => {
  // 4 points; point 2 repeats point 1's position/feed so it emits no new line
  // and shares line 2. Only 3 motion lines for 4 points.
  const GCODE_DUP = [
    "(--- OP 01 ---)", //   0
    "G1 X0 Y0 Z0 F600", //  1 <- point 0
    "G1 X10", //            2 <- points 1 and 2 (suppressed duplicate)
    "G1 X20", //            3 <- point 3
  ].join("\n");
  const POINT_LINES = [1, 2, 2, 3];
  const DUP_TPS = [{ points: [pt(0), pt(10), pt(10), pt(20)] }];

  it("buildPointToLineMap returns the table verbatim", () => {
    expect(buildPointToLineMap(GCODE_DUP, [], 4, POINT_LINES)).toEqual([1, 2, 2, 3]);
  });

  it("buildLineToPointMap inverts it — the point that moved owns the line", () => {
    const map = buildLineToPointMap(GCODE_DUP, [], POINT_LINES);
    expect(map[1]).toBe(0);
    expect(map[2]).toBe(1); // not 2: the duplicate doesn't steal the line
    expect(map[3]).toBe(3);
  });

  it("gcodeLineForPoint uses the explicit map", () => {
    expect(gcodeLineForPoint(DUP_TPS, GCODE_DUP, [], [20, 0, 0], POINT_LINES)).toBe(3);
    expect(gcodeLineForPoint(DUP_TPS, GCODE_DUP, [], [10, 0, 0], POINT_LINES)).toBe(2);
  });

  it("falls back to the heuristic when pointLines is empty/absent", () => {
    expect(buildPointToLineMap(GCODE, OP_RANGES, 4, [])).toEqual([3, 4, 7, 8]);
    expect(buildPointToLineMap(GCODE, OP_RANGES, 4, null)).toEqual([3, 4, 7, 8]);
  });
});
