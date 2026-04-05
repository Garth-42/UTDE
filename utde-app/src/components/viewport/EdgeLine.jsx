import { useMemo } from "react";
import * as THREE from "three";
import { useStepStore } from "../../store/stepStore";

const EDGE_COLORS = {
  line:     "#88bbff",
  circle:   "#ffcc44",
  ellipse:  "#ff88cc",
  bspline:  "#aaffaa",
  other:    "#556677",
};
const COLOR_SELECTED      = "#ff6600";
const COLOR_HOVERED       = "#ffffff";
const COLOR_PICK_HOVER    = "#00ffcc";

export default function EdgeLine({ edge }) {
  const selectedEdgeIds    = useStepStore((s) => s.selectedEdgeIds);
  const hoveredEdgeId      = useStepStore((s) => s.hoveredEdgeId);
  const toggleEdge         = useStepStore((s) => s.toggleEdge);
  const setHovered         = useStepStore((s) => s.setHovered);
  const pickingOrigin      = useStepStore((s) => s.pickingOrigin);
  const pickingZOrigin     = useStepStore((s) => s.pickingZOrigin);
  const setWorkspaceOrigin = useStepStore((s) => s.setWorkspaceOrigin);
  const setZOrigin         = useStepStore((s) => s.setZOrigin);

  const isSelected = selectedEdgeIds.has(edge.id);
  const isHovered  = hoveredEdgeId === edge.id;

  const geometry = useMemo(() => {
    const geo = new THREE.BufferGeometry();
    geo.setAttribute("position", new THREE.Float32BufferAttribute(edge.vertices, 3));
    return geo;
  }, [edge]);

  const inPickMode = pickingOrigin || pickingZOrigin;
  const color = inPickMode && isHovered
    ? COLOR_PICK_HOVER
    : isSelected ? COLOR_SELECTED : isHovered ? COLOR_HOVERED : EDGE_COLORS[edge.type] ?? EDGE_COLORS.other;
  const linewidth = isSelected ? 3 : isHovered ? 2.5 : 1.5;

  const handleClick = (e) => {
    e.stopPropagation();
    if (pickingZOrigin) {
      setZOrigin(e.point.z);
    } else if (pickingOrigin) {
      setWorkspaceOrigin({ x: e.point.x, y: e.point.y, z: e.point.z });
    } else {
      toggleEdge(edge.id, e.shiftKey || e.ctrlKey || e.metaKey);
    }
  };

  return (
    <line
      geometry={geometry}
      userData={{ edgeId: edge.id, kind: "edge" }}
      onClick={handleClick}
      onPointerOver={(e) => { e.stopPropagation(); setHovered("edge", edge.id); }}
      onPointerOut={() => setHovered("edge", null)}
    >
      <lineBasicMaterial color={color} linewidth={linewidth} />
    </line>
  );
}
