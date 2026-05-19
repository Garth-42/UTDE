#!/usr/bin/env python3
"""
UTDE STEP Server — parses STEP files and returns tessellated face + edge data as JSON.

Install dependencies:
    pip install flask flask-cors
    conda install -c conda-forge pythonocc-core
    # or: pip install pythonocc-core

Run standalone (browser dev mode):
    python step_server.py                 # defaults to port 5174
    python step_server.py --reload        # auto-reload on any .py file change

Run as Tauri sidecar (port assigned by Tauri):
    ./utde-server --port <dynamic-port>
"""

import argparse
import os
import sys
import json
import math
import tempfile
import subprocess
import textwrap
import numpy as np
from flask import Flask, request, jsonify

# CORS is only needed in browser dev mode (not when running as Tauri sidecar).
# Import conditionally so the server still works if flask-cors is not installed.
try:
    from flask_cors import CORS as _CORS
    _CORS_AVAILABLE = True
except ImportError:
    _CORS_AVAILABLE = False

app = Flask(__name__)

# Eagerly import the built-in templates so the @process decorators register
# them in the toolpath_engine registry. The /templates endpoint and the future
# /compile-timeline endpoint both depend on this. Optional — server still
# starts if the library is missing (toolpath_engine endpoints will 500 instead).
try:
    import toolpath_engine.templates  # noqa: F401  (import-for-side-effect)
    _TEMPLATES_LOADED = True
except Exception as _e:                 # pragma: no cover — defensive
    _TEMPLATES_LOADED = False
    _TEMPLATES_LOAD_ERROR = str(_e)

# Path of the most-recently parsed STEP/STP file. Set by parse_step and
# parse_step_from_path so that whole-model templates (e.g. prusaslicer) can
# receive the model path when the user selects "__model__" in the UI.
_LAST_MODEL_PATH = None


def _apply_cors(flask_app):
    """Apply CORS headers for development. Allows all origins (local server only)."""
    if _CORS_AVAILABLE:
        _CORS(flask_app, origins="*")


def _extract_all_boundary_loops(vertices_flat, indices_flat):
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

MAX_FILE_BYTES = 200 * 1024 * 1024  # 200 MB
SCRIPT_TIMEOUT = 30  # seconds

try:
    from OCC.Core.STEPControl import STEPControl_Reader
    from OCC.Core.IFSelect import IFSelect_RetDone
    from OCC.Core.BRepMesh import BRepMesh_IncrementalMesh
    from OCC.Core.TopExp import TopExp_Explorer
    from OCC.Core.TopAbs import TopAbs_FACE, TopAbs_EDGE, TopAbs_WIRE
    from OCC.Core.BRepTools import breptools_OuterWire
    from OCC.Core.BRep import BRep_Tool
    from OCC.Core.BRepAdaptor import BRepAdaptor_Surface, BRepAdaptor_Curve
    from OCC.Core.GeomAbs import (
        GeomAbs_Plane, GeomAbs_Cylinder, GeomAbs_Sphere,
        GeomAbs_Cone, GeomAbs_Torus,
        GeomAbs_Line, GeomAbs_Circle, GeomAbs_Ellipse,
        GeomAbs_BezierCurve, GeomAbs_BSplineCurve,
        GeomAbs_OtherCurve,
    )
    from OCC.Core.TopLoc import TopLoc_Location
    from OCC.Core.GCPnts import GCPnts_UniformAbscissa
    OCC_AVAILABLE = True
except ImportError:
    OCC_AVAILABLE = False

# ── Type maps ──────────────────────────────────────────────────────────────────

FACE_TYPE_MAP = {}
EDGE_TYPE_MAP = {}
if OCC_AVAILABLE:
    FACE_TYPE_MAP = {
        GeomAbs_Plane:    "plane",
        GeomAbs_Cylinder: "cylinder",
        GeomAbs_Sphere:   "sphere",
        GeomAbs_Cone:     "cone",
        GeomAbs_Torus:    "torus",
    }
    EDGE_TYPE_MAP = {
        GeomAbs_Line:        "line",
        GeomAbs_Circle:      "circle",
        GeomAbs_Ellipse:     "ellipse",
        GeomAbs_BezierCurve: "bezier",
        GeomAbs_BSplineCurve:"bspline",
    }


# ── Wire sampling ─────────────────────────────────────────────────────────────

