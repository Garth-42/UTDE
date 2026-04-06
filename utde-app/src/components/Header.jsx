import { useUiStore } from "../store/uiStore";
import { useStepStore } from "../store/stepStore";
import { useToolpathStore } from "../store/toolpathStore";

const BTN = (active) => ({
  padding: "3px 10px", borderRadius: 6, cursor: "pointer",
  fontSize: 10, letterSpacing: 0.5, fontFamily: "inherit",
  border: `1px solid ${active ? "#6355e0" : "transparent"}`,
  background: active ? "rgba(99,85,224,0.10)" : "transparent",
  color: active ? "#6355e0" : "#66667a",
  transition: "all 0.15s",
});

export default function Header() {
  const graphView        = useUiStore((s) => s.graphView);
  const scriptView       = useUiStore((s) => s.scriptView);
  const showToolpaths    = useUiStore((s) => s.showToolpaths);
  const toggleGraphView  = useUiStore((s) => s.toggleGraphView);
  const toggleScriptView = useUiStore((s) => s.toggleScriptView);
  const toggleToolpaths  = useUiStore((s) => s.toggleToolpaths);
  const fileName         = useStepStore((s) => s.fileName);
  const toolpathCount    = useToolpathStore((s) => s.toolpaths.length);

  return (
    <div style={{
      padding: "8px 20px", display: "flex", alignItems: "center", gap: 14,
      borderBottom: "1px solid #d0d0df", background: "#e8e8f2", flexShrink: 0,
    }}>
      {/* Logo */}
      <div style={{ width: 8, height: 8, borderRadius: "50%", background: "#6355e0", boxShadow: "0 0 8px #6355e066" }} />
      <span style={{ fontSize: 13, fontWeight: 700, letterSpacing: 2, color: "#1a1a2e" }}>UTDE</span>
      {fileName && (
        <span style={{ fontSize: 10, color: "#66667a", letterSpacing: 0.5 }}>/ {fileName}</span>
      )}

      <div style={{ flex: 1 }} />

      {/* Toolpath visibility toggle — shown when toolpaths exist */}
      {toolpathCount > 0 && (
        <>
          <button style={BTN(showToolpaths)} onClick={toggleToolpaths}>
            {showToolpaths ? "◉ TOOLPATHS" : "○ TOOLPATHS"}
          </button>
          <div style={{ width: 1, height: 20, background: "#d0d0df" }} />
        </>
      )}

      {/* View mode toggles */}
      <button style={BTN(!graphView && !scriptView)} onClick={() => { if (graphView || scriptView) toggleGraphView(); }}>
        ◁ 3D
      </button>
      <button style={BTN(graphView && !scriptView)} onClick={() => { if (scriptView) toggleScriptView(); if (!graphView) toggleGraphView(); }}>
        ⬡ GRAPH
      </button>
      <button style={BTN(scriptView)} onClick={toggleScriptView}>
        ✎ SCRIPT
      </button>

      <div style={{ width: 1, height: 20, background: "#d0d0df" }} />
      <span style={{ fontSize: 10, color: "#66667a" }}>v0.1.0</span>
    </div>
  );
}
