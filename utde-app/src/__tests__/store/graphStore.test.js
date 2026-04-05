import { describe, it, expect, beforeEach } from "vitest";
import { useGraphStore, getStrategyParams, getOrientRules, getOrientNodes, getStrategyNode, getPostNode } from "../../store/graphStore";
import { useToolpathStore } from "../../store/toolpathStore";
import { useUiStore } from "../../store/uiStore";

// Reset stores to initial state before each test
beforeEach(() => {
  useGraphStore.getState().reset();
  useToolpathStore.getState().clearToolpaths();
  useUiStore.getState().setShowToolpaths(false);
});

/** Seed one toolpath so we can assert it gets cleared. */
function seedToolpath() {
  useToolpathStore.getState().addToolpath("test", [{ x: 0, y: 0, z: 0 }]);
  useUiStore.getState().setShowToolpaths(true);
}

describe("graphStore — initial state", () => {
  it("starts with geometry, strategy, and post nodes", () => {
    const { nodes } = useGraphStore.getState();
    expect(nodes.some((n) => n.type === "geometry")).toBe(true);
    expect(nodes.some((n) => n.type === "strategy")).toBe(true);
    expect(nodes.some((n) => n.type === "post_processor")).toBe(true);
  });

  it("starts with edges connecting geo → strategy → post", () => {
    const { edges } = useGraphStore.getState();
    expect(edges.length).toBeGreaterThanOrEqual(3);
  });

  it("has no orient nodes initially", () => {
    const state = useGraphStore.getState();
    expect(getOrientNodes(state)).toHaveLength(0);
  });

  it("strategy params match defaults", () => {
    const state = useGraphStore.getState();
    const params = getStrategyParams(state);
    expect(params.strategy_type).toBe("follow_curve");
    expect(params.feed_rate).toBe(600);
  });
});

describe("graphStore — setStrategy", () => {
  it("updates strategy params", () => {
    useGraphStore.getState().setStrategy({ feed_rate: 1200 });
    const state = useGraphStore.getState();
    expect(getStrategyParams(state).feed_rate).toBe(1200);
  });

  it("updates strategy label when type changes", () => {
    useGraphStore.getState().setStrategy({ strategy_type: "raster_fill" });
    const state = useGraphStore.getState();
    expect(getStrategyNode(state).label).toBe("Raster Fill");
  });

  it("does not clobber unrelated params", () => {
    useGraphStore.getState().setStrategy({ feed_rate: 999 });
    const state = useGraphStore.getState();
    const params = getStrategyParams(state);
    expect(params.strategy_type).toBe("follow_curve");
    expect(params.spacing).toBe(1.0);
  });
});

describe("graphStore — addOrientNode", () => {
  it("adds an orient node", () => {
    useGraphStore.getState().addOrientNode("lead");
    const state = useGraphStore.getState();
    const orientNodes = getOrientNodes(state);
    expect(orientNodes).toHaveLength(1);
    expect(orientNodes[0].params.rule).toBe("lead");
  });

  it("adds default params for the rule type", () => {
    useGraphStore.getState().addOrientNode("lead");
    const state = useGraphStore.getState();
    const [node] = getOrientNodes(state);
    expect(node.params.angle_deg).toBe(10);
  });

  it("connects orient node into the pipeline edges", () => {
    useGraphStore.getState().addOrientNode("lead");
    const state = useGraphStore.getState();
    const [orientNode] = getOrientNodes(state);
    const { edges } = state;
    // edge into orient node
    expect(edges.some((e) => e.to_node === orientNode.id)).toBe(true);
    // edge out of orient node
    expect(edges.some((e) => e.from_node === orientNode.id)).toBe(true);
    // edge to post node
    const post = getPostNode(state);
    expect(edges.some((e) => e.from_node === orientNode.id && e.to_node === post.id)).toBe(true);
  });

  it("chains multiple orient nodes in order", () => {
    useGraphStore.getState().addOrientNode("to_normal");
    useGraphStore.getState().addOrientNode("lead");
    const state = useGraphStore.getState();
    const [first, second] = getOrientNodes(state);
    expect(first.params.rule).toBe("to_normal");
    expect(second.params.rule).toBe("lead");
    // first → second edge exists
    const { edges } = state;
    expect(edges.some((e) => e.from_node === first.id && e.to_node === second.id)).toBe(true);
  });
});

describe("graphStore — removeOrientNode", () => {
  it("removes the node and reconnects the chain", () => {
    useGraphStore.getState().addOrientNode("lead");
    useGraphStore.getState().addOrientNode("lag");
    useGraphStore.getState().removeOrientNode(0); // remove first (lead)
    const state = useGraphStore.getState();
    const orientNodes = getOrientNodes(state);
    expect(orientNodes).toHaveLength(1);
    expect(orientNodes[0].params.rule).toBe("lag");
    // lag should now be connected directly from strategy
    const strategy = getStrategyNode(state);
    const { edges } = state;
    expect(edges.some((e) => e.from_node === strategy.id && e.to_node === orientNodes[0].id)).toBe(true);
  });
});

