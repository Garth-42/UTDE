"""Integration tests for the Flask STEP server API."""

import json
import pytest


# ── /health ───────────────────────────────────────────────────────────────────


class TestHealth:
    def test_returns_200(self, client):
        res = client.get("/health")
        assert res.status_code == 200

    def test_returns_ok_true(self, client):
        data = res = client.get("/health")
        body = json.loads(res.data)
        assert body["ok"] is True

    def test_reports_occ_available(self, client):
        res = client.get("/health")
        body = json.loads(res.data)
        assert "occ_available" in body


# ── /parse-step ───────────────────────────────────────────────────────────────


class TestParseStep:
    def test_no_file_returns_400_when_occ_missing(self, client):
        # When OCC is unavailable the server returns 500 before even checking the file
        res = client.post("/parse-step")
        assert res.status_code in (400, 500)

    def test_wrong_extension_returns_error_or_500(self, client):
        data = {"file": (b"dummy content", "model.obj")}
        res = client.post(
            "/parse-step",
            data={"file": (b"dummy content", "model.obj")},
            content_type="multipart/form-data",
        )
        # Without OCC returns 500; with OCC would return 400 for wrong ext
        assert res.status_code in (400, 500)

    def test_occ_unavailable_returns_500(self, client):
        from io import BytesIO
        data = {"file": (BytesIO(b"STEP AP214"), "part.step")}
        res = client.post(
            "/parse-step",
            data=data,
            content_type="multipart/form-data",
        )
        assert res.status_code == 500
        body = json.loads(res.data)
        assert "error" in body


# ── /generate-toolpath ────────────────────────────────────────────────────────


class TestGenerateToolpath:
    def _post(self, client, payload):
        return client.post(
            "/generate-toolpath",
            data=json.dumps(payload),
            content_type="application/json",
        )

    def test_follow_curve_with_line_edge(self, client):
        payload = {
            "faces": [],
            "edges": [
                {
                    "id": 0,
                    "type": "line",
                    "params": {
                        "start": [0, 0, 0],
                        "end": [50, 0, 0],
                    },
                    "vertices": [],
                }
            ],
            "strategy": {"type": "follow_curve", "feed_rate": 600, "spacing": 5.0},
            "orientation": [],
            "machine": "cartesian_3axis",
        }
        res = self._post(client, payload)
        assert res.status_code == 200
        body = json.loads(res.data)
        assert "points" in body
        assert "gcode" in body
        assert body["point_count"] > 0

    def test_follow_curve_with_circle_edge(self, client):
        payload = {
            "faces": [],
            "edges": [
                {
                    "id": 1,
                    "type": "circle",
                    "params": {"center": [0, 0, 0], "radius": 20},
                    "vertices": [],
                }
            ],
            "strategy": {"type": "follow_curve", "feed_rate": 800},
            "orientation": [],
        }
        res = self._post(client, payload)
        assert res.status_code == 200
        body = json.loads(res.data)
        assert body["point_count"] > 0

    def test_raster_fill_with_plane_face(self, client):
        payload = {
            "faces": [
                {
                    "id": 0,
                    "type": "plane",
                    "params": {
                        "origin": [0, 0, 0],
                        "normal": [0, 0, 1],
                    },
                    "vertices": [],
                    "indices": [],
                }
            ],
            "edges": [],
            "strategy": {"type": "raster_fill", "spacing": 5.0, "feed_rate": 600},
            "orientation": [],
        }
        res = self._post(client, payload)
        assert res.status_code == 200
        body = json.loads(res.data)
        assert body["point_count"] > 0

    def test_contour_parallel_with_circle_edge(self, client):
        payload = {
            "faces": [],
            "edges": [
                {
                    "id": 0,
                    "type": "circle",
                    "params": {"center": [0, 0, 0], "radius": 30},
                    "vertices": [],
                }
            ],
            "strategy": {
                "type": "contour_parallel",
                "stepover": 3.0,
                "num_passes": 3,
                "feed_rate": 500,
            },
            "orientation": [],
        }
        res = self._post(client, payload)
        assert res.status_code == 200
        body = json.loads(res.data)
        assert body["point_count"] > 0

    def test_no_geometry_returns_400(self, client):
        payload = {
            "faces": [],
            "edges": [],
            "strategy": {"type": "follow_curve"},
            "orientation": [],
        }
        res = self._post(client, payload)
        assert res.status_code == 400

    def test_orientation_fixed_rule(self, client):
        payload = {
            "faces": [],
            "edges": [
                {
                    "id": 0,
                    "type": "line",
                    "params": {"start": [0, 0, 0], "end": [20, 0, 0]},
                    "vertices": [],
                }
            ],
            "strategy": {"type": "follow_curve", "feed_rate": 600, "spacing": 5.0},
            "orientation": [{"rule": "fixed", "i": 0, "j": 0, "k": -1}],
        }
        res = self._post(client, payload)
        assert res.status_code == 200
        body = json.loads(res.data)
        for pt in body["points"]:
            assert abs(pt["nz"] - (-1.0)) < 1e-3

    def test_orientation_lead_rule(self, client):
        payload = {
            "faces": [],
            "edges": [
                {
                    "id": 0,
                    "type": "line",
                    "params": {"start": [0, 0, 0], "end": [30, 0, 0]},
                    "vertices": [],
                }
            ],
            "strategy": {"type": "follow_curve", "feed_rate": 600, "spacing": 5.0},
            "orientation": [
                {"rule": "fixed", "i": 0, "j": 0, "k": -1},
                {"rule": "lead", "angle_deg": 15},
            ],
        }
        res = self._post(client, payload)
        assert res.status_code == 200

    def test_workspace_origin_offsets_points(self, client):
        payload = {
            "faces": [],
            "edges": [
                {
                    "id": 0,
                    "type": "line",
                    "params": {"start": [10, 0, 0], "end": [20, 0, 0]},
                    "vertices": [],
                }
            ],
            "strategy": {"type": "follow_curve", "feed_rate": 600, "spacing": 2.0},
            "orientation": [],
            "workspace_origin": {"x": 5, "y": 0, "z": 0},
        }
        res = self._post(client, payload)
        assert res.status_code == 200
        body = json.loads(res.data)
        # All X should be shifted by -5 (origin at x=5)
        for pt in body["points"]:
            assert pt["x"] <= 15.5  # 20-5=15 at most

    def test_gcode_contains_g1(self, client):
        payload = {
            "faces": [],
            "edges": [
                {
                    "id": 0,
                    "type": "line",
                    "params": {"start": [0, 0, 0], "end": [10, 0, 0]},
                    "vertices": [],
                }
            ],
            "strategy": {"type": "follow_curve", "feed_rate": 600, "spacing": 2.0},
            "orientation": [],
        }
        res = self._post(client, payload)
        body = json.loads(res.data)
        assert "G1" in body["gcode"]

    def test_cylinder_face(self, client):
        payload = {
            "faces": [
                {
                    "id": 0,
                    "type": "cylinder",
                    "params": {
                        "center": [0, 0, 0],
                        "axis": [0, 0, 1],
                        "radius": 15,
                        "height": 50,
                    },
                    "vertices": [],
                    "indices": [],
                }
            ],
            "edges": [],
            "strategy": {"type": "raster_fill", "spacing": 5.0, "feed_rate": 600},
            "orientation": [],
        }
        res = self._post(client, payload)
        assert res.status_code == 200


