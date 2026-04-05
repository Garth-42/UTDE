import { useStepStore } from "../../store/stepStore";
import { S } from "../styles";

const MODE_OPTIONS = [
  { value: "none",       label: "None" },
  { value: "point",      label: "Pick Point on Edge" },
  { value: "centroid",   label: "XY Centroid" },
  { value: "front_left", label: "Front Left (X-min, Y-min)" },
];

const AXIS_COLORS = { x: "#e53535", y: "#16a34a", z: "#6355e0" };

function CoordDisplay({ origin, highlightZ }) {
  if (!origin) return null;
  return (
    <div style={{ display: "flex", gap: 6, marginTop: 6 }}>
      {["x", "y", "z"].map((ax) => (
        <div key={ax} style={{
          flex: 1, background: "#f4f4fa",
          border: `1px solid ${highlightZ && ax === "z" ? "#d97706" : AXIS_COLORS[ax] + "55"}`,
          borderRadius: 6, padding: "4px 6px", textAlign: "center",
        }}>
          <div style={{ fontSize: 9, color: highlightZ && ax === "z" ? "#d97706" : AXIS_COLORS[ax], marginBottom: 2 }}>
            {ax.toUpperCase()}
          </div>
          <div style={{ fontSize: 10, color: "#1a1a2e" }}>{origin[ax].toFixed(3)}</div>
        </div>
      ))}
    </div>
  );
}

export default function OriginPanel() {
  const originMode        = useStepStore((s) => s.originMode);
  const workspaceOrigin   = useStepStore((s) => s.workspaceOrigin);
  const pickingOrigin     = useStepStore((s) => s.pickingOrigin);
  const pickingZOrigin    = useStepStore((s) => s.pickingZOrigin);
  const zOverrideActive   = useStepStore((s) => s.zOverrideActive);
  const setOriginMode     = useStepStore((s) => s.setOriginMode);
  const cancelPickOrigin  = useStepStore((s) => s.cancelPickOrigin);
  const startPickZOrigin  = useStepStore((s) => s.startPickZOrigin);
  const cancelPickZOrigin = useStepStore((s) => s.cancelPickZOrigin);
  const resetZOrigin      = useStepStore((s) => s.resetZOrigin);

  const hasXYOrigin = workspaceOrigin !== null || pickingOrigin;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
      <div style={S.sectionLabel}>WORKSPACE ORIGIN (WCS)</div>

      <select value={pickingOrigin ? "point" : originMode} onChange={(e) => setOriginMode(e.target.value)} style={S.select}>
        {MODE_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
      </select>

      {pickingOrigin && (
        <div style={{
          display: "flex", alignItems: "center", justifyContent: "space-between",
          background: "rgba(99,85,224,0.07)", border: "1px solid #6355e044", borderRadius: 8, padding: "6px 10px",
        }}>
          <span style={{ fontSize: 10, color: "#6355e0" }}>Click an edge point…</span>
          <button onClick={cancelPickOrigin} style={{ ...S.iconBtn, color: "#d93025", fontSize: 11 }}>Cancel</button>
        </div>
      )}

      {workspaceOrigin && !pickingOrigin && <CoordDisplay origin={workspaceOrigin} highlightZ={zOverrideActive} />}

      {!workspaceOrigin && !pickingOrigin && (
        <div style={{ fontSize: 9, color: "#66667a" }}>No WCS origin set — G-code uses CAD coordinates</div>
      )}

      {hasXYOrigin && !pickingOrigin && (
        <>
          <div style={{ borderTop: "1px solid #d0d0df", paddingTop: 8 }}>
            <div style={{ ...S.sectionLabel, marginBottom: 6 }}>Z ORIGIN OVERRIDE</div>

            {!pickingZOrigin && !zOverrideActive && (
              <button style={{ ...S.btn, textAlign: "left", paddingLeft: 8 }} onClick={startPickZOrigin}>
                Pick Z from face / edge
              </button>
            )}

            {pickingZOrigin && (
              <div style={{
                display: "flex", alignItems: "center", justifyContent: "space-between",
                background: "rgba(217,119,6,0.07)", border: "1px solid #d9770644", borderRadius: 8, padding: "6px 10px",
              }}>
                <span style={{ fontSize: 10, color: "#d97706" }}>Click a face or edge…</span>
                <button onClick={cancelPickZOrigin} style={{ ...S.iconBtn, color: "#d93025", fontSize: 11 }}>Cancel</button>
              </div>
            )}

            {zOverrideActive && !pickingZOrigin && (
              <div style={{ display: "flex", gap: 6 }}>
                <button style={{ ...S.btn, flex: 1, textAlign: "left", paddingLeft: 8 }} onClick={startPickZOrigin}>Re-pick Z</button>
                <button style={{ ...S.btn, flex: 1, color: "#d93025", borderColor: "#f5b8b0" }} onClick={resetZOrigin}>Reset Z</button>
              </div>
            )}
          </div>

          {workspaceOrigin && (
            <div style={{ fontSize: 9, color: "#66667a" }}>
              {zOverrideActive
                ? "Z overridden from separate pick — G-code origin at shown coordinates"
                : "G-code coordinates offset so this point becomes (0, 0, 0)"}
            </div>
          )}
        </>
      )}
    </div>
  );
}
