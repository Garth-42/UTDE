import { create } from "zustand";

const DEFAULT_STRATEGY = {
  type: "follow_curve",       // "follow_curve" | "raster_fill" | "contour_parallel"
  feed_rate: 600,
  spacing: 1.0,
  path_type: "deposit",
  // raster_fill only
  angle: 0,
  zigzag: true,
  overshoot: 2.0,
  normal_offset: 0.0,
  edge_inset: 0.0,
  // contour_parallel only
  stepover: 3.0,
  num_passes: 4,
  direction: "inward",
};

const DEFAULT_ORIENTATION_RULES = [];

export const useStrategyStore = create((set, get) => ({
  strategy: { ...DEFAULT_STRATEGY },
  orientationRules: [...DEFAULT_ORIENTATION_RULES],
  isGenerating: false,
  generatedCode: "",
  gcodeOutput: "",
  codeCopied: false,

  setStrategy: (patch) =>
    set((s) => ({ strategy: { ...s.strategy, ...patch } })),

  addOrientationRule: (rule) =>
    set((s) => ({ orientationRules: [...s.orientationRules, rule] })),

  removeOrientationRule: (idx) =>
    set((s) => ({
      orientationRules: s.orientationRules.filter((_, i) => i !== idx),
    })),

  moveOrientationRule: (fromIdx, toIdx) =>
    set((s) => {
      const rules = [...s.orientationRules];
      const [moved] = rules.splice(fromIdx, 1);
      rules.splice(toIdx, 0, moved);
      return { orientationRules: rules };
    }),

  updateOrientationRule: (idx, patch) =>
    set((s) => {
      const rules = [...s.orientationRules];
      rules[idx] = { ...rules[idx], ...patch };
      return { orientationRules: rules };
    }),

  setGenerating: (v) => set({ isGenerating: v }),
  setGeneratedCode: (generatedCode) => set({ generatedCode }),
  setGcodeOutput: (gcodeOutput) => set({ gcodeOutput }),

  setCopied: () => {
    set({ codeCopied: true });
    setTimeout(() => set({ codeCopied: false }), 2000);
  },

  reset: () =>
    set({
      strategy: { ...DEFAULT_STRATEGY },
      orientationRules: [],
      generatedCode: "",
      gcodeOutput: "",
    }),
}));
