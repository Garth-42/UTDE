/**
 * G-code line tokeniser for the Post view.
 *
 * Each line becomes an array of typed spans the renderer can colour:
 *   "code"    — G/M/T/S/F/H letters and their numeric value (e.g. G1, M30, F1200)
 *   "coord"   — X/Y/Z/I/J/K/A/B/C/U/V/W coordinates (e.g. X12.5, Z-3)
 *   "comment" — everything from `;` to end of line, OR a whole line starting with `(`
 *   "text"    — anything else (whitespace, unclassified tokens)
 */

const CODE_LETTERS  = "GMTSFHN";
const COORD_LETTERS = "XYZIJKABCUVW";

const NUMERIC = /^[+-]?(?:\d+\.\d*|\.\d+|\d+)(?:[eE][+-]?\d+)?/;

/** Tokenise a single line. Returns [{ type, text }]. */
export function parseGcodeLine(line) {
  if (!line) return [];
  // Whole-line comment forms: starts with `(` … `)` or starts with `;`
  const trimmed = line.trimStart();
  if (trimmed.startsWith("(") || trimmed.startsWith(";")) {
    return [{ type: "comment", text: line }];
  }

  const spans = [];
  let i = 0;
  let buf = "";
  function flushBuf() {
    if (buf) {
      spans.push({ type: "text", text: buf });
      buf = "";
    }
  }
  while (i < line.length) {
    const ch = line[i];

    // Inline comment from `;` to end of line
    if (ch === ";") {
      flushBuf();
      spans.push({ type: "comment", text: line.slice(i) });
      return spans;
    }

    const up = ch.toUpperCase();
    const isCode  = CODE_LETTERS.indexOf(up) !== -1;
    const isCoord = COORD_LETTERS.indexOf(up) !== -1;

    if (isCode || isCoord) {
      // Try to attach a numeric value
      const rest = line.slice(i + 1);
      const m = rest.match(NUMERIC);
      if (m) {
        flushBuf();
        spans.push({
          type: isCode ? "code" : "coord",
          text: ch + m[0],
        });
        i += 1 + m[0].length;
        continue;
      }
    }

    buf += ch;
    i += 1;
  }
  flushBuf();
  return spans;
}

/**
 * Given op_ranges with gcode_start_line/gcode_end_line and a 1-based line
 * number, return the matching kind (or null).
 */
export function kindForLine(lineIdx, opRanges) {
  if (!opRanges) return null;
  for (const r of opRanges) {
    if (
      r.gcode_start_line != null && r.gcode_end_line != null &&
      lineIdx >= r.gcode_start_line && lineIdx < r.gcode_end_line
    ) {
      return r.kind || null;
    }
  }
  return null;
}
