import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { parseStep, generateToolpath, runScript, checkHealth, parseStepByPath, lintScript } from "../../api/client";

// ── Mock Tauri so tests run in jsdom without a real desktop process ────────────
vi.mock("@tauri-apps/api/core", () => ({
  invoke: vi.fn().mockResolvedValue(5174),
}));
vi.mock("@tauri-apps/plugin-dialog", () => ({
  open: vi.fn(),
  save: vi.fn(),
}));
vi.mock("@tauri-apps/plugin-fs", () => ({
  writeTextFile: vi.fn(),
}));

// ── Mock the global fetch ─────────────────────────────────────────────────────
beforeEach(() => {
  global.fetch = vi.fn();
  // Reset the cached base URL between tests
  vi.resetModules();
});

afterEach(() => {
  vi.restoreAllMocks();
});

function mockFetch(status, body) {
  global.fetch.mockResolvedValue({
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
  });
}

// ── checkHealth ───────────────────────────────────────────────────────────────

describe("checkHealth", () => {
  it("calls GET /health", async () => {
    mockFetch(200, { ok: true, occ_available: true });
    await checkHealth();
    expect(fetch).toHaveBeenCalledWith(expect.stringContaining("/health"));
  });

  it("returns parsed JSON", async () => {
    mockFetch(200, { ok: true, occ_available: false });
    const result = await checkHealth();
    expect(result.ok).toBe(true);
    expect(result.occ_available).toBe(false);
  });
});

// ── parseStep ────────────────────────────────────────────────────────────────

describe("parseStep", () => {
  it("sends POST to /parse-step with FormData", async () => {
    mockFetch(200, { faces: [], edges: [], face_count: 0, edge_count: 0 });
    const file = new File(["data"], "part.step");
    await parseStep(file, 0.5);
    expect(fetch).toHaveBeenCalledWith(
      expect.stringContaining("/parse-step"),
      expect.objectContaining({ method: "POST" })
    );
  });

  it("returns face and edge data", async () => {
    const responseData = { faces: [{ id: 0 }], edges: [{ id: 0 }], face_count: 1, edge_count: 1 };
    mockFetch(200, responseData);
    const file = new File(["data"], "part.step");
    const result = await parseStep(file, 0.5);
    expect(result.faces).toHaveLength(1);
    expect(result.edge_count).toBe(1);
  });

  it("throws on server error", async () => {
    mockFetch(500, { error: "pythonocc not installed" });
    const file = new File(["data"], "part.step");
    await expect(parseStep(file)).rejects.toThrow("pythonocc not installed");
  });

  it("throws with generic message if no error field", async () => {
    mockFetch(500, {});
    const file = new File(["data"], "part.step");
    await expect(parseStep(file)).rejects.toThrow("Server error");
  });

  it("includes deflection in form data", async () => {
    mockFetch(200, { faces: [], edges: [], face_count: 0, edge_count: 0 });
    const file = new File(["data"], "part.step");
    await parseStep(file, 1.5);
    const [, options] = fetch.mock.calls[0];
    expect(options.body.get("deflection")).toBe("1.5");
  });
});

// ── parseStepByPath (Tauri native path endpoint) ──────────────────────────────

describe("parseStepByPath", () => {
  it("sends POST to /parse-step-path with JSON body", async () => {
    mockFetch(200, { faces: [], edges: [], face_count: 0, edge_count: 0 });
    await parseStepByPath("/home/user/part.step", 0.5);
    expect(fetch).toHaveBeenCalledWith(
      expect.stringContaining("/parse-step-path"),
      expect.objectContaining({ method: "POST" })
    );
    const [, options] = fetch.mock.calls[0];
    const body = JSON.parse(options.body);
    expect(body.path).toBe("/home/user/part.step");
    expect(body.deflection).toBe(0.5);
  });

  it("throws on error response", async () => {
    mockFetch(400, { error: "File not found" });
    await expect(parseStepByPath("/nonexistent.step")).rejects.toThrow("File not found");
  });
});

// ── generateToolpath ──────────────────────────────────────────────────────────

