/**
 * PostTab — G-code review + export.
 *
 * Layout:
 *   - Meta bar (top): machine name, line count, cycle time, warnings count
 *     on the left; primary "Export .nc" button on the right.
 *   - Two-column body: GcodeView on the left, a static-reveal StepViewport
 *     on the right (same showToolpaths flag — set to true here on mount).
 *
 * Export:
 *   - Tauri: opens the native save dialog via lib/backend.saveGcodeDialog.
 *   - Browser: triggers an anchor-element download with a .nc default.
 */

import { useEffect, useMemo } from "react";
import I from "../icons";
import GcodeView from "./GcodeView";
import StepViewport from "../viewport/StepViewport";
import { useToolpathStore } from "../../store/toolpathStore";
import { useUiStore } from "../../store/uiStore";
import { useStepStore } from "../../store/stepStore";
import { useTemplates } from "../../lib/templateLoader";
import { totalDurationSeconds, formatTime } from "../../lib/simulation";
import { useCursorLineSync } from "../../lib/useCursorLineSync";
import { saveGcodeDialog, IS_TAURI } from "../../lib/backend";

const STYLES = {
  shell: {
    flex: 1,
    padding: 10,
    minHeight: 0,
    display: "flex",
    flexDirection: "column",
    gap: 10,
  },
  meta: {
    background: "var(--panel)",
    border: "1px solid var(--border)",
    borderRadius: "var(--r-lg)",
    boxShadow: "var(--shadow-sm)",
    padding: "10px 14px",
    display: "flex",
    alignItems: "center",
    gap: 16,
    fontSize: 12,
    color: "var(--ink-2)",
  },
  metaStat: { display: "flex", alignItems: "baseline", gap: 6 },
  metaLabel: { color: "var(--muted)" },
  metaValue: { fontFamily: "var(--font-mono)", color: "var(--ink)" },
  metaSep: { width: 1, height: 16, background: "var(--border)" },
  warn: { color: "var(--warn)" },

  body: {
    flex: 1,
    display: "grid",
    gridTemplateColumns: "1fr 1fr",
    gap: 10,
    minHeight: 0,
  },
  card: {
    background: "var(--panel)",
    border: "1px solid var(--border)",
    borderRadius: "var(--r-lg)",
    boxShadow: "var(--shadow-sm)",
    padding: 10,
    display: "flex",
    flexDirection: "column",
    minHeight: 0,
    overflow: "hidden",
  },
  cardHead: {
    fontSize: 11.5, fontWeight: 600, textTransform: "uppercase",
    letterSpacing: "0.04em", color: "var(--ink-2)",
    padding: "2px 6px 10px",
  },
  viewport: {
    flex: 1,
    minHeight: 0,
    position: "relative",
    overflow: "hidden",
    borderRadius: "var(--r-md)",
    border: "1px solid var(--border)",
  },

  exportBtn: {
    marginLeft: "auto",
    display: "flex", alignItems: "center", gap: 6,
    padding: "6px 12px",
    border: "1px solid var(--ink)",
    background: "var(--ink)",
    color: "var(--panel)",
    borderRadius: "var(--r-sm)",
    fontSize: 12,
    cursor: "pointer",
  },
  exportBtnDisabled: { opacity: 0.5, cursor: "not-allowed" },

  empty: {
    flex: 1,
    display: "flex", flexDirection: "column",
    alignItems: "center", justifyContent: "center",
    color: "var(--muted)", fontSize: 12, gap: 8,
  },

  scrubBar: {
    background: "var(--panel)",
    border: "1px solid var(--border)",
    borderRadius: "var(--r-lg)",
    boxShadow: "var(--shadow-sm)",
    padding: "8px 12px",
    display: "flex", alignItems: "center", gap: 10,
  },
  scrubBtn: {
    width: 30, height: 30,
    display: "flex", alignItems: "center", justifyContent: "center",
    border: "1px solid var(--border)",
    background: "var(--panel)",
    color: "var(--ink-2)",
    borderRadius: "var(--r-sm)",
    cursor: "pointer",
  },
  scrubBtnPrimary: {
    background: "var(--ink)", color: "var(--panel)", borderColor: "var(--ink)",
  },
  scrubRange: { flex: 1, cursor: "pointer", accentColor: "var(--ink)" },
  scrubTime: {
    fontFamily: "var(--font-mono)", fontSize: 12, color: "var(--ink)",
    minWidth: 92, textAlign: "right",
  },
};

async function downloadGcode(gcode, defaultName = "output.nc") {
  if (IS_TAURI) {
    return saveGcodeDialog(gcode, defaultName);
  }
  if (typeof document === "undefined") return null;
  const blob = new Blob([gcode], { type: "text/plain" });
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement("a");
  a.href     = url;
  a.download = defaultName;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
  return defaultName;
}

