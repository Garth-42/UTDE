/**
 * CollapsibleSection — a labelled, collapsible block used inside the Utilities
 * panel. A full-width header button (title + chevron) toggles its body.
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

export default function CollapsibleSection({ title, defaultCollapsed = false, children }) {
  const [collapsed, setCollapsed] = useState(defaultCollapsed);
  return (
    <div style={STYLES.section}>
      <button
        type="button"
        style={STYLES.header}
        aria-expanded={!collapsed}
        onClick={() => setCollapsed((c) => !c)}
      >
        <span>{title}</span>
        <span style={STYLES.chevron}>{collapsed ? "▸" : "▾"}</span>
      </button>
      {!collapsed && <div style={STYLES.body}>{children}</div>}
    </div>
  );
}
