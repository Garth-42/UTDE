import { Handle, Position } from "reactflow";
import { useUiStore } from "../../../store/uiStore";
import { useGraphStore } from "../../../store/graphStore";
import { NODE_COLORS, nodeWrap, nodeHeader, nodeBody, paramRow, paramKey, paramValue } from "./nodeStyles";

const COLOR = NODE_COLORS.orient;

const PARAM_LABELS = {
  angle_deg:  "angle",
  surface_id: "surface",
  max_tilt:   "max tilt",
  i: "i", j: "j", k: "k",
};

// Rules that use a reference surface/geometry
const RULES_WITH_GEO = new Set(["to_normal", "avoid_collision"]);

const GEO_BTN = {
  width: "100%", padding: "3px 6px", marginTop: 2,
  background: "#fdf3e0", border: "1px solid #e8c97a", borderRadius: 4,
  color: "#d97706", fontSize: 9, cursor: "pointer", letterSpacing: 0.4,
  fontFamily: "inherit", textAlign: "left",
};

const WIRED_BADGE = {
  width: "100%", padding: "3px 6px", marginTop: 2,
  background: "#e8f5e9", border: "1px solid #a5d6a7", borderRadius: 4,
  color: "#16a34a", fontSize: 9, letterSpacing: 0.4, textAlign: "left",
};

export default function OrientNode({ data, selected }) {
  const { params } = data;
  const startGeometryPick = useUiStore((s) => s.startGeometryPick);

  const edges = useGraphStore((s) => s.edges);
  const isWired = edges.some((e) => e.to_node === data.id && e.to_port === "surface_in");

  const ruleParams = Object.entries(params)
    .filter(([k]) => k !== "rule" && k !== "selected_face_ids" && k !== "selected_edge_ids")
    .slice(0, 3);

  const faceCount = params.selected_face_ids?.length ?? 0;
  const edgeCount = params.selected_edge_ids?.length ?? 0;
  const hasStoredGeo = faceCount > 0 || edgeCount > 0;
  const showGeoSection = RULES_WITH_GEO.has(params.rule);

  return (
    <div style={nodeWrap(COLOR, selected)}>
      <Handle type="target" position={Position.Left} id="toolpath_in"
        style={{ top: "35%", background: COLOR, width: 8, height: 8, border: "2px solid #fff" }} />

      {/* surface_in: geometry input port — present on all orient nodes so any can
          accept a wired geometry source. Only surface-aware rules show the button. */}
      <Handle type="target" position={Position.Left} id="surface_in"
        style={{
          top: "65%",
          background: NODE_COLORS.geometry,
          width: 8, height: 8, border: "2px solid #fff",
        }} />

      <div style={nodeHeader(COLOR)}>
        <span>↻</span> {params.rule?.toUpperCase().replace(/_/g, " ")}
      </div>
      <div style={nodeBody}>
        {ruleParams.map(([key, val]) => (
          <div key={key} style={paramRow}>
            <span style={paramKey}>{PARAM_LABELS[key] ?? key}</span>
            <span style={paramValue}>{typeof val === "number" ? `${val}°` : String(val)}</span>
          </div>
        ))}

        {showGeoSection && (
          <div style={{ marginTop: 6, borderTop: "1px solid #f0e0c0", paddingTop: 6 }}>
            {isWired ? (
              <div style={WIRED_BADGE}>◉ Reference via connected node</div>
            ) : (
              <button
                style={GEO_BTN}
                onMouseDown={(e) => e.stopPropagation()}
                onClick={(e) => { e.stopPropagation(); startGeometryPick(data.id, params.rule); }}
              >
                {hasStoredGeo
                  ? `◉ ${faceCount}F · ${edgeCount}E — change`
                  : "◎ Select reference…"}
              </button>
            )}
          </div>
        )}
      </div>

      <Handle type="source" position={Position.Right} id="toolpath_out"
        style={{ top: "50%", background: COLOR, width: 8, height: 8, border: "2px solid #fff" }} />
    </div>
  );
}
