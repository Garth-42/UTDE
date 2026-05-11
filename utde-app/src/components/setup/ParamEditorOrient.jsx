/**
 * ParamEditorOrient — right-panel editor for an active orient timeline row.
 *
 * An orient row carries a chain of rules. Per Q3(c-entry) + the append-mode
 * follow-up, the chain in this row is *appended* to the template default
 * orientation of every op below it (until the next orient row).
 *
 * Supported rule types in this slice:
 *   - fixed         (i, j, k)          — fixed tool-axis vector
 *   - lead          (angle_deg)        — lean forward along travel
 *   - lag           (angle_deg)        — lean backward along travel
 *   - side_tilt     (angle_deg)        — tilt sideways across travel
 *   - avoid_collision (max_tilt)       — clamp tilt against machine envelope
 *
 * `to_normal` and `blend` need a surface or sub-rules and are deferred — they
 * remain available in the Python API and templates can use them, but the UI
 * editor does not surface them yet.
 */

import I from "../icons";
import { useOpsStore } from "../../store/opsStore";

const RULE_DEFS = {
  fixed: {
    label: "Fixed axis",
    description: "Pin the tool axis to a fixed (i, j, k) direction.",
    defaults: { x: 0, y: 0, z: -1 },
    fields: [
      { id: "x", label: "I", type: "number", step: 0.1 },
      { id: "y", label: "J", type: "number", step: 0.1 },
      { id: "z", label: "K", type: "number", step: 0.1 },
    ],
  },
  lead: {
    label: "Lead",
    description: "Lean the tool forward along the travel direction.",
    defaults: { angle: 10 },
    fields: [{ id: "angle", label: "Angle", type: "number", unit: "deg" }],
  },
  lag: {
    label: "Lag",
    description: "Lean the tool backward along the travel direction.",
    defaults: { angle: 5 },
    fields: [{ id: "angle", label: "Angle", type: "number", unit: "deg" }],
  },
  side_tilt: {
    label: "Side tilt",
    description: "Tilt the tool sideways across the travel direction.",
    defaults: { angle: 5 },
    fields: [{ id: "angle", label: "Angle", type: "number", unit: "deg" }],
  },
  avoid_collision: {
    label: "Avoid collision",
    description: "Limit tilt to keep the tool clear of the part / machine.",
    defaults: { max_tilt: 20 },
    fields: [{ id: "max_tilt", label: "Max tilt", type: "number", unit: "deg" }],
  },
};

