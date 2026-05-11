import { useRef, useState } from "react";
import { useUiStore } from "../store/uiStore";
import { useStepStore } from "../store/stepStore";
import { useToolpathStore } from "../store/toolpathStore";
import { useMachineStore } from "../store/machineStore";
import { compileTimeline } from "../lib/timelineCompiler";
import MachinePicker from "./MachinePicker";

const TABS = [
  { key: "setup",    label: "Setup",    num: "01" },
  { key: "simulate", label: "Simulate", num: "02" },
  { key: "post",     label: "Post",     num: "03" },
];

const STYLES = {
  bar: {
    height: 52,
    display: "flex",
    alignItems: "center",
    gap: 14,
    padding: "0 14px",
    background: "var(--panel)",
    borderBottom: "1px solid var(--border)",
    flex: "0 0 auto",
  },
  brand: {
    display: "flex",
    alignItems: "center",
    gap: 8,
    fontSize: 14,
    fontWeight: 600,
    color: "var(--ink)",
  },
  brandMark: {
    width: 22,
    height: 22,
    borderRadius: 6,
    background:
      "linear-gradient(135deg, var(--add) 0 50%, var(--sub) 50% 100%)",
    boxShadow: "inset 0 0 0 2px var(--panel)",
  },
  brandFile: {
    fontSize: 11,
    color: "var(--muted)",
    fontWeight: 400,
    marginLeft: 4,
  },
  tabs: {
    display: "flex",
    gap: 2,
    padding: 2,
    borderRadius: "var(--r-sm)",
    background: "var(--panel-2)",
    border: "1px solid var(--border)",
  },
  tab: (active) => ({
    display: "flex",
    alignItems: "center",
    gap: 6,
    padding: "5px 10px",
    fontSize: 12,
    fontWeight: 500,
    border: 0,
    borderRadius: 4,
    background: active ? "var(--panel)" : "transparent",
    color: active ? "var(--ink)" : "var(--ink-2)",
    boxShadow: active ? "var(--shadow-sm)" : "none",
    cursor: "pointer",
  }),
  tabNum: {
    color: "var(--muted)",
    fontSize: 11,
  },
  spacer: { flex: 1 },
  pill: {
    display: "flex",
    alignItems: "center",
    gap: 6,
    padding: "4px 10px",
    background: "var(--panel-2)",
    border: "1px solid var(--border)",
    borderRadius: 999,
    fontSize: 12,
    color: "var(--ink-2)",
    cursor: "pointer",
  },
  pillDot: {
    width: 7,
    height: 7,
    borderRadius: "50%",
    background: "var(--add)",
  },
  btn: {
    display: "flex",
    alignItems: "center",
    gap: 6,
    padding: "6px 12px",
    border: "1px solid var(--border)",
    background: "var(--panel)",
    color: "var(--ink)",
    borderRadius: "var(--r-sm)",
    fontSize: 12,
    cursor: "pointer",
  },
  btnPrimary: {
    background: "var(--ink)",
    color: "var(--panel)",
    borderColor: "var(--ink)",
  },
};

export default function TopBar() {
  const tab    = useUiStore((s) => s.tab);
  const setTab = useUiStore((s) => s.setTab);
  const scriptOverlayOpen   = useUiStore((s) => s.scriptOverlayOpen);
  const toggleScriptOverlay = useUiStore((s) => s.toggleScriptOverlay);
  const isCompiling  = useToolpathStore((s) => s.isCompiling);
  const compileError = useToolpathStore((s) => s.compileError);
  const fileName     = useStepStore((s) => s.fileName);

  const pillRef = useRef(null);

  const machineAvail   = useMachineStore((s) => s.available);
  const machineCurrent = useMachineStore((s) => s.currentId);
  const [pickerOpen, setPickerOpen]   = useState(false);
  const [pickerRect, setPickerRect]   = useState(null);

  const currentMachine = machineAvail.find((m) => m.id === machineCurrent) || null;
  const machineLabel   = currentMachine?.name
    ?? (machineCurrent || "no machine");

  function togglePicker() {
    setPickerOpen((v) => {
      if (!v && pillRef.current) {
        setPickerRect(pillRef.current.getBoundingClientRect());
      }
      return !v;
    });
  }

  async function runSetup() {
    try {
      await compileTimeline();
      setTab("simulate");
    } catch {
      // Error is already in toolpathStore.compileError; surface in StatusBar later.
    }
  }

  return (
    <div style={STYLES.bar}>
      <div style={STYLES.brand}>
        <div style={STYLES.brandMark} />
        <span>UTDE</span>
        <small style={STYLES.brandFile}>{fileName || "no file"}</small>
      </div>

      <div style={STYLES.tabs} role="tablist">
        {TABS.map((t) => {
          const active = tab === t.key;
          return (
            <button
              key={t.key}
              role="tab"
              aria-selected={active}
              onClick={() => setTab(t.key)}
              style={STYLES.tab(active)}
            >
              <span className="mono" style={STYLES.tabNum}>{t.num}</span>
              <span>{t.label}</span>
            </button>
          );
        })}
      </div>

      <div style={STYLES.spacer} />

      <button
        ref={pillRef}
        style={STYLES.pill}
        onClick={togglePicker}
        title="Choose machine"
        aria-expanded={pickerOpen}
      >
        <span style={STYLES.pillDot} />
        <span style={{ color: "var(--muted)" }}>Machine</span>
        <strong style={{ color: "var(--ink)" }}>{machineLabel}</strong>
        <span style={{ color: "var(--muted)" }}>▾</span>
      </button>
      <MachinePicker
        open={pickerOpen}
        onClose={() => setPickerOpen(false)}
        anchorRect={pickerRect}
      />

      <button
        type="button"
        style={{
          ...STYLES.btn,
          ...(scriptOverlayOpen ? { background: "var(--panel-2)" } : {}),
        }}
        onClick={toggleScriptOverlay}
        title="Show generated Python"
        aria-pressed={scriptOverlayOpen}
      >
        <span className="mono" style={{ fontSize: 12 }}>{"</>"}</span>
      </button>

      <button style={STYLES.btn}>Validate</button>
      <button
        style={{
          ...STYLES.btn,
          ...STYLES.btnPrimary,
          opacity: isCompiling ? 0.7 : 1,
          cursor:  isCompiling ? "wait" : "pointer",
        }}
        onClick={runSetup}
        disabled={isCompiling}
        title={compileError || "Compile the timeline and switch to Simulate"}
      >
        {isCompiling ? "Compiling…" : "Run setup"}
      </button>
    </div>
  );
}
