# UTDE Codebase Review — Bugs, Architecture & Roadmap

_Review date: 2026-07-11. Scope: `utde_v0.1.0/toolpath_engine/`, `step_server.py`,
`utde-app/` (React/Zustand + Pyodide runtime), `src-tauri/`, CI, docs._

**Health check:** all tests pass — **316 Python** (`utde_v0.1.0/tests/`) and
**357 JS** (`utde-app`) — and the primitive/strategy/orient separation is clean
and well-documented. The problems below are mostly things the tests don't cover:
the seam between the toolpath model and the *posted G-code*, and drift between the
docs and the shipped app. Every item marked _(verified)_ was reproduced by running
the code in this repo.

Severity: 🔴 critical (wrong machine output / safety) · 🟠 moderate · 🟡 minor.

---

## Resolution status (all items addressed)

Every finding below has since been fixed on this branch, in the review's
suggested order, each with tests. Suite totals after the work: **413 Python**,
**363 JS**, all green.

| § | Fix | Where |
|---|---|---|
| §1 | Tool axis emitted as an `I/J/K` vector on rotary machines (`output_ijk`) | `post/processor.py`, `webapi.py` |
| §2 | Multi-op timeline assembled as one program (single header/`M30`/footer) | `webapi.compile_timeline`, `PostProcessor.process_body` |
| §3 | `flag_codes` split out of value words + `bool` guard (no mid-program `M30`) | `post/processor.py` |
| §4 | Freeform edges built via `Curve.from_points` (were silently dropped) | `webapi.build_geometry_dicts` |
| §5 | Tilt measured from the nearest vertical pole | `orient/rules.py`, `simulation/__init__.py` |
| §6 | Explicit `point_lines` map drives the Post-tab sync (heuristic fallback kept) | `webapi.py`, `lib/gcodeSync.js`, stores + viewport |
| §8 | IK warm-started from the previous point's solution | `post/processor.py`, `kinematics/machine.py` |
| §10 | `/run-script` opt-in only, CORS restricted, docstring corrected | `step_server.py` |
| §11 | `ToolpathCollection.__iadd__/__add__`, uniform template signatures, real `GeometryModel` lookups, template-registration import → the generated Python runs | `core/toolpath.py`, `core/geometry.py`, `templates/`, `lib/timelineToScript.js` |
| §14 | Architecture section, store list, and dev commands realigned | `CLAUDE.md` |
| §13 (Step 0) | Picked-but-unresolved geometry warns + skips (no phantom-plane path) | `webapi.compile_timeline` |
| §13 (Step 1) | Mesh-backed `Surface` (KD-tree closest-point + normals) → `to_normal`/`pocket` work on freeform faces; `raster_fill` guards against mesh | `core/geometry.py`, `webapi.py`, `strategies/raster_fill.py` |

Remaining as noted-only (larger efforts, scheduled deliberately): §13 **Step 2**
(kernel-sampled UV grid — unblocks area-fill on NURBS and fixes the normal sign;
design note in the §13 section), §12's deeper cleanup (prune the unused Flask HTTP
surface), the analytic-IK upgrade behind §8's warm-start, and the runtime CDN
dependency in §12.

---

## 1. 🔴 5-axis orientation is computed but never reaches the G-code _(verified)_

The headline capability — surface-normal / lead / tilt orientation producing
multi-axis G-code — does not make it into the output. Orientation lives only in
the viewport and the serialized `nx/ny/nz` points.

Both `webapi.generate_toolpath` and `webapi.compile_timeline` post with
`resolve_ik=False`:

```python
# webapi.py  (generate_toolpath ~L535, compile_timeline ~L725)
post = PostProcessor(machine_obj)
gcode = post.process(paths, resolve_ik=False)
```

With `resolve_ik=False`, `PostProcessor._process_point` emits only X/Y/Z plus any
`A/B/C` **found in `point.process_params`** (`processor.py:160-170`). But strategies
and orient rules write the tool axis to `point.orientation`, never to
`process_params`, so the rotary axes are silently dropped.

Reproduction — DED helical on a cylinder (applies `to_normal → lead →
avoid_collision`):

