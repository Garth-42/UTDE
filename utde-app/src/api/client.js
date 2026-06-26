/**
 * API client — thin adapters over the in-browser runtime.
 *
 * Historically these wrapped HTTP calls to the Flask server; in the static
 * (no-server) build they delegate to the runtime, which executes the Python
 * toolpath engine in Pyodide and parses STEP via opencascade.js. Signatures
 * and return shapes are unchanged so callers and the UI are unaffected.
 */

import { IS_TAURI } from "../lib/backend";
import runtime from "../lib/runtime";

export async function parseStep(file, deflection = 0.5) {
  return runtime.parseStep(file, deflection); // { faces, edges, face_count, edge_count }
}

/**
 * Parse a STEP file by absolute path — a Tauri-only path that required the
 * Python sidecar. The static browser build parses File bytes directly, so this
 * is unavailable here.
 */
export async function parseStepByPath() {
  throw new Error(
    "parseStepByPath is not available in the browser build — use parseStep(file)."
  );
}

export async function generateToolpath({
  faces,
  edges,
  strategy,
  orientationRules,
  machine,
  workspaceOrigin,
}) {
  return runtime.generateToolpath({
    faces,
    edges,
    strategy,
    orientation: orientationRules,
    machine,
    workspace_origin: workspaceOrigin ?? null,
  }); // { points, point_count, gcode }
}

export async function runScript(code) {
  return runtime.runScript(code); // { stdout, stderr, gcode, success }
}

export async function lintScript(code) {
  return runtime.lintScript(code); // { errors: [{ line, col, message }] }
}

export async function checkHealth() {
  return runtime.checkHealth();
}

export { IS_TAURI };
