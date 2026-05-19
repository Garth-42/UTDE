"""Tests for the prusaslicer template."""

import pytest

import toolpath_engine.templates  # noqa: F401  registers all built-ins
from toolpath_engine import get_process, list_processes
from toolpath_engine.core.toolpath import ToolpathCollection


class TestPrusaSlicerRegistration:
    def test_is_registered(self):
        assert get_process("prusaslicer") is not None

    def test_metadata_has_required_keys(self):
        required = {"id", "name", "label", "kind", "icon", "description",
                    "tags", "requires", "params", "est_time", "est_volume"}
        record = next(t for t in list_processes() if t["id"] == "prusaslicer")
        assert required.issubset(record.keys())

    def test_kind_is_add(self):
        record = next(t for t in list_processes() if t["id"] == "prusaslicer")
        assert record["kind"] == "add"

    def test_requires_model_slot(self):
        record = next(t for t in list_processes() if t["id"] == "prusaslicer")
        assert len(record["requires"]) == 1
        assert record["requires"][0]["type"] == "model"
        assert "label" in record["requires"][0]

    def test_all_params_have_required_fields(self):
        record = next(t for t in list_processes() if t["id"] == "prusaslicer")
        assert len(record["params"]) > 0
        for param in record["params"]:
            assert "id"      in param, f"param missing 'id': {param}"
            assert "type"    in param, f"param missing 'type': {param}"
            assert "default" in param, f"param missing 'default': {param}"
            assert param["type"] in {"number", "select", "segment", "text"}

    def test_config_file_param_is_text_type(self):
        record = next(t for t in list_processes() if t["id"] == "prusaslicer")
        config_param = next(p for p in record["params"] if p["id"] == "config_file")
        assert config_param["type"] == "text"
        assert config_param["default"] == ""


class TestPrusaSlicerRuns:
    def test_returns_toolpath_collection(self):
        fn = get_process("prusaslicer")
        result = fn()
        assert isinstance(result, ToolpathCollection)

    def test_stub_fallback_produces_points(self):
        # No model path, no slicer binary → stub G-code → non-empty collection
        fn = get_process("prusaslicer")
        result = fn(model=None, geometry=[[]], params={})
        assert isinstance(result, ToolpathCollection)
        total = sum(len(tp.points) for tp in result.toolpaths)
        assert total > 0

    def test_points_have_prusaslicer_source(self):
        fn = get_process("prusaslicer")
        result = fn(model=None, geometry=[[]], params={})
        sources = {pt.source for tp in result.toolpaths for pt in tp.points}
        assert "prusaslicer" in sources

    def test_params_accepted_without_error(self):
        fn = get_process("prusaslicer")
        result = fn(model=None, geometry=[[]], params={
            "layer_height": 0.15,
            "infill_density": 30,
            "fill_pattern": "honeycomb",
            "perimeters": 3,
            "support_material": "on",
            "support_material_threshold": 50,
            "brim_width": 5,
        })
        assert isinstance(result, ToolpathCollection)

    def test_missing_model_path_falls_back_to_stub(self):
        fn = get_process("prusaslicer")
        result = fn(model=None, geometry=[[]], params={"_model_path": None})
        total = sum(len(tp.points) for tp in result.toolpaths)
        assert total > 0

    def test_nonexistent_model_path_falls_back_to_stub(self):
        fn = get_process("prusaslicer")
        result = fn(model=None, geometry=[[]], params={"_model_path": "/nonexistent/path.step"})
        total = sum(len(tp.points) for tp in result.toolpaths)
        assert total > 0

    def test_points_have_orientation(self):
        fn = get_process("prusaslicer")
        result = fn(model=None, geometry=[[]], params={})
        for tp in result.toolpaths:
            for pt in tp.points:
                assert pt.orientation is not None
