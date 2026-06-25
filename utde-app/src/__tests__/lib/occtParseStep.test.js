import { describe, it, expect } from "vitest";
import {
  parseStepWithOc,
  surfaceParams,
  curveParams,
  tessellateFace,
  tessellateEdge,
} from "../../lib/occt/parseStep";

// ── A faithful fake `oc` modeling the opencascade.js surface the parser uses ──
//
// It scripts ONE planar face (a triangulated unit quad) and ONE line edge so
// the test verifies the OCC→JSON assembly produces the exact contract shape.
// (Real-API exactness still needs in-browser verification; this locks the
// assembly logic so refactors can't regress it.)

const P = (x, y, z) => ({ X: () => x, Y: () => y, Z: () => z, Transformed: () => P(x, y, z) });
const D = (x, y, z) => ({ X: () => x, Y: () => y, Z: () => z });

function makeOc(shape) {
  const oc = {
    GeomAbs_SurfaceType: {
      GeomAbs_Plane: 0, GeomAbs_Cylinder: 1, GeomAbs_Sphere: 2,
      GeomAbs_Cone: 3, GeomAbs_Torus: 4,
    },
    GeomAbs_CurveType: {
      GeomAbs_Line: 0, GeomAbs_Circle: 1, GeomAbs_Ellipse: 2,
      GeomAbs_BezierCurve: 3, GeomAbs_BSplineCurve: 4,
    },
    IFSelect_ReturnStatus: { IFSelect_RetDone: 1 },
    TopAbs_ShapeEnum: { TopAbs_FACE: 4, TopAbs_EDGE: 6 },
    FS: { createDataFile: () => {}, unlink: () => {} },
    Message_ProgressRange_1: class {},
    STEPControl_Reader_1: class {
      ReadFile() { return 1; }
      TransferRoots() {}
      OneShape() { return shape; }
    },
    BRepMesh_IncrementalMesh_2: class { delete() {} },
    TopLoc_Location_1: class { Transformation() { return {}; } delete() {} },
    BRep_Tool: {
      Triangulation: (face) => face._triHandle,
    },
    BRepAdaptor_Surface_2: class {
      constructor(face) { this.f = face; }
      GetType() { return this.f._stype; }
      Plane() { return this.f._plane; }
      Cylinder() { return this.f._cylinder; }
      Sphere() { return this.f._sphere; }
      Cone() { return this.f._cone; }
      delete() {}
    },
    BRepAdaptor_Curve_2: class {
      constructor(edge) { this.e = edge; }
      GetType() { return this.e._ctype; }
      FirstParameter() { return this.e._t0; }
      LastParameter() { return this.e._t1; }
      Value(t) { return this.e._valueAt(t); }
      Line() { return this.e._line; }
      Circle() { return this.e._circle; }
      Ellipse() { return this.e._ellipse; }
      delete() {}
    },
    TopTools_IndexedMapOfShape_1: class {
      constructor() { this.items = []; }
      _fill(items) { this.items = items; }
      Extent() { return this.items.length; }
      FindKey(i) { return this.items[i - 1]; }
      delete() {}
    },
    TopoDS: { Face_1: (s) => s, Edge_1: (s) => s },
  };
  oc.TopExp = {
    MapShapes_1: (s, shapeEnum, map) => {
      map._fill(shapeEnum === oc.TopAbs_ShapeEnum.TopAbs_FACE ? s._faces : s._edges);
    },
  };
  return oc;
}

// A unit quad in the z=0 plane, triangulated (1-based node ids).
function quadFace() {
  const nodes = [P(0, 0, 0), P(1, 0, 0), P(1, 1, 0), P(0, 1, 0)];
  const tris = [[1, 2, 3], [1, 3, 4]];
  return {
    _stype: 0, // GeomAbs_Plane
    _plane: { Location: () => P(0, 0, 0), Axis: () => ({ Direction: () => D(0, 0, 1) }) },
    _triHandle: {
      IsNull: () => false,
      get: () => ({
        NbNodes: () => nodes.length,
        Node: (i) => nodes[i - 1],
        NbTriangles: () => tris.length,
        Triangle: (i) => ({ Value: (k) => tris[i - 1][k - 1] }),
      }),
    },
  };
}

