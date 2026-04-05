import { useRef, useMemo } from "react";
import * as THREE from "three";
import { useStepStore } from "../../store/stepStore";

const FACE_COLORS = {
  plane:    "#4488cc",
  cylinder: "#44ccaa",
  sphere:   "#44cc88",
  cone:     "#cc8844",
  torus:    "#cc44aa",
  other:    "#445566",
};
const COLOR_SELECTED = "#ff8800";
const COLOR_HOVERED  = "#ffcc44";

const COLOR_Z_PICK_HOVER = "#ffee44";

export default function FaceMesh({ face }) {
  const meshRef         = useRef();
  const selectedFaceIds = useStepStore((s) => s.selectedFaceIds);
  const hoveredFaceId   = useStepStore((s) => s.hoveredFaceId);
  const toggleFace      = useStepStore((s) => s.toggleFace);
  const setHovered      = useStepStore((s) => s.setHovered);
  const pickingZOrigin  = useStepStore((s) => s.pickingZOrigin);
  const setZOrigin      = useStepStore((s) => s.setZOrigin);

  const isSelected = selectedFaceIds.has(face.id);
  const isHovered  = hoveredFaceId === face.id;

  const geometry = useMemo(() => {
    const geo = new THREE.BufferGeometry();
    geo.setAttribute("position", new THREE.Float32BufferAttribute(face.vertices, 3));
    geo.setIndex(face.indices);
    geo.computeVertexNormals();
    return geo;
  }, [face]);

  const color   = pickingZOrigin && isHovered
    ? COLOR_Z_PICK_HOVER
    : isSelected ? COLOR_SELECTED : isHovered ? COLOR_HOVERED : FACE_COLORS[face.type] ?? FACE_COLORS.other;
  const opacity = isSelected ? 0.92 : isHovered ? 0.88 : 0.72;

  const handleClick = (e) => {
    e.stopPropagation();
    if (pickingZOrigin) {
      setZOrigin(e.point.z);
    } else {
      toggleFace(face.id, e.shiftKey || e.ctrlKey || e.metaKey);
    }
  };

  return (
    <mesh
      ref={meshRef}
      geometry={geometry}
      userData={{ faceId: face.id, kind: "face" }}
      onClick={handleClick}
      onPointerOver={(e) => { e.stopPropagation(); setHovered("face", face.id); }}
      onPointerOut={() => setHovered("face", null)}
    >
      <meshPhongMaterial
        color={color}
        transparent
        opacity={opacity}
        depthWrite={false}
        side={THREE.DoubleSide}
        shininess={60}
        emissive={isSelected ? "#331100" : "#000000"}
      />
    </mesh>
  );
}
