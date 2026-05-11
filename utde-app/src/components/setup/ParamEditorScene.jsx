/**
 * ParamEditorScene — right-panel editor for an active scene timeline row.
 *
 * Two action types:
 *   - "import": shows the currently linked STEP file and a "Choose file…"
 *     label-as-button that opens a native file picker. Tauri builds get a
 *     dialog button instead.
 *   - "clear":  shows whatever is loaded and a "Run clear" button that
 *     wipes stepStore back to empty.
 *
 * Scene rows are skipped by /compile-timeline — they're imperative actions
 * on the live `stepStore` rather than templates that produce toolpaths.
 */

import I from "../icons";
import { useOpsStore } from "../../store/opsStore";
import { useStepStore } from "../../store/stepStore";
import {
  importStepFromFile, importStepViaTauri, clearImportedStep,
} from "../../lib/stepImporter";
import { IS_TAURI } from "../../lib/backend";

const STYLES = {
  panel: {
    height: "100%",
    background: "var(--panel)",
    border: "1px solid var(--border)",
    borderRadius: "var(--r-lg)",
    boxShadow: "var(--shadow-sm)",
    display: "flex", flexDirection: "column",
    minHeight: 0,
  },
  head: {
    padding: "12px 14px",
    borderBottom: "1px solid var(--border)",
    display: "flex", alignItems: "center", justifyContent: "space-between",
  },
  headTitle: {
    fontSize: 11.5, fontWeight: 600, textTransform: "uppercase",
    letterSpacing: "0.04em", color: "var(--ink-2)",
  },
  iconBtn: {
    width: 24, height: 24,
    display: "flex", alignItems: "center", justifyContent: "center",
    borderRadius: 4, border: "1px solid var(--border)",
    background: "var(--panel)", color: "var(--ink-2)",
    cursor: "pointer",
  },
  body: {
    flex: 1, minHeight: 0, overflowY: "auto",
    padding: "12px 14px",
    display: "flex", flexDirection: "column", gap: 12,
  },
  summary: {
    display: "flex", alignItems: "center", gap: 10,
    padding: "8px 10px",
    border: "1px solid var(--border)",
    background: "var(--panel-2)",
    borderRadius: "var(--r-md)",
  },
  summaryIcon: {
    width: 28, height: 28,
    display: "flex", alignItems: "center", justifyContent: "center",
    borderRadius: 6,
    background: "var(--panel)", color: "var(--ink-2)",
    border: "1px solid var(--border)",
  },
  summaryTitle: { fontSize: 12.5, fontWeight: 500, color: "var(--ink)" },
  summarySub:   { fontSize: 11, color: "var(--muted)", marginTop: 2 },

  label: { fontSize: 12, color: "var(--ink-2)" },
  fileRow: {
    display: "flex", alignItems: "center", gap: 8,
    padding: "8px 10px",
    border: "1px solid var(--border)",
    borderRadius: "var(--r-md)",
    background: "var(--panel-2)",
    fontFamily: "var(--font-mono)",
    fontSize: 12, color: "var(--ink-2)",
    minHeight: 36,
  },
  fileName: {
    flex: 1, minWidth: 0,
    overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
  },

  primaryBtn: (busy) => ({
    display: "flex", alignItems: "center", justifyContent: "center", gap: 6,
    padding: "8px 12px",
    border: "1px solid var(--ink)",
    background: "var(--ink)",
    color: "var(--panel)",
    borderRadius: "var(--r-sm)",
    fontSize: 12, fontWeight: 500,
    cursor: busy ? "wait" : "pointer",
    opacity: busy ? 0.7 : 1,
    width: "100%",
  }),
  ghostBtn: {
    display: "flex", alignItems: "center", justifyContent: "center", gap: 6,
    padding: "8px 12px",
    border: "1px solid var(--border)",
    background: "var(--panel)",
    color: "var(--ink)",
    borderRadius: "var(--r-sm)",
    fontSize: 12,
    cursor: "pointer",
    width: "100%",
  },
  hint: { fontSize: 11, color: "var(--muted)" },
  error: { fontSize: 11, color: "var(--warn)" },
};

