import { useStepStore } from "../../store/stepStore";
import { S } from "../styles";

const FACE_COLORS = {
  plane: "#3b75b0", cylinder: "#1a9e7a", sphere: "#1a9e60",
  cone: "#9a6e20", torus: "#883377", other: "#66667a",
};
const EDGE_COLORS = {
  line: "#6355e0", circle: "#c07a00", ellipse: "#cc3377",
  bspline: "#1a8a3a", other: "#66667a",
};

function ItemRow({ id, label, type, colorMap, isSelected, isHovered, onToggle, onHover, onDeselect }) {
  const color = colorMap[type] ?? colorMap.other;
  return (
    <div
      onClick={onToggle}
      onMouseEnter={onHover}
      style={{
        padding: "6px 8px", marginBottom: 2, borderRadius: 6, cursor: "pointer",
        display: "flex", alignItems: "center", gap: 8,
        background: isSelected ? "#e0e0f0" : isHovered ? "#e8e8f4" : "transparent",
        border: `1px solid ${isSelected ? "#c0c0d8" : "transparent"}`,
        transition: "all 0.12s",
      }}
    >
      <div style={{
        width: 8, height: 8, borderRadius: "50%", flexShrink: 0,
        background: isSelected ? "#d97706" : color,
        border: `1px solid ${color}`,
        boxShadow: isSelected ? "0 0 6px #d9770666" : "none",
      }} />
      <div style={{ flex: 1, overflow: "hidden" }}>
        <div style={{ color: isSelected ? "#1a1a2e" : "#44445a", fontSize: 11 }}>{label}</div>
        <div style={{ fontSize: 9, color: isSelected ? "#d97706" : "#66667a", marginTop: 1 }}>{type}</div>
      </div>
      {isSelected && (
        <div
          onClick={(e) => { e.stopPropagation(); onDeselect(); }}
          title="Deselect"
          style={{
            width: 18, height: 18, borderRadius: 4, flexShrink: 0,
            display: "flex", alignItems: "center", justifyContent: "center",
            fontSize: 14, lineHeight: 1, color: "#d93025",
            background: "#fdecea", border: "1px solid #d93025",
            cursor: "pointer",
          }}
          onMouseEnter={(e) => { e.currentTarget.style.background = "#d93025"; e.currentTarget.style.color = "#fff"; }}
          onMouseLeave={(e) => { e.currentTarget.style.background = "#fdecea"; e.currentTarget.style.color = "#d93025"; }}
        >
          ✕
        </div>
      )}
    </div>
  );
}

export default function GeometryList() {
  const faces           = useStepStore((s) => s.faces);
  const edges           = useStepStore((s) => s.edges);
  const selectedFaceIds = useStepStore((s) => s.selectedFaceIds);
  const selectedEdgeIds = useStepStore((s) => s.selectedEdgeIds);
  const hoveredFaceId   = useStepStore((s) => s.hoveredFaceId);
  const hoveredEdgeId   = useStepStore((s) => s.hoveredEdgeId);
  const toggleFace      = useStepStore((s) => s.toggleFace);
  const toggleEdge      = useStepStore((s) => s.toggleEdge);
  const setHovered      = useStepStore((s) => s.setHovered);
  const selectByType    = useStepStore((s) => s.selectByType);
  const selectAll       = useStepStore((s) => s.selectAll);
  const deselectAll     = useStepStore((s) => s.deselectAll);

  const faceTypes = [...new Set(faces.map((f) => f.type))];
  const edgeTypes = [...new Set(edges.map((e) => e.type))];

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 10, flex: 1, overflow: "hidden" }}>
      <div>
        <div style={{ ...S.sectionLabel, marginBottom: 6 }}>SELECT BY TYPE</div>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 4 }}>
          {faceTypes.map((t) => (
            <button key={t} onClick={() => selectByType(t)} style={S.chipBtn}>{t}</button>
          ))}
          {edgeTypes.map((t) => (
            <button key={`e-${t}`} onClick={() => selectByType(t)} style={{ ...S.chipBtn, borderColor: "#c0c0d0" }}>
              {t} (edge)
            </button>
          ))}
        </div>
      </div>

      {faces.length > 0 && (
        <div style={{ display: "flex", flexDirection: "column", minHeight: 0 }}>
          <div style={{ ...S.sectionLabel, marginBottom: 4, display: "flex", justifyContent: "space-between" }}>
            <span>FACES ({faces.length})</span>
            {selectedFaceIds.size > 0 && <span style={{ color: "#d97706" }}>{selectedFaceIds.size} sel</span>}
          </div>
          <div style={{ overflowY: "auto", flex: 1 }}>
            {faces.map((face) => (
              <ItemRow
                key={face.id} id={face.id} label={`Face ${face.id}`} type={face.type}
                colorMap={FACE_COLORS} isSelected={selectedFaceIds.has(face.id)}
                isHovered={hoveredFaceId === face.id}
                onToggle={(e) => toggleFace(face.id, e?.shiftKey || e?.ctrlKey || e?.metaKey)}
                onHover={() => setHovered("face", face.id)}
                onDeselect={() => toggleFace(face.id, true)}
              />
            ))}
          </div>
        </div>
      )}

      {edges.length > 0 && (
        <div style={{ display: "flex", flexDirection: "column", minHeight: 0 }}>
          <div style={{ ...S.sectionLabel, marginBottom: 4, display: "flex", justifyContent: "space-between" }}>
            <span>EDGES ({edges.length})</span>
            {selectedEdgeIds.size > 0 && <span style={{ color: "#d97706" }}>{selectedEdgeIds.size} sel</span>}
          </div>
          <div style={{ overflowY: "auto", flex: 1 }}>
            {edges.map((edge) => (
              <ItemRow
                key={edge.id} id={edge.id} label={`Edge ${edge.id}`} type={edge.type}
                colorMap={EDGE_COLORS} isSelected={selectedEdgeIds.has(edge.id)}
                isHovered={hoveredEdgeId === edge.id}
                onToggle={(e) => toggleEdge(edge.id, e?.shiftKey || e?.ctrlKey || e?.metaKey)}
                onHover={() => setHovered("edge", edge.id)}
                onDeselect={() => toggleEdge(edge.id, true)}
              />
            ))}
          </div>
        </div>
      )}

      {(faces.length > 0 || edges.length > 0) && (
        <div style={{ display: "flex", gap: 6, marginTop: "auto" }}>
          <button style={{ ...S.btn, flex: 1 }} onClick={selectAll}>All</button>
          <button style={{ ...S.btn, flex: 1 }} onClick={deselectAll}>None</button>
        </div>
      )}
    </div>
  );
}
