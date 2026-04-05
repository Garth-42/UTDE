import { useRef, useState } from "react";
import { useStepStore } from "../../store/stepStore";
import { useUiStore } from "../../store/uiStore";
import { parseStep, parseStepByPath } from "../../api/client";
import { importSession } from "../../utils/session";
import { openStepFileDialog, IS_TAURI } from "../../lib/backend";
import { S } from "../styles";

export default function StepUpload() {
  const setGeometry    = useStepStore((s) => s.setGeometry);
  const setLoading     = useStepStore((s) => s.setLoading);
  const setError       = useStepStore((s) => s.setError);
  const fileName       = useStepStore((s) => s.fileName);
  const showBasePlate  = useUiStore((s) => s.showBasePlate);
  const toggleBasePlate = useUiStore((s) => s.toggleBasePlate);

  const [isDragOver, setIsDragOver]   = useState(false);
  // qualityLevel 1 (draft) → 10 (fine); maps to deflection = 2.0 / qualityLevel
  const [qualityLevel, setQualityLevel] = useState(2);
  const currentPathRef = useRef(null);   // last loaded path (Tauri)
  const currentFileRef = useRef(null);   // last loaded File object (browser)

  const deflection = () => 2.0 / qualityLevel;

  // Upload a File object via HTTP multipart (browser dev mode)
  const uploadFile = async (file, lvl = qualityLevel) => {
    if (!file) return;
    if (!/\.(step|stp)$/i.test(file.name)) {
      setError("File must be .step or .stp");
      return;
    }
    currentFileRef.current = file;
    setLoading(true);
    setError(null);
    try {
      const data = await parseStep(file, 2.0 / lvl);
      setGeometry(data.faces ?? [], data.edges ?? [], file.name);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  // Upload by file path (Tauri desktop — server reads from disk directly)
  const uploadPath = async (filePath, lvl = qualityLevel) => {
    if (!filePath) return;
    const name = filePath.split(/[\\/]/).pop();
    currentPathRef.current = filePath;
    setLoading(true);
    setError(null);
    try {
      const data = await parseStepByPath(filePath, 2.0 / lvl);
      setGeometry(data.faces ?? [], data.edges ?? [], name);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  // Re-parse with new quality when the slider is released
  const handleQualityChange = (lvl) => {
    setQualityLevel(lvl);
    if (IS_TAURI && currentPathRef.current) uploadPath(currentPathRef.current, lvl);
    else if (!IS_TAURI && currentFileRef.current) uploadFile(currentFileRef.current, lvl);
  };

  // In Tauri: open native file dialog; in browser: trigger the hidden input
  const handleBrowse = async (e) => {
    if (IS_TAURI) {
      e.preventDefault();
      const path = await openStepFileDialog();
      if (path) uploadPath(path);
    }
    // In browser mode, the <label> wrapping the hidden <input> handles the click
  };

  const handleDrop = (e) => {
    e.preventDefault();
    setIsDragOver(false);
    if (IS_TAURI) {
      // Tauri drag-and-drop provides file paths
      const paths = e.dataTransfer?.files
        ? Array.from(e.dataTransfer.files).map((f) => f.path).filter(Boolean)
        : [];
      if (paths.length) { uploadPath(paths[0]); return; }
    }
    const file = e.dataTransfer.files[0];
    if (file) uploadFile(file);
  };

  const handleSessionImport = async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    try {
      await importSession(file);
    } catch (err) {
      setError(err.message);
    }
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
      <div style={S.sectionLabel}>STEP FILE</div>

      <label
        onClick={IS_TAURI ? handleBrowse : undefined}
        onDragOver={(e) => { e.preventDefault(); setIsDragOver(true); }}
        onDragLeave={() => setIsDragOver(false)}
        onDrop={handleDrop}
        style={{
          display: "flex", flexDirection: "column", alignItems: "center",
          justifyContent: "center", padding: "14px 8px", borderRadius: 4,
          cursor: "pointer", textAlign: "center",
          border: `1px dashed ${isDragOver ? "#6355e0" : "#c0c0d0"}`,
          background: isDragOver ? "rgba(99,85,224,0.07)" : "#f4f4fa",
          color: isDragOver ? "#6355e0" : "#66667a",
          fontSize: 10, lineHeight: 1.9, transition: "all 0.15s",
        }}
      >
        <span style={{ fontSize: 20, marginBottom: 4 }}>⬆</span>
        <span>{fileName ?? "Drop .step / .stp"}</span>
        <span style={{ color: "#66667a" }}>or click to browse</span>
        {/* Hidden input used in browser mode only */}
        {!IS_TAURI && (
          <input
            type="file"
            accept=".step,.stp"
            onChange={(e) => uploadFile(e.target.files[0])}
            style={{ display: "none" }}
          />
        )}
      </label>

      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
        <span style={{ fontSize: 9, color: "#66667a", whiteSpace: "nowrap" }}>Mesh</span>
        <input
          type="range" min={1} max={10} step={1} value={qualityLevel}
          onChange={(e) => setQualityLevel(Number(e.target.value))}
          onMouseUp={(e) => handleQualityChange(Number(e.target.value))}
          onTouchEnd={(e) => handleQualityChange(Number(e.target.value))}
          style={{ flex: 1, accentColor: "#6355e0" }}
        />
        <span style={{ fontSize: 9, color: "#66667a", minWidth: 28 }}>
          {qualityLevel <= 2 ? "Draft" : qualityLevel <= 5 ? "Med" : qualityLevel <= 8 ? "Fine" : "Max"}
        </span>
      </div>

      {/* Viewport display */}
      <div style={{ ...S.sectionLabel, marginTop: 4 }}>DISPLAY</div>
      <div onClick={toggleBasePlate} style={{ ...S.row(showBasePlate), display: "flex", alignItems: "center", gap: 8, cursor: "pointer" }}>
        <div style={{ width: 8, height: 8, borderRadius: 2, background: showBasePlate ? "#6355e0" : "#d0d0df", border: "1px solid #6355e0" }} />
        <span style={{ fontSize: 11, color: showBasePlate ? "#1a1a2e" : "#66667a" }}>Base Plate</span>
      </div>

      <label style={{ ...S.btn, fontSize: 10, cursor: "pointer", textAlign: "center", padding: "6px 0" }}>
        Import Session
        <input type="file" accept=".json" onChange={handleSessionImport} style={{ display: "none" }} />
      </label>
    </div>
  );
}
