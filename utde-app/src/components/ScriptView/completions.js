/**
 * UTDE-specific CodeMirror autocompletion source.
 *
 * Provides context-aware completions for:
 * - UTDE import names
 * - Surface.*, Curve.*, Machine.* static methods
 * - paths.orient(...) orientation rules
 * - Strategy constructors with parameter snippets
 * - Top-level UTDE names
 */
import { autocompletion, CompletionContext, snippetCompletion } from "@codemirror/autocomplete";

// ── Snippet helpers ───────────────────────────────────────────────────────────

const s = (label, snippet, info) =>
  snippetCompletion(snippet, { label, type: "function", info });

const kw = (label, info) => ({ label, type: "keyword", info });
const cls = (label, info) => ({ label, type: "class", info });
const fn = (label, info) => ({ label, type: "function", info });

// ── Completion sets ───────────────────────────────────────────────────────────

const UTDE_IMPORTS = [
  "Surface", "Curve", "GeometryModel",
  "FollowCurveStrategy", "RasterFillStrategy", "ContourParallelStrategy",
  "to_normal", "fixed", "lead", "lag", "side_tilt", "blend", "avoid_collision",
  "Machine", "PostProcessor", "PostConfig",
].map((label) => ({ label, type: "class" }));

const SURFACE_METHODS = [
  s("plane",    "plane(origin=(${0, 0, 0}), normal=(${0, 0, 1}), name=\"${plane}\")",
    "Create a planar surface"),
  s("cylinder", "cylinder(center=(${0, 0, 0}), axis=(${0, 0, 1}), radius=${50}, height=${100}, name=\"${cyl}\")",
    "Create a cylindrical surface"),
  s("sphere",   "sphere(center=(${0, 0, 0}), radius=${50}, name=\"${sphere}\")",
    "Create a spherical surface"),
];

const CURVE_METHODS = [
  s("line",   "line(start=(${0, 0, 0}), end=(${100, 0, 0}))",
    "Straight line between two points"),
  s("circle", "circle(center=(${0, 0, 0}), radius=${50}, normal=(${0, 0, 1}), num_points=${64})",
    "Circle curve"),
  s("helix",  "helix(center=(${0, 0, 0}), radius=${25}, pitch=${5}, turns=${3})",
    "Helical curve"),
  s("spline", "spline(control_points=[\n    ${(0, 0, 0)},\n    ${(50, 0, 0)},\n], num_points=${100})",
    "Spline through control points"),
  s("from_points", "from_points(coords=[${(0,0,0), (10,0,0)}], name=\"${curve}\")",
    "Curve from a list of 3D coords"),
];

const MACHINE_PRESETS = [
  s("cartesian_3axis", "cartesian_3axis(name=\"${my_machine}\")",
    "3-axis Cartesian gantry"),
  s("gantry_5axis_ac", "gantry_5axis_ac(name=\"${my_machine}\")",
    "5-axis AC gantry (A and C rotary axes)"),
  s("gantry_5axis_bc", "gantry_5axis_bc(name=\"${my_machine}\")",
    "5-axis BC gantry (B and C rotary axes)"),
];

const ORIENT_RULES = [
  s("to_normal",       "to_normal(${surface})",
    "Align tool axis to surface normal"),
  s("fixed",           "fixed(${0}, ${0}, ${-1})",
    "Fixed tool direction (i, j, k)"),
  s("lead",            "lead(${10})",
    "Lead angle in degrees (forward tilt)"),
  s("lag",             "lag(${5})",
    "Lag angle in degrees (backward tilt)"),
  s("side_tilt",       "side_tilt(${5})",
    "Side tilt angle in degrees"),
  s("blend",           "blend(${rule_a}, ${rule_b}, over=${10.0})",
    "Blend between two orientation rules"),
  s("avoid_collision", "avoid_collision(machine, max_tilt=${45})",
    "Tilt away from collisions up to max_tilt degrees"),
];

