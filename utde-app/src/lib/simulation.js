/**
 * Pure helpers for the Simulate tab playback math.
 *
 * Kept out of the store / component so they're easy to test.
 */

/** Total point count across the visible toolpath array. */
export function totalPointCount(toolpaths) {
  let n = 0;
  for (const tp of toolpaths || []) n += tp.points?.length || 0;
  return n;
}

/**
 * Given an array of toolpaths and a progress in [0..1], return the
 * (toolpath index, point index within that toolpath) that the cursor
 * currently lands on.
 *
 * Returns { tpIdx, pointIdx, cursor, total } where:
 *   cursor — global point index (0..total)
 *   total  — total number of points across all toolpaths
 *   tpIdx  — index into toolpaths[]; -1 if before any
 *   pointIdx — index into toolpaths[tpIdx].points; -1 if no toolpaths
 */
export function cursorPosition(toolpaths, progress) {
  const total = totalPointCount(toolpaths);
  if (total === 0) return { tpIdx: -1, pointIdx: -1, cursor: 0, total: 0 };

  const cursor = Math.max(0, Math.min(total, Math.floor(total * progress)));
  let consumed = 0;
  for (let i = 0; i < toolpaths.length; i++) {
    const len = toolpaths[i].points?.length || 0;
    if (cursor <= consumed + len) {
      return {
        tpIdx:    i,
        pointIdx: Math.max(0, Math.min(len - 1, cursor - consumed - (cursor === total ? 0 : 1))),
        cursor,
        total,
      };
    }
    consumed += len;
  }
  return {
    tpIdx:    toolpaths.length - 1,
    pointIdx: (toolpaths[toolpaths.length - 1].points?.length || 1) - 1,
    cursor,
    total,
  };
}

/**
 * Compute the proportional widths of each toolpath relative to total
 * point count. Returned as a list of { id, label, kind, color, widthPct,
 * cumulativePct }, where cumulativePct gives the right-edge of each
 * segment in [0..100].
 */
export function scrubSegments(toolpaths) {
  const total = totalPointCount(toolpaths);
  if (total === 0) return [];
  let acc = 0;
  return toolpaths.map((tp) => {
    const w = ((tp.points?.length || 0) / total) * 100;
    acc += w;
    return {
      id:            tp.id,
      label:         tp.label,
      kind:          tp.kind,
      color:         tp.color,
      widthPct:      w,
      cumulativePct: acc,
    };
  });
}

/**
 * Format a fractional progress (0..1) of a `totalSeconds` duration as MM:SS.
 */
export function formatTime(progress, totalSeconds) {
  const cur = Math.max(0, Math.min(1, progress)) * (totalSeconds || 0);
  const mm = Math.floor(cur / 60);
  const ss = Math.floor(cur % 60);
  return `${String(mm).padStart(2, "0")}:${String(ss).padStart(2, "0")}`;
}

/** Sum of est_time on op_ranges (fall back: 0). Returned in seconds. */
export function totalDurationSeconds(opRanges, templates = []) {
  if (!opRanges || opRanges.length === 0) return 0;
  const byId = new Map((templates || []).map((t) => [t.id, t]));
  let mins = 0;
  for (const r of opRanges) {
    const t = byId.get(r.templateId);
    if (t && t.est_time != null) mins += t.est_time;
  }
  return mins * 60;
}
