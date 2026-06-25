/**
 * UTDE runtime facade — the single seam the app talks to instead of a server.
 *
 * Every operation runs **in the browser**: the Python toolpath engine via
 * Pyodide (toolpath_engine.webapi), and STEP parsing via opencascade.js. The
 * data shapes are identical to what the old Flask endpoints returned, so the
 * stores and viewport are untouched.
 *
 * Tests mock `./pyodideTransport` (callPython) and the step parser registry.
 */

import { callPython } from "../pyodide/client";
import { parseStepBytes } from "./stepParser";
import { machineYamls } from "./machineAssets";

// In-memory machines imported this session (the static build has no disk to
// persist them to). Seeded from the bundled assets on first listMachines().
let _importedMachines = [];

async function fileToBytes(file) {
  if (file instanceof ArrayBuffer) return new Uint8Array(file);
  if (ArrayBuffer.isView(file)) {
    return new Uint8Array(file.buffer, file.byteOffset, file.byteLength);
  }
  if (file && typeof file.arrayBuffer === "function") {
    return new Uint8Array(await file.arrayBuffer());
  }
  // Fallback for environments where Blob/File lack arrayBuffer() (e.g. jsdom).
  if (typeof FileReader !== "undefined" && file) {
    return await new Promise((resolve, reject) => {
      const fr = new FileReader();
      fr.onload = () => resolve(new Uint8Array(fr.result));
      fr.onerror = () => reject(fr.error || new Error("file read failed"));
      fr.readAsArrayBuffer(file);
    });
  }
  throw new Error("parseStep expects a File/Blob/ArrayBuffer");
}

export const runtime = {
  /** Parse a STEP File/Blob/ArrayBuffer → { faces, edges, face_count, edge_count }. */
  async parseStep(file, deflection = 0.5) {
    const bytes = await fileToBytes(file);
    return parseStepBytes(bytes, deflection);
  },

  /** Generate a single toolpath. `payload` is the server JSON shape. */
  async generateToolpath(payload) {
    return callPython("generate_toolpath", { payload });
  },

  /** Compile a timeline of ops/orient rows. */
  async compileTimeline(payload, { lastModelPath = null } = {}) {
    return callPython("compile_timeline", { payload, last_model_path: lastModelPath });
  },

  /** Run an arbitrary UTDE Python script in the Pyodide sandbox. */
  async runScript(code) {
    return callPython("run_script", { code });
  },

  /** Syntax-check Python code → { errors: [...] }. */
  async lintScript(code) {
    return callPython("lint_script", { code });
  },

  /** List process templates (array), excluding ones unavailable in-browser.
   *  `requires_local` templates shell out to external binaries (slicers) and
   *  can't run in the static build, so they're hidden here. */
  async listTemplates() {
    const out = await callPython("list_templates", {});
    return (out.templates || []).filter((t) => !t.requires_local);
  },

  /** Enumerate bundled + session-imported machines (array of summaries). */
  async listMachines() {
    const summaries = await Promise.all(
      machineYamls.map(({ id, text }) =>
        callPython("summarize_machine", {
          yaml_text: text,
          id,
          path: `machines/${id}.yaml`,
        })
      )
    );
    return [...summaries, ..._importedMachines];
  },

  /** Validate + register a machine from YAML text; returns its summary. */
  async importMachine(yamlText, filename = "machine.yaml") {
    const id = filename.replace(/\.(ya?ml)$/i, "") || "machine";
    const summary = await callPython("summarize_machine", {
      yaml_text: yamlText,
      id,
      path: `imported/${id}.yaml`,
    });
    if (summary && summary.error) {
      throw new Error(`Invalid machine YAML: ${summary.error}`);
    }
    _importedMachines = [..._importedMachines.filter((m) => m.id !== id), summary];
    return summary;
  },

  /** Health probe — the in-browser runtime is "ok"; occ availability is dynamic. */
  async checkHealth() {
    return { ok: true, occ_available: true, runtime: "browser" };
  },

  /** Test/maintenance hook. */
  _resetImportedMachines() {
    _importedMachines = [];
  },
};

export default runtime;
