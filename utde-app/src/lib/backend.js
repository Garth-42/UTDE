/**
 * Desktop (Tauri) shims.
 *
 * The app is fully client-side — the toolpath engine runs in Pyodide and STEP
 * is parsed with opencascade.js, in the browser and on the desktop alike — so
 * there is no Python sidecar and nothing here makes HTTP calls to a server.
 * What remains is Tauri-only: native file dialogs and reading a chosen file's
 * bytes off disk. In a plain browser build every function below is a no-op /
 * fallback.
 */

export const IS_TAURI = typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;

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

/**
 * Read a file's raw bytes from disk (Tauri only), for parsing a natively-picked
 * STEP file client-side (via Pyodide/opencascade.js) instead of a server.
 * Returns a Uint8Array. Throws in a plain browser build (no filesystem access).
 */
export async function readStepFileBytes(path) {
  if (!IS_TAURI) {
    throw new Error("readStepFileBytes is only available in the desktop build.");
  }
  const { readFile } = await import("@tauri-apps/plugin-fs");
  return readFile(path); // Uint8Array
}
