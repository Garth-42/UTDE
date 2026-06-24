"""Pure-Python web API core for UTDE.

This module holds the request-handling *logic* for the toolpath endpoints in a
form that has **no dependency on Flask, the filesystem, or any server runtime**.
Every function takes a plain ``dict`` (the JSON request body) and returns a
plain ``dict`` (the JSON response body), raising :class:`WebApiError` for
client/library errors that map to a non-200 status.

It is the single source of truth shared by two callers:

* ``step_server.py`` — thin Flask wrappers that parse the request, call into
  here, and ``jsonify`` the result (kept as a local dev/test convenience).
* The browser build via **Pyodide** — JS marshals the same dict payloads to
  these functions so the entire toolpath pipeline runs client-side with no
  server.

Anything that genuinely needs the host (reading machine YAML files off disk,
the last-parsed STEP path, subprocess execution) is injected by the caller as a
parameter, never reached for directly here.
"""

from __future__ import annotations


def _ensure_templates_loaded():
    """Import the built-in templates so their @process decorators register them.

    The Flask server does this at module load; the browser/Pyodide path and
    direct callers rely on this being idempotently ensured here so the process
    registry (used by list_templates / compile_timeline) is populated.
    """
    import toolpath_engine.templates  # noqa: F401  (import-for-side-effect)


class WebApiError(Exception):
    """A client/library error that maps to an HTTP status when served over Flask.

    Carries a ``status`` so the Flask wrapper can reproduce the original
    response codes; in the browser it is just a normal exception.
    """

    def __init__(self, message, status=400):
        super().__init__(message)
        self.status = status


# ── Mesh boundary loops ──────────────────────────────────────────────────────

def extract_all_boundary_loops(vertices_flat, indices_flat):
    """
    Return all boundary loops of a triangle mesh as a list of loops, where each
    loop is a list of (x,y,z) tuples.  Boundary edges are those shared by only
    one triangle.  Multiple disconnected loops occur when the face has holes.
    The first element of the returned list is the outer (largest-area) loop;
    subsequent elements are interior hole loops.
    """
    if not vertices_flat or not indices_flat:
        return []

    verts = [
        (vertices_flat[i], vertices_flat[i + 1], vertices_flat[i + 2])
        for i in range(0, len(vertices_flat), 3)
    ]

    edge_count = {}
    for i in range(0, len(indices_flat), 3):
        a, b, c = indices_flat[i], indices_flat[i + 1], indices_flat[i + 2]
        for e in ((min(a, b), max(a, b)), (min(b, c), max(b, c)), (min(a, c), max(a, c))):
            edge_count[e] = edge_count.get(e, 0) + 1

    boundary_edges = {e for e, cnt in edge_count.items() if cnt == 1}
    if not boundary_edges:
        return []

    adj = {}
    for a, b in boundary_edges:
        adj.setdefault(a, []).append(b)
        adj.setdefault(b, []).append(a)

    # Walk all disconnected loops
    unvisited = set(adj)
    loops = []
    while unvisited:
        start = next(iter(unvisited))
        loop = [start]
        unvisited.discard(start)
        prev, current = None, start
        for _ in range(len(adj)):
            neighbors = [n for n in adj[current] if n != prev]
            if not neighbors:
                break
            nxt = neighbors[0]
            if nxt == start:
                break
            loop.append(nxt)
            unvisited.discard(nxt)
            prev, current = current, nxt
        loops.append([verts[i] for i in loop])

    if not loops:
        return []

    # Outer loop = largest signed-area polygon (projected onto XY plane as proxy)
    def _signed_area_xy(loop):
        n = len(loop)
        a = 0.0
        for i in range(n):
            x1, y1 = loop[i][0], loop[i][1]
            x2, y2 = loop[(i + 1) % n][0], loop[(i + 1) % n][1]
            a += x1 * y2 - x2 * y1
        return abs(a) / 2.0

    loops.sort(key=_signed_area_xy, reverse=True)
    return loops


