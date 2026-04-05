/**
 * graphStore — canonical pipeline state.
 *
 * Replaces strategyStore. The node graph canvas and the sidebar are both
 * derived views of this store. All pipeline mutations go through here.
 *
 * Graph is a DAG: nodes + explicit typed edges.
 * Cycle detection runs on every addEdge call (DFS).
 * Sidebar reads via: getStrategyParams, getOrientRules, getPostParams selectors.
 */
import { create } from "zustand";
import { useToolpathStore } from "./toolpathStore";
import { useUiStore } from "./uiStore";

/** Called whenever a pipeline parameter changes — wipes stale toolpath output. */
function invalidatePipeline() {
  useToolpathStore.getState().clearToolpaths();
  useUiStore.getState().setShowToolpaths(false);
}

// ─── Default node shapes ──────────────────────────────────────────────────────

const makeGeoNode = () => ({
  id: "node_geo",
  type: "geometry",
  label: "Geometry Input",
  position: { x: 50, y: 120 },
  params: { selected_face_ids: [], selected_edge_ids: [] },
  input_ports: [],
  output_ports: [
    { id: "faces_out", type: "Surface" },
    { id: "edges_out", type: "Curve"   },
  ],
  status: "idle",
  output: null,
});

const makeStrategyNode = () => ({
  id: "node_strategy",
  type: "strategy",
  label: "Follow Curve",
  position: { x: 310, y: 120 },
  params: {
    strategy_type:      "follow_curve",
    feed_rate:          600,
    selected_face_ids:  [],
    selected_edge_ids:  [],
    spacing:        1.0,
    path_type:      "deposit",
    angle:          0,
    zigzag:         true,
    overshoot:      2.0,
    normal_offset:  0.0,
    edge_inset:     0.0,
    stepover:       3.0,
    num_passes:     4,
    direction:      "inward",
  },
  input_ports:  [
    { id: "faces_in", type: "Surface" },
    { id: "edges_in", type: "Curve"   },
  ],
  output_ports: [{ id: "toolpath_out", type: "Toolpath" }],
  status: "idle",
  output: null,
});  // selected_face_ids / selected_edge_ids stored in params (set via setNodeGeometry)

const makePostNode = (x = 900) => ({
  id: "node_post",
  type: "post_processor",
  label: "Post Processor",
  position: { x, y: 120 },
  params: {
    machine:      "gantry_5axis_ac",
    wcs_register: "G54",
  },
  input_ports:  [{ id: "toolpath_in", type: "Toolpath" }],
  output_ports: [{ id: "gcode_out",   type: "GCode"    }],
  status: "idle",
  output: null,
});

