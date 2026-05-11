import { create } from "zustand";

/**
 * opsStore — the timeline-driven Setup-tab state.
 *
 * The timeline is an ordered list of `entries`, each one of two kinds:
 *
 *   { kind: "op",     uid, templateId, name, params, geometry, visible, geomSummary? }
 *   { kind: "orient", uid, rules, visible, label? }
 *
 * Per Q3(c-entry), an `orient` entry sets the active orient chain for every
 * op below it until the next orient entry. The chain is *appended* on top
 * of each op's template-default orient (Q3 follow-up = append, not replace).
 *
 * Per Q5(b), an `op` entry's `templateId` resolves to a template that may
 * call multiple strategies internally; the front end does not need to know.
 */

let _uidCounter = 1;
const newUid = (prefix) => `${prefix}_${_uidCounter++}`;

/** Build the seed Import-CAD scene that every fresh timeline starts with. */
function defaultImportEntry() {
  return {
    kind:    "scene",
    uid:     newUid("scene"),
    action:  "import",
    name:    "Import CAD",
    visible: true,
  };
}

/** Produce a default params object from a template's param schema. */
function defaultParams(templateMeta) {
  const out = {};
  for (const p of templateMeta.params || []) {
    out[p.id] = p.default;
  }
  return out;
}

/** Produce an empty geometry slot array sized to the template's `requires`. */
function emptyGeometry(templateMeta) {
  return (templateMeta.requires || []).map(() => []);
}