# ── Geometry construction ────────────────────────────────────────────────────

def build_geometry_dicts(selected_faces, selected_edges):
    """Construct ``{face_id: Surface}`` and ``{edge_id: Curve}`` dicts from the
    parsed-STEP JSON shape.

    Surfaces gain:
      * ``boundary_loop`` — outer boundary inferred from mesh topology
        (largest boundary loop of the triangulation).
      * ``interior_loops`` — hole loops read from the face's ``inner_loops``
        (authoritative OCC wire topology captured at parse time).

    This is the single geometry builder shared by ``generate_toolpath`` and
    ``compile_timeline``.
    """
    from toolpath_engine.core.geometry import Curve, Surface

    surfaces = {}
    for face in selected_faces:
        p = face.get("params", {})
        ftype = face.get("type")
        fid = face.get("id")
        try:
            if ftype == "cylinder" and "center" in p and "radius" in p:
                surfaces[fid] = Surface.cylinder(
                    center=tuple(p["center"]),
                    axis=tuple(p.get("axis", [0, 0, 1])),
                    radius=p["radius"],
                    height=p.get("height") or 100.0,
                    name=f"face_{fid}",
                )
            elif ftype == "plane" and "origin" in p and "normal" in p:
                surfaces[fid] = Surface.plane(
                    origin=tuple(p["origin"]),
                    normal=tuple(p["normal"]),
                    name=f"face_{fid}",
                )
            elif ftype == "sphere" and "center" in p and "radius" in p:
                surfaces[fid] = Surface.sphere(
                    center=tuple(p["center"]),
                    radius=p["radius"],
                    name=f"face_{fid}",
                )
        except Exception:
            pass

    # Attach boundary loops so raster fill can clip to the actual surface edge.
    # Outer boundary: inferred from mesh topology (boundary edges).
    # Inner loops (holes): read directly from OCC wire topology extracted during
    # parse-step — this is authoritative; the mesh-topology fallback is unreliable.
    for face in selected_faces:
        fid = face.get("id")
        if fid in surfaces:
            all_loops = extract_all_boundary_loops(
                face.get("vertices", []),
                face.get("indices", []),
            )
            if all_loops:
                surfaces[fid].boundary_loop = all_loops[0]
            inner_loops = face.get("inner_loops")
            if inner_loops:
                surfaces[fid].interior_loops = [
                    [tuple(pt) for pt in loop] for loop in inner_loops
                ]

    curves = {}
    for edge in selected_edges:
        p = edge.get("params", {})
        etype = edge.get("type")
        eid = edge.get("id")
        try:
            if etype == "circle" and "center" in p and "radius" in p:
                curves[eid] = Curve.circle(
                    center=tuple(p["center"]),
                    radius=p["radius"],
                    num_points=64,
                )
            elif etype == "line" and "start" in p and "end" in p:
                curves[eid] = Curve.line(
                    start=tuple(p["start"]),
                    end=tuple(p["end"]),
                    num_points=50,
                )
            elif edge.get("vertices"):
                verts = edge["vertices"]
                pts = [(verts[i], verts[i + 1], verts[i + 2])
                       for i in range(0, len(verts), 3)]
                if len(pts) >= 2:
                    curves[eid] = Curve.spline(
                        control_points=pts,
                        num_points=max(50, len(pts)),
                    )
        except Exception:
            pass

    return surfaces, curves


# ── Machine resolution ───────────────────────────────────────────────────────

