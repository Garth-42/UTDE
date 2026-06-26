/**
 * Map G-code lines ↔ toolpath points for the Post-tab preview sync.
 *
 * The post-processor emits exactly one motion line (a line carrying an X/Y/Z
 * coordinate) per toolpath point, in order; all other lines are comments or
 * setup/footer codes with no coordinates. So within each op range
 * (gcode_start_line…gcode_end_line ↔ point_start…point_end) the k-th motion
 * line corresponds to the k-th point.
 */

import { parseGcodeLine } from "./gcodeParse";
import { cursorPosition } from "./simulation";

/** True when a G-code line carries an X/Y/Z coordinate (i.e. a motion line). */
export function isMotionLine(line) {
  if (!line) return false;
  const spans = parseGcodeLine(line);
  return spans.some(
    (s) => s.type === "coord" && "XYZ".includes((s.text[0] || "").toUpperCase())
  );
}

/**
 * Build a per-line → global-point-index map.
 * @returns {number[]} indexed by 0-based gcode line; -1 for non-motion lines.
 */
export function buildLineToPointMap(gcode, opRanges) {
  const lines = (gcode || "").split("\n");
  const map = new Array(lines.length).fill(-1);
  for (const r of opRanges || []) {
    const start = r.gcode_start_line;
    const end = r.gcode_end_line;
    if (start == null || end == null || r.point_start == null) continue;
    let p = r.point_start;
    for (let i = start; i < end && i < lines.length; i++) {
      if (isMotionLine(lines[i])) {
        map[i] = p;
        p += 1;
      }
    }
  }
  return map;
}

/**
 * Global point index for the simulation playback cursor at `progress` (0..1).
 * Flattens the per-op cursor ({tpIdx, pointIdx}) into the global point order.
 * @returns {number} global point index, or -1 when there are no points.
 */
export function cursorGlobalIndex(toolpaths, progress) {
  const { tpIdx, pointIdx } = cursorPosition(toolpaths || [], progress);
  if (tpIdx < 0) return -1;
  let base = 0;
  for (let i = 0; i < tpIdx; i++) base += toolpaths[i]?.points?.length || 0;
  return base + pointIdx;
}

/**
 * Reverse map: global-point-index → first gcode line that renders it.
 * Useful for syncing the listing to a point/cursor.
 * @returns {number[]} indexed by global point index; -1 if unmapped.
 */
export function buildPointToLineMap(gcode, opRanges, totalPoints = 0) {
  const lineToPoint = buildLineToPointMap(gcode, opRanges);
  const map = new Array(totalPoints).fill(-1);
  for (let line = 0; line < lineToPoint.length; line++) {
    const p = lineToPoint[line];
    if (p >= 0 && p < map.length && map[p] === -1) map[p] = line;
  }
  return map;
}
