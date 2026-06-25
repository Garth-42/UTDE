/**
 * Lazy loader for the opencascade.js (OCCT WASM) runtime.
 *
 * The kernel is ~30 MB, so it is loaded only on first STEP import and cached.
 * Loaded from a CDN ESM build by default (consistent with how the Pyodide
 * worker loads Pyodide); the URL is overridable for self-hosting / offline
 * (Phase 4 PWA precaching).
 *
 * Not unit-tested (requires the real WASM); the parser logic it feeds is tested
 * with a fake `oc` in parseStep.test.js.
 */

const DEFAULT_OCCT_URL = "https://cdn.jsdelivr.net/npm/opencascade.js@2.0.0-beta/dist/opencascade.full.js";

let _ocPromise = null;

/**
 * Initialize (once) and return the OCCT handle.
 * @param {{url?: string, onProgress?: (stage: string) => void}} [opts]
 */
export function initOcct(opts = {}) {
  if (_ocPromise) return _ocPromise;
  const url = opts.url || DEFAULT_OCCT_URL;
  _ocPromise = (async () => {
    if (opts.onProgress) opts.onProgress("loading");
    // opencascade.js default export is the module factory.
    const mod = await import(/* @vite-ignore */ url);
    const initOpenCascade = mod.default || mod.initOpenCascade || mod;
    if (opts.onProgress) opts.onProgress("instantiating");
    const oc = await initOpenCascade();
    if (opts.onProgress) opts.onProgress("ready");
    return oc;
  })().catch((err) => {
    _ocPromise = null; // allow retry
    throw err;
  });
  return _ocPromise;
}

export function isOcctLoaded() {
  return _ocPromise != null;
}
