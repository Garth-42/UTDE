/**
 * Shared STEP-import helpers.
 *
 * Both the timeline scene-row editor and (formerly) the TopBar Import button
 * route through here so the parseStep / parseStepByPath plumbing has one
 * canonical implementation.
 */

import { parseStep, parseStepByPath } from "../api/client";
import { openStepFileDialog, IS_TAURI } from "./backend";
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

/** Open the native dialog (Tauri only) and parse the chosen file. */
export async function importStepViaTauri() {
  if (!IS_TAURI) return null;
  const filePath = await openStepFileDialog();
  if (!filePath) return null;
  const displayName = String(filePath).split(/[/\\]/).pop();
  return _runImport(parseStepByPath(filePath), displayName);
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