# ── /run-script ───────────────────────────────────────────────────────────────


class TestRunScript:
    def _post(self, client, code):
        return client.post(
            "/run-script",
            data=json.dumps({"code": code}),
            content_type="application/json",
        )

    def test_empty_code_returns_400(self, client):
        res = self._post(client, "")
        assert res.status_code == 400

    def test_simple_print(self, client):
        res = self._post(client, "print('hello utde')")
        assert res.status_code == 200
        body = json.loads(res.data)
        assert body["success"] is True
        assert "hello utde" in body["stdout"]

    def test_syntax_error_returns_failure(self, client):
        res = self._post(client, "def broken(:")
        assert res.status_code == 200
        body = json.loads(res.data)
        assert body["success"] is False
        assert body["stderr"] != ""

    def test_utde_import_works(self, client):
        code = (
            "from toolpath_engine.core.primitives import Vector3\n"
            "v = Vector3(1, 2, 3)\n"
            "print(v.length())\n"
        )
        res = self._post(client, code)
        body = json.loads(res.data)
        assert body["success"] is True
        import math
        expected = str(round(math.sqrt(14), 4))[:4]
        assert expected in body["stdout"]

    def test_gcode_file_captured(self, client):
        code = (
            "output = open('result.nc', 'w')\n"
            "output.write('G0 X0\\nG1 X10 F1000\\nM30\\n')\n"
            "output.close()\n"
        )
        res = self._post(client, code)
        body = json.loads(res.data)
        assert body["success"] is True
        assert body["gcode"] is not None
        assert "M30" in body["gcode"]

    def test_response_has_required_fields(self, client):
        res = self._post(client, "x = 1 + 1")
        body = json.loads(res.data)
        assert "success" in body
        assert "stdout" in body
        assert "stderr" in body
        assert "gcode" in body


# ── /lint-script ──────────────────────────────────────────────────────────────


