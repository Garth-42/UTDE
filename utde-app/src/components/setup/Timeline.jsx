/**
 * Timeline — left-column entry list for the Setup tab.
 *
 * Renders the ordered list of timeline entries from opsStore. Two row kinds:
 *   - "op"     — TimelineOpRow:    template icon, name, geometry chip, est_time
 *   - "orient" — TimelineOrientRow: compass icon, "Orient", rule-count chip
 *
 * Supports HTML5 drag-to-reorder, click-to-activate, visibility toggle.
 * Bottom shows "+ Add operation" (switches rpMode to library) and "+ Add orient"
 * (creates a new orient row), then a cycle summary aggregating est_time/volume.
 */

import { useState } from "react";
import I from "../icons";
import { useOpsStore } from "../../store/opsStore";
import { useTemplates } from "../../lib/templateLoader";
import { useStepStore } from "../../store/stepStore";
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
    padding: "10px 12px", display: "flex", flexDirection: "column", gap: 8,
  },

  divider: {
    fontSize: 10, fontWeight: 600,
    textTransform: "uppercase", letterSpacing: "0.04em",
    color: "var(--muted)",
    padding: "10px 4px 4px",
  },

  row: ({ active, dragging, dropTarget }) => ({
    display: "flex", alignItems: "center", gap: 6,
    padding: "8px 8px",
    border: dropTarget
      ? "1px dashed var(--sel)"
      : active
        ? "1px dashed var(--sel)"
        : "1px solid transparent",
    background: active ? "var(--sel-soft)" : "var(--panel)",
    borderRadius: "var(--r-md)",
    cursor: "pointer",
    opacity: dragging ? 0.5 : 1,
    transition: "background 0.12s, border-color 0.12s",
  }),
  grip: {
    color: "var(--muted-2)", display: "flex", alignItems: "center",
    cursor: "grab",
  },
  num: {
    fontSize: 11, color: "var(--muted)",
    fontFamily: "var(--font-mono)",
    width: 18, textAlign: "right", flexShrink: 0,
  },
  rowBody: {
    flex: 1, minWidth: 0,
    display: "flex", flexDirection: "column", gap: 2,
  },
  rowName: {
    display: "flex", alignItems: "center", gap: 6,
    fontSize: 12.5, fontWeight: 500, color: "var(--ink)",
    minWidth: 0,
  },
  rowMeta: {
    display: "flex", alignItems: "center", gap: 6,
    fontSize: 11, color: "var(--muted)",
  },
  smallIcon: (accent, soft) => ({
    width: 18, height: 18, borderRadius: 4,
    display: "flex", alignItems: "center", justifyContent: "center",
    background: soft, color: accent,
    flexShrink: 0,
  }),
  chip: {
    padding: "1px 6px",
    borderRadius: 3,
    background: "var(--panel-2)",
    border: "1px solid var(--border)",
    fontSize: 10,
    color: "var(--ink-2)",
  },
  monoChip: { fontFamily: "var(--font-mono)" },
  visBtn: (visible) => ({
    width: 22, height: 22,
    display: "flex", alignItems: "center", justifyContent: "center",
    borderRadius: 4, border: 0,
    background: "transparent", color: visible ? "var(--ink-2)" : "var(--muted-2)",
    cursor: "pointer",
  }),
  removeBtn: {
    width: 22, height: 22,
    display: "flex", alignItems: "center", justifyContent: "center",
    borderRadius: 4, border: 0,
    background: "transparent", color: "var(--muted)",
    cursor: "pointer",
  },

  addBtn: {
    display: "flex", alignItems: "center", justifyContent: "center", gap: 6,
    padding: "8px 10px",
    background: "transparent",
    border: "1px dashed var(--border-strong)",
    borderRadius: "var(--r-md)",
    color: "var(--ink-2)", fontSize: 12,
    cursor: "pointer",
    width: "100%",
  },

  summary: {
    marginTop: 8,
    padding: "10px 12px",
    background: "var(--panel-2)",
    border: "1px solid var(--border)",
    borderRadius: "var(--r-md)",
    display: "flex", flexDirection: "column", gap: 6,
    fontSize: 11.5, color: "var(--ink-2)",
  },
  summaryRow: {
    display: "flex", justifyContent: "space-between",
    alignItems: "baseline", gap: 8,
  },
  summaryLabel: { color: "var(--muted)", whiteSpace: "nowrap" },
  summaryValue: {
    fontFamily: "var(--font-mono)",
    fontWeight: 600,
    whiteSpace: "nowrap",
  },
};

