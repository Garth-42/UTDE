import { create } from "zustand";

export const useToolpathStore = create((set, get) => ({
  // Each entry: { id, label, points: [{x,y,z,nx,ny,nz,feed_rate,process_params}], color, visible }
  toolpaths: [],
  activeIds: new Set(),
  animProgress: 1,
  isAnimating: false,
  showNormals: true,
  animRef: null,

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
    const { animRef } = get();
    if (animRef) cancelAnimationFrame(animRef);
    set({ isAnimating: true, animProgress: 0 });
    let t = 0;
    const step = () => {
      t += 0.005;
      if (t >= 1) {
        set({ animProgress: 1, isAnimating: false, animRef: null });
        return;
      }
      set({ animProgress: t, animRef: requestAnimationFrame(step) });
    };
    set({ animRef: requestAnimationFrame(step) });
  },

  stopAnimation: () => {
    const { animRef } = get();
    if (animRef) cancelAnimationFrame(animRef);
    set({ isAnimating: false, animRef: null });
  },
}));
