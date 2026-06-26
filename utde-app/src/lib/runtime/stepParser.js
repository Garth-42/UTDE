/**
 * STEP parser registry.
 *
 * STEP parsing runs in the browser via opencascade.js (wired up in Phase 2).
 * The runtime calls whatever parser is registered here; until one is set, it
 * raises a clear error instead of silently failing. Keeping this as a small
 * registry lets the heavy WASM parser load lazily and be swapped/mocked.
 */

let _parser = null;

/**
 * Register the STEP parser implementation.
 * @param {(file: ArrayBuffer|Uint8Array, deflection: number) => Promise<object>} fn
 */
export function setStepParser(fn) {
  _parser = fn;
}

export function hasStepParser() {
  return _parser != null;
}

/** Parse a STEP file's bytes into the { faces, edges, ... } shape. */
export async function parseStepBytes(bytes, deflection = 0.5) {
  if (!_parser) {
    throw new Error(
      "STEP parsing is not available yet — the in-browser CAD kernel " +
        "(opencascade.js) has not been loaded."
    );
  }
  return _parser(bytes, deflection);
}
