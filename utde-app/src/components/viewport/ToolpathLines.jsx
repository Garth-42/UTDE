import { useMemo, useRef } from "react";
import * as THREE from "three";
import { useFrame } from "@react-three/fiber";
import { useToolpathStore } from "../../store/toolpathStore";

function ToolpathLine({ toolpath, animProgress }) {
  const { points, color, id } = toolpath;
  const activeIds = useToolpathStore((s) => s.activeIds);
  const showNormals = useToolpathStore((s) => s.showNormals);
  if (!activeIds.has(id)) return null;

  const maxPts = Math.max(2, Math.floor(points.length * animProgress));
  const slice  = points.slice(0, maxPts);

  const lineGeo = useMemo(() => {
    const positions = slice.flatMap((p) => [p.x, p.y, p.z]);
    const geo = new THREE.BufferGeometry();
    geo.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
    return geo;
  }, [slice]);

  const normalArrows = useMemo(() => {
    if (!showNormals) return [];
    const step = Math.max(1, Math.floor(slice.length / 30));
    return slice.filter((_, i) => i % step === 0).map((p, i) => ({
      key: i,
      origin: new THREE.Vector3(p.x, p.y, p.z),
      dir: new THREE.Vector3(p.nx ?? 0, p.ny ?? 0, p.nz ?? 1).normalize(),
    }));
  }, [slice, showNormals]);

  const last = slice[slice.length - 1];

  return (
    <group>
      <line geometry={lineGeo}>
        <lineBasicMaterial color={color} linewidth={2} />
      </line>

      {normalArrows.map(({ key, origin, dir }) => (
        <arrowHelper key={key} args={[dir, origin, 8, color, 2, 1.5]} />
      ))}

      {last && (
        <mesh position={[last.x, last.y, last.z]}>
          <sphereGeometry args={[2, 12, 12]} />
          <meshPhongMaterial color="#ffffff" emissive={color} emissiveIntensity={0.9} />
        </mesh>
      )}
    </group>
  );
}

export default function ToolpathLines() {
  const toolpaths    = useToolpathStore((s) => s.toolpaths);
  const animProgress = useToolpathStore((s) => s.animProgress);

  return (
    <>
      {toolpaths.map((tp) => (
        <ToolpathLine key={tp.id} toolpath={tp} animProgress={animProgress} />
      ))}
    </>
  );
}
