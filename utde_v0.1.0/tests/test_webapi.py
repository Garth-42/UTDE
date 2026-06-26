"""Unit tests for toolpath_engine.webapi — the pure (Flask-free) request core.

These exercise the same logic the Flask server delegates to, but call the
functions directly with dicts so they also cover the browser/Pyodide path.
"""

import math
import pytest

from toolpath_engine import webapi
from toolpath_engine.kinematics import Machine


# ── extract_all_boundary_loops ───────────────────────────────────────────────

class TestExtractAllBoundaryLoops:
    def test_empty_input_returns_empty(self):
        assert webapi.extract_all_boundary_loops([], []) == []
        assert webapi.extract_all_boundary_loops([0, 0, 0], []) == []

    def test_single_quad_returns_one_loop(self):
        # Two triangles forming a unit square → one boundary loop of 4 verts.
        verts = [0, 0, 0,  1, 0, 0,  1, 1, 0,  0, 1, 0]
        indices = [0, 1, 2,  0, 2, 3]
        loops = webapi.extract_all_boundary_loops(verts, indices)
        assert len(loops) == 1
        assert len(loops[0]) == 4

    def test_outer_loop_is_first_and_largest(self):
        # Annulus: outer square (side 10) with an inner square hole (side 2).
        s, cx, h = 10.0, 5.0, 1.0
        verts = [
            0, 0, 0,  s, 0, 0,  s, s, 0,  0, s, 0,
            cx - h, cx - h, 0,  cx + h, cx - h, 0,
            cx + h, cx + h, 0,  cx - h, cx + h, 0,
        ]
        indices = [
            0, 1, 5,  0, 5, 4,
            1, 2, 6,  1, 6, 5,
            2, 3, 7,  2, 7, 6,
            3, 0, 4,  3, 4, 7,
        ]
        loops = webapi.extract_all_boundary_loops(verts, indices)
        assert len(loops) == 2

        def area(loop):
            n = len(loop)
            a = 0.0
            for i in range(n):
                x1, y1 = loop[i][0], loop[i][1]
                x2, y2 = loop[(i + 1) % n][0], loop[(i + 1) % n][1]
                a += x1 * y2 - x2 * y1
            return abs(a) / 2.0

        assert area(loops[0]) > area(loops[1])
        assert area(loops[0]) == pytest.approx(s * s, rel=0.01)


# ── build_geometry_dicts ─────────────────────────────────────────────────────

class TestBuildGeometryDicts:
    def test_plane_surface_and_line_curve(self):
        faces = [{"id": 1, "type": "plane",
                  "params": {"origin": [0, 0, 0], "normal": [0, 0, 1]}}]
        edges = [{"id": 2, "type": "line",
                  "params": {"start": [0, 0, 0], "end": [10, 0, 0]}}]
        surfaces, curves = webapi.build_geometry_dicts(faces, edges)
        assert set(surfaces) == {1}
        assert set(curves) == {2}

    def test_boundary_loop_attached_from_mesh(self):
        # A plane face with a triangulated quad → outer boundary loop attached.
        face = {
            "id": 7, "type": "plane",
            "params": {"origin": [0, 0, 0], "normal": [0, 0, 1]},
            "vertices": [0, 0, 0,  1, 0, 0,  1, 1, 0,  0, 1, 0],
            "indices": [0, 1, 2,  0, 2, 3],
        }
        surfaces, _ = webapi.build_geometry_dicts([face], [])
        loop = getattr(surfaces[7], "boundary_loop", None)
        assert loop is not None and len(loop) == 4

    def test_inner_loops_attached_as_interior(self):
        face = {
            "id": 9, "type": "plane",
            "params": {"origin": [0, 0, 0], "normal": [0, 0, 1]},
            "inner_loops": [[[1, 1, 0], [2, 1, 0], [2, 2, 0], [1, 2, 0]]],
        }
        surfaces, _ = webapi.build_geometry_dicts([face], [])
        interior = getattr(surfaces[9], "interior_loops", None)
        assert interior and len(interior[0]) == 4
        # tuples, not lists, after normalization
        assert isinstance(interior[0][0], tuple)

    def test_does_not_raise_on_bad_geometry(self):
        # Missing params should be skipped, not crash.
        surfaces, curves = webapi.build_geometry_dicts(
            [{"id": 1, "type": "cylinder", "params": {}}], [])
        assert surfaces == {}


# ── resolve_machine ──────────────────────────────────────────────────────────

