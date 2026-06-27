/**
 * WorkpiecePanel — overlay (top-right of the Setup viewport) for re-orienting
 * and translating the imported part. Re-poses the geometry non-destructively in
 * stepStore.transform; generated toolpaths follow the pose automatically.
 *
 *   - Align face → bed: lay the single selected planar face flat on Z=0 (down).
 *   - Drop to bed:       translate so the lowest point sits on Z=0.
 *   - Move / Rotate:     toggle the in-viewport drag gizmo.
 *   - Numeric Move XYZ + Rotate-Z (relative); Reset → identity.
 */

import { useState } from "react";
import { useStepStore } from "../../store/stepStore";
import CollapsibleSection from "./CollapsibleSection";

const STYLES = {
  row: { display: "flex", gap: 6 },
  btn: (active) => ({
    flex: 1, padding: "5px 6px",
    border: `1px solid ${active ? "var(--ink)" : "var(--border)"}`,
    background: active ? "var(--ink)" : "var(--panel)",
    color: active ? "var(--panel)" : "var(--ink-2)",
    borderRadius: "var(--r-sm)", fontSize: 11, cursor: "pointer",
  }),
  btnDisabled: { opacity: 0.45, cursor: "not-allowed" },
  axisRow: { display: "flex", alignItems: "center", gap: 6 },
  axisLabel: { width: 14, color: "var(--muted)", fontFamily: "var(--font-mono)" },
  num: {
    flex: 1, width: "100%", minWidth: 0, padding: "3px 6px",
    border: "1px solid var(--border)", borderRadius: "var(--r-sm)",
    background: "var(--panel-2)", color: "var(--ink)",
    fontFamily: "var(--font-mono)", fontSize: 11,
  },
  hint: { fontSize: 10, color: "var(--muted)" },
  sep: { height: 1, background: "var(--border)", margin: "2px 0" },
};

const r2 = (n) => Math.round((n + Number.EPSILON) * 100) / 100;

export default function WorkpiecePanel() {
  const faces           = useStepStore((s) => s.faces);
  const selectedFaceIds = useStepStore((s) => s.selectedFaceIds);
  const transform       = useStepStore((s) => s.transform);
  const gizmoMode       = useStepStore((s) => s.gizmoMode);
  const orientToBed     = useStepStore((s) => s.orientSelectedFaceToBed);
  const dropToBed       = useStepStore((s) => s.dropToBed);
  const resetTransform  = useStepStore((s) => s.resetTransform);
  const setTranslation  = useStepStore((s) => s.setTranslation);
  const rotateZ         = useStepStore((s) => s.rotateTransformZ);
  const setGizmoMode    = useStepStore((s) => s.setGizmoMode);

  const [rotStep, setRotStep] = useState(90);

  if (!faces || faces.length === 0) return null;

  const planarSelected =
    faces.filter((f) => selectedFaceIds.has(f.id) && f.type === "plane").length === 1;

  const [tx, ty, tz] = transform.translation;
  const moveAxis = (axis) => (e) => {
    const v = parseFloat(e.target.value);
    setTranslation({ [axis]: Number.isFinite(v) ? v : 0 });
  };

  return (
    <CollapsibleSection title="Workpiece">
      <button
        type="button"
        style={{ ...STYLES.btn(false), ...(planarSelected ? {} : STYLES.btnDisabled) }}
        disabled={!planarSelected}
        onClick={() => orientToBed()}
        title="Lay the selected planar face flat on the bed (face-down)"
      >
        Align face → bed
      </button>
      {!planarSelected && (
        <div style={STYLES.hint}>Select one planar face to align.</div>
      )}

      <div style={STYLES.row}>
        <button type="button" style={STYLES.btn(false)} onClick={() => dropToBed()}>
          Drop to bed
        </button>
        <button type="button" style={STYLES.btn(false)} onClick={() => resetTransform()}>
          Reset
        </button>
      </div>

      <div style={STYLES.sep} />

      <div style={STYLES.row}>
        <button
          type="button"
          style={STYLES.btn(gizmoMode === "translate")}
          aria-pressed={gizmoMode === "translate"}
          onClick={() => setGizmoMode(gizmoMode === "translate" ? "off" : "translate")}
        >
          Move
        </button>
        <button
          type="button"
          style={STYLES.btn(gizmoMode === "rotate")}
          aria-pressed={gizmoMode === "rotate"}
          onClick={() => setGizmoMode(gizmoMode === "rotate" ? "off" : "rotate")}
        >
          Rotate
        </button>
      </div>

      {[["X", tx, "x"], ["Y", ty, "y"], ["Z", tz, "z"]].map(([label, val, axis]) => (
        <div key={axis} style={STYLES.axisRow}>
          <span style={STYLES.axisLabel}>{label}</span>
          <input
            type="number"
            step={1}
            value={r2(val)}
            onChange={moveAxis(axis)}
            style={STYLES.num}
            aria-label={`Move ${label}`}
          />
        </div>
      ))}

      <div style={STYLES.axisRow}>
        <span style={STYLES.axisLabel}>Rz</span>
        <input
          type="number"
          step={15}
          value={rotStep}
          onChange={(e) => setRotStep(parseFloat(e.target.value) || 0)}
          style={STYLES.num}
          aria-label="Rotate Z degrees"
        />
        <button type="button" style={STYLES.btn(false)} onClick={() => rotateZ(-rotStep)} title="Rotate −">⟲</button>
        <button type="button" style={STYLES.btn(false)} onClick={() => rotateZ(rotStep)} title="Rotate +">⟳</button>
      </div>
    </CollapsibleSection>
  );
}
