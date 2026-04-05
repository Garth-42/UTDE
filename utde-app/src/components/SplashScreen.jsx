/**
 * Full-screen loading overlay shown while the Python sidecar is starting up.
 * Only displayed in Tauri desktop builds.
 */
export default function SplashScreen({ message = "Starting engine…", error = null }) {
  return (
    <div style={{
      position: "fixed", inset: 0,
      background: "#f0f0f5",
      display: "flex", flexDirection: "column",
      alignItems: "center", justifyContent: "center",
      gap: 20,
      fontFamily: '"Segoe UI", system-ui, sans-serif',
      color: "#1a1a2e",
      zIndex: 9999,
    }}>
      {!error && (
        <div style={{
          width: 40, height: 40,
          border: "3px solid #d0d0df",
          borderTop: "3px solid #6355e0",
          borderRadius: "50%",
          animation: "spin 0.8s linear infinite",
        }} />
      )}

      {error ? (
        <>
          <div style={{ fontSize: 18, color: "#d93025" }}>Engine failed to start</div>
          <div style={{
            fontSize: 11, color: "#66667a",
            maxWidth: 480, textAlign: "center", lineHeight: 1.7,
          }}>
            {error}
          </div>
          <div style={{ fontSize: 10, color: "#66667a" }}>
            Try restarting the application. If the problem persists, check that
            the <code>utde-server</code> binary exists in the app bundle.
          </div>
        </>
      ) : (
        <>
          <div style={{ fontSize: 22, fontWeight: 700, letterSpacing: 2, color: "#1a1a2e" }}>
            UTDE
          </div>
          <div style={{ fontSize: 11, color: "#66667a" }}>{message}</div>
        </>
      )}

      <style>{`
        @keyframes spin { to { transform: rotate(360deg); } }
      `}</style>
    </div>
  );
}
