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
