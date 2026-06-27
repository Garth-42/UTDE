/**
 * MeasurePanel — a Utilities section for reading the XYZ location of an
 * edge/point. Toggle it on, click an edge (or face point), and the readout
 * shows the picked world coordinate (and, when a workspace origin is set, the
 * WCS-relative coordinate) plus the edge's endpoints / center / length /
 * radius. The 3D marker is rendered by StepViewport.
 */

import { useStepStore } from "../../store/stepStore";
import CollapsibleSection from "./CollapsibleSection";

const fmt = (n) => (n == null || Number.isNaN(n) ? "—" : n.toFixed(2));
const vec = (p) => (p ? `${fmt(p[0])}, ${fmt(p[1])}, ${fmt(p[2])}` : "—");

const STYLES = {
  btn: (active) => ({
    padding: "5px 8px",
    border: `1px solid ${active ? "#0e7490" : "var(--border)"}`,
    background: active ? "#22d3ee" : "var(--panel)",
    color: active ? "#06343d" : "var(--ink-2)",
    borderRadius: "var(--r-sm)", fontSize: 11, cursor: "pointer",
  }),
  readout: { display: "flex", flexDirection: "column", gap: 3 },
  row: { display: "flex", gap: 8 },
  label: { width: 52, color: "var(--muted)" },
  value: { flex: 1, fontFamily: "var(--font-mono)", color: "var(--ink)", textAlign: "right" },
  clear: {
    marginTop: 4, padding: "3px 6px", border: "1px solid var(--border)",
    background: "var(--panel)", color: "var(--ink-2)",
    borderRadius: "var(--r-sm)", fontSize: 11, cursor: "pointer",
  },
};

function Row({ label, value }) {
  return (
    <div style={STYLES.row}>
      <span style={STYLES.label}>{label}</span>
      <span style={STYLES.value}>{value}</span>
    </div>
  );
}

export default function MeasurePanel() {
  const faces            = useStepStore((s) => s.faces);
  const edges            = useStepStore((s) => s.edges);
  const measuring        = useStepStore((s) => s.measuring);
  const measurement      = useStepStore((s) => s.measurement);
  const startMeasure     = useStepStore((s) => s.startMeasure);
  const stopMeasure      = useStepStore((s) => s.stopMeasure);
  const clearMeasurement = useStepStore((s) => s.clearMeasurement);
  const workspaceOrigin  = useStepStore((s) => s.workspaceOrigin);

  if ((faces?.length || 0) + (edges?.length || 0) === 0) return null;

  const m = measurement;
  const rel = m && workspaceOrigin
    ? [m.point[0] - workspaceOrigin.x, m.point[1] - workspaceOrigin.y, m.point[2] - workspaceOrigin.z]
    : null;
  const s = m?.summary || {};

  return (
    <CollapsibleSection title="Measure">
      <button
        type="button"
        style={STYLES.btn(measuring)}
        aria-pressed={measuring}
        onClick={() => (measuring ? stopMeasure() : startMeasure())}
      >
        {measuring ? "Measuring… (Esc to stop)" : "Measure location"}
      </button>

      {m && (
        <div style={STYLES.readout}>
          <Row label="World" value={vec(m.point)} />
          {rel && <Row label="WCS" value={vec(rel)} />}
          {s.type && <Row label="Type" value={s.type} />}
          {s.start && <Row label="Start" value={vec(s.start)} />}
          {s.end && <Row label="End" value={vec(s.end)} />}
          {s.center && <Row label="Center" value={vec(s.center)} />}
          {s.radius != null && <Row label="Radius" value={fmt(s.radius)} />}
          {s.length != null && <Row label="Length" value={fmt(s.length)} />}
          <button type="button" style={STYLES.clear} onClick={clearMeasurement}>
            Clear
          </button>
        </div>
      )}
    </CollapsibleSection>
  );
}
