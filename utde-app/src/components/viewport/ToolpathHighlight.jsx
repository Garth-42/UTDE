import { useMemo } from "react";
import { useToolpathStore } from "../../store/toolpathStore";
import { useUiStore } from "../../store/uiStore";
import { buildLineToPointMap } from "../../lib/gcodeSync";

/**
 * Highlights the toolpath point for the G-code line selected in the Post tab's
 * GcodeView (a glowing marker + halo). Scoped to the Post tab so it disappears
 * when you switch away, and drawn on top of the geometry (depthTest off) so it
 * is never hidden inside a solid part.
 */
const HIGHLIGHT_COLOR = "#ffcc33";

export default function ToolpathHighlight() {
  const tab = useUiStore((s) => s.tab);
  const toolpaths = useToolpathStore((s) => s.toolpaths);
  const gcode = useToolpathStore((s) => s.gcode);
  const opRanges = useToolpathStore((s) => s.opRanges);
  const selectedLine = useToolpathStore((s) => s.selectedLine);

  // Global point order = the op toolpaths concatenated (matches op_ranges).
  const flatPoints = useMemo(
    () => toolpaths.flatMap((tp) => tp.points || []),
    [toolpaths]
  );
  const lineToPoint = useMemo(
    () => buildLineToPointMap(gcode, opRanges),
    [gcode, opRanges]
  );

  // The "locate" marker is a Post-tab affordance only.
  if (tab !== "post") return null;
  if (selectedLine == null) return null;
  const idx = lineToPoint[selectedLine];
  if (idx == null || idx < 0 || idx >= flatPoints.length) return null;
  const p = flatPoints[idx];
  if (!p) return null;

  return (
    <group position={[p.x, p.y, p.z]}>
      <mesh renderOrder={999}>
        <sphereGeometry args={[3.2, 16, 16]} />
        <meshBasicMaterial
          color={HIGHLIGHT_COLOR}
          depthTest={false}
          depthWrite={false}
          transparent
        />
      </mesh>
      <mesh renderOrder={998}>
        <sphereGeometry args={[5.4, 16, 16]} />
        <meshBasicMaterial
          color={HIGHLIGHT_COLOR}
          depthTest={false}
          depthWrite={false}
          transparent
          opacity={0.22}
        />
      </mesh>
    </group>
  );
}
