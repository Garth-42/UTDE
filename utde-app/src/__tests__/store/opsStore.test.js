import { describe, it, expect, beforeEach } from "vitest";
import { useOpsStore, activeOrientChain } from "../../store/opsStore";

const POCKET = {
  id: "pocket",
  label: "Pocket",
  kind: "sub",
  requires: [{ type: "face", label: "Pocket floor" }],
  params: [
    { id: "depth",   type: "number", default: 8.0 },
    { id: "stepdown", type: "number", default: 1.5 },
  ],
};

const FFF = {
  id: "fff-3axis",
  label: "FFF Print",
  kind: "add",
  requires: [],
  params: [{ id: "layer_height", type: "number", default: 0.2 }],
};

const DRILL = {
  id: "drill",
  label: "Drill",
  kind: "sub",
  requires: [{ type: "vertex", label: "Hole center" }],
  params: [{ id: "depth", type: "number", default: 18 }],
};

beforeEach(() => {
  useOpsStore.getState().reset();
  useOpsStore.setState({ entries: [] });
});

// ── default state ─────────────────────────────────────────────────────────

describe("default state", () => {
  it("seeds the timeline with a single Import CAD scene row", () => {
    // reset() restores the seeded default state; we deliberately DO NOT
    // empty entries here so we observe the seed.
    useOpsStore.getState().reset();
    const { entries } = useOpsStore.getState();
    expect(entries).toHaveLength(1);
    expect(entries[0].kind).toBe("scene");
    expect(entries[0].action).toBe("import");
  });
});

// ── applyScene ─────────────────────────────────────────────────────────────

describe("applyScene", () => {
  it("appends an Import CAD scene row", () => {
    useOpsStore.getState().applyScene("import");
    const e = useOpsStore.getState().entries[0];
    expect(e.kind).toBe("scene");
    expect(e.action).toBe("import");
    expect(e.name).toBe("Import CAD");
  });

  it("appends a Clear part scene row", () => {
    useOpsStore.getState().applyScene("clear");
    const e = useOpsStore.getState().entries[0];
    expect(e.action).toBe("clear");
    expect(e.name).toBe("Clear part");
  });

  it("makes the new scene entry active in params mode", () => {
    useOpsStore.getState().applyScene("clear");
    expect(useOpsStore.getState().activeIdx).toBe(0);
    expect(useOpsStore.getState().rpMode).toBe("params");
    expect(useOpsStore.getState().promptSlot).toBeNull();
  });
});

// ── applyTemplate ──────────────────────────────────────────────────────────

describe("applyTemplate", () => {
  it("appends an op entry with default params", () => {
    useOpsStore.getState().applyTemplate(POCKET);
    const s = useOpsStore.getState();
    expect(s.entries).toHaveLength(1);
    expect(s.entries[0]).toMatchObject({
      kind: "op",
      templateId: "pocket",
      name: "Pocket",
      params: { depth: 8.0, stepdown: 1.5 },
      geometry: [[]],
      visible: true,
    });
  });

  it("makes the new entry active", () => {
    useOpsStore.getState().applyTemplate(POCKET);
    expect(useOpsStore.getState().activeIdx).toBe(0);
  });

  it("switches the right panel to params mode", () => {
    useOpsStore.getState().applyTemplate(POCKET);
    expect(useOpsStore.getState().rpMode).toBe("params");
  });

  it("starts a geometry prompt for the first slot when geometry is required", () => {
    useOpsStore.getState().applyTemplate(POCKET);
    expect(useOpsStore.getState().promptSlot).toEqual({ entryIdx: 0, slotIdx: 0 });
  });

  it("does NOT prompt when the template requires no geometry", () => {
    useOpsStore.getState().applyTemplate(FFF);
    expect(useOpsStore.getState().promptSlot).toBeNull();
  });
});

// ── applyOrient ────────────────────────────────────────────────────────────