export default function PostTab() {
  const gcode    = useToolpathStore((s) => s.gcode);
  const opRanges = useToolpathStore((s) => s.opRanges);
  const warnings = useToolpathStore((s) => s.warnings);
  const toolpaths          = useToolpathStore((s) => s.toolpaths);
  const animProgress       = useToolpathStore((s) => s.animProgress);
  const isAnimating        = useToolpathStore((s) => s.isAnimating);
  const setAnimProgress    = useToolpathStore((s) => s.setAnimProgress);
  const startAnimation     = useToolpathStore((s) => s.startAnimation);
  const stopAnimation      = useToolpathStore((s) => s.stopAnimation);
  const resetAnimation     = useToolpathStore((s) => s.resetAnimation);
  const selectedLine       = useToolpathStore((s) => s.selectedLine);
  const toggleSelectedLine = useToolpathStore((s) => s.toggleSelectedLine);
  const setShowToolpaths = useUiStore((s) => s.setShowToolpaths);
  const fileName = useStepStore((s) => s.fileName);

  const { templates } = useTemplates();

  // Reverse sync: scrubbing/playing the preview highlights the matching G-code
  // line (and the manual click→marker forward sync still works at rest).
  useCursorLineSync();

  useEffect(() => {
    setShowToolpaths(true);
  }, [setShowToolpaths]);

  const lineCount = useMemo(
    () => (gcode ? gcode.split("\n").length : 0),
    [gcode],
  );

  const totalSec = totalDurationSeconds(opRanges, templates);
  const cycleTotal = formatTime(1, totalSec);
  const hasGcode = gcode && gcode.trim().length > 0;

  const defaultName = fileName
    ? `${fileName.replace(/\.(step|stp)$/i, "")}.nc`
    : "untitled.nc";

  return (
    <div style={STYLES.shell}>
      <div style={STYLES.meta}>
        <div style={STYLES.metaStat}>
          <span style={STYLES.metaLabel}>Machine</span>
          <strong style={STYLES.metaValue}>HMC-470</strong>
        </div>
        <div style={STYLES.metaSep} />
        <div style={STYLES.metaStat}>
          <span style={STYLES.metaLabel}>Lines</span>
          <strong style={STYLES.metaValue}>{lineCount}</strong>
        </div>
        <div style={STYLES.metaSep} />
        <div style={STYLES.metaStat}>
          <span style={STYLES.metaLabel}>Cycle time</span>
          <strong style={STYLES.metaValue}>{cycleTotal}</strong>
        </div>
        <div style={STYLES.metaSep} />
        <div style={STYLES.metaStat}>
          <span style={STYLES.metaLabel}>Warnings</span>
          <strong style={{
            ...STYLES.metaValue,
            ...(warnings?.length ? STYLES.warn : {}),
          }}>
            {warnings?.length || 0}
          </strong>
        </div>
        <button
          style={{
            ...STYLES.exportBtn,
            ...(hasGcode ? {} : STYLES.exportBtnDisabled),
          }}
          disabled={!hasGcode}
          onClick={() => downloadGcode(gcode, defaultName)}
        >
          <I.download /> Export .nc
        </button>
      </div>

      {!hasGcode ? (
        <div style={{ ...STYLES.card, flex: 1, justifyContent: "center" }}>
          <div style={STYLES.empty}>
            <I.cube />
            <div>No G-code yet.</div>
            <div style={{ fontSize: 11, color: "var(--muted-2)" }}>
              Run setup on the Setup tab to compile your timeline.
            </div>
          </div>
        </div>
      ) : (
        <div style={STYLES.body}>
          <div style={STYLES.card}>
            <div style={STYLES.cardHead}>G-code · {lineCount} lines</div>
            <GcodeView
              gcode={gcode}
              opRanges={opRanges}
              selectedLine={selectedLine}
              onSelectLine={toggleSelectedLine}
            />
          </div>
          <div style={STYLES.card}>
            <div style={STYLES.cardHead}>Preview · click a G-code line to locate it</div>
            <div style={STYLES.viewport}>
              <StepViewport />
            </div>
          </div>
        </div>
      )}

      {hasGcode && toolpaths.length > 0 && (
        <div style={STYLES.scrubBar}>
          <button
            style={STYLES.scrubBtn}
            onClick={resetAnimation}
            title="Rewind"
          >
            <I.rewind />
          </button>
          <button
            style={{ ...STYLES.scrubBtn, ...STYLES.scrubBtnPrimary }}
            onClick={() => (isAnimating ? stopAnimation() : startAnimation())}
            title={isAnimating ? "Pause" : "Play"}
          >
            {isAnimating ? <I.pause /> : <I.play />}
          </button>
          <input
            type="range"
            min={0}
            max={1}
            step={0.001}
            value={animProgress}
            onChange={(e) => setAnimProgress(parseFloat(e.target.value))}
            style={STYLES.scrubRange}
            aria-label="Scrub toolpath preview"
          />
          <span style={STYLES.scrubTime}>
            {formatTime(animProgress, totalSec || 60)}
            {" / "}
            {formatTime(1, totalSec || 60)}
          </span>
        </div>
      )}
    </div>
  );
}

export { downloadGcode };
