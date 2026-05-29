"""Integration tests for the Flask STEP server API."""

import json
import pytest


# ── static SPA serving (Docker / production single-process deployment) ─────────


class TestStaticServing:
    """`_enable_static_serving` lets one Flask process serve the built SPA and
    the API together (no Vite proxy). Exercised on a throwaway app so the
    catch-all route never leaks into the shared `client` fixture."""

    @pytest.fixture()
    def spa_client(self, tmp_path):
        import step_server
        from flask import Flask, jsonify

        app = Flask("spa_test")

        @app.route("/health")
        def _health():
            return jsonify(ok=True)

        (tmp_path / "index.html").write_text("<html>UTDE SPA</html>")
        assets = tmp_path / "assets"
        assets.mkdir()
        (assets / "app.js").write_text("console.log('utde')")

        step_server._enable_static_serving(app, str(tmp_path))
        with app.test_client() as c:
            yield c

    def test_root_serves_index_html(self, spa_client):
        res = spa_client.get("/")
        assert res.status_code == 200
        assert b"UTDE SPA" in res.data

    def test_real_asset_is_served(self, spa_client):
        res = spa_client.get("/assets/app.js")
        assert res.status_code == 200
        assert b"console.log('utde')" in res.data

    def test_unknown_path_falls_back_to_index(self, spa_client):
        # Client-side routes must resolve to index.html for SPA routing.
        res = spa_client.get("/some/client/route")
        assert res.status_code == 200
        assert b"UTDE SPA" in res.data

    def test_api_prefix_is_stripped_to_root_route(self, spa_client):
        # Browser-mode frontend calls /api/* ; middleware strips it so the
        # existing root-level API routes handle the request.
        res = spa_client.get("/api/health")
        assert res.status_code == 200
        assert json.loads(res.data)["ok"] is True


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


# ── /templates ────────────────────────────────────────────────────────────────


class TestTemplates:
    def test_returns_200(self, client):
        res = client.get("/templates")
        assert res.status_code == 200

    def test_returns_array(self, client):
        body = json.loads(client.get("/templates").data)
        assert "templates" in body
        assert isinstance(body["templates"], list)

    def test_includes_pocket(self, client):
        body = json.loads(client.get("/templates").data)
        ids = [t["id"] for t in body["templates"]]
        assert "pocket" in ids

    def test_includes_prusaslicer(self, client):
        body = json.loads(client.get("/templates").data)
        ids = [t["id"] for t in body["templates"]]
        assert "prusaslicer" in ids

    def test_prusaslicer_has_model_requires(self, client):
        body = json.loads(client.get("/templates").data)
        ps = next(t for t in body["templates"] if t["id"] == "prusaslicer")
        assert len(ps["requires"]) == 1
        assert ps["requires"][0]["type"] == "model"

    def test_includes_strategy_primitives(self, client):
        body = json.loads(client.get("/templates").data)
        ids = [t["id"] for t in body["templates"]]
        for tid in ("raster_fill", "follow_curve", "contour_parallel"):
            assert tid in ids

    def test_strategy_primitives_tagged_with_kind(self, client):
        body = json.loads(client.get("/templates").data)
        by_id = {t["id"]: t for t in body["templates"]}
        for tid in ("raster_fill", "follow_curve", "contour_parallel"):
            assert by_id[tid]["kind"] == "primitive"

    def test_pocket_record_has_ui_metadata(self, client):
        body = json.loads(client.get("/templates").data)
        pocket = next(t for t in body["templates"] if t["id"] == "pocket")
        assert pocket["kind"]    == "sub"
        assert pocket["label"]   == "Pocket"
        assert pocket["icon"]    == "pocket"
        assert isinstance(pocket["requires"], list)
        assert isinstance(pocket["params"],   list)
        assert pocket["requires"][0]["type"] == "face"

    def test_every_template_has_required_keys(self, client):
        body = json.loads(client.get("/templates").data)
        required = {"id", "name", "label", "kind", "icon",
                    "requires", "params", "est_time", "est_volume"}
        for t in body["templates"]:
            assert required.issubset(t.keys()), \
                f"missing keys for {t['id']}: {required - t.keys()}"


# ── /machines ─────────────────────────────────────────────────────────────────