def _sample_wire_3d(wire, num_points_per_edge=32):
    """Sample all edges of a wire into a flat list of [x,y,z] points."""
    pts = []
    edge_exp = TopExp_Explorer(wire, TopAbs_EDGE)
    seen_start = None
    while edge_exp.More():
        edge = edge_exp.Current()
        try:
            adaptor = BRepAdaptor_Curve(edge)
            t_min = adaptor.FirstParameter()
            t_max = adaptor.LastParameter()
            sampler = GCPnts_UniformAbscissa()
            sampler.Initialize(adaptor, num_points_per_edge, t_min, t_max)
            if sampler.IsDone():
                edge_pts = []
                for i in range(1, sampler.NbPoints() + 1):
                    p = adaptor.Value(sampler.Parameter(i))
                    edge_pts.append([p.X(), p.Y(), p.Z()])
                # Skip first point of subsequent edges to avoid duplicates at junctions
                pts.extend(edge_pts if seen_start is None else edge_pts[1:])
                seen_start = True
        except Exception:
            pass
        edge_exp.Next()
    return pts


# ── Face tessellation ──────────────────────────────────────────────────────────

def tessellate_face(face, idx):
    adaptor = BRepAdaptor_Surface(face)
    gtype   = adaptor.GetType()

    result = {
        "id":       idx,
        "type":     FACE_TYPE_MAP.get(gtype, "other"),
        "vertices": [],
        "indices":  [],
        "params":   {},
    }

    # Geometric parameters
    if gtype == GeomAbs_Plane:
        pln = adaptor.Plane()
        loc = pln.Location()
        n   = pln.Axis().Direction()
        result["params"] = {
            "origin": [loc.X(), loc.Y(), loc.Z()],
            "normal": [n.X(), n.Y(), n.Z()],
        }
    elif gtype == GeomAbs_Cylinder:
        cyl = adaptor.Cylinder()
        ax  = cyl.Axis()
        loc = ax.Location()
        d   = ax.Direction()
        v1  = adaptor.FirstVParameter()
        v2  = adaptor.LastVParameter()
        height = abs(v2 - v1) if (abs(v1) < 1e10 and abs(v2) < 1e10) else None
        result["params"] = {
            "center": [loc.X(), loc.Y(), loc.Z()],
            "axis":   [d.X(), d.Y(), d.Z()],
            "radius": cyl.Radius(),
            "height": height,
        }
    elif gtype == GeomAbs_Sphere:
        sph = adaptor.Sphere()
        c   = sph.Location()
        result["params"] = {
            "center": [c.X(), c.Y(), c.Z()],
            "radius": sph.Radius(),
        }
    elif gtype == GeomAbs_Cone:
        cone = adaptor.Cone()
        ax   = cone.Axis()
        loc  = ax.Location()
        d    = ax.Direction()
        result["params"] = {
            "apex":       [loc.X(), loc.Y(), loc.Z()],
            "axis":       [d.X(), d.Y(), d.Z()],
            "half_angle": cone.SemiAngle(),
        }

    # Mesh tessellation
    location = TopLoc_Location()
    tri = BRep_Tool.Triangulation(face, location)
    if tri is None:
        return result

    trsf = None if location.IsIdentity() else location.Transformation()
    nb_nodes = tri.NbNodes()
    verts_np = np.empty(nb_nodes * 3, dtype=np.float32)
    for i in range(1, nb_nodes + 1):
        node = tri.Node(i)
        if trsf:
            node.Transform(trsf)
        j = (i - 1) * 3
        verts_np[j]     = node.X()
        verts_np[j + 1] = node.Y()
        verts_np[j + 2] = node.Z()

    nb_tris = tri.NbTriangles()
    idxs_np = np.empty(nb_tris * 3, dtype=np.int32)
    for i in range(1, nb_tris + 1):
        t = tri.Triangle(i)
        a, b, c = t.Get()
        j = (i - 1) * 3
        idxs_np[j]     = a - 1
        idxs_np[j + 1] = b - 1
        idxs_np[j + 2] = c - 1

    result["vertices"] = verts_np.tolist()
    result["indices"]  = idxs_np.tolist()

    if nb_nodes > 0:
        coords = verts_np.reshape(-1, 3)
        centroid = coords.mean(axis=0)
        result["centroid"] = centroid.tolist()

    # Extract inner wires (holes) directly from OCC topology — far more reliable
    # than inferring them from the tessellation's boundary edges.
    try:
        outer_wire = breptools_OuterWire(face)
        inner_loops = []
        wire_exp = TopExp_Explorer(face, TopAbs_WIRE)
        while wire_exp.More():
            wire = wire_exp.Current()
            if not wire.IsSame(outer_wire):
                pts = _sample_wire_3d(wire)
                if len(pts) >= 3:
                    inner_loops.append(pts)
            wire_exp.Next()
        if inner_loops:
            result["inner_loops"] = inner_loops
    except Exception:
        pass

    return result


# ── Edge extraction ────────────────────────────────────────────────────────────

