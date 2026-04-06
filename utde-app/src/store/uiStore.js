import { create } from "zustand";

export const useUiStore = create((set) => ({
  // "faces" | "edges" | "both"
  selectionMode: "both",
  // Which right-side panel is open: "code" | "gcode" | null
  activePanel: null,
  // Inline terminal output from /run-script
  scriptOutput: null,
  scriptRunning: false,

  showBasePlate: true,
  graphView: true,           // default to node graph view
  scriptView: false,         // script editor view (overrides graphView when true)
  showToolpaths: false,      // toggle toolpath lines in 3D view

  // Geometry pick mode: set when a node requests face/edge selection from the viewport
  // { nodeId: string, nodeLabel: string } | null
  geometryPick: null,

  setSelectionMode: (selectionMode) => set({ selectionMode }),
  setActivePanel: (activePanel) => set({ activePanel }),
  setScriptOutput: (scriptOutput) => set({ scriptOutput }),
  setScriptRunning: (scriptRunning) => set({ scriptRunning }),
  toggleBasePlate: () => set((s) => ({ showBasePlate: !s.showBasePlate })),
  toggleGraphView: () => set((s) => ({ graphView: !s.graphView, scriptView: false })),
  setScriptView:   (v) => set({ scriptView: v, graphView: false }),
  toggleScriptView: () => set((s) => ({ scriptView: !s.scriptView })),
  toggleToolpaths: () => set((s) => ({ showToolpaths: !s.showToolpaths })),
  setShowToolpaths: (v) => set({ showToolpaths: v }),

  // Switch to 3D view with a geometry pick prompt for a specific node
  startGeometryPick: (nodeId, nodeLabel) =>
    set({ geometryPick: { nodeId, nodeLabel }, graphView: false }),
  // Return to node graph and clear the pick prompt
  endGeometryPick: () =>
    set({ geometryPick: null, graphView: true }),
}));
