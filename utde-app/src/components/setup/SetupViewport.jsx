/**
 * SetupViewport — wraps the 3D StepViewport with the Forgepath overlays.
 *
 * The 3D rendering itself is unchanged (face/edge meshes, raycaster, gizmo)
 * via the existing StepViewport component. This wrapper layers on:
 *
 *   - PromptBanner (top centre, when opsStore.promptSlot is active)
 *   - Selection-filter chip (top-left): face / edge / vertex with counts
 *   - Status pills (bottom-left/right): units · zoom · machine
 *
 * Pick flow:
 *   1. opsStore.applyTemplate sets promptSlot for the first required slot
 *      and switches uiStore.filter to that slot's type.
 *   2. User clicks geometry; StepViewport toggles stepStore selection sets.
 *   3. Confirm reads the matching selection set into the active op's
 *      `geometry[slotIdx]` via opsStore.setGeometryForSlot, then
 *      advancePromptOrClear walks to the next slot or clears the prompt.
 *   4. Cancel clears promptSlot and the current selection.
 *
 * The wrapper also keeps the legacy uiStore.selectionMode in sync with the
 * new uiStore.filter so that the inner StepViewport keeps its existing
 * "show faces / show edges" rendering logic.
 */

import { useEffect, useMemo } from "react";
import I from "../icons";
import StepViewport from "../viewport/StepViewport";
import { useOpsStore } from "../../store/opsStore";
import { useUiStore } from "../../store/uiStore";
import { useStepStore } from "../../store/stepStore";
import { getTemplate } from "../../lib/templateLoader";

const FILTER_TO_LEGACY = { face: "faces", edge: "edges", vertex: "both" };

const FILTER_OPTIONS = [
  { key: "face",   label: "Face",   shortcut: "1", Icon: I.face   },
  { key: "edge",   label: "Edge",   shortcut: "2", Icon: I.edge   },
  { key: "vertex", label: "Vertex", shortcut: "3", Icon: I.vertex },
];

const STYLES = {
  shell: {
    position: "relative",
    height: "100%",
    background: "var(--panel)",
    border: "1px solid var(--border)",
    borderRadius: "var(--r-lg)",
    boxShadow: "var(--shadow-sm)",
    overflow: "hidden",
    minHeight: 0,
  },

  // backdrop-blurred floating overlay panels
  overlay: {
    position: "absolute",
    background: "rgba(255, 255, 255, 0.86)",
    border: "1px solid var(--border)",
    borderRadius: 9,
    backdropFilter: "blur(6px)",
    WebkitBackdropFilter: "blur(6px)",
    boxShadow: "var(--shadow-sm)",
  },

  filterChip: { top: 14, left: 14, padding: 4, display: "flex", gap: 2 },
  filterBtn: (active) => ({
    display: "flex", alignItems: "center", gap: 6,
    padding: "5px 10px",
    border: 0, borderRadius: 6,
    background: active ? "var(--ink)" : "transparent",
    color: active ? "var(--panel)" : "var(--ink-2)",
    fontSize: 12, fontWeight: 500,
    cursor: "pointer",
  }),
  filterCount: (active) => ({
    fontFamily: "var(--font-mono)",
    fontSize: 10,
    padding: "1px 5px",
    borderRadius: 4,
    background: active ? "rgba(255,255,255,0.18)" : "var(--panel-2)",
    color: active ? "var(--panel)" : "var(--ink-2)",
  }),
  shortcutHint: {
    fontFamily: "var(--font-mono)",
    fontSize: 10, color: "var(--muted)",
    marginLeft: 4,
  },

  bottomLeft: {
    bottom: 14, left: 14, padding: "4px 10px",
    fontSize: 11, color: "var(--ink-2)",
    display: "flex", alignItems: "center", gap: 8,
  },
  bottomRight: {
    bottom: 14, right: 14, padding: "4px 10px",
    fontSize: 11, color: "var(--ink-2)",
    display: "flex", alignItems: "center", gap: 6,
  },
  greenDot: {
    width: 7, height: 7, borderRadius: "50%",
    background: "var(--add)",
  },

  banner: {
    position: "absolute",
    top: 14, left: "50%", transform: "translateX(-50%)",
    background: "var(--ink)",
    color: "var(--panel)",
    borderRadius: 999,
    padding: "6px 8px 6px 14px",
    display: "flex", alignItems: "center", gap: 10,
    boxShadow: "var(--shadow-md)",
    fontSize: 12,
    zIndex: 5,
  },
  bannerLabel: { color: "var(--panel)" },
  bannerStrong: { fontWeight: 600 },
  bannerChip: {
    fontFamily: "var(--font-mono)",
    fontSize: 10,
    padding: "2px 8px",
    borderRadius: 999,
    background: "rgba(255,255,255,0.14)",
    color: "var(--panel)",
    textTransform: "uppercase",
    letterSpacing: "0.04em",
  },
  bannerCount: {
    fontFamily: "var(--font-mono)",
    fontSize: 11,
    color: "rgba(255,255,255,0.78)",
  },
  bannerCancel: {
    border: "1px solid rgba(255,255,255,0.25)",
    background: "transparent",
    color: "var(--panel)",
    borderRadius: 999,
    padding: "4px 12px",
    fontSize: 11,
    cursor: "pointer",
  },
  bannerConfirm: (enabled) => ({
    border: 0,
    background: enabled ? "var(--panel)" : "rgba(255,255,255,0.14)",
    color: enabled ? "var(--ink)" : "rgba(255,255,255,0.55)",
    borderRadius: 999,
    padding: "4px 14px",
    fontSize: 11, fontWeight: 600,
    cursor: enabled ? "pointer" : "not-allowed",
  }),
};

