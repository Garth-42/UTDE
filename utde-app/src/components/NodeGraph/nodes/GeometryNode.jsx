import { Handle, Position } from "reactflow";
import { useUiStore } from "../../../store/uiStore";
import { NODE_COLORS, nodeWrap, nodeHeader, nodeBody, paramRow, paramKey, paramValue } from "./nodeStyles";

const COLOR = NODE_COLORS.geometry;

const GEO_BTN = {
  width: "100%", padding: "3px 6px", marginTop: 2,
  background: "#e8f5e9", border: "1px solid #a5d6a7", borderRadius: 4,
  color: COLOR, fontSize: 9, cursor: "pointer", letterSpacing: 0.4,
  fontFamily: "inherit", textAlign: "left",
};

export default function GeometryNode({ data, selected }) {
  const startGeometryPick = useUiStore((s) => s.startGeometryPick);

  const faceCount = data.params?.selected_face_ids?.length ?? 0;
  const edgeCount = data.params?.selected_edge_ids?.length ?? 0;
  const hasStoredGeo = faceCount > 0 || edgeCount > 0;

  return (
    <div style={nodeWrap(COLOR, selected)}>
      <div style={nodeHeader(COLOR)}>
        <span>◈</span> GEOMETRY
      </div>
      <div style={nodeBody}>
        <div style={paramRow}>
          <span style={paramKey}>faces</span>
          <span style={{ ...paramValue, color: faceCount > 0 ? COLOR : "#aaa" }}>
            {faceCount > 0 ? faceCount : "none"}
          </span>
        </div>
        <div style={paramRow}>
          <span style={paramKey}>edges</span>
          <span style={{ ...paramValue, color: edgeCount > 0 ? COLOR : "#aaa" }}>
            {edgeCount > 0 ? edgeCount : "none"}
          </span>
        </div>

        <div style={{ marginTop: 6, borderTop: "1px solid #d4edda", paddingTop: 6 }}>
          <button
            style={GEO_BTN}
            onMouseDown={(e) => e.stopPropagation()}
            onClick={(e) => { e.stopPropagation(); startGeometryPick(data.id, data.label); }}
          >
            {hasStoredGeo
              ? `◉ ${faceCount}F · ${edgeCount}E — change`
              : "◎ Select geometry…"}
          </button>
        </div>
      </div>

      <Handle type="source" position={Position.Right} id="faces_out"
        style={{ top: "40%", background: COLOR, width: 8, height: 8, border: "2px solid #fff" }} />
      <Handle type="source" position={Position.Right} id="edges_out"
        style={{ top: "65%", background: COLOR, width: 8, height: 8, border: "2px solid #fff" }} />
    </div>
  );
}