```
point[10] computed tool axis: nx=0.354 ny=0.612 nz=0.707  (tilted ~45°)
G-code contains any A word?  False
G-code contains any C word?  False
```

The `resolve_ik=True` branch exists but is never exercised by the app; even if it
were, see §8 (per-point IK is slow and non-continuous).

**Fix direction:** the post-processor needs an orientation→axis path that runs by
default. Two options:
- **TCP/IJK output:** when the machine has rotary axes and the controller supports
  it, emit the tool vector (`I/J/K` with `output_ijk`, already a `PostConfig` flag)
  so orientation survives without IK. Wire `output_ijk` into `_process_point` (it is
  currently defined but unused).
- **IK by default** with continuity (seed each solve from the previous joint
  solution — see §8), gated on `machine._has_rotary_axes()`.

Until this is fixed, describe the G-code output as 3-axis regardless of the
orientation chain.

---

## 2. 🔴 Multi-op timeline G-code repeats the whole program per op (M30 after op 1) _(verified)_

`compile_timeline` builds per-op G-code by calling `post.process(chunk)` once per
op (`webapi.py:720-730`). `PostProcessor.process` always writes a full header
(`%`, `O1000`, safe-start, TCP-on) and a full footer (`M5 … G28 G91 Z0 M30 %`).
So an N-op program contains N program headers and **N `M30` program-ends**.

Reproduction — a 2-op timeline:

```
count of 'M30' (program-end) in whole program: 2
count of '%' program markers: 4
count of 'O1000' program headers: 2
```

On a real controller the program **halts after op 1**. This is the app's primary
authoring surface (the timeline), so it affects the main path.

**Fix:** generate one program. Add a "body-only" mode to `PostProcessor`
(`process_body(collection)` that skips header/footer), emit the `(--- OP nn ---)`
dividers between bodies, and write a single header/footer around the whole thing.
Compute `gcode_start_line`/`gcode_end_line` against that single stream.

---

## 3. 🔴 Boolean/toggle process params corrupt M-codes — `spindle_on_cw=False` emits mid-program `M30` _(verified)_

`PostConfig.param_codes` mixes two incompatible kinds of mapping:
value-words (`spindle_speed→S`, `extrusion_rate→E`) and standalone toggles
(`spindle_on_cw→M3`, `coolant_on→M8`). `_process_point` treats them all as
value-words (`processor.py:202-208`):

```python
if isinstance(val, (int, float)):        # bool IS an int in Python
    parts.append(f"{gcode_letter}{val:.0f}")
```

So `spindle_on_cw=True` → `M3` + `1` = **`M31`**, and `spindle_on_cw=False` → `M3` +
`0` = **`M30` (program end)** emitted mid-program:

```
gcode line: 'G1 X0.000 Y0.000 Z0.000 F500 M31'
gcode line: 'G1 X10.000 M30'     # <-- program end injected in the middle
```

**Fix:** split the config into `word_codes` (S/E/…: emit letter+value) and
`flag_codes` (M3/M4/M8/M9: emit the bare code when the param is truthy, and its
paired "off" code when falsy). Never format a `bool` through `:.0f`.

---

## 4. 🟠 `Curve.spline()` doesn't exist → spline/bezier/ellipse/polyline edges are silently dropped _(verified)_

`webapi.build_geometry_dicts` builds curves for `line` and `circle` edges, and for
everything else falls through to:

```python
elif edge.get("vertices"):
    curves[eid] = Curve.spline(control_points=pts, num_points=max(50, len(pts)))
```

`Curve` defines `from_points`, `line`, `circle`, `helix` — **no `spline`**. The call
raises `AttributeError`, which the surrounding `except Exception: pass` swallows, so
the edge just disappears.

```
Curve has 'spline'?  False
curves produced for a bspline edge: {}   # edge lost
```

Effect: `follow_curve` / `contour_parallel` on any freeform edge produce nothing,
and the user gets "requires at least one edge" with no explanation.

**Fix:** use the existing `Curve.from_points(pts)` (the vertices are already a dense
polyline from the tessellator). Also, **narrow the `except`** here and elsewhere —
bare `except Exception: pass` around geometry construction is what let this ship.

---

