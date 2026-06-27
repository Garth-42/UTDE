/**
 * CollapsibleSection — a labelled, collapsible block used inside the Utilities
 * panel. A full-width header button (title + chevron) toggles its body. Pass a
 * `storageKey` to remember the collapsed state across sessions (localStorage).
 */
import { useState } from "react";

const STYLES = {
  section: { display: "flex", flexDirection: "column", gap: 8 },
  header: {
    display: "flex", alignItems: "center", justifyContent: "space-between",
    width: "100%", padding: "2px 0", background: "none", border: 0,
    cursor: "pointer", color: "var(--ink-2)",
    fontSize: 11, fontWeight: 600, textTransform: "uppercase",
    letterSpacing: "0.04em",
  },
  chevron: { color: "var(--muted)", fontSize: 10 },
  body: { display: "flex", flexDirection: "column", gap: 8 },
};

export default function CollapsibleSection({ title, storageKey, defaultCollapsed = false, children }) {
  const lsKey = storageKey ? `utde-section-${storageKey}` : null;
  const [collapsed, setCollapsed] = useState(() => {
    if (lsKey) {
      try {
        const v = localStorage.getItem(lsKey);
        if (v != null) return v === "1";
      } catch (e) { /* ignore */ }
    }
    return defaultCollapsed;
  });
  const toggle = () =>
    setCollapsed((c) => {
      const next = !c;
      if (lsKey) {
        try { localStorage.setItem(lsKey, next ? "1" : "0"); } catch (e) { /* ignore */ }
      }
      return next;
    });
  return (
    <div style={STYLES.section}>
      <button
        type="button"
        style={STYLES.header}
        aria-expanded={!collapsed}
        onClick={toggle}
      >
        <span>{title}</span>
        <span style={STYLES.chevron}>{collapsed ? "▸" : "▾"}</span>
      </button>
      {!collapsed && <div style={STYLES.body}>{children}</div>}
    </div>
  );
}
