import { useEffect, useMemo } from "react";
import { useToolpathStore } from "../store/toolpathStore";
import { totalPointCount } from "./simulation";
import { buildPointToLineMap, cursorGlobalIndex } from "./gcodeSync";

/**
 * Reverse-sync hook shared by the Simulate and Post tabs.
 *
 * Maps the playback cursor (animProgress) to its G-code line and — while the
 * cursor is *engaged* (playing, or scrubbed off the end) — drives the shared
 * `selectedLine` so the listing highlights/scrolls and the 3D marker follows.
 * At the resting full-reveal state (animProgress === 1, not animating) it does
 * NOT force a selection, leaving manual G-code clicks in control.
 *
 * @returns {number} the current cursor G-code line (or -1), for HUD display.
 */
export function useCursorLineSync() {
  const toolpaths = useToolpathStore((s) => s.toolpaths);
  const gcode = useToolpathStore((s) => s.gcode);
  const opRanges = useToolpathStore((s) => s.opRanges);
  const animProgress = useToolpathStore((s) => s.animProgress);
  const isAnimating = useToolpathStore((s) => s.isAnimating);
  const setSelectedLine = useToolpathStore((s) => s.setSelectedLine);

  const total = totalPointCount(toolpaths);
  const pointToLine = useMemo(
    () => buildPointToLineMap(gcode, opRanges, total),
    [gcode, opRanges, total]
  );
  const idx = cursorGlobalIndex(toolpaths, animProgress);
  const currentLine = idx >= 0 && idx < pointToLine.length ? pointToLine[idx] : -1;

  // "Engaged" = actively scrubbing/playing rather than the resting full preview.
  const engaged = isAnimating || animProgress < 1 - 1e-6;

  useEffect(() => {
    if (engaged && currentLine >= 0) setSelectedLine(currentLine);
  }, [engaged, currentLine, setSelectedLine]);

  return currentLine;
}
