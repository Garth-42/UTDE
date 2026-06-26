import { create } from "zustand";
import {
  IDENTITY_TRANSFORM,
  alignFaceToBedMatrix,
  lowestZ,
  composeRotateZ,
  transformPoint,
  applyTransformToGeometry,
} from "../lib/geomTransform";

function computeBounds(faces, edges) {
  let xMin = Infinity, xMax = -Infinity;
  let yMin = Infinity, yMax = -Infinity;
  let zMin = Infinity, zMax = -Infinity;

  const processVerts = (verts) => {
    for (let i = 0; i < verts.length; i += 3) {
      const x = verts[i], y = verts[i + 1], z = verts[i + 2];
      if (x < xMin) xMin = x; if (x > xMax) xMax = x;
      if (y < yMin) yMin = y; if (y > yMax) yMax = y;
      if (z < zMin) zMin = z; if (z > zMax) zMax = z;
    }
  };

  faces.forEach((f) => f.vertices && processVerts(f.vertices));
  edges.forEach((e) => e.vertices && processVerts(e.vertices));

  if (xMin === Infinity) return null;
  return { xMin, xMax, yMin, yMax, zMin, zMax };
}

export const useStepStore = create((set, get) => ({
  // Parsed geometry from server
  faces: [],
  edges: [],
  vertices: [],            // [{ id, x, y, z }] — server-side parsing wired in a later slice
  fileName: null,

  // Selection
  selectedFaceIds: new Set(),
  selectedEdgeIds: new Set(),
  selectedVertexIds: new Set(),
  hoveredFaceId: null,
  hoveredEdgeId: null,
  hoveredVertexId: null,

  // Workspace origin
  workspaceOrigin: null,   // { x, y, z } in CAD space — final value sent to API
  originMode: "none",      // "none" | "point" | "centroid" | "front_left"
  pickingOrigin: false,    // true while awaiting a click on an edge for XY+Z pick

  // Z override (set independently from XY)
  pickingZOrigin: false,   // true while awaiting a click on face/edge for Z only
  zOverrideActive: false,  // whether Z was separately picked
  xyOriginZ: null,         // Z that came from the XY pick (to restore if Z override is cleared)

  // Workpiece transform (re-orient / translate the imported part)
  transform: IDENTITY_TRANSFORM,   // { translation:[x,y,z], quaternion:[x,y,z,w] }
  gizmoMode: "off",                // "off" | "translate" | "rotate"

  // UI state
  isLoading: false,
  error: null,

  // Actions
  setGeometry: (faces, edges, fileName, vertices = []) =>
    set({
      faces, edges, vertices, fileName,
      selectedFaceIds: new Set(),
      selectedEdgeIds: new Set(),
      selectedVertexIds: new Set(),
      transform: IDENTITY_TRANSFORM,   // fresh part → identity pose
      gizmoMode: "off",
      error: null,
    }),

  setLoading: (isLoading) => set({ isLoading }),
  setError: (error) => set({ error }),

  setHovered: (type, id) => {
    if (type === "face")   return set({ hoveredFaceId: id });
    if (type === "edge")   return set({ hoveredEdgeId: id });
    if (type === "vertex") return set({ hoveredVertexId: id });
  },

  toggleFace: (id, multi = false) =>
    set((s) => {
      const next = new Set(s.selectedFaceIds);
      if (!multi) {
        if (next.has(id) && next.size === 1) { next.clear(); }
        else { next.clear(); next.add(id); }
      } else {
        next.has(id) ? next.delete(id) : next.add(id);
      }
      return { selectedFaceIds: next };
    }),

  toggleEdge: (id, multi = false) =>
    set((s) => {
      const next = new Set(s.selectedEdgeIds);
      if (!multi) {
        if (next.has(id) && next.size === 1) { next.clear(); }
        else { next.clear(); next.add(id); }
      } else {
        next.has(id) ? next.delete(id) : next.add(id);
      }
      return { selectedEdgeIds: next };
    }),

  toggleVertex: (id, multi = false) =>
    set((s) => {
      const next = new Set(s.selectedVertexIds);
      if (!multi) {
        if (next.has(id) && next.size === 1) { next.clear(); }
        else { next.clear(); next.add(id); }
      } else {
        next.has(id) ? next.delete(id) : next.add(id);
      }
      return { selectedVertexIds: next };
    }),

  selectByType: (geomType) =>
    set((s) => {
      const faceTypes = ["plane", "cylinder", "sphere", "cone", "torus", "other"];
      if (faceTypes.includes(geomType)) {
        const ids = new Set(s.faces.filter((f) => f.type === geomType).map((f) => f.id));
        return { selectedFaceIds: ids };
      } else {
        const ids = new Set(s.edges.filter((e) => e.type === geomType).map((e) => e.id));
        return { selectedEdgeIds: ids };
      }
    }),

  selectAll: () =>
    set((s) => ({
      selectedFaceIds:   new Set(s.faces.map((f) => f.id)),
      selectedEdgeIds:   new Set(s.edges.map((e) => e.id)),
      selectedVertexIds: new Set(s.vertices.map((v) => v.id)),
    })),

  deselectAll: () => set({
    selectedFaceIds:   new Set(),
    selectedEdgeIds:   new Set(),
    selectedVertexIds: new Set(),
  }),

  // Workspace origin actions
  setWorkspaceOrigin: (pt) => set({
    workspaceOrigin: pt,
    pickingOrigin: false,
    originMode: pt ? "point" : "none",
    xyOriginZ: pt ? pt.z : null,
    zOverrideActive: false,
  }),
  setOriginMode: (mode) => {
    if (mode === "none") {
      set({ originMode: "none", workspaceOrigin: null, pickingOrigin: false, xyOriginZ: null, zOverrideActive: false });
    } else if (mode === "point") {
      set({ originMode: "point", pickingOrigin: true, workspaceOrigin: null, xyOriginZ: null, zOverrideActive: false });
    } else if (mode === "centroid") {
      const { faces, edges } = get();
      const b = computeBounds(faces, edges);
      if (!b) return;
      const pt = { x: (b.xMin + b.xMax) / 2, y: (b.yMin + b.yMax) / 2, z: b.zMax };
      set({ originMode: "centroid", pickingOrigin: false, workspaceOrigin: pt, xyOriginZ: pt.z, zOverrideActive: false });
    } else if (mode === "front_left") {
      const { faces, edges } = get();
      const b = computeBounds(faces, edges);
      if (!b) return;
      const pt = { x: b.xMin, y: b.yMin, z: b.zMax };
      set({ originMode: "front_left", pickingOrigin: false, workspaceOrigin: pt, xyOriginZ: pt.z, zOverrideActive: false });
    }
  },
  cancelPickOrigin: () => set({ pickingOrigin: false, originMode: "none" }),

  // Z override actions
  startPickZOrigin: () => set({ pickingZOrigin: true }),
  cancelPickZOrigin: () => set({ pickingZOrigin: false }),
  setZOrigin: (z) => set((s) => ({
    pickingZOrigin: false,
    zOverrideActive: true,
    workspaceOrigin: s.workspaceOrigin ? { ...s.workspaceOrigin, z } : null,
  })),
  resetZOrigin: () => set((s) => ({
    zOverrideActive: false,
    workspaceOrigin: s.workspaceOrigin && s.xyOriginZ !== null
      ? { ...s.workspaceOrigin, z: s.xyOriginZ }
      : s.workspaceOrigin,
  })),

  getSelectedFaces: () => {
    const { faces, selectedFaceIds } = get();
    return faces.filter((f) => selectedFaceIds.has(f.id));
  },

  getSelectedEdges: () => {
    const { edges, selectedEdgeIds } = get();
    return edges.filter((e) => selectedEdgeIds.has(e.id));
  },

  // ── Workpiece transform actions ─────────────────────────────────────────────
  setTransform: (transform) => set({ transform }),
  setGizmoMode: (gizmoMode) => set({ gizmoMode }),
  resetTransform: () => set({ transform: IDENTITY_TRANSFORM, gizmoMode: "off" }),

  /** Lay the single selected planar face flat on the bed (face-down). Returns
   *  true on success, false if there isn't exactly one planar face selected. */
  orientSelectedFaceToBed: () => {
    const { faces, selectedFaceIds } = get();
    const planar = faces.filter((f) => selectedFaceIds.has(f.id) && f.type === "plane");
    if (planar.length !== 1) return false;
    set({ transform: alignFaceToBedMatrix(planar[0]) });
    return true;
  },

  /** Translate down so the lowest point sits on Z=0. */
  dropToBed: () => set((s) => {
    const dz = lowestZ(s.faces, s.transform);
    const [tx, ty, tz] = s.transform.translation;
    return { transform: { ...s.transform, translation: [tx, ty, tz - dz] } };
  }),

  /** Absolute translation (any axis omitted keeps its current value). */
  setTranslation: ({ x, y, z }) => set((s) => {
    const [tx, ty, tz] = s.transform.translation;
    return { transform: { ...s.transform, translation: [x ?? tx, y ?? ty, z ?? tz] } };
  }),

  /** Rotate about world Z (degrees) through the part centroid. */
  rotateTransformZ: (deg) => set((s) => {
    const b = computeBounds(s.faces, s.edges);
    let about = s.transform.translation;
    if (b) {
      about = transformPoint(s.transform, [
        (b.xMin + b.xMax) / 2, (b.yMin + b.yMax) / 2, (b.zMin + b.zMax) / 2,
      ]);
    }
    return { transform: composeRotateZ(s.transform, deg, about) };
  }),

  /** Faces/edges with the workpiece transform baked in — the geometry the
   *  toolpath engine should consume. Returns originals when identity. */
  getTransformedGeometry: () => {
    const { faces, edges, transform } = get();
    return applyTransformToGeometry(faces, edges, transform);
  },
}));
