import { useGraphStore, getStrategyParams, getOrientRules } from "../../store/graphStore";
import { useStepStore } from "../../store/stepStore";
import { useToolpathStore } from "../../store/toolpathStore";
import { useUiStore } from "../../store/uiStore";
import { generateToolpath } from "../../api/client";
import { generatePythonCode } from "../../utils/codeGen";
import { S } from "../styles";

const STRATEGIES = [
  { value: "follow_curve",      label: "Follow Curve",      needs: "edge" },
  { value: "raster_fill",       label: "Raster Fill",       needs: "face" },
  { value: "contour_parallel",  label: "Contour Parallel",  needs: "any" },
];

const RULE_TYPES = [
  { value: "to_normal",       label: "to_normal",        params: [{ key: "surface_id", label: "Surface ID", type: "number" }] },
  { value: "fixed",           label: "fixed(i,j,k)",     params: [{ key: "i", label: "i", type: "number" }, { key: "j", label: "j", type: "number" }, { key: "k", label: "k", type: "number" }] },
  { value: "lead",            label: "lead(°)",          params: [{ key: "angle_deg", label: "Angle °", type: "number" }] },
  { value: "lag",             label: "lag(°)",           params: [{ key: "angle_deg", label: "Angle °", type: "number" }] },
  { value: "side_tilt",       label: "side_tilt(°)",     params: [{ key: "angle_deg", label: "Angle °", type: "number" }] },
  { value: "avoid_collision", label: "avoid_collision",  params: [{ key: "max_tilt", label: "Max tilt °", type: "number" }] },
];

function Field({ label, value, onChange, type = "number", min, max, step }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 4 }}>
      <span style={{ fontSize: 10, color: "#66667a", minWidth: 70 }}>{label}</span>
      <input
        type={type} value={value} min={min} max={max} step={step ?? 1}
        onChange={(e) => onChange(type === "number" ? Number(e.target.value) : e.target.value)}
        style={{
          flex: 1, background: "#f4f4fa", border: "1px solid #d0d0df", borderRadius: 4,
          color: "#1a1a2e", padding: "3px 6px", fontSize: 10, fontFamily: "inherit",
        }}
      />
    </div>
  );
}

function RuleRow({ rule, idx }) {
  const updateRule  = useGraphStore((s) => s.updateOrientNode);
  const removeRule  = useGraphStore((s) => s.removeOrientNode);
  const moveRule    = useGraphStore((s) => s.moveOrientNode);
  const nodes       = useGraphStore((s) => s.nodes);
  const edges       = useGraphStore((s) => s.edges);
  const totalRules  = getOrientRules({ nodes, edges }).length;
  const ruleType    = RULE_TYPES.find((r) => r.value === rule.rule);

  return (
    <div style={{ background: "#f4f4fa", border: "1px solid #d0d0df", borderRadius: 8, padding: "8px 10px", marginBottom: 6 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 6 }}>
        <span style={{ fontSize: 9, color: "#66667a", minWidth: 16 }}>{idx + 1}.</span>
        <span style={{ flex: 1, fontSize: 10, color: "#6355e0" }}>{ruleType?.label ?? rule.rule}</span>
        <button onClick={() => idx > 0 && moveRule(idx, idx - 1)} style={S.iconBtn} title="Move up">↑</button>
        <button onClick={() => idx < totalRules - 1 && moveRule(idx, idx + 1)} style={S.iconBtn} title="Move down">↓</button>
        <button onClick={() => removeRule(idx)} style={{ ...S.iconBtn, color: "#d93025" }} title="Remove">×</button>
      </div>
      {ruleType?.params.map((param) => (
        <Field key={param.key} label={param.label} value={rule[param.key] ?? ""} type={param.type}
          onChange={(v) => updateRule(idx, { [param.key]: v })} />
      ))}
    </div>
  );
}

