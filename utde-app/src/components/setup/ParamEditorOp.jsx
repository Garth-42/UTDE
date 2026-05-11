/**
 * ParamEditorOp — right-panel parameter editor for an active op entry.
 *
 * Reads the active op from opsStore, looks up its template metadata, and
 * renders three sections:
 *   - Geometry slots (one per template `requires`; click re-enters pick mode)
 *   - Parameters (dynamic fields keyed by param.type)
 *   - Preview strip (est_time / est_volume / total picks)
 *
 * Returning to the library is via the close (×) button.
 */

import { useState } from "react";
import I from "../icons";
import { useOpsStore } from "../../store/opsStore";
import { useUiStore } from "../../store/uiStore";
import { useToolpathStore } from "../../store/toolpathStore";
import { getTemplate } from "../../lib/templateLoader";
import { previewActiveOp } from "../../lib/timelineCompiler";
import { kindMeta } from "./LibraryPanel";

const STYLES = {
  panel: {
    height: "100%",
    background: "var(--panel)",
    border: "1px solid var(--border)",
    borderRadius: "var(--r-lg)",
    boxShadow: "var(--shadow-sm)",
    display: "flex",
    flexDirection: "column",
    minHeight: 0,
  },
  head: {
    padding: "12px 14px",
    borderBottom: "1px solid var(--border)",
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
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
  summaryIcon: (accent, soft) => ({
    width: 32, height: 32,
    display: "flex", alignItems: "center", justifyContent: "center",
    borderRadius: 8,
    background: soft, color: accent, flexShrink: 0,
  }),
  summaryName:  { fontSize: 13, fontWeight: 500, color: "var(--ink)" },
  summaryMeta:  { fontSize: 11, color: "var(--muted)", marginTop: 2 },

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

  slot: (filled) => ({
    display: "flex", alignItems: "center", gap: 10,
    padding: "8px 10px",
    border: filled
      ? "1px solid var(--sel)"
      : "1px dashed var(--border-strong)",
    borderRadius: "var(--r-md)",
    background: filled ? "var(--sel-soft)" : "transparent",
    cursor: "pointer",
  }),
  slotSwatch: (filled) => ({
    width: 14, height: 14,
    borderRadius: "50%",
    background: filled ? "var(--sel)" : "transparent",
    border: filled ? "none" : "1.5px dashed var(--muted-2)",
    flexShrink: 0,
  }),
  slotLabel: { fontSize: 12, color: "var(--ink)" },
  slotMeta:  { fontSize: 11, color: "var(--muted)", marginTop: 2 },
  slotPicked: {
    fontFamily: "var(--font-mono)",
    fontSize: 11,
    color: "var(--ink-2)",
    marginLeft: "auto",
    whiteSpace: "nowrap",
  },
  slotPlaceholder: {
    fontFamily: "var(--font-mono)",
    fontSize: 11,
    color: "var(--muted)",
    marginLeft: "auto",
    whiteSpace: "nowrap",
  },

  field: {
    display: "grid",
    gridTemplateColumns: "1fr 110px",
    gap: 8,
    alignItems: "center",
  },
  fieldFull: { display: "grid", gridTemplateColumns: "1fr", gap: 4 },
  label:     { fontSize: 12, color: "var(--ink-2)" },
  hint:      { fontSize: 10, color: "var(--muted)", marginLeft: 6, fontWeight: 400 },
  input: {
    display: "flex", alignItems: "center",
    border: "1px solid var(--border)",
    borderRadius: "var(--r-sm)",
    background: "var(--panel-2)",
    overflow: "hidden",
  },
  inputEl: {
    flex: 1, border: 0, outline: "none",
    padding: "5px 8px", fontSize: 12, fontFamily: "var(--font-mono)",
    background: "transparent", color: "var(--ink)",
    textAlign: "right",
    minWidth: 0,
  },
  unit: {
    padding: "0 8px",
    fontSize: 11, color: "var(--muted)",
    fontFamily: "var(--font-mono)",
    borderLeft: "1px solid var(--border)",
  },
  selectEl: {
    flex: 1, border: 0, outline: "none",
    padding: "5px 8px", fontSize: 12, fontFamily: "var(--font-mono)",
    background: "transparent", color: "var(--ink)",
    width: "100%",
  },
  seg: {
    display: "flex", padding: 2,
    background: "var(--panel-2)",
    border: "1px solid var(--border)",
    borderRadius: "var(--r-sm)",
    gap: 2,
  },
  segBtn: (active) => ({
    flex: 1,
    padding: "4px 8px",
    border: 0,
    borderRadius: 4,
    background: active ? "var(--panel)" : "transparent",
    color: active ? "var(--ink)" : "var(--ink-2)",
    fontSize: 11,
    cursor: "pointer",
    boxShadow: active ? "var(--shadow-sm)" : "none",
  }),

  previewSection: {
    padding: "12px 14px",
    borderBottom: "1px solid var(--border)",
    display: "flex", flexDirection: "column", gap: 8,
  },
  previewBtn: (busy) => ({
    display: "flex", alignItems: "center", justifyContent: "center", gap: 6,
    padding: "8px 12px",
    border: "1px solid var(--ink)",
    background: "var(--ink)",
    color: "var(--panel)",
    borderRadius: "var(--r-sm)",
    fontSize: 12, fontWeight: 500,
    cursor: busy ? "wait" : "pointer",
    opacity: busy ? 0.7 : 1,
    width: "100%",
  }),
  previewHint: { fontSize: 11, color: "var(--muted)" },
  previewErr:  { fontSize: 11, color: "var(--warn)" },

  preview: {
    display: "grid", gridTemplateColumns: "repeat(3, 1fr)",
    gap: 10, padding: "12px 14px",
    background: "var(--panel-2)",
    borderTop: "1px solid var(--border)",
  },
  stat: { display: "flex", flexDirection: "column", gap: 2 },
  statValue: { fontSize: 13, fontWeight: 600, color: "var(--ink)", fontFamily: "var(--font-mono)" },
  statLabel: { fontSize: 10, color: "var(--muted)", textTransform: "uppercase", letterSpacing: "0.04em" },

  empty: {
    flex: 1,
    display: "flex", flexDirection: "column",
    alignItems: "center", justifyContent: "center",
    gap: 8,
    color: "var(--muted)",
    fontSize: 12,
    padding: 20,
  },
};

export default function ParamEditorOp() {
  const entries     = useOpsStore((s) => s.entries);
  const activeIdx   = useOpsStore((s) => s.activeIdx);
  const updateParam = useOpsStore((s) => s.updateParam);
  const setRpMode   = useOpsStore((s) => s.setRpMode);
  const setPromptSlot = useOpsStore((s) => s.setPromptSlot);
  const cancelPrompt  = useOpsStore((s) => s.cancelPrompt);
  const setFilter   = useUiStore((s) => s.setFilter);
  const isCompiling = useToolpathStore((s) => s.isCompiling);

  const [previewError, setPreviewError] = useState(null);

  async function runPreview() {
    setPreviewError(null);
    try {
      await previewActiveOp();
    } catch (err) {
      setPreviewError(err?.message || String(err));
    }
  }

  const op = activeIdx != null ? entries[activeIdx] : null;

  if (!op || op.kind !== "op") {
    return (
      <div style={STYLES.panel}>
        <div style={STYLES.head}>
          <div style={STYLES.headTitle}>Parameters</div>
        </div>
        <div style={STYLES.empty}>
          <I.cube />
          <div>No operation selected</div>
          <div style={{ fontSize: 11, color: "var(--muted-2)", textAlign: "center" }}>
            Pick an op from the library or timeline to edit its parameters.
          </div>
        </div>
      </div>
    );
  }

  const meta = getTemplate(op.templateId) || {};
  const IconCmp = I[meta.icon] || I.op;
  const km = kindMeta(meta.kind);

  const totalPicks = (op.geometry || []).reduce((n, slot) => n + slot.length, 0);

  function pickSlot(slotIdx) {
    const req = (meta.requires || [])[slotIdx];
    if (req?.type) setFilter(req.type);
    setPromptSlot({ entryIdx: activeIdx, slotIdx });
  }

  function close() {
    setRpMode("library");
    cancelPrompt();
  }

  return (
    <div style={STYLES.panel}>
      <div style={STYLES.head}>
        <div style={STYLES.headTitle}>Parameters</div>
        <button style={STYLES.iconBtn} onClick={close} title="Back to library">
          <I.x />
        </button>
      </div>

      <div style={STYLES.body}>
        <div style={STYLES.summary}>
          <div style={STYLES.summaryIcon(km.accent, km.soft)}>
            <IconCmp />
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={STYLES.summaryName}>{op.name || meta.label || op.templateId}</div>
            <div style={STYLES.summaryMeta}>
              {km.label} · op {String(activeIdx + 1).padStart(2, "0")}
            </div>
          </div>
        </div>

        {meta.requires?.length > 0 && (
          <div style={STYLES.section}>
            <div style={STYLES.sectionHead}>Geometry</div>
            {meta.requires.map((req, i) => {
              const picks = op.geometry?.[i] || [];
              const filled = picks.length > 0;
              return (
                <div
                  key={i}
                  style={STYLES.slot(filled)}
                  onClick={() => pickSlot(i)}
                  role="button"
                >
                  <span style={STYLES.slotSwatch(filled)} />
                  <div>
                    <div style={STYLES.slotLabel}>{req.label}</div>
                    <div style={STYLES.slotMeta}>
                      {req.type}{req.count === 0 ? " · multi" : " · 1"}
                    </div>
                  </div>
                  {filled
                    ? <span style={STYLES.slotPicked}>{picks.join(", ")}</span>
                    : <span style={STYLES.slotPlaceholder}>Click to pick →</span>}
                </div>
              );
            })}
          </div>
        )}

        {meta.params?.length > 0 && (
          <div style={STYLES.section}>
            <div style={STYLES.sectionHead}>Parameters</div>
            {meta.params.map((p) => (
              <ParamField
                key={p.id}
                param={p}
                value={op.params[p.id] ?? p.default}
                onChange={(v) => updateParam(activeIdx, p.id, v)}
              />
            ))}
          </div>
        )}

        <div style={STYLES.previewSection}>
          <div style={STYLES.sectionHead}>Preview</div>
          <button
            type="button"
            style={STYLES.previewBtn(isCompiling)}
            disabled={isCompiling}
            onClick={runPreview}
            title="Compile this op in isolation and render the toolpath in the viewport"
          >
            <I.play />
            <span>{isCompiling ? "Compiling…" : "Preview toolpath"}</span>
          </button>
          {previewError ? (
            <div style={STYLES.previewErr}>{previewError}</div>
          ) : (
            <div style={STYLES.previewHint}>
              Runs this op alone (plus any orient rows above it) and shows the
              result in the 3D view without switching tabs.
            </div>
          )}
        </div>
      </div>

      <div style={STYLES.preview}>
        <div style={STYLES.stat}>
          <div style={STYLES.statValue}>
            {meta.est_time != null ? `${meta.est_time.toFixed(1)} min` : "—"}
          </div>
          <div style={STYLES.statLabel}>est. cycle</div>
        </div>
        <div style={STYLES.stat}>
          <div style={STYLES.statValue}>
            {meta.est_volume != null ? `${meta.est_volume.toFixed(2)} cm³` : "—"}
          </div>
          <div style={STYLES.statLabel}>
            {meta.kind === "sub" ? "removed" : "added"}
          </div>
        </div>
        <div style={STYLES.stat}>
          <div style={STYLES.statValue}>{totalPicks}</div>
          <div style={STYLES.statLabel}>picks</div>
        </div>
      </div>
    </div>
  );
}

function ParamField({ param, value, onChange }) {
  if (param.type === "number") {
    return (
      <div style={STYLES.field}>
        <label style={STYLES.label}>
          {param.label || param.id}
          {param.hint && <span style={STYLES.hint}>{param.hint}</span>}
        </label>
        <div style={STYLES.input}>
          <input
            type="number"
            step="any"
            value={value}
            onChange={(e) => onChange(parseFloat(e.target.value) || 0)}
            style={STYLES.inputEl}
          />
          {param.unit && <span style={STYLES.unit}>{param.unit}</span>}
        </div>
      </div>
    );
  }

  if (param.type === "select") {
    return (
      <div style={STYLES.fieldFull}>
        <label style={STYLES.label}>{param.label || param.id}</label>
        <div style={STYLES.input}>
          <select
            value={value}
            onChange={(e) => onChange(e.target.value)}
            style={STYLES.selectEl}
          >
            {(param.options || []).map((o) => (
              <option key={o} value={o}>{o}</option>
            ))}
          </select>
        </div>
      </div>
    );
  }

  if (param.type === "segment") {
    return (
      <div style={STYLES.field}>
        <label style={STYLES.label}>{param.label || param.id}</label>
        <div style={STYLES.seg}>
          {(param.options || []).map((o) => (
            <button
              key={o}
              type="button"
              onClick={() => onChange(o)}
              style={STYLES.segBtn(value === o)}
            >
              {o}
            </button>
          ))}
        </div>
      </div>
    );
  }

  return null;
}

