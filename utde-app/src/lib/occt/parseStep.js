/**
 * STEP → { faces, edges, face_count, edge_count } using opencascade.js (OCCT
 * compiled to WASM). This is the browser replacement for the pythonocc parser
 * that used to run on the Flask server (step_server.tessellate_face/_edge); it
 * emits the **same JSON shape** so the stores and toolpath engine are unchanged.
 *
 * The OCCT handle `oc` is injected into `parseStepWithOc` so the assembly logic
 * (OCC primitives → JSON) is unit-testable with a faithful fake. The numbered
 * constructors / enum objects follow the opencascade.js (donalffons) API.
 *
 * NOTE: the exact OCC call surface must be verified against a real
 * opencascade.js build in a browser; the analytic-parameter and triangulation
 * extraction below mirrors the proven Python implementation.
 *
 * KNOWN GAP: faces do not yet emit `inner_loops` (hole boundaries from OCC wire
 * topology). The outer boundary is still derived in Python from the emitted
 * triangulation (webapi.extract_all_boundary_loops), so raster fill clips to the
 * face edge; only interior holes from STEP are not yet honored. Tracked as a
 * Phase 2 follow-up (needs breptools_OuterWire + WIRE traversal via opencascade.js).
 */

import {
  flatCentroid,
  pointsCentroid,
  distance,
  surfaceTypeName,
  curveTypeName,
} from "./geom";

const EDGE_SAMPLES = 32;

function xyz(p) {
  return [p.X(), p.Y(), p.Z()];
}

function del(obj) {
  // opencascade.js objects must be freed; fakes have no .delete().
  if (obj && typeof obj.delete === "function") obj.delete();
}

/** Pull the analytic parameters for a face's surface, matching the server. */
export function surfaceParams(oc, adaptor, type) {
  switch (type) {
    case "plane": {
      const pln = adaptor.Plane();
      const params = {
        origin: xyz(pln.Location()),
        normal: xyz(pln.Axis().Direction()),
      };
      del(pln);
      return params;
    }
    case "cylinder": {
      const cyl = adaptor.Cylinder();
      const params = {
        center: xyz(cyl.Location()),
        axis: xyz(cyl.Axis().Direction()),
        radius: cyl.Radius(),
        height: null,
      };
      del(cyl);
      return params;
    }
    case "sphere": {
      const sph = adaptor.Sphere();
      const params = { center: xyz(sph.Location()), radius: sph.Radius() };
      del(sph);
      return params;
    }
    case "cone": {
      const cone = adaptor.Cone();
      const params = {
        apex: xyz(cone.Apex()),
        axis: xyz(cone.Axis().Direction()),
        half_angle: cone.SemiAngle(),
      };
      del(cone);
      return params;
    }
    default:
      return {};
  }
}

/** Pull the analytic parameters for an edge's curve, matching the server. */
export function curveParams(oc, curve, type) {
  switch (type) {
    case "line": {
      const start = xyz(curve.Value(curve.FirstParameter()));
      const end = xyz(curve.Value(curve.LastParameter()));
      const lin = curve.Line();
      const dir = xyz(lin.Direction());
      del(lin);
      return { start, end, direction: dir, length: distance(start, end) };
    }
    case "circle": {
      const circ = curve.Circle();
      const params = {
        center: xyz(circ.Location()),
        axis: xyz(circ.Axis().Direction()),
        radius: circ.Radius(),
      };
      del(circ);
      return params;
    }
    case "ellipse": {
      const ell = curve.Ellipse();
      const params = {
        center: xyz(ell.Location()),
        major_radius: ell.MajorRadius(),
        minor_radius: ell.MinorRadius(),
      };
      del(ell);
      return params;
    }
    default:
      return {};
  }
}

/** Read a face's triangulation into flat vertices + indices (world space). */
function readTriangulation(oc, face) {
  const loc = new oc.TopLoc_Location_1();
  let handle;
  try {
    // OCCT ≥7.6 adds a mesh-purpose arg; try the 2-arg form first.
    handle = oc.BRep_Tool.Triangulation(face, loc, 0);
  } catch (e) {
    handle = oc.BRep_Tool.Triangulation(face, loc);
  }
  if (!handle || handle.IsNull()) {
    del(loc);
    return { vertices: [], indices: [] };
  }
  const tri = handle.get();
  const trsf = loc.Transformation();

  const vertices = [];
  const nNodes = tri.NbNodes();
  for (let i = 1; i <= nNodes; i++) {
    const p = tri.Node(i).Transformed(trsf);
    vertices.push(p.X(), p.Y(), p.Z());
  }

  const indices = [];
  const nTris = tri.NbTriangles();
  for (let i = 1; i <= nTris; i++) {
    const t = tri.Triangle(i);
    // Poly_Triangle node ids are 1-based → 0-based for the mesh arrays.
    indices.push(t.Value(1) - 1, t.Value(2) - 1, t.Value(3) - 1);
  }
  del(loc);
  return { vertices, indices };
}

