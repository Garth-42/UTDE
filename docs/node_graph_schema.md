# Node Graph JSON Schema

This document defines the JSON serialization format for the UTDE visual node graph.
Every node corresponds to exactly one Python API call. The graph round-trips losslessly
to/from a Python script — this is the contract that keeps the two views in sync.

## UI layout

```
┌─────────────────────────────────────┬──────────────────────┐
│                                     │                      │
│         Node graph canvas           │  Inspector panel     │
│                                     │                      │
│  [Geometry]──[Strategy]──[Orient]   │  (nothing selected)  │
│                        ╲            │  → process-level     │
│                    [Orient]──[Post] │    Variable params   │
│                                     │                      │
│                                     │  (node selected)     │
│                                     │  → that node's       │
│                                     │    param fields      │
│                                     │                      │
└─────────────────────────────────────┴──────────────────────┘
```

**Inspector panel behaviour:**
- **No node selected** → shows all `Variable` instances for the process (the `params` dict
  from the `@process` decorator). These are the knobs a user configures when loading a
  template: `wire_feed`, `layer_height`, `lead_angle`, etc.
- **Node selected** → shows that node's `params` fields as editable inputs. Selecting a
  different node switches the panel instantly. Deselecting returns to process params.

`Variable` instances are **not canvas nodes** — they live only in the inspector panel.
`Position` and `Frame` instances are canvas nodes with output ports (they are reused
across multiple flow nodes and their wiring relationships are worth showing).

## Guiding constraints

**One node = one API call.** If a visual operation can't be expressed as a single
call to the public `toolpath_engine` API, the API is missing something. Fix the API
before adding the visual node.

## Connection model

Inspired by Grasshopper: **any port can connect to any other port — nothing is blocked
at the wire level.** Type information on ports is metadata, not a constraint.

| Situation | Wire appearance | What happens |
|---|---|---|
| Same type on both ends | Solid wire | Runs normally |
| Different types | Dashed wire | Python attempts coercion at execution time |
| Execution failed at this input | Node border turns red + error message on node | Wire stays intact |

**Errors live on nodes, not on wires.** The node that couldn't handle its input
turns red and shows the Python exception. The user can see *what broke*, not just
*where they connected*.

This model requires zero client-side type validation in v1. Port `type` strings drive
only the wire appearance (string equality check: same → solid, different → dashed).
Server-side type enforcement can be added later without changing the schema.

## State architecture

**`graphStore` is the single source of truth.** The sidebar is a derived view of it,
not a parallel state model. This avoids the "two drifting representations" problem.

```
graphStore (Zustand)
    │
    ├── Node graph canvas — renders full graph, spatial layout
    │
    └── Sidebar (StrategyPanel, OrientPanel, etc.)
            reads/writes via selectors:
            - getStrategyNode(graph)   → strategy type + params for sidebar fields
            - getOrientNodes(graph)    → ordered orient rules for the rules list
            - updateNodeParam(graph, nodeId, key, value)
            - addOrientNode(graph, ruleType, params)
            - removeNode(graph, nodeId)
            - moveOrientNode(graph, nodeId, direction)
```