class TestMachines:
    def test_lists_machines_directory(self, client):
        res = client.get("/machines")
        assert res.status_code == 200
        body = json.loads(res.data)
        ids = [m["id"] for m in body["machines"]]
        assert "generic_5axis_ac" in ids

    def test_machine_record_has_expected_keys(self, client):
        body = json.loads(client.get("/machines").data)
        m = next(x for x in body["machines"] if x["id"] == "generic_5axis_ac")
        for k in ("id", "name", "path", "axis_count", "tool_axes", "workpiece_axes"):
            assert k in m
        assert m["axis_count"] == 5

    def test_import_rejects_invalid_yaml(self, client):
        # Missing tool_chain entirely — Machine.from_dict accepts that, so
        # we instead exercise the "no payload" failure mode.
        res = client.post("/machines/import")
        assert res.status_code == 400
        assert "error" in json.loads(res.data)

    def test_import_rejects_unparseable_yaml(self, client, tmp_path):
        from io import BytesIO
        data = {"file": (BytesIO(b":  bad: : :"), "broken.yaml")}
        res = client.post(
            "/machines/import",
            data=data,
            content_type="multipart/form-data",
        )
        assert res.status_code == 400

    def test_import_saves_and_returns_summary(self, client, tmp_path, monkeypatch):
        """A valid YAML should land in MACHINES_DIR and surface in /machines."""
        import step_server
        from io import BytesIO

        # Sandbox MACHINES_DIR so the test doesn't litter the repo.
        sandbox = tmp_path / "machines"
        sandbox.mkdir()
        monkeypatch.setattr(step_server, "MACHINES_DIR", str(sandbox))

        yaml_blob = b"""
name: testpick
tool_chain:
  - name: X
    type: linear
    axis: [1, 0, 0]
    limits: [0, 500]
    home: 0
  - name: Z
    type: linear
    axis: [0, 0, 1]
    limits: [0, 400]
    home: 0
"""
        data = {"file": (BytesIO(yaml_blob), "testpick.yaml")}
        res = client.post(
            "/machines/import",
            data=data,
            content_type="multipart/form-data",
        )
        assert res.status_code == 200
        m = json.loads(res.data)["machine"]
        assert m["id"] == "testpick"
        assert m["axis_count"] == 2
        assert (sandbox / "testpick.yaml").exists()

        # And it shows up in the list
        listed = json.loads(client.get("/machines").data)["machines"]
        assert any(x["id"] == "testpick" for x in listed)


# ── /compile-timeline ─────────────────────────────────────────────────────────


