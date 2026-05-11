/**
 * MachinePicker — popover anchored under the TopBar machine pill.
 *
 * Lists every machine from /machines, highlights the current selection,
 * lets the user import a new YAML. Click-outside dismisses; the parent
 * owns the open state via `open` / `onClose` props.
 */

import { useEffect, useRef } from "react";
import I from "./icons";
import { useMachineStore } from "../store/machineStore";
import { useMachines, importMachine, fetchMachines } from "../lib/machineLoader";

const STYLES = {
  backdrop: {
    position: "fixed",
    inset: 0,
    zIndex: 25,
  },
  popover: {
    position: "absolute",
    top: 52 + 4,            // below the TopBar
    minWidth: 320,
    maxWidth: 380,
    background: "var(--panel)",
    border: "1px solid var(--border)",
    borderRadius: "var(--r-md)",
    boxShadow: "var(--shadow-md)",
    zIndex: 26,
    overflow: "hidden",
    display: "flex",
    flexDirection: "column",
  },
  head: {
    padding: "10px 12px",
    borderBottom: "1px solid var(--border)",
    display: "flex",
    alignItems: "center",
    gap: 8,
  },
  title: {
    fontSize: 11.5, fontWeight: 600,
    textTransform: "uppercase", letterSpacing: "0.04em",
    color: "var(--ink-2)",
  },
  refresh: {
    marginLeft: "auto",
    width: 22, height: 22,
    display: "flex", alignItems: "center", justifyContent: "center",
    border: "1px solid var(--border)",
    borderRadius: 4,
    background: "var(--panel)", color: "var(--ink-2)",
    cursor: "pointer",
  },
  list: {
    maxHeight: 280,
    overflowY: "auto",
    padding: 6,
    display: "flex",
    flexDirection: "column",
    gap: 4,
  },
  item: (active) => ({
    display: "flex",
    alignItems: "center",
    gap: 10,
    padding: "8px 10px",
    border: `1px solid ${active ? "var(--sel)" : "transparent"}`,
    background: active ? "var(--sel-soft)" : "var(--panel)",
    borderRadius: "var(--r-sm)",
    cursor: "pointer",
    textAlign: "left",
    width: "100%",
  }),
  itemBody: { flex: 1, minWidth: 0 },
  itemName: { fontSize: 12.5, fontWeight: 500, color: "var(--ink)" },
  itemMeta: {
    fontSize: 11, color: "var(--muted)",
    fontFamily: "var(--font-mono)",
    marginTop: 2,
    whiteSpace: "nowrap",
    overflow: "hidden", textOverflow: "ellipsis",
  },
  check: { color: "var(--sel)", flexShrink: 0 },

  empty: {
    padding: "20px 12px",
    fontSize: 12, color: "var(--muted)",
    textAlign: "center",
  },
  error: {
    padding: "8px 12px",
    fontSize: 11, color: "var(--warn)",
    background: "var(--panel-2)",
    borderTop: "1px solid var(--border)",
  },

  importRow: {
    padding: "10px 12px",
    borderTop: "1px solid var(--border)",
    display: "flex", alignItems: "center", gap: 8,
  },
  importBtn: {
    display: "flex", alignItems: "center", gap: 6,
    padding: "6px 10px",
    border: "1px solid var(--border)",
    background: "var(--panel)",
    color: "var(--ink)",
    borderRadius: "var(--r-sm)",
    fontSize: 12,
    cursor: "pointer",
  },
  importHint: {
    fontSize: 11, color: "var(--muted)",
  },
};

export default function MachinePicker({ open, onClose, anchorRect }) {
  const { available, currentId, loading, error } = useMachines();
  const setCurrentId = useMachineStore((s) => s.setCurrentId);
  const fileInputRef = useRef(null);

  useEffect(() => {
    if (!open) return;
    function onKey(e) {
      if (e.key === "Escape") onClose();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open) return null;

  const left = anchorRect
    ? Math.max(10, Math.min(anchorRect.left, (anchorRect.right || 0) - 320))
    : 14;

  function pick(id) {
    setCurrentId(id);
    onClose();
  }

  async function onFileChange(e) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    try {
      await importMachine(file);
    } catch {
      // error is in the store
    }
  }

  return (
    <>
      <div style={STYLES.backdrop} onClick={onClose} />
      <div style={{ ...STYLES.popover, left }} role="dialog" aria-label="Machine picker">
        <div style={STYLES.head}>
          <span style={STYLES.title}>Machine</span>
          <button
            style={STYLES.refresh}
            onClick={() => fetchMachines().catch(() => {})}
            title="Refresh list"
          >
            <I.rotate />
          </button>
        </div>

        {loading && available.length === 0 ? (
          <div style={STYLES.empty}>Loading machines…</div>
        ) : available.length === 0 ? (
          <div style={STYLES.empty}>
            No machines in <span className="mono">machines/</span>. Import a YAML below.
          </div>
        ) : (
          <div style={STYLES.list}>
            {available.map((m) => {
              const active = m.id === currentId;
              const axes = [...(m.tool_axes || []), ...(m.workpiece_axes || [])];
              return (
                <button
                  key={m.id}
                  type="button"
                  onClick={() => pick(m.id)}
                  style={STYLES.item(active)}
                >
                  <div style={STYLES.itemBody}>
                    <div style={STYLES.itemName}>{m.name || m.id}</div>
                    <div style={STYLES.itemMeta}>
                      {m.axis_count}-axis · {axes.join(" ") || "—"}
                    </div>
                  </div>
                  {active && <span style={STYLES.check}><I.check /></span>}
                </button>
              );
            })}
          </div>
        )}

        {error && <div style={STYLES.error}>{error}</div>}

        <div style={STYLES.importRow}>
          <button
            type="button"
            style={STYLES.importBtn}
            onClick={() => fileInputRef.current?.click()}
          >
            <I.upload /> Import YAML…
          </button>
          <span style={STYLES.importHint}>
            Saved to <span className="mono">machines/</span>
          </span>
          <input
            ref={fileInputRef}
            type="file"
            accept=".yaml,.yml"
            onChange={onFileChange}
            style={{ display: "none" }}
          />
        </div>
      </div>
    </>
  );
}
