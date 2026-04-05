import { describe, it, expect, beforeEach } from "vitest";
import { useStepStore } from "../../store/stepStore";

const INITIAL = {
  faces: [],
  edges: [],
  fileName: null,
  selectedFaceIds: new Set(),
  selectedEdgeIds: new Set(),
  hoveredFaceId: null,
  hoveredEdgeId: null,
  workspaceOrigin: null,
  originMode: "none",
  pickingOrigin: false,
  pickingZOrigin: false,
  zOverrideActive: false,
  xyOriginZ: null,
  isLoading: false,
  error: null,
};

beforeEach(() => {
  useStepStore.setState(INITIAL);
});

// ── setGeometry ──────────────────────────────────────────────────────────────

describe("setGeometry", () => {
  it("stores faces, edges, and fileName", () => {
    const faces = [{ id: 0, type: "plane", vertices: [] }];
    const edges = [{ id: 0, type: "line", vertices: [] }];
    useStepStore.getState().setGeometry(faces, edges, "part.step");

    const s = useStepStore.getState();
    expect(s.faces).toEqual(faces);
    expect(s.edges).toEqual(edges);
    expect(s.fileName).toBe("part.step");
  });

  it("resets selection when new geometry is loaded", () => {
    useStepStore.setState({
      selectedFaceIds: new Set([1, 2]),
      selectedEdgeIds: new Set([3]),
    });
    useStepStore.getState().setGeometry([], [], "new.step");
    const s = useStepStore.getState();
    expect(s.selectedFaceIds.size).toBe(0);
    expect(s.selectedEdgeIds.size).toBe(0);
  });

  it("clears error on geometry load", () => {
    useStepStore.setState({ error: "previous error" });
    useStepStore.getState().setGeometry([], [], "file.step");
    expect(useStepStore.getState().error).toBeNull();
  });
});

// ── toggleFace ───────────────────────────────────────────────────────────────

describe("toggleFace", () => {
  it("selects a face (single mode)", () => {
    useStepStore.getState().toggleFace(5);
    expect(useStepStore.getState().selectedFaceIds.has(5)).toBe(true);
  });

  it("deselects if clicking the only selected face", () => {
    useStepStore.setState({ selectedFaceIds: new Set([5]) });
    useStepStore.getState().toggleFace(5);
    expect(useStepStore.getState().selectedFaceIds.has(5)).toBe(false);
  });

  it("replaces selection in single mode", () => {
    useStepStore.setState({ selectedFaceIds: new Set([1]) });
    useStepStore.getState().toggleFace(2);
    const ids = useStepStore.getState().selectedFaceIds;
    expect(ids.has(2)).toBe(true);
    expect(ids.has(1)).toBe(false);
  });

  it("adds to selection in multi mode", () => {
    useStepStore.setState({ selectedFaceIds: new Set([1]) });
    useStepStore.getState().toggleFace(2, true);
    const ids = useStepStore.getState().selectedFaceIds;
    expect(ids.has(1)).toBe(true);
    expect(ids.has(2)).toBe(true);
  });

  it("removes from selection in multi mode if already selected", () => {
    useStepStore.setState({ selectedFaceIds: new Set([1, 2]) });
    useStepStore.getState().toggleFace(1, true);
    expect(useStepStore.getState().selectedFaceIds.has(1)).toBe(false);
    expect(useStepStore.getState().selectedFaceIds.has(2)).toBe(true);
  });
});

// ── toggleEdge ───────────────────────────────────────────────────────────────

describe("toggleEdge", () => {
  it("selects an edge", () => {
    useStepStore.getState().toggleEdge(3);
    expect(useStepStore.getState().selectedEdgeIds.has(3)).toBe(true);
  });

  it("multi-select adds edges", () => {
    useStepStore.getState().toggleEdge(1, true);
    useStepStore.getState().toggleEdge(2, true);
    expect(useStepStore.getState().selectedEdgeIds.size).toBe(2);
  });
});

// ── selectAll / deselectAll ───────────────────────────────────────────────────

describe("selectAll", () => {
  it("selects all faces and edges", () => {
    useStepStore.setState({
      faces: [{ id: 0 }, { id: 1 }],
      edges: [{ id: 10 }],
    });
    useStepStore.getState().selectAll();
    const s = useStepStore.getState();
    expect(s.selectedFaceIds.has(0)).toBe(true);
    expect(s.selectedFaceIds.has(1)).toBe(true);
    expect(s.selectedEdgeIds.has(10)).toBe(true);
  });
});

describe("deselectAll", () => {
  it("clears all selections", () => {
    useStepStore.setState({
      selectedFaceIds: new Set([1, 2]),
      selectedEdgeIds: new Set([10]),
    });
    useStepStore.getState().deselectAll();
    expect(useStepStore.getState().selectedFaceIds.size).toBe(0);
    expect(useStepStore.getState().selectedEdgeIds.size).toBe(0);
  });
});

// ── selectByType ──────────────────────────────────────────────────────────────

describe("selectByType", () => {
  it("selects faces of a matching type", () => {
    useStepStore.setState({
      faces: [
        { id: 0, type: "plane" },
        { id: 1, type: "cylinder" },
        { id: 2, type: "plane" },
      ],
      edges: [],
    });
    useStepStore.getState().selectByType("plane");
    const ids = useStepStore.getState().selectedFaceIds;
    expect(ids.has(0)).toBe(true);
    expect(ids.has(2)).toBe(true);
    expect(ids.has(1)).toBe(false);
  });

  it("selects edges of a matching type", () => {
    useStepStore.setState({
      faces: [],
      edges: [
        { id: 10, type: "circle" },
        { id: 11, type: "line" },
      ],
    });
    useStepStore.getState().selectByType("circle");
    expect(useStepStore.getState().selectedEdgeIds.has(10)).toBe(true);
    expect(useStepStore.getState().selectedEdgeIds.has(11)).toBe(false);
  });
});

