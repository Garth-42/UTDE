import { useEffect, useRef, useState, useCallback } from "react";
import ReactCodeMirror from "@uiw/react-codemirror";
import { python } from "@codemirror/lang-python";

import { useGraphStore } from "../../store/graphStore";
import { useStepStore }  from "../../store/stepStore";
import { useUiStore }    from "../../store/uiStore";
import { useToolpathStore } from "../../store/toolpathStore";
import { runScript, lintScript } from "../../api/client";
import { saveGcodeDialog, IS_TAURI } from "../../lib/backend";
import { S } from "../styles";

import { utdeTheme }     from "./codeTheme";
import { graphToScript } from "./graphToScript";
import { scriptToGraph } from "./scriptToGraph";
import InspectorPanel    from "../NodeGraph/InspectorPanel";

const PARSE_DEBOUNCE_MS = 300;
const LINT_DEBOUNCE_MS  = 500;

// ── Section → node mapping ────────────────────────────────────────────────────
// Maps section-header comment patterns to graphStore node types.
const SECTION_NODE_MAP = [
  { pattern: /# ── Geometry/,         nodeType: "geometry"       },
  { pattern: /# ── Machine/,          nodeType: "post_processor" },
  { pattern: /# ── Toolpath strategy/,nodeType: "strategy"       },
  { pattern: /# ── Orientation rules/,nodeType: "orient"         },
  { pattern: /# ── G-code output/,    nodeType: "post_processor" },
  { pattern: /paths\.orient\(/,       nodeType: "orient"         },
  { pattern: /Strategy\(\)\.generate/,nodeType: "strategy"       },
  { pattern: /machine\s*=\s*Machine/, nodeType: "post_processor" },
  { pattern: /PostProcessor/,         nodeType: "post_processor" },
  { pattern: /Surface\.|Curve\.|GeometryModel/, nodeType: "geometry" },
];

/**
 * Given the full code string and a 0-based cursor line number,
 * return the graphStore node type the cursor is "inside".
 */
function nodeTypeForLine(code, cursorLine) {
  const lines = code.split("\n");
  let currentType = null;
  for (let i = 0; i <= Math.min(cursorLine, lines.length - 1); i++) {
    const line = lines[i];
    for (const { pattern, nodeType } of SECTION_NODE_MAP) {
      if (pattern.test(line)) { currentType = nodeType; break; }
    }
  }
  return currentType;
}

// ── Component ─────────────────────────────────────────────────────────────────

export default function ScriptPanel() {
  const nodes         = useGraphStore((s) => s.nodes);
  const edges         = useGraphStore((s) => s.edges);
  const generatedCode = useGraphStore((s) => s.generatedCode);
  const gcodeOutput   = useGraphStore((s) => s.gcodeOutput);
  const setGeneratedCode  = useGraphStore((s) => s.setGeneratedCode);
  const setGcodeOutput    = useGraphStore((s) => s.setGcodeOutput);
  const setCopied         = useGraphStore((s) => s.setCopied);
  const codeCopied        = useGraphStore((s) => s.codeCopied);
  const setSelectedNode   = useGraphStore((s) => s.setSelectedNode);

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

  const addToolpath      = useToolpathStore((s) => s.addToolpath);
  const setShowToolpaths = useUiStore((s) => s.setShowToolpaths);

  const [code, setCode] = useState(() => {
    if (generatedCode) return generatedCode;
    return graphToScript({ nodes, edges }, faces, allEdgesStore, machine);
  });

  const [dirty, setDirty] = useState(false);

  // Parse gutter state
  const [unparsedLines, setUnparsedLines] = useState(new Set());
  const [flashLines,    setFlashLines]    = useState(new Set());

  // Lint error state: [{ line, col, message }]
  const [lintErrors, setLintErrors] = useState([]);

  const parseDebounceRef = useRef(null);
  const lintDebounceRef  = useRef(null);

  // Sync from graph when not dirty
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

    // ── Parse debounce (300ms) → scriptToGraph + gutter markers
    clearTimeout(parseDebounceRef.current);
    parseDebounceRef.current = setTimeout(() => {
      const result = scriptToGraph(value);
      setUnparsedLines(new Set(result.unparsedLines));

      if (result.updatedLines.length > 0) {
        setFlashLines(new Set(result.updatedLines));
        setTimeout(() => setFlashLines(new Set()), 400);
      }
    }, PARSE_DEBOUNCE_MS);

    // ── Lint debounce (500ms) → /lint-script
    clearTimeout(lintDebounceRef.current);
    lintDebounceRef.current = setTimeout(async () => {
      try {
        const { errors } = await lintScript(value);
        setLintErrors(errors ?? []);
      } catch {
        // Server unavailable — silently ignore lint errors
      }
    }, LINT_DEBOUNCE_MS);
  }, [setGeneratedCode]);

  // ── Cursor → Inspector node selection ─────────────────────────────────────
  const handleUpdate = useCallback((viewUpdate) => {
    if (!viewUpdate.selectionSet) return;
    const cursorLine = viewUpdate.state.doc.lineAt(
      viewUpdate.state.selection.main.head
    ).number - 1; // 0-based

    const nodeType = nodeTypeForLine(code, cursorLine);
    if (!nodeType) return;

    const matchingNode = nodes.find((n) => n.type === nodeType);
    if (matchingNode) setSelectedNode(matchingNode.id);
  }, [code, nodes, setSelectedNode]);

  const handleRun = async () => {
    setScriptRunning(true);
    setScriptOutput(null);
    try {
      const result = await runScript(code);
      setScriptOutput(result);
      if (result.gcode)         setGcodeOutput(result.gcode);
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
    setUnparsedLines(new Set());
    setFlashLines(new Set());
    setLintErrors([]);
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
            <span style={{ fontSize: 9, color: "#d97706", marginRight: 4 }}>● unsaved edits</span>
          )}
          <button onClick={handleRegenerate} style={{ ...S.btn, fontSize: 10 }} title="Re-generate from graph">
            ↺ REGENERATE
          </button>
          <button onClick={handleCopy} style={{ ...S.btn, fontSize: 10 }}>
            {codeCopied ? "COPIED ✓" : "COPY"}
          </button>
          <button onClick={handleRun} disabled={scriptRunning} style={{ ...S.primaryBtn, fontSize: 10 }}>
            {scriptRunning ? "RUNNING…" : "▷ RUN"}
          </button>
          {gcodeOutput && (
            <button onClick={downloadGcode} style={{ ...S.btn, fontSize: 10 }}>⬇ G-CODE</button>
          )}
          <button onClick={() => setScriptView(false)} style={{ ...S.iconBtn, marginLeft: 4 }}>×</button>
        </div>

        {/* Status bar */}
        {(unparsedLines.size > 0 || lintErrors.length > 0) && (
          <div style={{
            padding: "3px 12px", fontSize: 9, background: "#1a140a",
            borderBottom: "1px solid #3a2a0a",
            display: "flex", gap: 12,
          }}>
            {unparsedLines.size > 0 && (
              <span style={{ color: "#d97706" }}>
                ● {unparsedLines.size} line{unparsedLines.size !== 1 ? "s" : ""} not recognised
              </span>
            )}
            {lintErrors.length > 0 && (
              <span style={{ color: "#d93025" }}>
                ✕ {lintErrors.length} syntax error{lintErrors.length !== 1 ? "s" : ""}
              </span>
            )}
          </div>
        )}

        {/* CodeMirror editor */}
        <div style={{ flex: 1, overflow: "auto", position: "relative" }}>
          <ReactCodeMirror
            value={code}
            onChange={handleChange}
            onUpdate={handleUpdate}
            extensions={[python()]}
            theme={utdeTheme}
            basicSetup={{
              lineNumbers:         true,
              foldGutter:          true,
              highlightActiveLine: true,
              autocompletion:      false,
            }}
            style={{ height: "100%", fontSize: 12 }}
          />
          <GutterOverlay
            unparsedLines={unparsedLines}
            flashLines={flashLines}
            lintErrors={lintErrors}
            code={code}
          />
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

      {/* Inspector panel */}
      <InspectorPanel />
    </div>
  );
}

// ── Gutter overlay ────────────────────────────────────────────────────────────

const LINE_H   = 20;  // px — CodeMirror default line height at font-size 12
const GUTTER_W = 32;  // approximate left gutter width

function GutterOverlay({ unparsedLines, flashLines, lintErrors, code }) {
  const [tooltip, setTooltip] = useState(null); // { x, y, message }
  const lineCount = code.split("\n").length;

  const lintByLine = {};
  lintErrors.forEach((e) => { lintByLine[e.line] = e.message; });

  return (
    <div style={{
      position: "absolute", top: 0, left: GUTTER_W,
      width: 4, height: lineCount * LINE_H,
      pointerEvents: "none", zIndex: 10,
    }}>
      {Array.from({ length: lineCount }, (_, i) => {
        const isUnparsed = unparsedLines.has(i);
        const isFlash    = flashLines.has(i);
        const isLint     = lintByLine[i] !== undefined;

        if (!isUnparsed && !isFlash && !isLint) return null;

        const color = isLint ? "#d93025" : isFlash ? "#16a34a" : "#d97706";

        return (
          <div
            key={i}
            style={{
              position: "absolute",
              top: i * LINE_H, left: 0,
              width: 4, height: LINE_H,
              background: color,
              opacity: isFlash ? 0.9 : 0.75,
              // Re-enable pointer events on lint markers for tooltip
              pointerEvents: isLint ? "auto" : "none",
              cursor: isLint ? "help" : "default",
              transition: isFlash ? "opacity 0.4s" : "none",
            }}
            onMouseEnter={isLint ? (e) => setTooltip({ x: e.clientX + 12, y: e.clientY, message: lintByLine[i] }) : undefined}
            onMouseLeave={isLint ? () => setTooltip(null) : undefined}
          />
        );
      })}

      {/* Tooltip */}
      {tooltip && (
        <div style={{
          position: "fixed", left: tooltip.x, top: tooltip.y,
          background: "#1a0a0a", border: "1px solid #d93025",
          color: "#f87171", fontSize: 10, padding: "4px 8px",
          borderRadius: 4, zIndex: 1000, maxWidth: 300,
          pointerEvents: "none", fontFamily: "'JetBrains Mono', monospace",
          boxShadow: "0 2px 8px rgba(0,0,0,0.5)",
        }}>
          {tooltip.message}
        </div>
      )}
    </div>
  );
}
