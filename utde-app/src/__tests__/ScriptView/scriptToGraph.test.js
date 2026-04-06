import { describe, it, expect, beforeEach, vi } from "vitest";
import { scriptToGraph } from "../../components/ScriptView/scriptToGraph";

// ── graphStore mock ───────────────────────────────────────────────────────────

const mockStore = {
  nodes: [
    { id: "node_strategy", type: "strategy", params: { strategy_type: "follow_curve" } },
    { id: "node_post",     type: "post_processor", params: { machine: "gantry_5axis_ac" } },
  ],
  edges: [],
  setStrategy:     vi.fn(),
  addOrientNode:   vi.fn(),
  updateOrientNode: vi.fn(),
  updateNodeParam: vi.fn(),
  removeNode:      vi.fn(),
};

vi.mock("../../store/graphStore", () => ({
  useGraphStore: Object.assign(
    (selector) => selector(mockStore),
    { getState: () => mockStore }
  ),
}));

beforeEach(() => {
  vi.clearAllMocks();
  mockStore.nodes = [
    { id: "node_strategy", type: "strategy", params: { strategy_type: "follow_curve" } },
    { id: "node_post",     type: "post_processor", params: { machine: "gantry_5axis_ac" } },
  ];
});

// ── Strategy recognition ──────────────────────────────────────────────────────

describe("strategy pattern recognition", () => {
  it("recognises FollowCurveStrategy", () => {
    const code = "paths = FollowCurveStrategy().generate(\n    feed_rate=600,\n)";
    scriptToGraph(code);
    expect(mockStore.setStrategy).toHaveBeenCalledWith(
      expect.objectContaining({ strategy_type: "follow_curve" })
    );
  });

  it("recognises RasterFillStrategy", () => {
    const code = "paths = RasterFillStrategy().generate(\n    spacing=2.0,\n)";
    scriptToGraph(code);
    expect(mockStore.setStrategy).toHaveBeenCalledWith(
      expect.objectContaining({ strategy_type: "raster_fill" })
    );
  });

  it("recognises ContourParallelStrategy", () => {
    const code = "paths = ContourParallelStrategy().generate(\n    stepover=3.0,\n)";
    scriptToGraph(code);
    expect(mockStore.setStrategy).toHaveBeenCalledWith(
      expect.objectContaining({ strategy_type: "contour_parallel" })
    );
  });

  it("parses feed_rate param from strategy block", () => {
    const code = "paths = FollowCurveStrategy().generate(\n    feed_rate=1200,\n)";
    scriptToGraph(code);
    expect(mockStore.setStrategy).toHaveBeenCalledWith(
      expect.objectContaining({ feed_rate: 1200 })
    );
  });

  it("parses spacing param", () => {
    const code = "paths = RasterFillStrategy().generate(\n    spacing=3.5,\n)";
    scriptToGraph(code);
    expect(mockStore.setStrategy).toHaveBeenCalledWith(
      expect.objectContaining({ spacing: 3.5 })
    );
  });

  it("parses zigzag=True", () => {
    const code = "paths = RasterFillStrategy().generate(\n    zigzag=True,\n)";
    scriptToGraph(code);
    expect(mockStore.setStrategy).toHaveBeenCalledWith(
      expect.objectContaining({ zigzag: true })
    );
  });

  it("parses zigzag=False", () => {
    const code = "paths = RasterFillStrategy().generate(\n    zigzag=False,\n)";
    scriptToGraph(code);
    expect(mockStore.setStrategy).toHaveBeenCalledWith(
      expect.objectContaining({ zigzag: false })
    );
  });

  it("parses stepover param", () => {
    const code = "paths = ContourParallelStrategy().generate(\n    stepover=4.0,\n)";
    scriptToGraph(code);
    expect(mockStore.setStrategy).toHaveBeenCalledWith(
      expect.objectContaining({ stepover: 4.0 })
    );
  });
});

// ── Orient rule recognition ───────────────────────────────────────────────────

