import { create } from "zustand";

/**
 * machineStore — list of available machines + the user's current selection.
 *
 * Available entries come from the server's GET /machines endpoint (which
 * enumerates `machines/*.yaml`). The picker can import a new YAML which is
 * uploaded to /machines/import and then appended here.
 *
 * `currentId` is the id of the picked machine. /compile-timeline and the
 * generated Python use this id; the server resolves it to a YAML file (or
 * falls back to a built-in factory).
 */

export const useMachineStore = create((set, get) => ({
  available: [],          // [{ id, name, path, axis_count, tool_axes, workpiece_axes }]
  currentId: null,
  loading:   false,
  error:     null,

  setLoading: (loading) => set({ loading }),
  setError:   (error)   => set({ error }),

  setAvailable: (available) =>
    set((s) => {
      // Preserve the user's selection if still in the new list,
      // otherwise fall back to the first machine.
      let nextId = s.currentId;
      if (!nextId || !available.some((m) => m.id === nextId)) {
        nextId = available[0]?.id ?? null;
      }
      return { available, currentId: nextId, error: null };
    }),

  setCurrentId: (currentId) => set({ currentId }),

  appendMachine: (machine) =>
    set((s) => {
      const filtered = s.available.filter((m) => m.id !== machine.id);
      return {
        available: [...filtered, machine].sort((a, b) =>
          (a.name || "").localeCompare(b.name || "")
        ),
        currentId: machine.id,
        error:     null,
      };
    }),
}));
