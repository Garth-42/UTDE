import { describe, it, expect } from "vitest";
import {
  totalPointCount,
  cursorPosition,
  scrubSegments,
  formatTime,
  totalDurationSeconds,
} from "../../lib/simulation";

const sample = [
  { id: "a", label: "A", kind: "sub", color: "orange",
    points: Array.from({ length: 100 }, (_, i) => ({ x: i, y: 0, z: 0 })) },
  { id: "b", label: "B", kind: "add", color: "green",
    points: Array.from({ length: 50 },  (_, i) => ({ x: 0, y: i, z: 0 })) },
  { id: "c", label: "C", kind: "sub", color: "orange",
    points: Array.from({ length: 50 },  (_, i) => ({ x: 0, y: 0, z: i })) },
];

describe("totalPointCount", () => {
  it("sums points", () => {
    expect(totalPointCount(sample)).toBe(200);
  });
  it("handles empty", () => {
    expect(totalPointCount([])).toBe(0);
    expect(totalPointCount(undefined)).toBe(0);
  });
});

describe("cursorPosition", () => {
  it("returns sentinels for an empty timeline", () => {
    const c = cursorPosition([], 0.5);
    expect(c.tpIdx).toBe(-1);
    expect(c.total).toBe(0);
  });

  it("lands inside the first toolpath at progress 0.25", () => {
    const c = cursorPosition(sample, 0.25);
    // 0.25 * 200 = 50 → first toolpath has 100 pts so it's still in A
    expect(c.tpIdx).toBe(0);
    expect(c.cursor).toBe(50);
  });

  it("lands in the second toolpath at progress 0.6", () => {
    const c = cursorPosition(sample, 0.6);
    // 0.6 * 200 = 120 → A consumes 100, leaves 20 → tp B index 19
    expect(c.tpIdx).toBe(1);
    expect(c.cursor).toBe(120);
  });

  it("lands in the third toolpath at progress 0.85", () => {
    const c = cursorPosition(sample, 0.85);
    // 170 - 150 = 20 → tp C index 19
    expect(c.tpIdx).toBe(2);
  });

  it("clamps at end when progress = 1", () => {
    const c = cursorPosition(sample, 1);
    expect(c.cursor).toBe(200);
    expect(c.tpIdx).toBe(2);
  });
});

describe("scrubSegments", () => {
  it("yields width and cumulative percentages", () => {
    const segs = scrubSegments(sample);
    expect(segs).toHaveLength(3);
    expect(segs[0].widthPct).toBeCloseTo(50, 5);
    expect(segs[1].widthPct).toBeCloseTo(25, 5);
    expect(segs[2].widthPct).toBeCloseTo(25, 5);
    expect(segs[2].cumulativePct).toBeCloseTo(100, 5);
  });

  it("preserves kind and color from each toolpath", () => {
    const segs = scrubSegments(sample);
    expect(segs[0].kind).toBe("sub");
    expect(segs[0].color).toBe("orange");
    expect(segs[1].kind).toBe("add");
  });

  it("returns [] for empty timeline", () => {
    expect(scrubSegments([])).toEqual([]);
  });
});

describe("formatTime", () => {
  it("formats fractional progress as MM:SS", () => {
    expect(formatTime(0,    120)).toBe("00:00");
    expect(formatTime(0.25, 120)).toBe("00:30");
    expect(formatTime(0.5,  120)).toBe("01:00");
    expect(formatTime(1,    120)).toBe("02:00");
  });
  it("clamps progress to [0..1]", () => {
    expect(formatTime(-1,  60)).toBe("00:00");
    expect(formatTime(2,   60)).toBe("01:00");
  });
});

describe("totalDurationSeconds", () => {
  it("sums est_time from templates referenced by op_ranges", () => {
    const templates = [
      { id: "pocket", est_time: 4.6 },
      { id: "drill",  est_time: 0.6 },
    ];
    const opRanges = [
      { templateId: "pocket" },
      { templateId: "drill"  },
      { templateId: "pocket" },
    ];
    expect(totalDurationSeconds(opRanges, templates)).toBeCloseTo(
      (4.6 + 0.6 + 4.6) * 60,
      5,
    );
  });
  it("returns 0 with no ranges", () => {
    expect(totalDurationSeconds([], [])).toBe(0);
  });
});