export const useOpsStore = create((set, get) => ({
  entries: [defaultImportEntry()],
  activeIdx: null,
  rpMode: "library",                // "library" | "params"
  promptSlot: null,                 // { entryIdx, slotIdx } | null

  // ── Template-driven mutations ──────────────────────────────────────────

  applyTemplate: (templateMeta) => {
    const entry = {
      kind: "op",
      uid:        newUid("op"),
      templateId: templateMeta.id,
      name:       templateMeta.label || templateMeta.id,
      params:     defaultParams(templateMeta),
      geometry:   emptyGeometry(templateMeta),
      visible:    true,
      geomSummary: undefined,
    };
    set((s) => {
      const entries = [...s.entries, entry];
      const newIdx  = entries.length - 1;
      const needsGeometry = (templateMeta.requires || []).length > 0;
      return {
        entries,
        activeIdx: newIdx,
        rpMode:    "params",
        promptSlot: needsGeometry
          ? { entryIdx: newIdx, slotIdx: 0 }
          : null,
      };
    });
  },

  applyScene: (action) => {
    const labels = { import: "Import CAD", clear: "Clear part" };
    const entry = {
      kind:    "scene",
      uid:     newUid("scene"),
      action,
      name:    labels[action] || action,
      visible: true,
    };
    set((s) => {
      const entries = [...s.entries, entry];
      return {
        entries,
        activeIdx: entries.length - 1,
        rpMode:    "params",
        promptSlot: null,
      };
    });
  },

  applyOrient: () => {
    const entry = {
      kind:    "orient",
      uid:     newUid("orient"),
      rules:   [],
      visible: true,
    };
    set((s) => {
      const entries = [...s.entries, entry];
      return {
        entries,
        activeIdx: entries.length - 1,
        rpMode:    "params",
        promptSlot: null,
      };
    });
  },

  // ── Generic entry ops ──────────────────────────────────────────────────

  reorder: (from, to) =>
    set((s) => {
      if (from === to || from < 0 || to < 0) return {};
      const entries = [...s.entries];
      const [moved] = entries.splice(from, 1);
      entries.splice(to, 0, moved);
      let activeIdx = s.activeIdx;
      if (activeIdx === from) activeIdx = to;
      else if (from < activeIdx && to >= activeIdx) activeIdx -= 1;
      else if (from > activeIdx && to <= activeIdx) activeIdx += 1;
      return { entries, activeIdx };
    }),

  remove: (idx) =>
    set((s) => {
      const entries = s.entries.filter((_, i) => i !== idx);
      let activeIdx = s.activeIdx;
      if (activeIdx === idx) activeIdx = null;
      else if (activeIdx != null && activeIdx > idx) activeIdx -= 1;
      return { entries, activeIdx, promptSlot: null };
    }),

  toggleVis: (idx) =>
    set((s) => ({
      entries: s.entries.map((e, i) =>
        i === idx ? { ...e, visible: !e.visible } : e
      ),
    })),

  pickActive: (idx) =>
    set((s) => {
      if (idx == null || idx < 0 || idx >= s.entries.length) {
        return { activeIdx: null, rpMode: "library", promptSlot: null };
      }
      return {
        activeIdx: idx,
        rpMode:    "params",
        promptSlot: null,
      };
    }),

  // ── Op-specific mutations ──────────────────────────────────────────────

  updateParam: (idx, paramId, value) =>
    set((s) => ({
      entries: s.entries.map((e, i) => {
        if (i !== idx || e.kind !== "op") return e;
        return { ...e, params: { ...e.params, [paramId]: value } };
      }),
    })),

  setGeometryForSlot: (idx, slotIdx, picks) =>
    set((s) => ({
      entries: s.entries.map((e, i) => {
        if (i !== idx || e.kind !== "op") return e;
        const geometry = e.geometry.map((g, j) =>
          j === slotIdx ? [...picks] : g
        );
        return { ...e, geometry };
      }),
    })),

  setGeomSummary: (idx, summary) =>
    set((s) => ({
      entries: s.entries.map((e, i) =>
        i === idx && e.kind === "op" ? { ...e, geomSummary: summary } : e
      ),
    })),

  // ── Orient-specific mutations ──────────────────────────────────────────

  addOrientRule: (idx, rule) =>
    set((s) => ({
      entries: s.entries.map((e, i) => {
        if (i !== idx || e.kind !== "orient") return e;
        return { ...e, rules: [...e.rules, rule] };
      }),
    })),

  removeOrientRule: (idx, ruleIdx) =>
    set((s) => ({
      entries: s.entries.map((e, i) => {
        if (i !== idx || e.kind !== "orient") return e;
        return { ...e, rules: e.rules.filter((_, j) => j !== ruleIdx) };
      }),
    })),

  updateOrientRule: (idx, ruleIdx, patch) =>
    set((s) => ({
      entries: s.entries.map((e, i) => {
        if (i !== idx || e.kind !== "orient") return e;
        const rules = [...e.rules];
        rules[ruleIdx] = { ...rules[ruleIdx], ...patch };
        return { ...e, rules };
      }),
    })),

  // ── Prompt / right-panel mode ──────────────────────────────────────────

  setRpMode: (rpMode) => set({ rpMode }),
  setPromptSlot: (promptSlot) => set({ promptSlot }),

  cancelPrompt: () => set({ promptSlot: null }),

  advancePromptOrClear: (templateMeta) =>
    set((s) => {
      if (!s.promptSlot) return {};
      const next = s.promptSlot.slotIdx + 1;
      if (next < (templateMeta.requires || []).length) {
        return {
          promptSlot: { entryIdx: s.promptSlot.entryIdx, slotIdx: next },
        };
      }
      return { promptSlot: null };
    }),

  // ── Bulk reset (tests / "new file") ────────────────────────────────────

  reset: () => set({
    entries:   [defaultImportEntry()],
    activeIdx: null,
    rpMode:    "library",
    promptSlot: null,
  }),
}));

/** Compute the active orient chain for the entry at index `idx`.
 *  Walks the timeline from the start; whenever an orient entry is encountered
 *  its rules become the active chain. Returns the chain in effect at `idx`.
 *  Used by /compile-timeline when assembling the script.
 */
export function activeOrientChain(entries, idx) {
  let chain = [];
  for (let i = 0; i < idx; i++) {
    const e = entries[i];
    if (e.kind === "orient" && e.visible !== false) {
      chain = [...e.rules];
    }
  }
  return chain;
}
