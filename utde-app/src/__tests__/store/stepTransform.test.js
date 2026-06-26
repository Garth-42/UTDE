import { describe, it, expect, beforeEach } from "vitest";
import { useStepStore } from "../../store/stepStore";
import { IDENTITY_TRANSFORM, isIdentity } from "../../lib/geomTransform";

const planeFace = (id, sel) => ({
  id, type: "plane",
  params: { normal: [0, 0, 1], origin: [0, 0, 5] },
  centroid: [0, 0, 5],
  vertices: [1, 0, 5, -1, 0, 5, 0, 1, 5],
  indices: [0, 1, 2],
});

beforeEach(() => {
  useStepStore.setState({
    faces: [], edges: [],
    selectedFaceIds: new Set(),
    transform: IDENTITY_TRANSFORM,
    gizmoMode: "off",
  });
});

describe("stepStore workpiece transform", () => {
  it("setTranslation sets an absolute translation", () => {
    useStepStore.getState().setTranslation({ x: 5, z: -2 });
    expect(useStepStore.getState().transform.translation).toEqual([5, 0, -2]);
  });

  it("resetTransform returns to identity and turns the gizmo off", () => {
    useStepStore.setState({ transform: { translation: [3, 0, 0], quaternion: [0, 0, 0, 1] }, gizmoMode: "translate" });
    useStepStore.getState().resetTransform();
    expect(isIdentity(useStepStore.getState().transform)).toBe(true);
    expect(useStepStore.getState().gizmoMode).toBe("off");
  });

  it("orientSelectedFaceToBed needs exactly one planar face selected", () => {
    useStepStore.setState({ faces: [planeFace(0)], selectedFaceIds: new Set() });
    expect(useStepStore.getState().orientSelectedFaceToBed()).toBe(false);
    expect(isIdentity(useStepStore.getState().transform)).toBe(true);

    useStepStore.setState({ selectedFaceIds: new Set([0]) });
    expect(useStepStore.getState().orientSelectedFaceToBed()).toBe(true);
    expect(isIdentity(useStepStore.getState().transform)).toBe(false);
  });

  it("does not align a non-planar selection", () => {
    useStepStore.setState({
      faces: [{ id: 0, type: "cylinder", params: {}, centroid: [0, 0, 0], vertices: [] }],
      selectedFaceIds: new Set([0]),
    });
    expect(useStepStore.getState().orientSelectedFaceToBed()).toBe(false);
  });

  it("getTransformedGeometry returns originals at identity, transformed otherwise", () => {
    const faces = [planeFace(0)];
    useStepStore.setState({ faces });
    expect(useStepStore.getState().getTransformedGeometry().faces).toBe(faces);

    useStepStore.getState().setTranslation({ x: 10 });
    const out = useStepStore.getState().getTransformedGeometry();
    expect(out.faces).not.toBe(faces);
    expect(out.faces[0].vertices[0]).toBeCloseTo(11, 5); // 1 + 10
  });

  it("dropToBed seats the lowest point on Z=0", () => {
    useStepStore.setState({ faces: [planeFace(0)] }); // verts at z=5
    useStepStore.getState().dropToBed();
    expect(useStepStore.getState().transform.translation[2]).toBeCloseTo(-5, 5);
  });

  it("setGeometry resets the transform to identity", () => {
    useStepStore.setState({ transform: { translation: [9, 9, 9], quaternion: [0, 0, 0, 1] } });
    useStepStore.getState().setGeometry([planeFace(0)], [], "part.step");
    expect(isIdentity(useStepStore.getState().transform)).toBe(true);
  });
});