def tessellate_edge(edge, idx, num_points=32):
    """Extract an edge as a polyline with geometric params."""
    try:
        adaptor = BRepAdaptor_Curve(edge)
    except Exception:
        return None

    gtype  = adaptor.GetType()
    t_min  = adaptor.FirstParameter()
    t_max  = adaptor.LastParameter()

    result = {
        "id":       idx,
        "type":     EDGE_TYPE_MAP.get(gtype, "other"),
        "vertices": [],
        "params":   {},
    }

    # Geometric parameters
    if gtype == GeomAbs_Line:
        p1 = adaptor.Value(t_min)
        p2 = adaptor.Value(t_max)
        dx, dy, dz = p2.X() - p1.X(), p2.Y() - p1.Y(), p2.Z() - p1.Z()
        length = math.sqrt(dx*dx + dy*dy + dz*dz)
        result["params"] = {
            "start":     [p1.X(), p1.Y(), p1.Z()],
            "end":       [p2.X(), p2.Y(), p2.Z()],
            "direction": [dx / length, dy / length, dz / length] if length > 1e-12 else [0, 0, 1],
            "length":    length,
        }
    elif gtype == GeomAbs_Circle:
        circle = adaptor.Circle()
        loc    = circle.Location()
        axis   = circle.Axis().Direction()
        result["params"] = {
            "center": [loc.X(), loc.Y(), loc.Z()],
            "axis":   [axis.X(), axis.Y(), axis.Z()],
            "radius": circle.Radius(),
        }
    elif gtype == GeomAbs_Ellipse:
        ellipse = adaptor.Ellipse()
        loc     = ellipse.Location()
        result["params"] = {
            "center":       [loc.X(), loc.Y(), loc.Z()],
            "major_radius": ellipse.MajorRadius(),
            "minor_radius": ellipse.MinorRadius(),
        }

    # Sample the curve into a polyline (evenly spaced by parameter)
    try:
        sampler = GCPnts_UniformAbscissa()
        sampler.Initialize(adaptor, num_points, t_min, t_max)
        pts = []
        if sampler.IsDone():
            for i in range(1, sampler.NbPoints() + 1):
                p = adaptor.Value(sampler.Parameter(i))
                pts.extend([p.X(), p.Y(), p.Z()])
        else:
            # Fallback: uniform parameter sampling
            for i in range(num_points):
                t = t_min + (t_max - t_min) * i / (num_points - 1)
                p = adaptor.Value(t)
                pts.extend([p.X(), p.Y(), p.Z()])
        result["vertices"] = pts
    except Exception:
        pass

    if not result["vertices"]:
        return None

    pts_np = np.array(result["vertices"], dtype=np.float32).reshape(-1, 3)
    result["centroid"] = pts_np.mean(axis=0).tolist()

    return result


# ── Endpoints ──────────────────────────────────────────────────────────────────

@app.route("/health")
def health():
    return jsonify({"ok": True, "occ_available": OCC_AVAILABLE})


MACHINES_DIR = os.path.join(os.path.dirname(__file__), "machines")


def _summarize_machine_yaml(yaml_path):
    """Return a UI-friendly summary of a machine YAML file, or None on failure."""
    try:
        import yaml as _yaml
        with open(yaml_path) as f:
            data = _yaml.safe_load(f.read()) or {}
        tool = data.get("tool_chain") or []
        wp   = data.get("workpiece_chain") or []
        return {
            "id":              os.path.splitext(os.path.basename(yaml_path))[0],
            "name":            data.get("name") or os.path.splitext(os.path.basename(yaml_path))[0],
            "path":            os.path.relpath(yaml_path, os.path.dirname(__file__)),
            "tool_axes":       [j.get("name") for j in tool],
            "workpiece_axes":  [j.get("name") for j in wp],
            "axis_count":      len(tool) + len(wp),
            "description":     data.get("description"),
        }
    except Exception as exc:                             # pragma: no cover — diagnostic
        return {
            "id":    os.path.splitext(os.path.basename(yaml_path))[0],
            "name":  os.path.basename(yaml_path),
            "path":  os.path.relpath(yaml_path, os.path.dirname(__file__)),
            "error": str(exc),
        }


@app.route("/machines")
def machines():
    """Enumerate every machine YAML in machines/. The current Forgepath shell
    treats this list as the picker contents; legacy factory presets remain
    available via /compile-timeline as a fallback when machines/ is empty."""
    if not os.path.isdir(MACHINES_DIR):
        return jsonify({"machines": []})
    out = []
    for name in sorted(os.listdir(MACHINES_DIR)):
        if not name.lower().endswith((".yaml", ".yml")):
            continue
        out.append(_summarize_machine_yaml(os.path.join(MACHINES_DIR, name)))
    return jsonify({"machines": out})


