/**
 * UtilitiesPanel — one minimizable overlay (top-right of the Setup viewport)
 * that groups the workpiece-transform and measure tools as stacked,
 * individually-collapsible sections. The whole panel can be minimized to just
 * its header; that preference persists across sessions. Hidden until geometry
 * is loaded.
 */
import { useState } from "react";
import { useStepStore } from "../../store/stepStore";
import WorkpiecePanel from "./WorkpiecePanel";
import MeasurePanel from "./MeasurePanel";

const KEY = "utde-utilities-min";

const STYLES = {
  card: {
    position: "absolute", top: 14, right: 14, width: 226,
    background: "var(--panel)", border: "1px solid var(--border)",
    borderRadius: "var(--r-lg)", boxShadow: "var(--shadow-sm)",
    padding: 10, display: "flex", flexDirection: "column", gap: 10,
    fontSize: 12, color: "var(--ink-2)", zIndex: 5,
  },
  header: {
    display: "flex", alignItems: "center", justifyContent: "space-between",
    width: "100%", padding: 0, background: "none", border: 0, cursor: "pointer",
    color: "var(--ink)", fontSize: 12, fontWeight: 700,
  },
  chevron: { color: "var(--muted)", fontSize: 11 },
  body: { display: "flex", flexDirection: "column", gap: 10 },
  sep: { height: 1, background: "var(--border)" },
};

export default function UtilitiesPanel() {
  const faces = useStepStore((s) => s.faces);
  const edges = useStepStore((s) => s.edges);
  const [minimized, setMinimized] = useState(() => {
    try { return localStorage.getItem(KEY) === "1"; } catch (e) { return false; }
  });

  if ((faces?.length || 0) + (edges?.length || 0) === 0) return null;

  const toggle = () =>
    setMinimized((m) => {
      const next = !m;
      try { localStorage.setItem(KEY, next ? "1" : "0"); } catch (e) { /* ignore */ }
      return next;
    });

  return (
    <div style={STYLES.card} aria-label="Utilities">
      <button
        type="button"
        style={STYLES.header}
        aria-expanded={!minimized}
        onClick={toggle}
      >
        <span>Utilities</span>
        <span style={STYLES.chevron}>{minimized ? "▸" : "▾"}</span>
      </button>

      {!minimized && (
        <div style={STYLES.body}>
          <WorkpiecePanel />
          {faces.length > 0 && <div style={STYLES.sep} />}
          <MeasurePanel />
        </div>
      )}
    </div>
  );
}
