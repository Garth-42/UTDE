# Strategy Panel

The **Strategy Panel** appears below the Geometry Browser once geometry is loaded. It configures which toolpath algorithm to run and how the tool should be oriented.

## Selecting a strategy

Choose one of the three built-in strategies from the dropdown:

| Strategy | Needs | Description |
|---|---|---|
| **Follow Curve** | At least one edge selected | Traces a tool along selected curves |
| **Raster Fill** | At least one face selected | Fills selected faces with parallel passes |
| **Contour Parallel** | Face or edge | Offsets the selection boundary inward in concentric passes |

A warning appears if the required geometry type is not selected.

## Strategy parameters

Parameters update dynamically based on the chosen strategy.

**Feed rate** — always visible, sets the tool speed in mm/min (or the units of your machine config).

| Strategy | Extra parameters |
|---|---|
| Follow Curve | **Spacing** — distance between adjacent curve passes |
| Raster Fill | **Spacing** — distance between raster lines; **Angle °** — raster direction |
| Contour Parallel | **Stepover** — radial distance between contour passes; **Passes** — number of offsets |

**Path type** — a free-text field forwarded to the toolpath engine (e.g. `"zig_zag"`, `"one_way"`).

## Orientation rules

Rules are applied in order to compute the tool-axis direction at each point. Add a rule with the **+ Add rule…** dropdown. Reorder rules with the ↑ / ↓ arrows; remove them with ×.

| Rule | Parameters | Description |
|---|---|---|
| `to_normal` | Surface ID | Aligns tool axis to the surface normal of the specified face |
| `fixed(i,j,k)` | i, j, k | Sets a constant tool-axis vector |
| `lead(°)` | Angle ° | Tilts the tool forward in the feed direction |
| `lag(°)` | Angle ° | Tilts the tool backward in the feed direction |
| `side_tilt(°)` | Angle ° | Tilts the tool sideways (perpendicular to feed) |
| `avoid_collision` | Max tilt ° | Dynamically backs off tilt to avoid exceeding the given angle |

Rules are evaluated in the order listed, so place `avoid_collision` last to act as a safety cap on preceding tilt rules.

## Generating a toolpath

Click **GENERATE TOOLPATH** to send the current selection, strategy, and orientation rules to the server. On success:

- The toolpath is added to the Toolpath list.
- Generated Python code is stored for review in the Code Panel.
- G-code output (if returned by the server) is available for download.
- The view switches automatically to **TOOLPATHS** mode.

If the server does not yet support `/generate-toolpath`, the UI falls back to client-side Python code generation and opens the Code Panel instead.

## Previewing Python code

Click **Preview Python Code** to generate the equivalent UTDE Python script locally and open it in the Code Panel without running it.
