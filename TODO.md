# UTDE TODO

## Open Issues

### 1. Deselect `✕` button not appearing in sidebar (IN PROGRESS)

**What was requested:** Add a `✕` button to each selected face/edge row in the left sidebar (`GeometryList.jsx`) so the user can deselect individual items without clicking off in the viewport.

**What was implemented:**
- Added `onDeselect` prop to `ItemRow` in `GeometryList.jsx`
- `{isSelected && <div onClick={onDeselect}>✕</div>}` added after the label/type block
- `onDeselect={() => toggleFace(face.id, true)}` and `onDeselect={() => toggleEdge(edge.id, true)}` wired up
- Button styled: red border (`#cc3300`), dark red background (`#2a1a1a`), `✕` character, 18×18px

**Symptom:** The row highlights correctly (orange dot, dark blue background = `isSelected` is `true`) but the `✕` element does not appear. This rules out a store/selector bug.

**Suspected cause:** Vite HMR or Tauri WebKitGTK module caching is serving an older version of `GeometryList.jsx` to the webview despite the source being correct. Cache was cleared (`node_modules/.vite` deleted) and app restarted — still not resolved at time of tabling.

**Next steps to try:**
1. Open browser devtools in the Tauri window (right-click → Inspect) and check the rendered DOM for a selected `ItemRow` — confirm whether the `✕` div is present in the DOM or not.
2. If the DOM shows the button but it's invisible: check for a parent with `overflow: hidden` or `pointer-events: none` clipping it.
3. If the DOM does NOT have the button: the module cache is still stale. Try running `npx vite --force` instead of `npx tauri dev` to bypass pre-bundling cache, or check if there's another `GeometryList.jsx` file somewhere in the tree.
4. As a fallback: replace the conditional render with an always-rendered div using `style={{ visibility: isSelected ? "visible" : "hidden" }}` to rule out React conditional rendering issues.

**Key files:**
- `utde-app/src/components/sidebar/GeometryList.jsx` — `ItemRow` component, lines 13–55
- `utde-app/src/store/stepStore.js` — `toggleFace(id, true)` / `toggleEdge(id, true)` removes item from multi-selection

---

### 2. RasterFill bounded mode — outer + inner curve selection (NOT STARTED)

**What was requested:** Add a mode to the `RasterFillStrategy` where the raster passes are clipped to both an outer boundary curve and one or more inner boundary curves (e.g. for filling a face with a hole, or constraining fill to a region between two curves selected in the UI).

**Design intent:**
- Current `RasterFillStrategy` fills a surface between its natural boundary loops
- New mode: user selects an outer curve (bounds the outside of the fill) and optionally one or more inner curves (cutouts/holes inside the fill region)
- Should integrate with the existing edge selection UI — user picks edges from the sidebar/viewport for outer and inner bounds
- Raster lines should be trimmed to the region inside the outer curve and outside all inner curves

**Where to look:**
- `utde_v0.1.0/toolpath_engine/strategies/` — `RasterFillStrategy` implementation
- `utde-app/src/components/sidebar/` — strategy config panel (find the RasterFill config UI)
- `utde-app/src/store/strategyStore.js` — strategy parameter state
- `step_server.py` `/generate-toolpath` endpoint — how strategy params are passed to the Python backend

**Implementation sketch:**
1. Add `outer_edge_ids` and `inner_edge_ids` optional params to the RasterFill strategy config in the UI and `strategyStore`
2. Pass them through `generate-toolpath` JSON payload to `step_server.py`
3. In the Python backend, extract the OCC curves for those edge IDs from the loaded shape
4. In `RasterFillStrategy`, accept optional `outer_boundary` and `inner_boundaries` curve args; use them to clip each raster line segment
5. Clipping: for each raster line, intersect with outer curve to find entry/exit points, then subtract inner curve intersections

---

### 3. FollowCurve — inset from boundary and offset from normal (NOT STARTED)

**What was requested:** Add two new offset parameters to `FollowCurveStrategy`:
1. **Inset from boundary** — offsets the toolpath laterally inward from the selected curve, along the surface, by a user-specified distance (useful for keeping the tool a fixed distance from an edge)
2. **Offset from normal** — lifts/lowers each toolpath point along the surface normal by a user-specified distance (useful for standoff distance, e.g. wire-arc deposition bead height)

**Where to look:**
- `utde_v0.1.0/toolpath_engine/strategies/` — `FollowCurveStrategy` implementation
- `utde_v0.1.0/toolpath_engine/core/geometry.py` — `Curve` and `Surface` types; check if surface normal and offset-along-surface are already implemented
- `utde_v0.1.0/toolpath_engine/core/primitives.py` — `Vector3`, `Frame` — used for normal offset math
- `utde-app/src/components/sidebar/` — strategy config panel for FollowCurve parameters
- `utde-app/src/store/strategyStore.js` — where strategy params live
- `step_server.py` `/generate-toolpath` endpoint — passes strategy params to Python

**Implementation sketch:**

*Inset from boundary:*
- After sampling points along the selected curve, compute the surface tangent and cross it with the surface normal to get the inward lateral direction at each point
- Translate each point by `inset_distance` in that direction
- Parameter: `inset_distance` (mm, default 0, can be negative for outset)

*Offset from normal:*
- At each toolpath point, evaluate the surface normal
- Translate the point by `normal_offset` distance along that normal
- Parameter: `normal_offset` (mm, default 0)

Both params should be exposed in the FollowCurve config UI as numeric inputs and passed through the existing `generate-toolpath` JSON payload.

---

### 4. ContourParallel — inset from boundary and offset from normal (NOT STARTED)

**What was requested:** Same two offset parameters as TODO #3, applied to `ContourParallelStrategy`:
1. **Inset from boundary** — shifts the starting boundary inward/outward along the surface before generating offset passes (i.e. the first pass starts at `inset_distance` from the boundary, not at the boundary itself)
2. **Offset from normal** — lifts/lowers every point on all passes along the surface normal by a fixed distance

**Where to look:**
- `utde_v0.1.0/toolpath_engine/strategies/contour_parallel.py` — `_offset_curve_2d()` and `generate()`
- `utde_v0.1.0/toolpath_engine/core/geometry.py` — `Curve`, `Surface` — check for surface normal evaluation
- `utde-app/src/components/sidebar/` — ContourParallel config UI panel
- `utde-app/src/store/strategyStore.js` — strategy params
- `step_server.py` `/generate-toolpath` — passes strategy params to Python

**Implementation sketch:**

*Inset from boundary:*
- Add `boundary_inset` param (mm, default 0)
- Before the pass loop, pre-offset the boundary by `boundary_inset` (negative = inward, same sign convention as `_offset_curve_2d`)
- All subsequent passes then step from this inset boundary rather than the original
- Effectively: `offset_dist = boundary_inset + sign * stepover * (pass_idx + 1)`

*Offset from normal:*
- Add `normal_offset` param (mm, default 0)
- After computing each `ToolpathPoint`, translate its position by `normal_offset` along the surface normal at that point
- Requires knowing the surface the curve lies on — may need to accept an optional `surface` arg to `generate()`, or fall back to using the curve's local Z-normal if no surface is provided
- Same approach as TODO #3 normal offset

**Note on current 2D limitation:** `_offset_curve_2d` only offsets in XY. Both features should respect this limitation for now and be revisited when 3D surface offset is added.

---

### 5. Tests for Tauri app additions made this session (NOT STARTED)

**What was requested:** Add Vitest tests covering the new/changed frontend behaviour introduced this session.

**Test files to update or create:**

**`src/__tests__/components/StepUpload.test.jsx`** — already exists, needs additions:
- Quality slider re-parse on release: mock `parseStepByPath`, simulate loading a file (sets `currentPathRef`), then fire `onMouseUp` on the slider with a new quality level — assert `parseStepByPath` called again with `2.0 / newLevel` as deflection
- Deflection mapping: assert quality level 1 → deflection 2.0, level 5 → 0.4, level 10 → 0.2
- Slider labels: assert level ≤2 shows "Draft", 3–5 shows "Med", 6–8 shows "Fine", 9–10 shows "Max"
- Default quality level: assert slider initialises at 2 (Draft)
- Re-parse does NOT fire if no file has been loaded yet (currentPathRef is null)

**`src/__tests__/components/GeometryList.test.jsx`** — new file:
- Selected row renders `✕` button; unselected row does not
- Clicking `✕` calls `toggleFace(id, true)` / `toggleEdge(id, true)` and does NOT call `toggleFace` with `multi=false` (i.e. stopPropagation works — row onClick not also fired)
- `✕` hover styles change (optional, lower priority)