export default function Timeline() {
  const entries     = useOpsStore((s) => s.entries);
  const activeIdx   = useOpsStore((s) => s.activeIdx);
  const pickActive  = useOpsStore((s) => s.pickActive);
  const reorder     = useOpsStore((s) => s.reorder);
  const remove      = useOpsStore((s) => s.remove);
  const toggleVis   = useOpsStore((s) => s.toggleVis);
  const setRpMode   = useOpsStore((s) => s.setRpMode);

  const { templates } = useTemplates();
  const tplById = Object.fromEntries(templates.map((t) => [t.id, t]));
  const fileName = useStepStore((s) => s.fileName);

  const [dragIdx, setDragIdx] = useState(null);
  const [dropIdx, setDropIdx] = useState(null);

  function onDragStart(e, idx) {
    setDragIdx(idx);
    e.dataTransfer.effectAllowed = "move";
    try { e.dataTransfer.setData("text/plain", String(idx)); } catch { /* ignore */ }
  }
  function onDragOver(e, idx) { e.preventDefault(); setDropIdx(idx); }
  function onDrop(e, idx)     {
    e.preventDefault();
    if (dragIdx == null) return;
    reorder(dragIdx, idx);
    setDragIdx(null); setDropIdx(null);
  }
  function onDragEnd() { setDragIdx(null); setDropIdx(null); }

  return (
    <div style={STYLES.panel}>
      <div style={STYLES.head}>
        <div style={STYLES.headTitle}>Setup &amp; Operations</div>
        <div style={{ display: "flex", gap: 4 }}>
          <button style={STYLES.iconBtn} title="Import"><I.upload /></button>
          <button style={STYLES.iconBtn} title="Export"><I.download /></button>
        </div>
      </div>

      <div style={STYLES.body}>
        <div style={STYLES.divider}>Operations · {entries.length}</div>

        {entries.map((entry, idx) => (
          <Row
            key={entry.uid}
            entry={entry}
            idx={idx}
            active={activeIdx === idx}
            dragging={dragIdx === idx}
            dropTarget={dropIdx === idx && dragIdx != null && dragIdx !== idx}
            template={tplById[entry.templateId]}
            fileName={fileName}
            onPick={() => pickActive(idx)}
            onToggleVis={(e) => { e.stopPropagation(); toggleVis(idx); }}
            onRemove={(e)    => { e.stopPropagation(); remove(idx); }}
            onDragStart={onDragStart}
            onDragOver={onDragOver}
            onDrop={onDrop}
            onDragEnd={onDragEnd}
          />
        ))}

        <button
          type="button"
          style={STYLES.addBtn}
          onClick={() => setRpMode("library")}
        >
          <I.plus /> <span>Add operation</span>
        </button>


        {entries.length > 0 && <CycleSummary entries={entries} tplById={tplById} />}
      </div>
    </div>
  );
}

