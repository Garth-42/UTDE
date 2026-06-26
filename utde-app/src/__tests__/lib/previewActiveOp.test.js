import { describe, it, expect, vi, beforeEach } from "vitest";
import { previewActiveOp } from "../../lib/timelineCompiler";
import runtime from "../../lib/runtime";
import { useOpsStore } from "../../store/opsStore";
import { useStepStore } from "../../store/stepStore";
import { useToolpathStore } from "../../store/toolpathStore";
import { useUiStore } from "../../store/uiStore";

// The timeline compiler now runs in-browser via the runtime, not over fetch.
vi.mock("../../lib/runtime", () => ({
  default: { compileTimeline: vi.fn() },
}));

const POCKET = {
  id: "pocket", label: "Pocket", kind: "sub", icon: "pocket",
  requires: [{ type: "face", label: "Pocket floor" }],
  params:   [{ id: "depth", type: "number", default: 8 }],
  est_time: 4.6,
};

vi.mock("../../lib/backend", () => ({
  IS_TAURI: false,
  getBaseUrl: vi.fn().mockResolvedValue("/api"),
  waitForServer: vi.fn(),
  openStepFileDialog: vi.fn(),
  saveGcodeDialog: vi.fn(),
}));

const lastFetchBody = {};

beforeEach(() => {
  Object.keys(lastFetchBody).forEach((k) => delete lastFetchBody[k]);
  runtime.compileTimeline.mockReset();
  runtime.compileTimeline.mockImplementation(async (body) => {
    Object.assign(lastFetchBody, body);
    return {
      points: [],
      op_ranges: [{ idx: 0, uid: "op_x", name: "Pocket", templateId: "pocket",
                    kind: "sub", point_start: 0, point_end: 0,
                    gcode_start_line: 0, gcode_end_line: 0 }],
      gcode: "",
      warnings: [],
    };
  });

  useOpsStore.getState().reset();
  useOpsStore.setState({ entries: [] });
  useStepStore.setState({ faces: [], edges: [], workspaceOrigin: null });
  useToolpathStore.setState({
    toolpaths: [], activeIds: new Set(),
    animProgress: 0, isAnimating: false, simSpeed: 1,
    opRanges: [], gcode: "", warnings: [],
    isCompiling: false, compileError: null,
  });
  useUiStore.setState({
    tab: "setup", filter: "face", scriptOverlayOpen: false,
    showToolpaths: false,
  });
});

describe("previewActiveOp", () => {
  it("throws when no op is active", async () => {
    await expect(previewActiveOp()).rejects.toThrow(/No active op/);
  });

  it("throws when the active row is an orient row", async () => {
    useOpsStore.getState().applyOrient();
    await expect(previewActiveOp()).rejects.toThrow(/not an op/);
  });

  it("posts a sub-timeline containing the active op", async () => {
    useOpsStore.getState().applyTemplate(POCKET);
    await previewActiveOp();
    expect(lastFetchBody.entries).toHaveLength(1);
    expect(lastFetchBody.entries[0].templateId).toBe("pocket");
  });

  it("includes preceding visible orient rows in the subset", async () => {
    useOpsStore.getState().applyOrient();
    useOpsStore.getState().addOrientRule(0, { type: "lead", angle: 15 });
    useOpsStore.getState().applyTemplate(POCKET);
    await previewActiveOp();
    expect(lastFetchBody.entries).toHaveLength(2);
    expect(lastFetchBody.entries[0].kind).toBe("orient");
    expect(lastFetchBody.entries[1].kind).toBe("op");
  });

  it("skips hidden orient rows", async () => {
    useOpsStore.getState().applyOrient();
    useOpsStore.getState().toggleVis(0);
    useOpsStore.getState().applyTemplate(POCKET);
    await previewActiveOp();
    expect(lastFetchBody.entries).toHaveLength(1);
    expect(lastFetchBody.entries[0].kind).toBe("op");
  });

  it("enables showToolpaths and snaps animProgress to 1", async () => {
    useOpsStore.getState().applyTemplate(POCKET);
    await previewActiveOp();
    expect(useUiStore.getState().showToolpaths).toBe(true);
    expect(useToolpathStore.getState().animProgress).toBe(1);
  });

  it("stays on the Setup tab", async () => {
    useOpsStore.getState().applyTemplate(POCKET);
    await previewActiveOp();
    expect(useUiStore.getState().tab).toBe("setup");
  });
});