describe("applyOrient", () => {
  it("appends an orient entry with empty rules", () => {
    useOpsStore.getState().applyOrient();
    const e = useOpsStore.getState().entries[0];
    expect(e.kind).toBe("orient");
    expect(e.rules).toEqual([]);
    expect(e.visible).toBe(true);
  });

  it("makes the orient entry active and clears any prompt", () => {
    useOpsStore.getState().applyTemplate(POCKET);   // sets a prompt
    useOpsStore.getState().applyOrient();
    const s = useOpsStore.getState();
    expect(s.activeIdx).toBe(1);
    expect(s.promptSlot).toBeNull();
  });
});

// ── reorder ────────────────────────────────────────────────────────────────

describe("reorder", () => {
  beforeEach(() => {
    useOpsStore.getState().applyTemplate(POCKET);
    useOpsStore.getState().applyTemplate(DRILL);
    useOpsStore.getState().applyTemplate(FFF);
  });

  it("moves an entry from one position to another", () => {
    useOpsStore.getState().reorder(0, 2);
    const ids = useOpsStore.getState().entries.map((e) => e.templateId);
    expect(ids).toEqual(["drill", "fff-3axis", "pocket"]);
  });

  it("updates activeIdx to follow the moved entry", () => {
    useOpsStore.getState().pickActive(0);
    useOpsStore.getState().reorder(0, 2);
    expect(useOpsStore.getState().activeIdx).toBe(2);
  });

  it("updates activeIdx when the move shifts it", () => {
    useOpsStore.getState().pickActive(2);
    useOpsStore.getState().reorder(0, 1);
    expect(useOpsStore.getState().activeIdx).toBe(2);
  });

  it("noop on identical from/to", () => {
    const before = useOpsStore.getState().entries.map((e) => e.uid);
    useOpsStore.getState().reorder(1, 1);
    const after = useOpsStore.getState().entries.map((e) => e.uid);
    expect(after).toEqual(before);
  });
});

// ── remove ────────────────────────────────────────────────────────────────

describe("remove", () => {
  it("removes the entry at the index", () => {
    useOpsStore.getState().applyTemplate(POCKET);
    useOpsStore.getState().applyTemplate(DRILL);
    useOpsStore.getState().remove(0);
    expect(useOpsStore.getState().entries).toHaveLength(1);
    expect(useOpsStore.getState().entries[0].templateId).toBe("drill");
  });

  it("clears activeIdx if the active entry was removed", () => {
    useOpsStore.getState().applyTemplate(POCKET);
    useOpsStore.getState().remove(0);
    expect(useOpsStore.getState().activeIdx).toBeNull();
  });

  it("decrements activeIdx if a previous entry was removed", () => {
    useOpsStore.getState().applyTemplate(POCKET);
    useOpsStore.getState().applyTemplate(DRILL);
    useOpsStore.getState().pickActive(1);
    useOpsStore.getState().remove(0);
    expect(useOpsStore.getState().activeIdx).toBe(0);
  });
});

// ── toggleVis ─────────────────────────────────────────────────────────────

describe("toggleVis", () => {
  it("flips the visible flag", () => {
    useOpsStore.getState().applyTemplate(POCKET);
    useOpsStore.getState().toggleVis(0);
    expect(useOpsStore.getState().entries[0].visible).toBe(false);
    useOpsStore.getState().toggleVis(0);
    expect(useOpsStore.getState().entries[0].visible).toBe(true);
  });
});

// ── updateParam ───────────────────────────────────────────────────────────

describe("updateParam", () => {
  it("writes into the entry's params map", () => {
    useOpsStore.getState().applyTemplate(POCKET);
    useOpsStore.getState().updateParam(0, "depth", 12.5);
    expect(useOpsStore.getState().entries[0].params.depth).toBe(12.5);
  });

  it("ignores writes to orient entries", () => {
    useOpsStore.getState().applyOrient();
    useOpsStore.getState().updateParam(0, "depth", 12.5);
    expect(useOpsStore.getState().entries[0].kind).toBe("orient");
    expect(useOpsStore.getState().entries[0].params).toBeUndefined();
  });
});

// ── setGeometryForSlot ────────────────────────────────────────────────────

describe("setGeometryForSlot", () => {
  it("writes picks into the right slot index", () => {
    useOpsStore.getState().applyTemplate(POCKET);
    useOpsStore.getState().setGeometryForSlot(0, 0, ["F1", "F2"]);
    expect(useOpsStore.getState().entries[0].geometry[0]).toEqual(["F1", "F2"]);
  });
});

