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


def _enable_static_serving(flask_app, static_dir):
    """Serve the built React SPA from ``static_dir`` alongside the JSON API.

    Used by the standalone Docker / production deployment, where a single Flask
    process serves both the compiled frontend bundle and the API (there is no
    Vite dev-server proxy). In browser mode the frontend calls the backend at
    ``/api/*`` (see ``getBaseUrl()`` in ``utde-app/src/lib/backend.js``), so a
    thin WSGI middleware strips the leading ``/api`` segment and the existing
    root-level routes (``/health``, ``/machines`` …) handle the request
    unchanged. Every other path serves a real file from ``static_dir`` when one
    exists, falling back to ``index.html`` so client-side routing works.
    """
    from flask import send_from_directory

    static_dir = os.path.abspath(static_dir)

    # Strip a leading /api prefix so /api/health → /health, etc.
    _inner_wsgi = flask_app.wsgi_app

    def _strip_api_prefix(environ, start_response):
        path = environ.get("PATH_INFO", "")
        if path == "/api" or path.startswith("/api/"):
            environ["PATH_INFO"] = path[len("/api"):] or "/"
        return _inner_wsgi(environ, start_response)

    flask_app.wsgi_app = _strip_api_prefix

    # Catch-all SPA route. Registered last; Werkzeug prefers the more-specific
    # API rules (e.g. /health) over this variable rule, so the API still wins.
    @flask_app.route("/", defaults={"path": ""})
    @flask_app.route("/<path:path>")
    def _serve_spa(path):
        candidate = os.path.join(static_dir, path)
        if path and os.path.isfile(candidate):
            return send_from_directory(static_dir, path)
        return send_from_directory(static_dir, "index.html")

    return flask_app


# Pure request-handling logic lives in toolpath_engine.webapi so it can be
# shared by this Flask server and the browser (Pyodide) build. Import it here
# and re-export the boundary-loop helper under its historical private name.
try:
    from toolpath_engine import webapi as _webapi
    from toolpath_engine.webapi import extract_all_boundary_loops as _extract_all_boundary_loops
    _WEBAPI_AVAILABLE = True
    _WEBAPI_LOAD_ERROR = None
except Exception as _e:                                  # pragma: no cover — defensive
    _webapi = None
    _WEBAPI_AVAILABLE = False
    _WEBAPI_LOAD_ERROR = str(_e)

    def _extract_all_boundary_loops(vertices_flat, indices_flat):
        return []

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
    """Return a UI-friendly summary of a machine YAML file, or an error record.

    Reads the file (server-side concern) and delegates parsing to the shared
    webapi.summarize_machine so the browser build produces identical summaries
    from bundled YAML text.
    """
    machine_id = os.path.splitext(os.path.basename(yaml_path))[0]
    rel_path = os.path.relpath(yaml_path, os.path.dirname(__file__))
    try:
        with open(yaml_path) as f:
            text = f.read()
    except Exception as exc:                             # pragma: no cover — diagnostic
        return {"id": machine_id, "name": os.path.basename(yaml_path),
                "path": rel_path, "error": str(exc)}
    return _webapi.summarize_machine(text, machine_id, rel_path)


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
    return jsonify(_webapi.list_templates())


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


def _machine_file_resolver(machine_id):
    """Server-side machine resolver hook for webapi.resolve_machine.

    Returns a Machine loaded from `machines/<id>.yaml` if such a file exists,
    else None so webapi falls back to a `Machine.<id>()` factory / the default.
    """
    if not machine_id:
        return None
    candidate = machine_id
    if candidate.lower().endswith((".yaml", ".yml")):
        candidate = os.path.splitext(candidate)[0]
    yaml_path = os.path.join(MACHINES_DIR, f"{candidate}.yaml")
    if os.path.isfile(yaml_path):
        from toolpath_engine import Machine
        with open(yaml_path) as f:
            return Machine.from_yaml(f.read())
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
        data = request.get_json(force=True)
        result = _webapi.compile_timeline(
            data,
            machine_resolver=_machine_file_resolver,
            last_model_path=_LAST_MODEL_PATH,
        )
        return jsonify(result)
    except Exception as e:
        return jsonify({"error": f"compile-timeline error: {e}"}), 500


@app.route("/generate-toolpath", methods=["POST"])
def generate_toolpath():
    """
    Generate a UTDE toolpath from selected face/edge geometry and strategy config.
    Returns toolpath points as JSON plus generated G-code and Python code.
    """
    try:
        data = request.get_json(force=True)
        return jsonify(_webapi.generate_toolpath(data))
    except _webapi.WebApiError as e:
        return jsonify({"error": str(e)}), e.status
    except Exception as e:
        return jsonify({"error": f"Toolpath generation failed: {str(e)}"}), 500


@app.route("/lint-script", methods=["POST"])
def lint_script():
    """
    Stateless Python syntax check using ast.parse().
    Returns a list of error objects: { line, col, message }.
    """
    data = request.get_json(force=True)
    return jsonify(_webapi.lint_script(data.get("code", "")))


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


# Standalone / Docker deployment: when UTDE_STATIC_DIR points at a built
# frontend bundle, serve it from this same process so a single container can
# host both the SPA and the API. No-op for dev (Vite proxy) and Tauri modes,
# which never set this variable.
_STATIC_DIR = os.environ.get("UTDE_STATIC_DIR")
if _STATIC_DIR and os.path.isdir(_STATIC_DIR):
    _enable_static_serving(app, _STATIC_DIR)


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="UTDE STEP Server")
    parser.add_argument(
        "--host", default=os.environ.get("UTDE_HOST", "127.0.0.1"),
        help="Interface to bind (default: 127.0.0.1, or $UTDE_HOST). "
             "Use 0.0.0.0 to accept connections from outside a container.",
    )
    parser.add_argument(
        "--port", type=int, default=int(os.environ.get("UTDE_PORT", "5174")),
        help="Port to listen on (default: 5174, or $UTDE_PORT). "
             "Tauri passes a dynamic free port.",
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

    print(f"UTDE STEP Server → http://{args.host}:{args.port}")
    print(f"pythonocc-core: {'available' if OCC_AVAILABLE else 'NOT FOUND'}")
    sys.stdout.flush()

    if args.reload:
        # Dev mode: Werkzeug reloader watches all .py files and restarts on change.
        # The ready signal is printed before serve_forever so the log always shows it,
        # even after auto-reloads (the reloader re-execs this script on each reload).
        from werkzeug.serving import make_server
        from werkzeug._reloader import run_with_reloader

        def _serve():
            srv = make_server(args.host, args.port, app, threaded=True)
            print("UTDE_SERVER_READY", flush=True)
            srv.serve_forever()

        run_with_reloader(_serve)
    else:
        # Production / Tauri sidecar: single process, no file watching.
        from werkzeug.serving import make_server
        srv = make_server(args.host, args.port, app, threaded=True)
        print("UTDE_SERVER_READY", flush=True)
        srv.serve_forever()
