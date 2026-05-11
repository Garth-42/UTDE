import { describe, it, expect, beforeEach } from "vitest";
import { useUiStore } from "../../store/uiStore";

const INITIAL = {
  tab:    "setup",
  filter: "face",
  scriptOverlayOpen: false,
  selectionMode: "both",
  showBasePlate: true,
  showToolpaths: false,
};

beforeEach(() => {
  useUiStore.setState(INITIAL);
});

describe("tab", () => {
  it("defaults to setup", () => {
    expect(useUiStore.getState().tab).toBe("setup");
  });

  it("setTab switches", () => {
    useUiStore.getState().setTab("simulate");
    expect(useUiStore.getState().tab).toBe("simulate");
    useUiStore.getState().setTab("post");
    expect(useUiStore.getState().tab).toBe("post");
  });
});

describe("filter", () => {
  it("defaults to face", () => {
    expect(useUiStore.getState().filter).toBe("face");
  });

  it("setFilter switches", () => {
    useUiStore.getState().setFilter("edge");
    expect(useUiStore.getState().filter).toBe("edge");
    useUiStore.getState().setFilter("vertex");
    expect(useUiStore.getState().filter).toBe("vertex");
  });
});

describe("scriptOverlayOpen", () => {
  it("defaults to false", () => {
    expect(useUiStore.getState().scriptOverlayOpen).toBe(false);
  });

  it("toggleScriptOverlay flips", () => {
    useUiStore.getState().toggleScriptOverlay();
    expect(useUiStore.getState().scriptOverlayOpen).toBe(true);
    useUiStore.getState().toggleScriptOverlay();
    expect(useUiStore.getState().scriptOverlayOpen).toBe(false);
  });

  it("setScriptOverlay sets directly", () => {
    useUiStore.getState().setScriptOverlay(true);
    expect(useUiStore.getState().scriptOverlayOpen).toBe(true);
  });
});

describe("selectionMode (legacy 3D viewport flag)", () => {
  it("defaults to both", () => {
    expect(useUiStore.getState().selectionMode).toBe("both");
  });

  it("setSelectionMode updates the value", () => {
    useUiStore.getState().setSelectionMode("faces");
    expect(useUiStore.getState().selectionMode).toBe("faces");
  });
});

describe("showBasePlate", () => {
  it("defaults to true", () => {
    expect(useUiStore.getState().showBasePlate).toBe(true);
  });

  it("setShowBasePlate flips it off", () => {
    useUiStore.getState().setShowBasePlate(false);
    expect(useUiStore.getState().showBasePlate).toBe(false);
  });
});

describe("showToolpaths", () => {
  it("defaults to false", () => {
    expect(useUiStore.getState().showToolpaths).toBe(false);
  });

  it("setShowToolpaths sets directly", () => {
    useUiStore.getState().setShowToolpaths(true);
    expect(useUiStore.getState().showToolpaths).toBe(true);
  });
});
