import { useEffect, useState } from "react";
import { useUiStore } from "./store/uiStore";
import { useStepStore } from "./store/stepStore";
import { useOpsStore } from "./store/opsStore";
import { loadSession } from "./utils/session";
import { waitForServer, IS_TAURI } from "./lib/backend";

import TopBar from "./components/TopBar";
import StatusBar from "./components/StatusBar";
import SetupTab from "./components/setup/SetupTab";
import SimulateTab from "./components/simulate/SimulateTab";
import PostTab from "./components/post/PostTab";
import SplashScreen from "./components/SplashScreen";
import ScriptOverlay from "./components/ScriptOverlay";

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

  const [serverReady, setServerReady] = useState(!IS_TAURI);
  const [serverError, setServerError] = useState(null);

  useEffect(() => {
    if (!IS_TAURI) return;
    waitForServer()
      .then(() => setServerReady(true))
      .catch((err) => setServerError(err.message));
  }, []);

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

  if (!serverReady) {
    return <SplashScreen message="Starting engine…" error={serverError} />;
  }

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
    </div>
  );
}
