import { useUiStore } from "../store/uiStore";
import { useStepStore } from "../store/stepStore";

const STYLES = {
  bar: {
    height: 26,
    display: "flex",
    alignItems: "center",
    gap: 10,
    padding: "0 12px",
    background: "var(--panel)",
    borderTop: "1px solid var(--border)",
    fontSize: 11,
    color: "var(--muted)",
    flex: "0 0 auto",
  },
  group: { display: "flex", alignItems: "center", gap: 6 },
  sep: {
    width: 1,
    height: 12,
    background: "var(--border)",
  },
  dot: {
    width: 7,
    height: 7,
    borderRadius: "50%",
    background: "var(--add)",
  },
  kbd: {
    padding: "1px 5px",
    border: "1px solid var(--border)",
    borderRadius: 4,
    fontSize: 10,
    color: "var(--ink-2)",
    background: "var(--panel-2)",
  },
};

export default function StatusBar() {
  const filter   = useUiStore((s) => s.filter);
  const fileName = useStepStore((s) => s.fileName);
  const fCount   = useStepStore((s) => s.selectedFaceIds.size);
  const eCount   = useStepStore((s) => s.selectedEdgeIds.size);
  const vCount   = useStepStore((s) => s.selectedVertexIds.size);

  return (
    <div style={STYLES.bar}>
      <div style={STYLES.group}>
        <span style={STYLES.dot} />
        <span>{fileName ? `Linked to ${fileName}` : "No file linked"}</span>
      </div>
      <div style={STYLES.sep} />
      <div style={STYLES.group}>
        <span>Selection:</span>
        <strong className="mono" style={{ color: "var(--ink-2)" }}>
          {fCount}F / {eCount}E / {vCount}V
        </strong>
      </div>
      <div style={STYLES.sep} />
      <div style={STYLES.group}>
        <span>Filter:</span>
        <strong style={{ color: "var(--ink-2)" }}>{filter}</strong>
        <span className="mono" style={STYLES.kbd}>1·2·3</span>
      </div>
      <div style={{ flex: 1 }} />
      <div style={STYLES.group}>
        <span>Units</span>
        <strong style={{ color: "var(--ink-2)" }}>mm</strong>
      </div>
      <div style={STYLES.sep} />
      <div style={STYLES.group}>
        <span>Auto-save</span>
        <strong style={{ color: "var(--ink-2)" }}>—</strong>
      </div>
      <div style={STYLES.sep} />
      <div className="mono" style={STYLES.group}>v0.1.0 · forgepath-shell</div>
    </div>
  );
}
