import { describe, it, expect } from "vitest";

/**
 * Tests for the UTDE completion source logic.
 * We test the regex patterns and completion sets directly rather than
 * spinning up a full CodeMirror instance.
 */

// ── Regex helpers (mirrors the patterns in completions.js) ────────────────────

const isSurfaceMethod  = (s) => /\bSurface\.$/.test(s);
const isCurveMethod    = (s) => /\bCurve\.$/.test(s);
const isMachinePreset  = (s) => /\bMachine\.$/.test(s);
const isOrientRule     = (s) => /paths\.orient\(\s*$/.test(s);
const isImportContext  = (s) => /from\s+toolpath_engine\s+import\s+[\w,\s(]*$/.test(s);

describe("completion context detection", () => {
  it("detects Surface. context", () => {
    expect(isSurfaceMethod("surface_0 = Surface.")).toBe(true);
    expect(isSurfaceMethod("Curve.")).toBe(false);
  });

  it("detects Curve. context", () => {
    expect(isCurveMethod("curve_0 = Curve.")).toBe(true);
    expect(isCurveMethod("Surface.")).toBe(false);
  });

  it("detects Machine. context", () => {
    expect(isMachinePreset("machine = Machine.")).toBe(true);
    expect(isMachinePreset("Surface.")).toBe(false);
  });

  it("detects paths.orient( context", () => {
    expect(isOrientRule("paths.orient(")).toBe(true);
    expect(isOrientRule("paths.orient(  ")).toBe(true);
    expect(isOrientRule("paths.orient(lead(")).toBe(false);
  });

  it("detects import context", () => {
    expect(isImportContext("from toolpath_engine import ")).toBe(true);
    expect(isImportContext("from toolpath_engine import Surface, ")).toBe(true);
    expect(isImportContext("import os")).toBe(false);
  });
});

describe("completion sets are populated", () => {
  // Import the label lists to verify they contain expected entries
  const EXPECTED_SURFACE  = ["plane", "cylinder", "sphere"];
  const EXPECTED_CURVE    = ["line", "circle", "helix", "spline", "from_points"];
  const EXPECTED_MACHINE  = ["cartesian_3axis", "gantry_5axis_ac", "gantry_5axis_bc"];
  const EXPECTED_ORIENT   = ["to_normal", "fixed", "lead", "lag", "side_tilt", "blend", "avoid_collision"];
  const EXPECTED_STRATEGY = ["FollowCurveStrategy", "RasterFillStrategy", "ContourParallelStrategy"];
  const EXPECTED_IMPORTS  = [
    "Surface", "Curve", "GeometryModel", "Machine", "PostProcessor",
    "FollowCurveStrategy", "RasterFillStrategy", "ContourParallelStrategy",
    "to_normal", "fixed", "lead", "lag", "side_tilt", "blend", "avoid_collision",
  ];

  // We read the source file and check the label strings are present
  // (avoids needing to import CodeMirror in jsdom)
  it("completions.js defines all Surface methods", async () => {
    const src = await import("../../components/ScriptView/completions.js?raw");
    EXPECTED_SURFACE.forEach((label) => {
      expect(src.default).toContain(`"${label}"`);
    });
  });

  it("completions.js defines all Curve methods", async () => {
    const src = await import("../../components/ScriptView/completions.js?raw");
    EXPECTED_CURVE.forEach((label) => {
      expect(src.default).toContain(`"${label}"`);
    });
  });

  it("completions.js defines all Machine presets", async () => {
    const src = await import("../../components/ScriptView/completions.js?raw");
    EXPECTED_MACHINE.forEach((label) => {
      expect(src.default).toContain(`"${label}"`);
    });
  });

  it("completions.js defines all orient rules", async () => {
    const src = await import("../../components/ScriptView/completions.js?raw");
    EXPECTED_ORIENT.forEach((label) => {
      expect(src.default).toContain(`"${label}"`);
    });
  });

  it("completions.js defines all strategy snippets", async () => {
    const src = await import("../../components/ScriptView/completions.js?raw");
    EXPECTED_STRATEGY.forEach((label) => {
      expect(src.default).toContain(`"${label}"`);
    });
  });

  it("completions.js includes all UTDE import names", async () => {
    const src = await import("../../components/ScriptView/completions.js?raw");
    EXPECTED_IMPORTS.forEach((label) => {
      expect(src.default).toContain(`"${label}"`);
    });
  });
});
