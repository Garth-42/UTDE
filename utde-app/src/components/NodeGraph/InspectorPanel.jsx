import { useState } from "react";
import { useGraphStore, getStrategyNode, getOrientNodes, getOrientRules } from "../../store/graphStore";
import { useStepStore } from "../../store/stepStore";
import { useToolpathStore } from "../../store/toolpathStore";
import { useUiStore } from "../../store/uiStore";
import { generateToolpath } from "../../api/client";
import { generatePythonCode } from "../../utils/codeGen";
import { S } from "../styles";

const STRATEGIES = [
  { value: "follow_curve",     label: "Follow Curve" },
  { value: "raster_fill",      label: "Raster Fill" },
  { value: "contour_parallel", label: "Contour Parallel" },
];

const MACHINES = [
  { value: "gantry_5axis_ac",    label: "5-Axis AC Gantry" },
  { value: "gantry_5axis_bc",    label: "5-Axis BC Gantry" },
  { value: "cartesian_3axis",    label: "3-Axis XYZ" },
  { value: "generic_6dof_robot", label: "6-DOF Robot" },
];

const COLORS = ["#6355e0", "#e06020", "#16a34a", "#d97706", "#cc3377", "#1a9e7a"];

function Field({ label, value, onChange, type = "number", options, min, max, step }) {
  const inputStyle = {
    flex: 1, background: "#f4f4fa", border: "1px solid #d0d0df",
    borderRadius: 4, color: "#1a1a2e", padding: "3px 6px",
    fontSize: 10, fontFamily: "inherit",
  };
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 5 }}>
      <span style={{ fontSize: 10, color: "#66667a", minWidth: 80, flexShrink: 0 }}>{label}</span>
      {options ? (
        <select value={value} onChange={(e) => onChange(e.target.value)} style={{ ...inputStyle, ...S.select }}>
          {options.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
        </select>
      ) : (
        <input
          type={type} value={value} min={min} max={max} step={step ?? 1}
          onChange={(e) => onChange(type === "number" ? Number(e.target.value) : e.target.value)}
          style={inputStyle}
        />
      )}
    </div>
  );
}

/**
 * Resolve faces/edges for a strategy node.
 * Priority: wired source node output → node's stored selection → global viewport selection.
 */
function resolveGeometry(stratNode, nodes, edges, allFaces, allEdges, getSelectedFaces, getSelectedEdges) {
  const facesEdge    = edges.find((e) => e.to_node === stratNode?.id && e.to_port === "faces_in");
  const edgesEdge    = edges.find((e) => e.to_node === stratNode?.id && e.to_port === "edges_in");
  const geoFaceSrc   = facesEdge ? nodes.find((n) => n.id === facesEdge.from_node) : null;
  const geoEdgeSrc   = edgesEdge ? nodes.find((n) => n.id === edgesEdge.from_node) : null;

  const resolveSrc = (src, kind) => {
    if (!src) return null;
    if (src.type === "step_import") return kind === "faces" ? src.output?.faces ?? [] : src.output?.edges ?? [];
    const ids = kind === "faces" ? src.params?.selected_face_ids ?? [] : src.params?.selected_edge_ids ?? [];
    return ids.length > 0 ? (kind === "faces" ? allFaces : allEdges).filter((x) => ids.includes(x.id)) : null;
  };

  const storedFaceIds = stratNode?.params.selected_face_ids ?? [];
  const storedEdgeIds = stratNode?.params.selected_edge_ids ?? [];

  return {
    faces: resolveSrc(geoFaceSrc, "faces")
      ?? (storedFaceIds.length > 0 ? allFaces.filter((f) => storedFaceIds.includes(f.id)) : getSelectedFaces()),
    edges: resolveSrc(geoEdgeSrc, "edges")
      ?? (storedEdgeIds.length > 0 ? allEdges.filter((e) => storedEdgeIds.includes(e.id)) : getSelectedEdges()),
  };
}

