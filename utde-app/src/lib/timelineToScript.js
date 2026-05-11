/**
 * timelineToScript — render the current timeline as illustrative Python.
 *
 * One-way: timeline → script. This is the read-only "Show generated Python"
 * view per Q2(b) — operations are the canonical authoring surface, the
 * script is just the equivalent code a user could write by hand against the
 * UTDE API. We don't try to round-trip back to the timeline.
 *
 * Walks the entries in order, maintaining the running orient chain (a
 * visible orient row resets it; per Q3 + append-mode the chain is appended
 * on top of each op's template defaults). Emits one labelled block per op.
 */

const NEEDS_LOWER_LETTERS_RE = /^[a-z]/;

function pyValue(v) {
  if (v === null || v === undefined) return "None";
  if (typeof v === "boolean") return v ? "True" : "False";
  if (typeof v === "number") {
    return Number.isFinite(v) ? String(v) : "None";
  }
  if (typeof v === "string") return JSON.stringify(v);
  if (Array.isArray(v)) return `[${v.map(pyValue).join(", ")}]`;
  if (typeof v === "object") {
    const inner = Object.entries(v).map(([k, val]) => `${JSON.stringify(k)}: ${pyValue(val)}`);
    return `{${inner.join(", ")}}`;
  }
  return JSON.stringify(v);
}

function rulePython(rule) {
  switch (rule.type) {
    case "fixed":
      return `fixed(${num(rule.x)}, ${num(rule.y)}, ${num(rule.z)})`;
    case "lead":
      return `lead(${num(rule.angle)})`;
    case "lag":
      return `lag(${num(rule.angle)})`;
    case "side_tilt":
      return `side_tilt(${num(rule.angle)})`;
    case "to_normal":
      return rule.surfaceRef
        ? `to_normal(model.face_by_id(${JSON.stringify(rule.surfaceRef)}))`
        : "to_normal(model.top_surface())";
    case "avoid_collision":
      return `avoid_collision(machine, max_tilt=${num(rule.max_tilt)})`;
    default:
      return `# unsupported rule: ${rule.type}`;
  }
}

function num(v) {
  if (v == null) return "0";
  if (Number.isInteger(v)) return String(v);
  return v.toFixed(2).replace(/\.?0+$/, "") || "0";
}

function paramsBlock(params) {
  const keys = Object.keys(params || {});
  if (keys.length === 0) return "{}";
  const lines = keys.map((k) => `    ${JSON.stringify(k)}: ${pyValue(params[k])},`);
  return ["{", ...lines, "}"].join("\n");
}

function geometryBlock(geometry) {
  if (!geometry || geometry.length === 0) return "[]";
  const slots = geometry.map((slot) => {
    const ids = (slot || []).map((id) => JSON.stringify(id));
    return `[${ids.join(", ")}]`;
  });
  return `[${slots.join(", ")}]`;
}

function pythonIdentifier(name, fallback) {
  if (!name) return fallback;
  const cleaned = String(name).trim().toLowerCase().replace(/[^a-z0-9_]+/g, "_").replace(/^_+|_+$/g, "");
  if (!cleaned) return fallback;
  return NEEDS_LOWER_LETTERS_RE.test(cleaned) ? cleaned : `op_${cleaned}`;
}

/**
 * Generate a Python script string from `entries`.
 *
 * Options:
 *   machine — name of a `Machine.<name>()` factory to call (default "gantry_5axis_ac")
 *   includeImports — prepend the import block (default true)
 */
export function timelineToScript(entries, options = {}) {
  const machine = options.machine || "gantry_5axis_ac";
  const includeImports = options.includeImports !== false;

  const out = [];

  if (includeImports) {
    out.push(
      "# Generated from the Setup-tab timeline (read-only view).",
      "# Source of truth is the timeline; this code is illustrative only.",
      "",
      "from toolpath_engine import (",
      "    get_process,",
      "    fixed, lead, lag, side_tilt, avoid_collision, to_normal,",
      "    Machine, PostProcessor, ToolpathCollection,",
      ")",
      "",
      "# Load the model (replace with your STEP import in standalone use).",
      "model   = None",
      `machine = Machine.${machine}()`,
      "",
      "combined = ToolpathCollection(name=\"timeline\")",
      "",
    );
  }

  let activeChain = [];
  let opCount = 0;
  let orientCount = 0;
  const visible = (entries || []).filter((e) => e.visible !== false);

  for (let i = 0; i < visible.length; i++) {
    const entry = visible[i];
    if (entry.kind === "scene") {
      if (entry.action === "import") {
        out.push(`# Import CAD — load a STEP file via model = parse_step("…")`);
      } else if (entry.action === "clear") {
        out.push(`# Clear part — model = None`);
      } else {
        out.push(`# Scene · ${entry.action}`);
      }
      out.push("");
      continue;
    }
    if (entry.kind === "orient") {
      orientCount += 1;
      activeChain = [...(entry.rules || [])];
      if (activeChain.length === 0) {
        out.push(`# --- Orient ${orientCount} : chain reset to empty ---`);
      } else {
        out.push(`# --- Orient ${orientCount} : new chain ---`);
        for (const rule of activeChain) {
          out.push(`#   .orient(${rulePython(rule)})`);
        }
      }
      out.push("");
      continue;
    }

    if (entry.kind !== "op") continue;

    opCount += 1;
    const ident = pythonIdentifier(entry.name || entry.templateId, `op_${opCount}`);

    out.push(`# --- Op ${String(opCount).padStart(2, "0")}: ${entry.name || entry.templateId} ---`);
    out.push(
      `${ident} = get_process(${JSON.stringify(entry.templateId)})(`,
      `    model=model,`,
      `    geometry=${geometryBlock(entry.geometry)},`,
      `    params=${indentBlock(paramsBlock(entry.params), 4)},`,
      `)`,
    );
    for (const rule of activeChain) {
      out.push(`${ident}.orient(${rulePython(rule)})`);
    }
    out.push(`combined += ${ident}`);
    out.push("");
  }

  if (includeImports) {
    out.push(
      "# Post-process the combined timeline.",
      "post  = PostProcessor(machine)",
      "gcode = post.process(combined, resolve_ik=False)",
      "print(gcode)",
    );
  }

  return out.join("\n");
}

function indentBlock(block, spaces) {
  if (!block.includes("\n")) return block;
  const lines = block.split("\n");
  const pad = " ".repeat(spaces);
  return [lines[0], ...lines.slice(1).map((l) => pad + l)].join("\n");
}
