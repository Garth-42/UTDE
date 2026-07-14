/**
 * Shared STEP-import helpers.
 *
 * Everything is parsed client-side (Pyodide + opencascade.js). The desktop
 * (Tauri) path just reads the natively-picked file's bytes off disk and feeds
 * them through the same `parseStep`, so there is one parsing path — no server.
 */

import { parseStep } from "../api/client";
import { openStepFileDialog, readStepFileBytes, IS_TAURI } from "./backend";
import { useStepStore } from "../store/stepStore";

async function _runImport(promise, displayName) {
  const store = useStepStore.getState();
  store.setLoading(true);
  try {
    const data = await promise;
    store.setGeometry(data.faces || [], data.edges || [], displayName);
    return data;
  } catch (err) {
    store.setError(err?.message || String(err));
    throw err;
  } finally {
    store.setLoading(false);
  }
}

/** Open the native dialog (Tauri only), read the file's bytes, and parse it
 *  client-side — the same path a browser file input takes. */
export async function importStepViaTauri() {
  if (!IS_TAURI) return null;
  const filePath = await openStepFileDialog();
  if (!filePath) return null;
  const displayName = String(filePath).split(/[/\\]/).pop();
  const bytes = await readStepFileBytes(filePath);
  return _runImport(parseStep(bytes), displayName);
}

/** Parse a File object picked from a browser file input. */
export async function importStepFromFile(file) {
  if (!file) return null;
  return _runImport(parseStep(file), file.name);
}

/** Wipe the imported geometry + selection. */
export function clearImportedStep() {
  const store = useStepStore.getState();
  store.setGeometry([], [], null);
  store.deselectAll?.();
}