class TestResolveMachine:
    def test_resolver_hook_takes_priority(self):
        sentinel = Machine.gantry_5axis_ac()
        m = webapi.resolve_machine("anything", Machine,
                                   machine_resolver=lambda mid: sentinel)
        assert m is sentinel

    def test_falls_back_to_factory(self):
        m = webapi.resolve_machine("gantry_5axis_ac", Machine, machine_resolver=None)
        assert isinstance(m, Machine)

    def test_unknown_machine_falls_back_to_default(self):
        m = webapi.resolve_machine("definitely-not-a-machine", Machine,
                                   machine_resolver=lambda mid: None)
        assert isinstance(m, Machine)


# ── lint_script ──────────────────────────────────────────────────────────────

class TestLintScript:
    def test_valid_code_has_no_errors(self):
        assert webapi.lint_script("x = 1\n")["errors"] == []

    def test_empty_code_has_no_errors(self):
        assert webapi.lint_script("   ")["errors"] == []

    def test_syntax_error_is_zero_indexed(self):
        errs = webapi.lint_script("def f(:\n")["errors"]
        assert len(errs) == 1
        assert errs[0]["line"] == 0
        assert "message" in errs[0]


# ── list_templates ───────────────────────────────────────────────────────────

class TestListTemplates:
    def test_returns_template_list(self):
        out = webapi.list_templates()
        assert isinstance(out["templates"], list)
        ids = [t["id"] for t in out["templates"]]
        assert "pocket" in ids
        for tid in ("raster_fill", "follow_curve", "contour_parallel"):
            assert tid in ids

    def test_requires_local_flag(self):
        by_id = {t["id"]: t for t in webapi.list_templates()["templates"]}
        # Subprocess-backed slicers are flagged so the static build can hide them.
        assert by_id["prusaslicer"]["requires_local"] is True
        assert by_id["libslic3r"]["requires_local"] is True
        # Pure-Python primitives are not.
        assert by_id["pocket"]["requires_local"] is False
        assert by_id["raster_fill"]["requires_local"] is False


# ── summarize_machine ────────────────────────────────────────────────────────

class TestSummarizeMachine:
    YAML = """
name: testmachine
description: a test
tool_chain:
  - name: X
    type: linear
  - name: A
    type: rotary
workpiece_chain:
  - name: C
    type: rotary
"""

    def test_summary_fields(self):
        s = webapi.summarize_machine(self.YAML, "testmachine", "machines/testmachine.yaml")
        assert s["id"] == "testmachine"
        assert s["name"] == "testmachine"
        assert s["path"] == "machines/testmachine.yaml"
        assert s["tool_axes"] == ["X", "A"]
        assert s["workpiece_axes"] == ["C"]
        assert s["axis_count"] == 3

    def test_bad_yaml_returns_error_record(self):
        s = webapi.summarize_machine(":  bad: : :", "broken", None)
        assert s["id"] == "broken"
        assert "error" in s


# ── generate_toolpath ────────────────────────────────────────────────────────

class TestGenerateToolpath:
    def test_follow_curve_with_line_edge(self):
        out = webapi.generate_toolpath({
            "edges": [{"id": 1, "type": "line",
                       "params": {"start": [0, 0, 0], "end": [10, 0, 0]}}],
            "strategy": {"strategy_type": "follow_curve", "feed_rate": 500},
        })
        assert out["point_count"] > 0
        assert "G1" in out["gcode"]

    def test_raster_fill_with_plane_face(self):
        out = webapi.generate_toolpath({
            "faces": [{"id": 1, "type": "plane",
                       "params": {"origin": [0, 0, 0], "normal": [0, 0, 1]}}],
            "strategy": {"strategy_type": "raster_fill", "spacing": 3.0},
        })
        assert out["point_count"] > 0

    def test_no_geometry_raises_webapi_error(self):
        with pytest.raises(webapi.WebApiError) as ei:
            webapi.generate_toolpath({"strategy": {"strategy_type": "follow_curve"}})
        assert ei.value.status == 400

    def test_orientation_fixed_rule(self):
        out = webapi.generate_toolpath({
            "edges": [{"id": 1, "type": "line",
                       "params": {"start": [0, 0, 0], "end": [10, 0, 0]}}],
            "strategy": {"strategy_type": "follow_curve"},
            "orientation": [{"rule": "fixed", "i": 0, "j": 0, "k": -1}],
        })
        first = out["points"][0]
        assert abs(first["nz"] + 1.0) < 0.01

    def test_workspace_origin_offsets_points(self):
        base = webapi.generate_toolpath({
            "edges": [{"id": 1, "type": "line",
                       "params": {"start": [10, 0, 0], "end": [20, 0, 0]}}],
            "strategy": {"strategy_type": "follow_curve"},
        })
        offset = webapi.generate_toolpath({
            "edges": [{"id": 1, "type": "line",
                       "params": {"start": [10, 0, 0], "end": [20, 0, 0]}}],
            "strategy": {"strategy_type": "follow_curve"},
            "workspace_origin": {"x": 10, "y": 0, "z": 0},
        })
        assert offset["points"][0]["x"] == pytest.approx(base["points"][0]["x"] - 10)


