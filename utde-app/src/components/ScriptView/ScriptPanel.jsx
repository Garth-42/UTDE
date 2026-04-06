import { useEffect, useRef, useState, useCallback } from "react";
import ReactCodeMirror from "@uiw/react-codemirror";
import { python } from "@codemirror/lang-python";

import { useGraphStore } from "../../store/graphStore";
import { useStepStore }  from "../../store/stepStore";
import { useUiStore }    from "../../store/uiStore";
import { useToolpathStore } from "../../store/toolpathStore";
import { runScript }     from "../../api/client";
import { saveGcodeDialog, IS_TAURI } from "../../lib/backend";
import { S } from "../styles";

import { utdeTheme }    from "./codeTheme";
import { graphToScript } from "./graphToScript";
import { scriptToGraph } from "./scriptToGraph";
import InspectorPanel   from "../NodeGraph/InspectorPanel";

const DEBOUNCE_MS = 300;

export default function ScriptPanel() {
  const nodes         = useGraphStore((s) => s.nodes);
  const edges         = useGraphStore((s) => s.edges);
  const generatedCode = useGraphStore((s) => s.generatedCode);
  const gcodeOutput   = useGraphStore((s) => s.gcodeOutput);
  const setGeneratedCode = useGraphStore((s) => s.setGeneratedCode);
  const setGcodeOutput   = useGraphStore((s) => s.setGcodeOutput);
  const setCopied        = useGraphStore((s) => s.setCopied);
  const codeCopied       = useGraphStore((s) => s.codeCopied);

  const faces         = useStepStore((s) => s.getSelectedFaces());
  const allEdgesStore = useStepStore((s) => s.getSelectedEdges());
  const machine       = useGraphStore((s) => {
    const postNode = s.nodes.find((n) => n.type === "post_processor");
    return postNode?.params?.machine ?? "gantry_5axis_ac";
  });

  const scriptOutput     = useUiStore((s) => s.scriptOutput);
  const scriptRunning    = useUiStore((s) => s.scriptRunning);
  const setScriptOutput  = useUiStore((s) => s.setScriptOutput);
  const setScriptRunning = useUiStore((s) => s.setScriptRunning);
  const setScriptView    = useUiStore((s) => s.setScriptView);

  const addToolpath    = useToolpathStore((s) => s.addToolpath);
  const setShowToolpaths = useUiStore((s) => s.setShowToolpaths);

  // Local editor value — initialised from generatedCode or freshly generated
  const [code, setCode] = useState(() => {
    if (generatedCode) return generatedCode;
    return graphToScript({ nodes, edges }, faces, allEdgesStore, machine);
  });

  // Track whether the user has manually edited (dirty flag)
  const [dirty, setDirty] = useState(false);

  // Gutter / parse state: { unparsed: Set<number>, updated: Set<number> }
  const [parseState, setParseState] = useState({ unparsed: new Set(), updated: new Set() });

  const debounceRef = useRef(null);

  // When the graph changes externally and the user has NOT edited, re-sync
  useEffect(() => {
    if (dirty) return;
    const fresh = graphToScript({ nodes, edges }, faces, allEdgesStore, machine);
    setCode(fresh);
    setGeneratedCode(fresh);
  }, [nodes, edges]); // eslint-disable-line react-hooks/exhaustive-deps

  const handleChange = useCallback((value) => {
    setCode(value);
    setDirty(true);
    setGeneratedCode(value);

    clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      const result = scriptToGraph(value);
      setParseState({
        unparsed: new Set(result.unparsedLines),
        updated:  new Set(result.updatedLines),
      });

      // Flash updated lines briefly
      if (result.updatedLines.length > 0) {
        setTimeout(() => setParseState((ps) => ({ ...ps, updated: new Set() })), 400);
      }
    }, DEBOUNCE_MS);
  }, [setGeneratedCode]);

  const handleRun = async () => {
    setScriptRunning(true);
    setScriptOutput(null);
    try {
      const result = await runScript(code);
      setScriptOutput(result);
      if (result.gcode) setGcodeOutput(result.gcode);
      if (result.points?.length) {
        addToolpath(`script — ${new Date().toLocaleTimeString()}`, result.points, "#6355e0");
        setShowToolpaths(true);
      }
    } catch (err) {
      setScriptOutput({ success: false, stderr: err.message, stdout: "" });
    } finally {
      setScriptRunning(false);
    }
  };

  const handleCopy = () => navigator.clipboard.writeText(code).then(setCopied);

  const handleRegenerate = () => {
    const fresh = graphToScript({ nodes, edges }, faces, allEdgesStore, machine);
    setCode(fresh);
    setGeneratedCode(fresh);
    setDirty(false);
    setParseState({ unparsed: new Set(), updated: new Set() });
  };

  const downloadGcode = async () => {
    if (!gcodeOutput) return;
    if (IS_TAURI) { await saveGcodeDialog(gcodeOutput, "output.nc"); return; }
    const blob = new Blob([gcodeOutput], { type: "text/plain" });
    const url  = URL.createObjectURL(blob);
    const a    = document.createElement("a");
    a.href = url; a.download = "output.nc"; a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div style={{ display: "flex", width: "100%", height: "100%", overflow: "hidden" }}>

      {/* Editor area */}
      <div style={{ flex: 1, display: "flex", flexDirection: "column", overflow: "hidden" }}>

        {/* Toolbar */}
        <div style={{
          padding: "6px 12px", display: "flex", alignItems: "center", gap: 6,
          borderBottom: "1px solid #2a2a4a", background: "#14142a", flexShrink: 0,
        }}>
          <span style={{ ...S.sectionLabel, color: "#9090aa", flex: 1 }}>SCRIPT</span>
          {dirty && (
            <span style={{ fontSize: 9, color: "#d97706", marginRight: 4 }}>
              ● unsaved edits
            </span>
          )}
          <button onClick={handleRegenerate} style={{ ...S.btn, fontSize: 10 }} title="Re-generate from graph">
            ↺ REGENERATE
          </button>
          <button onClick={handleCopy} style={{ ...S.btn, fontSize: 10 }}>
            {codeCopied ? "COPIED ✓" : "COPY"}
          </button>
          <button
            onClick={handleRun}
            disabled={scriptRunning}
            style={{ ...S.primaryBtn, fontSize: 10 }}
          >
            {scriptRunning ? "RUNNING…" : "▷ RUN"}
          </button>
          {gcodeOutput && (
            <button onClick={downloadGcode} style={{ ...S.btn, fontSize: 10 }}>
              ⬇ G-CODE
            </button>
          )}
          <button onClick={() => setScriptView(false)} style={{ ...S.iconBtn, marginLeft: 4 }}>×</button>
        </div>

        {/* Parse status bar */}
        {(parseState.unparsed.size > 0) && (
          <div style={{
            padding: "3px 12px", fontSize: 9, background: "#1a140a",
            borderBottom: "1px solid #3a2a0a", color: "#d97706",
          }}>
            {parseState.unparsed.size} line{parseState.unparsed.size !== 1 ? "s" : ""} not recognised — shown with yellow markers. Edits are saved but won't update the node graph.
          </div>
        )}

        {/* CodeMirror editor */}
        <div style={{ flex: 1, overflow: "auto", position: "relative" }}>
          <ReactCodeMirror
            value={code}
            onChange={handleChange}
            extensions={[python()]}
            theme={utdeTheme}
            basicSetup={{
              lineNumbers:      true,
              foldGutter:       true,
              highlightActiveLine: true,
              autocompletion:   false,
            }}
            style={{ height: "100%", fontSize: 12 }}
          />
          {/* Yellow gutter overlay for unparsed lines */}
          {parseState.unparsed.size > 0 && (
            <UnparsedOverlay unparsed={parseState.unparsed} code={code} />
          )}
        </div>

        {/* Script output strip */}
        {scriptOutput && (
          <div style={{ borderTop: "1px solid #2a2a4a", maxHeight: 160, display: "flex", flexDirection: "column", flexShrink: 0 }}>
            <div style={{
              padding: "5px 12px", fontSize: 10, fontWeight: 700, letterSpacing: 1.2,
              color: scriptOutput.success ? "#16a34a" : "#d93025",
              borderBottom: "1px solid #2a2a4a", background: "#14142a",
            }}>
              {scriptOutput.success ? "✓ SCRIPT SUCCEEDED" : "✗ SCRIPT FAILED"}
            </div>
            <pre style={{
              flex: 1, overflowY: "auto", margin: 0, padding: "8px 12px",
              fontSize: 10, lineHeight: 1.6,
              color: scriptOutput.success ? "#16a34a" : "#d93025",
              fontFamily: "'JetBrains Mono','Fira Code',monospace",
              background: "#14142a",
            }}>
              {scriptOutput.stdout || scriptOutput.stderr || "(no output)"}
            </pre>
          </div>
        )}
      </div>

      {/* Inspector panel — reused from node graph view */}
      <InspectorPanel />
    </div>
  );
}

/**
 * Simple overlay that marks unparsed line numbers with a yellow left border.
 * Positioned absolutely over the editor; line height is approximated at 20px.
 */
function UnparsedOverlay({ unparsed, code }) {
  const lines = code.split("\n");
  const LINE_H = 20; // px — matches CodeMirror's default line height at font-size 12
  const GUTTER_W = 32; // approximate gutter width

  return (
    <div style={{
      position: "absolute", top: 0, left: GUTTER_W, pointerEvents: "none",
      width: 3, zIndex: 10,
    }}>
      {lines.map((_, i) =>
        unparsed.has(i) ? (
          <div
            key={i}
            style={{
              position: "absolute",
              top:    i * LINE_H,
              left:   0,
              width:  3,
              height: LINE_H,
              background: "#d97706",
              opacity: 0.8,
            }}
          />
        ) : null
      )}
    </div>
  );
}
