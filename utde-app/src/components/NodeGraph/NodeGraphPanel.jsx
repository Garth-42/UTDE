import { useCallback, useMemo, useState, useRef } from "react";
import ReactFlow, {
  Background,
  Controls,
  MiniMap,
  applyNodeChanges,
  applyEdgeChanges,
  useReactFlow,
  ReactFlowProvider,
} from "reactflow";
import "reactflow/dist/style.css";

import { useGraphStore, getOrientNodes } from "../../store/graphStore";
import { useStepStore } from "../../store/stepStore";
import { useToolpathStore } from "../../store/toolpathStore";
import { useUiStore } from "../../store/uiStore";
import { generateToolpath } from "../../api/client";
import { generatePythonCode } from "../../utils/codeGen";
import { getStrategyParams, getOrientRules } from "../../store/graphStore";

import GeometryNode      from "./nodes/GeometryNode";
import StrategyNode      from "./nodes/StrategyNode";
import OrientNode        from "./nodes/OrientNode";
import PostProcessorNode from "./nodes/PostProcessorNode";
import StepImportNode    from "./nodes/StepImportNode";
import InspectorPanel    from "./InspectorPanel";
import { NODE_COLORS }   from "./nodes/nodeStyles";
import { S }             from "../styles";

const NODE_TYPES = {
  geometry:       GeometryNode,
  strategy:       StrategyNode,
  orient:         OrientNode,
  post_processor: PostProcessorNode,
  step_import:    StepImportNode,
};

const RULE_TYPES = [
  { value: "to_normal",       label: "to_normal" },
  { value: "fixed",           label: "fixed(i,j,k)" },
  { value: "lead",            label: "lead(°)" },
  { value: "lag",             label: "lag(°)" },
  { value: "side_tilt",       label: "side_tilt(°)" },
  { value: "avoid_collision", label: "avoid_collision" },
];

const NODE_MENU_GROUPS = [
  {
    label: "STRATEGY",
    items: [
      { type: "strategy", label: "Follow Curve",     params: { strategy_type: "follow_curve" } },
      { type: "strategy", label: "Raster Fill",      params: { strategy_type: "raster_fill" } },
      { type: "strategy", label: "Contour Parallel", params: { strategy_type: "contour_parallel" } },
    ],
  },
  {
    label: "ORIENT RULE",
    items: RULE_TYPES.map((r) => ({ type: "orient", label: r.label, params: { rule: r.value } })),
  },
  {
    label: "OTHER",
    items: [
      { type: "step_import",    label: "STEP Import" },
      { type: "geometry",       label: "Geometry Input" },
      { type: "post_processor", label: "Post Processor" },
    ],
  },
];

/** Convert graphStore nodes → React Flow nodes */
function toRFNodes(storeNodes, selectedNodeId) {
  return storeNodes.map((n) => ({
    id:       n.id,
    type:     n.type,
    position: n.position,
    selected: n.id === selectedNodeId,
    data:     n,
  }));
}

/** Convert graphStore edges → React Flow edges with wire-style hints */
function toRFEdges(storeEdges, storeNodes) {
  const portTypeMap = {};
  storeNodes.forEach((n) => {
    [...n.input_ports, ...n.output_ports].forEach((p) => {
      portTypeMap[`${n.id}::${p.id}`] = p.type;
    });
  });

  return storeEdges.map((e) => {
    const fromType = portTypeMap[`${e.from_node}::${e.from_port}`];
    const toType   = portTypeMap[`${e.to_node}::${e.to_port}`];
    const sameType = fromType && toType && fromType === toType;
    const color    = NODE_COLORS[storeNodes.find((n) => n.id === e.from_node)?.type] ?? "#9090aa";

    return {
      id:           e.id,
      source:       e.from_node,
      sourceHandle: e.from_port,
      target:       e.to_node,
      targetHandle: e.to_port,
      animated:     false,
      style: {
        stroke:          color,
        strokeWidth:     2,
        strokeDasharray: sameType ? "none" : "5 4",
        opacity:         0.85,
      },
    };
  });
}