def resolve_machine(machine_id, MachineCls, machine_resolver=None):
    """Resolve a request ``machine`` field to a Machine instance.

    Order:
      1. ``machine_resolver(machine_id)`` — host-provided hook (e.g. the Flask
         server loads ``machines/<id>.yaml``; the browser maps a bundled YAML
         text). May return ``None`` to decline.
      2. A ``Machine.<id>()`` classmethod factory.
      3. The ``gantry_5axis_ac`` factory as a default.
    """
    if machine_id and machine_resolver is not None:
        try:
            resolved = machine_resolver(machine_id)
        except Exception:
            resolved = None
        if resolved is not None:
            return resolved

    if machine_id:
        factory = getattr(MachineCls, machine_id, None)
        if callable(factory):
            try:
                return factory()
            except Exception:
                pass

    return MachineCls.gantry_5axis_ac()


def build_orient_callable(rule_cfg, surface_for_to_normal=None, machine_obj=None):
    """Map a JSON orient rule config to a Python orient callable. Returns
    None if the rule type is unsupported in the current context (e.g.
    to_normal with no surface). Used by compile_timeline."""
    from toolpath_engine.orient import (
        to_normal, fixed, lead, lag, side_tilt, avoid_collision,
    )

    t = rule_cfg.get("type") or rule_cfg.get("rule")
    if t == "fixed":
        # Front-end uses x/y/z; legacy generate_toolpath uses i/j/k.
        i = rule_cfg.get("x", rule_cfg.get("i", 0))
        j = rule_cfg.get("y", rule_cfg.get("j", 0))
        k = rule_cfg.get("z", rule_cfg.get("k", -1))
        return fixed(i, j, k)
    if t == "lead":
        return lead(float(rule_cfg.get("angle", rule_cfg.get("angle_deg", 10))))
    if t == "lag":
        return lag(float(rule_cfg.get("angle", rule_cfg.get("angle_deg", 5))))
    if t == "side_tilt":
        return side_tilt(float(rule_cfg.get("angle", rule_cfg.get("angle_deg", 5))))
    if t == "to_normal":
        if surface_for_to_normal is not None:
            return to_normal(surface_for_to_normal)
        return None
    if t == "avoid_collision":
        return avoid_collision(machine_obj, max_tilt=float(rule_cfg.get("max_tilt", 20)))
    return None


# ── Machine summary ──────────────────────────────────────────────────────────

def summarize_machine(yaml_text, machine_id, path=None):
    """Return a UI-friendly summary of a machine YAML string.

    Pure (no filesystem): the caller supplies the YAML text, an id, and an
    optional display ``path``. On parse failure returns an ``error`` record
    that still carries id/name/path so the UI can show the entry.
    """
    import yaml as _yaml
    try:
        data = _yaml.safe_load(yaml_text) or {}
        tool = data.get("tool_chain") or []
        wp = data.get("workpiece_chain") or []
        return {
            "id": machine_id,
            "name": data.get("name") or machine_id,
            "path": path,
            "tool_axes": [j.get("name") for j in tool],
            "workpiece_axes": [j.get("name") for j in wp],
            "axis_count": len(tool) + len(wp),
            "description": data.get("description"),
        }
    except Exception as exc:                             # pragma: no cover — diagnostic
        return {
            "id": machine_id,
            "name": machine_id,
            "path": path,
            "error": str(exc),
        }


# ── Templates ────────────────────────────────────────────────────────────────

def list_templates():
    """Return ``{"templates": [...]}`` — UI metadata for registered processes."""
    _ensure_templates_loaded()
    from toolpath_engine import list_processes
    return {"templates": list_processes()}


# ── Lint ─────────────────────────────────────────────────────────────────────

def lint_script(code):
    """Stateless Python syntax check using ``ast.parse()``.

    Returns ``{"errors": [{line, col, message}]}`` (line/col 0-indexed for
    CodeMirror). Never raises for ordinary syntax errors.
    """
    import ast
    if not (code or "").strip():
        return {"errors": []}
    try:
        ast.parse(code)
        return {"errors": []}
    except SyntaxError as e:
        return {"errors": [{
            "line": (e.lineno or 1) - 1,   # 0-indexed for CodeMirror
            "col": (e.offset or 1) - 1,
            "message": e.msg,
        }]}
    except Exception as e:
        return {"errors": [{"line": 0, "col": 0, "message": str(e)}]}