/** Build the JSON record for one face (or null when it has no mesh). */
export function tessellateFace(oc, face, idx) {
  const adaptor = new oc.BRepAdaptor_Surface_2(face, true);
  const gtype = adaptor.GetType();
  const type = surfaceTypeName(gtype, oc.GeomAbs_SurfaceType);
  const params = surfaceParams(oc, adaptor, type);
  del(adaptor);

  const { vertices, indices } = readTriangulation(oc, face);
  if (!vertices.length) return null;

  return {
    id: idx,
    type,
    vertices,
    indices,
    params,
    centroid: flatCentroid(vertices),
  };
}

/** Build the JSON record for one edge (or null when it can't be sampled). */
export function tessellateEdge(oc, edge, idx, numPoints = EDGE_SAMPLES) {
  const curve = new oc.BRepAdaptor_Curve_2(edge);
  const gtype = curve.GetType();
  const type = curveTypeName(gtype, oc.GeomAbs_CurveType);
  const params = curveParams(oc, curve, type);

  const t0 = curve.FirstParameter();
  const t1 = curve.LastParameter();
  const verts = [];
  for (let i = 0; i < numPoints; i++) {
    const t = numPoints === 1 ? t0 : t0 + ((t1 - t0) * i) / (numPoints - 1);
    const p = curve.Value(t);
    verts.push(p.X(), p.Y(), p.Z());
  }
  del(curve);

  if (!verts.length) return null;
  const pts = [];
  for (let i = 0; i < verts.length; i += 3) pts.push([verts[i], verts[i + 1], verts[i + 2]]);
  return {
    id: idx,
    type,
    vertices: verts,
    params,
    centroid: pointsCentroid(pts),
  };
}

function mapShapes(oc, shape, shapeEnum) {
  const map = new oc.TopTools_IndexedMapOfShape_1();
  oc.TopExp.MapShapes_1(shape, shapeEnum, map);
  return map;
}

/**
 * Parse STEP bytes with an injected OCCT handle.
 * @param {object} oc - opencascade.js instance.
 * @param {Uint8Array} bytes - the STEP file contents.
 * @param {number} deflection - mesh tolerance (clamped 0.01–5.0).
 */
export function parseStepWithOc(oc, bytes, deflection = 0.5) {
  const defl = Math.max(0.01, Math.min(5.0, Number(deflection) || 0.5));
  const path = "model.step";

  // Stage the bytes in OCCT's in-memory FS, then read.
  oc.FS.createDataFile("/", path, bytes, true, true, true);
  const reader = new oc.STEPControl_Reader_1();
  let shape;
  try {
    const status = reader.ReadFile(path);
    if (status !== oc.IFSelect_ReturnStatus.IFSelect_RetDone) {
      throw new Error("STEP parser failed — check the file is valid STEP/STP");
    }
    reader.TransferRoots(new oc.Message_ProgressRange_1());
    shape = reader.OneShape();
  } finally {
    try { oc.FS.unlink("/" + path); } catch (e) { /* ignore */ }
  }

  // Tessellate.
  const mesh = new oc.BRepMesh_IncrementalMesh_2(shape, defl, false, defl, false);
  del(mesh);

  const faceMap = mapShapes(oc, shape, oc.TopAbs_ShapeEnum.TopAbs_FACE);
  const faces = [];
  for (let i = 1; i <= faceMap.Extent(); i++) {
    const face = oc.TopoDS.Face_1(faceMap.FindKey(i));
    let rec = null;
    try {
      rec = tessellateFace(oc, face, i - 1);
    } catch (e) {
      rec = null;
    }
    if (rec) faces.push(rec);
  }
  del(faceMap);

  const edgeMap = mapShapes(oc, shape, oc.TopAbs_ShapeEnum.TopAbs_EDGE);
  const edges = [];
  for (let i = 1; i <= edgeMap.Extent(); i++) {
    const edge = oc.TopoDS.Edge_1(edgeMap.FindKey(i));
    let rec = null;
    try {
      rec = tessellateEdge(oc, edge, i - 1);
    } catch (e) {
      rec = null;
    }
    if (rec) edges.push(rec);
  }
  del(edgeMap);

  return {
    faces,
    edges,
    face_count: faces.length,
    edge_count: edges.length,
  };
}
