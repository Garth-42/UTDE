const SESSION_KEY = "utde_session";

export function saveSession(state) {
  try {
    const serializable = {
      selectedFaceIds: [...state.selectedFaceIds],
      selectedEdgeIds: [...state.selectedEdgeIds],
      strategy: state.strategy,
      orientationRules: state.orientationRules,
      fileName: state.fileName,
      savedAt: new Date().toISOString(),
    };
    localStorage.setItem(SESSION_KEY, JSON.stringify(serializable));
  } catch {
    // localStorage unavailable
  }
}

export function loadSession() {
  try {
    const raw = localStorage.getItem(SESSION_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    return {
      ...parsed,
      selectedFaceIds: new Set(parsed.selectedFaceIds ?? []),
      selectedEdgeIds: new Set(parsed.selectedEdgeIds ?? []),
    };
  } catch {
    return null;
  }
}

export function clearSession() {
  try { localStorage.removeItem(SESSION_KEY); } catch {}
}

export function exportSession(state) {
  const data = {
    version: "0.1.0",
    fileName: state.fileName,
    selectedFaceIds: [...state.selectedFaceIds],
    selectedEdgeIds: [...state.selectedEdgeIds],
    strategy: state.strategy,
    orientationRules: state.orientationRules,
    exportedAt: new Date().toISOString(),
  };
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `utde-session-${Date.now()}.json`;
  a.click();
  URL.revokeObjectURL(url);
}

export function importSession(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const data = JSON.parse(e.target.result);
        resolve({
          ...data,
          selectedFaceIds: new Set(data.selectedFaceIds ?? []),
          selectedEdgeIds: new Set(data.selectedEdgeIds ?? []),
        });
      } catch {
        reject(new Error("Invalid session file"));
      }
    };
    reader.onerror = () => reject(new Error("Failed to read file"));
    reader.readAsText(file);
  });
}
