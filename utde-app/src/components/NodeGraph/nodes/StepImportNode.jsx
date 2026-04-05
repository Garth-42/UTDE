import { useRef, useState } from "react";
import { Handle, Position } from "reactflow";
import { useGraphStore } from "../../../store/graphStore";
import { useStepStore } from "../../../store/stepStore";
import { parseStep, parseStepByPath } from "../../../api/client";
import { openStepFileDialog, IS_TAURI } from "../../../lib/backend";
import { NODE_COLORS, nodeWrap, nodeHeader, nodeBody, paramRow, paramKey, paramValue } from "./nodeStyles";

const COLOR = "#1a6eb5";   // distinct blue — not geometry green, not strategy purple

const BTN = {
  width: "100%", padding: "4px 6px", marginTop: 4,
  background: "#e8f0fb", border: "1px solid #a8c4e8", borderRadius: 4,
  color: COLOR, fontSize: 9, cursor: "pointer", letterSpacing: 0.4,
  fontFamily: "inherit", textAlign: "left",
};

const ERR = {
  fontSize: 9, color: "#c0291e", marginTop: 4,
  background: "#fdecea", border: "1px solid #f5b8b0",
  borderRadius: 4, padding: "3px 6px",
};

export default function StepImportNode({ data, selected }) {
  const setNodeOutput = useGraphStore((s) => s.setNodeOutput);
  const setNodeStatus = useGraphStore((s) => s.setNodeStatus);
  const setGeometry   = useStepStore((s) => s.setGeometry);

  const [loading, setLoading] = useState(false);
  const [error, setError]     = useState(null);
  const fileInputRef = useRef();

  const { output, params } = data;
  const fileName  = output?.fileName ?? null;
  const faceCount = output?.faces?.length ?? 0;
  const edgeCount = output?.edges?.length ?? 0;
  const qualityLevel = params.quality_level ?? 2;
  const deflection   = 2.0 / qualityLevel;

  const load = async (file) => {
    setLoading(true);
    setError(null);
    setNodeStatus(data.id, "loading");
    try {
      const result = IS_TAURI
        ? await parseStepByPath(file, deflection)
        : await parseStep(file, deflection);
      const name = IS_TAURI
        ? file.split(/[\\/]/).pop()
        : file.name;
      setNodeOutput(data.id, { faces: result.faces ?? [], edges: result.edges ?? [], fileName: name });
      // Mirror into stepStore so the 3D viewport shows this file
      setGeometry(result.faces ?? [], result.edges ?? [], name);
    } catch (err) {
      setError(err.message);
      setNodeStatus(data.id, "error");
    } finally {
      setLoading(false);
    }
  };

  const handleBrowse = async (e) => {
    e.stopPropagation();
    if (IS_TAURI) {
      const path = await openStepFileDialog();
      if (path) load(path);
    } else {
      fileInputRef.current?.click();
    }
  };

  const handleFileChange = (e) => {
    const file = e.target.files?.[0];
    if (file) load(file);
  };

  const qualityLabel = qualityLevel <= 2 ? "Draft" : qualityLevel <= 5 ? "Med" : qualityLevel <= 8 ? "Fine" : "Max";

  return (
    <div style={nodeWrap(COLOR, selected)}>
      <div style={{ ...nodeHeader(COLOR) }}>
        <span>⬆</span> STEP IMPORT
      </div>
      <div style={nodeBody}>
        {fileName ? (
          <>
            <div style={{ ...paramRow, marginBottom: 2 }}>
              <span style={{ ...paramKey, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", maxWidth: 110, fontSize: 9 }} title={fileName}>
                {fileName}
              </span>
              <span style={{ fontSize: 9, color: "#66667a" }}>{qualityLabel}</span>
            </div>
            <div style={paramRow}>
              <span style={paramKey}>faces</span>
              <span style={{ ...paramValue, color: COLOR }}>{faceCount}</span>
            </div>
            <div style={paramRow}>
              <span style={paramKey}>edges</span>
              <span style={{ ...paramValue, color: COLOR }}>{edgeCount}</span>
            </div>
          </>
        ) : (
          <div style={{ fontSize: 9, color: "#9090aa", fontStyle: "italic", padding: "2px 0" }}>
            No file loaded
          </div>
        )}

        {/* Mesh quality */}
        <div style={{ display: "flex", alignItems: "center", gap: 6, marginTop: 4 }}>
          <span style={{ fontSize: 9, color: "#66667a", whiteSpace: "nowrap" }}>Mesh</span>
          <input
            type="range" min={1} max={10} step={1} value={qualityLevel}
            onMouseDown={(e) => e.stopPropagation()}
            onChange={(e) => {
              useGraphStore.getState().updateNodeParam(data.id, "quality_level", Number(e.target.value));
            }}
            style={{ flex: 1, accentColor: COLOR }}
          />
          <span style={{ fontSize: 9, color: "#66667a", minWidth: 26 }}>{qualityLabel}</span>
        </div>

        <button
          style={{ ...BTN, opacity: loading ? 0.6 : 1 }}
          onMouseDown={(e) => e.stopPropagation()}
          onClick={handleBrowse}
          disabled={loading}
        >
          {loading ? "Loading…" : fileName ? "⬆ Replace file…" : "⬆ Browse .step / .stp…"}
        </button>

        {!IS_TAURI && (
          <input
            ref={fileInputRef}
            type="file"
            accept=".step,.stp"
            onChange={handleFileChange}
            style={{ display: "none" }}
          />
        )}

        {error && <div style={ERR}>{error}</div>}
      </div>

      {/* faces_out and edges_out — same port IDs as GeometryNode so wires are compatible */}
      <Handle type="source" position={Position.Right} id="faces_out"
        style={{ top: "40%", background: COLOR, width: 8, height: 8, border: "2px solid #fff" }} />
      <Handle type="source" position={Position.Right} id="edges_out"
        style={{ top: "65%", background: COLOR, width: 8, height: 8, border: "2px solid #fff" }} />
    </div>
  );
}