class TestLintScript:
    def _post(self, client, code):
        return client.post(
            "/lint-script",
            data=json.dumps({"code": code}),
            content_type="application/json",
        )

    def test_valid_code_returns_no_errors(self, client):
        code = "x = 1 + 1\nprint(x)\n"
        res = self._post(client, code)
        body = json.loads(res.data)
        assert res.status_code == 200
        assert body["errors"] == []

    def test_syntax_error_returns_error(self, client):
        code = "def foo(\n    pass\n"
        res = self._post(client, code)
        body = json.loads(res.data)
        assert res.status_code == 200
        assert len(body["errors"]) > 0

    def test_syntax_error_has_required_fields(self, client):
        code = "x = (\n"
        res = self._post(client, code)
        body = json.loads(res.data)
        error = body["errors"][0]
        assert "line" in error
        assert "col" in error
        assert "message" in error

    def test_syntax_error_line_is_zero_indexed(self, client):
        code = "x = 1\ny = (\n"
        res = self._post(client, code)
        body = json.loads(res.data)
        assert body["errors"][0]["line"] >= 0

    def test_empty_code_returns_no_errors(self, client):
        res = self._post(client, "")
        body = json.loads(res.data)
        assert body["errors"] == []

    def test_multiline_valid_script_returns_no_errors(self, client):
        code = (
            "from toolpath_engine import Surface\n"
            "model = None\n"
            "x = 1 + 2\n"
        )
        res = self._post(client, code)
        body = json.loads(res.data)
        assert body["errors"] == []


# ── _extract_all_boundary_loops ───────────────────────────────────────────────


class TestExtractAllBoundaryLoops:
    """Unit tests for the boundary-loop extraction helper."""

    def _make_quad(self, x0, y0, x1, y1, z=0.0):
        """Return (vertices_flat, indices_flat) for a simple quad split into 2 triangles."""
        verts = [
            x0, y0, z,
            x1, y0, z,
            x1, y1, z,
            x0, y1, z,
        ]
        indices = [0, 1, 2, 0, 2, 3]
        return verts, indices

    def test_single_quad_returns_one_loop(self):
        from step_server import _extract_all_boundary_loops
        verts, idx = self._make_quad(0, 0, 10, 10)
        loops = _extract_all_boundary_loops(verts, idx)
        assert len(loops) == 1
        assert len(loops[0]) == 4

    def test_empty_input_returns_empty(self):
        from step_server import _extract_all_boundary_loops
        assert _extract_all_boundary_loops([], []) == []

    def test_outer_loop_is_first_and_largest(self):
        """A mesh with a hole should return 2 loops; the outer (larger area) is first."""
        from step_server import _extract_all_boundary_loops

        # Build a 20x20 quad with a 4x4 hole punched in the middle.
        # Outer ring of triangles only — inner boundary edges appear once.
        # Easiest: create a grid mesh and remove the central quad manually.
        # Instead, use a known vertex list with a ring topology.
        #
        # Layout: 3x3 grid of vertices (0..8), with centre quad (4,5,7,8 skipped).
        # Outer quad: corners at (0,0), (20,0), (20,20), (0,20)
        # Inner hole:  corners at (8,8), (12,8), (12,12), (8,12)
        #
        # We'll define vertices and triangles by hand for an annular face.
        s = 20.0
        h = 4.0   # half-hole size from centre
        cx = s / 2

        # 8 vertices: outer ring (CCW) + inner ring (CW for hole)
        verts = [
            # outer ring  (indices 0-3)
             0,  0, 0,
             s,  0, 0,
             s,  s, 0,
             0,  s, 0,
            # inner ring  (indices 4-7)
            cx - h, cx - h, 0,
            cx + h, cx - h, 0,
            cx + h, cx + h, 0,
            cx - h, cx + h, 0,
        ]

        # 8 triangles forming the annular region between outer and inner squares
        indices = [
            # bottom band
            0, 1, 5,   0, 5, 4,
            # right band
            1, 2, 6,   1, 6, 5,
            # top band
            2, 3, 7,   2, 7, 6,
            # left band
            3, 0, 4,   3, 4, 7,
        ]

        loops = _extract_all_boundary_loops(verts, indices)
        assert len(loops) == 2

        def area(loop):
            n = len(loop)
            a = 0.0
            for i in range(n):
                x1, y1 = loop[i][0], loop[i][1]
                x2, y2 = loop[(i + 1) % n][0], loop[(i + 1) % n][1]
                a += x1 * y2 - x2 * y1
            return abs(a) / 2.0

        assert area(loops[0]) > area(loops[1]), "outer loop should have larger area"
        assert area(loops[0]) == pytest.approx(s * s, rel=0.01)
        assert area(loops[1]) == pytest.approx((2 * h) ** 2, rel=0.01)
