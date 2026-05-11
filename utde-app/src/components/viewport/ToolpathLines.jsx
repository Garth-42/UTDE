import { useMemo } from "react";
import * as THREE from "three";
import { useToolpathStore } from "../../store/toolpathStore";

/**
 * Sequential progressive reveal across the entire timeline.
 *
 * `animProgress` (0..1) drives a single global cursor that walks through
 * all visible toolpaths in their array order. A toolpath is fully drawn
 * once the cursor passes its last point, partially drawn while the cursor
 * is inside it, and not drawn at all if the cursor hasn't reached it.
 *
 * The tool-head indicator (white sphere with emissive op-colour) is shown
 * once and sits exactly at the cursor position.
 */

function ToolpathSegment({ toolpath, pointsToDraw, showHead, showNormals }) {
  const { points, color } = toolpath;

  const slice = useMemo(
    () => points.slice(0, Math.max(0, pointsToDraw)),
    [points, pointsToDraw],
  );

  const lineGeo = useMemo(() => {
    const positions = [];
    for (const p of slice) positions.push(p.x, p.y, p.z);
    const geo = new THREE.BufferGeometry();
    geo.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
    return geo;
  }, [slice]);

  const normalArrows = useMemo(() => {
    if (!showNormals || slice.length < 2) return [];
    const step = Math.max(1, Math.floor(slice.length / 30));
    return slice.filter((_, i) => i % step === 0).map((p, i) => ({
      key:    i,
      origin: new THREE.Vector3(p.x, p.y, p.z),
      dir:    new THREE.Vector3(p.nx ?? 0, p.ny ?? 0, p.nz ?? 1).normalize(),
    }));
  }, [slice, showNormals]);

  const head = showHead && slice.length > 0 ? slice[slice.length - 1] : null;

  if (slice.length < 2 && !head) return null;

  return (
    <group>
      {slice.length >= 2 && (
        <line geometry={lineGeo}>
          <lineBasicMaterial color={color} linewidth={2} />
        </line>
      )}

      {normalArrows.map(({ key, origin, dir }) => (
        <arrowHelper key={key} args={[dir, origin, 8, color, 2, 1.5]} />
      ))}

      {head && (
        <mesh position={[head.x, head.y, head.z]}>
          <sphereGeometry args={[2, 12, 12]} />
          <meshPhongMaterial color="#ffffff" emissive={color} emissiveIntensity={0.9} />
        </mesh>
      )}
    </group>
  );
}

export default function ToolpathLines() {
  const toolpaths    = useToolpathStore((s) => s.toolpaths);
  const activeIds    = useToolpathStore((s) => s.activeIds);
  const animProgress = useToolpathStore((s) => s.animProgress);
  const showNormals  = useToolpathStore((s) => s.showNormals);

  const visible = toolpaths.filter((tp) => activeIds.has(tp.id));
  const totalPoints = visible.reduce((n, tp) => n + (tp.points?.length || 0), 0);
  if (totalPoints === 0) return null;

  const cursor = Math.max(0, Math.min(totalPoints, Math.floor(totalPoints * animProgress)));
  let consumed = 0;

  return (
    <>
      {visible.map((tp) => {
        const len = tp.points?.length || 0;
        const remaining = Math.max(0, cursor - consumed);
        const draw      = Math.min(remaining, len);
        // The tool head sits in whichever toolpath currently contains the cursor.
        const isHead = consumed < cursor && cursor <= consumed + len;
        consumed += len;
        return (
          <ToolpathSegment
            key={tp.id}
            toolpath={tp}
            pointsToDraw={draw}
            showHead={isHead}
            showNormals={showNormals}
          />
        );
      })}
    </>
  );
}
