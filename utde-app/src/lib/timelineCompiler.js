/**
 * timelineCompiler — calls /compile-timeline and routes the result into stores.
 *
 * Posts the current opsStore.entries plus the picked STEP geometry, awaits the
 * server response, splits the returned points-array per op (using op_ranges)
 * into individual toolpathStore entries so Simulate can colour-code by op,
 * stashes the G-code and warnings for the Post tab.
 */

import { getBaseUrl } from "./backend";
import { useOpsStore } from "../store/opsStore";
import { useStepStore } from "../store/stepStore";
import { useToolpathStore } from "../store/toolpathStore";
import { useMachineStore } from "../store/machineStore";
import { useUiStore } from "../store/uiStore";

const KIND_COLOR = {
  add: "oklch(62% 0.13 155)",
  sub: "oklch(66% 0.15 50)",
  hyb: "oklch(58% 0.16 245)",
};

function colorForKind(kind) {
  return KIND_COLOR[kind] || "oklch(58% 0.04 245)";
}

export async function compileTimeline({ entriesOverride } = {}) {
  const ops  = useOpsStore.getState();
  const step = useStepStore.getState();

  const machineId = useMachineStore.getState().currentId || "gantry_5axis_ac";

  const body = {
    entries: entriesOverride || ops.entries,
    faces:   step.faces,
    edges:   step.edges,
    machine: machineId,
    workspace_origin: step.workspaceOrigin,
  };

  const tStore = useToolpathStore.getState();
  if (tStore.setCompiling) tStore.setCompiling(true);

  let result;
  try {
    const base = await getBaseUrl();
    const res  = await fetch(`${base}/compile-timeline`, {
      method:  "POST",
      headers: { "Content-Type": "application/json" },
      body:    JSON.stringify(body),
    });
    result = await res.json();
    if (!res.ok) {
      throw new Error(result.error || `compile-timeline returned ${res.status}`);
    }
  } catch (err) {
    if (tStore.setCompiling)    tStore.setCompiling(false);
    if (tStore.setCompileError) tStore.setCompileError(err.message || String(err));
    throw err;
  }

  const { points = [], op_ranges = [], gcode = "", warnings = [] } = result;

  // Split the concatenated points back into per-op toolpath entries
  const perOp = op_ranges.map((r) => {
    const slice = points.slice(r.point_start, r.point_end);
    return {
      id:    r.uid || `op_${r.idx}`,
      label: r.name,
      kind:  r.kind,
      color: colorForKind(r.kind),
      visible: true,
      points: slice,
      gcodeStartLine: r.gcode_start_line,
      gcodeEndLine:   r.gcode_end_line,
    };
  });

  if (tStore.setCompileResult) {
    tStore.setCompileResult({
      toolpaths: perOp,
      gcode,
      opRanges:  op_ranges,
      warnings,
    });
  } else {
    // Fallback for the legacy toolpathStore shape: clear and add one entry per op
    tStore.clearToolpaths();
    for (const op of perOp) {
      useToolpathStore.getState().addToolpath(op.label, op.points, op.color);
    }
  }

  if (tStore.setCompiling) tStore.setCompiling(false);
  return result;
}

/**
 * Preview the toolpath for the active op WITHOUT switching tabs.
 *
 * Compiles a minimal sub-timeline: every visible orient row above the
 * active op (so the running orient chain matches what /compile-timeline
 * would apply in a full Run setup), plus the op itself. Stores the
 * resulting toolpaths in toolpathStore, flips uiStore.showToolpaths on,
 * and snaps animProgress to 1 so the full path renders immediately.
 *
 * Per the CLAUDE.md design rule, this is the affordance the user needs
 * to validate a strategy / op in isolation while editing parameters.
 */
export async function previewActiveOp() {
  const ops = useOpsStore.getState();
  const idx = ops.activeIdx;
  if (idx == null) throw new Error("No active op to preview");
  const entry = ops.entries[idx];
  if (!entry || entry.kind !== "op") {
    throw new Error("Active entry is not an op");
  }

  const subset = [];
  for (let i = 0; i < idx; i++) {
    const e = ops.entries[i];
    if (e.kind === "orient" && e.visible !== false) subset.push(e);
  }
  subset.push(entry);

  const result = await compileTimeline({ entriesOverride: subset });

  // Stay on Setup; just enable toolpath rendering and snap to fully revealed.
  useUiStore.getState().setShowToolpaths(true);
  const t = useToolpathStore.getState();
  if (t.setAnimProgress) t.setAnimProgress(1);

  return result;
}
