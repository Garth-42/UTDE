/**
 * GcodeView — syntax-tinted, per-op-tinted G-code listing.
 *
 * Each line is parsed into typed spans by lib/gcodeParse and rendered with
 * the design-token colours. The whole-line background is tinted by the op
 * kind of the line (using op_ranges.gcode_start_line/end_line) so additive
 * blocks read green-soft and subtractive blocks read orange-soft.
 */

import { useEffect, useMemo, useRef } from "react";
import { parseGcodeLine, kindForLine } from "../../lib/gcodeParse";

const KIND_BG = {
  add: "var(--add-soft)",
  sub: "var(--sub-soft)",
  hyb: "linear-gradient(90deg, var(--add-soft), var(--sub-soft))",
};

const SPAN_COLOR = {
  code:    "oklch(50% 0.13 260)",
  coord:   "oklch(50% 0.12 25)",
  comment: "var(--muted)",
  text:    "var(--ink)",
};

const STYLES = {
  shell: {
    flex: 1, minHeight: 0,
    overflow: "auto",
    background: "var(--panel)",
    border: "1px solid var(--border)",
    borderRadius: "var(--r-md)",
    fontFamily: "var(--font-mono)",
    fontSize: 12,
    lineHeight: 1.45,
  },
  row: (bg, selected) => ({
    display: "flex",
    background: selected ? "rgba(255, 204, 51, 0.22)" : bg || "transparent",
    boxShadow: selected ? "inset 3px 0 0 #ffcc33" : "none",
    cursor: "pointer",
  }),
  num: {
    flex: "0 0 48px",
    paddingRight: 14,
    color: "var(--muted-2)",
    textAlign: "right",
    userSelect: "none",
  },
  text: { flex: 1, whiteSpace: "pre", paddingRight: 16 },
};

export default function GcodeView({
  gcode = "",
  opRanges = [],
  selectedLine = null,
  onSelectLine,
}) {
  const lines = useMemo(() => gcode.split("\n"), [gcode]);
  const selectedRef = useRef(null);

  // Bring the selected line into view (drives the reverse sync: when playback
  // or a click changes the selection, the listing scrolls to it).
  useEffect(() => {
    const el = selectedRef.current;
    if (el && typeof el.scrollIntoView === "function") {
      try {
        el.scrollIntoView({ block: "nearest" });
      } catch (e) {
        /* jsdom / unsupported — ignore */
      }
    }
  }, [selectedLine]);

  return (
    <div style={STYLES.shell}>
      {lines.map((line, i) => {
        const kind = kindForLine(i, opRanges);
        const bg = kind ? KIND_BG[kind] : null;
        const selected = i === selectedLine;
        const spans = parseGcodeLine(line);
        return (
          <div
            key={i}
            ref={selected ? selectedRef : null}
            style={STYLES.row(bg, selected)}
            onClick={() => onSelectLine?.(i)}
            aria-selected={selected}
          >
            <span style={STYLES.num}>{i + 1}</span>
            <span style={STYLES.text}>
              {spans.length === 0 ? (
                <span> </span>
              ) : (
                spans.map((s, j) => (
                  <span key={j} style={{ color: SPAN_COLOR[s.type] || "var(--ink)" }}>
                    {s.text}
                  </span>
                ))
              )}
            </span>
          </div>
        );
      })}
    </div>
  );
}