/**
 * DESIGN RULE: Every strategy node inspector must include a ▶ Preview Toolpath
 * section that generates and visualises the toolpath for that node.
 * The section shows: generating state, last-result summary (pts, timestamp),
 * and a fallback "Preview Python" link on error.
 */
function PreviewToolpathSection({ node }) {
  const [generating, setGenerating] = useState(false);
  const [result, setResult]         = useState(null);  // { pts, label, time } | null
  const [error, setError]           = useState(null);

  const nodes  = useGraphStore((s) => s.nodes);
  const edges  = useGraphStore((s) => s.edges);
  const setGeneratedCode = useGraphStore((s) => s.setGeneratedCode);
  const setGcodeOutput   = useGraphStore((s) => s.setGcodeOutput);

  const allFaces          = useStepStore((s) => s.faces);
  const allEdges          = useStepStore((s) => s.edges);
  const getSelectedFaces  = useStepStore((s) => s.getSelectedFaces);
  const getSelectedEdges  = useStepStore((s) => s.getSelectedEdges);
  const workspaceOrigin   = useStepStore((s) => s.workspaceOrigin);

  const addToolpath      = useToolpathStore((s) => s.addToolpath);
  const setShowToolpaths = useUiStore((s) => s.setShowToolpaths);
  const toggleGraphView  = useUiStore((s) => s.toggleGraphView);
  const graphView        = useUiStore((s) => s.graphView);

  const strategy    = node.params;
  const orientRules = getOrientRules({ nodes, edges });

  const handlePreview = async () => {
    setGenerating(true);
    setError(null);
    try {
      const { faces, edges: selEdges } = resolveGeometry(
        node, nodes, edges, allFaces, allEdges, getSelectedFaces, getSelectedEdges
      );
      const data = await generateToolpath({
        faces, edges: selEdges,
        strategy, orientationRules: orientRules,
        machine: useGraphStore.getState().nodes.find((n) => n.type === "post_processor")?.params.machine ?? "gantry_5axis_ac",
        workspaceOrigin,
      });
      const color = COLORS[useToolpathStore.getState().toolpaths.length % COLORS.length];
      const label = `${strategy.strategy_type} — ${new Date().toLocaleTimeString()}`;
      addToolpath(label, data.points ?? [], color);
      if (data.python_code) setGeneratedCode(data.python_code);
      if (data.gcode)       setGcodeOutput(data.gcode);
      setResult({ pts: (data.points ?? []).length, label, time: new Date().toLocaleTimeString() });
      setShowToolpaths(true);
      if (graphView) toggleGraphView();
    } catch (err) {
      const { faces, edges: selEdges } = resolveGeometry(
        node, nodes, edges, allFaces, allEdges, getSelectedFaces, getSelectedEdges
      );
      const code = generatePythonCode(faces, selEdges, strategy, orientRules);
      setGeneratedCode(code);
      setError(err.message);
    } finally {
      setGenerating(false);
    }
  };

  const canPreview = (() => {
    const { faces, edges: selEdges } = resolveGeometry(
      node, nodes, edges, allFaces, allEdges, getSelectedFaces, getSelectedEdges
    );
    return faces.length > 0 || selEdges.length > 0;
  })();

  return (
    <div style={{ marginTop: 12, borderTop: "1px solid #d0d0df", paddingTop: 10 }}>
      <button
        style={{
          ...S.primaryBtn, width: "100%", padding: "7px 0", fontSize: 11,
          opacity: canPreview && !generating ? 1 : 0.4,
        }}
        onClick={handlePreview}
        disabled={!canPreview || generating}
      >
        {generating ? "Generating…" : "▶ Preview Toolpath"}
      </button>

      {result && !error && (
        <div style={{ marginTop: 6, fontSize: 9, color: "#16a34a", lineHeight: 1.7 }}>
          ✓ {result.pts.toLocaleString()} pts · {result.time}
          <span style={{ color: "#9090aa" }}> — visible in 3D view</span>
        </div>
      )}

      {error && (
        <div style={{ marginTop: 6 }}>
          <div style={{ fontSize: 9, color: "#c0291e", lineHeight: 1.6, marginBottom: 4 }}>
            {error}
          </div>
          <button
            style={{ ...S.btn, width: "100%", fontSize: 9 }}
            onClick={() => useUiStore.getState().setActivePanel("code")}
          >
            View Python Code
          </button>
        </div>
      )}

      {!canPreview && (
        <div style={{ marginTop: 5, fontSize: 9, color: "#9090aa" }}>
          Select or wire geometry to enable preview.
        </div>
      )}
    </div>
  );
}

