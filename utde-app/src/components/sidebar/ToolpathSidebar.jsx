import { useToolpathStore } from "../../store/toolpathStore";
import { useUiStore } from "../../store/uiStore";
import { useStepStore } from "../../store/stepStore";
import { exportSession } from "../../utils/session";
import { useGraphStore } from "../../store/graphStore";
import { S } from "../styles";

function ToolpathRow({ tp }) {
  const activeIds      = useToolpathStore((s) => s.activeIds);
  const toggleToolpath = useToolpathStore((s) => s.toggleToolpath);
  const removeToolpath = useToolpathStore((s) => s.removeToolpath);
  const isActive = activeIds.has(tp.id);

  return (
    <div style={{
      padding: "6px 8px", marginBottom: 4, borderRadius: 6,
      display: "flex", alignItems: "center", gap: 8,
      background: isActive ? "#e0e0f0" : "transparent",
      border: `1px solid ${isActive ? "#c0c0d8" : "transparent"}`,
      cursor: "pointer",
    }} onClick={() => toggleToolpath(tp.id)}>
      <div style={{
        width: 10, height: 10, borderRadius: 3, flexShrink: 0,
        background: isActive ? tp.color : "#d0d0df",
        border: `1px solid ${tp.color}`,
        boxShadow: isActive ? `0 0 6px ${tp.color}55` : "none",
      }} />
      <div style={{ flex: 1, overflow: "hidden" }}>
        <div style={{ fontSize: 11, color: isActive ? "#1a1a2e" : "#66667a", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
          {tp.label}
        </div>
        <div style={{ fontSize: 9, color: "#66667a" }}>{tp.points.length.toLocaleString()} pts</div>
      </div>
      <button onClick={(e) => { e.stopPropagation(); removeToolpath(tp.id); }} style={{ ...S.iconBtn, color: "#d93025" }}>×</button>
    </div>
  );
}

export default function ToolpathSidebar() {
  const toolpaths       = useToolpathStore((s) => s.toolpaths);
  const animProgress    = useToolpathStore((s) => s.animProgress);
  const isAnimating     = useToolpathStore((s) => s.isAnimating);
  const showNormals     = useToolpathStore((s) => s.showNormals);
  const startAnimation  = useToolpathStore((s) => s.startAnimation);
  const stopAnimation   = useToolpathStore((s) => s.stopAnimation);
  const setAnimProgress = useToolpathStore((s) => s.setAnimProgress);
  const setShowNormals  = useToolpathStore((s) => s.setShowNormals);
  const clearToolpaths  = useToolpathStore((s) => s.clearToolpaths);

  const setActivePanel  = useUiStore((s) => s.setActivePanel);
  const showBasePlate   = useUiStore((s) => s.showBasePlate);
  const toggleBasePlate = useUiStore((s) => s.toggleBasePlate);

  const selectedFaceIds  = useStepStore((s) => s.selectedFaceIds);
  const selectedEdgeIds  = useStepStore((s) => s.selectedEdgeIds);
  const fileName         = useStepStore((s) => s.fileName);
  const gcodeOutput      = useGraphStore((s) => s.gcodeOutput);
  const strategy         = useGraphStore((s) => s.nodes.find((n) => n.type === "strategy")?.params ?? {});
  const orientationRules = [];

  const totalPts = toolpaths.reduce((s, t) => s + t.points.length, 0);
  const handleExportSession = () => exportSession({ selectedFaceIds, selectedEdgeIds, fileName, strategy, orientationRules });
  const downloadGcode = () => {
    if (!gcodeOutput) return;
    const blob = new Blob([gcodeOutput], { type: "text/plain" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = "output.nc";
    a.click();
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
      <div style={{ display: "flex", flexDirection: "column" }}>
        <div style={{ ...S.sectionLabel, display: "flex", justifyContent: "space-between", marginBottom: 6 }}>
          <span>TOOLPATHS ({toolpaths.length})</span>
          {toolpaths.length > 0 && <button onClick={clearToolpaths} style={{ ...S.iconBtn, color: "#d93025" }}>clear</button>}
        </div>
        <div style={{ overflowY: "auto" }}>
          {toolpaths.length === 0
            ? <div style={{ fontSize: 10, color: "#66667a" }}>No toolpaths generated yet.</div>
            : toolpaths.map((tp) => <ToolpathRow key={tp.id} tp={tp} />)
          }
        </div>
      </div>

      <div>
        <div style={{ ...S.sectionLabel, marginBottom: 6 }}>DISPLAY</div>
        <div onClick={() => setShowNormals(!showNormals)} style={{ ...S.row(showNormals), display: "flex", alignItems: "center", gap: 8, cursor: "pointer", marginBottom: 4 }}>
          <div style={{ width: 8, height: 8, borderRadius: 2, background: showNormals ? "#d97706" : "#d0d0df", border: "1px solid #d97706" }} />
          <span style={{ fontSize: 11, color: showNormals ? "#1a1a2e" : "#66667a" }}>Tool Normals</span>
        </div>
        <div onClick={toggleBasePlate} style={{ ...S.row(showBasePlate), display: "flex", alignItems: "center", gap: 8, cursor: "pointer" }}>
          <div style={{ width: 8, height: 8, borderRadius: 2, background: showBasePlate ? "#6355e0" : "#d0d0df", border: "1px solid #6355e0" }} />
          <span style={{ fontSize: 11, color: showBasePlate ? "#1a1a2e" : "#66667a" }}>Base Plate</span>
        </div>
      </div>

      <div>
        <div style={{ ...S.sectionLabel, marginBottom: 6 }}>ANIMATION</div>
        <button style={{ ...S.btn, width: "100%", color: isAnimating ? "#66667a" : "#6355e0" }}
          onClick={isAnimating ? stopAnimation : startAnimation}>
          {isAnimating ? "■ STOP" : "▶ PLAY TOOLPATH"}
        </button>
        <div style={{ marginTop: 8, display: "flex", alignItems: "center", gap: 8 }}>
          <input type="range" min={0} max={100} value={Math.round(animProgress * 100)}
            onChange={(e) => { stopAnimation(); setAnimProgress(Number(e.target.value) / 100); }}
            style={{ flex: 1, accentColor: "#6355e0" }} />
          <span style={{ fontSize: 10, color: "#66667a", minWidth: 36 }}>{Math.round(animProgress * 100)}%</span>
        </div>
      </div>

      <div style={{ fontSize: 10, color: "#66667a", lineHeight: 1.8, borderTop: "1px solid #d0d0df", paddingTop: 10 }}>
        <div>Points: <span style={{ color: "#1a1a2e" }}>{totalPts.toLocaleString()}</span></div>
        <div>Toolpaths: <span style={{ color: "#1a1a2e" }}>{toolpaths.length}</span></div>
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
        <button style={S.btn} onClick={() => setActivePanel("code")}>View Python Code</button>
        {gcodeOutput && <button style={S.btn} onClick={downloadGcode}>⬇ Download G-code</button>}
        <button style={S.btn} onClick={handleExportSession}>Export Session</button>
      </div>
    </div>
  );
}
