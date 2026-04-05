# Geometry Browser

After a STEP file is loaded the sidebar shows the **Geometry Browser**, which lists every face and edge extracted from the model.

## Select by type

Quick-filter buttons appear at the top of the browser, one per unique geometry type found in the model.

| Entity | Available types |
|---|---|
| Faces | `plane`, `cylinder`, `sphere`, `cone`, `torus`, `other` |
| Edges | `line`, `circle`, `ellipse`, `bspline`, `other` |

Clicking a type button selects all faces (or edges) of that type in one action.

## Face and edge lists

Each row shows:

- A colour dot indicating the geometry type
- The entity label (`Face 0`, `Edge 3`, …)
- The type name below the label

Click a row to toggle selection. Hold **Shift** or **Ctrl / Cmd** while clicking to extend the selection without deselecting other items.

Hovering a row highlights the corresponding mesh element in the 3-D viewport.

## Selection count

The section headers show how many items are selected (e.g. `FACES (12)` with `4 sel` in orange). The total selection count is also displayed in the Selection Info panel below the list.

## Bulk actions

Two buttons at the bottom of the list let you select or deselect everything at once:

| Button | Action |
|---|---|
| **All** | Select all faces and edges |
| **None** | Deselect everything (same as pressing Escape) |

## Selection Info panel

When at least one item is selected, the **Selection Info** panel displays the geometric parameters of the most-recently selected item:

| Face type | Parameters shown |
|---|---|
| `plane` | Origin, Normal |
| `cylinder` | Center, Axis, Radius, Height |
| `sphere` | Center, Radius |
| `cone` | Apex, Axis, Half angle |

| Edge type | Parameters shown |
|---|---|
| `line` | Start, End, Length |
| `circle` / `arc` | Center, Axis, Radius |