## 5. 🔴 `avoid_collision` measures tilt from +Z but the tool home is −Z → it flips near-vertical tools _(verified)_

`orient/rules.py:avoid_collision` clamps `tool_axis.angle_to((0,0,1))` against
`max_tilt`. But the documented tool convention and the 3-axis defaults
(`Orientation.z_down()` / `fixed(0,0,-1)`) point **−Z**. A tool tilted 6° off
straight-down is ~174° from +Z, so it is treated as a gross violation:

```
input: 6° off straight-DOWN (a sensible near-3-axis tool)
avoid_collision(max_tilt=20) REWROTE it to Vector3(0.342, 0, 0.940)
   -> now 160° off straight-down    # yanked ~150°, effectively flipped to point up
```

It only behaves for orientations that already point roughly +Z (e.g. the outward
normal of a top face). `CollisionChecker.step` (`simulation/__init__.py`) has the
same +Z assumption.

**Fix:** measure tilt against a **reference tool axis** (the machine's spindle home,
or the first point's orientation), not a hard-coded +Z. Pass the reference in, or
default it to the negated Z-down home so a straight 3-axis tool reads as 0° tilt.

---

## 6. 🟠 Post-tab line ↔ point sync drifts on suppressed and Z-bearing lines _(verified)_

`gcodeSync.buildLineToPointMap` assumes **exactly one motion line per point, in
order**. Two things break that invariant:

1. **Modal suppression.** A point that repeats the previous position and feed makes
   `_process_point` return `""` (`processor.py:210-212`) — no line for that point.
   4 points with one duplicate → 3 motion lines. Every later point in the op maps to
   the wrong line, so Post-tab click-to-select and the simulation cursor land on the
   wrong point.
2. **False positives.** `isMotionLine` counts any line carrying an X/Y/Z token, so a
   footer like `G28 G91 Z0` (present in every op body — see §2) is counted as a
   motion line.

**Fix:** stop inferring the mapping from text. Have the post-processor emit an
explicit point-index → line-number table alongside the G-code (it knows exactly
which line each point produced), and drive the sync from that. This also removes the
"one line per point" fragility for good.

---

## 7. 🟠 `step_server` deletes the STEP temp file it records as `_LAST_MODEL_PATH` _(verified by reading)_

`/parse-step` saves the upload to a `NamedTemporaryFile(delete=False)`, sets
`_LAST_MODEL_PATH = tmp_path`, then unconditionally unlinks it in `finally`
(`step_server.py:513-572`). So the path used for whole-model slicing (`__model__` →
`prusaslicer`) always points at a **deleted** file when the model came in via browser
upload; slicing silently falls back to stub G-code. Only `/parse-step-path` (Tauri,
real on-disk path) keeps a valid path.

**Fix:** if `__model__` slicing is meant to work from uploads, persist the upload in
a session-scoped location and clean it up on session end / LRU, rather than deleting
it in the parse handler's `finally`.

---

## 8. 🟠 Inverse kinematics runs per-point with no seeding — slow and discontinuous

`Machine.inverse_kinematics` is called independently at every point with
`initial_guess=None`, so `x0` is the home pose every time (`machine.py:203-209`), and
`scipy.optimize.minimize(..., options={"maxiter": 500})` runs from scratch per point.

- **Cost:** O(500 · N) objective evals; a few-thousand-point path is seconds-to-minutes.
- **Continuity:** independent solves give no rotary continuity — a rotary axis can
  wind ±360° or flip sign between adjacent points, which is unsafe to run even though
  each point is individually "correct."

This is latent today only because the app never takes the `resolve_ik=True` path
(§1) — but any real multi-axis posting will hit it.

**Fix:** thread the previous point's solution in as `initial_guess`; add a small
continuity penalty (‖x − x_prev‖) to the objective; prefer analytic IK for the
built-in 5-axis AC/BC kinematics (closed-form, no optimizer) and keep the numerical
solver as the fallback for arbitrary chains.

---

## 9. 🟡 Packaging: `utde` console entry point references a module that doesn't exist _(verified)_

`setup.py` declares `entry_points={"console_scripts": ["utde=toolpath_engine.cli:main"]}`
but there is no `toolpath_engine/cli.py`. Install succeeds; running `utde` raises
`ModuleNotFoundError`.

**Fix:** add a minimal `cli.py` (`main()`), or drop the entry point until there's a
CLI. (Separately, the Debian system-setuptools `install_layout` error seen locally on
`pip install -e` is environment-specific, not a repo bug — CI's clean setuptools is
fine.)

---

## 10. 🟠 Security: `/run-script` is unauthenticated code execution (and the docstring calls it "sandboxed")

`step_server.py:/run-script` runs arbitrary user Python via `subprocess.run([python,
script])`. The only guardrails are a 30 s timeout and a temp CWD — **no sandbox**: it
inherits the server's user, environment, filesystem and network. The docstring
("sandboxed subprocess") overstates this.

Concrete exposure:
- **Dev server + CORS `*`.** `_apply_cors(origins="*")` means any web page the
  developer visits can `POST http://localhost:5174/run-script` and execute Python on
  their machine.
- **Static-serving / container mode.** `_enable_static_serving` + `--host 0.0.0.0`
  (both supported, see `UTDE_HOST`, `UTDE_STATIC_DIR`) turns this into
  unauthenticated remote code execution.

The **browser/Pyodide** `run_script` is genuinely sandboxed (the user's own tab), so
this is a *server-path* concern.

**Fix / awareness:** don't bind the script-runner beyond localhost without auth;
restrict CORS to the known dev origin; if server-side scripting must be exposed,
run it in a real sandbox (separate uid + seccomp/nsjail, no network, read-only FS).
Fix the docstring so nobody trusts the current isolation.

---

## 11. 🟠 Architecture: the "one representation, two views" invariant is violated — the generated Python doesn't run

`timelineToScript` renders the timeline as Python, but that Python is not executable
against the real API — which contradicts the project's own "every node maps to one
Python API call, the script round-trips" principle:

- `combined += op` — `ToolpathCollection` defines no `__add__`/`__iadd__`.
- `get_process(id)(model=…, geometry=…, params=…)` — several templates (e.g.
  `ded_helical(model, params)`) take no `geometry` kwarg → `TypeError`.
- `to_normal(model.face_by_id(...))` / `model.top_surface()` — `GeometryModel` has
  neither method.

**Fix:** either make the emitted code real (add `ToolpathCollection.__iadd__`,
give every template the uniform `(model, geometry, params)` signature that
`compile_timeline` already assumes, add the `GeometryModel` lookups the script
references) or clearly mark the panel as pseudocode. Given the stated design
principle, making it real is the right call — and it would let the Script tab
actually run a timeline export end-to-end.

---

## 12. 🟠 Two backends, duplicated logic, and a hard CDN dependency

- **Duplication.** `step_server.parse_step` and `parse_step_from_path` are ~50 lines
  of near-identical tessellation-loop code; factor the shared body into one helper
  (`_tessellate_shape(shape)`). The pure request logic is already nicely centralized
  in `webapi.py` — the two parse handlers are the remaining copy.
- **Two runtimes to keep in lockstep.** Flask server vs. in-browser Pyodide both call
  `webapi`, which is good — but the Flask layer still carries endpoints
  (`/generate-toolpath`, `/compile-timeline`) that the browser app no longer uses via
  HTTP. Decide whether the Flask server is still a supported surface or just the Tauri
  sidecar / dev tool, and prune accordingly.
- **Runtime CDN dependency.** `pyodide/client.js` boots from
  `https://cdn.jsdelivr.net/pyodide/v0.26.2/full/` and loads numpy/scipy from the
  CDN. For an app that presents itself as client-side (and ships a PWA config), this
  means no offline use and a third-party runtime dependency on every load. If offline
  is a goal, self-host the Pyodide + wheel assets; if not, say so.

---

## 13. 🟡 Geometry model is analytic-only; real CAD is meshes

`core/geometry.Surface` supported plane/cylinder/sphere analytically;
`build_geometry_dicts` only reconstructed those three from STEP params, so cone,
torus, and NURBS faces never became a usable `Surface`. That produced two bad
outcomes: a confusing *"requires a face"* error on the single-strategy path, and —
worse — a **silent phantom-plane toolpath** on the timeline path, because the
templates fall back to a synthetic 100 mm plane at the origin when a slot has no
geometry. So picking a curved face machined an invisible flat plane with no signal.

**Delivered here (Step 0 + Step 1):**

- **Step 0 — no more silent wrong output.** `compile_timeline` now detects a
  picked-but-unresolved geometry id, warns, and skips the op when nothing the user
  picked resolved — instead of running it on a placeholder surface.
- **Step 1 — mesh-backed `Surface`.** Any face without an analytic reconstruction
  now becomes a `Surface.mesh(...)` from its tessellation. It implements
  `closest_point` and `normal_at_closest` via a `scipy.spatial.cKDTree` over the
  vertices plus an exact closest-point-on-triangle refine, with area-weighted,
  barycentric-blended vertex normals. This makes **`to_normal` (and boundary-based
  ops like `pocket`) work on freeform faces** — i.e. the §1 5-axis orientation now
  applies to imported CAD, not just analytic primitives. `raster_fill` guards
  against mesh surfaces (its UV sweep has no meaning on a mesh) and fails loudly.

**Known caveat (drives Step 2):** the mesh normal's *sign* follows the tessellation
winding. OCC winds forward faces outward, but a reversed face can yield an inward
normal (tool axis into the material). It is geometrically correct up to sign.

**Step 2 (not done — schedule deliberately): kernel-sampled UV grid.** To unblock
`raster_fill`/area-fill on NURBS *and* fix the normal sign, sample each face's real
`(u,v)` grid of `(position, normal)` from the OCC kernel at parse time and ship it
alongside the mesh. `Surface.evaluate/normal_at` then bilinearly interpolate the
grid, so the existing UV-based strategies work uniformly on every face type with no
strategy rewrite, and normals come from the kernel (correct sign). Costs: larger
per-face payload (make it adaptive to curvature) and interpolation error between
samples. This is the right long-term shape and keeps the engine kernel-free — do it
when area-fill on freeform faces is actually needed, not as a stopgap. Note:
`three-mesh-bvh` is JS (viewport-side only); the Python/Pyodide engine relies on
scipy, not `trimesh`, which isn't guaranteed in Pyodide.

---

## 14. 🟡 Documentation drift — `CLAUDE.md` describes an app that no longer exists _(verified)_

The Architecture section is stale enough to mislead:

| `CLAUDE.md` says | Reality |
|---|---|
| Stores: `stepStore`, `strategyStore`, `toolpathStore`, `uiStore` | `machineStore, opsStore, runtimeStore, stepStore, toolpathStore, uiStore` — **no `strategyStore`** |
| "The sidebar (`components/sidebar/`) renders panels" | No `sidebar/`; UI is tabbed `setup/ post/ simulate/ viewport/` |
| "Two-mode UI: STEP Import + Toolpath" | Timeline-driven Setup / Post / Simulate tabs |
| "React Frontend connected to Flask via `api/client.js`" | `api/client.js` delegates to an **in-browser Pyodide runtime**; no HTTP in the browser build |
| `cd /workspaces/files && pytest …` | Repo lives at the container root; path is devcontainer-specific |

Because `CLAUDE.md` is the canonical guidance doc, this drift actively misdirects
future work. Refresh it to the timeline + Pyodide-runtime architecture.

---

## What's solid (keep doing this)

- **Test coverage is genuinely good** — 316 Python + 357 JS, all green, including the
  fiddly geometry/clipping and sync helpers. That's what made this review fast.
- **`webapi.py` as a pure, host-injected core** shared by Flask and Pyodide is the
  right shape — keep new logic there, not in the Flask handlers.
- **Primitive / strategy / orient-rule separation** is clean and the design-principle
  doc is a real asset. The bugs above are integration-seam and convention issues, not
  structural rot.

## Suggested order of attack

1. **§3 and §2** — they emit actively dangerous G-code (mid-program `M30`); small, local fixes.
2. **§1 / §8** — decide the orientation→output story (TCP-IJK now, analytic IK next); it's the core promise.
3. **§4, §5, §6** — correctness bugs with narrow fixes and clear tests.
4. **§10** — lock down `/run-script` before anything is hosted.
5. **§14 / §11** — realign the docs and the generated-script with the shipped app.
