import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock the Pyodide transport, the STEP parser registry, and bundled machines.
const callPython = vi.fn();
vi.mock("../../lib/pyodide/client", () => ({
  callPython: (...a) => callPython(...a),
}));

const parseStepBytes = vi.fn();
vi.mock("../../lib/runtime/stepParser", () => ({
  parseStepBytes: (...a) => parseStepBytes(...a),
}));

vi.mock("../../lib/runtime/machineAssets", () => ({
  machineYamls: [
    { id: "generic_5axis_ac", text: "name: generic_5axis_ac" },
    { id: "generic_6dof_robot", text: "name: generic_6dof_robot" },
  ],
}));

import runtime from "../../lib/runtime";

beforeEach(() => {
  callPython.mockReset();
  parseStepBytes.mockReset();
  runtime._resetImportedMachines();
});

describe("runtime.generateToolpath / compileTimeline", () => {
  it("forwards payload to generate_toolpath", async () => {
    callPython.mockResolvedValue({ points: [], gcode: "", point_count: 0 });
    const payload = { faces: [], edges: [], strategy: {} };
    await runtime.generateToolpath(payload);
    expect(callPython).toHaveBeenCalledWith("generate_toolpath", { payload });
  });

  it("passes lastModelPath to compile_timeline", async () => {
    callPython.mockResolvedValue({ points: [], op_ranges: [], gcode: "", warnings: [] });
    await runtime.compileTimeline({ entries: [] }, { lastModelPath: "/tmp/p.step" });
    expect(callPython).toHaveBeenCalledWith("compile_timeline", {
      payload: { entries: [] },
      last_model_path: "/tmp/p.step",
    });
  });
});

describe("runtime.listTemplates", () => {
  it("unwraps the templates array", async () => {
    callPython.mockResolvedValue({ templates: [{ id: "pocket" }] });
    const out = await runtime.listTemplates();
    expect(out).toEqual([{ id: "pocket" }]);
  });

  it("hides requires_local (subprocess) templates", async () => {
    callPython.mockResolvedValue({
      templates: [
        { id: "pocket", requires_local: false },
        { id: "prusaslicer", requires_local: true },
        { id: "raster_fill" },
      ],
    });
    const out = await runtime.listTemplates();
    const ids = out.map((t) => t.id);
    expect(ids).toContain("pocket");
    expect(ids).toContain("raster_fill");
    expect(ids).not.toContain("prusaslicer");
  });
});

describe("runtime.listMachines", () => {
  it("summarizes every bundled machine YAML", async () => {
    callPython.mockImplementation(async (_op, args) => ({
      id: args.id,
      name: args.id,
      axis_count: 5,
    }));
    const machines = await runtime.listMachines();
    expect(machines.map((m) => m.id)).toEqual(["generic_5axis_ac", "generic_6dof_robot"]);
    expect(callPython).toHaveBeenCalledWith(
      "summarize_machine",
      expect.objectContaining({ id: "generic_5axis_ac" })
    );
  });
});

describe("runtime.importMachine", () => {
  it("registers a valid machine and surfaces it in listMachines", async () => {
    callPython.mockImplementation(async (_op, args) => ({
      id: args.id,
      name: args.id,
      axis_count: 3,
    }));
    const m = await runtime.importMachine("name: mybot", "mybot.yaml");
    expect(m.id).toBe("mybot");
    const machines = await runtime.listMachines();
    expect(machines.some((x) => x.id === "mybot")).toBe(true);
  });

  it("throws when the YAML is invalid", async () => {
    callPython.mockResolvedValue({ id: "bad", error: "could not parse" });
    await expect(runtime.importMachine(":bad:", "bad.yaml")).rejects.toThrow(/Invalid machine YAML/);
  });
});

describe("runtime.parseStep", () => {
  it("converts a File to bytes and delegates to the parser", async () => {
    parseStepBytes.mockResolvedValue({ faces: [], edges: [], face_count: 0, edge_count: 0 });
    const file = new File([new Uint8Array([1, 2, 3])], "p.step");
    await runtime.parseStep(file, 0.25);
    expect(parseStepBytes).toHaveBeenCalledTimes(1);
    const [bytes, deflection] = parseStepBytes.mock.calls[0];
    expect(bytes).toBeInstanceOf(Uint8Array);
    expect(deflection).toBe(0.25);
  });

  it("accepts a raw ArrayBuffer", async () => {
    parseStepBytes.mockResolvedValue({ faces: [], edges: [] });
    await runtime.parseStep(new Uint8Array([9, 9]).buffer);
    expect(parseStepBytes).toHaveBeenCalled();
  });
});

describe("runtime.checkHealth", () => {
  it("reports the browser runtime as ok", async () => {
    const h = await runtime.checkHealth();
    expect(h.ok).toBe(true);
    expect(h.runtime).toBe("browser");
  });
});
