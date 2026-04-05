# Toolpath Viewer

Switching to **TOOLPATHS** mode opens a dedicated 3-D canvas and replaces the sidebar with the Toolpath Sidebar.

## 3-D viewport

The viewer is built with React Three Fiber and @react-three/drei.

| Control | Action |
|---|---|
| Left drag | Orbit |
| Right drag / middle drag | Pan |
| Scroll | Zoom |

A reference grid (500 × 500 mm, 10 mm cells, 50 mm sections) is displayed at Z = 0. A navigation gizmo in the bottom-left corner shows the current camera orientation and lets you snap to axis-aligned views.

Camera defaults to a 50° FOV perspective positioned above and behind the origin (`[0, -300, 200]`), suitable for parts sitting near Z = 0.

## Toolpath list

Each generated toolpath appears as a named row in the sidebar showing:

- A colour swatch (colours cycle through six presets per session)
- The toolpath label (`strategy — HH:MM:SS`)
- The number of waypoints

Click a row to **toggle visibility** of that toolpath in the viewport. Active toolpaths are highlighted; inactive ones are dimmed. Remove a toolpath with the × button.

Use **clear** to remove all toolpaths at once.

## Display options

**Tool Normals** — when enabled, a small vector is drawn at each toolpath point indicating the computed tool-axis direction. Useful for verifying orientation rules.

## Animation

The **▶ PLAY TOOLPATH** button animates the active toolpaths sequentially. The tool head traverses points at a fixed frame rate. Click **■ STOP** to halt playback.

The progress slider lets you scrub to any position (0 – 100 %). Dragging the slider while animating stops playback automatically.

## Stats

The bottom of the sidebar shows total waypoint count and total number of toolpaths loaded in the current session.

## Actions

| Button | Action |
|---|---|
| **View Python Code** | Opens the Code Panel showing the last generated script |
| **⬇ Download G-code** | Downloads `output.nc` (only shown when G-code is available) |
| **Export Session** | Saves selection and strategy state to a `.json` file for later import |
| **← Back to STEP** | Returns to STEP IMPORT mode without losing toolpaths |
