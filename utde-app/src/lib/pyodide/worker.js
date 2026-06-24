/**
 * Pyodide Web Worker — runs the UTDE Python toolpath engine in the browser.
 *
 * Loads Pyodide + numpy/scipy/pyyaml, installs the toolpath_engine wheel via
 * micropip, then services RPC messages of the form:
 *
 *   { id, op, args }   →   { id, ok: true, result } | { id, ok: false, error }
 *
 * `op` names map 1:1 to functions in `toolpath_engine.webapi` (the same pure
 * core the Flask server uses), so the browser runs identical logic with no
 * server. A first `{ id, op: "__init__", args: { wheelUrl, machineYamls } }`
 * message boots the runtime and reports progress via { type: "progress" }.
 *
 * This file runs in a Worker (no DOM, no jsdom) and is not unit-tested; the
 * RPC framing it speaks is covered by the client's tests.
 */

/* eslint-disable no-restricted-globals */

let pyodideReadyPromise = null;
let dispatch = null;

async function bootPyodide({ pyodideIndexURL, wheelUrl, packages }) {
  // Pyodide is loaded from a CDN/bundled URL provided by the caller so this
  // worker has no hard-coded version.
  importScripts(`${pyodideIndexURL}pyodide.js`);
  // eslint-disable-next-line no-undef
  const pyodide = await loadPyodide({ indexURL: pyodideIndexURL });

  postMessage({ type: "progress", stage: "packages" });
  await pyodide.loadPackage(["micropip", "numpy", "scipy", ...(packages || [])]);

  postMessage({ type: "progress", stage: "wheel" });
  const micropip = pyodide.pyimport("micropip");
  await micropip.install("pyyaml");
  if (wheelUrl) await micropip.install(wheelUrl);

  // A tiny Python dispatcher that turns (op, args-json) into a webapi call and
  // returns a JSON string. Keeping the JS↔Py boundary as JSON avoids proxy
  // lifetime headaches.
  pyodide.runPython(`
import json
from toolpath_engine import webapi

def _utde_dispatch(op, args_json):
    args = json.loads(args_json) if args_json else {}
    if op == "generate_toolpath":
        out = webapi.generate_toolpath(args["payload"])
    elif op == "compile_timeline":
        out = webapi.compile_timeline(
            args["payload"],
            last_model_path=args.get("last_model_path"),
        )
    elif op == "run_script":
        out = webapi.run_script(args.get("code", ""))
    elif op == "lint_script":
        out = webapi.lint_script(args.get("code", ""))
    elif op == "list_templates":
        out = webapi.list_templates()
    elif op == "summarize_machine":
        out = webapi.summarize_machine(args["yaml_text"], args["id"], args.get("path"))
    else:
        raise ValueError("unknown op: " + str(op))
    return json.dumps(out)
`);
  const dispatchFn = pyodide.globals.get("_utde_dispatch");

  return (op, args) => {
    let argsJson;
    try {
      argsJson = JSON.stringify(args ?? {});
    } catch (e) {
      throw new Error(`could not serialize args for ${op}: ${e}`);
    }
    const resultJson = dispatchFn(op, argsJson);
    return JSON.parse(resultJson);
  };
}

self.onmessage = async (e) => {
  const { id, op, args } = e.data || {};

  if (op === "__init__") {
    if (!pyodideReadyPromise) {
      pyodideReadyPromise = bootPyodide(args || {})
        .then((fn) => { dispatch = fn; })
        .catch((err) => { pyodideReadyPromise = null; throw err; });
    }
    try {
      await pyodideReadyPromise;
      postMessage({ id, ok: true, result: { ready: true } });
    } catch (err) {
      postMessage({ id, ok: false, error: String(err && err.message ? err.message : err) });
    }
    return;
  }

  try {
    if (!pyodideReadyPromise) throw new Error("Pyodide not initialized");
    await pyodideReadyPromise;
    // WebApiError and other Python exceptions surface as thrown JS errors here.
    const result = dispatch(op, args);
    postMessage({ id, ok: true, result });
  } catch (err) {
    postMessage({ id, ok: false, error: String(err && err.message ? err.message : err) });
  }
};