const makeOrientNode = (rule, params, x) => {
  const LABELS = {
    to_normal:       "to_normal",
    fixed:           "fixed(i,j,k)",
    lead:            "lead(°)",
    lag:             "lag(°)",
    side_tilt:       "side_tilt(°)",
    avoid_collision: "avoid_collision",
  };
  return {
    id: `node_orient_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
    type: "orient",
    label: LABELS[rule] ?? rule,
    position: { x, y: 120 },
    params: { rule, ...params, selected_face_ids: [], selected_edge_ids: [] },
    // surface_in: standard geometry input port — present on all nodes that support
    // geometry selection. Either wire a geometry source here OR use the manual
    // "Select geometry" button in the node; the wire takes priority when connected.
    input_ports:  [
      { id: "toolpath_in",  type: "Toolpath" },
      { id: "surface_in",   type: "Surface"  },
    ],
    output_ports: [{ id: "toolpath_out", type: "Toolpath" }],
    status: "idle",
    output: null,
  };
};

const makeStepImportNode = (position = { x: 50, y: 300 }) => ({
  id: `node_step_import_${Date.now()}_${Math.random().toString(36).slice(2, 5)}`,
  type: "step_import",
  label: "STEP Import",
  position,
  params: { quality_level: 2 },
  output: null,   // { faces, edges, fileName } populated after loading
  input_ports:  [],
  output_ports: [
    { id: "faces_out", type: "Surface" },
    { id: "edges_out", type: "Curve"   },
  ],
  status: "idle",
});

const DEFAULT_ORIENT_PARAMS = {
  to_normal:       { surface_id: 0 },
  fixed:           { i: 0, j: 0, k: -1 },
  lead:            { angle_deg: 10 },
  lag:             { angle_deg: 5 },
  side_tilt:       { angle_deg: 5 },
  avoid_collision: { max_tilt: 45 },
};

// ─── Cycle detection ──────────────────────────────────────────────────────────

function wouldCycle(edges, candidateEdge) {
  // Build adjacency list including the candidate
  const adj = {};
  [...edges, candidateEdge].forEach((e) => {
    if (!adj[e.from_node]) adj[e.from_node] = [];
    adj[e.from_node].push(e.to_node);
  });
  // DFS from candidate target — if we reach candidate source, it's a cycle
  const visited = new Set();
  const stack = [candidateEdge.to_node];
  while (stack.length) {
    const node = stack.pop();
    if (node === candidateEdge.from_node) return true;
    if (visited.has(node)) continue;
    visited.add(node);
    (adj[node] || []).forEach((n) => stack.push(n));
  }
  return false;
}

// ─── Selectors (pure functions on state) ─────────────────────────────────────

export function getStrategyNode(state) {
  return state.nodes.find((n) => n.type === "strategy") ?? null;
}

export function getOrientNodes(state) {
  const orientNodes = state.nodes.filter((n) => n.type === "orient");
  // Sort by topological order: follow edges from strategy → ... → post
  const adj = {};
  state.edges.forEach((e) => {
    if (!adj[e.from_node]) adj[e.from_node] = [];
    adj[e.from_node].push(e.to_node);
  });
  const ordered = [];
  const strategyId = state.nodes.find((n) => n.type === "strategy")?.id;
  if (!strategyId) return orientNodes;
  let current = (adj[strategyId] || []).find((id) =>
    orientNodes.some((n) => n.id === id)
  );
  const seen = new Set();
  while (current && !seen.has(current)) {
    seen.add(current);
    const node = orientNodes.find((n) => n.id === current);
    if (node) ordered.push(node);
    current = (adj[current] || []).find((id) =>
      orientNodes.some((n) => n.id === id)
    );
  }
  // Include any detached orient nodes not in the chain
  orientNodes.forEach((n) => { if (!seen.has(n.id)) ordered.push(n); });
  return ordered;
}

export function getPostNode(state) {
  return state.nodes.find((n) => n.type === "post_processor") ?? null;
}

/** Derive a flat strategy params object (matches old strategyStore.strategy shape) */
export function getStrategyParams(state) {
  return getStrategyNode(state)?.params ?? {};
}

/** Derive orient rules array (matches old strategyStore.orientationRules shape) */
export function getOrientRules(state) {
  return getOrientNodes(state).map((n) => ({ rule: n.params.rule, ...n.params }));
}

// ─── Store ────────────────────────────────────────────────────────────────────

const INITIAL_NODES = [makeGeoNode(), makeStrategyNode(), makePostNode()];
const INITIAL_EDGES = [
  { id: "e_geo_faces",    from_node: "node_geo",      from_port: "faces_out",    to_node: "node_strategy", to_port: "faces_in"    },
  { id: "e_geo_edges",    from_node: "node_geo",      from_port: "edges_out",    to_node: "node_strategy", to_port: "edges_in"    },
  { id: "e_strat_post",   from_node: "node_strategy", from_port: "toolpath_out", to_node: "node_post",     to_port: "toolpath_in" },
];

export const useGraphStore = create((set, get) => ({
  nodes: INITIAL_NODES,
  edges: INITIAL_EDGES,

  // Selection (for inspector panel)
  selectedNodeId: null,

  // Pipeline execution state (mirrors old strategyStore)
  isGenerating:   false,
  generatedCode:  "",
  gcodeOutput:    "",
  codeCopied:     false,

  // ── Node CRUD ──────────────────────────────────────────────────────────────

  setSelectedNode: (id) => set({ selectedNodeId: id }),

  updateNodeParam: (nodeId, key, value) => {
    invalidatePipeline();
    set((s) => ({
      nodes: s.nodes.map((n) =>
        n.id === nodeId ? { ...n, params: { ...n.params, [key]: value } } : n
      ),
    }));
  },

  updateNodePosition: (nodeId, position) =>
    set((s) => ({
      nodes: s.nodes.map((n) => (n.id === nodeId ? { ...n, position } : n)),
    })),

  setNodeOutput: (nodeId, output, status = "done") => {
    invalidatePipeline();
    set((s) => ({
      nodes: s.nodes.map((n) =>
        n.id === nodeId ? { ...n, output, status } : n
      ),
    }));
  },

  setNodeStatus: (nodeId, status) =>
    set((s) => ({
      nodes: s.nodes.map((n) => (n.id === nodeId ? { ...n, status } : n)),
    })),

  removeNode: (nodeId) =>
    set((s) => ({
      nodes: s.nodes.filter((n) => n.id !== nodeId),
      edges: s.edges.filter(
        (e) => e.from_node !== nodeId && e.to_node !== nodeId
      ),
      selectedNodeId: s.selectedNodeId === nodeId ? null : s.selectedNodeId,
    })),

  // ── Edge CRUD ──────────────────────────────────────────────────────────────

  addEdge: (edge) => {
    const s = get();
    if (wouldCycle(s.edges, edge)) return { ok: false, reason: "cycle" };
    const dup = s.edges.some(
      (e) => e.from_node === edge.from_node && e.from_port === edge.from_port &&
             e.to_node   === edge.to_node   && e.to_port   === edge.to_port
    );
    if (dup) return { ok: false, reason: "duplicate" };
    invalidatePipeline();
    set({ edges: [...s.edges, edge] });
    return { ok: true };
  },

  removeEdge: (edgeId) => {
    invalidatePipeline();
    set((s) => ({ edges: s.edges.filter((e) => e.id !== edgeId) }));
  },

  // ── Orient node helpers ────────────────────────────────────────────────────

  addOrientNode: (ruleType) => {
    const s = get();
    const orientNodes = getOrientNodes(s);
    const lastOrient  = orientNodes[orientNodes.length - 1];
    const stratNode   = getStrategyNode(s);
    const postNode    = getPostNode(s);
    if (!stratNode || !postNode) return;

    // X position: midpoint of last upstream node and post, with spacing
    const upstreamX = lastOrient?.position.x ?? stratNode.position.x;
    const newX = upstreamX + 220;

    const newNode = makeOrientNode(
      ruleType,
      DEFAULT_ORIENT_PARAMS[ruleType] ?? {},
      newX,
    );

    // Remove edge from last upstream → post, insert new node in between
    const upstreamId = lastOrient?.id ?? stratNode.id;
    const existingEdge = s.edges.find(
      (e) => e.from_node === upstreamId && e.to_node === postNode.id
    );

    const newEdges = s.edges.filter((e) => e.id !== existingEdge?.id);
    newEdges.push({
      id: `e_${upstreamId}_${newNode.id}`,
      from_node: upstreamId, from_port: "toolpath_out",
      to_node:   newNode.id, to_port:   "toolpath_in",
    });
    newEdges.push({
      id: `e_${newNode.id}_post`,
      from_node: newNode.id,    from_port: "toolpath_out",
      to_node:   postNode.id,   to_port:   "toolpath_in",
    });

    invalidatePipeline();
    set({ nodes: [...s.nodes, newNode], edges: newEdges });
  },

  moveOrientNode: (fromIdx, toIdx) => {
    const s = get();
    const orientNodes = getOrientNodes(s);
    if (fromIdx === toIdx) return;
    if (fromIdx < 0 || toIdx < 0) return;
    if (fromIdx >= orientNodes.length || toIdx >= orientNodes.length) return;

    const nodeA = orientNodes[fromIdx]; // node moving
    const nodeB = orientNodes[toIdx];   // node it swaps with

    // Swap their canvas x positions so the visual order changes
    invalidatePipeline();
    set((st) => ({
      nodes: st.nodes.map((n) => {
        if (n.id === nodeA.id) return { ...n, position: { ...n.position, x: nodeB.position.x } };
        if (n.id === nodeB.id) return { ...n, position: { ...n.position, x: nodeA.position.x } };
        return n;
      }),
    }));
  },

  removeOrientNode: (idx) => {
    const s = get();
    const orientNodes = getOrientNodes(s);
    const target = orientNodes[idx];
    if (!target) return;

    // Find the node feeding into target and the node target feeds into
    const inEdge  = s.edges.find((e) => e.to_node   === target.id);
    const outEdge = s.edges.find((e) => e.from_node === target.id);

    let newEdges = s.edges.filter(
      (e) => e.from_node !== target.id && e.to_node !== target.id
    );

    // Reconnect upstream → downstream directly
    if (inEdge && outEdge) {
      newEdges.push({
        id:        `e_${inEdge.from_node}_${outEdge.to_node}`,
        from_node: inEdge.from_node, from_port: inEdge.from_port,
        to_node:   outEdge.to_node,  to_port:   outEdge.to_port,
      });
    }

    invalidatePipeline();
    set({
      nodes: s.nodes.filter((n) => n.id !== target.id),
      edges: newEdges,
      selectedNodeId: s.selectedNodeId === target.id ? null : s.selectedNodeId,
    });
  },

  updateOrientNode: (idx, patch) => {
    const s = get();
    const orientNodes = getOrientNodes(s);
    const target = orientNodes[idx];
    if (!target) return;
    invalidatePipeline();
    set((st) => ({
      nodes: st.nodes.map((n) =>
        n.id === target.id ? { ...n, params: { ...n.params, ...patch } } : n
      ),
    }));
  },

  // ── Geometry selection per node ────────────────────────────────────────────

  setNodeGeometry: (nodeId, faceIds, edgeIds) => {
    invalidatePipeline();
    set((s) => ({
      nodes: s.nodes.map((n) =>
        n.id === nodeId
          ? { ...n, params: { ...n.params, selected_face_ids: faceIds, selected_edge_ids: edgeIds } }
          : n
      ),
    }));
  },

  // ── Free node creation (for canvas context menu) ──────────────────────────

  addNode: (type, position, extraParams = {}) => {
    let node;
    const ts = `${Date.now()}_${Math.random().toString(36).slice(2, 5)}`;
    if (type === "orient") {
      const rule = extraParams.rule ?? "lead";
      node = makeOrientNode(rule, { ...(DEFAULT_ORIENT_PARAMS[rule] ?? {}), ...extraParams }, position.x);
      node.position = position;
    } else if (type === "strategy") {
      const base = makeStrategyNode();
      node = { ...base, id: `node_strategy_${ts}`, position, params: { ...base.params, ...extraParams } };
    } else if (type === "post_processor") {
      node = { ...makePostNode(position.x), id: `node_post_${ts}`, position };
    } else if (type === "geometry") {
      node = { ...makeGeoNode(), id: `node_geo_${ts}`, position };
    } else if (type === "step_import") {
      node = makeStepImportNode(position);
    }
    if (node) set((s) => ({ nodes: [...s.nodes, node] }));
  },

  // ── StrategyStore-compatible convenience setters ───────────────────────────

  setStrategy: (patch) => {
    const s = get();
    const node = getStrategyNode(s);
    if (!node) return;
    invalidatePipeline();
    const STRATEGY_LABELS = {
      follow_curve:     "Follow Curve",
      raster_fill:      "Raster Fill",
      contour_parallel: "Contour Parallel",
    };
    set((st) => ({
      nodes: st.nodes.map((n) =>
        n.id === node.id
          ? {
              ...n,
              label: STRATEGY_LABELS[patch.strategy_type ?? n.params.strategy_type] ?? n.label,
              params: { ...n.params, ...patch },
            }
          : n
      ),
    }));
  },

  // ── Execution state ────────────────────────────────────────────────────────

  setGenerating:    (v)  => set({ isGenerating: v }),
  setGeneratedCode: (v)  => set({ generatedCode: v }),
  setGcodeOutput:   (v)  => set({ gcodeOutput: v }),
  setCopied: () => {
    set({ codeCopied: true });
    setTimeout(() => set({ codeCopied: false }), 2000);
  },

  reset: () =>
    set({
      nodes: INITIAL_NODES.map((n) => ({ ...n })),
      edges: [...INITIAL_EDGES],
      selectedNodeId: null,
      generatedCode: "",
      gcodeOutput: "",
    }),
}));
