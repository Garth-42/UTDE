import { describe, it, expect } from "vitest";
import { timelineToScript } from "../../lib/timelineToScript";

describe("timelineToScript", () => {
  it("returns the import block + post block for an empty timeline", () => {
    const out = timelineToScript([]);
    expect(out).toContain("from toolpath_engine import");
    expect(out).toContain('combined = ToolpathCollection(name="timeline")');
    expect(out).toContain("post  = PostProcessor(machine)");
  });

  it("emits an op block with templateId, geometry, and params", () => {
    const out = timelineToScript([
      {
        kind: "op", uid: "op_1", templateId: "pocket", name: "Pocket A",
        params: { depth: 8.0, stepdown: 1.5, tool: "T11" },
        geometry: [["F1", "F2"]],
        visible: true,
      },
    ]);
    expect(out).toContain('# --- Op 01: Pocket A ---');
    expect(out).toContain('get_process("pocket")(');
    expect(out).toContain('geometry=[["F1", "F2"]],');
    expect(out).toContain('"depth": 8,');
    expect(out).toContain('"tool": "T11",');
  });

  it("emits an orient block that updates the chain", () => {
    const out = timelineToScript([
      {
        kind: "orient", uid: "or_1", rules: [
          { type: "fixed", x: 0, y: 0, z: -1 },
          { type: "lead",  angle: 10 },
        ], visible: true,
      },
    ]);
    expect(out).toContain("# --- Orient 1 : new chain ---");
    expect(out).toContain(".orient(fixed(0, 0, -1))");
    expect(out).toContain(".orient(lead(10))");
  });

  it("appends the active chain to ops below an orient row", () => {
    const out = timelineToScript([
      {
        kind: "op", uid: "op_a", templateId: "pocket", name: "A",
        params: {}, geometry: [[]], visible: true,
      },
      {
        kind: "orient", uid: "or_1",
        rules: [{ type: "lead", angle: 15 }],
        visible: true,
      },
      {
        kind: "op", uid: "op_b", templateId: "pocket", name: "B",
        params: {}, geometry: [[]], visible: true,
      },
    ]);
    // First op has no .orient() applied
    const aBlock = out.split("# --- Op 01")[1].split("# --- Orient")[0];
    expect(aBlock).not.toContain(".orient(");
    // Second op carries lead(15) from the orient row
    const bBlock = out.split("# --- Op 02")[1];
    expect(bBlock).toContain(".orient(lead(15))");
  });

  it("a second orient row replaces (not stacks) the chain", () => {
    const out = timelineToScript([
      { kind: "orient", uid: "or_1", rules: [{ type: "lead", angle: 30 }], visible: true },
      { kind: "op",     uid: "op_a", templateId: "pocket", name: "A",
        params: {}, geometry: [[]], visible: true },
      { kind: "orient", uid: "or_2",
        rules: [{ type: "fixed", x: 0, y: 0, z: -1 }], visible: true },
      { kind: "op",     uid: "op_b", templateId: "pocket", name: "B",
        params: {}, geometry: [[]], visible: true },
    ]);
    const bBlock = out.split("# --- Op 02")[1];
    expect(bBlock).toContain(".orient(fixed(0, 0, -1))");
    expect(bBlock).not.toContain(".orient(lead(30))");
  });

  it("skips entries with visible=false", () => {
    const out = timelineToScript([
      { kind: "op", uid: "op_a", templateId: "pocket", name: "Hidden",
        params: {}, geometry: [[]], visible: false },
      { kind: "op", uid: "op_b", templateId: "pocket", name: "Shown",
        params: {}, geometry: [[]], visible: true },
    ]);
    expect(out).not.toContain("Hidden");
    expect(out).toContain("Shown");
    expect(out).toContain("# --- Op 01");
    expect(out).not.toContain("# --- Op 02");
  });

  it("renders to_normal without a surfaceRef as a fallback", () => {
    const out = timelineToScript([
      { kind: "orient", uid: "or_1",
        rules: [{ type: "to_normal" }], visible: true },
    ]);
    expect(out).toContain(".orient(to_normal(model.top_surface()))");
  });

  it("includeImports=false suppresses the boilerplate", () => {
    const out = timelineToScript([], { includeImports: false });
    expect(out).not.toContain("from toolpath_engine");
    expect(out).not.toContain("PostProcessor");
  });

  it("emits a comment for scene rows rather than code", () => {
    const out = timelineToScript([
      { kind: "scene", uid: "s1", action: "import", visible: true },
      { kind: "scene", uid: "s2", action: "clear",  visible: true },
    ]);
    expect(out).toContain("# Import CAD");
    expect(out).toContain("# Clear part");
    expect(out).not.toContain("scene_1");
  });
});
