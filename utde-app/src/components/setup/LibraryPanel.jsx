/**
 * LibraryPanel — the right-side template browser.
 *
 * Fetches the registered templates from /templates, groups them by their
 * free-form `kind` tag (per Q4(a) decision), and renders a section per
 * group. The three Forgepath kinds get coloured accents (add → green,
 * sub → orange, hyb → gradient); any other kind gets a neutral fallback.
 *
 * Clicking a card calls onApply(template), which in SetupTab wires through
 * to opsStore.applyTemplate() — that creates the timeline entry, switches
 * rpMode to "params", and sets the prompt slot for geometry. The filter
 * also gets advanced to the first required pick type.
 */

import { useMemo, useState } from "react";
import I from "../icons";
import { useTemplates } from "../../lib/templateLoader";
import { useOpsStore } from "../../store/opsStore";
import { useUiStore } from "../../store/uiStore";

const SCENE_CARDS = [
  {
    action: "import",
    label:  "Import CAD",
    Icon:   I.cube,
    description: "Load a STEP file into the build area.",
  },
  {
    action: "clear",
    label:  "Clear part",
    Icon:   I.x,
    description: "Wipe whatever's currently loaded in the build area.",
  },
];

const KIND_META = {
  add: { label: "Additive",    pillLabel: "+ deposit",       accent: "var(--add)",  soft: "var(--add-soft)" },
  sub: { label: "Subtractive", pillLabel: "− remove",        accent: "var(--sub)",  soft: "var(--sub-soft)" },
  hyb: { label: "Hybrid",      pillLabel: "± print + finish",
         accent: "var(--ink-2)",
         soft: "linear-gradient(90deg, var(--add-soft), var(--sub-soft))" },
};

function kindMeta(kind) {
  if (kind && KIND_META[kind]) return KIND_META[kind];
  return {
    label: kind ? kind.charAt(0).toUpperCase() + kind.slice(1) : "Other",
    pillLabel: kind || "uncategorised",
    accent: "var(--ink-2)",
    soft: "var(--panel-2)",
  };
}

const STYLES = {
  panel: {
    height: "100%",
    background: "var(--panel)",
    border: "1px solid var(--border)",
    borderRadius: "var(--r-lg)",
    boxShadow: "var(--shadow-sm)",
    display: "flex",
    flexDirection: "column",
    minHeight: 0,
  },
  head: {
    padding: "12px 14px",
    borderBottom: "1px solid var(--border)",
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
  },
  headTitle: {
    fontSize: 11.5, fontWeight: 600, textTransform: "uppercase",
    letterSpacing: "0.04em", color: "var(--ink-2)",
  },
  body: {
    flex: 1, minHeight: 0, overflowY: "auto",
    padding: "10px 12px", display: "flex", flexDirection: "column", gap: 12,
  },
  search: {
    display: "flex", alignItems: "center", gap: 8,
    padding: "6px 10px",
    background: "var(--panel-2)",
    border: "1px solid var(--border)",
    borderRadius: "var(--r-sm)",
    color: "var(--muted)",
  },
  searchInput: {
    border: 0, outline: "none", flex: 1, background: "transparent",
    fontSize: 12, color: "var(--ink)", fontFamily: "inherit",
  },
  kbd: {
    fontSize: 10,
    padding: "1px 5px",
    border: "1px solid var(--border)",
    borderRadius: 4,
    color: "var(--ink-2)",
    background: "var(--panel)",
  },
  section: { display: "flex", flexDirection: "column", gap: 6 },
  sectionHead: {
    display: "flex", alignItems: "center", gap: 8,
    fontSize: 11, fontWeight: 600, color: "var(--ink-2)",
    textTransform: "uppercase", letterSpacing: "0.04em",
    padding: "4px 2px",
  },
  pill: (soft, accent) => ({
    display: "inline-flex", alignItems: "center",
    padding: "2px 8px", borderRadius: 999,
    background: soft,
    border: `1px solid ${accent === "var(--ink-2)" ? "var(--border)" : "transparent"}`,
    color: accent, fontSize: 10,
    textTransform: "none", letterSpacing: 0,
    fontWeight: 500,
  }),
  card: {
    display: "flex", alignItems: "center", gap: 10,
    padding: "8px 10px",
    border: "1px solid transparent",
    borderRadius: "var(--r-md)",
    cursor: "pointer",
    background: "transparent",
    textAlign: "left",
    transition: "background 0.12s, border-color 0.12s",
  },
  iconSquare: (accent, soft) => ({
    width: 28, height: 28,
    display: "flex", alignItems: "center", justifyContent: "center",
    borderRadius: 8,
    background: soft,
    color: accent,
    flexShrink: 0,
  }),
  cardName: { fontSize: 12.5, fontWeight: 500, color: "var(--ink)" },
  cardMeta: {
    fontSize: 11, color: "var(--muted)",
    fontFamily: "var(--font-mono)",
    marginTop: 2,
  },
  empty: {
    padding: "20px 12px",
    color: "var(--muted)",
    fontSize: 12,
    textAlign: "center",
  },
};

