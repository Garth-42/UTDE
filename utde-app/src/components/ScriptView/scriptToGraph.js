/**
 * scriptToGraph — line-by-line regex parser that reads a UTDE Python script
 * and dispatches recognised patterns into graphStore.
 *
 * Only the constrained patterns emitted by graphToScript are recognised.
 * Unrecognised lines are collected and returned so the editor can mark them.
 *
 * Returns: { updatedLines: number[], unparsedLines: number[] }
 */
import { useGraphStore } from "../../store/graphStore";

// ── Patterns ──────────────────────────────────────────────────────────────────

const STRATEGY_PATTERNS = [
  {
    re: /FollowCurveStrategy\(\)\.generate\(/,
    type: "follow_curve",
  },
  {
    re: /RasterFillStrategy\(\)\.generate\(/,
    type: "raster_fill",
  },
  {
    re: /ContourParallelStrategy\(\)\.generate\(/,
    type: "contour_parallel",
  },
];

const ORIENT_PATTERNS = [
  {
    re:   /paths\.orient\(\s*lead\(\s*([\d.+-]+)\s*\)\s*\)/,
    rule: "lead",
    extract: (m) => ({ angle_deg: parseFloat(m[1]) }),
  },
  {
    re:   /paths\.orient\(\s*lag\(\s*([\d.+-]+)\s*\)\s*\)/,
    rule: "lag",
    extract: (m) => ({ angle_deg: parseFloat(m[1]) }),
  },
  {
    re:   /paths\.orient\(\s*side_tilt\(\s*([\d.+-]+)\s*\)\s*\)/,
    rule: "side_tilt",
    extract: (m) => ({ angle_deg: parseFloat(m[1]) }),
  },
  {
    re:   /paths\.orient\(\s*to_normal\(([^)]+)\)\s*\)/,
    rule: "to_normal",
    extract: () => ({}),
  },
  {
    re:   /paths\.orient\(\s*fixed\(\s*([\d.+-]+)\s*,\s*([\d.+-]+)\s*,\s*([\d.+-]+)\s*\)\s*\)/,
    rule: "fixed",
    extract: (m) => ({ i: parseFloat(m[1]), j: parseFloat(m[2]), k: parseFloat(m[3]) }),
  },
  {
    re:   /paths\.orient\(\s*avoid_collision\([^)]*max_tilt\s*=\s*([\d.+-]+)[^)]*\)\s*\)/,
    rule: "avoid_collision",
    extract: (m) => ({ max_tilt: parseFloat(m[1]) }),
  },
];

const PARAM_PATTERNS = [
  { re: /feed_rate\s*=\s*([\d.]+)/,   key: "feed_rate",   parse: parseFloat },
  { re: /spacing\s*=\s*([\d.]+)/,     key: "spacing",     parse: parseFloat },
  { re: /angle\s*=\s*([\d.+-]+)/,     key: "angle",       parse: parseFloat },
  { re: /zigzag\s*=\s*(True|False)/,  key: "zigzag",      parse: (v) => v === "True" },
  { re: /stepover\s*=\s*([\d.]+)/,    key: "stepover",    parse: parseFloat },
  { re: /num_passes\s*=\s*([\d]+)/,   key: "num_passes",  parse: parseInt  },
  { re: /overshoot\s*=\s*([\d.]+)/,   key: "overshoot",   parse: parseFloat },
  { re: /normal_offset\s*=\s*([\d.]+)/,  key: "normal_offset",  parse: parseFloat },
  { re: /edge_inset\s*=\s*([\d.]+)/,     key: "edge_inset",     parse: parseFloat },
];