function StrategyInspector({ node }) {
  const setStrategy = useGraphStore((s) => s.setStrategy);
  const p = node.params;
  const set = (k, v) => setStrategy({ [k]: v });

  return (
    <>
      <Field label="Type" value={p.strategy_type} options={STRATEGIES}
        onChange={(v) => setStrategy({ strategy_type: v })} />
      <Field label="Feed rate" value={p.feed_rate} min={1}
        onChange={(v) => set("feed_rate", v)} />
      <Field label="Path type" value={p.path_type} type="text"
        onChange={(v) => set("path_type", v)} />

      {p.strategy_type === "follow_curve" && (
        <Field label="Spacing" value={p.spacing} step={0.1} min={0.1}
          onChange={(v) => set("spacing", v)} />
      )}
      {p.strategy_type === "raster_fill" && (
        <>
          <Field label="Spacing"       value={p.spacing}       step={0.5} min={0.1} onChange={(v) => set("spacing", v)} />
          <Field label="Angle °"       value={p.angle}                               onChange={(v) => set("angle", v)} />
          <Field label="Normal offset" value={p.normal_offset} step={0.1}            onChange={(v) => set("normal_offset", v)} />
          <Field label="Edge inset"    value={p.edge_inset}    step={0.1} min={0}    onChange={(v) => set("edge_inset", v)} />
        </>
      )}
      {p.strategy_type === "contour_parallel" && (
        <>
          <Field label="Stepover" value={p.stepover}   step={0.5} min={0.1} onChange={(v) => set("stepover", v)} />
          <Field label="Passes"   value={p.num_passes} min={1}               onChange={(v) => set("num_passes", v)} />
        </>
      )}

      {/* DESIGN RULE: every strategy node inspector includes PreviewToolpathSection */}
      <PreviewToolpathSection node={node} />
    </>
  );
}

function OrientInspector({ node }) {
  const updateNodeParam = useGraphStore((s) => s.updateNodeParam);
  const p = node.params;
  const set = (k, v) => updateNodeParam(node.id, k, v);

  const RULE_PARAMS = {
    to_normal:       [{ key: "surface_id", label: "Surface ID" }],
    fixed:           [{ key: "i", label: "i" }, { key: "j", label: "j" }, { key: "k", label: "k" }],
    lead:            [{ key: "angle_deg", label: "Angle °" }],
    lag:             [{ key: "angle_deg", label: "Angle °" }],
    side_tilt:       [{ key: "angle_deg", label: "Angle °" }],
    avoid_collision: [{ key: "max_tilt",  label: "Max tilt °" }],
  };

  const params = RULE_PARAMS[p.rule] ?? [];

  return (
    <>
      <div style={{ fontSize: 10, color: "#66667a", marginBottom: 8 }}>
        Rule: <span style={{ color: "#d97706", fontWeight: 600 }}>{p.rule}</span>
      </div>
      {params.map((param) => (
        <Field key={param.key} label={param.label} value={p[param.key] ?? 0} step={0.1}
          onChange={(v) => set(param.key, v)} />
      ))}
    </>
  );
}

function PostInspector({ node }) {
  const updateNodeParam = useGraphStore((s) => s.updateNodeParam);
  const p = node.params;

  return (
    <>
      <Field label="Machine" value={p.machine} options={MACHINES}
        onChange={(v) => updateNodeParam(node.id, "machine", v)} />
      <Field label="WCS register" value={p.wcs_register} type="text"
        onChange={(v) => updateNodeParam(node.id, "wcs_register", v)} />
    </>
  );
}

