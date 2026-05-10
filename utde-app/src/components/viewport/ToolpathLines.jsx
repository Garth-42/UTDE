import { useMemo } from "react";
import * as THREE from "three";
import { useToolpathStore } from "../../store/toolpathStore";

// path_type values that represent non-cutting moves
const TRAVEL_TYPES = new Set(["travel", "rapid"]);

// Colour for travel/rapid moves — muted grey so active passes stand out
const TRAVEL_COLOR = "#555577";

/**
 * Split an array of points into contiguous runs that share the same
 * is-travel classification.  Each run becomes a separate line segment
 * so active and travel moves can have different colours.
 *
 * We include one overlap point between adjacent runs (the boundary point
 * appears at the end of one run and the start of the next) so there are
 * no gaps in the rendered path.
 */
function splitByMoveType(points) {
  if (points.length === 0) return [];

  const runs = [];
  let currentTravel = TRAVEL_TYPES.has(points[0].path_type ?? "cut");
  let start = 0;

  for (let i = 1; i < points.length; i++) {
    const travel = TRAVEL_TYPES.has(points[i].path_type ?? "cut");
    if (travel !== currentTravel) {
      // End current run at i (inclusive overlap point)
      runs.push({ isTravel: currentTravel, pts: points.slice(start, i + 1) });
      start = i;           // next run starts at the overlap point
      currentTravel = travel;
    }
  }
  runs.push({ isTravel: currentTravel, pts: points.slice(start) });
  return runs;
}

function ToolpathLine({ toolpath, animProgress }) {
  const { points, color, id } = toolpath;
  const activeIds  = useToolpathStore((s) => s.activeIds);
  const showNormals = useToolpathStore((s) => s.showNormals);
  if (!activeIds.has(id)) return null;

  const maxPts = Math.max(2, Math.floor(points.length * animProgress));
  const slice  = points.slice(0, maxPts);

  const runs = useMemo(() => splitByMoveType(slice), [slice]);

  const normalArrows = useMemo(() => {
    if (!showNormals) return [];
    const step = Math.max(1, Math.floor(slice.length / 30));
    return slice.filter((_, i) => i % step === 0).map((p, i) => ({
      key: i,
      origin: new THREE.Vector3(p.x, p.y, p.z),
      dir:    new THREE.Vector3(p.nx ?? 0, p.ny ?? 0, p.nz ?? 1).normalize(),
    }));
  }, [slice, showNormals]);

  const last = slice[slice.length - 1];

  return (
    <group>
      {runs.map((run, idx) => {
        const positions = run.pts.flatMap((p) => [p.x, p.y, p.z]);
        const geo = new THREE.BufferGeometry();
        geo.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
        const lineColor = run.isTravel ? TRAVEL_COLOR : color;
        return (
          <line key={idx} geometry={geo}>
            <lineBasicMaterial
              color={lineColor}
              linewidth={2}
              opacity={run.isTravel ? 0.45 : 1.0}
              transparent={run.isTravel}
            />
          </line>
        );
      })}

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
