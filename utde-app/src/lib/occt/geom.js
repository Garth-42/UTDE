/**
 * Pure geometry helpers for the opencascade.js STEP parser.
 *
 * These contain no OCC/WASM dependency so they are fully unit-testable; the
 * parser uses them to assemble the JSON contract the rest of the app expects.
 */

/** Mean of a flat [x,y,z, x,y,z, ...] vertex array → [cx, cy, cz]. */
export function flatCentroid(verts) {
  const n = verts.length / 3;
  if (!n) return [0, 0, 0];
  let sx = 0, sy = 0, sz = 0;
  for (let i = 0; i < verts.length; i += 3) {
    sx += verts[i];
    sy += verts[i + 1];
    sz += verts[i + 2];
  }
  return [sx / n, sy / n, sz / n];
}

/** Mean of a list of [x,y,z] points → [cx, cy, cz]. */
export function pointsCentroid(points) {
  if (!points.length) return [0, 0, 0];
  let sx = 0, sy = 0, sz = 0;
  for (const p of points) {
    sx += p[0]; sy += p[1]; sz += p[2];
  }
  const n = points.length;
  return [sx / n, sy / n, sz / n];
}

/** 3D distance between two [x,y,z] points. */
export function distance(a, b) {
  const dx = a[0] - b[0], dy = a[1] - b[1], dz = a[2] - b[2];
  return Math.sqrt(dx * dx + dy * dy + dz * dz);
}

/**
 * Map an opencascade.js surface-type enum value to UTDE's type string,
 * matching what the Python (pythonocc) parser produced.
 */
export function surfaceTypeName(gtype, GeomAbs) {
  switch (gtype) {
    case GeomAbs.GeomAbs_Plane: return "plane";
    case GeomAbs.GeomAbs_Cylinder: return "cylinder";
    case GeomAbs.GeomAbs_Sphere: return "sphere";
    case GeomAbs.GeomAbs_Cone: return "cone";
    case GeomAbs.GeomAbs_Torus: return "torus";
    default: return "other";
  }
}

/** Map an opencascade.js curve-type enum value to UTDE's edge type string. */
export function curveTypeName(gtype, GeomAbs) {
  switch (gtype) {
    case GeomAbs.GeomAbs_Line: return "line";
    case GeomAbs.GeomAbs_Circle: return "circle";
    case GeomAbs.GeomAbs_Ellipse: return "ellipse";
    case GeomAbs.GeomAbs_BezierCurve: return "bezier";
    case GeomAbs.GeomAbs_BSplineCurve: return "bspline";
    default: return "other";
  }
}