const ACTION_META = {
  import: { label: "Import CAD",  Icon: I.cube,  hint: "Load a STEP file into the build area." },
  clear:  { label: "Clear part",  Icon: I.x,     hint: "Remove the loaded part from the build area." },
};

function FileLabel() {
  const fileName = useStepStore((s) => s.fileName);
  const error    = useStepStore((s) => s.error);
  return (
    <>
      <div style={STYLES.fileRow}>
        <span style={STYLES.fileName}>{fileName || "no file loaded"}</span>
      </div>
      {error && <div style={STYLES.error}>{error}</div>}
    </>
  );
}

function ImportEditor() {
  const isLoading = useStepStore((s) => s.isLoading);
  return (
    <>
      <div>
        <div style={STYLES.label}>File</div>
        <FileLabel />
      </div>

      {IS_TAURI ? (
        <button
          style={STYLES.primaryBtn(isLoading)}
          onClick={() => importStepViaTauri()}
          disabled={isLoading}
        >
          <I.upload />
          <span>{isLoading ? "Loading…" : "Choose file…"}</span>
        </button>
      ) : (
        <label style={STYLES.primaryBtn(isLoading)}>
          <I.upload />
          <span>{isLoading ? "Loading…" : "Choose file…"}</span>
          <input
            type="file"
            accept=".step,.stp,.STEP,.STP"
            onChange={async (e) => {
              const file = e.target.files?.[0];
              e.target.value = "";
              if (file) {
                try { await importStepFromFile(file); } catch { /* surfaced via store.error */ }
              }
            }}
            disabled={isLoading}
            style={{
              position: "absolute",
              width: 1, height: 1, padding: 0, margin: -1,
              overflow: "hidden", clip: "rect(0,0,0,0)",
              whiteSpace: "nowrap", border: 0,
            }}
          />
        </label>
      )}

      <p style={STYLES.hint}>
        The same file is shared across the timeline. Importing a new file
        replaces what's currently loaded.
      </p>
    </>
  );
}

function ClearEditor() {
  const fileName = useStepStore((s) => s.fileName);
  return (
    <>
      <div>
        <div style={STYLES.label}>Current part</div>
        <FileLabel />
      </div>

      <button
        type="button"
        style={STYLES.primaryBtn(false)}
        onClick={() => clearImportedStep()}
        disabled={!fileName}
      >
        <I.trash />
        <span>Clear build area</span>
      </button>

      <p style={STYLES.hint}>
        Wipes the loaded geometry and any selections. Operations that depend
        on geometry won't have anything to operate on after this.
      </p>
    </>
  );
}

export default function ParamEditorScene() {
  const entries     = useOpsStore((s) => s.entries);
  const activeIdx   = useOpsStore((s) => s.activeIdx);
  const setRpMode   = useOpsStore((s) => s.setRpMode);

  const entry = activeIdx != null ? entries[activeIdx] : null;
  if (!entry || entry.kind !== "scene") return null;

  const meta = ACTION_META[entry.action] || { label: entry.action, Icon: I.op, hint: "" };
  const Icon = meta.Icon;

  return (
    <div style={STYLES.panel}>
      <div style={STYLES.head}>
        <div style={STYLES.headTitle}>Scene</div>
        <button
          style={STYLES.iconBtn}
          onClick={() => setRpMode("library")}
          title="Back to library"
        >
          <I.x />
        </button>
      </div>

      <div style={STYLES.body}>
        <div style={STYLES.summary}>
          <div style={STYLES.summaryIcon}><Icon /></div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={STYLES.summaryTitle}>{entry.name || meta.label}</div>
            <div style={STYLES.summarySub}>
              scene · row {String(activeIdx + 1).padStart(2, "0")}
            </div>
          </div>
        </div>

        {entry.action === "import" && <ImportEditor />}
        {entry.action === "clear"  && <ClearEditor />}
      </div>
    </div>
  );
}
