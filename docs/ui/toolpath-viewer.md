# Simulate & Post

After clicking **Run setup**, the timeline is compiled and the UI switches to the Simulate tab. The Post tab becomes available once compilation succeeds.

---

## Simulate Tab

A full-width layout with the 3D viewport on the left and playback controls anchored to the bottom.

### 3D Viewport

Built with React Three Fiber. The compiled toolpaths are displayed as coloured lines over the part geometry (colours indicate op kind: green for add, orange for sub, gradient for hybrid).

| Control | Action |
|---|---|
| Left drag | Orbit |
| Right drag / middle drag | Pan |
| Scroll | Zoom |

### HUD (top-left)

Shows live information at the current scrub position:

- Current op name and index
- Tool identifier
- Feed rate (mm/min)
- Spindle speed

### Playback controls (bottom bar)

| Control | Description |
|---|---|
| ⏮ Rewind | Jump to the start |
| ⏯ Play / Pause | Start or pause animation |
| ⏭ Step | Advance one point |
| Speed | Segment button: 0.5×, 1×, 4× |

### Scrub track

A horizontal bar spanning the full width. The gradient matches op kind colours; tick marks appear at op boundaries. Click or drag to jump to any position. Time is displayed in MM:SS format.

---

## Post Tab

Two-column layout: G-code on the left, 3D preview on the right.

### Meta bar

Shows machine name, total G-code line count, estimated cycle time, and warning count (if any warnings were produced during compilation).

### G-code view

Syntax-highlighted G-code. Lines are linked to the op that produced each move — useful for tracing unexpected moves back to their source.

### Export

Click **Export .nc** to download the G-code file. In Tauri desktop mode a native save dialog opens; in browser mode a download is triggered. The default filename is derived from the loaded CAD filename.

### Tool Normals

Toggle via the viewport toolbar to draw a small vector at each toolpath point indicating the computed tool-axis direction. Useful for verifying orientation rules.