// Context menu component
function ContextMenu({ x, y, onSelect, onClose }) {
  return (
    <>
      {/* Click-away overlay */}
      <div style={{ position: "fixed", inset: 0, zIndex: 999 }} onClick={onClose} />
      <div style={{
        position: "fixed", left: x, top: y, zIndex: 1000,
        background: "#1a1a2e", border: "1px solid #3a3a5e", borderRadius: 8,
        padding: "6px 0", minWidth: 180, boxShadow: "0 4px 20px rgba(0,0,0,0.35)",
        fontSize: 11,
      }}>
        {NODE_MENU_GROUPS.map((group) => (
          <div key={group.label}>
            <div style={{
              padding: "4px 12px 2px", fontSize: 9, color: "#66667a",
              letterSpacing: 1, fontWeight: 600,
            }}>
              {group.label}
            </div>
            {group.items.map((item) => (
              <div
                key={`${item.type}_${item.label}`}
                onClick={() => { onSelect(item); onClose(); }}
                style={{
                  padding: "5px 16px", cursor: "pointer", color: "#e0e0f0",
                  borderLeft: `2px solid ${NODE_COLORS[item.type] ?? "#9090aa"}`,
                  marginLeft: 8, borderRadius: 2,
                  transition: "background 0.1s",
                }}
                onMouseEnter={(e) => e.currentTarget.style.background = "rgba(99,85,224,0.15)"}
                onMouseLeave={(e) => e.currentTarget.style.background = "transparent"}
              >
                {item.label}
              </div>
            ))}
            <div style={{ height: 1, background: "#2a2a4a", margin: "4px 8px" }} />
          </div>
        ))}
      </div>
    </>
  );
}

