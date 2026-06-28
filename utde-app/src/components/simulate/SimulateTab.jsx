/**
 * SimulateTab — full-width playback view.
 *
 * Reuses the Setup-tab StepViewport (so the part still renders) and forces
 * `showToolpaths=true` while this tab is active so ToolpathLines layers on.
 * Adds:
 *   - HUD card (top-left): "Now running" + active op + Op N/M, Tool, Feed, RPM
 *   - Sim controls bar (bottom): rewind / play-pause / step-forward + scrub
 *     track gradient by op kind + tick marks at op boundaries + speed segment
 *     + MM:SS time display
 *   - Status pill (bottom-right): playing / paused indicator
 */

import { useEffect, useRef } from "react";
import I from "../icons";
import StepViewport from "../viewport/StepViewport";
import { useToolpathStore } from "../../store/toolpathStore";
import { useUiStore } from "../../store/uiStore";
import { useTemplates } from "../../lib/templateLoader";
import {
  cursorPosition,
  scrubSegments,
  formatTime,
  totalDurationSeconds,
} from "../../lib/simulation";
import { useCursorLineSync } from "../../lib/useCursorLineSync";

const STYLES = {
  shell: {
    flex: 1,
    padding: 10,
    minHeight: 0,
    display: "flex",
    flexDirection: "column",
    gap: 10,
  },
  viewportCard: {
    position: "relative",
    flex: 1,
    background: "var(--panel)",
    border: "1px solid var(--border)",
    borderRadius: "var(--r-lg)",
    boxShadow: "var(--shadow-sm)",
    overflow: "hidden",
    minHeight: 0,
  },

  hud: {
    position: "absolute",
    top: 14, left: 14,
    background: "rgba(255,255,255,0.94)",
    border: "1px solid var(--border)",
    borderRadius: "var(--r-md)",
    padding: 12,
    minWidth: 240,
    boxShadow: "var(--shadow-sm)",
    backdropFilter: "blur(6px)",
    WebkitBackdropFilter: "blur(6px)",
    fontSize: 12,
    color: "var(--ink-2)",
    zIndex: 5,
  },
  hudCaption: {
    fontSize: 10, color: "var(--muted)",
    textTransform: "uppercase", letterSpacing: "0.04em",
    marginBottom: 6,
  },
  hudActive: {
    display: "flex", alignItems: "center", gap: 8, marginBottom: 8,
  },
  hudIcon: (accent, soft) => ({
    width: 28, height: 28,
    display: "flex", alignItems: "center", justifyContent: "center",
    borderRadius: 8,
    background: soft, color: accent,
    flexShrink: 0,
  }),
  hudOpName: { fontSize: 13, fontWeight: 500, color: "var(--ink)" },
  hudStats: {
    display: "grid",
    gridTemplateColumns: "repeat(2, 1fr)",
    gap: "4px 12px",
    fontSize: 11,
    color: "var(--ink-2)",
  },
  hudStatLabel: { color: "var(--muted)" },
  hudStatValue: {
    fontFamily: "var(--font-mono)",
    color: "var(--ink)",
    textAlign: "right",
  },

  status: {
    position: "absolute",
    bottom: 14, right: 14,
    background: "rgba(255,255,255,0.94)",
    border: "1px solid var(--border)",
    borderRadius: 999,
    padding: "4px 12px",
    fontSize: 11,
    display: "flex", alignItems: "center", gap: 6,
    color: "var(--ink-2)",
    backdropFilter: "blur(6px)",
    WebkitBackdropFilter: "blur(6px)",
  },
  statusDot: (playing) => ({
    width: 7, height: 7, borderRadius: "50%",
    background: playing ? "var(--add)" : "var(--muted-2)",
  }),

  controls: {
    background: "var(--panel)",
    border: "1px solid var(--border)",
    borderRadius: "var(--r-lg)",
    boxShadow: "var(--shadow-sm)",
    padding: 12,
    display: "flex",
    flexDirection: "column",
    gap: 10,
  },
  buttons: { display: "flex", alignItems: "center", gap: 8 },
  btn: {
    width: 32, height: 32,
    display: "flex", alignItems: "center", justifyContent: "center",
    border: "1px solid var(--border)",
    background: "var(--panel)",
    color: "var(--ink-2)",
    borderRadius: "var(--r-sm)",
    cursor: "pointer",
  },
  btnPrimary: {
    background: "var(--ink)",
    color: "var(--panel)",
    borderColor: "var(--ink)",
  },
  speed: {
    display: "flex", padding: 2,
    background: "var(--panel-2)",
    border: "1px solid var(--border)",
    borderRadius: "var(--r-sm)",
    gap: 2,
  },
  speedBtn: (active) => ({
    padding: "4px 8px",
    border: 0, borderRadius: 4,
    background: active ? "var(--panel)" : "transparent",
    color: active ? "var(--ink)" : "var(--ink-2)",
    fontSize: 11,
    fontFamily: "var(--font-mono)",
    cursor: "pointer",
    boxShadow: active ? "var(--shadow-sm)" : "none",
  }),

  time: {
    fontFamily: "var(--font-mono)",
    fontSize: 12,
    color: "var(--ink)",
    marginLeft: "auto",
  },
  timeMuted: { color: "var(--muted)" },

  trackWrap: {
    position: "relative",
    height: 24,
    display: "flex",
    alignItems: "center",
    cursor: "pointer",
    touchAction: "none",
  },
  trackBg: {
    position: "absolute",
    left: 0, right: 0,
    height: 6,
    borderRadius: 999,
    background: "var(--panel-2)",
    border: "1px solid var(--border)",
    overflow: "hidden",
    display: "flex",
  },
  trackSeg: (color, widthPct) => ({
    height: "100%",
    width: `${widthPct}%`,
    background: color,
    opacity: 0.85,
  }),
  trackTick: (leftPct) => ({
    position: "absolute",
    left: `calc(${leftPct}% - 0.5px)`,
    top: 4, bottom: 4,
    width: 1,
    background: "var(--ink)",
    opacity: 0.35,
  }),
  trackHandle: (leftPct) => ({
    position: "absolute",
    left: `calc(${leftPct}% - 7px)`,
    top: 5,
    width: 14, height: 14,
    background: "var(--panel)",
    border: "2px solid var(--ink)",
    borderRadius: "50%",
    boxShadow: "var(--shadow-sm)",
    pointerEvents: "none",
  }),

  empty: {
    flex: 1,
    display: "flex", flexDirection: "column",
    alignItems: "center", justifyContent: "center",
    color: "var(--muted)", gap: 8, fontSize: 12,
  },
};