const STYLES = {
  panel: {
    height: "100%",
    background: "var(--panel)",
    border: "1px solid var(--border)",
    borderRadius: "var(--r-lg)",
    boxShadow: "var(--shadow-sm)",
    display: "flex", flexDirection: "column",
    minHeight: 0,
  },
  head: {
    padding: "12px 14px",
    borderBottom: "1px solid var(--border)",
    display: "flex", alignItems: "center", justifyContent: "space-between",
  },
  headTitle: {
    fontSize: 11.5, fontWeight: 600, textTransform: "uppercase",
    letterSpacing: "0.04em", color: "var(--ink-2)",
  },
  iconBtn: {
    width: 24, height: 24,
    display: "flex", alignItems: "center", justifyContent: "center",
    borderRadius: 4, border: "1px solid var(--border)",
    background: "var(--panel)", color: "var(--ink-2)",
    cursor: "pointer",
  },
  body: {
    flex: 1, minHeight: 0, overflowY: "auto",
    display: "flex", flexDirection: "column",
  },
  summary: {
    display: "flex", alignItems: "center", gap: 10,
    padding: "12px 14px",
    borderBottom: "1px solid var(--border)",
  },
  summaryIcon: {
    width: 32, height: 32,
    display: "flex", alignItems: "center", justifyContent: "center",
    borderRadius: 8,
    background: "var(--panel-2)", color: "var(--ink-2)",
    border: "1px solid var(--border)",
  },
  summaryName: { fontSize: 13, fontWeight: 500, color: "var(--ink)" },
  summaryMeta: { fontSize: 11, color: "var(--muted)", marginTop: 2 },

  section: {
    padding: "12px 14px",
    borderBottom: "1px solid var(--border)",
    display: "flex", flexDirection: "column", gap: 8,
  },
  sectionHead: {
    fontSize: 11, fontWeight: 600, color: "var(--ink-2)",
    textTransform: "uppercase", letterSpacing: "0.04em",
    marginBottom: 2,
  },

  rule: {
    border: "1px solid var(--border)",
    borderRadius: "var(--r-md)",
    background: "var(--panel-2)",
    padding: 10,
    display: "flex", flexDirection: "column", gap: 8,
  },
  ruleHead: {
    display: "flex", alignItems: "center", justifyContent: "space-between",
  },
  ruleTitle: { fontSize: 12.5, fontWeight: 500, color: "var(--ink)" },
  ruleSub:   { fontSize: 11, color: "var(--muted)", marginTop: 2 },
  ruleRemove: {
    width: 22, height: 22,
    display: "flex", alignItems: "center", justifyContent: "center",
    border: 0, background: "transparent", color: "var(--muted)",
    cursor: "pointer", borderRadius: 4,
  },

  field: {
    display: "grid",
    gridTemplateColumns: "60px 1fr",
    gap: 6,
    alignItems: "center",
  },
  fieldLabel: {
    fontSize: 11, color: "var(--ink-2)",
    fontFamily: "var(--font-mono)",
  },
  fieldInput: {
    display: "flex", alignItems: "center",
    border: "1px solid var(--border)",
    borderRadius: "var(--r-sm)",
    background: "var(--panel)",
    overflow: "hidden",
  },
  fieldEl: {
    flex: 1, border: 0, outline: "none",
    padding: "5px 8px", fontSize: 12, fontFamily: "var(--font-mono)",
    background: "transparent", color: "var(--ink)",
    textAlign: "right", minWidth: 0,
  },
  fieldUnit: {
    padding: "0 8px",
    fontSize: 11, color: "var(--muted)",
    fontFamily: "var(--font-mono)",
    borderLeft: "1px solid var(--border)",
  },

  empty: {
    padding: "10px 14px",
    fontSize: 12, color: "var(--muted)",
    textAlign: "center",
    border: "1px dashed var(--border)",
    borderRadius: "var(--r-md)",
  },

  addArea: {
    display: "flex", flexDirection: "column", gap: 6,
  },
  addRow: { display: "flex", gap: 6 },
  selectInput: {
    flex: 1,
    border: "1px solid var(--border)",
    borderRadius: "var(--r-sm)",
    background: "var(--panel)",
    color: "var(--ink)",
    padding: "6px 8px",
    fontSize: 12,
    fontFamily: "inherit",
    outline: "none",
  },
  addBtn: {
    display: "flex", alignItems: "center", gap: 4,
    padding: "6px 10px",
    border: "1px solid var(--border)",
    borderRadius: "var(--r-sm)",
    background: "var(--panel)",
    color: "var(--ink)",
    fontSize: 12,
    cursor: "pointer",
  },
  addHint: { fontSize: 10, color: "var(--muted)" },

  preview: {
    padding: "12px 14px",
    background: "var(--panel-2)",
    borderTop: "1px solid var(--border)",
    fontSize: 11, color: "var(--ink-2)",
  },
  previewTitle: {
    fontSize: 10, color: "var(--muted)",
    textTransform: "uppercase", letterSpacing: "0.04em",
    marginBottom: 4,
  },
  previewLine: {
    fontFamily: "var(--font-mono)", fontSize: 11,
    color: "var(--ink-2)",
  },
};

import { useState } from "react";

