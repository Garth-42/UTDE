import { describe, it, expect } from "vitest";
import {
  IDENTITY_TRANSFORM,
  isIdentity,
  transformPoint,
  alignFaceToBedMatrix,
  lowestZ,
  composeRotateZ,
  applyTransformToGeometry,
} from "../../lib/geomTransform";

const near = (a, b, p = 5) => expect(a).toBeCloseTo(b, p);
const nearVec = (v, e, p = 5) => v.forEach((c, i) => near(c, e[i], p));

describe("isIdentity", () => {
  it("true for the identity transform", () => {
    expect(isIdentity(IDENTITY_TRANSFORM)).toBe(true);
    expect(isIdentity(null)).toBe(true);
  });
  it("false once translated or rotated", () => {
    expect(isIdentity({ translation: [1, 0, 0], quaternion: [0, 0, 0, 1] })).toBe(false);
    expect(isIdentity({ translation: [0, 0, 0], quaternion: [0, 0, 0.707, 0.707] })).toBe(false);
  });
});

describe("transformPoint", () => {
  it("applies translation", () => {
    nearVec(transformPoint({ translation: [10, 0, -5], quaternion: [0, 0, 0, 1] }, [1, 2, 3]), [11, 2, -2]);
  });
});

describe("alignFaceToBedMatrix", () => {
  it("lays a +Z-facing face face-down at the origin", () => {
    const face = { type: "plane", params: { normal: [0, 0, 1] }, centroid: [0, 0, 5] };
    const t = alignFaceToBedMatrix(face);
    const { faces } = applyTransformToGeometry([{ ...face, vertices: [0, 0, 5] }], [], t);
    nearVec(faces[0].centroid, [0, 0, 0]);          // centroid → origin
    nearVec(faces[0].params.normal, [0, 0, -1]);     // normal → −Z (down)
    near(faces[0].vertices[2], 0);                    // sits on Z=0
  });

  it("handles a sideways normal", () => {
    const face = { type: "plane", params: { normal: [1, 0, 0] }, centroid: [5, 0, 0] };
    const t = alignFaceToBedMatrix(face);
    const { faces } = applyTransformToGeometry([face], [], t);
    nearVec(faces[0].params.normal, [0, 0, -1]);
    nearVec(faces[0].centroid, [0, 0, 0]);
  });
});

describe("composeRotateZ", () => {
  it("rotates a point 90° about world Z", () => {
    const t = composeRotateZ(IDENTITY_TRANSFORM, 90, [0, 0, 0]);
    nearVec(transformPoint(t, [1, 0, 0]), [0, 1, 0]);
  });
});

describe("lowestZ", () => {
  it("reports the minimum transformed vertex Z", () => {
    const faces = [{ vertices: [0, 0, 3, 0, 0, 7] }];
    near(lowestZ(faces, IDENTITY_TRANSFORM), 3);
    near(lowestZ(faces, { translation: [0, 0, -3], quaternion: [0, 0, 0, 1] }), 0);
  });
});

describe("applyTransformToGeometry", () => {
  it("returns the originals unchanged at identity", () => {
    const faces = [{ id: 0, vertices: [1, 2, 3] }];
    const edges = [{ id: 1, vertices: [4, 5, 6] }];
    const out = applyTransformToGeometry(faces, edges, IDENTITY_TRANSFORM);
    expect(out.faces).toBe(faces);
    expect(out.edges).toBe(edges);
  });

  it("translates points but leaves scalars/directions sane", () => {
    const t = { translation: [10, 0, 0], quaternion: [0, 0, 0, 1] };
    const faces = [{
      id: 0, type: "cylinder",
      params: { center: [0, 0, 0], axis: [0, 0, 1], radius: 5 },
      vertices: [1, 0, 0], centroid: [0, 0, 0],
      inner_loops: [[[2, 0, 0]]],
    }];
    const edges = [{
      id: 1, type: "line",
      params: { start: [0, 0, 0], end: [4, 0, 0], direction: [1, 0, 0], length: 4 },
      vertices: [0, 0, 0, 4, 0, 0],
    }];
    const out = applyTransformToGeometry(faces, edges, t);
    nearVec(out.faces[0].params.center, [10, 0, 0]);   // point: translated
    nearVec(out.faces[0].params.axis, [0, 0, 1]);       // direction: rotation-only (none here)
    expect(out.faces[0].params.radius).toBe(5);         // scalar: invariant
    nearVec(out.faces[0].vertices.slice(0, 3), [11, 0, 0]);
    nearVec(out.faces[0].inner_loops[0][0], [12, 0, 0]);
    nearVec(out.edges[0].params.start, [10, 0, 0]);
    expect(out.edges[0].params.length).toBe(4);
  });

  it("rotates direction vectors", () => {
    const t = composeRotateZ(IDENTITY_TRANSFORM, 90, [0, 0, 0]);
    const out = applyTransformToGeometry(
      [{ id: 0, params: { normal: [1, 0, 0] }, vertices: [] }], [], t
    );
    nearVec(out.faces[0].params.normal, [0, 1, 0]);
  });
});