@app.route("/machines/import", methods=["POST"])
def machines_import():
    """Upload a machine YAML, validate it parses, save into machines/. Body
    may be either a multipart `file` upload or a JSON `{name, yaml}` payload."""
    yaml_text = None
    target_name = None

    if "file" in request.files:
        f = request.files["file"]
        if not f.filename.lower().endswith((".yaml", ".yml")):
            return jsonify({"error": "File must be .yaml or .yml"}), 400
        yaml_text = f.read().decode("utf-8", errors="replace")
        target_name = os.path.splitext(os.path.basename(f.filename))[0]
    else:
        try:
            data = request.get_json(force=True) or {}
        except Exception:
            data = {}
        yaml_text = data.get("yaml")
        target_name = data.get("name") or data.get("id")
        if not yaml_text:
            return jsonify({"error": "Provide a multipart `file` or JSON {name, yaml}"}), 400

    utde_path = os.path.join(os.path.dirname(__file__), "utde_v0.1.0")
    if utde_path not in sys.path:
        sys.path.insert(0, utde_path)
    try:
        from toolpath_engine import Machine
        machine = Machine.from_yaml(yaml_text)
    except Exception as exc:
        return jsonify({"error": f"Invalid machine YAML: {exc}"}), 400

    # File name: prefer the explicit name, else the machine's `name` field,
    # else fall back to a slug of the supplied filename.
    safe = (target_name or machine.name or "machine").strip()
    safe = "".join(c if (c.isalnum() or c in "_-") else "_" for c in safe).strip("_")
    if not safe:
        safe = "machine"

    os.makedirs(MACHINES_DIR, exist_ok=True)
    out_path = os.path.join(MACHINES_DIR, f"{safe}.yaml")
    with open(out_path, "w") as f:
        f.write(yaml_text)

    return jsonify({
        "machine": _summarize_machine_yaml(out_path),
    })


@app.route("/templates")
def templates():
    """Return UI-shaped metadata for every registered process template.

    Consumed by the front-end Operation Library. Each entry exposes the
    template's id, label, kind tag, icon key, geometry-slot requirements,
    parameter schema, and rough cycle/volume estimates.
    """
    if not _TEMPLATES_LOADED:
        return jsonify({
            "error": "toolpath_engine templates failed to load",
            "detail": _TEMPLATES_LOAD_ERROR,
        }), 500
    from toolpath_engine import list_processes
    return jsonify({"templates": list_processes()})


@app.route("/parse-step", methods=["POST"])
def parse_step():
    if not OCC_AVAILABLE:
        return jsonify({"error": "pythonocc-core not installed. Run: conda install -c conda-forge pythonocc-core"}), 500

    if "file" not in request.files:
        return jsonify({"error": "No file field in request"}), 400

    f = request.files["file"]
    if not f.filename.lower().endswith((".step", ".stp")):
        return jsonify({"error": "File must be .step or .stp"}), 400

    # File size guard (check content-length header first, then actual size)
    f.seek(0, 2)
    size = f.tell()
    f.seek(0)
    if size > MAX_FILE_BYTES:
        return jsonify({"error": f"File too large ({size // 1024 // 1024} MB). Max is {MAX_FILE_BYTES // 1024 // 1024} MB."}), 413

    deflection = float(request.form.get("deflection", 0.5))
    deflection = max(0.01, min(5.0, deflection))  # clamp to sane range

    with tempfile.NamedTemporaryFile(suffix=".step", delete=False) as tmp:
        f.save(tmp.name)
        tmp_path = tmp.name

    try:
        reader = STEPControl_Reader()
        if reader.ReadFile(tmp_path) != IFSelect_RetDone:
            return jsonify({"error": "STEP parser failed — check file is valid STEP/STP"}), 400

        global _LAST_MODEL_PATH
        _LAST_MODEL_PATH = tmp_path

        for i in range(1, reader.NbRootsForTransfer() + 1):
            reader.TransferRoot(i)
        shape = reader.OneShape()
        BRepMesh_IncrementalMesh(shape, deflection, False, deflection, False)

        # Faces
        faces = []
        face_explorer = TopExp_Explorer(shape, TopAbs_FACE)
        face_idx = 0
        while face_explorer.More():
            data = tessellate_face(face_explorer.Current(), face_idx)
            if data["vertices"]:
                faces.append(data)
            face_explorer.Next()
            face_idx += 1

        # Edges
        edges = []
        edge_explorer = TopExp_Explorer(shape, TopAbs_EDGE)
        edge_idx = 0
        seen_edges = set()
        while edge_explorer.More():
            current = edge_explorer.Current()
            # Deduplicate edges by hash (OpenCASCADE may visit shared edges multiple times)
            edge_hash = hash(current)
            if edge_hash not in seen_edges:
                seen_edges.add(edge_hash)
                data = tessellate_edge(current, edge_idx)
                if data:
                    edges.append(data)
                edge_idx += 1
            edge_explorer.Next()

        return jsonify({
            "faces":      faces,
            "edges":      edges,
            "face_count": len(faces),
            "edge_count": len(edges),
        })

    except Exception as e:
        return jsonify({"error": f"Parse error: {str(e)}"}), 500

    finally:
        try:
            os.unlink(tmp_path)
        except Exception:
            pass


