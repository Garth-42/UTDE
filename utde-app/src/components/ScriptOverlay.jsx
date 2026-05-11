/**
 * ScriptOverlay — always-available read-only Python view of the timeline.
 *
 * Per Q2(b): the timeline is the canonical authoring surface; this drawer
 * shows the equivalent Python (one-way generation via timelineToScript).
 * Toggled from the TopBar `</>` button (uiStore.scriptOverlayOpen).
 *
 * Slides in from the right and overlays whichever tab is active.
 */

import { useMemo, useState } from "react";
import I from "./icons";
import { useOpsStore } from "../store/opsStore";
import { useUiStore } from "../store/uiStore";
import { useMachineStore } from "../store/machineStore";
import { timelineToScript } from "../lib/timelineToScript";

const STYLES = {
  backdrop: {
    position: "fixed",
    inset: 0,
    background: "rgba(20, 18, 12, 0.18)",
    zIndex: 20,
  },
  drawer: {
    position: "fixed",
    top: 0, right: 0, bottom: 0,
    width: 560, maxWidth: "90vw",
    background: "var(--panel)",
    borderLeft: "1px solid var(--border)",
    boxShadow: "var(--shadow-lg)",
    zIndex: 21,
    display: "flex",
    flexDirection: "column",
  },
  head: {
    padding: "12px 14px",
    borderBottom: "1px solid var(--border)",
    display: "flex",
    alignItems: "center",
    gap: 10,
  },
  title: {
    fontSize: 11.5, fontWeight: 600, textTransform: "uppercase",
    letterSpacing: "0.04em", color: "var(--ink-2)",
  },
  sub: {
    fontSize: 11, color: "var(--muted)",
  },
  flex: { flex: 1 },
  copyBtn: (copied) => ({
    display: "flex", alignItems: "center", gap: 6,
    padding: "5px 10px",
    border: "1px solid var(--border)",
    borderRadius: "var(--r-sm)",
    background: copied ? "var(--add-soft)" : "var(--panel)",
    color: copied ? "var(--add)" : "var(--ink-2)",
    fontSize: 11,
    cursor: "pointer",
  }),
  closeBtn: {
    width: 28, height: 28,
    display: "flex", alignItems: "center", justifyContent: "center",
    borderRadius: 4, border: "1px solid var(--border)",
    background: "var(--panel)", color: "var(--ink-2)",
    cursor: "pointer",
  },
  body: {
    flex: 1, minHeight: 0,
    overflow: "auto",
    padding: "12px 14px",
    background: "var(--panel-2)",
  },
  pre: {
    margin: 0,
    fontFamily: "var(--font-mono)",
    fontSize: 12,
    color: "var(--ink)",
    whiteSpace: "pre",
    lineHeight: 1.5,
  },
  footer: {
    padding: "8px 14px",
    borderTop: "1px solid var(--border)",
    fontSize: 11,
    color: "var(--muted)",
  },
};

export default function ScriptOverlay() {
  const open      = useUiStore((s) => s.scriptOverlayOpen);
  const setOpen   = useUiStore((s) => s.setScriptOverlay);
  const entries   = useOpsStore((s) => s.entries);
  const machineId = useMachineStore((s) => s.currentId);

  const [copied, setCopied] = useState(false);

  const script = useMemo(
    () => timelineToScript(entries, { machine: machineId || undefined }),
    [entries, machineId],
  );

  async function copy() {
    try {
      await navigator.clipboard.writeText(script);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      // clipboard API may be unavailable (insecure context); just no-op
    }
  }

  if (!open) return null;

  return (
    <>
      <div style={STYLES.backdrop} onClick={() => setOpen(false)} />
      <aside style={STYLES.drawer} role="dialog" aria-label="Generated Python">
        <div style={STYLES.head}>
          <div>
            <div style={STYLES.title}>Generated Python</div>
            <div style={STYLES.sub}>Read-only · derived from the timeline</div>
          </div>
          <div style={STYLES.flex} />
          <button style={STYLES.copyBtn(copied)} onClick={copy}>
            {copied ? <I.check /> : <I.copy />}
            <span>{copied ? "Copied" : "Copy"}</span>
          </button>
          <button
            style={STYLES.closeBtn}
            onClick={() => setOpen(false)}
            title="Close"
          >
            <I.x />
          </button>
        </div>
        <div style={STYLES.body}>
          <pre style={STYLES.pre}>{script}</pre>
        </div>
        <div style={STYLES.footer}>
          The timeline is the source of truth. Edits here don't round-trip back.
        </div>
      </aside>
    </>
  );
}
