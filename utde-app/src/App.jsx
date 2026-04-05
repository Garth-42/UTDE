import { useEffect, useRef, useState } from "react";
import { useUiStore } from "./store/uiStore";
import Header from "./components/Header";
import Sidebar from "./components/Sidebar";
import StepViewport from "./components/viewport/StepViewport";
import CodePanel from "./components/panels/CodePanel";
import SplashScreen from "./components/SplashScreen";
import { useStepStore } from "./store/stepStore";
import { loadSession } from "./utils/session";
import { waitForServer, IS_TAURI } from "./lib/backend";
import NodeGraphPanel from "./components/NodeGraph/NodeGraphPanel";

const ROOT = {
  width: "100%", height: "100vh",
  display: "flex", flexDirection: "column",
  fontFamily: '"Segoe UI", system-ui, sans-serif',
  background: "#f0f0f5", color: "#1a1a2e",
  overflow: "hidden",
};

export default function App() {
  const activePanel = useUiStore((s) => s.activePanel);
  const graphView   = useUiStore((s) => s.graphView);

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
      if (e.key === "Escape") useStepStore.getState().deselectAll();
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, []);

  if (!serverReady) {
    return <SplashScreen message="Starting engine…" error={serverError} />;
  }

  return (
    <div style={ROOT}>
      <Header />
      <div style={{ flex: 1, display: "flex", overflow: "hidden" }}>
        <Sidebar />
        <div style={{ flex: 1, display: "flex", flexDirection: "column", overflow: "hidden" }}>
          <div style={{ flex: 1, position: "relative", overflow: "hidden" }}>
            {graphView ? <NodeGraphPanel /> : <StepViewport />}
          </div>

          {activePanel === "code" && (
            <div style={{ height: 300, borderTop: "1px solid #d0d0df", background: "#f0f0f5", display: "flex", flexDirection: "column" }}>
              <CodePanel />
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
