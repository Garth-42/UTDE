import { getBaseUrl, IS_TAURI } from "../lib/backend";

async function base() {
  return getBaseUrl();
}

export async function parseStep(file, deflection = 0.5) {
  const BASE = await base();
  const form = new FormData();
  form.append("file", file);
  form.append("deflection", String(deflection));
  const res = await fetch(`${BASE}/parse-step`, { method: "POST", body: form });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error ?? "Server error");
  return data; // { faces, edges, face_count, edge_count }
}

/**
 * Parse a STEP file by its absolute path on disk.
 * Only available in Tauri builds — uses the /parse-step-path endpoint
 * so the server reads the file directly without an HTTP upload.
 */
export async function parseStepByPath(filePath, deflection = 0.5) {
  const BASE = await base();
  const res = await fetch(`${BASE}/parse-step-path`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ path: filePath, deflection }),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error ?? "Server error");
  return data;
}

export async function generateToolpath({ faces, edges, strategy, orientationRules, machine, workspaceOrigin }) {
  const BASE = await base();
  const res = await fetch(`${BASE}/generate-toolpath`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      faces,
      edges,
      strategy,
      orientation: orientationRules,
      machine,
      workspace_origin: workspaceOrigin ?? null,
    }),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error ?? "Server error");
  return data; // { points, gcode }
}

export async function runScript(code) {
  const BASE = await base();
  const res = await fetch(`${BASE}/run-script`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ code }),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error ?? "Server error");
  return data; // { stdout, stderr, gcode, success }
}

export async function lintScript(code) {
  const BASE = await base();
  const res = await fetch(`${BASE}/lint-script`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ code }),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error ?? "Server error");
  return data; // { errors: [{ line, col, message }] }
}

export async function checkHealth() {
  const BASE = await base();
  const res = await fetch(`${BASE}/health`);
  return res.json();
}

export { IS_TAURI };
