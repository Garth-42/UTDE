/**
 * Main-thread client for the Pyodide worker.
 *
 * Owns a single worker, correlates request/response by id, and exposes:
 *   - initPyodide(opts, onProgress) → Promise that resolves when the runtime
 *     (Pyodide + numpy/scipy + the toolpath_engine wheel) is ready.
 *   - callPython(op, args)          → Promise of the op's result (rejects on
 *     a Python/WebApi error, with the error message preserved).
 *
 * `createPyodideClient` takes an injectable worker factory so the RPC framing
 * can be unit-tested with a fake worker (no real Pyodide download).
 */

const DEFAULT_PYODIDE_INDEX = "https://cdn.jsdelivr.net/pyodide/v0.26.2/full/";

export function createPyodideClient({ createWorker, pyodideIndexURL, wheelUrl } = {}) {
  let worker = null;
  let initPromise = null;
  let nextId = 1;
  const pending = new Map();

  function ensureWorker() {
    if (worker) return worker;
    worker = createWorker();
    worker.onmessage = (e) => {
      const { id, ok, result, error, type } = e.data || {};
      if (type === "progress") {
        if (onProgressCb) onProgressCb(e.data);
        return;
      }
      const entry = pending.get(id);
      if (!entry) return;
      pending.delete(id);
      if (ok) entry.resolve(result);
      else entry.reject(new Error(error || "Pyodide error"));
    };
    worker.onerror = (e) => {
      // Fail every in-flight call so callers don't hang on a worker crash.
      const err = new Error(e.message || "Pyodide worker error");
      for (const [, entry] of pending) entry.reject(err);
      pending.clear();
    };
    return worker;
  }

  let onProgressCb = null;

  function send(op, args) {
    const w = ensureWorker();
    const id = nextId++;
    return new Promise((resolve, reject) => {
      pending.set(id, { resolve, reject });
      w.postMessage({ id, op, args });
    });
  }

  function initPyodide(opts = {}, onProgress = null) {
    if (initPromise) return initPromise;
    onProgressCb = onProgress;
    initPromise = send("__init__", {
      pyodideIndexURL: opts.pyodideIndexURL || pyodideIndexURL || DEFAULT_PYODIDE_INDEX,
      wheelUrl: opts.wheelUrl || wheelUrl || null,
      machineYamls: opts.machineYamls || null,
      packages: opts.packages || [],
    }).catch((err) => {
      initPromise = null; // allow retry
      throw err;
    });
    return initPromise;
  }

  async function callPython(op, args) {
    if (!initPromise) {
      // Auto-init with defaults if a caller forgot — keeps call sites simple.
      initPyodide();
    }
    await initPromise;
    return send(op, args);
  }

  function isReady() {
    return initPromise != null;
  }

  function terminate() {
    if (worker) worker.terminate();
    worker = null;
    initPromise = null;
    pending.clear();
  }

  return { initPyodide, callPython, isReady, terminate };
}

// Default singleton used by the app. The worker is created lazily on first use
// so importing this module never spins up Pyodide (and tests can import freely).
let _singleton = null;

// The wheel is served verbatim from public/ (not bundled/hashed) so its name
// stays a valid PEP 427 wheel filename that micropip can parse.
const WHEEL_NAME = "toolpath_engine-0.1.0-py3-none-any.whl";

function defaultClient() {
  if (_singleton) return _singleton;
  const wheelUrl = new URL(
    `${import.meta.env.BASE_URL}wheels/${WHEEL_NAME}`,
    self.location.origin
  ).href;
  _singleton = createPyodideClient({
    createWorker: () =>
      new Worker(new URL("./worker.js", import.meta.url), { type: "module" }),
    wheelUrl,
  });
  return _singleton;
}

export function initPyodide(opts, onProgress) {
  return defaultClient().initPyodide(opts, onProgress);
}

export function callPython(op, args) {
  return defaultClient().callPython(op, args);
}

export function isPyodideReady() {
  return _singleton ? _singleton.isReady() : false;
}