// A line edge from (0,0,0) to (10,0,0), param 0..10.
function lineEdge() {
  return {
    _ctype: 0, // GeomAbs_Line
    _t0: 0,
    _t1: 10,
    _valueAt: (t) => P(t, 0, 0),
    _line: { Location: () => P(0, 0, 0), Direction: () => D(1, 0, 0) },
  };
}

describe("parseStepWithOc", () => {
  it("assembles the { faces, edges, *_count } contract", () => {
    const oc = makeOc({ _faces: [quadFace()], _edges: [lineEdge()] });
    const out = parseStepWithOc(oc, new Uint8Array([1, 2, 3]), 0.5);
    expect(out.face_count).toBe(1);
    expect(out.edge_count).toBe(1);
  });

  it("extracts plane face geometry + analytic params", () => {
    const oc = makeOc({ _faces: [quadFace()], _edges: [] });
    const { faces } = parseStepWithOc(oc, new Uint8Array([0]), 0.5);
    const f = faces[0];
    expect(f.type).toBe("plane");
    expect(f.params).toEqual({ origin: [0, 0, 0], normal: [0, 0, 1] });
    expect(f.vertices).toHaveLength(12);
    expect(f.indices).toEqual([0, 1, 2, 0, 2, 3]);
    expect(f.centroid).toEqual([0.5, 0.5, 0]);
  });

  it("extracts line edge geometry + analytic params", () => {
    const oc = makeOc({ _faces: [], _edges: [lineEdge()] });
    const { edges } = parseStepWithOc(oc, new Uint8Array([0]), 0.5);
    const e = edges[0];
    expect(e.type).toBe("line");
    expect(e.params.start).toEqual([0, 0, 0]);
    expect(e.params.end).toEqual([10, 0, 0]);
    expect(e.params.length).toBe(10);
    expect(e.params.direction).toEqual([1, 0, 0]);
    expect(e.vertices).toHaveLength(32 * 3);
    expect(e.centroid[0]).toBeCloseTo(5, 5);
  });

  it("skips faces with no triangulation", () => {
    const noMesh = { ...quadFace(), _triHandle: { IsNull: () => true } };
    const oc = makeOc({ _faces: [noMesh], _edges: [] });
    const { faces, face_count } = parseStepWithOc(oc, new Uint8Array([0]), 0.5);
    expect(face_count).toBe(0);
    expect(faces).toEqual([]);
  });

  it("rejects a non-DONE read status", () => {
    const oc = makeOc({ _faces: [], _edges: [] });
    oc.STEPControl_Reader_1 = class { ReadFile() { return 0; } };
    expect(() => parseStepWithOc(oc, new Uint8Array([0]))).toThrow(/STEP parser failed/);
  });
});

describe("surfaceParams / curveParams branches", () => {
  it("reads cylinder params", () => {
    const oc = makeOc({ _faces: [], _edges: [] });
    const adaptor = {
      Cylinder: () => ({
        Location: () => P(1, 2, 3),
        Axis: () => ({ Direction: () => D(0, 0, 1) }),
        Radius: () => 5,
      }),
    };
    expect(surfaceParams(oc, adaptor, "cylinder")).toEqual({
      center: [1, 2, 3], axis: [0, 0, 1], radius: 5, height: null,
    });
  });

  it("reads circle params", () => {
    const oc = makeOc({ _faces: [], _edges: [] });
    const curve = {
      Circle: () => ({
        Location: () => P(0, 0, 0),
        Axis: () => ({ Direction: () => D(0, 0, 1) }),
        Radius: () => 4,
      }),
    };
    expect(curveParams(oc, curve, "circle")).toEqual({
      center: [0, 0, 0], axis: [0, 0, 1], radius: 4,
    });
  });
});

describe("tessellateFace / tessellateEdge units", () => {
  it("tessellateFace returns null without a mesh", () => {
    const oc = makeOc({ _faces: [], _edges: [] });
    const face = { _stype: 0, _plane: quadFace()._plane, _triHandle: { IsNull: () => true } };
    expect(tessellateFace(oc, face, 0)).toBeNull();
  });

  it("tessellateEdge ids the record", () => {
    const oc = makeOc({ _faces: [], _edges: [] });
    const rec = tessellateEdge(oc, lineEdge(), 7);
    expect(rec.id).toBe(7);
    expect(rec.type).toBe("line");
  });
});
