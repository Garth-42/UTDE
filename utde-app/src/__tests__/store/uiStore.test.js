import { describe, it, expect, beforeEach } from "vitest";
import { useUiStore } from "../../store/uiStore";

const INITIAL = {
  selectionMode: "both",
  activePanel: null,
  scriptOutput: null,
  scriptRunning: false,
  graphView: true,
  scriptView: false,
  showToolpaths: false,
};

beforeEach(() => {
  useUiStore.setState(INITIAL);
});

describe("selectionMode", () => {
  it("defaults to both", () => {
    expect(useUiStore.getState().selectionMode).toBe("both");
  });

  it("setSelectionMode to faces", () => {
    useUiStore.getState().setSelectionMode("faces");
    expect(useUiStore.getState().selectionMode).toBe("faces");
  });

  it("setSelectionMode to edges", () => {
    useUiStore.getState().setSelectionMode("edges");
    expect(useUiStore.getState().selectionMode).toBe("edges");
  });
});

describe("activePanel", () => {
  it("defaults to null", () => {
    expect(useUiStore.getState().activePanel).toBeNull();
  });

  it("setActivePanel opens code panel", () => {
    useUiStore.getState().setActivePanel("code");
    expect(useUiStore.getState().activePanel).toBe("code");
  });

  it("setActivePanel null closes panel", () => {
    useUiStore.setState({ activePanel: "code" });
    useUiStore.getState().setActivePanel(null);
    expect(useUiStore.getState().activePanel).toBeNull();
  });
});

describe("graphView", () => {
  it("defaults to true", () => {
    expect(useUiStore.getState().graphView).toBe(true);
  });

  it("toggleGraphView flips the flag", () => {
    useUiStore.getState().toggleGraphView();
    expect(useUiStore.getState().graphView).toBe(false);
    useUiStore.getState().toggleGraphView();
    expect(useUiStore.getState().graphView).toBe(true);
  });
});

describe("showToolpaths", () => {
  it("defaults to false", () => {
    expect(useUiStore.getState().showToolpaths).toBe(false);
  });

  it("toggleToolpaths flips the flag", () => {
    useUiStore.getState().toggleToolpaths();
    expect(useUiStore.getState().showToolpaths).toBe(true);
    useUiStore.getState().toggleToolpaths();
    expect(useUiStore.getState().showToolpaths).toBe(false);
  });

  it("setShowToolpaths sets directly", () => {
    useUiStore.getState().setShowToolpaths(true);
    expect(useUiStore.getState().showToolpaths).toBe(true);
  });
});

describe("scriptView", () => {
  it("defaults to false", () => {
    expect(useUiStore.getState().scriptView).toBe(false);
  });

  it("setScriptView true enables script view and clears graphView", () => {
    useUiStore.getState().setScriptView(true);
    expect(useUiStore.getState().scriptView).toBe(true);
    expect(useUiStore.getState().graphView).toBe(false);
  });

  it("setScriptView false disables script view", () => {
    useUiStore.setState({ scriptView: true });
    useUiStore.getState().setScriptView(false);
    expect(useUiStore.getState().scriptView).toBe(false);
  });

  it("toggleScriptView flips scriptView", () => {
    useUiStore.getState().toggleScriptView();
    expect(useUiStore.getState().scriptView).toBe(true);
    useUiStore.getState().toggleScriptView();
    expect(useUiStore.getState().scriptView).toBe(false);
  });

  it("toggleGraphView clears scriptView", () => {
    useUiStore.setState({ scriptView: true, graphView: false });
    useUiStore.getState().toggleGraphView();
    expect(useUiStore.getState().scriptView).toBe(false);
  });
});

describe("scriptOutput", () => {
  it("defaults to null", () => {
    expect(useUiStore.getState().scriptOutput).toBeNull();
  });

  it("setScriptOutput stores output", () => {
    useUiStore.getState().setScriptOutput({ stdout: "hello", stderr: "", success: true });
    expect(useUiStore.getState().scriptOutput.stdout).toBe("hello");
  });
});

describe("scriptRunning", () => {
  it("defaults to false", () => {
    expect(useUiStore.getState().scriptRunning).toBe(false);
  });

  it("setScriptRunning toggles", () => {
    useUiStore.getState().setScriptRunning(true);
    expect(useUiStore.getState().scriptRunning).toBe(true);
    useUiStore.getState().setScriptRunning(false);
    expect(useUiStore.getState().scriptRunning).toBe(false);
  });
});