describe("generateToolpath", () => {
  const params = {
    faces: [],
    edges: [{ id: 0, type: "line", params: { start: [0, 0, 0], end: [10, 0, 0] } }],
    strategy: { type: "follow_curve", feed_rate: 600 },
    orientationRules: [],
    machine: "cartesian_3axis",
    workspaceOrigin: null,
  };

  it("sends POST to /generate-toolpath with JSON", async () => {
    mockFetch(200, { points: [], gcode: "", point_count: 0 });
    await generateToolpath(params);
    expect(fetch).toHaveBeenCalledWith(
      expect.stringContaining("/generate-toolpath"),
      expect.objectContaining({
        method: "POST",
        headers: expect.objectContaining({ "Content-Type": "application/json" }),
      })
    );
  });

  it("sends workspaceOrigin as workspace_origin in body", async () => {
    mockFetch(200, { points: [], gcode: "", point_count: 0 });
    await generateToolpath({ ...params, workspaceOrigin: { x: 1, y: 2, z: 3 } });
    const [, options] = fetch.mock.calls[0];
    const body = JSON.parse(options.body);
    expect(body.workspace_origin).toEqual({ x: 1, y: 2, z: 3 });
  });

  it("sends null for null workspaceOrigin", async () => {
    mockFetch(200, { points: [], gcode: "", point_count: 0 });
    await generateToolpath(params);
    const [, options] = fetch.mock.calls[0];
    const body = JSON.parse(options.body);
    expect(body.workspace_origin).toBeNull();
  });

  it("returns points and gcode", async () => {
    const responseData = {
      points: [{ x: 0, y: 0, z: 0, nx: 0, ny: 0, nz: -1, feed_rate: 600 }],
      gcode: "G1 X0\nM30",
      point_count: 1,
    };
    mockFetch(200, responseData);
    const result = await generateToolpath(params);
    expect(result.points).toHaveLength(1);
    expect(result.gcode).toContain("M30");
  });

  it("throws on error response", async () => {
    mockFetch(400, { error: "No geometry selected" });
    await expect(generateToolpath(params)).rejects.toThrow("No geometry selected");
  });

  it("sends orientationRules as orientation in body", async () => {
    mockFetch(200, { points: [], gcode: "", point_count: 0 });
    const rules = [{ rule: "fixed", i: 0, j: 0, k: -1 }];
    await generateToolpath({ ...params, orientationRules: rules });
    const [, options] = fetch.mock.calls[0];
    const body = JSON.parse(options.body);
    expect(body.orientation).toEqual(rules);
  });
});

// ── runScript ─────────────────────────────────────────────────────────────────

describe("runScript", () => {
  it("sends POST to /run-script with code", async () => {
    mockFetch(200, { success: true, stdout: "hi", stderr: "", gcode: null });
    await runScript("print('hi')");
    expect(fetch).toHaveBeenCalledWith(
      expect.stringContaining("/run-script"),
      expect.objectContaining({
        method: "POST",
        headers: expect.objectContaining({ "Content-Type": "application/json" }),
      })
    );
    const [, options] = fetch.mock.calls[0];
    expect(JSON.parse(options.body).code).toBe("print('hi')");
  });

  it("returns stdout and success", async () => {
    mockFetch(200, { success: true, stdout: "hello", stderr: "", gcode: null });
    const result = await runScript("print('hello')");
    expect(result.success).toBe(true);
    expect(result.stdout).toBe("hello");
  });

  it("throws on HTTP error", async () => {
    mockFetch(500, { error: "Timeout" });
    await expect(runScript("import time; time.sleep(100)")).rejects.toThrow("Timeout");
  });

  it("returns gcode when script writes .nc file", async () => {
    mockFetch(200, { success: true, stdout: "", stderr: "", gcode: "G0 Z50\nM30" });
    const result = await runScript("...");
    expect(result.gcode).toContain("M30");
  });
});

describe("lintScript", () => {
  it("sends POST to /lint-script with code", async () => {
    mockFetch(200, { errors: [] });
    await lintScript("x = 1");
    expect(global.fetch).toHaveBeenCalledWith(
      expect.stringContaining("/lint-script"),
      expect.objectContaining({ method: "POST" })
    );
  });

  it("returns empty errors for valid code", async () => {
    mockFetch(200, { errors: [] });
    const result = await lintScript("x = 1 + 1");
    expect(result.errors).toEqual([]);
  });

  it("returns error objects for invalid code", async () => {
    mockFetch(200, { errors: [{ line: 0, col: 0, message: "invalid syntax" }] });
    const result = await lintScript("def foo(\n");
    expect(result.errors).toHaveLength(1);
    expect(result.errors[0].message).toBe("invalid syntax");
  });

  it("throws on HTTP error", async () => {
    mockFetch(500, { error: "Server error" });
    await expect(lintScript("x = 1")).rejects.toThrow("Server error");
  });
});