// ── orient rules ──────────────────────────────────────────────────────────

describe("orient rule mutations", () => {
  beforeEach(() => useOpsStore.getState().applyOrient());

  it("addOrientRule appends to the chain", () => {
    useOpsStore.getState().addOrientRule(0, { type: "to_normal" });
    useOpsStore.getState().addOrientRule(0, { type: "lead", angle: 10 });
    expect(useOpsStore.getState().entries[0].rules).toEqual([
      { type: "to_normal" },
      { type: "lead", angle: 10 },
    ]);
  });

  it("removeOrientRule drops by index", () => {
    useOpsStore.getState().addOrientRule(0, { type: "to_normal" });
    useOpsStore.getState().addOrientRule(0, { type: "lead", angle: 10 });
    useOpsStore.getState().removeOrientRule(0, 0);
    expect(useOpsStore.getState().entries[0].rules).toEqual([
      { type: "lead", angle: 10 },
    ]);
  });

  it("updateOrientRule patches a rule in place", () => {
    useOpsStore.getState().addOrientRule(0, { type: "lead", angle: 10 });
    useOpsStore.getState().updateOrientRule(0, 0, { angle: 25 });
    expect(useOpsStore.getState().entries[0].rules[0]).toEqual({
      type: "lead",
      angle: 25,
    });
  });
});

// ── activeOrientChain ─────────────────────────────────────────────────────

describe("activeOrientChain", () => {
  it("is empty before any orient entry", () => {
    useOpsStore.getState().applyTemplate(POCKET);
    const { entries } = useOpsStore.getState();
    expect(activeOrientChain(entries, 0)).toEqual([]);
  });

  it("includes rules from a preceding orient entry", () => {
    useOpsStore.getState().applyOrient();
    useOpsStore.getState().addOrientRule(0, { type: "to_normal" });
    useOpsStore.getState().applyTemplate(POCKET);
    const { entries } = useOpsStore.getState();
    expect(activeOrientChain(entries, 1)).toEqual([{ type: "to_normal" }]);
  });

  it("a later orient entry replaces (not stacks) the chain", () => {
    useOpsStore.getState().applyOrient();
    useOpsStore.getState().addOrientRule(0, { type: "to_normal" });
    useOpsStore.getState().applyTemplate(POCKET);     // idx 1: chain = [to_normal]
    useOpsStore.getState().applyOrient();             // idx 2: orient
    useOpsStore.getState().addOrientRule(2, { type: "fixed", x: 0, y: 0, z: -1 });
    useOpsStore.getState().applyTemplate(POCKET);     // idx 3: chain = [fixed]
    const { entries } = useOpsStore.getState();
    expect(activeOrientChain(entries, 3)).toEqual([
      { type: "fixed", x: 0, y: 0, z: -1 },
    ]);
  });

  it("hidden orient entries do not contribute", () => {
    useOpsStore.getState().applyOrient();
    useOpsStore.getState().addOrientRule(0, { type: "to_normal" });
    useOpsStore.getState().toggleVis(0);              // hide
    useOpsStore.getState().applyTemplate(POCKET);
    const { entries } = useOpsStore.getState();
    expect(activeOrientChain(entries, 1)).toEqual([]);
  });
});

// ── advancePromptOrClear ──────────────────────────────────────────────────

describe("advancePromptOrClear", () => {
  it("advances to the next slot when more remain", () => {
    const META = {
      ...POCKET,
      requires: [
        { type: "face", label: "Pocket floor" },
        { type: "edge", label: "Profile edge" },
      ],
    };
    useOpsStore.getState().applyTemplate(META);
    expect(useOpsStore.getState().promptSlot.slotIdx).toBe(0);
    useOpsStore.getState().advancePromptOrClear(META);
    expect(useOpsStore.getState().promptSlot.slotIdx).toBe(1);
  });

  it("clears the prompt after the last slot", () => {
    useOpsStore.getState().applyTemplate(POCKET);
    useOpsStore.getState().advancePromptOrClear(POCKET);
    expect(useOpsStore.getState().promptSlot).toBeNull();
  });
});
