import { Handle, Position } from "reactflow";
import { useUiStore } from "../../../store/uiStore";
import { useGraphStore } from "../../../store/graphStore";
import { NODE_COLORS, nodeWrap, nodeHeader, nodeBody, paramRow, paramKey, paramValue } from "./nodeStyles";

const COLOR = NODE_COLORS.strategy;

const STRATEGY_LABELS = {
  follow_curve:     "Follow Curve",
  raster_fill:      "Raster Fill",
  contour_parallel: "Contour Parallel",
};

const GEO_BTN = {
  width: "100%", padding: "3px 6px", marginTop: 2,
  background: "#eeeef8", border: "1px solid #c8c8e0", borderRadius: 4,
  color: "#6355e0", fontSize: 9, cursor: "pointer", letterSpacing: 0.4,
  fontFamily: "inherit", textAlign: "left",
};

const WIRED_BADGE = {
  width: "100%", padding: "3px 6px", marginTop: 2,
  background: "#e8f5e9", border: "1px solid #a5d6a7", borderRadius: 4,
  color: "#16a34a", fontSize: 9, letterSpacing: 0.4, textAlign: "left",
};

export default function StrategyNode({ data, selected }) {
  const { params } = data;
  const label = STRATEGY_LABELS[params.strategy_type] ?? params.strategy_type;
  const startGeometryPick = useUiStore((s) => s.startGeometryPick);

  // Detect whether geometry is being supplied via a wired connection
  const edges = useGraphStore((s) => s.edges);
  const facesWired = edges.some((e) => e.to_node === data.id && e.to_port === "faces_in");
  const edgesWired = edges.some((e) => e.to_node === data.id && e.to_port === "edges_in");
  const isWired = facesWired || edgesWired;

  const faceCount = params.selected_face_ids?.length ?? 0;
  const edgeCount = params.selected_edge_ids?.length ?? 0;
  const hasStoredGeo = faceCount > 0 || edgeCount > 0;

  return (
    <div style={nodeWrap(COLOR, selected)}>
      <Handle type="target" position={Position.Left} id="faces_in"
        style={{ top: "40%", background: COLOR, width: 8, height: 8, border: "2px solid #fff" }} />
      <Handle type="target" position={Position.Left} id="edges_in"
        style={{ top: "65%", background: COLOR, width: 8, height: 8, border: "2px solid #fff" }} />

      <div style={nodeHeader(COLOR)}>
        <span>⟶</span> {label.toUpperCase()}
      </div>
      <div style={nodeBody}>
        <div style={paramRow}>
          <span style={paramKey}>feed</span>
          <span style={paramValue}>{params.feed_rate} mm/min</span>
        </div>
        {params.strategy_type === "follow_curve" && (
          <div style={paramRow}>
            <span style={paramKey}>spacing</span>
            <span style={paramValue}>{params.spacing} mm</span>
          </div>
        )}
        {params.strategy_type === "raster_fill" && (
          <>
            <div style={paramRow}>
              <span style={paramKey}>spacing</span>
              <span style={paramValue}>{params.spacing} mm</span>
            </div>
            <div style={paramRow}>
              <span style={paramKey}>angle</span>
              <span style={paramValue}>{params.angle}°</span>
            </div>
          </>
        )}
        {params.strategy_type === "contour_parallel" && (
          <div style={paramRow}>
            <span style={paramKey}>passes</span>
            <span style={paramValue}>{params.num_passes} × {params.stepover}mm</span>
          </div>
        )}
        <div style={paramRow}>
          <span style={paramKey}>path</span>
          <span style={paramValue}>{params.path_type}</span>
        </div>

        {/* Geometry input — wired connection takes priority over manual selection */}
        <div style={{ marginTop: 6, borderTop: "1px solid #e0e0ee", paddingTop: 6 }}>
          {isWired ? (
            <div style={WIRED_BADGE}>◉ Geometry via connected node</div>
          ) : (
            <button
              style={GEO_BTN}
              onMouseDown={(e) => e.stopPropagation()}
              onClick={(e) => { e.stopPropagation(); startGeometryPick(data.id, label); }}
            >
              {hasStoredGeo
                ? `◉ ${faceCount}F · ${edgeCount}E — change`
                : "◎ Select geometry…"}
            </button>
          )}
        </div>
      </div>

      <Handle type="source" position={Position.Right} id="toolpath_out"
        style={{ top: "50%", background: COLOR, width: 8, height: 8, border: "2px solid #fff" }} />
    </div>
  );
}
