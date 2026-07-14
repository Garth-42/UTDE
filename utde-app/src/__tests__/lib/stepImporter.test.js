import { describe, it, expect, vi, beforeEach } from "vitest";

// The desktop import must parse client-side (Pyodide/OCCT) with no server —
// it reads the picked file's bytes and feeds them through the same parseStep.
const client = vi.hoisted(() => ({ parseStep: vi.fn() }));
const backend = vi.hoisted(() => ({
  IS_TAURI: true,
  openStepFileDialog: vi.fn(),
  readStepFileBytes: vi.fn(),
}));
vi.mock("../../api/client", () => client);
vi.mock("../../lib/backend", () => backend);

import { importStepViaTauri, importStepFromFile } from "../../lib/stepImporter";
import { useStepStore } from "../../store/stepStore";

beforeEach(() => {
  vi.clearAllMocks();
  useStepStore.setState({ faces: [], edges: [], fileName: null, error: null, isLoading: false });
});

describe("importStepViaTauri", () => {
  it("reads the picked file's bytes and parses them client-side (no server)", async () => {
    backend.openStepFileDialog.mockResolvedValue("/models/bracket.step");
    const bytes = new Uint8Array([1, 2, 3]);
    backend.readStepFileBytes.mockResolvedValue(bytes);
    client.parseStep.mockResolvedValue({ faces: [{ id: 0 }], edges: [] });

    const data = await importStepViaTauri();

    expect(backend.readStepFileBytes).toHaveBeenCalledWith("/models/bracket.step");
    expect(client.parseStep).toHaveBeenCalledWith(bytes); // bytes, not a path
    expect(data.faces).toHaveLength(1);
    const s = useStepStore.getState();
    expect(s.fileName).toBe("bracket.step");
    expect(s.faces).toHaveLength(1);
  });

  it("returns null when the dialog is cancelled and never parses", async () => {
    backend.openStepFileDialog.mockResolvedValue(null);
    expect(await importStepViaTauri()).toBeNull();
    expect(backend.readStepFileBytes).not.toHaveBeenCalled();
    expect(client.parseStep).not.toHaveBeenCalled();
  });

  it("records a parse error in the store and rejects", async () => {
    backend.openStepFileDialog.mockResolvedValue("/x.step");
    backend.readStepFileBytes.mockResolvedValue(new Uint8Array([0]));
    client.parseStep.mockRejectedValue(new Error("bad STEP"));
    await expect(importStepViaTauri()).rejects.toThrow("bad STEP");
    expect(useStepStore.getState().error).toMatch(/bad STEP/);
  });
});

describe("importStepFromFile", () => {
  it("parses a browser File through the same client-side path", async () => {
    client.parseStep.mockResolvedValue({ faces: [], edges: [{ id: 1 }] });
    const file = new File(["data"], "part.stp");
    const data = await importStepFromFile(file);
    expect(client.parseStep).toHaveBeenCalledWith(file);
    expect(data.edges).toHaveLength(1);
    expect(useStepStore.getState().fileName).toBe("part.stp");
  });
});
