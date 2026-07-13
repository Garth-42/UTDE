/**
 * Desktop (Tauri) shims.
 *
 * The app is fully client-side — the toolpath engine runs in Pyodide and STEP
 * is parsed with opencascade.js — so nothing here makes HTTP calls to the Flask
 * server anymore. What remains is Tauri-only: native file dialogs and a probe
 * for the bundled Python sidecar's readiness (used by the splash screen). In a
 * plain browser build every function below is a no-op / fallback.
 */

export const IS_TAURI = typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;

/**
 * Poll until the Python sidecar reports ready, then resolve.
 * Times out after `maxWaitMs` (default 30 s).
 */
export async function waitForServer(intervalMs = 300, maxWaitMs = 30_000) {
  if (!IS_TAURI) return; // browser dev mode — server is always "ready"

  const { invoke } = await import("@tauri-apps/api/core");
  const deadline = Date.now() + maxWaitMs;

  while (Date.now() < deadline) {
    const ready = await invoke("get_server_status");
    if (ready) return;
    await new Promise((r) => setTimeout(r, intervalMs));
  }

  throw new Error("UTDE engine failed to start within 30 seconds");
}

/**
 * Open a native OS file-open dialog (Tauri only).
 * Falls back to null in browser mode.
 */
export async function openStepFileDialog() {
  if (!IS_TAURI) return null;
  const { open } = await import("@tauri-apps/plugin-dialog");
  return open({
    title: "Open STEP File",
    filters: [
      { name: "STEP / STP", extensions: ["step", "stp", "STEP", "STP"] },
      { name: "All Files", extensions: ["*"] },
    ],
    multiple: false,
  });
}

/**
 * Open a native OS file-save dialog and write text content (Tauri only).
 * Returns the path written to, or null if cancelled / browser mode.
 */
export async function saveGcodeDialog(content, defaultName = "output.nc") {
  if (!IS_TAURI) return null;
  const { save } = await import("@tauri-apps/plugin-dialog");
  const { writeTextFile } = await import("@tauri-apps/plugin-fs");

  const path = await save({
    title: "Save G-code",
    defaultPath: defaultName,
    filters: [{ name: "G-code / NC", extensions: ["nc", "gcode", "txt"] }],
  });

  if (!path) return null;
  await writeTextFile(path, content);
  return path;
}