class TestCompileTimeline:
    def _post(self, client, payload):
        return client.post(
            "/compile-timeline",
            data=json.dumps(payload),
            content_type="application/json",
        )

    def test_empty_timeline_returns_200_with_no_points(self, client):
        res = self._post(client, {"entries": [], "faces": [], "edges": []})
        assert res.status_code == 200
        body = json.loads(res.data)
        assert body["point_count"] == 0
        assert body["op_ranges"]   == []
        assert body["warnings"]    == []

    def test_single_op_compiles(self, client):
        res = self._post(client, {
            "entries": [
                {"kind": "op", "uid": "op_1", "templateId": "pocket",
                 "name": "Pocket A",
                 "params": {"depth": 3.0, "stepdown": 1.0},
                 "geometry": [[]], "visible": True},
            ],
            "faces": [], "edges": [],
        })
        assert res.status_code == 200
        body = json.loads(res.data)
        assert body["point_count"] > 0
        assert len(body["op_ranges"]) == 1
        assert body["op_ranges"][0]["templateId"] == "pocket"
        assert body["op_ranges"][0]["kind"]       == "sub"
        assert "(--- OP 01" in body["gcode"]

    def test_unknown_template_emits_warning(self, client):
        res = self._post(client, {
            "entries": [
                {"kind": "op", "uid": "op_1", "templateId": "no-such-template",
                 "name": "Bogus", "params": {}, "geometry": [], "visible": True},
            ],
            "faces": [], "edges": [],
        })
        body = json.loads(res.data)
        assert any("no-such-template" in w for w in body["warnings"])
        assert body["op_ranges"] == []

    def test_hidden_entries_are_skipped(self, client):
        res = self._post(client, {
            "entries": [
                {"kind": "op", "uid": "op_1", "templateId": "pocket",
                 "name": "Hidden",
                 "params": {"depth": 3.0, "stepdown": 1.0},
                 "geometry": [[]], "visible": False},
                {"kind": "op", "uid": "op_2", "templateId": "pocket",
                 "name": "Visible",
                 "params": {"depth": 3.0, "stepdown": 1.0},
                 "geometry": [[]], "visible": True},
            ],
            "faces": [], "edges": [],
        })
        body = json.loads(res.data)
        assert len(body["op_ranges"]) == 1
        assert body["op_ranges"][0]["name"] == "Visible"

    def test_orient_row_applies_chain_to_subsequent_ops(self, client):
        """Q3(c-entry) + append-mode: an orient row sets the active chain
        for ops below it; chain is applied on top of template defaults."""
        res = self._post(client, {
            "entries": [
                {"kind": "op", "uid": "op_a", "templateId": "pocket",
                 "name": "A",
                 "params": {"depth": 3.0, "stepdown": 1.0},
                 "geometry": [[]], "visible": True},
                {"kind": "orient", "uid": "or_1",
                 "rules": [{"type": "lead", "angle": 15}],
                 "visible": True},
                {"kind": "op", "uid": "op_b", "templateId": "pocket",
                 "name": "B",
                 "params": {"depth": 3.0, "stepdown": 1.0},
                 "geometry": [[]], "visible": True},
            ],
            "faces": [], "edges": [],
        })
        body = json.loads(res.data)
        assert len(body["op_ranges"]) == 2
        a_end = body["op_ranges"][0]["point_end"]
        b_start = body["op_ranges"][1]["point_start"]

        # First op: template default fixed(0,0,-1) — no lead applied
        first = body["points"][0]
        assert abs(first["nz"] + 1.0) < 0.01
        assert abs(first["nx"]) < 0.01

        # Second op: lead(15°) → tilted ~sin(15°) ≈ 0.259 in travel direction
        second = body["points"][b_start]
        assert abs(second["nz"]) < 1.0          # no longer (0,0,-1)
        assert abs(second["nx"]) > 0.05         # tilt is non-trivial

    def test_hidden_orient_row_does_not_apply(self, client):
        res = self._post(client, {
            "entries": [
                {"kind": "orient", "uid": "or_1",
                 "rules": [{"type": "lead", "angle": 30}],
                 "visible": False},
                {"kind": "op", "uid": "op_a", "templateId": "pocket",
                 "name": "A",
                 "params": {"depth": 3.0, "stepdown": 1.0},
                 "geometry": [[]], "visible": True},
            ],
            "faces": [], "edges": [],
        })
        body = json.loads(res.data)
        first = body["points"][0]
        # Hidden orient row should not have applied — orientation is the
        # template default (0, 0, -1).
        assert abs(first["nx"]) < 0.01
        assert abs(first["nz"] + 1.0) < 0.01

    def test_orient_chain_replaces_at_next_orient(self, client):
        """A second orient row replaces (not stacks) the active chain."""
        res = self._post(client, {
            "entries": [
                {"kind": "orient", "uid": "or_1",
                 "rules": [{"type": "lead", "angle": 30}],
                 "visible": True},
                {"kind": "op", "uid": "op_a", "templateId": "pocket",
                 "name": "A",
                 "params": {"depth": 3.0, "stepdown": 1.0},
                 "geometry": [[]], "visible": True},
                {"kind": "orient", "uid": "or_2",
                 "rules": [{"type": "fixed", "x": 0, "y": 0, "z": -1}],
                 "visible": True},
                {"kind": "op", "uid": "op_b", "templateId": "pocket",
                 "name": "B",
                 "params": {"depth": 3.0, "stepdown": 1.0},
                 "geometry": [[]], "visible": True},
            ],
            "faces": [], "edges": [],
        })
        body = json.loads(res.data)
        b_start = body["op_ranges"][1]["point_start"]
        # After or_2, chain is just fixed(0,0,-1); B should be vertical, not
        # carrying the 30° lead from or_1.
        second = body["points"][b_start]
        assert abs(second["nz"] + 1.0) < 0.01
        assert abs(second["nx"]) < 0.01

    def test_scene_rows_are_silently_skipped(self, client):
        """Scene rows (import/clear) are imperative on the live geometry
        and shouldn't trigger 'unknown kind' warnings or break compile."""
        res = self._post(client, {
            "entries": [
                {"kind": "scene", "uid": "s1", "action": "import", "visible": True},
                {"kind": "op",    "uid": "op_1", "templateId": "pocket",
                 "name": "Pocket",
                 "params": {"depth": 3.0, "stepdown": 1.0},
                 "geometry": [[]], "visible": True},
                {"kind": "scene", "uid": "s2", "action": "clear",  "visible": True},
            ],
            "faces": [], "edges": [],
        })
        body = json.loads(res.data)
        assert body["warnings"] == []
        assert len(body["op_ranges"]) == 1

    def test_resolves_machine_id_to_yaml_file(self, client):
        """`machine: "generic_5axis_ac"` should load the YAML, not just a factory."""
        res = self._post(client, {
            "entries": [
                {"kind": "op", "uid": "op_1", "templateId": "pocket",
                 "name": "Pocket",
                 "params": {"depth": 3.0, "stepdown": 1.0},
                 "geometry": [[]], "visible": True},
            ],
            "faces": [], "edges": [],
            "machine": "generic_5axis_ac",
        })
        assert res.status_code == 200
        body = json.loads(res.data)
        # G-code should reference the YAML's name field, not the factory's
        assert "generic_5axis_ac" in body["gcode"]

    def test_falls_back_to_factory_for_unknown_machine(self, client):
        res = self._post(client, {
            "entries": [
                {"kind": "op", "uid": "op_1", "templateId": "pocket",
                 "name": "Pocket",
                 "params": {"depth": 3.0, "stepdown": 1.0},
                 "geometry": [[]], "visible": True},
            ],
            "faces": [], "edges": [],
            "machine": "definitely-not-a-machine",
        })
        assert res.status_code == 200

    def test_gcode_has_op_dividers(self, client):
        res = self._post(client, {
            "entries": [
                {"kind": "op", "uid": "op_1", "templateId": "pocket",
                 "name": "First",
                 "params": {"depth": 3.0, "stepdown": 1.0},
                 "geometry": [[]], "visible": True},
                {"kind": "op", "uid": "op_2", "templateId": "pocket",
                 "name": "Second",
                 "params": {"depth": 3.0, "stepdown": 1.0},
                 "geometry": [[]], "visible": True},
            ],
            "faces": [], "edges": [],
        })
        body = json.loads(res.data)
        assert "(--- OP 01  First ---)" in body["gcode"]
        assert "(--- OP 02  Second ---)" in body["gcode"]
        # gcode line ranges should be monotonic
        ranges = body["op_ranges"]
        assert ranges[0]["gcode_start_line"] < ranges[0]["gcode_end_line"]
        assert ranges[1]["gcode_start_line"] >= ranges[0]["gcode_end_line"]


