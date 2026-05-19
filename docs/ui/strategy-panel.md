# Operations & Parameters

The right panel in the Setup tab is the primary interface for configuring what the machine does. It routes between the **Library Panel** (template browser) and the **Parameter Editor** (op / orient / scene configuration).

---

## Library Panel

Opens when no timeline entry is selected, or when you click **Add operation**.

Templates are fetched from the server's `/templates` endpoint and grouped by kind:

| Kind | Colour | Description |
|---|---|---|
| `add` | Green | Additive operations (deposition, printing, coating) |
| `sub` | Orange | Subtractive operations (milling, cutting) |
| `hyb` | Gradient | Hybrid operations |
| other | Neutral | Scene actions, utilities |

Use the search field (`⌘K`) to filter by name or tag. Click a template card to apply it — a new `op` entry is added to the timeline and the panel switches to `ParamEditorOp`.

---

## ParamEditorOp — Operation Editor

Shows when an `op` entry is selected in the timeline.

### Geometry slots

Each op template declares which geometry it requires (faces, edges, or both). Slots appear at the top of the editor showing whether they are filled:

- Click a slot chip to re-enter pick mode for that slot. The viewport selection filter switches automatically to the required type.
- Filled slots show a face/edge count chip.

### Parameters

Dynamic fields are rendered from the template's `params` schema. Three field types are supported:

| Type | Renders as |
|---|---|
| `number` | Numeric input with unit label |
| `select` | Dropdown |
| `segment` | Segmented button group |

### Preview

Click **▶ Preview** to call `previewActiveOp()` — this compiles the active op plus any visible orient rows above it in isolation, stores the result in `toolpathStore`, and displays it in the viewport. On error it opens the Script overlay with the equivalent Python instead.

### Footer stats

Estimated cycle time, add/remove volume, and geometry pick count for the active op.

---

## ParamEditorOrient — Orientation Editor

Shows when an `orient` entry is selected. Orientation rules apply to all `op` entries below this row in the timeline until the next `orient` row.

### Rule chain

Add rules with the **+ Add rule** button. Rules execute in order from top to bottom. Reorder with drag handles; remove with the × button.

| Rule | Parameters | Description |
|---|---|---|
| `fixed` | i, j, k | Sets a constant tool-axis vector |
| `lead` | Angle ° | Tilts the tool forward in the feed direction |
| `lag` | Angle ° | Tilts the tool backward in the feed direction |
| `side_tilt` | Angle ° | Tilts the tool sideways (perpendicular to feed) |
| `avoid_collision` | Max tilt ° | Dynamically backs off tilt to prevent exceeding the given angle — place last |

A read-only preview below the chain shows the equivalent `.orient(...)` Python call that will be emitted by `timelineToScript.js`.

---

## ParamEditorScene — Scene Editor

Shows when a `scene` entry is selected.

- **Import CAD**: shows the currently loaded file and a file picker (native dialog in Tauri; HTML5 file input in browser). Loads a STEP file and tessellates it via `/parse-step`.
- **Clear part**: confirmation step that removes the current geometry from the viewport and resets selection state.
