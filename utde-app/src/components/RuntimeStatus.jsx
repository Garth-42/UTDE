/**
 * RuntimeStatus — an unobtrusive bottom-right toast shown while the in-browser
 * engines (Pyodide, opencascade.js) are loading on first use, or if one fails.
 * Renders nothing once everything is idle/ready.
 */
import { useRuntimeStore } from "../store/runtimeStore";

const ENGINE_LABEL = {
  pyodide: "Toolpath engine",
  occt: "CAD kernel",
};

// Friendly text for the progress stages the engines report.
const STAGE_LABEL = {
  starting: "starting…",
  loading: "downloading…",
  packages: "downloading numpy / scipy…",
  wheel: "installing engine…",
  instantiating: "instantiating…",
  ready: "ready",
};

function stageText(stage) {
  return STAGE_LABEL[stage] || "loading…";
}

export default function RuntimeStatus() {
  const engines = useRuntimeStore((s) => s.engines);

  const active = Object.entries(engines).filter(
    ([, e]) => e.status === "loading" || e.status === "error"
  );
  if (active.length === 0) return null;

  return (
    <div
      role="status"
      aria-live="polite"
      style={{
        position: "fixed",
        bottom: 16,
        right: 16,
        zIndex: 9000,
        display: "flex",
        flexDirection: "column",
        gap: 8,
        pointerEvents: "none",
      }}
    >
      {active.map(([name, e]) => {
        const isError = e.status === "error";
        return (
          <div
            key={name}
            title={isError ? e.error || "" : undefined}
            style={{
              display: "flex",
              alignItems: "center",
              gap: 10,
              maxWidth: 320,
              padding: "8px 12px",
              borderRadius: 8,
              fontSize: 12,
              fontFamily: '"Segoe UI", system-ui, sans-serif',
              background: "var(--panel, #1b1f27)",
              color: "var(--ink, #e6edf3)",
              border: `1px solid ${isError ? "#d93025" : "var(--border, #2a3240)"}`,
              boxShadow: "0 4px 14px rgba(0,0,0,0.25)",
            }}
          >
            {isError ? (
              <span style={{ color: "#d93025", fontWeight: 700 }}>⚠</span>
            ) : (
              <span
                style={{
                  width: 14,
                  height: 14,
                  flex: "0 0 auto",
                  border: "2px solid var(--border, #3a4250)",
                  borderTop: "2px solid #4cc4ff",
                  borderRadius: "50%",
                  animation: "utde-spin 0.8s linear infinite",
                }}
              />
            )}
            <span>
              <strong>{ENGINE_LABEL[name] || name}</strong>{" "}
              {isError ? "failed to load" : stageText(e.stage)}
            </span>
          </div>
        );
      })}
      <style>{`@keyframes utde-spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  );
}
