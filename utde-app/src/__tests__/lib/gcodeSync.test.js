import { describe, it, expect } from "vitest";
import {
  isMotionLine,
  buildLineToPointMap,
  buildPointToLineMap,
} from "../../lib/gcodeSync";

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