# ── run_script (in-process) ──────────────────────────────────────────────────

class TestRunScript:
    def test_empty_code(self):
        out = webapi.run_script("   ")
        assert out["success"] is False

    def test_simple_print(self):
        out = webapi.run_script("print('hello world')")
        assert out["success"] is True
        assert "hello world" in out["stdout"]

    def test_exception_sets_failure_and_stderr(self):
        out = webapi.run_script("raise ValueError('boom')")
        assert out["success"] is False
        assert "boom" in out["stderr"]

    def test_utde_import_works(self):
        out = webapi.run_script(
            "from toolpath_engine.core.geometry import Curve\n"
            "c = Curve.line((0,0,0),(10,0,0), num_points=5)\n"
            "print(len(c))\n"
        )
        assert out["success"] is True
        assert out["stdout"].strip() == "5"

    def test_gcode_file_captured(self):
        out = webapi.run_script(
            "open('out.nc', 'w').write('G0 Z50\\nM30\\n')\n"
            "print('done')\n"
        )
        assert out["success"] is True
        assert out["gcode"] is not None
        assert "M30" in out["gcode"]


# ── compile_timeline ─────────────────────────────────────────────────────────

class TestCompileTimeline:
    def test_empty_timeline(self):
        out = webapi.compile_timeline({"entries": [], "faces": [], "edges": []})
        assert out["point_count"] == 0
        assert out["op_ranges"] == []
        assert out["warnings"] == []

    def test_single_pocket_op(self):
        out = webapi.compile_timeline({
            "entries": [{"kind": "op", "uid": "op_1", "templateId": "pocket",
                         "name": "Pocket A",
                         "params": {"depth": 3.0, "stepdown": 1.0},
                         "geometry": [[]], "visible": True}],
            "faces": [], "edges": [],
        })
        assert out["point_count"] > 0
        assert len(out["op_ranges"]) == 1
        assert "(--- OP 01" in out["gcode"]

    def test_unknown_template_warns(self):
        out = webapi.compile_timeline({
            "entries": [{"kind": "op", "templateId": "nope",
                         "params": {}, "geometry": [], "visible": True}],
            "faces": [], "edges": [],
        })
        assert any("nope" in w for w in out["warnings"])
        assert out["op_ranges"] == []

    def test_orient_chain_applies_to_following_ops(self):
        out = webapi.compile_timeline({
            "entries": [
                {"kind": "op", "templateId": "pocket", "name": "A",
                 "params": {"depth": 3.0, "stepdown": 1.0},
                 "geometry": [[]], "visible": True},
                {"kind": "orient", "rules": [{"type": "lead", "angle": 15}],
                 "visible": True},
                {"kind": "op", "templateId": "pocket", "name": "B",
                 "params": {"depth": 3.0, "stepdown": 1.0},
                 "geometry": [[]], "visible": True},
            ],
            "faces": [], "edges": [],
        })
        assert len(out["op_ranges"]) == 2
        b_start = out["op_ranges"][1]["point_start"]
        second = out["points"][b_start]
        assert abs(second["nx"]) > 0.05   # lead tilt applied

    def test_machine_resolver_hook_used(self):
        called = {}

        def resolver(mid):
            called["id"] = mid
            return None  # fall back to factory/default

        out = webapi.compile_timeline(
            {"entries": [{"kind": "op", "templateId": "pocket",
                          "params": {"depth": 3.0, "stepdown": 1.0},
                          "geometry": [[]], "visible": True}],
             "faces": [], "edges": [], "machine": "generic_5axis_ac"},
            machine_resolver=resolver,
        )
        assert called["id"] == "generic_5axis_ac"
        assert out["point_count"] > 0

    def test_model_sentinel_uses_last_model_path(self):
        out = webapi.compile_timeline(
            {"entries": [{"kind": "op", "templateId": "prusaslicer", "name": "Slice",
                          "params": {}, "geometry": [["__model__"]], "visible": True}],
             "faces": [], "edges": []},
            last_model_path="/tmp/part.step",
        )
        # prusaslicer stub still produces a path even without a real binary
        assert "error" not in out
        assert len(out["op_ranges"]) == 1