def _resolve_machine(machine_id, MachineCls):
    """Resolve a request `machine` field to a Machine instance.

    Order:
      1. A `machines/<id>.yaml` file (id may carry a `.yaml` suffix or not).
      2. A `Machine.<id>()` classmethod factory.
      3. The `gantry_5axis_ac` factory as a default.
    """
    if machine_id:
        candidate = machine_id
        if candidate.lower().endswith((".yaml", ".yml")):
            candidate = os.path.splitext(candidate)[0]
        yaml_path = os.path.join(MACHINES_DIR, f"{candidate}.yaml")
        if os.path.isfile(yaml_path):
            with open(yaml_path) as f:
                return MachineCls.from_yaml(f.read())

        factory = getattr(MachineCls, machine_id, None)
        if callable(factory):
            try:
                return factory()
            except Exception:
                pass

    return MachineCls.gantry_5axis_ac()


def _build_geometry_dicts(selected_faces, selected_edges):
    """Construct {face_id: Surface} and {edge_id: Curve} dicts the same way
    /generate-toolpath does, plus boundary loops for face raster fill."""
    from toolpath_engine.core.geometry import Curve, Surface

    surfaces = {}
    for face in selected_faces:
        p = face.get("params", {})
        ftype = face.get("type")
        fid   = face.get("id")
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

    for face in selected_faces:
        fid = face.get("id")
        if fid in surfaces:
            boundary = _extract_boundary_loop(
                face.get("vertices", []),
                face.get("indices", []),
            )
            if boundary:
                surfaces[fid].boundary_loop = boundary

    curves = {}
    for edge in selected_edges:
        p     = edge.get("params", {})
        etype = edge.get("type")
        eid   = edge.get("id")
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
                pts   = [(verts[i], verts[i+1], verts[i+2])
                         for i in range(0, len(verts), 3)]
                if len(pts) >= 2:
                    curves[eid] = Curve.spline(
                        control_points=pts,
                        num_points=max(50, len(pts)),
                    )
        except Exception:
            pass

    return surfaces, curves


def _build_orient_callable(rule_cfg, surface_for_to_normal=None, machine_obj=None):
    """Map a JSON orient rule config to a Python orient callable. Returns
    None if the rule type is unsupported in the current context (e.g.
    to_normal with no surface). Used by /compile-timeline."""
    from toolpath_engine.orient import (
        to_normal, fixed, lead, lag, side_tilt, avoid_collision,
    )

    t = rule_cfg.get("type") or rule_cfg.get("rule")
    if t == "fixed":
        # Front-end uses x/y/z; legacy /generate-toolpath uses i/j/k.
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