function GeometryInspector() {
  return (
    <div style={{ fontSize: 10, color: "#66667a", lineHeight: 1.8 }}>
      Reads the current face and edge selection from the STEP viewport.
      Switch to <strong style={{ color: "#1a1a2e" }}>3D VIEW</strong> to change the selection.
    </div>
  );
}

function StepImportInspector({ node }) {
  const updateNodeParam = useGraphStore((s) => s.updateNodeParam);
  const { output, params } = node;

  return (
    <>
      {output ? (
        <>
          <div style={{ fontSize: 10, color: "#1a6eb5", fontWeight: 600, marginBottom: 6 }}>
            {output.fileName}
          </div>
          <div style={{ fontSize: 10, color: "#66667a", lineHeight: 1.8, marginBottom: 8 }}>
            {output.faces?.length ?? 0} faces · {output.edges?.length ?? 0} edges
          </div>
        </>
      ) : (
        <div style={{ fontSize: 10, color: "#9090aa", marginBottom: 8 }}>No file loaded.</div>
      )}
      <Field label="Mesh quality" value={params.quality_level ?? 2} min={1} max={10}
        onChange={(v) => updateNodeParam(node.id, "quality_level", v)} />
      <div style={{ fontSize: 9, color: "#9090aa", marginTop: 4, lineHeight: 1.6 }}>
        Re-browse the file on the node to apply a new quality setting.
      </div>
    </>
  );
}

function EmptyInspector() {
  return (
    <div style={{ fontSize: 10, color: "#66667a", lineHeight: 1.8 }}>
      <div style={{ marginBottom: 8 }}>Click any node to edit its parameters.</div>
      <div style={{ color: "#aaa" }}>No process variables defined yet.</div>
    </div>
  );
}

const TYPE_LABELS = {
  geometry:       "Geometry Input",
  strategy:       "Strategy",
  orient:         "Orientation Rule",
  post_processor: "Post Processor",
  step_import:    "STEP Import",
};

const TYPE_COLORS = {
  geometry:       "#16a34a",
  strategy:       "#6355e0",
  orient:         "#d97706",
  post_processor: "#44445a",
  step_import:    "#1a6eb5",
};

export default function InspectorPanel() {
  const selectedNodeId = useGraphStore((s) => s.selectedNodeId);
  const nodes          = useGraphStore((s) => s.nodes);
  const selectedNode   = nodes.find((n) => n.id === selectedNodeId) ?? null;

  return (
    <div style={{
      width: 240, flexShrink: 0,
      background: "#eaeaf2", borderLeft: "1px solid #d0d0df",
      display: "flex", flexDirection: "column", overflow: "hidden",
    }}>
      {/* Header */}
      <div style={{
        padding: "10px 14px", borderBottom: "1px solid #d0d0df",
        background: "#e4e4ee",
      }}>
        {selectedNode ? (
          <div>
            <div style={{
              fontSize: 9, fontWeight: 700, letterSpacing: 1.5,
              color: TYPE_COLORS[selectedNode.type] ?? "#66667a",
              marginBottom: 2,
            }}>
              {TYPE_LABELS[selectedNode.type]?.toUpperCase()}
            </div>
            <div style={{ fontSize: 12, fontWeight: 600, color: "#1a1a2e" }}>
              {selectedNode.label}
            </div>
          </div>
        ) : (
          <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: 1.5, color: "#66667a" }}>
            INSPECTOR
          </div>
        )}
      </div>

      {/* Body */}
      <div style={{ flex: 1, overflowY: "auto", padding: "12px 14px" }}>
        {!selectedNode                              && <EmptyInspector />}
        {selectedNode?.type === "geometry"          && <GeometryInspector node={selectedNode} />}
        {selectedNode?.type === "strategy"          && <StrategyInspector node={selectedNode} />}
        {selectedNode?.type === "orient"            && <OrientInspector   node={selectedNode} />}
        {selectedNode?.type === "post_processor"    && <PostInspector     node={selectedNode} />}
        {selectedNode?.type === "step_import"       && <StepImportInspector node={selectedNode} />}
      </div>
    </div>
  );
}
