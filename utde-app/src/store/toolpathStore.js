import { create } from "zustand";

export const useToolpathStore = create((set, get) => ({
  // Each entry: { id, label, points: [...], color, visible, kind?, gcodeStartLine?, gcodeEndLine? }
  toolpaths: [],
  activeIds: new Set(),
  animProgress: 1,
  isAnimating: false,
  showNormals: true,
  animRef: null,

  // Latest /compile-timeline result
  isCompiling:  false,
  compileError: null,
  gcode:        "",
  opRanges:     [],
  warnings:     [],

  // Simulate playback
  simSpeed: 1,                       // 0.5 | 1 | 4 — multiplier on the per-tick step
  setSimSpeed: (simSpeed) => set({ simSpeed }),

  setCompiling:    (isCompiling)  => set({ isCompiling, compileError: isCompiling ? null : get().compileError }),
  setCompileError: (compileError) => set({ compileError }),

  setCompileResult: ({ toolpaths, gcode, opRanges, warnings }) =>
    set(() => {
      const activeIds = new Set(toolpaths.map((t) => t.id));
      return {
        toolpaths,
        activeIds,
        gcode:    gcode || "",
        opRanges: opRanges || [],
        warnings: warnings || [],
        compileError: null,
      };
    }),

  addToolpath: (label, points, color = "#00ccff") =>
    set((s) => {
      const id = Date.now();
      const entry = { id, label, points, color, visible: true };
      const activeIds = new Set(s.activeIds);
      activeIds.add(id);
      return { toolpaths: [...s.toolpaths, entry], activeIds };
    }),

  removeToolpath: (id) =>
    set((s) => {
      const activeIds = new Set(s.activeIds);
      activeIds.delete(id);
      return { toolpaths: s.toolpaths.filter((t) => t.id !== id), activeIds };
    }),

  toggleToolpath: (id) =>
    set((s) => {
      const activeIds = new Set(s.activeIds);
      activeIds.has(id) ? activeIds.delete(id) : activeIds.add(id);
      return { activeIds };
    }),

  clearToolpaths: () => set({ toolpaths: [], activeIds: new Set() }),

  setShowNormals: (v) => set({ showNormals: v }),
  setAnimProgress: (v) => set({ animProgress: v }),

  startAnimation: () => {
    const { animRef, animProgress } = get();
    if (animRef) clearInterval(animRef);
    // Resume from where we are if we were paused mid-playback; restart from 0
    // when the cursor was at the end.
    const startAt = animProgress >= 1 ? 0 : animProgress;
    set({ isAnimating: true, animProgress: startAt });
    const TICK_MS = 33;     // ~30 fps
    const BASE_STEP = 0.005;
    const ref = setInterval(() => {
      const { simSpeed, animProgress: cur } = get();
      const next = cur + BASE_STEP * (simSpeed || 1);
      if (next >= 1) {
        set({ animProgress: 1, isAnimating: false, animRef: null });
        clearInterval(ref);
        return;
      }
      set({ animProgress: next });
    }, TICK_MS);
    set({ animRef: ref });
  },

  stopAnimation: () => {
    const { animRef } = get();
    if (animRef) clearInterval(animRef);
    set({ isAnimating: false, animRef: null });
  },

  resetAnimation: () => {
    const { animRef } = get();
    if (animRef) clearInterval(animRef);
    set({ isAnimating: false, animRef: null, animProgress: 0 });
  },

  stepForward: (dt = 0.05) =>
    set((s) => ({
      animProgress: Math.min(1, (s.animProgress || 0) + dt),
    })),
}));