# ── Run script (in-process) ──────────────────────────────────────────────────

def run_script(code):
    """Execute a UTDE Python script **in-process** and capture its output.

    This is the browser/Pyodide counterpart to the Flask server's subprocess
    runner: there is no separate process in WASM, so the script runs in this
    interpreter with stdout/stderr captured and a scratch working directory for
    any G-code (``.nc`` / ``.gcode``) it writes. Returns
    ``{success, stdout, stderr, gcode}``.

    Safe in the browser (sandboxed to the user's own tab); the server keeps its
    isolated subprocess implementation.
    """
    import io
    import os
    import tempfile
    import contextlib
    import traceback

    if not (code or "").strip():
        return {"success": False, "stdout": "", "stderr": "No code provided", "gcode": None}

    out, err = io.StringIO(), io.StringIO()
    gcode = None
    prev_cwd = os.getcwd()
    tmpdir = tempfile.mkdtemp(prefix="utde_script_")
    success = True
    try:
        os.chdir(tmpdir)
        ns = {"__name__": "__main__", "__builtins__": __builtins__}
        with contextlib.redirect_stdout(out), contextlib.redirect_stderr(err):
            try:
                exec(compile(code, "<script>", "exec"), ns)
            except SystemExit:
                pass
            except BaseException:
                success = False
                err.write(traceback.format_exc())
        # Capture any G-code the script wrote to the scratch dir.
        try:
            for fname in os.listdir(tmpdir):
                if fname.endswith((".nc", ".gcode")):
                    with open(os.path.join(tmpdir, fname)) as gf:
                        gcode = gf.read()
                    break
        except Exception:
            pass
    finally:
        try:
            os.chdir(prev_cwd)
        except Exception:
            pass

    return {
        "success": success,
        "stdout": out.getvalue()[-8000:],
        "stderr": err.getvalue()[-4000:],
        "gcode": gcode,
    }


# ── Generate toolpath ────────────────────────────────────────────────────────

