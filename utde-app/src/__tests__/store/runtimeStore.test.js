import { describe, it, expect, beforeEach } from "vitest";
import { useRuntimeStore } from "../../store/runtimeStore";

beforeEach(() => {
  useRuntimeStore.setState({
    engines: {
      pyodide: { status: "idle", stage: null, error: null },
      occt: { status: "idle", stage: null, error: null },
    },
  });
});

describe("runtimeStore", () => {
  it("starts idle", () => {
    const { engines } = useRuntimeStore.getState();
    expect(engines.pyodide.status).toBe("idle");
    expect(engines.occt.status).toBe("idle");
  });

  it("setEngine updates one engine's status + stage", () => {
    useRuntimeStore.getState().setEngine("pyodide", "loading", "wheel");
    const e = useRuntimeStore.getState().engines.pyodide;
    expect(e.status).toBe("loading");
    expect(e.stage).toBe("wheel");
    expect(e.error).toBeNull();
    // unrelated engine untouched
    expect(useRuntimeStore.getState().engines.occt.status).toBe("idle");
  });

  it("setEngine ready clears stage error", () => {
    useRuntimeStore.getState().setError("pyodide", "boom");
    useRuntimeStore.getState().setEngine("pyodide", "ready");
    const e = useRuntimeStore.getState().engines.pyodide;
    expect(e.status).toBe("ready");
    expect(e.error).toBeNull();
  });

  it("setError records the message", () => {
    useRuntimeStore.getState().setError("occt", "kernel failed");
    const e = useRuntimeStore.getState().engines.occt;
    expect(e.status).toBe("error");
    expect(e.error).toBe("kernel failed");
  });
});
