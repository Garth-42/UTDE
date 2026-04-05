import { useStrategyStore } from "../../store/strategyStore";
import { useUiStore } from "../../store/uiStore";
import { runScript } from "../../api/client";
import { saveGcodeDialog, IS_TAURI } from "../../lib/backend";
import { S } from "../styles";

export default function CodePanel() {
  const generatedCode  = useStrategyStore((s) => s.generatedCode);
  const gcodeOutput    = useStrategyStore((s) => s.gcodeOutput);
  const codeCopied     = useStrategyStore((s) => s.codeCopied);
  const setCopied      = useStrategyStore((s) => s.setCopied);
  const setGcodeOutput = useStrategyStore((s) => s.setGcodeOutput);

  const scriptOutput     = useUiStore((s) => s.scriptOutput);
  const scriptRunning    = useUiStore((s) => s.scriptRunning);
  const setScriptOutput  = useUiStore((s) => s.setScriptOutput);
  const setScriptRunning = useUiStore((s) => s.setScriptRunning);
  const setActivePanel   = useUiStore((s) => s.setActivePanel);

  const handleCopy = () => navigator.clipboard.writeText(generatedCode).then(setCopied);

  const handleRun = async () => {
    setScriptRunning(true);
    setScriptOutput(null);
    try {
      const result = await runScript(generatedCode);
      setScriptOutput(result);
      if (result.gcode) setGcodeOutput(result.gcode);
    } catch (err) {
      setScriptOutput({ success: false, stderr: err.message, stdout: "" });
    } finally {
      setScriptRunning(false);
    }
  };

  const downloadGcode = async () => {
    if (IS_TAURI) { await saveGcodeDialog(gcodeOutput, "output.nc"); return; }
    const blob = new Blob([gcodeOutput], { type: "text/plain" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = "output.nc"; a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%", overflow: "hidden" }}>
      <div style={{ padding: "8px 16px", display: "flex", alignItems: "center", gap: 8, borderBottom: "1px solid #d0d0df", background: "#eaeaf2" }}>
        <span style={{ ...S.sectionLabel, flex: 1 }}>GENERATED PYTHON</span>
        <button onClick={handleCopy} style={S.primaryBtn}>{codeCopied ? "COPIED ✓" : "COPY"}</button>
        <button onClick={handleRun} disabled={scriptRunning} style={S.btn}>{scriptRunning ? "RUNNING…" : "▶ RUN"}</button>
        {gcodeOutput && <button onClick={downloadGcode} style={S.btn}>⬇ G-CODE</button>}
        <button onClick={() => setActivePanel(null)} style={{ ...S.iconBtn, marginLeft: 4 }}>×</button>
      </div>

      <pre style={{
        flex: 1, overflowY: "auto", margin: 0, padding: "12px 16px",
        fontSize: 11, lineHeight: 1.7, color: "#1a1a2e",
        fontFamily: "'JetBrains Mono','Fira Code',monospace",
        background: "#f4f4fa",
      }}>
        {generatedCode || "// No code generated yet"}
      </pre>

      {scriptOutput && (
        <div style={{ borderTop: "1px solid #d0d0df", maxHeight: 160, display: "flex", flexDirection: "column" }}>
          <div style={{
            padding: "6px 16px", fontSize: 10, fontWeight: 700, letterSpacing: 1.5,
            color: scriptOutput.success ? "#16a34a" : "#d93025",
            borderBottom: "1px solid #d0d0df",
          }}>
            {scriptOutput.success ? "✓ SCRIPT SUCCEEDED" : "✗ SCRIPT FAILED"}
          </div>
          <pre style={{
            flex: 1, overflowY: "auto", margin: 0, padding: "8px 16px",
            fontSize: 10, lineHeight: 1.6,
            color: scriptOutput.success ? "#16a34a" : "#d93025",
            fontFamily: "'JetBrains Mono','Fira Code',monospace",
          }}>
            {scriptOutput.stdout || scriptOutput.stderr || "(no output)"}
          </pre>
        </div>
      )}
    </div>
  );
}