# ── /compile-timeline — prusaslicer ──────────────────────────────────────────


class TestCompileTimelineSlicer:
    def _post(self, client, payload):
        return client.post(
            "/compile-timeline",
            data=json.dumps(payload),
            content_type="application/json",
        )

    def test_prusaslicer_entry_compiles_with_stub(self, client):
        # No STEP file loaded (_LAST_MODEL_PATH is None) → falls back to stub G-code
        res = self._post(client, {
            "entries": [
                {"kind": "op", "uid": "op_ps", "templateId": "prusaslicer",
                 "name": "Slice",
                 "params": {"layer_height": 0.2},
                 "geometry": [["__model__"]], "visible": True},
            ],
            "faces": [], "edges": [],
        })
        assert res.status_code == 200
        body = json.loads(res.data)
        assert "error" not in body
        assert body["point_count"] > 0
        assert len(body["op_ranges"]) == 1
        assert body["op_ranges"][0]["templateId"] == "prusaslicer"

    def test_prusaslicer_model_path_injected_when_step_loaded(self, client, tmp_path):
        import step_server
        # Simulate a previously-parsed STEP file by setting the global.
        fake_step = tmp_path / "part.step"
        fake_step.write_text("placeholder")
        original = step_server._LAST_MODEL_PATH
        step_server._LAST_MODEL_PATH = str(fake_step)
        try:
            res = self._post(client, {
                "entries": [
                    {"kind": "op", "uid": "op_ps", "templateId": "prusaslicer",
                     "name": "Slice",
                     "params": {},
                     "geometry": [["__model__"]], "visible": True},
                ],
                "faces": [], "edges": [],
            })
            assert res.status_code == 200
            body = json.loads(res.data)
            assert body["point_count"] > 0
        finally:
            step_server._LAST_MODEL_PATH = original


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
