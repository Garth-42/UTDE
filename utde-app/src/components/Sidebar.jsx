import { useStepStore } from "../store/stepStore";
import { useUiStore } from "../store/uiStore";
import { useGraphStore } from "../store/graphStore";
import { useToolpathStore } from "../store/toolpathStore";
import StepUpload from "./sidebar/StepUpload";
import GeometryList from "./sidebar/GeometryList";
import SelectionInfo from "./sidebar/SelectionInfo";
import OriginPanel from "./sidebar/OriginPanel";
import ToolpathSidebar from "./sidebar/ToolpathSidebar";
import { NODE_COLORS } from "./NodeGraph/nodes/nodeStyles";

const SIDEBAR_STYLE = {
  width: 280, minWidth: 280,
  padding: 14,
  borderRight: "1px solid #d0d0df",
  background: "#eaeaf2",
  display: "flex",
  flexDirection: "column",
  gap: 14,
  overflowY: "auto",
  fontSize: 12,
  fontFamily: '"Segoe UI", system-ui, sans-serif',
};

const STRATEGY_LABELS = {
  follow_curve:     "Follow Curve",
  raster_fill:      "Raster Fill",
  contour_parallel: "Contour Parallel",
};

/** Shown at the top of the sidebar when picking geometry for a specific node. */
function NodeContext({ nodeId }) {
  const node = useGraphStore((s) => s.nodes.find((n) => n.id === nodeId));
  if (!node) return null;

  const color = NODE_COLORS[node.type] ?? "#66667a";
  const faceCount = node.params.selected_face_ids?.length ?? 0;
  const edgeCount = node.params.selected_edge_ids?.length ?? 0;

  // Collect the most relevant params to preview
  const previewParams = [];
  if (node.type === "strategy") {
    previewParams.push(["Strategy", STRATEGY_LABELS[node.params.strategy_type] ?? node.params.strategy_type]);
    previewParams.push(["Feed rate", `${node.params.feed_rate} mm/min`]);
    if (node.params.strategy_type === "follow_curve")
      previewParams.push(["Spacing", `${node.params.spacing} mm`]);
    if (node.params.strategy_type === "raster_fill")
      previewParams.push(["Angle", `${node.params.angle}°`]);
    if (node.params.strategy_type === "contour_parallel")
      previewParams.push(["Passes", `${node.params.num_passes}`]);
  } else if (node.type === "orient") {
    previewParams.push(["Rule", node.params.rule]);
    if (node.params.angle_deg != null)
      previewParams.push(["Angle", `${node.params.angle_deg}°`]);
    if (node.params.max_tilt != null)
      previewParams.push(["Max tilt", `${node.params.max_tilt}°`]);
  }

  return (
    <div style={{
      background: "#fff", border: `1px solid ${color}44`,
      borderLeft: `3px solid ${color}`, borderRadius: 8,
      padding: "10px 12px",
    }}>
      <div style={{ fontSize: 9, color, letterSpacing: 1, fontWeight: 700, marginBottom: 6 }}>
        {node.type.replace("_", " ").toUpperCase()}
      </div>
      <div style={{ fontSize: 12, color: "#1a1a2e", fontWeight: 600, marginBottom: 8 }}>
        {node.label}
      </div>

      {previewParams.map(([k, v]) => (
        <div key={k} style={{ display: "flex", justifyContent: "space-between", fontSize: 10, lineHeight: 1.8 }}>
          <span style={{ color: "#66667a" }}>{k}</span>
          <span style={{ color: "#1a1a2e" }}>{v}</span>
        </div>
      ))}

      {(faceCount > 0 || edgeCount > 0) && (
        <div style={{ marginTop: 8, fontSize: 10, color: "#66667a", borderTop: "1px solid #e8e8f0", paddingTop: 6 }}>
          Currently assigned: <span style={{ color }}>{faceCount}F · {edgeCount}E</span>
          <span style={{ color: "#9090aa" }}> (will be replaced on confirm)</span>
        </div>
      )}
    </div>
  );
}

export default function Sidebar() {
  const graphView       = useUiStore((s) => s.graphView);
  const geometryPick    = useUiStore((s) => s.geometryPick);
  const selectionMode   = useUiStore((s) => s.selectionMode);
  const setSelMode      = useUiStore((s) => s.setSelectionMode);
  const faces           = useStepStore((s) => s.faces);
  const edges           = useStepStore((s) => s.edges);
  const error           = useStepStore((s) => s.error);
  const toolpathCount   = useToolpathStore((s) => s.toolpaths.length);
  const hasGeometry     = faces.length > 0 || edges.length > 0;

  // Hidden entirely in node graph view
  if (graphView) return null;

  // Geometry pick mode — focused sidebar showing the node being edited
  if (geometryPick) {
    return (
      <div style={SIDEBAR_STYLE}>
        <div style={{ fontSize: 9, color: "#6355e0", letterSpacing: 1, fontWeight: 700 }}>
          SELECTING FOR NODE
        </div>

        <NodeContext nodeId={geometryPick.nodeId} />

        {/* Selection mode toggle */}
        <div>
          <div style={{ fontSize: 9, color: "#66667a", letterSpacing: 1, marginBottom: 6 }}>SELECT</div>
          <div style={{ display: "flex", gap: 4 }}>
            {["faces", "edges", "both"].map((m) => (
              <button
                key={m}
                onClick={() => setSelMode(m)}
                style={{
                  flex: 1, padding: "5px 0", borderRadius: 6, cursor: "pointer",
                  fontSize: 10, letterSpacing: 0.5, fontFamily: "inherit",
                  border: `1px solid ${selectionMode === m ? "#6355e0" : "#d0d0df"}`,
                  background: selectionMode === m ? "rgba(99,85,224,0.10)" : "#f4f4fa",
                  color: selectionMode === m ? "#6355e0" : "#66667a",
                  transition: "all 0.15s",
                }}
              >
                {m.toUpperCase()}
              </button>
            ))}
          </div>
        </div>

        {error && (
          <div style={{ fontSize: 10, color: "#c0291e", padding: "6px 10px", background: "#fdecea", borderRadius: 6 }}>
            {error}
          </div>
        )}

        {hasGeometry ? (
          <>
            <GeometryList />
            <SelectionInfo />
          </>
        ) : (
          <div style={{ fontSize: 10, color: "#66667a" }}>Upload a STEP file to select geometry.</div>
        )}
      </div>
    );
  }

  // Standard 3D view — model browser
  return (
    <div style={SIDEBAR_STYLE}>
      <StepUpload />

      {error && (
        <div style={{ fontSize: 10, color: "#c0291e", lineHeight: 1.6, padding: "8px 10px", background: "#fdecea", borderRadius: 8, border: "1px solid #f5b8b0" }}>
          {error}
          {error.includes("pythonocc") && (
            <div style={{ marginTop: 4, color: "#66667a" }}>
              Start the server:<br />
              <code style={{ color: "#6355e0" }}>python step_server.py</code>
            </div>
          )}
        </div>
      )}

      {hasGeometry && (
        <>
          <GeometryList />
          <SelectionInfo />
          <OriginPanel />
        </>
      )}

      {toolpathCount > 0 && (
        <div style={{ borderTop: "1px solid #d0d0df", paddingTop: 14 }}>
          <ToolpathSidebar />
        </div>
      )}
    </div>
  );
}