def generate_toolpath(payload):
    """Generate a single toolpath from selected face/edge geometry + strategy.

    Returns ``{"points", "point_count", "gcode"}``. Raises :class:`WebApiError`
    (status 400) when no toolpath can be generated.
    """
    selected_faces = payload.get("faces", [])
    selected_edges = payload.get("edges", [])
    strategy_cfg = payload.get("strategy", {})
    orientation_cfg = payload.get("orientation", [])
    machine_preset = payload.get("machine", "gantry_5axis_ac")
    workspace_origin = payload.get("workspace_origin")
    post_processor_type = payload.get("post_processor", "default")
    debug_format = payload.get("post_processor_format", "text")

    from toolpath_engine.strategies import (
        FollowCurveStrategy, RasterFillStrategy, ContourParallelStrategy,
    )
    from toolpath_engine.orient import to_normal, fixed, lead, lag, avoid_collision
    from toolpath_engine.kinematics import Machine
    from toolpath_engine.post import PostProcessor, DebugPostProcessor

    surfaces, curves = build_geometry_dicts(selected_faces, selected_edges)

    # Strategy — frontend sends "strategy_type" (not "type")
    stype = strategy_cfg.get("strategy_type") or strategy_cfg.get("type", "follow_curve")
    feed_rate = float(strategy_cfg.get("feed_rate", 600))
    paths = None
    gen_error = None

    try:
        if stype == "follow_curve":
            if not curves:
                gen_error = f"follow_curve requires at least one edge — {len(curves)} edges received"
            else:
                paths = FollowCurveStrategy().generate(
                    curves=list(curves.values()),
                    feed_rate=feed_rate,
                    spacing=float(strategy_cfg.get("spacing", 1.0)),
                    path_type=strategy_cfg.get("path_type", "deposit"),
                    chain=bool(strategy_cfg.get("chain", False)),
                    normal_offset=float(strategy_cfg.get("normal_offset", 0.0)),
                    inset=float(strategy_cfg.get("edge_inset", 0.0)),
                )
        elif stype == "raster_fill":
            raster_kwargs = dict(
                spacing=float(strategy_cfg.get("spacing", 3.0)),
                angle=float(strategy_cfg.get("angle", 0.0)),
                feed_rate=feed_rate,
                normal_offset=float(strategy_cfg.get("normal_offset", 0.0)),
                edge_inset=float(strategy_cfg.get("edge_inset", 0.0)),
                respect_interior_boundaries=bool(strategy_cfg.get("respect_interior_boundaries", True)),
            )
            if strategy_cfg.get("chord_tolerance") is not None:
                raster_kwargs["chord_tolerance"] = float(strategy_cfg["chord_tolerance"])
            if strategy_cfg.get("scallop_height") is not None:
                raster_kwargs["scallop_height"] = float(strategy_cfg["scallop_height"])
            if surfaces:
                surface = next(iter(surfaces.values()))
                paths = RasterFillStrategy().generate(surface=surface, **raster_kwargs)
            elif curves:
                paths = RasterFillStrategy().generate(curves=list(curves.values()), **raster_kwargs)
            else:
                gen_error = "raster_fill requires at least one face or a closed edge loop"
        elif stype == "contour_parallel":
            if not curves:
                gen_error = "contour_parallel requires at least one edge as boundary"
            else:
                paths = ContourParallelStrategy().generate(
                    boundaries=list(curves.values()),
                    stepover=float(strategy_cfg.get("stepover", 3.0)),
                    num_passes=int(strategy_cfg.get("num_passes", 4)),
                    feed_rate=feed_rate,
                    chain=bool(strategy_cfg.get("chain", True)),
                    normal_offset=float(strategy_cfg.get("normal_offset", 0.0)),
                    inset=float(strategy_cfg.get("edge_inset", 0.0)),
                )
        else:
            gen_error = f"Unknown strategy type: '{stype}'"
    except Exception as strat_exc:
        gen_error = f"{stype} generation error: {strat_exc}"

    if paths is None:
        detail = gen_error or f"strategy='{stype}', faces={len(surfaces)}, edges={len(curves)}"
        raise WebApiError(f"Could not generate toolpath — {detail}", 400)

    # Orientation rules
    for rule_cfg in orientation_cfg:
        rule_name = rule_cfg.get("rule")
        if rule_name == "to_normal":
            sid = rule_cfg.get("surface_id")
            if sid in surfaces:
                paths.orient(to_normal(surfaces[sid]))
        elif rule_name == "fixed":
            paths.orient(fixed(
                rule_cfg.get("i", 0),
                rule_cfg.get("j", 0),
                rule_cfg.get("k", -1),
            ))
        elif rule_name == "lead":
            paths.orient(lead(float(rule_cfg.get("angle_deg", 10))))
        elif rule_name == "lag":
            paths.orient(lag(float(rule_cfg.get("angle_deg", 5))))
        elif rule_name == "avoid_collision":
            machine_obj = Machine.gantry_5axis_ac()
            paths.orient(avoid_collision(machine_obj, max_tilt=float(rule_cfg.get("max_tilt", 45))))

    # Apply workspace origin offset to all toolpath points
    ox, oy, oz = 0.0, 0.0, 0.0
    if workspace_origin:
        ox = float(workspace_origin.get("x", 0))
        oy = float(workspace_origin.get("y", 0))
        oz = float(workspace_origin.get("z", 0))
        from toolpath_engine.core.primitives import Vector3
        for tp in paths:
            for pt in tp.points:
                pt.position = Vector3(
                    pt.position.x - ox,
                    pt.position.y - oy,
                    pt.position.z - oz,
                )

    # Machine + output
    if post_processor_type == "debug":
        post = DebugPostProcessor(format=debug_format)
        gcode = post.process(paths)
    else:
        machine_factory = getattr(Machine, machine_preset, Machine.gantry_5axis_ac)
        machine_obj = machine_factory()
        post = PostProcessor(machine_obj)
        gcode = post.process(paths, resolve_ik=False)
        if workspace_origin:
            wcs_comment = (
                f"( WCS Origin: X{ox:.4f} Y{oy:.4f} Z{oz:.4f} in CAD coordinates )\n"
                f"( All coordinates below are relative to this origin )\n"
            )
            gcode = wcs_comment + gcode

    # Serialize toolpath points
    points = []
    for tp_collection_item in paths:
        for pt in tp_collection_item.points:
            o = pt.orientation
            points.append({
                "x": pt.position.x, "y": pt.position.y, "z": pt.position.z,
                "nx": o.i if o else 0, "ny": o.j if o else 0, "nz": o.k if o else -1,
                "feed_rate": pt.feed_rate,
                "path_type": pt.path_type,
                "process_params": pt.process_params,
            })

    return {
        "points": points,
        "point_count": len(points),
        "gcode": gcode,
    }


