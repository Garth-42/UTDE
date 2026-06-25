/**
 * Lazy loader for the opencascade.js (OCCT WASM) runtime.
 *
 * opencascade.js is bundled by Vite (its entry does `import wasm from
 * "*.wasm"`, a bundler-only feature that cannot be loaded from a raw CDN). We
 * dynamic-import it so Vite code-splits the ~50 MB kernel into its own chunk
 * that only downloads on the first STEP import, and cache it thereafter.
 *
 * Requires vite.config to mark wasm files via assetsInclude so the .wasm
 * import resolves to an asset URL, plus optimizeDeps.exclude for opencascade.js.
 *
 * Not unit-tested (requires the real WASM); the parser logic it feeds is tested
 * with a fake `oc` in occtParseStep.test.js.
 */

let _ocPromise = null;

/**
 * Initialize (once) and return the OCCT handle.
 * @param {{onProgress?: (stage: string) => void}} [opts]
 */
export function initOcct(opts = {}) {
  if (_ocPromise) return _ocPromise;
  _ocPromise = (async () => {
    if (opts.onProgress) opts.onProgress("loading");
    const mod = await import("opencascade.js");
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
