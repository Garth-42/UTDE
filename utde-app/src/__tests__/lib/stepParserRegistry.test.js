import { describe, it, expect, beforeEach } from "vitest";
import {
  setStepParser,
  hasStepParser,
  parseStepBytes,
} from "../../lib/runtime/stepParser";

beforeEach(() => {
  setStepParser(null);
});

describe("stepParser registry", () => {
  it("reports no parser before one is registered", () => {
    expect(hasStepParser()).toBe(false);
  });

  it("throws a clear error when parsing with no parser", async () => {
    await expect(parseStepBytes(new Uint8Array([1]), 0.5)).rejects.toThrow(
      /CAD kernel|not available/i
    );
  });

  it("delegates to the registered parser", async () => {
    setStepParser(async (bytes, deflection) => ({
      faces: [], edges: [], face_count: 0, edge_count: 0, _defl: deflection, _len: bytes.length,
    }));
    expect(hasStepParser()).toBe(true);
    const out = await parseStepBytes(new Uint8Array([1, 2, 3]), 0.25);
    expect(out._defl).toBe(0.25);
    expect(out._len).toBe(3);
  });
});