function selectionSetForFilter(stepState, filter) {
  if (filter === "face")   return stepState.selectedFaceIds;
  if (filter === "edge")   return stepState.selectedEdgeIds;
  if (filter === "vertex") return stepState.selectedVertexIds;
  return new Set();
}

export default function SetupViewport() {
  const filter           = useUiStore((s) => s.filter);
  const setFilter        = useUiStore((s) => s.setFilter);
  const setSelectionMode = useUiStore((s) => s.setSelectionMode);

  const promptSlot          = useOpsStore((s) => s.promptSlot);
  const entries             = useOpsStore((s) => s.entries);
  const setGeometryForSlot  = useOpsStore((s) => s.setGeometryForSlot);
  const setGeomSummary      = useOpsStore((s) => s.setGeomSummary);
  const advancePromptOrClear = useOpsStore((s) => s.advancePromptOrClear);
  const cancelPrompt        = useOpsStore((s) => s.cancelPrompt);

  const selectedFaceIds   = useStepStore((s) => s.selectedFaceIds);
  const selectedEdgeIds   = useStepStore((s) => s.selectedEdgeIds);
  const selectedVertexIds = useStepStore((s) => s.selectedVertexIds);
  const deselectAll       = useStepStore((s) => s.deselectAll);

  // Sync the new filter into the legacy selectionMode the inner StepViewport reads.
  useEffect(() => {
    setSelectionMode(FILTER_TO_LEGACY[filter] || "both");
  }, [filter, setSelectionMode]);

  const counts = useMemo(() => ({
    face:   selectedFaceIds.size,
    edge:   selectedEdgeIds.size,
    vertex: selectedVertexIds.size,
  }), [selectedFaceIds, selectedEdgeIds, selectedVertexIds]);

  const promptInfo = useMemo(() => {
    if (!promptSlot) return null;
    const entry = entries[promptSlot.entryIdx];
    if (!entry || entry.kind !== "op") return null;
    const meta = getTemplate(entry.templateId);
    if (!meta) return null;
    const req = (meta.requires || [])[promptSlot.slotIdx];
    if (!req) return null;
    return { entry, meta, req, opName: entry.name || meta.label || entry.templateId };
  }, [promptSlot, entries]);

  const canConfirm = promptInfo
    ? counts[promptInfo.req.type] > 0
    : false;

  function confirmPrompt() {
    if (!promptInfo || !canConfirm) return;
    const { req } = promptInfo;
    const stepState = useStepStore.getState();
    const picks = [...selectionSetForFilter(stepState, req.type)];
    setGeometryForSlot(promptSlot.entryIdx, promptSlot.slotIdx, picks);
    const summary = picks.length === 1
      ? `${req.type} ${picks[0]}`
      : `${req.type} × ${picks.length}`;
    setGeomSummary(promptSlot.entryIdx, summary);
    deselectAll();
    advancePromptOrClear(promptInfo.meta);
    const next = (promptInfo.meta.requires || [])[promptSlot.slotIdx + 1];
    if (next?.type) setFilter(next.type);
  }

  function cancel() {
    cancelPrompt();
    deselectAll();
  }

  return (
    <div style={STYLES.shell}>
      <StepViewport />

      {/* Selection-filter chip */}
      <div style={{ ...STYLES.overlay, ...STYLES.filterChip }}>
        {FILTER_OPTIONS.map(({ key, label, shortcut, Icon }) => {
          const active = filter === key;
          const count = counts[key];
          return (
            <button
              key={key}
              type="button"
              onClick={() => setFilter(key)}
              style={STYLES.filterBtn(active)}
              title={`${label} (${shortcut})`}
            >
              <Icon size={14} />
              <span>{label}</span>
              {count > 0 && (
                <span style={STYLES.filterCount(active)}>{count}</span>
              )}
              {!active && count === 0 && (
                <span style={STYLES.shortcutHint}>{shortcut}</span>
              )}
            </button>
          );
        })}
      </div>

      {/* Bottom-left: units + zoom */}
      <div style={{ ...STYLES.overlay, ...STYLES.bottomLeft }}>
        <span style={{ color: "var(--muted)" }}>Units</span>
        <strong className="mono">mm</strong>
        <span style={{ color: "var(--muted)" }}>·</span>
        <strong className="mono">1.00×</strong>
      </div>

      {/* Bottom-right: machine status */}
      <div style={{ ...STYLES.overlay, ...STYLES.bottomRight }}>
        <span style={STYLES.greenDot} />
        <strong>HMC-470 · Hybrid</strong>
      </div>

      {/* Prompt banner — only when a slot needs picks */}
      {promptInfo && (
        <div style={STYLES.banner} role="dialog" aria-label="Geometry prompt">
          <span style={STYLES.bannerLabel}>
            <span>Select </span>
            <span style={STYLES.bannerStrong}>{promptInfo.req.label}</span>
            <span style={{ opacity: 0.6 }}>{` for ${promptInfo.opName}`}</span>
          </span>
          <span className="mono" style={STYLES.bannerChip}>
            {promptInfo.req.type}{promptInfo.req.count === 0 ? " · multi-pick" : ""}
          </span>
          <span style={STYLES.bannerCount}>
            {counts[promptInfo.req.type]}
            {" "}
            {counts[promptInfo.req.type] === 1 ? "pick" : "picks"}
          </span>
          <button
            type="button"
            style={STYLES.bannerCancel}
            onClick={cancel}
          >
            Cancel
          </button>
          <button
            type="button"
            disabled={!canConfirm}
            style={STYLES.bannerConfirm(canConfirm)}
            onClick={confirmPrompt}
          >
            Confirm
          </button>
        </div>
      )}
    </div>
  );
}