**`src/__tests__/api/client.test.js`** — already exists, likely already covers `parseStepByPath` but verify:
- Deflection value is serialised correctly in the JSON body: `{ path, deflection }`
- Error path: server returns `{ error: "..." }` with non-OK status → promise rejects with that message

**`src/__tests__/lib/backend.test.js`** — new file (or add to existing if present):
- `waitForServer` resolves immediately when `get_server_status` returns true on first poll
- `waitForServer` rejects after 30s timeout (mock timers)
- `getBaseUrl` returns `/api` when `IS_TAURI=false`
- `getBaseUrl` invokes `get_server_port` and returns `http://127.0.0.1:{port}` when `IS_TAURI=true`
- `openStepFileDialog` filter includes both lowercase and uppercase extensions

**Run tests with:** `cd utde-app && npm test`

---

### 6. Documentation updates for recent additions (NOT STARTED)

**What was requested:** Update/create docs to cover the changes made this session.

**Files to update:**

**`docs/contributing/tauri-migration.md`** — currently describes the migration plan:
- Update to reflect that the C stub sidecar (`binaries/utde-server`) has been replaced by a direct `std::process::Command` spawn of `step_server.py` in `lib.rs`
- Document the `CARGO_MANIFEST_DIR` path resolution approach and its dev-vs-production implications
- Note the CORS requirement in dev mode (WebKitGTK enforces CORS; `flask-cors` with `origins="*"` is used; `--no-cors` flag is no longer passed)
- Document the `devcontainer.json` GTK system deps added (`libwebkit2gtk-4.1-dev`, `libgtk-3-dev`, etc.)

**`docs/ui/step-import.md`** — describes the STEP FILE panel:
- Document the new **Mesh Quality slider** (1–10 scale, 1=Draft/2.0mm deflection, 10=Max/0.2mm deflection)
- Explain that releasing the slider re-parses the loaded file automatically (no need to reload manually)
- Note default is 2 (Draft) for fast initial load

**`docs/contributing/development.md`** — dev environment setup:
- Add section on the VNC/noVNC dev workflow (Xvfb + x11vnc + websockify on port 6080)
- Document startup commands for the full stack: Xvfb, openbox, x11vnc, websockify, then `npx tauri dev`
- Warn about stale Vite processes occupying port 3000 causing webview to load wrong frontend

**`docs/api/strategies.md`** (or `docs/guides/strategies.md`):
- Add explanation of `ContourParallelStrategy` (currently undocumented): offset passes, `_offset_curve_2d`, parameters, 2D-only limitation

**New file: `docs/contributing/server-backend.md`** (or expand existing):
- Document `step_server.py` architecture: endpoints, pythonocc usage, `TransferRoot(i)` loop, `BRepMesh_IncrementalMesh` 5-arg signature required by installed pythonocc version

---

### 7. GoToPoint strategy — user-picked surface location (NOT STARTED)

**What was requested:** A new strategy that generates a single toolpath point at a location the user picks directly on a surface in the 3D viewport. Useful for spot operations, probe points, single-pass deposition, or as a building block for more complex point-set strategies.

**User interaction design:**
- User selects a face in the viewport/sidebar (existing selection flow)
- A new "Pick Point" mode is activated (similar to the existing workspace origin picking mode)
- User clicks a location on the selected face in the 3D viewport — the click hit point (in world coordinates) is captured
- The picked point + face surface normal at that location are stored in the strategy config
- The strategy generates a single `ToolpathPoint` at that location with orientation derived from the surface normal (or the active orientation rule chain)

**Where to look:**
- `utde_v0.1.0/toolpath_engine/strategies/` — add `goto_point.py` here, following the pattern of `follow_curve.py`
- `utde_v0.1.0/toolpath_engine/strategies/__init__.py` — register new strategy
- `utde-app/src/components/viewport/FaceMesh.jsx` — already has click + pointer handling; see how workspace origin picking (`pickingOrigin` mode) works for reference
- `utde-app/src/store/stepStore.js` — `pickingOrigin`, `setWorkspaceOrigin` as a pattern for a new `pickingGoToPoint` mode
- `utde-app/src/store/strategyStore.js` — add `goToPoint: { position: null, normal: null }` param
- `utde-app/src/components/sidebar/` — add GoToPoint config panel showing the picked coordinates and a "Pick" button to enter picking mode
- `step_server.py` `/generate-toolpath` — pass `goto_point` position + normal through to the Python strategy

**Implementation sketch:**
1. Add `GoToPointStrategy` in Python: `generate(position, normal, feed_rate, **kwargs)` → single `ToolpathPoint`
2. Add `pickingGoToPoint` boolean to `stepStore`; when true, next face click captures `e.point` and the face's surface normal instead of selecting the face
3. Store picked `{ x, y, z }` and `{ nx, ny, nz }` in `strategyStore` under `goToPoint`
4. Display picked coordinates in the sidebar panel; show a crosshair marker in the viewport at the picked location
5. Pass position + normal in the `generate-toolpath` payload; Python constructs the `ToolpathPoint` directly

**Reference patterns:**
- `pickingOrigin` / `setWorkspaceOrigin` in `stepStore.js` — same pick-mode toggle pattern
- `FaceMesh.jsx` `handleClick` — already branches on picking mode; add a new branch for `pickingGoToPoint`

---

### 8. Debug post-processor for development (NOT STARTED)

**What was requested:** A dedicated post-processor for use during development that produces human-readable, annotated output instead of machine G-code — making it easy to inspect and verify toolpath generation without needing a real machine config.

**What to define (design discussion needed):**

The debug post-processor should prioritise clarity over machine compatibility. Suggested inclusions:

- **Point index and source** — number each point and show which strategy/curve it came from (`source`, `curve_ref` fields on `ToolpathPoint`)
- **World-space XYZ + orientation** — output raw position and orientation (IJK tool vector or euler angles) before any IK is applied, so you can see what the strategy actually produced
- **Surface normal** — if available in process params, print it
- **Process parameters** — dump all `process_params` key/value pairs in a readable way (not mapped to G-code letters)
- **Feed rate** — print on every point (no modal suppression) so it's always visible
- **Path type** — print `path_type` (e.g. `"cut"`, `"rapid"`, `"contour"`)
- **Per-toolpath summary** — before each toolpath: name, point count, bounding box, estimated length
- **IK solution (optional)** — if a machine is provided, also show the solved joint values alongside world coords; if no machine provided, skip IK entirely (don't require a machine config to use the debug post)
- **Warnings** — flag any points with zero feed rate, degenerate orientation, or IK failure
- **Format** — plain text with clear column alignment or JSON (decide: JSON is easier to parse programmatically, plain text is easier to read at a glance; consider supporting both via a `format="text"|"json"` param)

**Where to add it:**
- `utde_v0.1.0/toolpath_engine/post/debug.py` — new file, `DebugPostProcessor` class
- `utde_v0.1.0/toolpath_engine/post/__init__.py` — export alongside `PostProcessor`
- `step_server.py` `/generate-toolpath` — add `"debug"` as a valid `post_processor` option in the request payload; return debug output in addition to or instead of G-code when requested
- `utde-app/src/components/sidebar/` — add a toggle in the G-code/output panel to switch between "G-code" and "Debug" output modes

**Key files:**
- `utde_v0.1.0/toolpath_engine/post/processor.py` — existing `PostProcessor` and `PostConfig` to use as reference
- `utde_v0.1.0/toolpath_engine/core/toolpath.py` — `ToolpathPoint` fields: `position`, `orientation`, `feed_rate`, `rapid`, `path_type`, `process_params`, `source`, `curve_ref`

---

### 9. Workpiece Coordinate System (WCS) selection in G-code output (NOT STARTED)

**What was requested:** Allow the user to specify which machine WCS register (G54–G59, G54.1 Pn, etc.) is output in the final G-code, so the program runs in the correct coordinate system on the controller.

**Current state:**
- The UI already has a workspace origin picker (point, centroid, front-left modes) stored as `workspaceOrigin: { x, y, z }` in `stepStore`
- `step_server.py` receives `workspace_origin` in the `/generate-toolpath` payload and prepends a comment (`( WCS Origin: X… Y… Z… )`) to the G-code but does NOT emit a WCS select code (G54 etc.)
- The demo example (`demo_5axis_ded.py`) manually adds `"G54"` to `safe_start` in `PostConfig`, which is hardcoded
- There is no UI control for choosing the WCS register

**What needs to be added:**

*Python side:*
- Add `wcs_register` field to `PostConfig` (e.g. `wcs_register: str = "G54"`)
- Supported values: `"G54"` through `"G59"`, `"G54.1 P1"` … `"G54.1 P48"`, `"none"` (omit)
- Emit the WCS select code at the start of the program (after the safe-start block, before first motion)
- Remove the hardcoded `"G54"` from `safe_start` in the demo — it should come from this field

*API side (`step_server.py`):*
- Accept `wcs_register` in the `/generate-toolpath` JSON payload
- Pass it into `PostConfig` when constructing the post-processor
- Replace the current WCS comment with the actual G-code register call (or keep the comment alongside it for reference)

*Frontend:*
- Add a `wcs_register` field to `strategyStore` (default `"G54"`)
- Add a dropdown/select control in the strategy or output panel: options G54–G59 plus G54.1 extended registers and "None"
- Include `wcs_register` in the `generate-toolpath` fetch payload

**Key files:**
- `utde_v0.1.0/toolpath_engine/post/processor.py` — `PostConfig`, `_write_header()` (lines 128–144)
- `step_server.py` — `/generate-toolpath` endpoint, lines ~405, 548–573
- `utde-app/src/store/stepStore.js` — `workspaceOrigin`, `originMode` (lines 37–38)
- `utde-app/src/store/strategyStore.js` — add `wcs_register` param
- `utde-app/src/components/sidebar/` — output/G-code panel, add WCS dropdown

---

### 10. Node graph UI for process pipeline (NOT STARTED)

**What was requested:** Replace or supplement the current linear sidebar-based strategy + orientation rule configuration with an interactive node graph, where each processing stage (strategy, orientation rules, post-processor, etc.) is a visual node that can be connected, reordered, and configured by clicking.

**Current UI (to replace or extend):**
- `StrategyPanel.jsx` — dropdown selects strategy type, inline fields for params, ordered list of orientation rule rows with up/down/delete
- State in `strategyStore.js` — `strategy` object + `orientationRules` array (ordered, applied sequentially)
- The pipeline is implicitly linear: strategy → orientation rules (in order) → post-processor

**Node graph design:**

Each node represents one stage in the toolpath pipeline:

| Node type | Inputs | Outputs | Configurable params |
|---|---|---|---|
| **Geometry** | — | faces, edges | (read from selection) |
| **Strategy** | faces/edges | raw toolpath | type, feed rate, spacing, etc. |
| **Orientation Rule** | toolpath | toolpath | rule type + params (lead, lag, tilt, etc.) |
| **Post-Processor** | toolpath | G-code | machine, WCS register, format |
| **Debug Output** | toolpath | debug text | format (text/JSON) |

Nodes connect via typed ports (edges carry toolpath data). Multiple orientation rule nodes chain in sequence between the strategy and post-processor. The graph is a DAG — eventual support for branching (e.g. one strategy feeding two different post-processors) would be a future extension.

**Implementation options to evaluate:**
- **React Flow** (`reactflow` npm package) — purpose-built node graph library, handles drag/drop, edges, zoom/pan; most likely the right choice
- **Custom canvas** — full control but high implementation cost; probably overkill
- **Hybrid** — keep the sidebar for simple cases, add a "Graph View" toggle that renders the same state as a node graph

**State considerations:**
- `strategyStore.js` already models the pipeline as `strategy` + ordered `orientationRules[]` — the node graph is a visual representation of this existing state, not a new data model
- Nodes should be two-way bound to the store: editing a node's params updates the store; adding/removing rules adds/removes nodes
- Node positions (x, y on canvas) need to be persisted separately (not in the strategy store — add a `nodeGraphLayout` key or keep layout in local component state)

**Key files:**
- `utde-app/src/components/sidebar/StrategyPanel.jsx` — current implementation to refactor/extend
- `utde-app/src/store/strategyStore.js` — existing pipeline state; node graph maps directly onto this
- `utde-app/src/components/` — add `NodeGraph/` directory with node components
- `utde-app/src/store/uiStore.js` — add `graphView: false` toggle

**Suggested first steps:**
1. Add `reactflow` dependency
2. Write a `pipelineToNodes()` function that converts `{ strategy, orientationRules[] }` → React Flow nodes + edges
3. Render read-only graph first, then add editing

**Node reordering (further step):**
Orientation rule nodes sit between the strategy node and post-processor node and must be reorderable since rule order affects the output. Two interaction patterns to support:

- **Drag to reorder** — drag a node up/down along the chain; React Flow supports node drag natively, but constraining drag to a 1D chain order requires a custom drop target or snap-to-position logic. On drop, recompute the order from Y position and call `moveOrientationRule(fromIdx, toIdx)` in the store.
- **Arrow buttons on node** — simpler fallback; each orientation rule node has ↑/↓ buttons that call `moveOrientationRule` directly, mirroring what the current `RuleRow` up/down buttons already do in `StrategyPanel.jsx`.

Recommended approach: implement arrow buttons first (maps 1:1 to existing store actions), then layer drag reordering on top as a polish step. The strategy node and post-processor node are fixed (not reorderable) — only orientation rule nodes move.

The graph edge connections should update automatically when nodes reorder, since edges are derived from node order via `pipelineToNodes()` — no separate edge state needed.

---

### 11. Three.js geometry merging — merge slider for render performance (NOT STARTED)

**What was requested:** Add a geometry merging pass in the Three.js render to reduce draw calls and improve performance for large or complex STEP files. Add a second slider (alongside the mesh quality slider) that controls the aggressiveness of merging.

**Design intent:**
- Many STEP files produce hundreds of separate face meshes, each with its own draw call. Merging compatible geometries (same material/color type) into a single `BufferGeometry` drastically reduces draw calls.
- The **Merge slider** would range from 0 (no merging, each face is its own mesh — current behavior) to 10 (maximum merging, all faces of the same type merged into one draw call).
- The mesh quality slider controls tessellation fidelity (how fine the triangles are); the merge slider controls how many meshes are batched together. The two are independent. Together they give users control over both visual accuracy and render performance.
- This is particularly important for large industrial STEP files with hundreds of bolt holes, fastener patterns, or patterned features.

**Implementation sketch:**
- After tessellation, group face meshes by surface type (plane, cylinder, etc.) or by material
- Use `BufferGeometryUtils.mergeGeometries()` (Three.js built-in) to merge groups into a single `BufferGeometry`
- The slider value controls the grouping strategy: low merge = group only identical types; high merge = group all faces regardless of type
- Store `mergeLevel` in `stepStore` alongside `qualityLevel`; re-run merge pass when slider is released (same UX pattern as quality slider)

**Where to look:**
- `utde-app/src/components/viewport/` — face mesh rendering components
- `three/examples/jsm/utils/BufferGeometryUtils.js` — `mergeGeometries()` utility
- `utde-app/src/components/sidebar/StepUpload.jsx` — quality slider as pattern for the new merge slider UI

---

### 12. glTF/Draco geometry transfer format (NOT STARTED)

**What was requested:** Replace the current JSON-based geometry transfer between Python backend and Three.js frontend with glTF binary (`.glb`) using Draco compression. This is the best format for Three.js — compact, GPU-friendly, fast to parse, and Draco compression reduces file size 80–90%.

**Design intent:**
- Currently: `step_server.py` returns face/edge geometry as JSON arrays of vertices and indices. Three.js reconstructs `BufferGeometry` from these arrays. For large models this JSON can be several MB and is slow to parse on the main thread.
- Target: Python backend exports tessellated geometry as `.glb` (glTF binary), optionally Draco-compressed. Frontend loads it with `GLTFLoader` (and `DRACOLoader` for decompressed meshes).
- `trimesh` can export glTF from OCC meshes, or use `pygltflib` for more control over the output structure.
- Draco compression: Three.js's `DRACOLoader` decompresses on the GPU. Enable with `GLTFLoader.setDRACOLoader(dracoLoader)`.
- For loading: use `GLTFLoader` with a loading manager and show a progress indicator. Consider using `useLoader` with React Suspense in React Three Fiber to avoid blocking the main thread.

**Implementation sketch:**
1. In `step_server.py`: after OCC tessellation, convert face mesh data to a `trimesh.Trimesh`, then export with `trimesh.exchange.gltf.export_glb()` (or `pygltflib` for Draco)
2. Add a new endpoint `/parse-step-glb` (or add `format=glb` param to `/parse-step`) that returns `Content-Type: model/gltf-binary`
3. In `api/client.js`: add `parseStepGlb()` that fetches the binary response and returns an `ArrayBuffer`
4. In the viewport: use `GLTFLoader` to load from the ArrayBuffer; replace current `BufferGeometry` construction from JSON
5. Wire up `DRACOLoader` with the Three.js Draco decoder from `/node_modules/three/examples/jsm/libs/draco/`

**Key packages:**
- Python: `trimesh`, `pygltflib` (add to `devcontainer.json` pip install)
- Frontend: `three`'s built-in `GLTFLoader` and `DRACOLoader` (`three/examples/jsm/loaders/`)

**Where to look:**
- `step_server.py` — tessellation logic, `/parse-step` endpoint
- `utde-app/src/components/viewport/` — face mesh rendering
- `utde-app/src/api/client.js` — API fetch wrappers

---

### 13. InstancedMesh for repeated features (NOT STARTED)

**What was requested:** Use `THREE.InstancedMesh` instead of duplicating geometry for repeated features (bolt holes, fasteners, patterned features). One `InstancedMesh` with N instances is one draw call; N separate meshes is N draw calls.

**Design intent:**
- STEP files with repetitive features (bolt hole patterns, screw arrays, fastener grids) produce many geometrically identical meshes that differ only in position/rotation. Rendering these as separate `Mesh` objects is extremely wasteful.
- Detect repeated face geometry (same type + same approximate dimensions) after tessellation, group them, and render each group as a single `InstancedMesh` with per-instance transforms stored in a `InstancedBufferAttribute`.
- This is most impactful for manufacturing parts with many fastener holes or patterned features.

**Implementation sketch:**
1. After tessellation, cluster faces by geometry fingerprint (e.g. face type + bounding box dimensions rounded to 0.1mm)
2. For clusters with N > threshold (e.g. N ≥ 3), create one `InstancedMesh` with the base geometry and N instance matrices
3. For singletons, keep the current `Mesh` per face
4. Selection/hover highlighting: update the `InstancedMesh` color attribute for the specific instance index rather than swapping materials

**Where to look:**
- `utde-app/src/components/viewport/` — face mesh rendering; identify where individual `Mesh` objects are created per face
- Three.js `THREE.InstancedMesh` docs — `setMatrixAt(index, matrix)`, `setColorAt(index, color)`, `instanceMatrix`, `instanceColor`

---

### 14. Three.js render performance — visibility toggling and line batching (NOT STARTED)

**What was requested:** Two specific rendering optimisations:

**1. Use `Object3D.visible = false` instead of scene removal for temporary hide/show:**
- Removing an object from the scene triggers garbage collection and re-allocation on re-add. For toggling toolpath layers or face visibility on/off, set `mesh.visible = false` / `true` instead.
- Applies to: toolpath layer visibility toggles, hidden face groups, any show/hide UI controls.

**2. Batch toolpath lines into a single `LineSegments` or `Line` with one `BufferGeometry`:**
- Currently a separate `Line` object per toolpath segment means hundreds or thousands of draw calls for complex toolpaths.
- Instead: build one large `BufferGeometry` with a `position` attribute containing all segment endpoints, and render with a single `LineSegments` call.
- For per-toolpath color variation: encode color as a vertex attribute (`vertexColors: true`) rather than separate materials per segment. Each pair of vertices gets the color of its toolpath.
- Rebuild the combined `BufferGeometry` when the toolpath collection changes; do not rebuild on every frame.

**Where to look:**
- `utde-app/src/components/viewport/` — toolpath line rendering components
- `utde-app/src/store/toolpathStore.js` — toolpath point data
- Three.js `THREE.LineSegments`, `THREE.BufferGeometry`, `vertexColors` material option

---

### 15. Toolpath transform — translate and rotate toolpaths in the UI (NOT STARTED)

**What was requested:** Add the ability to translate and rotate any generated toolpath within UTDE — both in the Python library and via controls in the GUI. Users should be able to reposition a toolpath relative to the part without regenerating it.

**Python library changes:**

Add `translate()` and `rotate()` methods to `Toolpath` and `ToolpathCollection` in `utde_v0.1.0/toolpath_engine/core/toolpath.py`:

```python
# Toolpath.translate(dx, dy, dz) — shift all points by a vector
def translate(self, dx=0, dy=0, dz=0):
    for pt in self.points:
        pt.position = Position(pt.position.x + dx, pt.position.y + dy, pt.position.z + dz)
    return self

# Toolpath.rotate(angle_deg, axis=(0,0,1), origin=(0,0,0)) — rotate all points + orientations
def rotate(self, angle_deg, axis=(0, 0, 1), origin=(0, 0, 0)):
    # Build rotation matrix from axis-angle (use numpy or scipy.spatial.transform.Rotation)
    # Apply to each point's position (relative to origin) and orientation vector
    ...
    return self

# ToolpathCollection.translate / .rotate — delegates to each Toolpath
```

Orientation vectors must be rotated along with positions — a translate/rotate that only moves positions but leaves the tool pointing in the original direction will produce incorrect G-code.

**API changes (`step_server.py`):**

Add `transform` field to the `/generate-toolpath` request payload (applied after generation):

```json
{
  "strategy": { ... },
  "transform": {
    "translate": [dx, dy, dz],
    "rotate": { "angle_deg": 45, "axis": [0, 0, 1], "origin": [x, y, z] }
  }
}
```

Alternatively, expose a separate `/transform-toolpath` endpoint that takes a stored toolpath ID + transform and returns the transformed result.

**Frontend changes:**

- Add `toolpathTransform` to `toolpathStore`: `{ translate: {x,y,z}, rotate: {angleDeg, axis, origin} }`
- Add a **Transform** panel in the toolpath sidebar with:
  - Translation inputs: X / Y / Z offset (numeric, mm)
  - Rotation inputs: angle (degrees), axis selector (X / Y / Z / custom), rotation origin (world origin, workpiece origin, or custom point)
  - **Apply** button — sends current transform to backend, re-fetches transformed toolpath, updates viewport
  - **Reset** button — clears transform back to identity
- Show a live preview of the transform in the viewport using a `THREE.Matrix4` applied to the toolpath line group (client-side preview, not re-generated) before the user hits Apply

**Viewport preview:**

Apply the transform as a `Three.js` group matrix on the toolpath `<group>` ref so the user sees immediate visual feedback while tweaking values, without round-tripping to the server. On Apply, send to backend, replace the toolpath points in the store with the transformed result, and clear the local matrix override.

**Tests to write (per CLAUDE.md testing requirement):**
- `test_toolpath.py`: `translate()` shifts all point positions by the correct delta; `rotate()` rotates positions and orientation vectors; chaining translate + rotate gives the expected composed result; original collection is mutated (or a copy is returned — decide API)
- `test_server.py`: `/generate-toolpath` with `transform.translate` applies the offset; `transform.rotate` rotates output; missing `transform` field is a no-op
- `toolpathStore.test.js`: transform state updates correctly; reset returns to identity
- `ToolpathTransform.test.jsx`: Apply button triggers re-fetch with correct transform payload; Reset clears the store transform

**Where to look:**
- `utde_v0.1.0/toolpath_engine/core/toolpath.py` — `ToolpathPoint`, `Toolpath`, `ToolpathCollection`
- `utde_v0.1.0/toolpath_engine/core/primitives.py` — `Position`, `Orientation`, `Vector3` — check if rotation helpers exist
- `step_server.py` — `/generate-toolpath` endpoint, toolpath serialisation
- `utde-app/src/store/toolpathStore.js` — toolpath point state
- `utde-app/src/components/sidebar/` — toolpath panel (add Transform section)
- `utde-app/src/components/viewport/` — toolpath line rendering (apply preview matrix to group)

---

### 16. Editable process parameters per node in the GUI and node graph (NOT STARTED)

**What was requested:** Allow users to view and edit the process parameters (wire feed rate, laser power, shielding gas flow, custom variables, etc.) on each toolpath node directly within the GUI — both in the sidebar panel and within the node graph (TODO #10).

**Background:**

`ToolpathPoint` carries a `process_params` dict (arbitrary key/value pairs) alongside `feed_rate`, `rapid`, and `path_type`. These are currently set programmatically in Python scripts or via `ToolpathCollection.set_param()`. There is no UI for inspecting or overriding them per-node. The post-processor maps param keys to G-code output letters via `PostConfig.param_codes`.

**Python library changes:**

No core library changes required — `process_params` already exists on `ToolpathPoint` and `set_param()` already exists on `Toolpath` / `ToolpathCollection`. However, add a `get_params_schema()` helper that returns the union of all param keys present in a toolpath (for the UI to know what fields to show):

```python
# Toolpath.get_param_keys() → set of all process_param keys across all points
def get_param_keys(self):
    keys = set()
    for pt in self.points:
        keys.update(pt.process_params.keys())
    return keys
```

**API changes (`step_server.py`):**

- Include `process_params` (as a per-toolpath summary: key → {min, max, constant_value_or_null}) in the `/generate-toolpath` response so the frontend knows what params exist and their value ranges.
- Add an `override_params` field to the `/generate-toolpath` request payload — a dict of `{ param_key: value }` applied via `set_param()` after generation. This lets the frontend push per-toolpath param overrides without re-running the strategy.

```json
{
  "strategy": { ... },
  "override_params": {
    "wire_feed": 3.5,
    "laser_power": 2200
  }
}
```

**Frontend — sidebar panel:**

In the toolpath results panel, after generation, show a **Process Parameters** section:
- For each param key present in the toolpath, render a labeled numeric input (or text input for string params)
- Values initialised from the generated toolpath's param summary
- Editing a value and pressing Enter (or tabbing out) updates `toolpathStore.processParamOverrides` and triggers a re-fetch with `override_params`
- Show the G-code letter mapping alongside each param if it exists in the known post-processor config (e.g. `wire_feed → E`)

**Frontend — node graph integration (TODO #10):**

Each node in the node graph that produces or transforms a toolpath (Strategy node, Orientation Rule node) should have an expandable **Params** section in its node body:
- Collapsed by default; click a "⚙ Params" label to expand inline within the node card
- Show the same editable fields as the sidebar panel
- Changes propagate to the same `toolpathStore.processParamOverrides` state — the node graph and sidebar panel are two views of the same data
- The Post-Processor node shows the `param_codes` mapping (which param key → which G-code letter) as read-only reference

**State design:**

Add to `toolpathStore`:
```js
processParamOverrides: {},   // { param_key: value } — applied on next generate call
knownParams: [],             // [{ key, min, max, gcode_letter }] — from last generate response
setParamOverride(key, value),
clearParamOverrides(),
```

**Tests to write (per CLAUDE.md testing requirement):**
- `test_toolpath.py`: `get_param_keys()` returns correct union of all point param keys; empty toolpath returns empty set
- `test_server.py`: `/generate-toolpath` with `override_params` applies values via `set_param()`; response includes param summary with correct min/max/constant fields
- `toolpathStore.test.js`: `setParamOverride` updates `processParamOverrides`; `clearParamOverrides` resets to `{}`; `knownParams` populated from generate response
- `ProcessParams.test.jsx` (new): editing a numeric input updates store; re-fetch triggered with correct `override_params` payload; G-code letter shown alongside param key when mapping exists

**Where to look:**
- `utde_v0.1.0/toolpath_engine/core/toolpath.py` — `ToolpathPoint.process_params`, `Toolpath.set_param()`, `ToolpathCollection.set_param()`
- `utde_v0.1.0/toolpath_engine/post/processor.py` — `PostConfig.param_codes` (key → G-code letter mapping)
- `step_server.py` — `/generate-toolpath` endpoint, toolpath serialisation
- `utde-app/src/store/toolpathStore.js` — add `processParamOverrides`, `knownParams`
- `utde-app/src/components/sidebar/` — toolpath results panel (add Process Parameters section)
- `utde-app/src/components/NodeGraph/` — node card components (add expandable Params section, see TODO #10)

---

### 17. Rename processes / nodes in the GUI (NOT STARTED)

**What was requested:** Allow users to give each process node (strategy, orientation rule, post-processor) a custom display name within the GUI and node graph.

**Background:**

Currently all nodes are identified only by their type (e.g. "FollowCurve", "lead", "PostProcessor"). When a pipeline has multiple orientation rules of the same type, or when a user saves/shares a session, there is no way to distinguish them by intent. A user-editable label (e.g. "Wall deposit pass", "Avoid clamp fixture", "Final G54 output") makes the pipeline readable at a glance and makes exported sessions self-documenting.

**Python library changes:**

Add an optional `name` field to `Toolpath` and `ToolpathCollection`:

```python
@dataclass
class Toolpath:
    points: list[ToolpathPoint]
    name: str = ""   # user-assigned display name; empty = use type as label
```

The post-processor should emit the name as a comment block at the start of the toolpath's G-code section:
```
( Toolpath: Wall deposit pass )
```

**API changes (`step_server.py`):**

- Accept `name` on each strategy/rule config object in the `/generate-toolpath` payload; pass through to `Toolpath.name`
- Include `name` in the serialised toolpath response so the frontend can round-trip it

**Frontend — state:**

Add `name` to each entry in `strategyStore.orientationRules[]` and to the top-level `strategyStore.strategy` object:

```js
strategy: { type: "FollowCurve", name: "", params: { ... } }
orientationRules: [{ type: "lead", name: "", params: { ... } }]
```

**Frontend — sidebar panel:**

- Each rule row in the strategy panel has a small editable label field (or click-to-edit inline text) above or beside the rule type badge
- The strategy itself has a name field at the top of the strategy config section
- Empty name falls back to displaying the type name

**Frontend — node graph (TODO #10):**

- Each node card has an editable title at the top — double-click to enter edit mode, Enter or blur to confirm
- The title renders as the user-assigned name if set, otherwise the node type as the default
- Name changes update the store immediately; no server round-trip needed until the next Generate call

**Session persistence:**

`name` fields should be included in the exported `.json` session file so renamed pipelines survive a session import/export cycle. No schema changes needed beyond including the field in serialisation — it is already part of the strategy/rule config objects.

**Tests to write (per CLAUDE.md testing requirement):**
- `test_toolpath.py`: `Toolpath` with `name="Wall pass"` serialises and deserialises the name correctly; post-processor emits `( Toolpath: Wall pass )` comment when name is set; empty name emits no comment (or a generic one — decide convention)
- `test_server.py`: `/generate-toolpath` with `strategy.name` included returns that name in the response toolpath; missing `name` field is a no-op (defaults to `""`)
- `strategyStore.test.js`: `setStrategyName(name)` updates `strategy.name`; `setRuleName(index, name)` updates the correct rule's name; names survive `resetStrategy()` — decide: should reset clear names? (probably yes)
- `NodeGraph.test.jsx` or `StrategyPanel.test.jsx`: double-clicking a node title enters edit mode; confirming with Enter updates the store; ESC cancels and reverts

**Where to look:**
- `utde_v0.1.0/toolpath_engine/core/toolpath.py` — `Toolpath`, `ToolpathCollection` — add `name` field
- `utde_v0.1.0/toolpath_engine/post/processor.py` — `_write_header()` or per-toolpath header — emit name comment
- `step_server.py` — `/generate-toolpath` request parsing, toolpath serialisation
- `utde-app/src/store/strategyStore.js` — `strategy`, `orientationRules[]` — add `name` field and setter actions
- `utde-app/src/components/sidebar/StrategyPanel.jsx` — rule rows, strategy config section
- `utde-app/src/components/NodeGraph/` — node card title (see TODO #10)
- `utde-app/src/utils/session.js` — session export/import (verify `name` is included)

---

### 18. Save and load process pipelines to/from file (NOT STARTED)

**What was requested:** Allow users to save the current process pipeline (strategy + orientation rules + process parameter overrides + node names) to a file, and reload it later — independently of the STEP geometry and session state.

**Background:**

The existing **Export Session** / **Import Session** flow saves everything together: geometry selection state, strategy config, and toolpath results. A process pipeline file is different — it captures only the *reusable processing logic* (strategy type + params, orientation rule chain, param overrides, node names, WCS register) so the same pipeline can be applied to different parts without re-configuring from scratch.

**File format:**

A plain `.json` file (human-readable, version-control friendly):

```json
{
  "utde_pipeline_version": 1,
  "name": "5-axis DED wall deposit",
  "strategy": {
    "type": "FollowCurve",
    "name": "Wall pass",
    "params": { "feed_rate": 600, "spacing": 1.0, "path_type": "deposit" }
  },
  "orientation_rules": [
    { "type": "to_normal",  "name": "",              "params": {} },
    { "type": "lead",       "name": "Lead tilt",     "params": { "angle_deg": 5 } },
    { "type": "side_tilt",  "name": "",              "params": { "angle_deg": 3 } }
  ],
  "process_param_overrides": {
    "wire_feed": 3.5,
    "laser_power": 2200
  },
  "wcs_register": "G54"
}
```

**Python library / API changes:**

- Add `pipeline_to_dict(strategy, orientation_rules, overrides, wcs)` and `pipeline_from_dict(d)` helpers in a new `utde_v0.1.0/toolpath_engine/pipeline.py` module (or in `step_server.py` as utility functions)
- These are pure serialisation helpers — no OCC or flask dependency — so they can also be used in scripts outside the server

**Frontend — save:**

- Add a **Save Pipeline** button in the strategy sidebar panel (and as a node graph toolbar action in TODO #10)
- Serialise `strategyStore` state to the pipeline JSON format
- In **Tauri mode**: open a native save dialog (`saveGcodeDialog` pattern from `backend.js`) filtered to `.json`, write with `writeTextFile`
- In **browser mode**: trigger a `Blob` download (same pattern as existing session export)

**Frontend — load:**

- Add a **Load Pipeline** button alongside Save
- In **Tauri mode**: open a native file dialog filtered to `.json`; read file contents; parse and populate `strategyStore`
- In **browser mode**: `<input type="file" accept=".json">` hidden input, same as Import Session
- On load: validate `utde_pipeline_version` field; show a user-visible error if the file is not a valid pipeline file
- Loading a pipeline does **not** clear geometry selection or toolpath results — it only updates the strategy/rule configuration

**Distinction from session export:**

| | Session export | Pipeline file |
|---|---|---|
| Geometry selection (face/edge IDs) | ✓ | ✗ |
| Workspace origin | ✓ | ✗ |
| Strategy + rules | ✓ | ✓ |
| Process param overrides | ✗ | ✓ |
| Node names | ✗ | ✓ |
| WCS register | ✗ | ✓ |
| Toolpath results | ✗ | ✗ |

Consider whether to fold process param overrides and node names into the existing session format as well (they are currently lost on session export — probably worth fixing as part of this work).

**Tests to write (per CLAUDE.md testing requirement):**
- `test_pipeline.py` (new): `pipeline_to_dict()` round-trips through `pipeline_from_dict()` losslessly; unknown `utde_pipeline_version` raises a clear error; missing optional fields default correctly
- `strategyStore.test.js`: `loadPipeline(dict)` populates strategy type, params, rules, overrides, and names; `savePipeline()` returns the correct dict structure; loading a pipeline does not clear `selectedFaceIds` or `selectedEdgeIds` in `stepStore`
- `SaveLoadPipeline.test.jsx`: Save button triggers file download (browser) or `writeTextFile` invoke (Tauri mock); Load button parses file and calls `loadPipeline`; invalid file shows error message

**Where to look:**
- `utde-app/src/store/strategyStore.js` — full pipeline state to serialise
- `utde-app/src/utils/session.js` — existing export/import pattern to follow
- `utde-app/src/lib/backend.js` — `saveGcodeDialog()` as pattern for native save dialog
- `utde-app/src/components/sidebar/StrategyPanel.jsx` — add Save/Load buttons
- `utde-app/src/components/NodeGraph/` — toolbar Save/Load actions (TODO #10)
- `utde_v0.1.0/toolpath_engine/` — add `pipeline.py` serialisation helpers

---

### 19. Non-planar RasterFill — arc-length spacing, boundary clipping, and freeform surfaces (NOT STARTED)

**What was requested:** Update `RasterFillStrategy` to work correctly on non-planar faces (cylinders, spheres, freeform/B-spline surfaces from STEP files).

**Current state (what is and isn't implemented):**

`RasterFillStrategy` already calls `surface.evaluate(u, v)` and `surface.normal_at(u, v)` for every point, and `Surface` implements these analytically for `plane`, `cylinder`, and `sphere`. So raster passes *do* land on the 3D surface for these types. However three significant problems remain:

| Problem | Affects | Detail |
|---|---|---|
| **UV spacing ≠ world spacing** | cylinder, sphere | Equal Δv in UV maps to equal height on a cylinder (OK) but equal Δu maps to equal angle (not equal arc length). On a sphere, passes near the poles are far denser than at the equator. The `spacing` param controls UV-space step, not 3D distance. |
| **Boundary clipping is plane-only** | cylinder, sphere, freeform | `_project_boundary_to_uv()` explicitly returns `None` for `surface_type != "plane"`. Non-planar surfaces fall back to the rectangular UV bounding box — the boundary loop is ignored. |
| **Freeform/mesh surfaces unsupported** | B-spline, NURBS, tessellated mesh | Surfaces from real STEP files are tessellated meshes (or OCC NURBS). `Surface` has no `evaluate()` / `normal_at()` implementation for these. The raster strategy never receives them today — it only works with analytically constructed `Surface` objects. |

**Changes needed:**

**1. Arc-length-uniform UV sampling (cylinder and sphere)**

Replace the uniform Δv sweep with a sweep that produces equal 3D spacing between raster lines:

- **Cylinder**: V maps to height linearly, so equal ΔV = equal 3D spacing along the axis — already correct. U maps to angle; if raster lines run along U, the circumferential spacing between lines is `radius * Δangle`, so the correct Δu for a target spacing `d` is `d / radius`. Fix: compute `u_spacing = spacing / radius` rather than using `spacing` directly as ΔV when rastering circumferentially.
- **Sphere**: Lines of constant V are latitude circles with radius `r * cos(v)`. Equal ΔV spacing bunches up near poles. Fix: use arc-length parameterisation — Δv = `spacing / radius` (uniform on the sphere surface). Raster line length at latitude v is `2π * r * cos(v)`, so also scale point density accordingly.
- General approach: add a `_arc_length_v_samples(surface, spacing)` helper that returns a list of V values with equal 3D arc-length separation for the given surface type.

**2. Boundary clipping for non-planar surfaces**

For each non-planar surface type, implement the inverse mapping (3D boundary point → UV) in `_project_boundary_to_uv`:

- **Cylinder**: given a 3D point on the cylinder, recover `u = atan2(dot(point - origin, perp), dot(point - origin, ref))` and `v = dot(point - origin, axis)`.
- **Sphere**: `u = atan2(dy, dx)`, `v = asin(dz / r)`.
- **Mesh/NURBS**: project each 3D boundary point onto the UV grid by nearest-neighbour search (expensive but only done once per face). Use `Surface.closest_point()` as the inverse map — it already works for all types via grid search.

Once boundary points are in UV space, the existing `_clip_segment_to_polygon` and `_ensure_ccw` logic works unchanged.

**3. Freeform / tessellated mesh surfaces from STEP files**

This is the largest gap. STEP file faces are not `plane` / `cylinder` / `sphere` — they are tessellated meshes stored as vertex/triangle arrays in `step_server.py`. `RasterFillStrategy` never receives these today.

Required work:
- Add a `"mesh"` surface type to the `Surface` class with a barycentric `evaluate(u, v)` that interpolates position and normal from the triangle mesh (u, v here are not parametric — use a UV-atlas or a flat projection plane as the domain)
- Alternatively, add an `OccSurface` wrapper in `step_server.py` that delegates `evaluate(u, v)` and `normal_at(u, v)` to the OCC `BRep_Tool.Surface()` + `GeomAPI_ProjectPointOnSurf` for NURBS/B-spline faces, and passes this object to the strategy
- The `OccSurface` approach is cleaner: the strategy stays surface-type-agnostic; OCC does the parametric math
- `boundary_loop` is already populated from OCC edge tessellation — the UV inverse map for an OCC surface uses `ShapeAnalysis_Surface.ValueOfUV(point, tolerance)` to project 3D boundary points back to UV

**Implementation order (lowest to highest effort):**

1. Fix cylinder arc-length spacing (one-liner: `spacing / radius` for angular rasters)
2. Fix sphere arc-length spacing (`_arc_length_v_samples` helper)
3. Implement UV inverse map for cylinder and sphere in `_project_boundary_to_uv` — enables boundary clipping for these types
4. Add `OccSurface` wrapper in `step_server.py` — enables full non-planar support for any face type from a STEP file
5. Add `"mesh"` surface type fallback for offline/non-OCC use

**Tests to write (per CLAUDE.md testing requirement):**
- `test_strategies.py`: cylinder raster — verify that spacing between adjacent pass lines in 3D is `≈ spacing` (not `≈ spacing` in angle); sphere raster — verify inter-pass distance is uniform across latitudes; boundary clipping on cylinder — passes stay inside the boundary loop (test with a partial cylinder arc, not full 0–2π)
- Regression: existing plane raster tests must still pass unchanged

**Where to look:**
- `utde_v0.1.0/toolpath_engine/strategies/raster_fill.py` — `_project_boundary_to_uv()` (line 136), sweep loop (line 236), `generate()` (line 178)
- `utde_v0.1.0/toolpath_engine/core/geometry.py` — `Surface.evaluate()` (line 200), `Surface.normal_at()` (line 231), `Surface.closest_point()` (line 250)
- `step_server.py` — face tessellation, `boundary_loop` construction — location for an `OccSurface` wrapper class

---

## Completed This Session

- Wired Tauri app to real `step_server.py` / UTDE library (replaced C stub sidecar)
- Fixed `BRepMesh_IncrementalMesh` call signature (4 args → 5 args)
- Fixed `TransferRoots()` → `TransferRoot(i)` loop (pythonocc API difference)
- Regenerated `test_box.step` using pythonocc (old file was malformed)
- Fixed CORS: installed `flask-cors`, set `origins="*"`, removed `--no-cors` from server spawn
- Fixed stale Vite port issue (multiple lingering Vite processes)
- Quality slider: inverted to 1–10 scale (1=Draft, 10=Max), default 2 (coarse), re-parses on release
- Added Tauri GTK system deps to `devcontainer.json`
- Added `flask-cors` and `rust-analyzer` to `devcontainer.json`

### 20. Script view — live Python code view of the current pipeline (NOT STARTED)

**What was requested:** A third view (alongside the 3D viewport and the node graph) that shows the Python script that defines all current pipeline operations — the exact code that would be passed to the `@process` decorator. The view updates live as the user edits nodes, adds orient rules, or changes params.

**Design intent:**
- The architecture principle "one representation, two views" already covers the node graph ↔ Python script relationship. This view makes that relationship visible and directly useful to the user.
- The script is not just a preview — it should be editable. Editing the code updates `graphStore` in real time (the same way editing a node param does), so the three views (3D, graph, script) stay in sync.
- The output format is the same `@process` decorator style used in `templates/`, making it trivially copy-pasteable into a template file.
- Syntax highlighting (Python) should be applied.

**Interaction design:**
- Third toggle in the header alongside `◁ 3D VIEW` and `⬡ NODE GRAPH`: `⟨/⟩ SCRIPT`
- The view fills the main viewport area (same swap pattern as the node graph)
- Left gutter: line numbers + error indicators (red dot on lines that failed to parse back to graph state)
- Right panel: same Inspector panel as the node graph (reused unchanged) — clicking a line that corresponds to a node selects that node in the inspector
- Read-only mode first (generate script from graph); editable mode as a follow-on

**Script format (example output):**
```python
@process("my-process")
def my_process(model, params=None):
    home = Position(0, 0, 300, name="home")
    wcs = Frame.from_origin_and_z("workpiece", origin=(0, 0, 0), z_axis=(0, 0, 1))

    helix = Curve.helix(center=(0, 0, 0), radius=40, pitch=5, turns=4)
    paths = FollowCurveStrategy().generate(helix, feed_rate=600, path_type="deposit")
    paths.orient(to_normal(surface))
    paths.orient(lead(10))

    return paths
```

**Implementation sketch:**

*Script generation (graph → code):*
- Walk `graphStore` nodes in topological order (Kahn's algorithm, same as the DAG runner)
- Each node type has a `toCodeLine(node)` function that emits its Python equivalent:
  - `GeometryNode` → comment + variable assignment from stepStore selection
  - `StrategyNode` → `paths = {StrategyClass}().generate(..., feed_rate=..., path_type=...)`
  - `OrientNode` → `paths.orient({rule}({params}))`
  - `PostProcessorNode` → `return paths` (or `paths.to_gcode(post="...")`)
- Wrap in `@process("untitled")` decorator + `def my_process(model, params=None):`
- Result is a string displayed in a `<pre>` / code editor component

*Script parsing (code → graph) — follow-on:*
- Use a simple line-by-line parser (not a full AST) that recognises the known patterns above
- Each recognised line updates the corresponding node's params in `graphStore`
- Unrecognised lines are left as comments and flagged with a yellow indicator

**Where to add it:**
- `utde-app/src/components/ScriptView/ScriptPanel.jsx` — new component, main code display
- `utde-app/src/components/ScriptView/graphToScript.js` — `graphToScript(nodes, edges)` → string
- `utde-app/src/store/uiStore.js` — add `"script"` as a valid view mode alongside `"3d"` and `"graph"`
- `utde-app/src/components/Header.jsx` — add `⟨/⟩ SCRIPT` toggle
- `utde-app/src/App.jsx` — render `ScriptPanel` when script view is active

**Key files to reference:**
- `utde-app/src/store/graphStore.js` — `getOrientNodes()`, topological order logic to reuse
- `utde-app/src/utils/codeGen.js` — existing `generatePythonCode()` as a starting point (covers strategy + orient rules already)
- `docs/node_graph_schema.md` — "Python script round-trip" section defines the expected serialisation format
- `templates/ded_5axis.py` — canonical example of the target output style

---

### 21. Script view — editable code with syntax highlighting and linting (NOT STARTED)

**Depends on:** TODO #20 (read-only Script view must be built first)

**What was requested:** Make the Script view interactive: the user can edit the generated Python code directly, and changes propagate back into `graphStore` in real time. Add syntax highlighting and Python linting/error reporting.

**Editing (code → graph):**
- Replace the read-only `<pre>` with a real code editor component — [CodeMirror 6](https://codemirror.net/) (`@uiw/react-codemirror`) is the recommended choice: lightweight, no server dependency, first-class React integration, and ships a Python language mode out of the box.
- On every keystroke (debounced ~300ms), run the script-to-graph parser from TODO #20 and apply any recognised changes to `graphStore`.
- Lines that can't be parsed back are marked with a yellow left-border gutter indicator; lines that caused a store update flash briefly to show the round-trip worked.
- The cursor position determines which node is selected in the Inspector panel (same as clicking a node in the graph view).

**Syntax highlighting:**
- Use CodeMirror's `@codemirror/lang-python` extension. Works entirely client-side — no language server needed.
- Theme should match the app's existing colour palette: `#1a1a2e` background, `#6355e0` keywords, `#16a34a` strings, `#d97706` numbers (a custom CodeMirror theme or a dark base theme like `okaidia` with palette overrides).

**Python linting / error indicators:**
- **Phase 1 (client-side, no server):** Use a simple regex/tokeniser pass to catch obvious structural errors — unclosed parentheses, unknown function names from the known primitive set (`FollowCurveStrategy`, `RasterFill`, `to_normal`, etc.). Show red underlines + tooltip.
- **Phase 2 (server-assisted):** Add a `/lint-script` endpoint to `step_server.py` that calls `py_compile.compile()` (or `ast.parse()`) on the submitted code and returns syntax errors. The frontend debounces and calls this endpoint; errors are shown as red gutter dots with messages on hover.
- Do not use `pylsp` or any background language server daemon — keep it simple and stateless.

**Execution from the script view:**
- Add a `▷ RUN` button at the top of the Script view (distinct from the node-graph "GENERATE TOOLPATH" button).
- Clicking `▷ RUN` sends the current editor content to the existing `/run-script` endpoint and streams stdout back into the bottom CodePanel (same mechanism as the existing "Preview Python Code" + run flow).
- If the script defines a `@process`-decorated function, the server should call it and return toolpath points, updating `toolpathStore` the same way the generate-toolpath flow does.

**Implementation notes:**
- Install: `npm install @uiw/react-codemirror @codemirror/lang-python` (add to `postCreateCommand` in `devcontainer.json` via `cd utde-app && npm install ...`).
- `ScriptPanel.jsx` wraps `<ReactCodeMirror>` with `extensions={[python()]}` and a custom theme.
- Keep the Inspector panel on the right (same 240px strip as in the node graph view) — it already handles the selected-node display.
- The editor's `onChange` callback is the entry point for the graph-update pipeline.

**Key files to add / modify:**
- `utde-app/src/components/ScriptView/ScriptPanel.jsx` — replace `<pre>` with `<ReactCodeMirror>`, wire `onChange` → parser → `graphStore`
- `utde-app/src/components/ScriptView/scriptToGraph.js` — `scriptToGraph(code, dispatch)` → parses code, calls `graphStore` actions for each recognised line
- `utde-app/src/components/ScriptView/codeTheme.js` — custom CodeMirror theme matching app palette
- `step_server.py` — add `POST /lint-script` endpoint (Phase 2)
- `devcontainer.json` — add `@uiw/react-codemirror @codemirror/lang-python` to `postCreateCommand` npm install

**Key files to reference:**
- `utde-app/src/components/ScriptView/graphToScript.js` (from TODO #20) — reverse of `scriptToGraph`
- `utde-app/src/store/graphStore.js` — all actions available for `scriptToGraph` to call
- `utde-app/src/components/NodeGraph/InspectorPanel.jsx` — reused unchanged in Script view

**Effort estimate:**

| Part | Effort |
|---|---|
| CodeMirror integration + custom theme | ~1 hr |
| `graphToScript` (TODO #20 dependency) | ~2 hrs |
| `scriptToGraph` regex parser | ~2–3 hrs |
| `/lint-script` endpoint | ~30 min |
| Wiring it all together | ~1 hr |

Total: ~half a day. The only non-trivial piece is `scriptToGraph`, but the format is constrained to ~5 patterns emitted by `graphToScript`, so line-by-line regex matching (not a full AST parser) is sufficient. Unrecognised lines get a yellow gutter marker and are skipped.

---

### 22. Geometry re-matching — stable selections across file revisions (NOT STARTED)

**What was requested:** Make it easy to re-run a pipeline when the source STEP file has changed slightly (new revision, minor geometry edit). Face and edge IDs are re-assigned on every tessellation, so stored `selected_face_ids`/`selected_edge_ids` in a node become stale the moment the file is reimported. The user should not have to manually reselect every time.

**The core problem:**
When a face is tessellated, it gets an ID (`face_0`, `face_17`, etc.) that is an artifact of OCC's tessellation order — not a stable geometric identity. A face that moved 2 mm in a revision gets a different ID. The user's pipeline is identical; only the face identity changed.

**Design: geometry fingerprinting**

Each selected face/edge gets a *fingerprint* stored alongside its ID at selection time:
```json
{
  "id": "face_17",
  "fingerprint": {
    "type": "plane",
    "centroid": [12.4, 0.0, 50.0],
    "area": 314.2,
    "normal": [0.0, 0.0, 1.0]
  }
}
```

On reimport (same or revised file), a **re-match pass** compares stored fingerprints against new faces:
- Exact match on type + normal + area within tolerance → confident rematch
- Close centroid + same type → probable rematch (flagged yellow, user confirms)
- No match within threshold → flagged red, user must repick

**Interaction design:**
- On file reimport, if a node has stored geometry, auto-run the re-match pass
- A "Geometry Conflicts" banner appears in the node graph if any node has unresolved faces/edges
- Clicking the banner opens a diff panel: left = old fingerprint preview, right = best candidate from new file, with a confidence score
- User accepts or overrides each conflict
- Fully matched selections are silently updated — no interaction needed
- "Accept all probable" button for common case (minor revision, all faces moved slightly)

**Named selections (follow-on):**
- Let the user assign a name to a geometry selection on a node: "top face", "weld seam", "outer contour"
- Named selections are saved in the session file and shown as a library in the sidebar
- On a new file, apply a named selection by running the re-match pass against its fingerprints
- Makes it trivial to run the same pipeline on a family of similar parts

**Watch mode (follow-on):**
- Monitor a file path for changes (`fs.watch` via Tauri or a polling endpoint)
- On change: reimport → re-match → if no conflicts, regenerate toolpath automatically
- If conflicts exist, notify the user rather than auto-generating with stale geometry
- Enables a tight CAD ↔ toolpath loop without manual re-import

**Implementation sketch:**

*Fingerprint capture (Python side, `/parse-step`):*
- Add a `fingerprints` array to the response alongside `faces`/`edges`
- For each face: `{ id, type, centroid: [x,y,z], area, normal: [nx,ny,nz] }`
- For each edge: `{ id, type, midpoint: [x,y,z], length, tangent: [tx,ty,tz] }`
- Uses OCC's `BRepGProp_FaceProperties` / `BRep_Tool` — all already available in `step_server.py`

*Fingerprint storage (JS side):*
- `graphStore.setNodeGeometry(nodeId, faceIds, edgeIds)` → also receives `fingerprints` map keyed by ID
- Store as `params.selected_face_fingerprints` / `params.selected_edge_fingerprints`

*Re-match pass (JS side, client-only):*
- `rematchGeometry(storedFingerprints, newFingerprints, tolerances)` → `{ matched, probable, unmatched }`
- Tolerances: centroid distance < 5 mm, area ratio within 5%, same type → confident
- `matchScore(a, b)` = weighted sum of centroid distance + area diff + normal angle

*UI components:*
- `GeometryConflictBanner.jsx` — appears at top of NodeGraphPanel when conflicts exist
- `GeometryDiffPanel.jsx` — side-by-side old/new fingerprint card with accept/reject
- Highlight unmatched faces in the 3D viewport with a distinct colour (red outline)

**Where to add it:**
- `step_server.py` — add fingerprint data to `/parse-step` response
- `utde-app/src/store/graphStore.js` — extend `setNodeGeometry` + `rematchNodeGeometry(nodeId, newFaces, newEdges)` action
- `utde-app/src/utils/geometryMatch.js` — `rematchGeometry()` + `matchScore()` pure functions
- `utde-app/src/components/NodeGraph/GeometryConflictBanner.jsx` — conflict count + "Review" button
- `utde-app/src/components/NodeGraph/GeometryDiffPanel.jsx` — per-conflict review UI
- `utde-app/src/store/stepStore.js` — fire re-match after `setGeometry()` if any nodes have stored geometry

**Key files to reference:**
- `utde-app/src/store/graphStore.js` — `setNodeGeometry`, `params.selected_face_ids`
- `step_server.py` — `/parse-step` endpoint, OCC tessellation loop
- `utde-app/src/components/viewport/StepViewport.jsx` — face highlight colours for conflict display

---

### 23. Tool geometry — load CAD models defining tool shape for toolpath simulation (NOT STARTED)

**What was requested:** Allow users to load CAD model files (e.g. STEP) that describe the physical geometry of the cutting/deposition tool. The toolpath simulation and 3D preview use the tool geometry mesh to animate the tool moving along the toolpath, enabling collision and clearance checks.

**Scope:**

*Tool library node (graph-level):*
- A new `ToolNode` type in the node graph representing a specific tool definition
- The node stores: tool name, CAD file path/content, tool axis offset (TCP — Tool Centre Point), and shank origin
- Connects downstream to a strategy node or orient node via a `Tool` typed port
- Multiple tool nodes can coexist (one per operation); the post processor node selects the active tool

*CAD import (browser + Tauri):*
- Same import pattern as `StepImportNode`: browser uses multipart upload, Tauri uses file path dialog
- Backend endpoint `POST /parse-step` already tessellates STEP files — reuse it, but tag the result as tool geometry
- Alternatively add a dedicated `POST /parse-tool` endpoint that also extracts the TCP offset from a named point or axis in the CAD model
- Store tessellated tool mesh in the node's `output` field: `{ faces, edges, fileName, tcp_offset: [x,y,z], shank_length }`

*3D viewport simulation:*
- When `showToolpaths` is true and a connected `ToolNode` has geometry, render the tool mesh at each toolpath point (or animate along the path)
- Tool mesh is transformed per-point: translate to `(x, y, z)` + rotate to align tool axis with `(nx, ny, nz)` orientation vector
- Use a `THREE.InstancedMesh` for performance when previewing large toolpaths (thousands of points)
- Fallback to a simple cone/cylinder proxy mesh when no tool geometry is loaded

*Collision/clearance check (follow-on):*
- After generating a toolpath, run a pass checking the tool mesh against the workpiece mesh at each point
- Flag points where tool body (not just TCP) intersects the workpiece
- Use `three-mesh-bvh` (already a tech target in CLAUDE.md) for BVH-accelerated intersection tests
- Display flagged points in the 3D view with a red highlight; list them in the inspector

**Design decisions to make before implementing:**
- Where does `ToolNode` sit in the graph? Options: (a) wired directly into the strategy node alongside geometry ports, (b) wired into the post-processor node, (c) a global "tool rack" outside the graph that nodes reference by name. Option (b) is cleanest — the post processor is the right place to bind machine + tool.
- What is the TCP coordinate convention? The tool axis should align with the orientation vector from the toolpath. The CAD model should be authored with the TCP at the origin and the tool axis along +Z — document this convention clearly.
- Does the simulation animate (scrub along path) or show all tool positions at once? Animated scrubbing is more useful for collision checking; static InstancedMesh is faster to render. Both modes are worth supporting.

**Where to add it:**
- `utde-app/src/store/graphStore.js` — add `makeToolNode()` factory, register in `addNode()`
- `utde-app/src/components/NodeGraph/nodes/ToolNode.jsx` — new node component (blue-grey colour distinct from geometry blue)
- `utde-app/src/components/NodeGraph/InspectorPanel.jsx` — `ToolInspector`: file name, TCP offset fields, preview mesh thumbnail
- `step_server.py` (or new `tool_server` route) — `/parse-tool` endpoint, optionally extracting TCP from named datum
- `utde-app/src/components/viewport/ToolMesh.jsx` — new Three.js component; renders tool at current animation position or as InstancedMesh along full path
- `utde-app/src/components/viewport/StepViewport.jsx` — mount `<ToolMesh />` when tool geometry + toolpath both exist
- `utde-app/src/store/toolpathStore.js` — store `toolNodeId` alongside each toolpath entry so the viewport knows which tool to render

**Key files to reference:**
- `utde-app/src/components/NodeGraph/nodes/StepImportNode.jsx` — same CAD import UX pattern to follow
- `utde-app/src/components/viewport/StepViewport.jsx` — existing Three.js mesh rendering
- `utde-app/src/store/toolpathStore.js` — `addToolpath`, animation state
- `utde-app/src/api/client.js` — `parseStep` / `parseStepByPath` to reuse or extend
- CLAUDE.md tech targets — `three-mesh-bvh` is already listed for collision detection

---