const STRATEGY_SNIPPETS = [
  s("FollowCurveStrategy",
    "FollowCurveStrategy().generate(\n    curve=${curve},\n    feed_rate=${600},\n    spacing=${1.0},\n    path_type=\"${cut}\",\n)",
    "Follow a curve at constant feed rate"),
  s("RasterFillStrategy",
    "RasterFillStrategy().generate(\n    surface=${surface},\n    spacing=${2.0},\n    feed_rate=${600},\n    angle=${0},\n    zigzag=${True},\n)",
    "Raster scan fill over a surface"),
  s("ContourParallelStrategy",
    "ContourParallelStrategy().generate(\n    boundary=${boundary},\n    stepover=${3.0},\n    num_passes=${4},\n    feed_rate=${600},\n)",
    "Contour-parallel offset passes"),
];

const POST_SNIPPETS = [
  s("PostProcessor",
    "PostProcessor(${machine})",
    "Create a post-processor for a machine"),
  s("PostConfig",
    "PostConfig(\n    program_number=${1000},\n    units=\"${metric}\",\n    use_tcp=${True},\n)",
    "Post-processor configuration"),
];

const TOP_LEVEL = [
  ...STRATEGY_SNIPPETS,
  ...POST_SNIPPETS,
  cls("Surface",       "CAD surface — use Surface.plane(), .cylinder(), .sphere()"),
  cls("Curve",         "3D curve — use Curve.line(), .circle(), .helix(), .spline()"),
  cls("Machine",       "Machine definition — use Machine.gantry_5axis_ac() etc."),
  cls("GeometryModel", "Container for surfaces and curves"),
  fn("to_normal",      "Orient tool to surface normal"),
  fn("fixed",          "Fixed tool direction"),
  fn("lead",           "Lead angle tilt"),
  fn("lag",            "Lag angle tilt"),
  fn("side_tilt",      "Side tilt angle"),
  fn("blend",          "Blend between two orient rules"),
  fn("avoid_collision","Collision-avoidance tilt"),
];

// ── Completion source ─────────────────────────────────────────────────────────

/**
 * Context-aware UTDE completion source for CodeMirror.
 * Dispatches to the right completion set based on what precedes the cursor.
 */
function utdeCompletionSource(context) {
  const line = context.state.doc.lineAt(context.pos).text;
  const beforeCursor = line.slice(0, context.pos - context.state.doc.line(context.state.doc.lineAt(context.pos).number).from);

  // Surface.| — static method completions
  if (/\bSurface\.$/.test(beforeCursor)) {
    return { from: context.pos, options: SURFACE_METHODS, validFor: /^\w*$/ };
  }

  // Curve.| — static method completions
  if (/\bCurve\.$/.test(beforeCursor)) {
    return { from: context.pos, options: CURVE_METHODS, validFor: /^\w*$/ };
  }

  // Machine.| — preset completions
  if (/\bMachine\.$/.test(beforeCursor)) {
    return { from: context.pos, options: MACHINE_PRESETS, validFor: /^\w*$/ };
  }

  // paths.orient(| — orientation rule completions
  if (/paths\.orient\(\s*$/.test(beforeCursor)) {
    return { from: context.pos, options: ORIENT_RULES, validFor: /^\w*$/ };
  }

  // from toolpath_engine import | — import name completions
  if (/from\s+toolpath_engine\s+import\s+[\w,\s(]*$/.test(beforeCursor)) {
    const word = context.matchBefore(/\w*/);
    if (!word || (word.from === word.to && !context.explicit)) return null;
    return { from: word.from, options: UTDE_IMPORTS, validFor: /^\w*$/ };
  }

  // General word-boundary completion
  const word = context.matchBefore(/\w+/);
  if (!word || (word.from === word.to && !context.explicit)) return null;
  if (word.text.length < 2) return null;

  return { from: word.from, options: TOP_LEVEL, validFor: /^\w*$/ };
}

// ── Export ────────────────────────────────────────────────────────────────────

export const utdeCompletions = autocompletion({
  override:        [utdeCompletionSource],
  activateOnTyping: true,
  maxRenderedOptions: 20,
  icons: true,
});