function Row({
  entry, idx, active, dragging, dropTarget, template, fileName,
  onPick, onToggleVis, onRemove,
  onDragStart, onDragOver, onDrop, onDragEnd,
}) {
  let Icon, km, name, meta;

  if (entry.kind === "scene") {
    km   = kindMeta("scene");
    Icon = entry.action === "import" ? I.cube : I.x;
    name = entry.name || (entry.action === "import" ? "Import CAD" : "Clear part");
    meta = buildSceneMeta(entry, fileName);
  } else if (entry.kind === "orient") {
    km   = kindMeta("orient");
    Icon = I.orient;
    name = entry.label || "Orient";
    meta = buildOrientMeta(entry);
  } else {
    km   = kindMeta(template?.kind);
    Icon = I[template?.icon] || I.op;
    name = entry.name || template?.label || entry.templateId;
    meta = buildOpMeta(entry, template);
  }

  return (
    <div
      draggable
      onDragStart={(e) => onDragStart(e, idx)}
      onDragOver={(e)  => onDragOver(e, idx)}
      onDrop={(e)      => onDrop(e, idx)}
      onDragEnd={onDragEnd}
      onClick={onPick}
      style={STYLES.row({ active, dragging, dropTarget })}
    >
      <span style={STYLES.grip}><I.grip /></span>
      <span className="mono" style={STYLES.num}>
        {String(idx + 1).padStart(2, "0")}
      </span>
      <div style={STYLES.rowBody}>
        <div style={STYLES.rowName}>
          <span style={STYLES.smallIcon(km.accent, km.soft)}>
            <Icon />
          </span>
          <span style={{
            overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
          }}>{name}</span>
        </div>
        <div style={STYLES.rowMeta}>{meta}</div>
      </div>
      <button
        type="button"
        style={STYLES.visBtn(entry.visible)}
        onClick={onToggleVis}
        title={entry.visible ? "Hide" : "Show"}
      >
        {entry.visible ? <I.eye /> : <I.eyeOff />}
      </button>
      <button
        type="button"
        style={STYLES.removeBtn}
        onClick={onRemove}
        title="Remove from timeline"
        aria-label={`Remove ${name}`}
      >
        <I.trash />
      </button>
    </div>
  );
}

function buildOpMeta(entry, template) {
  const total = (entry.geometry || []).reduce((n, slot) => n + slot.length, 0);
  const reqType = template?.requires?.[0]?.type;
  const chipText = total > 0
    ? entry.geomSummary || `${reqType} × ${total}`
    : reqType ? `${reqType} · none` : "no geometry";
  const time = template?.est_time != null ? `${template.est_time.toFixed(1)} min` : "";
  return (
    <>
      <span style={STYLES.chip}>{chipText}</span>
      {time && (
        <span className="mono" style={{ ...STYLES.chip, ...STYLES.monoChip }}>
          {time}
        </span>
      )}
    </>
  );
}

function buildSceneMeta(entry, fileName) {
  if (entry.action === "import") {
    return (
      <span className="mono" style={STYLES.chip}>
        {fileName || "no file"}
      </span>
    );
  }
  if (entry.action === "clear") {
    return <span style={STYLES.chip}>wipes build area</span>;
  }
  return <span style={STYLES.chip}>{entry.action}</span>;
}

function buildOrientMeta(entry) {
  const n = entry.rules?.length || 0;
  return (
    <span style={STYLES.chip}>
      {n === 0 ? "no rules" : `${n} rule${n === 1 ? "" : "s"}`}
    </span>
  );
}

function CycleSummary({ entries, tplById }) {
  let totalTime = 0, removed = 0, deposited = 0;
  for (const e of entries) {
    if (e.kind !== "op") continue;
    const t = tplById[e.templateId];
    if (!t) continue;
    totalTime += t.est_time   || 0;
    if (t.kind === "sub") removed += t.est_volume || 0;
    if (t.kind === "add" || t.kind === "hyb") deposited += t.est_volume || 0;
  }
  return (
    <div style={STYLES.summary}>
      <div style={STYLES.summaryRow}>
        <span style={STYLES.summaryLabel}>Total cycle</span>
        <span style={STYLES.summaryValue}>{totalTime.toFixed(1)} min</span>
      </div>
      <div style={STYLES.summaryRow}>
        <span style={STYLES.summaryLabel}>Removed</span>
        <span style={STYLES.summaryValue}>{removed.toFixed(1)} cm³</span>
      </div>
      <div style={STYLES.summaryRow}>
        <span style={STYLES.summaryLabel}>Deposited</span>
        <span style={STYLES.summaryValue}>{deposited.toFixed(1)} cm³</span>
      </div>
    </div>
  );
}