@app.route("/compile-timeline", methods=["POST"])
def compile_timeline():
    """Walk the timeline of ops + orient rows into a single ToolpathCollection
    plus G-code grouped by op.

    Per Q3(c-entry) + append-mode: each visible orient row sets the active
    orient chain for every op below it (until the next visible orient row).
    Each op's template is invoked with its picked geometry and parameters,
    then the active chain is applied *on top of* whatever orient defaults
    the template returned.

    Body:
        {
          "entries": [
            { "kind": "op",     "templateId", "name", "params", "geometry": [[ids...], ...],
              "visible": true },
            { "kind": "orient", "rules": [...], "visible": true },
            ...
          ],
          "faces":    [...],   // same shape as /generate-toolpath
          "edges":    [...],
          "machine":  "gantry_5axis_ac",
          "workspace_origin": { x, y, z } | null,
        }

    Returns:
        {
          "points":      [...],   // serialized toolpath points (concatenated)
          "point_count": int,
          "gcode":       str,     // with `(--- OP NN NAME ---)` dividers
          "op_ranges":   [{ idx, name, templateId, kind,
                            point_start, point_end,
                            gcode_start_line, gcode_end_line }],
          "warnings":    [str],
        }
    """
    if not _TEMPLATES_LOADED:
        return jsonify({
            "error": "toolpath_engine templates failed to load",
            "detail": _TEMPLATES_LOAD_ERROR,
        }), 500

    try:
        data           = request.get_json(force=True)
        entries        = data.get("entries", []) or []
        selected_faces = data.get("faces", []) or []
        selected_edges = data.get("edges", []) or []
        machine_preset = data.get("machine", "gantry_5axis_ac")
        workspace_origin = data.get("workspace_origin")

        utde_path = os.path.join(os.path.dirname(__file__), "utde_v0.1.0")
        if utde_path not in sys.path:
            sys.path.insert(0, utde_path)

        from toolpath_engine import get_process, list_processes
        from toolpath_engine.core.toolpath import Toolpath, ToolpathCollection
        from toolpath_engine.core.primitives import Vector3
        from toolpath_engine.kinematics import Machine
        from toolpath_engine.post import PostProcessor

        templates_by_id = {t["id"]: t for t in list_processes()}
        surfaces, curves = _build_geometry_dicts(selected_faces, selected_edges)

        machine_obj = _resolve_machine(machine_preset, Machine)

        active_chain = []                # rules from the most-recent visible orient row
        combined     = ToolpathCollection(name="timeline")
        op_ranges    = []
        warnings     = []

        for idx, entry in enumerate(entries):
            if not entry.get("visible", True):
                continue
            kind = entry.get("kind")

            if kind == "orient":
                active_chain = list(entry.get("rules", []))
                continue

            if kind == "scene":
                # Scene rows are imperative actions on the live geometry
                # (load STEP / clear) and don't produce toolpaths. Their
                # effects are already baked into the `faces` / `edges`
                # payload by the time /compile-timeline is called.
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
            # The sentinel "__model__" means "the currently loaded model file";
            # its path is injected into entry_params so whole-model templates
            # (e.g. prusaslicer) can find it via params["_model_path"].
            resolved = []
            first_surface = None
            entry_params = dict(entry.get("params", {}) or {})
            for slot_picks in entry.get("geometry", []) or []:
                slot = []
                for gid in slot_picks:
                    if gid == "__model__":
                        if _LAST_MODEL_PATH:
                            entry_params.setdefault("_model_path", _LAST_MODEL_PATH)
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
                rule = _build_orient_callable(
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
                "idx":         idx,
                "uid":         entry.get("uid"),
                "name":        entry.get("name") or tpl_id,
                "templateId":  tpl_id,
                "kind":        tpl_meta.get("kind"),
                "point_start": point_start,
                "point_end":   point_end,
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

        # Walk the same op_ranges to slice the combined collection back into per-op chunks.
        # We reproduce per-op slices because PostProcessor takes a ToolpathCollection.
        op_idx_to_toolpaths = []
        running = 0
        for op_range in op_ranges:
            chunk = ToolpathCollection(name=f"op_{op_range['idx']}")
            # The toolpaths added for this op are the next (point_end - point_start)
            # points worth of toolpaths in the combined collection. We tracked
            # contiguous insertion order, so we can rebuild via offset.
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
            op_range["gcode_end_line"]   = len(gcode_lines)

        gcode = "\n".join(gcode_lines)

        # Serialize points
        points = []
        for tp in combined.toolpaths:
            for pt in tp.points:
                o = pt.orientation
                points.append({
                    "x": pt.position.x, "y": pt.position.y, "z": pt.position.z,
                    "nx": o.i if o else 0, "ny": o.j if o else 0, "nz": o.k if o else -1,
                    "feed_rate":     pt.feed_rate,
                    "path_type":     pt.path_type,
                    "process_params": pt.process_params,
                })

        return jsonify({
            "points":      points,
            "point_count": len(points),
            "gcode":       gcode,
            "op_ranges":   op_ranges,
            "warnings":    warnings,
        })

    except Exception as e:
        return jsonify({"error": f"compile-timeline error: {e}"}), 500


@app.route("/generate-toolpath", methods=["POST"])
def generate_toolpath():
    """
    Generate a UTDE toolpath from selected face/edge geometry and strategy config.
    Returns toolpath points as JSON plus generated G-code and Python code.
    """
    try:
        data             = request.get_json(force=True)
        selected_faces   = data.get("faces", [])
        selected_edges   = data.get("edges", [])
        strategy_cfg     = data.get("strategy", {})
        orientation_cfg  = data.get("orientation", [])
        machine_preset      = data.get("machine", "gantry_5axis_ac")
        workspace_origin    = data.get("workspace_origin")  # {x, y, z} or None
        post_processor_type = data.get("post_processor", "default")  # "default" or "debug"
        debug_format        = data.get("post_processor_format", "text")  # "text" or "json"

        # Add UTDE to path
        utde_path = os.path.join(os.path.dirname(__file__), "utde_v0.1.0")
        if utde_path not in sys.path:
            sys.path.insert(0, utde_path)

        from toolpath_engine.core.geometry import Curve, Surface
        from toolpath_engine.core.toolpath import ToolpathCollection
        from toolpath_engine.strategies import FollowCurveStrategy, RasterFillStrategy, ContourParallelStrategy
        from toolpath_engine.orient import to_normal, fixed, lead, lag, avoid_collision
        from toolpath_engine.kinematics import Machine
        from toolpath_engine.post import PostProcessor, PostConfig, DebugPostProcessor

        # Build geometry objects from params
        surfaces = {}
        for face in selected_faces:
            p = face.get("params", {})
            ftype = face.get("type")
            fid   = face.get("id")
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
                all_loops = _extract_all_boundary_loops(
                    face.get("vertices", []),
                    face.get("indices", []),
                )
                if all_loops:
                    surfaces[fid].boundary_loop = all_loops[0]
                # Inner loops from OCC wire topology (preferred over mesh inference)
                inner_loops = face.get("inner_loops")
                if inner_loops:
                    surfaces[fid].interior_loops = [
                        [tuple(p) for p in loop] for loop in inner_loops
                    ]

        curves = {}
        for edge in selected_edges:
            p     = edge.get("params", {})
            etype = edge.get("type")
            eid   = edge.get("id")
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
                    # Spline through sampled points
                    verts = edge["vertices"]
                    pts   = [(verts[i], verts[i+1], verts[i+2]) for i in range(0, len(verts), 3)]
                    if len(pts) >= 2:
                        curves[eid] = Curve.spline(control_points=pts, num_points=max(50, len(pts)))
            except Exception:
                pass

        # Strategy — frontend sends "strategy_type" (not "type")
        stype     = strategy_cfg.get("strategy_type") or strategy_cfg.get("type", "follow_curve")
        feed_rate = float(strategy_cfg.get("feed_rate", 600))
        paths     = None
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
            return jsonify({"error": f"Could not generate toolpath — {detail}"}), 400

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
                machine_obj = getattr(Machine, f"gantry_5axis_ac")()
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
            post  = DebugPostProcessor(format=debug_format)
            gcode = post.process(paths)
        else:
            machine_factory = getattr(Machine, machine_preset, Machine.gantry_5axis_ac)
            machine_obj     = machine_factory()
            post            = PostProcessor(machine_obj)
            gcode           = post.process(paths, resolve_ik=False)
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
                    "feed_rate":      pt.feed_rate,
                    "path_type":      pt.path_type,
                    "process_params": pt.process_params,
                })

        return jsonify({
            "points":      points,
            "point_count": len(points),
            "gcode":       gcode,
        })

    except Exception as e:
        return jsonify({"error": f"Toolpath generation failed: {str(e)}"}), 500