export default function LibraryPanel() {
  const { templates, loading, error, refresh } = useTemplates();
  const applyTemplate = useOpsStore((s) => s.applyTemplate);
  const applyScene    = useOpsStore((s) => s.applyScene);
  const setFilter     = useUiStore((s) => s.setFilter);

  const [query, setQuery] = useState("");

  const grouped = useMemo(() => {
    const q = query.trim().toLowerCase();
    const filtered = q
      ? templates.filter((t) =>
          (t.label || t.id).toLowerCase().includes(q) ||
          t.id.toLowerCase().includes(q)
        )
      : templates;

    const order = ["add", "sub", "hyb"];
    const buckets = new Map();
    for (const t of filtered) {
      const k = t.kind || "other";
      if (!buckets.has(k)) buckets.set(k, []);
      buckets.get(k).push(t);
    }
    const sortedKeys = [
      ...order.filter((k) => buckets.has(k)),
      ...Array.from(buckets.keys()).filter((k) => !order.includes(k)).sort(),
    ];
    return sortedKeys.map((k) => ({ kind: k, items: buckets.get(k) }));
  }, [templates, query]);

  function handleApply(template) {
    applyTemplate(template);
    const firstReq = (template.requires || [])[0];
    if (firstReq && firstReq.type) setFilter(firstReq.type);
  }

  return (
    <div style={STYLES.panel}>
      <div style={STYLES.head}>
        <div style={STYLES.headTitle}>Operation Library</div>
      </div>

      <div style={STYLES.body}>
        <div style={STYLES.search}>
          <I.search size={14} />
          <input
            style={STYLES.searchInput}
            placeholder="Search operations…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
          <span className="mono" style={STYLES.kbd}>⌘K</span>
        </div>

        {!query && (
          <div style={STYLES.section}>
            <div style={STYLES.sectionHead}>
              <span>Scene</span>
              <span style={STYLES.pill("var(--panel-2)", "var(--ink-2)")}>build area</span>
            </div>
            {SCENE_CARDS.map((s) => {
              const Icon = s.Icon;
              return (
                <button
                  key={s.action}
                  type="button"
                  onClick={() => applyScene(s.action)}
                  style={STYLES.card}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.background = "var(--panel-2)";
                    e.currentTarget.style.borderColor = "var(--border)";
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.background = "transparent";
                    e.currentTarget.style.borderColor = "transparent";
                  }}
                >
                  <div style={STYLES.iconSquare("var(--ink-2)", "var(--panel-2)")}>
                    <Icon />
                  </div>
                  <div>
                    <div style={STYLES.cardName}>{s.label}</div>
                    <div style={STYLES.cardMeta}>{s.description}</div>
                  </div>
                </button>
              );
            })}
          </div>
        )}

        {loading && <div style={STYLES.empty}>Loading templates…</div>}
        {error   && (
          <div style={STYLES.empty}>
            <div>Failed to load templates: {error.message}</div>
            <button
              type="button"
              style={{
                marginTop: 8, padding: "5px 12px",
                border: "1px solid var(--border)",
                borderRadius: "var(--r-sm)",
                background: "var(--panel)",
                color: "var(--ink)",
                cursor: "pointer", fontSize: 11,
              }}
              onClick={refresh}
            >
              Retry
            </button>
          </div>
        )}
        {!loading && !error && grouped.length === 0 && (
          <div style={STYLES.empty}>No matching operations.</div>
        )}

        {grouped.map(({ kind, items }) => {
          const meta = kindMeta(kind);
          return (
            <div key={kind} style={STYLES.section}>
              <div style={STYLES.sectionHead}>
                <span>{meta.label}</span>
                <span style={STYLES.pill(meta.soft, meta.accent)}>{meta.pillLabel}</span>
              </div>
              {items.map((t) => {
                const Icon = I[t.icon] || I.op;
                const reqType = (t.requires || [])[0]?.type;
                const reqCount = (t.requires || [])[0]?.count;
                const reqLabel = reqType
                  ? `requires ${reqType}${reqCount === 0 ? " (n)" : ""}`
                  : "no geometry";
                const time = t.est_time != null ? ` · ~${t.est_time} min` : "";
                return (
                  <button
                    key={t.id}
                    type="button"
                    onClick={() => handleApply(t)}
                    style={STYLES.card}
                    onMouseEnter={(e) => {
                      e.currentTarget.style.background = "var(--panel-2)";
                      e.currentTarget.style.borderColor = "var(--border)";
                    }}
                    onMouseLeave={(e) => {
                      e.currentTarget.style.background = "transparent";
                      e.currentTarget.style.borderColor = "transparent";
                    }}
                  >
                    <div style={STYLES.iconSquare(meta.accent, meta.soft)}>
                      <Icon />
                    </div>
                    <div>
                      <div style={STYLES.cardName}>{t.label || t.id}</div>
                      <div style={STYLES.cardMeta}>{reqLabel}{time}</div>
                    </div>
                  </button>
                );
              })}
            </div>
          );
        })}
      </div>
    </div>
  );
}

export { kindMeta };