describe("orient pattern recognition", () => {
  it("recognises lead(angle)", () => {
    const code = "paths.orient(lead(10))";
    scriptToGraph(code);
    expect(mockStore.addOrientNode).toHaveBeenCalledWith("lead");
    expect(mockStore.updateOrientNode).toHaveBeenCalledWith(0, { angle_deg: 10 });
  });

  it("recognises lag(angle)", () => {
    const code = "paths.orient(lag(5.5))";
    scriptToGraph(code);
    expect(mockStore.addOrientNode).toHaveBeenCalledWith("lag");
    expect(mockStore.updateOrientNode).toHaveBeenCalledWith(0, { angle_deg: 5.5 });
  });

  it("recognises side_tilt(angle)", () => {
    const code = "paths.orient(side_tilt(15))";
    scriptToGraph(code);
    expect(mockStore.addOrientNode).toHaveBeenCalledWith("side_tilt");
  });

  it("recognises to_normal(surface)", () => {
    const code = "paths.orient(to_normal(surface_0))";
    scriptToGraph(code);
    expect(mockStore.addOrientNode).toHaveBeenCalledWith("to_normal");
  });

  it("recognises fixed(i, j, k)", () => {
    const code = "paths.orient(fixed(0, 0, -1))";
    scriptToGraph(code);
    expect(mockStore.addOrientNode).toHaveBeenCalledWith("fixed");
    expect(mockStore.updateOrientNode).toHaveBeenCalledWith(0, { i: 0, j: 0, k: -1 });
  });

  it("recognises avoid_collision with max_tilt", () => {
    const code = "paths.orient(avoid_collision(machine, max_tilt=45))";
    scriptToGraph(code);
    expect(mockStore.addOrientNode).toHaveBeenCalledWith("avoid_collision");
    expect(mockStore.updateOrientNode).toHaveBeenCalledWith(0, { max_tilt: 45 });
  });

  it("handles multiple orient rules in order", () => {
    const code = "paths.orient(lead(10))\npaths.orient(lag(5))";
    scriptToGraph(code);
    expect(mockStore.addOrientNode).toHaveBeenCalledTimes(2);
    expect(mockStore.addOrientNode).toHaveBeenNthCalledWith(1, "lead");
    expect(mockStore.addOrientNode).toHaveBeenNthCalledWith(2, "lag");
  });
});

// ── Machine pattern ───────────────────────────────────────────────────────────

describe("machine pattern recognition", () => {
  it("updates post node machine preset", () => {
    const code = "machine = Machine.cartesian_3axis()";
    scriptToGraph(code);
    expect(mockStore.updateNodeParam).toHaveBeenCalledWith(
      "node_post", "machine", "cartesian_3axis"
    );
  });

  it("recognises gantry_5axis_ac", () => {
    const code = "machine = Machine.gantry_5axis_ac()";
    scriptToGraph(code);
    expect(mockStore.updateNodeParam).toHaveBeenCalledWith(
      "node_post", "machine", "gantry_5axis_ac"
    );
  });
});

// ── Unparsed / skippable lines ────────────────────────────────────────────────

describe("unparsed line tracking", () => {
  it("skips blank lines and comments", () => {
    const code = "\n# this is a comment\n\nfrom toolpath_engine import Surface";
    const result = scriptToGraph(code);
    expect(result.unparsedLines).toHaveLength(0);
  });

  it("flags unknown function calls as unparsed", () => {
    const code = "some_unknown_call(foo=1)";
    const result = scriptToGraph(code);
    expect(result.unparsedLines).toContain(0);
  });

  it("returns updatedLines for recognised patterns", () => {
    const code = "paths = FollowCurveStrategy().generate(\n    feed_rate=600,\n)";
    const result = scriptToGraph(code);
    expect(result.updatedLines.length).toBeGreaterThan(0);
  });

  it("empty code returns empty results", () => {
    const result = scriptToGraph("");
    expect(result.updatedLines).toHaveLength(0);
    expect(result.unparsedLines).toHaveLength(0);
  });
});