export default function StrategyPanel() {
  const nodes          = useGraphStore((s) => s.nodes);
  const edges          = useGraphStore((s) => s.edges);
  const isGenerating   = useGraphStore((s) => s.isGenerating);
  const setStrategy    = useGraphStore((s) => s.setStrategy);
  const addRule        = useGraphStore((s) => s.addOrientNode);
  const setGenerating  = useGraphStore((s) => s.setGenerating);
  const setGeneratedCode = useGraphStore((s) => s.setGeneratedCode);
  const setGcodeOutput   = useGraphStore((s) => s.setGcodeOutput);

  const strategy       = getStrategyParams({ nodes });
  const orientRules    = getOrientRules({ nodes, edges });

  const addToolpath      = useToolpathStore((s) => s.addToolpath);
  const setActivePanel   = useUiStore((s) => s.setActivePanel);
  const setShowToolpaths = useUiStore((s) => s.setShowToolpaths);
  const toggleGraphView  = useUiStore((s) => s.toggleGraphView);

  const getSelectedFaces = useStepStore((s) => s.getSelectedFaces);
  const getSelectedEdges = useStepStore((s) => s.getSelectedEdges);
  const workspaceOrigin  = useStepStore((s) => s.workspaceOrigin);

  const selFaces    = getSelectedFaces();
  const selEdges    = getSelectedEdges();
  const canGenerate = selFaces.length > 0 || selEdges.length > 0;

  const COLORS = ["#6355e0", "#e06020", "#16a34a", "#d97706", "#cc3377", "#1a9e7a"];

  const handleGenerate = async () => {
    setGenerating(true);
    try {
      const data = await generateToolpath({ faces: selFaces, edges: selEdges, strategy, orientationRules: orientRules, machine: "gantry_5axis_ac", workspaceOrigin });
      const color = COLORS[useToolpathStore.getState().toolpaths.length % COLORS.length];
      addToolpath(`${strategy.strategy_type} — ${new Date().toLocaleTimeString()}`, data.points ?? [], color);
      if (data.python_code) setGeneratedCode(data.python_code);
      if (data.gcode)       setGcodeOutput(data.gcode);
      setShowToolpaths(true);
      toggleGraphView();
    } catch {
      const code = generatePythonCode(selFaces, selEdges, strategy, orientRules);
      setGeneratedCode(code);
      setActivePanel("code");
    } finally {
      setGenerating(false);
    }
  };

  const strategyDef = STRATEGIES.find((s) => s.value === strategy.strategy_type);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
      <div style={S.sectionLabel}>STRATEGY</div>

      <select value={strategy.strategy_type} onChange={(e) => setStrategy({ strategy_type: e.target.value })} style={S.select}>
        {STRATEGIES.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}
      </select>

      {strategyDef?.needs === "edge" && selEdges.length === 0 && (
        <div style={{ fontSize: 10, color: "#d97706" }}>⚠ Select at least one edge</div>
      )}
      {strategyDef?.needs === "face" && selFaces.length === 0 && (
        <div style={{ fontSize: 10, color: "#d97706" }}>⚠ Select at least one face</div>
      )}

      <Field label="Feed rate" value={strategy.feed_rate} onChange={(v) => setStrategy({ feed_rate: v })} min={1} />
      {strategy.strategy_type === "follow_curve" && (
        <Field label="Spacing" value={strategy.spacing} onChange={(v) => setStrategy({ spacing: v })} step={0.1} min={0.1} />
      )}
      {strategy.strategy_type === "raster_fill" && (
        <>
          <Field label="Spacing"       value={strategy.spacing}       onChange={(v) => setStrategy({ spacing: v })}       step={0.5} min={0.1} />
          <Field label="Angle °"       value={strategy.angle}         onChange={(v) => setStrategy({ angle: v })} />
          <Field label="Normal offset" value={strategy.normal_offset} onChange={(v) => setStrategy({ normal_offset: v })} step={0.1} />
          <Field label="Edge inset"    value={strategy.edge_inset}    onChange={(v) => setStrategy({ edge_inset: v })}    step={0.1} min={0} />
        </>
      )}
      {strategy.strategy_type === "contour_parallel" && (
        <>
          <Field label="Stepover" value={strategy.stepover}   onChange={(v) => setStrategy({ stepover: v })}   step={0.5} min={0.1} />
          <Field label="Passes"   value={strategy.num_passes} onChange={(v) => setStrategy({ num_passes: v })} min={1} />
        </>
      )}
      <Field label="Path type" value={strategy.path_type} onChange={(v) => setStrategy({ path_type: v })} type="text" />

      <div style={S.sectionLabel}>ORIENTATION RULES</div>
      {orientRules.map((rule, idx) => <RuleRow key={idx} rule={rule} idx={idx} />)}

      <select onChange={(e) => { if (e.target.value) addRule(e.target.value); e.target.value = ""; }} style={S.select} defaultValue="">
        <option value="" disabled>+ Add rule…</option>
        {RULE_TYPES.map((r) => <option key={r.value} value={r.value}>{r.label}</option>)}
      </select>

      <button style={{ ...S.primaryBtn, opacity: canGenerate ? 1 : 0.4, marginTop: 4, width: "100%" }}
        onClick={handleGenerate} disabled={!canGenerate || isGenerating}>
        {isGenerating ? "GENERATING…" : "GENERATE TOOLPATH ↓"}
      </button>

      <button style={S.btn} onClick={() => { setGeneratedCode(generatePythonCode(selFaces, selEdges, strategy, orientRules)); setActivePanel("code"); }}>
        Preview Python Code
      </button>
    </div>
  );
}