@app.route("/lint-script", methods=["POST"])
def lint_script():
    """
    Stateless Python syntax check using ast.parse().
    Returns a list of error objects: { line, col, message }.
    """
    import ast
    data = request.get_json(force=True)
    code = data.get("code", "")

    if not code.strip():
        return jsonify({"errors": []})

    try:
        ast.parse(code)
        return jsonify({"errors": []})
    except SyntaxError as e:
        return jsonify({"errors": [{
            "line":    (e.lineno or 1) - 1,  # 0-indexed for CodeMirror
            "col":     (e.offset or 1) - 1,
            "message": e.msg,
        }]})
    except Exception as e:
        return jsonify({"errors": [{"line": 0, "col": 0, "message": str(e)}]})


@app.route("/run-script", methods=["POST"])
def run_script():
    """
    Execute a UTDE Python script in a sandboxed subprocess.
    Returns stdout, stderr, and G-code file contents if written.
    """
    data = request.get_json(force=True)
    code = data.get("code", "")

    if not code.strip():
        return jsonify({"error": "No code provided"}), 400

    utde_path = os.path.join(os.path.dirname(os.path.abspath(__file__)), "utde_v0.1.0")

    with tempfile.TemporaryDirectory() as tmpdir:
        script_path = os.path.join(tmpdir, "script.py")
        with open(script_path, "w") as f:
            f.write(code)

        env = os.environ.copy()
        existing_pythonpath = env.get("PYTHONPATH", "")
        env["PYTHONPATH"] = f"{utde_path}{os.pathsep}{existing_pythonpath}" if existing_pythonpath else utde_path

        try:
            proc = subprocess.run(
                [sys.executable, script_path],
                cwd=tmpdir,
                capture_output=True,
                text=True,
                timeout=SCRIPT_TIMEOUT,
                env=env,
            )
            success = proc.returncode == 0

            # Read any G-code output written to tmpdir
            gcode = None
            for fname in os.listdir(tmpdir):
                if fname.endswith(".nc") or fname.endswith(".gcode"):
                    with open(os.path.join(tmpdir, fname)) as gf:
                        gcode = gf.read()
                    break

            return jsonify({
                "success": success,
                "stdout":  proc.stdout[-8000:] if proc.stdout else "",
                "stderr":  proc.stderr[-4000:] if proc.stderr else "",
                "gcode":   gcode,
            })

        except subprocess.TimeoutExpired:
            return jsonify({"error": f"Script timed out after {SCRIPT_TIMEOUT}s", "success": False}), 408
        except Exception as e:
            return jsonify({"error": str(e), "success": False}), 500