**Migration path:** `strategyStore` stays unchanged until node graph canvas work begins
(TODO #10). At that point it is replaced by `graphStore`. The sidebar selectors above
are the migration shim — they keep all sidebar behaviour identical from the user's
perspective while the underlying state model changes.

**Do not add new state to `strategyStore`** after this decision. New pipeline parameters
should be designed as graph node params from the start, even if the graph canvas doesn't
exist yet. The sidebar can expose them as plain fields; they'll map cleanly to nodes later.

### Sidebar selector contract

These three selectors are the only interface between the sidebar and the graph store.
All sidebar components must go through them — no direct graph JSON manipulation in UI code.

| Selector | Returns | Used by |
|---|---|---|
| `getStrategyNode(graph)` | `{ type, params }` | StrategyPanel dropdowns + fields |
| `getOrientNodes(graph)` | `[{ id, type, params }]` in order | Orient rules list |
| `getPostNode(graph)` | `{ type, params }` | Output/G-code panel |

All mutations go through `updateNodeParam(nodeId, key, value)` and the add/remove/move
node actions — never by directly patching the graph JSON.

## Graph topology

The graph is a **DAG (directed acyclic graph)**. Edges are explicit objects — there is
no implicit ordering from node position. The runner executes nodes in topological order
(Kahn's algorithm): a node runs only after all nodes feeding its inputs have completed.

This supports branching from day one:
- One strategy node feeding two post-processor nodes (Fanuc output + debug output simultaneously)
- Two strategy nodes merging into one orient node (combined toolpath collection)
- Any future composition that would be impossible in a linear chain

Cycles are invalid. The graph store must reject any edge addition that would create a cycle.
Detection: after adding a candidate edge, run a DFS from the target node — if the source
node is reachable, the edge is cyclic and must be rejected.

## Top-level structure

```json
{
  "utde_graph_version": "1",
  "nodes": [ ...node objects... ],
  "edges": [ ...edge objects... ],
  "metadata": {
    "name": "my-process",
    "description": "",
    "created": "2026-03-01T00:00:00Z"
  }
}
```

---

## Node object

```json
{
  "id": "node_001",
  "type": "FollowCurveStrategy",
  "label": "Follow Curve",
  "position": { "x": 100, "y": 200 },
  "params": {
    "feed_rate": 1500,
    "path_type": "cut"
  },
  "input_ports":  [ { "id": "curve_in",  "type": "Curve"    } ],
  "output_ports": [ { "id": "tp_out",    "type": "Toolpath" } ],
  "status": "idle",
  "output": null
}
```

`status` values: `"idle"` | `"running"` | `"complete"` | `"error"`

`output` holds the serialized result of the node's last execution, or `null` if it
hasn't run. In v1 (on-demand execution) these fields are always `"idle"` and `null`
respectively — they exist so the reactive upgrade requires no schema migration.

**Reactive upgrade path (future):** wrap the graph runner in a `useEffect` + debounce
on `graphStore` changes. The runner populates `status` and `output` per node and only
re-executes nodes downstream of whatever changed. No schema changes needed.

| Field | Description |
|---|---|
| `id` | Unique string within the graph |
| `type` | Maps 1:1 to a Python class or function name in `toolpath_engine` |
| `label` | Display name in the UI (editable, does not affect serialization) |
| `position` | Canvas position — UI state only, not part of Python script |
| `params` | Keyword arguments passed to the Python constructor/call |
| `input_ports` | List of typed input ports |
| `output_ports` | List of typed output ports |

---

## Edge object

```json
{
  "id": "edge_001",
  "from_node": "node_001",
  "from_port": "tp_out",
  "to_node":   "node_002",
  "to_port":   "toolpath_in"
}
```

Edges are directed: data flows from `from_node` → `to_node`. A single output port can
fan out to multiple downstream nodes (one strategy → two post-processors). A single
input port can receive from multiple upstream nodes only if the port type supports
collection merging (e.g. `Toolpath` inputs on an orient node accept multiple toolpaths
and concatenate them).

**Cycle prevention** is enforced on every `addEdge` call via DFS. The store action
returns `{ ok: false, reason: "cycle" }` if the edge would create a cycle; the UI
shows an error on the wire and does not commit the edge.

---

## Primitive types on ports

| Type name | Python type | Description |
|---|---|---|
| `Position` | `Position` | Named XYZ point |
| `Orientation` | `Orientation` | Direction vector / rotation |
| `Frame` | `Frame` | Named coordinate system |
| `Curve` | `Curve` | 3D path |
| `Surface` | `Surface` | CAD face or region |
| `Toolpath` | `ToolpathCollection` | Oriented, parameterized path |
| `Variable` | `Variable` | Named scalar/string/bool |
| `OrientRule` | callable orient rule | Composable orientation strategy |
| `GCode` | `str` | Post-processed G-code output |

Connections between mismatched types are rejected. This makes the graph self-documenting.

---

## Built-in node types

### Geometry nodes

| Node type | Python equivalent | Inputs | Outputs |
|---|---|---|---|
| `GeometryModel` | `GeometryModel.load(path)` | — | `Surface[]`, `Curve[]` |
| `SelectSurfaces` | `model.select(tag=...)` | `Surface[]` | `Surface[]` |
| `SelectEdges` | `model.select_edges(type=...)` | `Surface[]` | `Curve[]` |
| `OffsetCurve` | `curve.offset(dist)` | `Curve` | `Curve` |
| `ProjectCurve` | `curve.project_onto(surface)` | `Curve`, `Surface` | `Curve` |

### Strategy nodes

| Node type | Python equivalent | Inputs | Outputs |
|---|---|---|---|
| `FollowCurveStrategy` | `FollowCurveStrategy().generate(curve)` | `Curve` | `Toolpath` |
| `RasterFillStrategy` | `RasterFillStrategy().generate(surface)` | `Surface` | `Toolpath` |
| `ContourParallelStrategy` | `ContourParallelStrategy().generate(surface)` | `Surface` | `Toolpath` |

### Orientation nodes

Each orient node takes a `Toolpath` input and produces a `Toolpath` output
(the same collection with orientation updated). They chain in sequence.

| Node type | Python equivalent |
|---|---|
| `OrientToNormal` | `collection.orient(to_normal(surface))` |
| `OrientFixed` | `collection.orient(fixed(direction))` |
| `OrientLead` | `collection.orient(lead(angle_deg))` |
| `OrientLag` | `collection.orient(lag(angle_deg))` |
| `OrientSideTilt` | `collection.orient(side_tilt(angle_deg))` |
| `OrientAvoidCollision` | `collection.orient(avoid_collision(max_tilt_deg=45))` |
| `OrientBlend` | `collection.orient(blend(rule_a, rule_b, t))` |

### Output nodes

| Node type | Python equivalent | Inputs | Outputs |
|---|---|---|---|
| `PostProcessor` | `PostProcessor(config).generate(collection, machine)` | `Toolpath` | `GCode` |
| `DebugOutput` | `DebugPostProcessor().generate(collection)` | `Toolpath` | `GCode` |

---

## Python script round-trip

A graph serializes to a Python script by traversing nodes in topological order
and emitting one line per node, using the node `id` as the variable name:

```python
# Serialized from graph
node_001 = Curve.helix(center=(0,0,0), radius=40, pitch=5, turns=4)
node_002 = FollowCurveStrategy(feed_rate=1500).generate(node_001)
node_003 = node_002.orient(to_normal(node_004))
node_004 = Surface.cylinder(center=(0,0,0), axis=(0,0,1), radius=40, height=20)
node_005 = PostProcessor(PostConfig(machine_name="5axis_AC")).generate(node_003)
```

The inverse (script → graph) parses assignments and call expressions,
inferring port types from the `toolpath_engine` type annotations.

---

## Implementation target

The frontend node graph editor is implemented with **litegraph.js**.
Node type definitions in `utde-app/src/nodegraph/` must mirror this schema exactly.
The backend `/serialize-graph` and `/deserialize-graph` API endpoints perform
the JSON ↔ Python script conversion.