describe("graphStore — moveOrientNode", () => {
  it("swaps two orient nodes by position", () => {
    useGraphStore.getState().addOrientNode("to_normal");
    useGraphStore.getState().addOrientNode("lead");
    const before = getOrientNodes(useGraphStore.getState());
    useGraphStore.getState().moveOrientNode(0, 1);
    const after = getOrientNodes(useGraphStore.getState());
    // Positions should be swapped (x coords exchanged)
    expect(after[0].position.x).toBe(before[1].position.x);
    expect(after[1].position.x).toBe(before[0].position.x);
  });
});

describe("graphStore — updateNodeParam", () => {
  it("updates a specific param on a node", () => {
    const state = useGraphStore.getState();
    const strategy = getStrategyNode(state);
    useGraphStore.getState().updateNodeParam(strategy.id, "feed_rate", 2000);
    const newState = useGraphStore.getState();
    expect(getStrategyParams(newState).feed_rate).toBe(2000);
  });
});

describe("graphStore — addEdge cycle detection", () => {
  it("allows a valid edge", () => {
    const state = useGraphStore.getState();
    const strategyId = getStrategyNode(state).id;
    const postId = getPostNode(state).id;
    // Adding an existing-type edge (would be duplicate but let's test a new path)
    // Add a second post-style node manually
    const result = useGraphStore.getState().addEdge({
      id: "test_edge",
      from_node: strategyId, from_port: "toolpath_out",
      to_node: postId,       to_port: "toolpath_in",
    });
    // Duplicate should be rejected
    expect(result.ok).toBe(false);
    expect(result.reason).toBe("duplicate");
  });
});

describe("graphStore — getOrientRules selector", () => {
  it("returns empty array when no orient nodes", () => {
    const state = useGraphStore.getState();
    expect(getOrientRules(state)).toEqual([]);
  });

  it("returns rules in pipeline order", () => {
    useGraphStore.getState().addOrientNode("to_normal");
    useGraphStore.getState().addOrientNode("lead");
    const state = useGraphStore.getState();
    const rules = getOrientRules(state);
    expect(rules[0].rule).toBe("to_normal");
    expect(rules[1].rule).toBe("lead");
  });
});

describe("graphStore — pipeline invalidation clears toolpaths", () => {
  it("updateNodeParam clears toolpaths", () => {
    seedToolpath();
    const strategy = getStrategyNode(useGraphStore.getState());
    useGraphStore.getState().updateNodeParam(strategy.id, "feed_rate", 999);
    expect(useToolpathStore.getState().toolpaths).toHaveLength(0);
    expect(useUiStore.getState().showToolpaths).toBe(false);
  });

  it("setStrategy clears toolpaths", () => {
    seedToolpath();
    useGraphStore.getState().setStrategy({ strategy_type: "raster_fill" });
    expect(useToolpathStore.getState().toolpaths).toHaveLength(0);
    expect(useUiStore.getState().showToolpaths).toBe(false);
  });

  it("setNodeGeometry clears toolpaths", () => {
    seedToolpath();
    const strategy = getStrategyNode(useGraphStore.getState());
    useGraphStore.getState().setNodeGeometry(strategy.id, ["f1"], []);
    expect(useToolpathStore.getState().toolpaths).toHaveLength(0);
    expect(useUiStore.getState().showToolpaths).toBe(false);
  });

  it("addOrientNode clears toolpaths", () => {
    seedToolpath();
    useGraphStore.getState().addOrientNode("lead");
    expect(useToolpathStore.getState().toolpaths).toHaveLength(0);
    expect(useUiStore.getState().showToolpaths).toBe(false);
  });

  it("removeOrientNode clears toolpaths", () => {
    useGraphStore.getState().addOrientNode("lead");
    seedToolpath();
    useGraphStore.getState().removeOrientNode(0);
    expect(useToolpathStore.getState().toolpaths).toHaveLength(0);
    expect(useUiStore.getState().showToolpaths).toBe(false);
  });

  it("updateOrientNode clears toolpaths", () => {
    useGraphStore.getState().addOrientNode("lead");
    seedToolpath();
    useGraphStore.getState().updateOrientNode(0, { angle_deg: 20 });
    expect(useToolpathStore.getState().toolpaths).toHaveLength(0);
    expect(useUiStore.getState().showToolpaths).toBe(false);
  });

  it("removeEdge clears toolpaths", () => {
    seedToolpath();
    const { edges } = useGraphStore.getState();
    useGraphStore.getState().removeEdge(edges[0].id);
    expect(useToolpathStore.getState().toolpaths).toHaveLength(0);
    expect(useUiStore.getState().showToolpaths).toBe(false);
  });
});

describe("graphStore — selectedNodeId", () => {
  it("starts as null", () => {
    expect(useGraphStore.getState().selectedNodeId).toBeNull();
  });

  it("updates on setSelectedNode", () => {
    useGraphStore.getState().setSelectedNode("node_strategy");
    expect(useGraphStore.getState().selectedNodeId).toBe("node_strategy");
  });

  it("clears on setSelectedNode(null)", () => {
    useGraphStore.getState().setSelectedNode("node_strategy");
    useGraphStore.getState().setSelectedNode(null);
    expect(useGraphStore.getState().selectedNodeId).toBeNull();
  });
});