export default function ParamEditorOrient() {
  const entries          = useOpsStore((s) => s.entries);
  const activeIdx        = useOpsStore((s) => s.activeIdx);
  const addOrientRule    = useOpsStore((s) => s.addOrientRule);
  const removeOrientRule = useOpsStore((s) => s.removeOrientRule);
  const updateOrientRule = useOpsStore((s) => s.updateOrientRule);
  const setRpMode        = useOpsStore((s) => s.setRpMode);

  const [picked, setPicked] = useState("fixed");

  const entry = activeIdx != null ? entries[activeIdx] : null;
  if (!entry || entry.kind !== "orient") return null;

  function add() {
    const def = RULE_DEFS[picked];
    addOrientRule(activeIdx, { type: picked, ...def.defaults });
  }

  return (
    <div style={STYLES.panel}>
      <div style={STYLES.head}>
        <div style={STYLES.headTitle}>Orientation</div>
        <button
          style={STYLES.iconBtn}
          onClick={() => setRpMode("library")}
          title="Back to library"
        >
          <I.x />
        </button>
      </div>

      <div style={STYLES.body}>
        <div style={STYLES.summary}>
          <div style={STYLES.summaryIcon}><I.orient /></div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={STYLES.summaryName}>{entry.label || "Orient"}</div>
            <div style={STYLES.summaryMeta}>
              Applies to ops below · op {String(activeIdx + 1).padStart(2, "0")}
            </div>
          </div>
        </div>

        <div style={STYLES.section}>
          <div style={STYLES.sectionHead}>Rule chain</div>

          {(entry.rules || []).length === 0 && (
            <div style={STYLES.empty}>
              No rules yet — add one below.
            </div>
          )}

          {(entry.rules || []).map((rule, i) => {
            const def = RULE_DEFS[rule.type];
            if (!def) {
              return (
                <div key={i} style={STYLES.rule}>
                  <div style={STYLES.ruleHead}>
                    <div>
                      <div style={STYLES.ruleTitle}>{rule.type}</div>
                      <div style={STYLES.ruleSub}>
                        Editor for this rule type isn't wired yet.
                      </div>
                    </div>
                    <button
                      style={STYLES.ruleRemove}
                      onClick={() => removeOrientRule(activeIdx, i)}
                      title="Remove rule"
                    >
                      <I.trash />
                    </button>
                  </div>
                </div>
              );
            }
            return (
              <div key={i} style={STYLES.rule}>
                <div style={STYLES.ruleHead}>
                  <div>
                    <div style={STYLES.ruleTitle}>{def.label}</div>
                    <div style={STYLES.ruleSub}>{def.description}</div>
                  </div>
                  <button
                    style={STYLES.ruleRemove}
                    onClick={() => removeOrientRule(activeIdx, i)}
                    title="Remove rule"
                  >
                    <I.trash />
                  </button>
                </div>
                {def.fields.map((f) => (
                  <div key={f.id} style={STYLES.field}>
                    <span style={STYLES.fieldLabel}>{f.label}</span>
                    <div style={STYLES.fieldInput}>
                      <input
                        type="number"
                        step={f.step ?? "any"}
                        value={rule[f.id]}
                        onChange={(e) =>
                          updateOrientRule(activeIdx, i, {
                            [f.id]: parseFloat(e.target.value) || 0,
                          })
                        }
                        style={STYLES.fieldEl}
                      />
                      {f.unit && <span style={STYLES.fieldUnit}>{f.unit}</span>}
                    </div>
                  </div>
                ))}
              </div>
            );
          })}

          <div style={STYLES.addArea}>
            <div style={STYLES.addRow}>
              <select
                value={picked}
                onChange={(e) => setPicked(e.target.value)}
                style={STYLES.selectInput}
              >
                {Object.entries(RULE_DEFS).map(([k, d]) => (
                  <option key={k} value={k}>{d.label}</option>
                ))}
              </select>
              <button type="button" onClick={add} style={STYLES.addBtn}>
                <I.plus /> Add
              </button>
            </div>
            <div style={STYLES.addHint}>
              Rules apply in order, on top of each op's template-default orientation.
            </div>
          </div>
        </div>
      </div>

      <div style={STYLES.preview}>
        <div style={STYLES.previewTitle}>Generated chain</div>
        {(entry.rules || []).length === 0 ? (
          <div style={STYLES.previewLine}>(no rules)</div>
        ) : (
          (entry.rules || []).map((r, i) => (
            <div key={i} style={STYLES.previewLine}>
              .orient({rulePreview(r)})
            </div>
          ))
        )}
      </div>
    </div>
  );
}

function rulePreview(rule) {
  switch (rule.type) {
    case "fixed":           return `fixed(${num(rule.x)}, ${num(rule.y)}, ${num(rule.z)})`;
    case "lead":            return `lead(${num(rule.angle)})`;
    case "lag":             return `lag(${num(rule.angle)})`;
    case "side_tilt":       return `side_tilt(${num(rule.angle)})`;
    case "avoid_collision": return `avoid_collision(max_tilt=${num(rule.max_tilt)})`;
    default:                return rule.type;
  }
}

function num(v) {
  if (v == null) return "0";
  return Number.isInteger(v) ? String(v) : v.toFixed(2);
}
