/**
 * RightPanel — orchestrates which editor occupies the right column.
 *
 * Routing:
 *   rpMode === "library"  → LibraryPanel
 *   rpMode === "params"
 *     active.kind === "op"     → ParamEditorOp
 *     active.kind === "orient" → ParamEditorOrient (placeholder until next slice)
 *   no active entry → LibraryPanel
 */

import { useOpsStore } from "../../store/opsStore";
import LibraryPanel from "./LibraryPanel";
import ParamEditorOp from "./ParamEditorOp";
import ParamEditorOrient from "./ParamEditorOrient";
import ParamEditorScene from "./ParamEditorScene";

export default function RightPanel() {
  const rpMode    = useOpsStore((s) => s.rpMode);
  const activeIdx = useOpsStore((s) => s.activeIdx);
  const entries   = useOpsStore((s) => s.entries);

  const active = activeIdx != null ? entries[activeIdx] : null;

  if (rpMode === "library" || !active) return <LibraryPanel />;
  if (active.kind === "op")     return <ParamEditorOp />;
  if (active.kind === "orient") return <ParamEditorOrient />;
  if (active.kind === "scene")  return <ParamEditorScene />;
  return <LibraryPanel />;
}
