import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// ── Mock the in-browser runtime that the client now delegates to ──────────────
// vi.hoisted so the object exists when the hoisted vi.mock factory runs.
const rt = vi.hoisted(() => ({
  parseStep: vi.fn(),
  generateToolpath: vi.fn(),
  runScript: vi.fn(),
  lintScript: vi.fn(),
  checkHealth: vi.fn(),
}));
vi.mock("../../lib/runtime", () => ({ default: rt }));
vi.mock("../../lib/backend", () => ({ IS_TAURI: false }));

import {
  parseStep,
  generateToolpath,
  runScript,
  checkHealth,
  parseStepByPath,
  lintScript,
} from "../../api/client";

beforeEach(() => {
  Object.values(rt).forEach((fn) => fn.mockReset());
});
afterEach(() => vi.restoreAllMocks());

// ── checkHealth ───────────────────────────────────────────────────────────────

describe("checkHealth", () => {
  it("delegates to runtime.checkHealth", async () => {
    rt.checkHealth.mockResolvedValue({ ok: true, occ_available: true });
    const result = await checkHealth();
    expect(rt.checkHealth).toHaveBeenCalled();
    expect(result.ok).toBe(true);
  });
});

// ── parseStep ────────────────────────────────────────────────────────────────

describe("parseStep", () => {
  it("delegates file + deflection to runtime.parseStep", async () => {
    rt.parseStep.mockResolvedValue({ faces: [], edges: [], face_count: 0, edge_count: 0 });
    const file = new File(["data"], "part.step");
    await parseStep(file, 1.5);
    expect(rt.parseStep).toHaveBeenCalledWith(file, 1.5);
  });

  it("returns face and edge data", async () => {
    rt.parseStep.mockResolvedValue({ faces: [{ id: 0 }], edges: [{ id: 0 }], face_count: 1, edge_count: 1 });
    const result = await parseStep(new File(["d"], "p.step"));
    expect(result.faces).toHaveLength(1);
    expect(result.edge_count).toBe(1);
  });

  it("propagates parser errors", async () => {
    rt.parseStep.mockRejectedValue(new Error("bad STEP"));
    await expect(parseStep(new File(["d"], "p.step"))).rejects.toThrow("bad STEP");
  });
});

// ── parseStepByPath (unavailable in the browser build) ────────────────────────

describe("parseStepByPath", () => {
  it("throws a clear browser-build error", async () => {
    await expect(parseStepByPath("/x.step")).rejects.toThrow(/not available in the browser build/);
  });
});

// ── generateToolpath ──────────────────────────────────────────────────────────

describe("generateToolpath", () => {
  const params = {
    faces: [],
    edges: [{ id: 0, type: "line", params: { start: [0, 0, 0], end: [10, 0, 0] } }],
    strategy: { type: "follow_curve", feed_rate: 600 },
    orientationRules: [],
    machine: "cartesian_3axis",
    workspaceOrigin: null,
  };

  it("maps orientationRules→orientation and workspaceOrigin→workspace_origin", async () => {
    rt.generateToolpath.mockResolvedValue({ points: [], gcode: "", point_count: 0 });
    const rules = [{ rule: "fixed", i: 0, j: 0, k: -1 }];
    await generateToolpath({ ...params, orientationRules: rules, workspaceOrigin: { x: 1, y: 2, z: 3 } });
    const payload = rt.generateToolpath.mock.calls[0][0];
    expect(payload.orientation).toEqual(rules);
    expect(payload.workspace_origin).toEqual({ x: 1, y: 2, z: 3 });
  });

  it("sends null for null workspaceOrigin", async () => {
    rt.generateToolpath.mockResolvedValue({ points: [], gcode: "", point_count: 0 });
    await generateToolpath(params);
    expect(rt.generateToolpath.mock.calls[0][0].workspace_origin).toBeNull();
  });

  it("returns points and gcode", async () => {
    rt.generateToolpath.mockResolvedValue({
      points: [{ x: 0, y: 0, z: 0 }], gcode: "G1 X0\nM30", point_count: 1,
    });
    const result = await generateToolpath(params);
    expect(result.points).toHaveLength(1);
    expect(result.gcode).toContain("M30");
  });

  it("propagates errors", async () => {
    rt.generateToolpath.mockRejectedValue(new Error("No geometry selected"));
    await expect(generateToolpath(params)).rejects.toThrow("No geometry selected");
  });
});

// ── runScript / lintScript ────────────────────────────────────────────────────

describe("runScript", () => {
  it("delegates code and returns result", async () => {
    rt.runScript.mockResolvedValue({ success: true, stdout: "hi", stderr: "", gcode: null });
    const result = await runScript("print('hi')");
    expect(rt.runScript).toHaveBeenCalledWith("print('hi')");
    expect(result.stdout).toBe("hi");
  });
});

describe("lintScript", () => {
  it("returns empty errors for valid code", async () => {
    rt.lintScript.mockResolvedValue({ errors: [] });
    const result = await lintScript("x = 1");
    expect(rt.lintScript).toHaveBeenCalledWith("x = 1");
    expect(result.errors).toEqual([]);
  });

  it("returns error objects for invalid code", async () => {
    rt.lintScript.mockResolvedValue({ errors: [{ line: 0, col: 0, message: "invalid syntax" }] });
    const result = await lintScript("def foo(\n");
    expect(result.errors[0].message).toBe("invalid syntax");
  });
});