@app.route("/parse-step-path", methods=["POST"])
def parse_step_from_path():
    """
    Parse a STEP file given its absolute path on disk.
    Used by the Tauri desktop app to avoid HTTP multipart upload overhead.
    """
    if not OCC_AVAILABLE:
        return jsonify({"error": "pythonocc-core not installed"}), 500

    data = request.get_json(force=True)
    path = data.get("path", "").strip()
    if not path:
        return jsonify({"error": "No path provided"}), 400
    if not os.path.isfile(path):
        return jsonify({"error": f"File not found: {path}"}), 400
    if not path.lower().endswith((".step", ".stp")):
        return jsonify({"error": "File must be .step or .stp"}), 400

    deflection = float(data.get("deflection", 0.5))
    deflection = max(0.01, min(5.0, deflection))

    try:
        reader = STEPControl_Reader()
        if reader.ReadFile(path) != IFSelect_RetDone:
            return jsonify({"error": "STEP parser failed — check file is valid STEP/STP"}), 400

        global _LAST_MODEL_PATH
        _LAST_MODEL_PATH = path

        for i in range(1, reader.NbRootsForTransfer() + 1):
            reader.TransferRoot(i)
        shape = reader.OneShape()
        BRepMesh_IncrementalMesh(shape, deflection, False, deflection, False)

        faces = []
        face_explorer = TopExp_Explorer(shape, TopAbs_FACE)
        face_idx = 0
        while face_explorer.More():
            data_face = tessellate_face(face_explorer.Current(), face_idx)
            if data_face["vertices"]:
                faces.append(data_face)
            face_explorer.Next()
            face_idx += 1

        edges = []
        edge_explorer = TopExp_Explorer(shape, TopAbs_EDGE)
        edge_idx = 0
        seen_edges = set()
        while edge_explorer.More():
            current = edge_explorer.Current()
            edge_hash = hash(current)
            if edge_hash not in seen_edges:
                seen_edges.add(edge_hash)
                data_edge = tessellate_edge(current, edge_idx)
                if data_edge:
                    edges.append(data_edge)
                edge_idx += 1
            edge_explorer.Next()

        return jsonify({
            "faces":      faces,
            "edges":      edges,
            "face_count": len(faces),
            "edge_count": len(edges),
        })

    except Exception as e:
        return jsonify({"error": f"Parse error: {str(e)}"}), 500


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="UTDE STEP Server")
    parser.add_argument(
        "--port", type=int, default=5174,
        help="Port to listen on (default: 5174). Tauri passes a dynamic free port.",
    )
    parser.add_argument(
        "--no-cors", action="store_true",
        help="Disable CORS headers (used when running as Tauri sidecar).",
    )
    parser.add_argument(
        "--reload", action="store_true",
        help="Enable Werkzeug auto-reloader (dev mode). Watches all .py files and "
             "restarts the server automatically on change. Do not use with Tauri.",
    )
    args = parser.parse_args()

    if not args.no_cors:
        _apply_cors(app)

    print(f"UTDE STEP Server → http://localhost:{args.port}")
    print(f"pythonocc-core: {'available' if OCC_AVAILABLE else 'NOT FOUND'}")
    sys.stdout.flush()

    if args.reload:
        # Dev mode: Werkzeug reloader watches all .py files and restarts on change.
        # The ready signal is printed before serve_forever so the log always shows it,
        # even after auto-reloads (the reloader re-execs this script on each reload).
        from werkzeug.serving import make_server
        from werkzeug._reloader import run_with_reloader

        def _serve():
            srv = make_server("127.0.0.1", args.port, app, threaded=True)
            print("UTDE_SERVER_READY", flush=True)
            srv.serve_forever()

        run_with_reloader(_serve)
    else:
        # Production / Tauri sidecar: single process, no file watching.
        from werkzeug.serving import make_server
        srv = make_server("127.0.0.1", args.port, app, threaded=True)
        print("UTDE_SERVER_READY", flush=True)
        srv.serve_forever()