const KIND_ICON_BG = {
  add: { accent: "var(--add)", soft: "var(--add-soft)" },
  sub: { accent: "var(--sub)", soft: "var(--sub-soft)" },
  hyb: { accent: "var(--ink)", soft: "var(--panel-2)" },
};

function iconBg(kind) {
  return KIND_ICON_BG[kind] || { accent: "var(--ink-2)", soft: "var(--panel-2)" };
}

export default function SimulateTab() {
  const toolpaths    = useToolpathStore((s) => s.toolpaths);
  const animProgress = useToolpathStore((s) => s.animProgress);
  const isAnimating  = useToolpathStore((s) => s.isAnimating);
  const simSpeed     = useToolpathStore((s) => s.simSpeed);
  const opRanges     = useToolpathStore((s) => s.opRanges);
  const setProgress      = useToolpathStore((s) => s.setAnimProgress);
  const startAnimation   = useToolpathStore((s) => s.startAnimation);
  const stopAnimation    = useToolpathStore((s) => s.stopAnimation);
  const resetAnimation   = useToolpathStore((s) => s.resetAnimation);
  const stepForward      = useToolpathStore((s) => s.stepForward);
  const setSimSpeed      = useToolpathStore((s) => s.setSimSpeed);
  const setShowToolpaths = useUiStore((s) => s.setShowToolpaths);

  const { templates } = useTemplates();

  // Force toolpaths visible in the inner StepViewport while Simulate is active.
  useEffect(() => {
    setShowToolpaths(true);
  }, [setShowToolpaths]);

  const hasToolpaths = toolpaths.length > 0;
  const segments = scrubSegments(toolpaths);
  const totalSec = totalDurationSeconds(opRanges, templates);
  const cursor   = cursorPosition(toolpaths, animProgress);
  const activeTp = cursor.tpIdx >= 0 ? toolpaths[cursor.tpIdx] : null;
  const activePoint = activeTp?.points?.[cursor.pointIdx] || null;

  // Reverse sync: the playback cursor → the current G-code line (shared hook,
  // also used by the Post tab's scrubber).
  const currentLine = useCursorLineSync();

  const trackRef = useRef(null);

  function togglePlay() {
    if (isAnimating) stopAnimation();
    else             startAnimation();
  }

  // Click-and-drag scrubbing, matching the Post tab's native range slider.
  // Mouse-down seeks immediately, then move events scrub continuously until
  // the button is released anywhere on the page.
  function seekFromX(clientX) {
    const el = trackRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    const pct = Math.max(0, Math.min(1, (clientX - rect.left) / rect.width));
    setProgress(pct);
  }

  function onTrackMouseDown(e) {
    e.preventDefault();
    seekFromX(e.clientX);

    const onMove = (ev) => seekFromX(ev.clientX);
    const onUp = () => {
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
    };
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
  }

  return (
    <div style={STYLES.shell}>
      <div style={STYLES.viewportCard}>
        <StepViewport />

        {hasToolpaths && (
          <div style={STYLES.hud}>
            <div style={STYLES.hudCaption}>Now running</div>
            {activeTp ? (
              <>
                <div style={STYLES.hudActive}>
                  <div style={STYLES.hudIcon(
                    iconBg(activeTp.kind).accent,
                    iconBg(activeTp.kind).soft,
                  )}>
                    <I.op />
                  </div>
                  <div>
                    <div style={STYLES.hudOpName}>{activeTp.label}</div>
                    <div style={{ fontSize: 11, color: "var(--muted)" }}>
                      {(activeTp.kind === "add" ? "Additive" :
                        activeTp.kind === "sub" ? "Subtractive" :
                        activeTp.kind === "hyb" ? "Hybrid" : (activeTp.kind || "—"))}
                    </div>
                  </div>
                </div>
                <div style={STYLES.hudStats}>
                  <span style={STYLES.hudStatLabel}>Op</span>
                  <span style={STYLES.hudStatValue}>
                    {String(cursor.tpIdx + 1).padStart(2, "0")}/
                    {String(toolpaths.length).padStart(2, "0")}
                  </span>
                  <span style={STYLES.hudStatLabel}>Tool</span>
                  <span style={STYLES.hudStatValue}>
                    {activePoint?.process_params?.tool || "—"}
                  </span>
                  <span style={STYLES.hudStatLabel}>Feed</span>
                  <span style={STYLES.hudStatValue}>
                    {activePoint?.feed_rate
                      ? `${Math.round(activePoint.feed_rate)} mm/min`
                      : "—"}
                  </span>
                  <span style={STYLES.hudStatLabel}>Spindle</span>
                  <span style={STYLES.hudStatValue}>
                    {activePoint?.process_params?.spindle_rpm
                      ? `${Math.round(activePoint.process_params.spindle_rpm)} rpm`
                      : "—"}
                  </span>
                  <span style={STYLES.hudStatLabel}>G-code</span>
                  <span style={STYLES.hudStatValue}>
                    {currentLine >= 0 ? `line ${currentLine + 1}` : "—"}
                  </span>
                </div>
              </>
            ) : (
              <div style={{ color: "var(--muted)" }}>No active op.</div>
            )}
          </div>
        )}

        {hasToolpaths && (
          <div style={STYLES.status}>
            <span style={STYLES.statusDot(isAnimating)} />
            <span className="mono">{isAnimating ? "simulating" : "paused"}</span>
          </div>
        )}
      </div>

      <div style={STYLES.controls}>
        {!hasToolpaths ? (
          <div style={{ color: "var(--muted)", fontSize: 12, padding: "10px 4px" }}>
            Run the setup to compile a toolpath, then return here to simulate.
          </div>
        ) : (
          <>
            <div style={STYLES.buttons}>
              <button
                style={STYLES.btn}
                onClick={resetAnimation}
                title="Rewind"
              >
                <I.rewind />
              </button>
              <button
                style={{ ...STYLES.btn, ...STYLES.btnPrimary }}
                onClick={togglePlay}
                title={isAnimating ? "Pause" : "Play"}
              >
                {isAnimating ? <I.pause /> : <I.play />}
              </button>
              <button
                style={STYLES.btn}
                onClick={() => stepForward(0.05)}
                title="Step forward"
              >
                <I.step />
              </button>

              <div style={STYLES.speed}>
                {[0.5, 1, 4].map((s) => (
                  <button
                    key={s}
                    type="button"
                    onClick={() => setSimSpeed(s)}
                    style={STYLES.speedBtn(simSpeed === s)}
                  >
                    {s}×
                  </button>
                ))}
              </div>

              <span style={STYLES.time}>
                {formatTime(animProgress, totalSec || 60)}
                <span style={STYLES.timeMuted}>
                  {" / "}
                  {formatTime(1, totalSec || 60)}
                </span>
              </span>
            </div>

            <div
              ref={trackRef}
              style={STYLES.trackWrap}
              onMouseDown={onTrackMouseDown}
              role="slider"
              aria-label="Scrub toolpath"
              aria-valuemin={0}
              aria-valuemax={1}
              aria-valuenow={animProgress}
            >
              <div style={STYLES.trackBg}>
                {segments.map((s) => (
                  <div key={s.id} style={STYLES.trackSeg(s.color, s.widthPct)} />
                ))}
              </div>
              {segments.map((s) =>
                s.cumulativePct < 99.5 ? (
                  <div key={`tick_${s.id}`} style={STYLES.trackTick(s.cumulativePct)} />
                ) : null,
              )}
              <div style={STYLES.trackHandle(animProgress * 100)} />
            </div>
          </>
        )}
      </div>
    </div>
  );
}
