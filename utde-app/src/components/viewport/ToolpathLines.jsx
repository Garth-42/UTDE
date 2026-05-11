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
 *
 * Within each segment, points are further split by `path_type` so
 * travel/rapid moves render in muted grey while active cuts/deposits
 * keep the op's accent colour.
 */

// path_type values that represent non-cutting moves
const TRAVEL_TYPES = new Set(["travel", "rapid"]);

// Colour for travel/rapid moves — muted grey so active passes stand out
const TRAVEL_COLOR = "#555577";

/**
 * Split an array of points into contiguous runs that share the same
 * is-travel classification. Each run becomes a separate line segment
 * so active and travel moves can have different colours. We include one
 * overlap point between adjacent runs (the boundary point appears at the
 * end of one run and the start of the next) so the path stays gap-free.
 */
function splitByMoveType(points) {
  if (points.length === 0) return [];

  const runs = [];
  let currentTravel = TRAVEL_TYPES.has(points[0].path_type ?? "cut");
  let start = 0;

  for (let i = 1; i < points.length; i++) {
    const travel = TRAVEL_TYPES.has(points[i].path_type ?? "cut");
    if (travel !== currentTravel) {
      runs.push({ isTravel: currentTravel, pts: points.slice(start, i + 1) });
      start = i;
      currentTravel = travel;
    }
  }
  runs.push({ isTravel: currentTravel, pts: points.slice(start) });
  return runs;
}

function ToolpathSegment({ toolpath, pointsToDraw, showHead, showNormals }) {
  const { points, color } = toolpath;

  const slice = useMemo(
    () => points.slice(0, Math.max(0, pointsToDraw)),
    [points, pointsToDraw],
  );

  const runs = useMemo(() => splitByMoveType(slice), [slice]);

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
      {runs.map((run, idx) => {
        if (run.pts.length < 2) return null;
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
