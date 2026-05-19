import { create } from "zustand";

/**
 * uiStore — global UI state for the Forgepath shell.
 *
 * `selectionMode` and `showBasePlate` are read by the inner `StepViewport`
 * which serves Setup / Simulate / Post. The new shell drives `selectionMode`
 * via `SetupViewport`'s filter→legacy sync; we keep it here because the
 * StepViewport raycaster logic is structured around the older enum and
 * isn't worth a parallel refactor right now.
 */

export const useUiStore = create((set, get) => {
  const savedTheme = localStorage.getItem("utde-theme");
  const systemDark = window.matchMedia("(prefers-color-scheme: dark)").matches;
  const initialTheme = savedTheme || (systemDark ? "dark" : "light");

  // Apply initial theme class to body immediately
  if (typeof document !== "undefined") {
    if (initialTheme === "dark") document.body.classList.add("dark");
  }

  return {
    tab:    "setup",         // "setup" | "simulate" | "post"
    filter: "face",          // "face" | "edge" | "vertex"
    scriptOverlayOpen: false,
    theme: initialTheme,

    // Used by the 3D viewport
    selectionMode: "both",   // "faces" | "edges" | "both" — derived from `filter`
    showBasePlate: true,
    showToolpaths: false,

    setTab:                (tab)     => set({ tab }),
    setFilter:             (filter)  => set({ filter }),
    toggleScriptOverlay:   ()        => set((s) => ({ scriptOverlayOpen: !s.scriptOverlayOpen })),
    setScriptOverlay:      (v)       => set({ scriptOverlayOpen: v }),

    setSelectionMode:      (mode)    => set({ selectionMode: mode }),
    setShowToolpaths:      (v)       => set({ showToolpaths: v }),
    setShowBasePlate:      (v)       => set({ showBasePlate: v }),

    toggleTheme: () => {
      set((s) => {
        const next = s.theme === "light" ? "dark" : "light";
        localStorage.setItem("utde-theme", next);
        if (typeof document !== "undefined") {
          document.body.classList.toggle("dark", next === "dark");
        }
        return { theme: next };
      });
    },
  };
});
