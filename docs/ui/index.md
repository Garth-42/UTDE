# UI Reference

UTDE ships with a browser-based React interface that lets you import STEP geometry, select faces and edges interactively, configure toolpath strategies, and inspect generated G-code — without writing any Python.

## Layout

The UI is divided into three areas:

| Area | Description |
|---|---|
| **Header** | Mode switcher, selection-mode controls, open file name |
| **Sidebar** | Context-sensitive panels (changes with active mode) |
| **Viewport** | Interactive 3-D canvas |

A collapsible **Code Panel** slides up from the bottom when Python code has been generated.

## Modes

The header exposes two top-level modes, switched with the **STEP IMPORT** and **TOOLPATHS** tabs:

- **STEP IMPORT** — load a STEP file, browse geometry, configure a strategy, and generate a toolpath.
- **TOOLPATHS** — visualise and animate generated toolpaths, inspect point counts, download G-code.

## Selection modes

In **STEP IMPORT** mode the header also shows a `SELECT` toggle with three options:

| Mode | What you can pick in the viewport |
|---|---|
| `FACES` | Only mesh faces |
| `EDGES` | Only wire edges |
| `BOTH` | Faces and edges together |

Press **Escape** at any time to deselect everything.

## Pages in this section

- [STEP Import](step-import.md) — loading files and managing sessions
- [Geometry Browser](geometry-browser.md) — the face/edge list and selection tools
- [Strategy Panel](strategy-panel.md) — strategy configuration and orientation rules
- [Toolpath Viewer](toolpath-viewer.md) — 3-D visualisation and animation
- [Code Panel](code-panel.md) — generated Python and G-code output