# ── Compile timeline ─────────────────────────────────────────────────────────

def compile_timeline(payload, machine_resolver=None, last_model_path=None):
    """Walk a timeline of ops + orient rows into a single ToolpathCollection
    plus per-op G-code. See ``step_server.compile_timeline`` for the request /
    response contract.

    ``machine_resolver`` and ``last_model_path`` are host hooks: the former
    resolves a machine id to a Machine (e.g. from a YAML file), the latter is
    the path of the most-recently parsed model for the ``__model__`` sentinel.
    """
    entries = payload.get("entries", []) or []
    selected_faces = payload.get("faces", []) or []
    selected_edges = payload.get("edges", []) or []
    machine_preset = payload.get("machine", "gantry_5axis_ac")
    workspace_origin = payload.get("workspace_origin")

    _ensure_templates_loaded()
    from toolpath_engine import get_process, list_processes
    from toolpath_engine.core.toolpath import ToolpathCollection
    from toolpath_engine.core.primitives import Vector3
    from toolpath_engine.kinematics import Machine
    from toolpath_engine.post import PostProcessor

    templates_by_id = {t["id"]: t for t in list_processes()}
    surfaces, curves = build_geometry_dicts(selected_faces, selected_edges)

    machine_obj = resolve_machine(machine_preset, Machine, machine_resolver)

    active_chain = []                # rules from the most-recent visible orient row
    combined = ToolpathCollection(name="timeline")
    op_ranges = []
    warnings = []

    for idx, entry in enumerate(entries):
        if not entry.get("visible", True):
            continue
        kind = entry.get("kind")

        if kind == "orient":
            active_chain = list(entry.get("rules", []))
            continue

        if kind == "scene":
            # Scene rows are imperative actions on the live geometry (load STEP
            # / clear) and don't produce toolpaths.
            continue

        if kind != "op":
            warnings.append(f"entry {idx}: unknown kind '{kind}'")
            continue

        tpl_id = entry.get("templateId")
        try:
            fn = get_process(tpl_id)
        except KeyError:
            warnings.append(f"entry {idx}: unknown template '{tpl_id}'")
            continue

        # Resolve picked geometry IDs into Surface/Curve objects, slot by slot.
        # The sentinel "__model__" means "the currently loaded model file".
        resolved = []
        first_surface = None
        entry_params = dict(entry.get("params", {}) or {})
        for slot_picks in entry.get("geometry", []) or []:
            slot = []
            for gid in slot_picks:
                if gid == "__model__":
                    if last_model_path:
                        entry_params.setdefault("_model_path", last_model_path)
                elif gid in surfaces:
                    slot.append(surfaces[gid])
                    if first_surface is None:
                        first_surface = surfaces[gid]
                elif gid in curves:
                    slot.append(curves[gid])
            resolved.append(slot)

        try:
            op_collection = fn(
                model=None,
                geometry=resolved,
                params=entry_params,
            )
        except TypeError:
            # Older template signatures: fn(model, params) only
            try:
                op_collection = fn(model=None, params=entry.get("params", {}) or {})
            except Exception as exc:
                warnings.append(f"entry {idx} ({tpl_id}): {exc}")
                continue
        except Exception as exc:
            warnings.append(f"entry {idx} ({tpl_id}): {exc}")
            continue

        # Apply the active orient chain ON TOP OF the template default.
        for rule_cfg in active_chain:
            rule = build_orient_callable(
                rule_cfg,
                surface_for_to_normal=first_surface,
                machine_obj=machine_obj,
            )
            if rule is not None:
                try:
                    op_collection.orient(rule)
                except Exception as exc:
                    warnings.append(
                        f"entry {idx}: orient rule '{rule_cfg.get('type')}' "
                        f"could not be applied — {exc}"
                    )

        point_start = sum(len(tp.points) for tp in combined.toolpaths)
        for tp in op_collection.toolpaths:
            combined.add(tp)
        point_end = sum(len(tp.points) for tp in combined.toolpaths)

        tpl_meta = templates_by_id.get(tpl_id, {})
        op_ranges.append({
            "idx": idx,
            "uid": entry.get("uid"),
            "name": entry.get("name") or tpl_id,
            "templateId": tpl_id,
            "kind": tpl_meta.get("kind"),
            "point_start": point_start,
            "point_end": point_end,
        })

    # Apply workspace origin offset (in-place, before G-code generation)
    if workspace_origin:
        ox = float(workspace_origin.get("x", 0))
        oy = float(workspace_origin.get("y", 0))
        oz = float(workspace_origin.get("z", 0))
        for tp in combined.toolpaths:
            for pt in tp.points:
                pt.position = Vector3(
                    pt.position.x - ox,
                    pt.position.y - oy,
                    pt.position.z - oz,
                )

    # Per-op G-code with section dividers and line-range tracking
    post = PostProcessor(machine_obj)
    gcode_lines = []

    op_idx_to_toolpaths = []
    running = 0
    for op_range in op_ranges:
        chunk = ToolpathCollection(name=f"op_{op_range['idx']}")
        target_count = op_range["point_end"] - op_range["point_start"]
        collected = 0
        while running < len(combined.toolpaths) and collected < target_count:
            tp = combined.toolpaths[running]
            chunk.add(tp)
            collected += len(tp.points)
            running += 1
        op_idx_to_toolpaths.append(chunk)

    for op_range, chunk in zip(op_ranges, op_idx_to_toolpaths):
        gcode_start = len(gcode_lines)
        divider = f"(--- OP {op_range['idx']+1:02d}  {op_range['name']} ---)"
        gcode_lines.append(divider)
        try:
            sub_gcode = post.process(chunk, resolve_ik=False)
            gcode_lines.extend(sub_gcode.split("\n"))
        except Exception as exc:
            warnings.append(f"op {op_range['idx']} G-code: {exc}")
        op_range["gcode_start_line"] = gcode_start
        op_range["gcode_end_line"] = len(gcode_lines)

    gcode = "\n".join(gcode_lines)

    # Serialize points
    points = []
    for tp in combined.toolpaths:
        for pt in tp.points:
            o = pt.orientation
            points.append({
                "x": pt.position.x, "y": pt.position.y, "z": pt.position.z,
                "nx": o.i if o else 0, "ny": o.j if o else 0, "nz": o.k if o else -1,
                "feed_rate": pt.feed_rate,
                "path_type": pt.path_type,
                "process_params": pt.process_params,
            })

    return {
        "points": points,
        "point_count": len(points),
        "gcode": gcode,
        "op_ranges": op_ranges,
        "warnings": warnings,
    }
