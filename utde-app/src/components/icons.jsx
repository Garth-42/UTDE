/**
 * Compact icon set ported from the Forgepath design bundle.
 * Outline icons at 16x16 by default, 1.4 px stroke, rounded line caps.
 *
 * Usage:
 *   import I from "./icons";
 *   <I.pocket />
 *   <I.face size={14} />
 */

function Ico({
  d,
  size = 16,
  stroke = "currentColor",
  strokeWidth = 1.4,
  fill = "none",
  children,
  viewBox = "0 0 16 16",
}) {
  return (
    <svg
      width={size}
      height={size}
      viewBox={viewBox}
      fill={fill}
      stroke={stroke}
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      {d ? <path d={d} /> : children}
    </svg>
  );
}

const I = {
  // Selection-filter glyphs
  face:   ({ size = 14 } = {}) => (
    <Ico size={size}><polygon points="2.5,4 8,2 13.5,4 13.5,12 8,14 2.5,12" /></Ico>
  ),
  edge:   ({ size = 14 } = {}) => (
    <Ico size={size}>
      <line x1="2.5" y1="13" x2="13.5" y2="3" />
      <circle cx="2.5" cy="13" r="1.4" fill="currentColor" stroke="none" />
      <circle cx="13.5" cy="3" r="1.4" fill="currentColor" stroke="none" />
    </Ico>
  ),
  vertex: ({ size = 14 } = {}) => (
    <Ico size={size}>
      <circle cx="8" cy="8" r="2.4" fill="currentColor" stroke="none" />
      <circle cx="8" cy="8" r="5.5" />
    </Ico>
  ),

  // Operation glyphs
  "add-layer": () => (
    <Ico>
      <path d="M2.5 6 8 3.2 13.5 6 8 8.8 Z" />
      <path d="M2.5 9.5 8 12.3 13.5 9.5" />
      <path d="M11.5 13v-2 M10.5 12h2" stroke="currentColor" strokeWidth="1.6" />
    </Ico>
  ),
  support: () => (
    <Ico>
      <path d="M2.5 4h11" />
      <path d="M4 4v8 M7 4v8 M10 4v8 M13 4v8" />
      <path d="M2.5 12h11" />
    </Ico>
  ),
  coat: () => (
    <Ico>
      <path d="M2.5 11h11" />
      <path d="M3 8.5q1.5-1 2.5 0t2.5 0 2.5 0 2.5 0" />
      <path d="M4 5.5l1 1m1-1l1 1m1-1l1 1m1-1l1 1" />
    </Ico>
  ),
  "face-mill": () => (
    <Ico>
      <path d="M5 2v5 M11 2v5" />
      <path d="M3.5 7h9l-1.5 3h-6Z" />
      <path d="M2 12.5h12" />
    </Ico>
  ),
  pocket: () => (
    <Ico>
      <path d="M2 5h12 M2 5v6h12V5" />
      <path d="M4.5 7.5h7v2.5h-7Z" />
    </Ico>
  ),
  drill: () => (
    <Ico>
      <path d="M6 2h4v4H6Z" />
      <path d="M7 6v3l1 2 1-2V6" />
      <path d="M3 13.5h10" strokeDasharray="1.5 1.5" />
    </Ico>
  ),
  contour: () => (
    <Ico>
      <path d="M3.5 3.5h9v9h-9Z" strokeDasharray="2 1.5" />
      <path d="M5.5 5.5h5v5h-5Z" />
    </Ico>
  ),
  chamfer: () => (
    <Ico>
      <path d="M2 12 L 6 8 L 14 8" />
      <path d="M14 8 V 4" />
      <path d="M6 8 L 6 12 L 2 12" />
    </Ico>
  ),
  "print-finish": () => (
    <Ico>
      <path d="M2.5 9 L 8 6 L 13.5 9 L 8 12 Z" />
      <path d="M2.5 5h11" strokeDasharray="2 1.5" />
    </Ico>
  ),
  // Generic op fallback when a template's icon key is unknown
  op: () => (
    <Ico>
      <rect x="3" y="3" width="10" height="10" rx="2" />
      <line x1="6" y1="8" x2="10" y2="8" />
    </Ico>
  ),
  // Orient-row glyph (compass-arrow)
  orient: () => (
    <Ico>
      <circle cx="8" cy="8" r="5.5" />
      <line x1="8" y1="8" x2="11" y2="4.5" />
      <circle cx="8" cy="8" r="0.9" fill="currentColor" stroke="none" />
    </Ico>
  ),

  // UI chrome
  search:   () => <Ico><circle cx="7" cy="7" r="4.2" /><line x1="10.2" y1="10.2" x2="13.5" y2="13.5" /></Ico>,
  plus:     () => <Ico><line x1="8" y1="3" x2="8" y2="13" /><line x1="3" y1="8" x2="13" y2="8" /></Ico>,
  chev:     () => <Ico><polyline points="4,6 8,10 12,6" /></Ico>,
  grip:     () => (
    <Ico>
      <circle cx="6" cy="4"  r="0.9" fill="currentColor" stroke="none" />
      <circle cx="10" cy="4" r="0.9" fill="currentColor" stroke="none" />
      <circle cx="6" cy="8"  r="0.9" fill="currentColor" stroke="none" />
      <circle cx="10" cy="8" r="0.9" fill="currentColor" stroke="none" />
      <circle cx="6" cy="12" r="0.9" fill="currentColor" stroke="none" />
      <circle cx="10" cy="12" r="0.9" fill="currentColor" stroke="none" />
    </Ico>
  ),
  eye:      () => <Ico><path d="M1.5 8s2.5-4 6.5-4 6.5 4 6.5 4-2.5 4-6.5 4S1.5 8 1.5 8Z" /><circle cx="8" cy="8" r="1.7" /></Ico>,
  eyeOff:   () => <Ico><path d="M1.5 8s2.5-4 6.5-4 6.5 4 6.5 4-2.5 4-6.5 4S1.5 8 1.5 8Z" /><line x1="2" y1="14" x2="14" y2="2" /></Ico>,
  play:     () => <Ico><polygon points="5,3 13,8 5,13" fill="currentColor" stroke="none" /></Ico>,
  pause:    () => <Ico><rect x="4" y="3" width="3" height="10" fill="currentColor" stroke="none" /><rect x="9" y="3" width="3" height="10" fill="currentColor" stroke="none" /></Ico>,
  step:     () => <Ico><polygon points="3,3 11,8 3,13" fill="currentColor" stroke="none" /><line x1="12.5" y1="3" x2="12.5" y2="13" strokeWidth="1.8" /></Ico>,
  rewind:   () => <Ico><polygon points="13,3 5,8 13,13" fill="currentColor" stroke="none" /><line x1="3.5" y1="3" x2="3.5" y2="13" strokeWidth="1.8" /></Ico>,
  rotate:   () => <Ico><path d="M13 8a5 5 0 1 1-1.5-3.5" /><polyline points="13,2 13,5 10,5" /></Ico>,
  upload:   () => <Ico><path d="M3 11v2h10v-2" /><path d="M8 3v8" /><polyline points="5,6 8,3 11,6" /></Ico>,
  download: () => <Ico><path d="M3 11v2h10v-2" /><path d="M8 3v8" /><polyline points="5,8 8,11 11,8" /></Ico>,
  trash:    () => <Ico><polyline points="3,4 13,4" /><path d="M5 4l.5 9h5L11 4" /><path d="M6 4V2.5h4V4" /></Ico>,
  copy:     () => <Ico><rect x="3" y="5" width="8" height="9" rx="1.2" /><path d="M5 3.5V3a1 1 0 0 1 1-1h7a1 1 0 0 1 1 1v8a1 1 0 0 1-1 1h-.5" /></Ico>,
  bug:      () => <Ico><circle cx="8" cy="8" r="3" /><line x1="8" y1="2" x2="8" y2="5" /><line x1="8" y1="11" x2="8" y2="14" /><line x1="2" y1="8" x2="5" y2="8" /><line x1="11" y1="8" x2="14" y2="8" /></Ico>,
  warn:     () => <Ico><path d="M8 2 L14.5 13 H1.5 Z" /><line x1="8" y1="6" x2="8" y2="9.5" /><circle cx="8" cy="11.4" r="0.6" fill="currentColor" stroke="none" /></Ico>,
  check:    () => <Ico><polyline points="3,8.5 6.5,12 13,4.5" /></Ico>,
  x:        () => <Ico><line x1="4" y1="4" x2="12" y2="12" /><line x1="12" y1="4" x2="4" y2="12" /></Ico>,
  cube:     () => <Ico><path d="M8 2 L14 5 V11 L8 14 L2 11 V5 Z" /><path d="M2 5 L8 8 L14 5" /><path d="M8 8 V14" /></Ico>,
  ruler:    () => <Ico><rect x="2" y="6" width="12" height="4" rx="0.8" /><line x1="4" y1="6" x2="4" y2="8" /><line x1="6" y1="6" x2="6" y2="8.5" /><line x1="8" y1="6" x2="8" y2="8" /><line x1="10" y1="6" x2="10" y2="8.5" /><line x1="12" y1="6" x2="12" y2="8" /></Ico>,
};

export default I;
export { I };
