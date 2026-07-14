import { useEffect } from "react";
import { useUiStore } from "./store/uiStore";
import { useStepStore } from "./store/stepStore";
import { useOpsStore } from "./store/opsStore";
import { loadSession } from "./utils/session";

import TopBar from "./components/TopBar";
import StatusBar from "./components/StatusBar";
import SetupTab from "./components/setup/SetupTab";
import SimulateTab from "./components/simulate/SimulateTab";
import PostTab from "./components/post/PostTab";
import ScriptOverlay from "./components/ScriptOverlay";
import RuntimeStatus from "./components/RuntimeStatus";

const ROOT = {
  width: "100%",
  height: "100vh",
  display: "flex",
  flexDirection: "column",
  background: "var(--bg)",
  color: "var(--ink)",
  overflow: "hidden",
};

export default function App() {
  const tab = useUiStore((s) => s.tab);

  // The engine (Pyodide) loads lazily on first use with RuntimeStatus feedback —
  // both in the browser and the desktop build — so there is nothing to wait on
  // at startup.
  useEffect(() => {
    const session = loadSession();
    if (!session) return;
  }, []);

  useEffect(() => {
    const handler = (e) => {
      // Ignore shortcuts while typing in form fields.
      const tag = e.target?.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return;
      if (e.target?.isContentEditable) return;

      const ui = useUiStore.getState();
      if (ui.tab === "setup") {
        if (e.key === "1") { ui.setFilter("face");   return; }
        if (e.key === "2") { ui.setFilter("edge");   return; }
        if (e.key === "3") { ui.setFilter("vertex"); return; }
        if (e.key === "Escape") {
          useOpsStore.getState().cancelPrompt();
          useStepStore.getState().deselectAll?.();
          return;
        }
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, []);

  return (
    <div style={ROOT}>
      <TopBar />
      <div style={{ flex: 1, display: "flex", overflow: "hidden", minHeight: 0 }}>
        {tab === "setup"    && <SetupTab />}
        {tab === "simulate" && <SimulateTab />}
        {tab === "post"     && <PostTab />}
      </div>
      <StatusBar />
      <ScriptOverlay />
      <RuntimeStatus />
    </div>
  );
}
