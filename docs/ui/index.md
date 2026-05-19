# UI Reference

UTDE's browser-based React interface organises work into three tabs: **Setup**, **Simulate**, and **Post**. The tabs are always visible in the top bar and can be switched at any time.

## Layout Overview

The Setup tab uses a fixed three-column layout:

```
┌─────────────────────────────────────────────────────────────┐
│  TopBar: brand · tab switcher · machine picker · tools      │
├──────────────┬──────────────────────────┬───────────────────┤
│              │                          │                   │
│   Timeline   │      3D Viewport         │   Right Panel     │
│   (268 px)   │        (1fr)             │    (320 px)       │
│              │                          │                   │
├──────────────┴──────────────────────────┴───────────────────┤
│  StatusBar                                                  │
└─────────────────────────────────────────────────────────────┘
```

The Simulate and Post tabs replace this layout with their own two-column designs.

---

## Setup Tab

The primary authoring environment. Build a timeline of operations, configure their parameters, and preview toolpaths.

### Timeline (left column)

An ordered list of entries with three types:

| Type | Purpose |
|---|---|
| `op` | A toolpath operation — strategy, geometry slots, and parameters |
| `orient` | An orientation rule chain; applies to all `op` entries below it until the next `orient` row |
| `scene` | A scene action such as Import CAD or Clear part |

- Drag rows to reorder.
- Click a row to open its editor in the right panel.
- Toggle the eye icon to show/hide an op's toolpath preview in the viewport.
- The footer shows total estimated cycle time and add/remove volume.

### 3D Viewport (centre column)

React Three Fiber canvas. Displays imported part geometry, face/edge selections (highlighted), and previewed toolpaths. The geometry selection filter (face / edge / vertex) is set from the top bar and auto-switches when an op template requires a specific geometry type.

### Right Panel (right column)

Routes to one of four panels based on what is selected:

| Panel | When shown |
|---|---|
| `LibraryPanel` | No entry selected, or "Add operation" clicked — browse and apply op/orient/scene templates |
| `ParamEditorOp` | An `op` entry is selected — edit geometry slots and parameters, preview the toolpath |
| `ParamEditorOrient` | An `orient` entry is selected — edit the orientation rule chain |
| `ParamEditorScene` | A `scene` entry is selected — configure import / clear actions |

### Running Setup

Click **Run setup** in the top bar. This calls `timelineCompiler.js` which posts the full timeline to `/compile-timeline`, receives toolpath points and G-code, populates the simulation store, and switches to the Simulate tab.

---

## Simulate Tab

Plays back the compiled toolpath with animation controls.

- **HUD** (top-left): current op name, tool, feed rate, spindle speed, op index.
- **Status pill** (bottom-right): Playing / Paused indicator.
- **Controls bar** (bottom): rewind, play/pause, step-forward; speed selector at 0.5×, 1×, or 4×.
- **Scrub track**: gradient coloured by op kind (add / sub / hybrid); tick marks at op boundaries; click or drag to jump to any position.
- Time display in MM:SS format.

---

## Post Tab

Two-column layout: G-code view on the left, 3D preview on the right.

- **Meta bar**: machine name, line count, estimated cycle time, warning count.
- **Export .nc**: downloads the G-code file. Uses a native save dialog in Tauri desktop mode; triggers a browser download otherwise.
- **G-code view**: syntax-highlighted output, line-linked to the op that produced each move.

---

## Script Overlay

Available from any tab via the `</>` button in the top bar. Shows the read-only Python script generated from the current timeline by `timelineToScript.js`. Use it to verify the Python equivalent of the current timeline — it is not editable; the timeline is the source of truth.

---

## Top Bar Controls

| Control | Description |
|---|---|
| Tab switcher (01 / 02 / 03) | Switch between Setup, Simulate, Post |
| Machine picker | Select the active machine from the server's machine list |
| Theme toggle | Light / dark theme (persisted to localStorage) |
| `</>` button | Open / close the Script overlay |
| Validate | Lint the current timeline (placeholder) |
| **Run setup** | Compile the timeline and switch to Simulate |

---

## Selection Modes (Setup tab)

| Mode | Keyboard shortcut | What highlights |
|---|---|---|
| Face | `1` | Mesh faces only |
| Edge | `2` | Wire edges only |
| Vertex | `3` | Vertices |
| — | `Esc` | Deselect all |

---

## Pages in this section

- [STEP Import](step-import.md) — loading files and managing sessions
- [Geometry Browser](geometry-browser.md) — the face/edge list and selection tools
- [Operations & Parameters](strategy-panel.md) — template library, op editor, and orientation rules
- [Simulate & Post](toolpath-viewer.md) — playback controls, G-code view, and export
- [Script Overlay](code-panel.md) — generated Python output
