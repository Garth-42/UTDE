import { useMemo } from "react";
import { useToolpathStore } from "../../store/toolpathStore";
import { buildLineToPointMap } from "../../lib/gcodeSync";

/**
 * Highlights the toolpath point that corresponds to the G-code line selected
 * in the Post tab's GcodeView (a glowing marker + soft halo). Renders nothing
 * when no line is selected or the selected line isn't a motion line.
 */
const HIGHLIGHT_COLOR = "#ffcc33";

export default function ToolpathHighlight() {
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

  if (selectedLine == null) return null;
  const idx = lineToPoint[selectedLine];
  if (idx == null || idx < 0 || idx >= flatPoints.length) return null;
  const p = flatPoints[idx];
  if (!p) return null;

  return (
    <group position={[p.x, p.y, p.z]}>
      <mesh>
        <sphereGeometry args={[3.2, 16, 16]} />
        <meshBasicMaterial color={HIGHLIGHT_COLOR} />
      </mesh>
      <mesh>
        <sphereGeometry args={[5.4, 16, 16]} />
        <meshBasicMaterial color={HIGHLIGHT_COLOR} transparent opacity={0.18} />
      </mesh>
    </group>
  );
}
