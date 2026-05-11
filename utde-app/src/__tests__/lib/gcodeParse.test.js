import { describe, it, expect } from "vitest";
import { parseGcodeLine, kindForLine } from "../../lib/gcodeParse";

describe("parseGcodeLine", () => {
  it("empty line yields no spans", () => {
    expect(parseGcodeLine("")).toEqual([]);
  });

  it("treats a `(...)` line as a comment", () => {
    expect(parseGcodeLine("(--- OP 01  Pocket ---)")).toEqual([
      { type: "comment", text: "(--- OP 01  Pocket ---)" },
    ]);
  });

  it("treats `;` to end of line as a comment", () => {
    const spans = parseGcodeLine("G1 X10 ; rapid move");
    const last = spans[spans.length - 1];
    expect(last.type).toBe("comment");
    expect(last.text).toBe("; rapid move");
  });

  it("treats a line starting with `;` as a whole-line comment", () => {
    expect(parseGcodeLine(";layer 0")).toEqual([
      { type: "comment", text: ";layer 0" },
    ]);
  });

  it("classifies G/M/T codes as 'code'", () => {
    const spans = parseGcodeLine("G1 M3 T11");
    expect(spans.filter((s) => s.type === "code").map((s) => s.text))
      .toEqual(["G1", "M3", "T11"]);
  });

  it("classifies X/Y/Z values as 'coord'", () => {
    const spans = parseGcodeLine("X12.5 Y-3 Z0");
    expect(spans.filter((s) => s.type === "coord").map((s) => s.text))
      .toEqual(["X12.5", "Y-3", "Z0"]);
  });

  it("handles a mixed move line", () => {
    const spans = parseGcodeLine("G1 X10.0 Y20.5 Z-1 F1200");
    const types = spans.filter((s) => s.text.trim()).map((s) => `${s.type}:${s.text}`);
    expect(types).toContain("code:G1");
    expect(types).toContain("coord:X10.0");
    expect(types).toContain("coord:Y20.5");
    expect(types).toContain("coord:Z-1");
    expect(types).toContain("code:F1200");
  });

  it("does not match X without a value as a coord", () => {
    const spans = parseGcodeLine("X");
    expect(spans.some((s) => s.type === "coord")).toBe(false);
  });
});

describe("kindForLine", () => {
  const opRanges = [
    { kind: "sub", gcode_start_line: 0,  gcode_end_line: 10 },
    { kind: "add", gcode_start_line: 10, gcode_end_line: 20 },
  ];

  it("returns the kind whose [start,end) covers the line", () => {
    expect(kindForLine(0,  opRanges)).toBe("sub");
    expect(kindForLine(9,  opRanges)).toBe("sub");
    expect(kindForLine(10, opRanges)).toBe("add");
    expect(kindForLine(19, opRanges)).toBe("add");
  });

  it("returns null outside any range", () => {
    expect(kindForLine(20, opRanges)).toBeNull();
    expect(kindForLine(50, opRanges)).toBeNull();
  });

  it("returns null for missing op_ranges", () => {
    expect(kindForLine(0, [])).toBeNull();
    expect(kindForLine(0, null)).toBeNull();
  });
});
