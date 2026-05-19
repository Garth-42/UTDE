"""Tests for template registration, metadata, and behaviour."""

import pytest

import toolpath_engine.templates  # noqa: F401  registers the built-ins
from toolpath_engine import get_process, list_processes
from toolpath_engine.core.toolpath import ToolpathCollection
from toolpath_engine.core.geometry import Surface


# ── Registration ─────────────────────────────────────────────────────────────


class TestRegistration:
    def test_pocket_is_registered(self):
        assert get_process("pocket") is not None

    def test_ded_5axis_is_registered(self):
        assert get_process("ded-5axis-helical") is not None

    def test_libslic3r_is_registered(self):
        assert get_process("libslic3r") is not None

    def test_raster_fill_is_registered(self):
        assert get_process("raster_fill") is not None

    def test_follow_curve_is_registered(self):
        assert get_process("follow_curve") is not None

    def test_contour_parallel_is_registered(self):
        assert get_process("contour_parallel") is not None

    def test_unknown_template_raises(self):
        with pytest.raises(KeyError):
            get_process("not-a-real-template")


# ── Metadata schema ──────────────────────────────────────────────────────────


class TestMetadataSchema:
    """Every template must expose the UI-shaped metadata the front end consumes."""

    REQUIRED_KEYS = {
        "id", "name", "label", "kind", "icon", "description",
        "tags", "requires", "params", "est_time", "est_volume",
    }

    def _by_id(self, tid):
        return next(t for t in list_processes() if t["id"] == tid)

    def test_every_record_has_required_keys(self):
        for record in list_processes():
            assert self.REQUIRED_KEYS.issubset(record.keys()), \
                f"missing keys for {record['id']}: {self.REQUIRED_KEYS - record.keys()}"

    def test_pocket_metadata_is_complete(self):
        p = self._by_id("pocket")
        assert p["kind"]      == "sub"
        assert p["label"]     == "Pocket"
        assert p["icon"]      == "pocket"
        assert p["est_time"]  == pytest.approx(4.6)
        assert len(p["requires"]) == 1
        assert p["requires"][0]["type"] == "face"

    def test_pocket_params_have_required_fields(self):
        p = self._by_id("pocket")
        assert len(p["params"]) > 0
        for param in p["params"]:
            assert "id"      in param
            assert "type"    in param
            assert "default" in param
            assert param["type"] in {"number", "select", "segment", "text"}

    def test_requires_entries_have_type_and_label(self):
        for record in list_processes():
            for slot in record["requires"]:
                assert slot["type"] in {"face", "edge", "vertex", "model"}
                assert "label" in slot

    def test_kind_is_string_or_none(self):
        for record in list_processes():
            assert record["kind"] is None or isinstance(record["kind"], str)


# ── Pocket end-to-end (Q5(b): multi-strategy bundling) ───────────────────────


class TestStrategyTemplatesMetadata:
    """Each strategy template must surface UI metadata in the same shape
    as the composed Operations so the front-end Library renders them
    uniformly."""

    def _by_id(self, tid):
        return next(t for t in list_processes() if t["id"] == tid)

    def test_raster_fill_metadata(self):
        m = self._by_id("raster_fill")
        assert m["kind"]  == "primitive"
        assert m["label"] == "Raster Fill"
        assert len(m["requires"]) == 1
        assert m["requires"][0]["type"] == "face"
        assert any(p["id"] == "spacing" for p in m["params"])

    def test_follow_curve_metadata(self):
        m = self._by_id("follow_curve")
        assert m["kind"]  == "primitive"
        assert m["label"] == "Follow Curve"
        assert m["requires"][0]["type"]  == "edge"
        assert m["requires"][0]["count"] == 0   # multi-pick

    def test_contour_parallel_metadata(self):
        m = self._by_id("contour_parallel")
        assert m["kind"]  == "primitive"
        assert m["label"] == "Contour Parallel"
        assert m["requires"][0]["type"] == "edge"
        ids = {p["id"] for p in m["params"]}
        assert {"stepover", "num_passes", "direction"}.issubset(ids)


class TestStrategyTemplatesRun:
    def test_raster_fill_runs(self):
        result = get_process("raster_fill")()
        assert isinstance(result, ToolpathCollection)
        assert any(len(tp.points) > 0 for tp in result.toolpaths)

    def test_follow_curve_runs(self):
        result = get_process("follow_curve")()
        assert isinstance(result, ToolpathCollection)
        assert any(len(tp.points) > 0 for tp in result.toolpaths)

    def test_contour_parallel_runs(self):
        result = get_process("contour_parallel")()
        assert isinstance(result, ToolpathCollection)
        # contour_parallel emits one toolpath per pass
        assert len(result.toolpaths) >= 1

    def test_raster_fill_uses_picked_surface(self):
        from toolpath_engine.core.geometry import Surface
        face = Surface.plane(origin=(0, 0, 0), size=80, name="picked_top")
        result = get_process("raster_fill")(geometry=[[face]])
        assert any(len(tp.points) > 0 for tp in result.toolpaths)


class TestLibSlic3rTemplate:
    def test_libslic3r_requires_model_slot(self):
        m = next(t for t in list_processes() if t["id"] == "libslic3r")
        assert len(m["requires"]) == 1
        assert m["requires"][0]["type"] == "model"

    def test_libslic3r_params_include_temperatures(self):
        m = next(t for t in list_processes() if t["id"] == "libslic3r")
        ids = {p["id"] for p in m["params"]}
        assert {"extruder_temperature", "bed_temperature", "nozzle_diameter",
                "filament_diameter", "config_file"}.issubset(ids)

    def test_libslic3r_config_file_is_text_type(self):
        m = next(t for t in list_processes() if t["id"] == "libslic3r")
        cfg = next(p for p in m["params"] if p["id"] == "config_file")
        assert cfg["type"] == "text"

    def test_libslic3r_stub_fallback_produces_points(self):
        result = get_process("libslic3r")()
        assert isinstance(result, ToolpathCollection)
        total = sum(len(tp.points) for tp in result.toolpaths)
        assert total > 0

    def test_libslic3r_points_have_libslic3r_source(self):
        result = get_process("libslic3r")()
        sources = {pt.source for tp in result.toolpaths for pt in tp.points}
        assert "libslic3r" in sources


class TestPocketRuns:
    def test_pocket_returns_collection(self):
        result = get_process("pocket")()
        assert isinstance(result, ToolpathCollection)

    def test_pocket_produces_rough_and_finish(self):
        """Q5(b) — one Operation entry must be allowed to call multiple strategies."""
        result = get_process("pocket")()
        path_types = set()
        for tp in result.toolpaths:
            for pt in tp.points:
                path_types.add(pt.path_type)
        assert "rough" in path_types
        assert "finish" in path_types

    def test_pocket_z_stepdown_creates_layers(self):
        """Lower stepdown should produce more rough toolpaths."""
        shallow = get_process("pocket")(params={"depth": 8.0, "stepdown": 4.0})
        deep    = get_process("pocket")(params={"depth": 8.0, "stepdown": 1.0})
        n_shallow = sum(1 for tp in shallow.toolpaths
                        for pt in tp.points if pt.path_type == "rough")
        n_deep = sum(1 for tp in deep.toolpaths
                     for pt in tp.points if pt.path_type == "rough")
        assert n_deep > n_shallow

    def test_pocket_picked_face_overrides_fallback(self):
        face = Surface.plane(origin=(0, 0, 0), size=200, name="picked_floor")
        result = get_process("pocket")(geometry=[[face]])
        assert any("picked_floor" in tp.name for tp in result.toolpaths)
