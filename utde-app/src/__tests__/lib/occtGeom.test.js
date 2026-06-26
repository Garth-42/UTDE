import { describe, it, expect } from "vitest";
import {
  flatCentroid,
  pointsCentroid,
  distance,
  surfaceTypeName,
  curveTypeName,
} from "../../lib/occt/geom";

const SURF = {
  GeomAbs_Plane: 0,
  GeomAbs_Cylinder: 1,
  GeomAbs_Sphere: 2,
  GeomAbs_Cone: 3,
  GeomAbs_Torus: 4,
};
const CURV = {
  GeomAbs_Line: 0,
  GeomAbs_Circle: 1,
  GeomAbs_Ellipse: 2,
  GeomAbs_BezierCurve: 3,
  GeomAbs_BSplineCurve: 4,
};

describe("flatCentroid", () => {
  it("averages a flat vertex array", () => {
    expect(flatCentroid([0, 0, 0, 2, 0, 0, 2, 2, 0, 0, 2, 0])).toEqual([1, 1, 0]);
  });
  it("returns origin for empty", () => {
    expect(flatCentroid([])).toEqual([0, 0, 0]);
  });
});

describe("pointsCentroid", () => {
  it("averages a list of points", () => {
    expect(pointsCentroid([[0, 0, 0], [10, 0, 0]])).toEqual([5, 0, 0]);
  });
});

describe("distance", () => {
  it("computes 3D distance", () => {
    expect(distance([0, 0, 0], [3, 4, 0])).toBe(5);
  });
});

describe("surfaceTypeName", () => {
  it("maps known types", () => {
    expect(surfaceTypeName(SURF.GeomAbs_Plane, SURF)).toBe("plane");
    expect(surfaceTypeName(SURF.GeomAbs_Cylinder, SURF)).toBe("cylinder");
    expect(surfaceTypeName(SURF.GeomAbs_Sphere, SURF)).toBe("sphere");
    expect(surfaceTypeName(SURF.GeomAbs_Cone, SURF)).toBe("cone");
    expect(surfaceTypeName(SURF.GeomAbs_Torus, SURF)).toBe("torus");
  });
  it("falls back to other", () => {
    expect(surfaceTypeName(99, SURF)).toBe("other");
  });
});

describe("curveTypeName", () => {
  it("maps known types and falls back", () => {
    expect(curveTypeName(CURV.GeomAbs_Line, CURV)).toBe("line");
    expect(curveTypeName(CURV.GeomAbs_Circle, CURV)).toBe("circle");
    expect(curveTypeName(CURV.GeomAbs_Ellipse, CURV)).toBe("ellipse");
    expect(curveTypeName(CURV.GeomAbs_BSplineCurve, CURV)).toBe("bspline");
    expect(curveTypeName(42, CURV)).toBe("other");
  });
});