// ── setHovered ────────────────────────────────────────────────────────────────

describe("setHovered", () => {
  it("sets hoveredFaceId for type=face", () => {
    useStepStore.getState().setHovered("face", 7);
    expect(useStepStore.getState().hoveredFaceId).toBe(7);
  });

  it("sets hoveredEdgeId for type=edge", () => {
    useStepStore.getState().setHovered("edge", 12);
    expect(useStepStore.getState().hoveredEdgeId).toBe(12);
  });
});

// ── setOriginMode ─────────────────────────────────────────────────────────────

describe("setOriginMode", () => {
  it("none clears origin and stops picking", () => {
    useStepStore.setState({ workspaceOrigin: { x: 1, y: 2, z: 3 }, pickingOrigin: true });
    useStepStore.getState().setOriginMode("none");
    const s = useStepStore.getState();
    expect(s.workspaceOrigin).toBeNull();
    expect(s.pickingOrigin).toBe(false);
    expect(s.originMode).toBe("none");
  });

  it("point mode enables pickingOrigin", () => {
    useStepStore.getState().setOriginMode("point");
    expect(useStepStore.getState().pickingOrigin).toBe(true);
  });

  it("centroid mode computes centroid from geometry", () => {
    useStepStore.setState({
      faces: [{ id: 0, vertices: [0, 0, 0, 10, 0, 0, 10, 10, 0, 0, 10, 0] }],
      edges: [],
    });
    useStepStore.getState().setOriginMode("centroid");
    const origin = useStepStore.getState().workspaceOrigin;
    expect(origin).not.toBeNull();
    expect(origin.x).toBeCloseTo(5, 0);
    expect(origin.y).toBeCloseTo(5, 0);
  });

  it("front_left mode uses xMin, yMin, zMax", () => {
    useStepStore.setState({
      faces: [{ id: 0, vertices: [2, 3, 5, 8, 9, 10] }],
      edges: [],
    });
    useStepStore.getState().setOriginMode("front_left");
    const origin = useStepStore.getState().workspaceOrigin;
    expect(origin).not.toBeNull();
    expect(origin.x).toBeCloseTo(2, 5);
    expect(origin.y).toBeCloseTo(3, 5);
    expect(origin.z).toBeCloseTo(10, 5);
  });

  it("centroid does nothing without geometry", () => {
    useStepStore.getState().setOriginMode("centroid");
    expect(useStepStore.getState().workspaceOrigin).toBeNull();
  });
});

// ── setWorkspaceOrigin ────────────────────────────────────────────────────────

describe("setWorkspaceOrigin", () => {
  it("stores origin and stops picking", () => {
    useStepStore.setState({ pickingOrigin: true });
    useStepStore.getState().setWorkspaceOrigin({ x: 1, y: 2, z: 3 });
    const s = useStepStore.getState();
    expect(s.workspaceOrigin).toEqual({ x: 1, y: 2, z: 3 });
    expect(s.pickingOrigin).toBe(false);
    expect(s.originMode).toBe("point");
  });

  it("null clears origin", () => {
    useStepStore.getState().setWorkspaceOrigin(null);
    expect(useStepStore.getState().workspaceOrigin).toBeNull();
    expect(useStepStore.getState().originMode).toBe("none");
  });
});

// ── Z override ────────────────────────────────────────────────────────────────

describe("Z override", () => {
  it("setZOrigin updates z and sets zOverrideActive", () => {
    useStepStore.setState({ workspaceOrigin: { x: 1, y: 2, z: 3 } });
    useStepStore.getState().setZOrigin(99);
    const s = useStepStore.getState();
    expect(s.workspaceOrigin.z).toBe(99);
    expect(s.zOverrideActive).toBe(true);
    expect(s.pickingZOrigin).toBe(false);
  });

  it("resetZOrigin restores original z", () => {
    useStepStore.setState({
      workspaceOrigin: { x: 1, y: 2, z: 99 },
      xyOriginZ: 5,
      zOverrideActive: true,
    });
    useStepStore.getState().resetZOrigin();
    expect(useStepStore.getState().workspaceOrigin.z).toBe(5);
    expect(useStepStore.getState().zOverrideActive).toBe(false);
  });
});

// ── getSelectedFaces / getSelectedEdges ───────────────────────────────────────

describe("getSelectedFaces / getSelectedEdges", () => {
  it("returns only selected faces", () => {
    useStepStore.setState({
      faces: [{ id: 0 }, { id: 1 }, { id: 2 }],
      selectedFaceIds: new Set([0, 2]),
    });
    const selected = useStepStore.getState().getSelectedFaces();
    expect(selected.length).toBe(2);
    expect(selected.map((f) => f.id)).toContain(0);
    expect(selected.map((f) => f.id)).toContain(2);
  });

  it("returns only selected edges", () => {
    useStepStore.setState({
      edges: [{ id: 10 }, { id: 11 }],
      selectedEdgeIds: new Set([11]),
    });
    const selected = useStepStore.getState().getSelectedEdges();
    expect(selected.length).toBe(1);
    expect(selected[0].id).toBe(11);
  });
});