function NodeGraphInner() {
  const nodes          = useGraphStore((s) => s.nodes);
  const edges          = useGraphStore((s) => s.edges);
  const selectedNodeId = useGraphStore((s) => s.selectedNodeId);
  const isGenerating   = useGraphStore((s) => s.isGenerating);

  const setSelectedNode    = useGraphStore((s) => s.setSelectedNode);
  const updateNodePosition = useGraphStore((s) => s.updateNodePosition);
  const removeNode         = useGraphStore((s) => s.removeNode);
  const addNodeToStore     = useGraphStore((s) => s.addNode);
  const addEdge            = useGraphStore((s) => s.addEdge);
  const removeEdge         = useGraphStore((s) => s.removeEdge);
  const addOrientNode      = useGraphStore((s) => s.addOrientNode);
  const removeOrientNode   = useGraphStore((s) => s.removeOrientNode);
  const moveOrientNode     = useGraphStore((s) => s.moveOrientNode);
  const setGenerating      = useGraphStore((s) => s.setGenerating);
  const setGeneratedCode   = useGraphStore((s) => s.setGeneratedCode);
  const setGcodeOutput     = useGraphStore((s) => s.setGcodeOutput);

  const allFaces          = useStepStore((s) => s.faces);
  const allEdges          = useStepStore((s) => s.edges);
  const getSelectedFaces  = useStepStore((s) => s.getSelectedFaces);
  const getSelectedEdges  = useStepStore((s) => s.getSelectedEdges);
  const workspaceOrigin   = useStepStore((s) => s.workspaceOrigin);
  const addToolpath       = useToolpathStore((s) => s.addToolpath);
  const setActivePanel    = useUiStore((s) => s.setActivePanel);
  const setShowToolpaths  = useUiStore((s) => s.setShowToolpaths);
  const toggleGraphView   = useUiStore((s) => s.toggleGraphView);

  const { screenToFlowPosition } = useReactFlow();
  const [contextMenu, setContextMenu] = useState(null);

  const rfNodes = useMemo(() => toRFNodes(nodes, selectedNodeId), [nodes, selectedNodeId]);
  const rfEdges = useMemo(() => toRFEdges(edges, nodes), [edges, nodes]);

  // ── React Flow change handlers ─────────────────────────────────────────────

  const onNodesChange = useCallback((changes) => {
    changes.forEach((change) => {
      if (change.type === "position" && change.position) {
        updateNodePosition(change.id, change.position);
      }
      if (change.type === "remove") {
        const node = nodes.find((n) => n.id === change.id);
        // Geometry and post_processor are structural anchors — disallow deletion
        if (node && node.type !== "geometry" && node.type !== "post_processor") {
          removeNode(change.id);
        }
      }
    });
  }, [updateNodePosition, removeNode, nodes]);

  const onEdgesChange = useCallback((changes) => {
    changes.forEach((change) => {
      if (change.type === "remove") removeEdge(change.id);
    });
  }, [removeEdge]);

  const onConnect = useCallback((connection) => {
    const result = addEdge({
      id:        `e_${connection.source}_${connection.sourceHandle}_${connection.target}_${connection.targetHandle}`,
      from_node: connection.source,
      from_port: connection.sourceHandle,
      to_node:   connection.target,
      to_port:   connection.targetHandle,
    });
    if (!result.ok) {
      console.warn("Edge rejected:", result.reason);
    }
  }, [addEdge]);

  const onNodeClick = useCallback((_, node) => {
    setSelectedNode(node.id);
  }, [setSelectedNode]);

  const onPaneClick = useCallback(() => {
    setSelectedNode(null);
    setContextMenu(null);
  }, [setSelectedNode]);

  const onPaneContextMenu = useCallback((e) => {
    e.preventDefault();
    const flowPos = screenToFlowPosition({ x: e.clientX, y: e.clientY });
    setContextMenu({ screenX: e.clientX, screenY: e.clientY, flowPos });
  }, [screenToFlowPosition]);

  const handleContextMenuSelect = useCallback((item) => {
    if (!contextMenu) return;
    addNodeToStore(item.type, contextMenu.flowPos, item.params ?? {});
  }, [contextMenu, addNodeToStore]);

  // ── Generate toolpath ──────────────────────────────────────────────────────

  // Resolve geometry for the strategy node:
  // 1. If faces_in/edges_in are wired, use the source node's stored geometry
  // 2. Else use the strategy node's own stored selection
  // 3. Else fall back to the global viewport selection
  const stratNode    = nodes.find((n) => n.type === "strategy");
  const facesEdge    = edges.find((e) => e.to_node === stratNode?.id && e.to_port === "faces_in");
  const edgesEdge    = edges.find((e) => e.to_node === stratNode?.id && e.to_port === "edges_in");
  const geoSource    = facesEdge ? nodes.find((n) => n.id === facesEdge.from_node) : null;
  const geoEdgeSource = edgesEdge ? nodes.find((n) => n.id === edgesEdge.from_node) : null;
  // Resolve faces from a wired source node — handles both step_import (full output)
  // and geometry/orient nodes (stored selected_face_ids lookup in allFaces)
  const resolveFaces = (srcNode) => {
    if (!srcNode) return null;
    if (srcNode.type === "step_import") return srcNode.output?.faces ?? [];
    const ids = srcNode.params?.selected_face_ids ?? [];
    return ids.length > 0 ? allFaces.filter((f) => ids.includes(f.id)) : null;
  };
  const resolveEdges = (srcNode) => {
    if (!srcNode) return null;
    if (srcNode.type === "step_import") return srcNode.output?.edges ?? [];
    const ids = srcNode.params?.selected_edge_ids ?? [];
    return ids.length > 0 ? allEdges.filter((e) => ids.includes(e.id)) : null;
  };

  const wiredFaces   = resolveFaces(geoSource);
  const wiredEdges   = resolveEdges(geoEdgeSource);
  const storedFaceIds = stratNode?.params.selected_face_ids ?? [];
  const storedEdgeIds = stratNode?.params.selected_edge_ids ?? [];
  const selFaces = wiredFaces
    ?? (storedFaceIds.length > 0 ? allFaces.filter((f) => storedFaceIds.includes(f.id)) : getSelectedFaces());
  const selEdges = wiredEdges
    ?? (storedEdgeIds.length > 0 ? allEdges.filter((e) => storedEdgeIds.includes(e.id)) : getSelectedEdges());
  const canGenerate = selFaces.length > 0 || selEdges.length > 0;
  const strategy    = getStrategyParams({ nodes });
  const orientRules = getOrientRules({ nodes, edges });

  const COLORS = ["#6355e0", "#e06020", "#16a34a", "#d97706", "#cc3377", "#1a9e7a"];

  const handleGenerate = async () => {
    setGenerating(true);
    try {
      const data = await generateToolpath({
        faces: selFaces, edges: selEdges,
        strategy, orientationRules: orientRules,
        machine: "gantry_5axis_ac", workspaceOrigin,
      });
      const color = COLORS[useToolpathStore.getState().toolpaths.length % COLORS.length];
      addToolpath(`${strategy.strategy_type} — ${new Date().toLocaleTimeString()}`, data.points ?? [], color);
      if (data.python_code) setGeneratedCode(data.python_code);
      if (data.gcode)       setGcodeOutput(data.gcode);
      // Show toolpaths in 3D view and switch to it
      setShowToolpaths(true);
      toggleGraphView();
    } catch {
      const code = generatePythonCode(selFaces, selEdges, strategy, orientRules);
      setGeneratedCode(code);
      setActivePanel("code");
    } finally {
      setGenerating(false);
    }
  };

  // ── Orient nodes list ──────────────────────────────────────────────────────
  const orientNodes = getOrientNodes({ nodes, edges });

  return (
    <div style={{ display: "flex", width: "100%", height: "100%", overflow: "hidden" }}>

      {/* Left control strip */}
      <div style={{
        width: 200, flexShrink: 0, background: "#eaeaf2",
        borderRight: "1px solid #d0d0df", display: "flex",
        flexDirection: "column", gap: 0, overflow: "hidden",
      }}>
        <div style={{ padding: "12px 12px 8px" }}>
          <button
            style={{ ...S.primaryBtn, width: "100%", padding: "8px 0", opacity: canGenerate ? 1 : 0.4, fontSize: 11 }}
            onClick={handleGenerate}
            disabled={!canGenerate || isGenerating}
          >
            {isGenerating ? "GENERATING…" : "▶ GENERATE"}
          </button>
        </div>

        <div style={{ padding: "0 12px 8px", borderBottom: "1px solid #d0d0df" }}>
          <button
            style={{ ...S.btn, width: "100%", fontSize: 10 }}
            onClick={() => { setGeneratedCode(generatePythonCode(selFaces, selEdges, strategy, orientRules)); setActivePanel("code"); }}
          >
            Preview Python
          </button>
        </div>

        {/* Orient rules list */}
        <div style={{ flex: 1, overflowY: "auto", padding: "10px 12px" }}>
          <div style={{ ...S.sectionLabel, marginBottom: 8 }}>
            ORIENT RULES ({orientNodes.length})
          </div>

          {orientNodes.map((node, idx) => (
            <div key={node.id} style={{
              background: "#f4f4fa", border: "1px solid #d0d0df",
              borderRadius: 6, padding: "6px 8px", marginBottom: 4, fontSize: 10,
            }}>
              <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
                <span style={{ color: "#66667a", minWidth: 14 }}>{idx + 1}.</span>
                <span style={{ flex: 1, color: "#d97706", fontWeight: 600, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                  {node.params.rule}
                </span>
                <button onClick={() => idx > 0 && moveOrientNode(idx, idx - 1)} style={S.iconBtn}>↑</button>
                <button onClick={() => idx < orientNodes.length - 1 && moveOrientNode(idx, idx + 1)} style={S.iconBtn}>↓</button>
                <button onClick={() => removeOrientNode(idx)} style={{ ...S.iconBtn, color: "#d93025" }}>×</button>
              </div>
            </div>
          ))}

          <select
            onChange={(e) => { if (e.target.value) { addOrientNode(e.target.value); e.target.value = ""; } }}
            style={{ ...S.select, width: "100%", marginTop: 4, fontSize: 10 }}
            defaultValue=""
          >
            <option value="" disabled>+ Add orient rule…</option>
            {RULE_TYPES.map((r) => <option key={r.value} value={r.value}>{r.label}</option>)}
          </select>
        </div>

        {/* Canvas hint */}
        <div style={{ padding: "8px 12px", borderTop: "1px solid #d0d0df", fontSize: 9, color: "#9090aa", lineHeight: 1.6 }}>
          Right-click canvas to add nodes.{"\n"}
          Drag handles to connect.{"\n"}
          Backspace to delete selected.
        </div>
      </div>

      {/* React Flow canvas */}
      <div style={{ flex: 1, position: "relative" }}>
        <ReactFlow
          nodes={rfNodes}
          edges={rfEdges}
          nodeTypes={NODE_TYPES}
          onNodesChange={onNodesChange}
          onEdgesChange={onEdgesChange}
          onConnect={onConnect}
          onNodeClick={onNodeClick}
          onPaneClick={onPaneClick}
          onPaneContextMenu={onPaneContextMenu}
          fitView
          fitViewOptions={{ padding: 0.3 }}
          deleteKeyCode="Backspace"
          style={{ background: "#f0f0f5" }}
        >
          <Background color="#d0d0df" gap={20} size={1} />
          <Controls style={{ bottom: 16, left: 16 }} />
          <MiniMap
            nodeColor={(n) => NODE_COLORS[n.type] ?? "#aaa"}
            style={{ bottom: 16, right: 16, background: "#eaeaf2", border: "1px solid #d0d0df" }}
          />
        </ReactFlow>

        {contextMenu && (
          <ContextMenu
            x={contextMenu.screenX}
            y={contextMenu.screenY}
            onSelect={handleContextMenuSelect}
            onClose={() => setContextMenu(null)}
          />
        )}
      </div>

      {/* Inspector panel */}
      <InspectorPanel />
    </div>
  );
}

export default function NodeGraphPanel() {
  return (
    <ReactFlowProvider>
      <NodeGraphInner />
    </ReactFlowProvider>
  );
}
