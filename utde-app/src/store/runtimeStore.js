import { create } from "zustand";

/**
 * runtimeStore — tracks the load state of the in-browser engines so the UI can
 * show a loading indicator during their (multi-second, multi-MB) first init:
 *   - pyodide: CPython + numpy/scipy + the toolpath_engine wheel
 *   - occt:    opencascade.js (the STEP/CAD kernel)
 *
 * Each engine is { status: "idle"|"loading"|"ready"|"error", stage, error }.
 * The pyodide client and the OCCT parser registration report into this.
 */
export const useRuntimeStore = create((set) => ({
  engines: {
    pyodide: { status: "idle", stage: null, error: null },
    occt: { status: "idle", stage: null, error: null },
  },

  setEngine: (name, status, stage = null) =>
    set((s) => ({
      engines: { ...s.engines, [name]: { status, stage, error: null } },
    })),

  setError: (name, error) =>
    set((s) => ({
      engines: { ...s.engines, [name]: { status: "error", stage: null, error } },
    })),
}));