const MACHINE_PATTERN = /machine\s*=\s*Machine\.(\w+)\(/;

// ── Helpers ───────────────────────────────────────────────────────────────────

function isSkippable(line) {
  const t = line.trim();
  return (
    t === "" ||
    t.startsWith("#") ||
    t.startsWith("from ") ||
    t.startsWith("import ") ||
    t.startsWith("model") ||
    t.startsWith("post") ||
    t.startsWith("gcode") ||
    t.startsWith("with open") ||
    t.startsWith("print(") ||
    t.startsWith("if ") ||
    t.startsWith("surface_") ||
    t.startsWith("curve_") ||
    t === "paths = None" ||
    t === ")"
  );
}

// ── Main export ───────────────────────────────────────────────────────────────

export function scriptToGraph(code) {
  const store = useGraphStore.getState();
  const lines = code.split("\n");

  const updatedLines  = [];
  const unparsedLines = [];

  // Collect strategy type from a strategy line
  let pendingStrategy = null;
  let pendingStrategyLine = -1;

  // Collect orient nodes to add — we reset orient nodes and re-add in order
  const orientUpdates = []; // { rule, params, lineNum }

  lines.forEach((line, i) => {
    if (isSkippable(line)) return;

    // ── Strategy type ────────────────────────────────────────────────────────
    const stratMatch = STRATEGY_PATTERNS.find((p) => p.re.test(line));
    if (stratMatch) {
      pendingStrategy = stratMatch.type;
      pendingStrategyLine = i;
      return;
    }

    // ── Strategy params (continuation lines like "    feed_rate=600,") ───────
    if (pendingStrategy !== null && /^\s+\w/.test(line)) {
      let matched = false;
      PARAM_PATTERNS.forEach(({ re, key, parse }) => {
        const m = line.match(re);
        if (m) {
          store.setStrategy({ strategy_type: pendingStrategy, [key]: parse(m[1]) });
          updatedLines.push(pendingStrategyLine, i);
          matched = true;
        }
      });
      if (matched) return;
    }

    // Reset pending strategy on non-continuation line
    if (pendingStrategy !== null && !line.trim().startsWith("    ")) {
      store.setStrategy({ strategy_type: pendingStrategy });
      updatedLines.push(pendingStrategyLine);
      pendingStrategy = null;
      pendingStrategyLine = -1;
    }

    // ── Orient rules ─────────────────────────────────────────────────────────
    const orientMatch = ORIENT_PATTERNS.find((p) => p.re.test(line));
    if (orientMatch) {
      const m = line.match(orientMatch.re);
      orientUpdates.push({ rule: orientMatch.rule, params: orientMatch.extract(m), lineNum: i });
      updatedLines.push(i);
      return;
    }

    // ── Machine preset ───────────────────────────────────────────────────────
    const machineMatch = line.match(MACHINE_PATTERN);
    if (machineMatch) {
      const postNode = store.nodes.find((n) => n.type === "post_processor");
      if (postNode) {
        store.updateNodeParam(postNode.id, "machine", machineMatch[1]);
        updatedLines.push(i);
      }
      return;
    }

    // ── Unrecognised ─────────────────────────────────────────────────────────
    unparsedLines.push(i);
  });

  // Flush pending strategy
  if (pendingStrategy !== null) {
    store.setStrategy({ strategy_type: pendingStrategy });
    updatedLines.push(pendingStrategyLine);
  }

  // Apply orient nodes: remove existing orient nodes and re-add in order
  if (orientUpdates.length > 0) {
    const { nodes, edges, getState } = useGraphStore;
    const currentOrientNodes = getState().nodes.filter((n) => n.type === "orient");
    currentOrientNodes.forEach((n) => store.removeNode(n.id));
    orientUpdates.forEach(({ rule }) => store.addOrientNode(rule));
    // Apply params to each new orient node in order
    orientUpdates.forEach(({ params }, idx) => {
      if (Object.keys(params).length > 0) {
        store.updateOrientNode(idx, params);
      }
    });
  }

  return {
    updatedLines:  [...new Set(updatedLines)],
    unparsedLines: [...new Set(unparsedLines)],
  };
}
