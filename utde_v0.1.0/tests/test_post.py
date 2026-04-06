"""Tests for PostProcessor, PostConfig, and DebugPostProcessor."""

import json
import pytest

from toolpath_engine.core.primitives import Vector3, Orientation
from toolpath_engine.core.toolpath import ToolpathPoint, Toolpath, ToolpathCollection
from toolpath_engine.kinematics.machine import Machine
from toolpath_engine.post.processor import PostProcessor, PostConfig
from toolpath_engine.post.debug import DebugPostProcessor


def make_collection(n=3, feed=1000.0) -> ToolpathCollection:
    col = ToolpathCollection(name="test_job")
    pts = []
    for i in range(n):
        pt = ToolpathPoint(
            position=Vector3(float(i), 0.0, 0.0),
            orientation=Orientation.z_down(),
            feed_rate=feed,
        )
        pts.append(pt)
    col.add(Toolpath(pts, name="pass_1"))
    return col


# ── PostConfig ────────────────────────────────────────────────────────────────


class TestPostConfig:
    def test_defaults(self):
        cfg = PostConfig()
        assert cfg.program_number == 1000
        assert cfg.units == "metric"
        assert cfg.rapid_code == "G0"
        assert cfg.linear_code == "G1"
        assert cfg.use_tcp is True

    def test_custom_axis_names(self):
        cfg = PostConfig(axis_names={"X": "U", "Y": "V", "Z": "W"})
        assert cfg.axis_names["X"] == "U"

    def test_safe_start_defaults(self):
        cfg = PostConfig()
        assert "G90" in cfg.safe_start

    def test_program_end_defaults(self):
        cfg = PostConfig()
        assert "M30" in cfg.program_end


# ── PostProcessor ─────────────────────────────────────────────────────────────


class TestPostProcessor:
    def _make_3axis_post(self, config=None) -> PostProcessor:
        machine = Machine.cartesian_3axis()
        return PostProcessor(machine, config)

    def test_returns_string(self):
        post = self._make_3axis_post()
        col = make_collection()
        gcode = post.process(col, resolve_ik=False)
        assert isinstance(gcode, str)
        assert len(gcode) > 0

    def test_header_contains_machine_name(self):
        machine = Machine.cartesian_3axis()
        post = PostProcessor(machine)
        col = make_collection()
        gcode = post.process(col, resolve_ik=False)
        assert machine.name in gcode

    def test_header_contains_program_number(self):
        cfg = PostConfig(program_number=5000)
        post = self._make_3axis_post(cfg)
        col = make_collection()
        gcode = post.process(col, resolve_ik=False)
        assert "O5000" in gcode

    def test_safe_start_codes_present(self):
        post = self._make_3axis_post()
        col = make_collection()
        gcode = post.process(col, resolve_ik=False)
        assert "G90" in gcode
        assert "G21" in gcode

    def test_program_end_codes_present(self):
        post = self._make_3axis_post()
        col = make_collection()
        gcode = post.process(col, resolve_ik=False)
        assert "M30" in gcode

    def test_motion_codes_present(self):
        post = self._make_3axis_post()
        col = make_collection()
        gcode = post.process(col, resolve_ik=False)
        assert "G1" in gcode

    def test_rapid_uses_g0(self):
        machine = Machine.cartesian_3axis()
        post = PostProcessor(machine)
        col = ToolpathCollection("rapid_test")
        pt = ToolpathPoint(
            position=Vector3(0, 0, 50),
            orientation=Orientation.z_down(),
            feed_rate=0,
            rapid=True,
        )
        col.add(Toolpath([pt], name="rapid_move"))
        gcode = post.process(col, resolve_ik=False)
        assert "G0" in gcode

    def test_feed_rate_appears_in_output(self):
        post = self._make_3axis_post()
        col = make_collection(feed=1500)
        gcode = post.process(col, resolve_ik=False)
        assert "F1500" in gcode

    def test_modal_suppression_no_duplicate_axes(self):
        """Unchanged axis values should not repeat in consecutive lines."""
        post = self._make_3axis_post()
        col = ToolpathCollection("modal_test")
        # Two points with same Y and Z — only X changes
        pts = [
            ToolpathPoint(position=Vector3(0, 5, 10), orientation=Orientation.z_down(), feed_rate=1000),
            ToolpathPoint(position=Vector3(5, 5, 10), orientation=Orientation.z_down(), feed_rate=1000),
        ]
        col.add(Toolpath(pts, name="modal"))
        gcode = post.process(col, resolve_ik=False)
        # Filter for actual motion lines only (not "G17" or other G1x codes)
        lines = [l for l in gcode.split("\n") if l.startswith("G1 ")]
        # Second G1 line should not contain Y5.000 again
        if len(lines) >= 2:
            assert "Y" not in lines[1]

    def test_line_numbers_when_enabled(self):
        cfg = PostConfig(use_line_numbers=True, line_number_start=10, line_number_increment=10)
        post = self._make_3axis_post(cfg)
        col = make_collection(n=3)
        gcode = post.process(col, resolve_ik=False)
        assert "N10" in gcode

    def test_collection_name_in_output(self):
        post = self._make_3axis_post()
        col = make_collection()
        col.name = "my_weld_job"
        gcode = post.process(col, resolve_ik=False)
        assert "my_weld_job" in gcode

    def test_toolpath_name_in_output(self):
        post = self._make_3axis_post()
        col = make_collection()
        gcode = post.process(col, resolve_ik=False)
        assert "pass_1" in gcode

    def test_process_param_spindle_speed(self):
        post = self._make_3axis_post()
        col = ToolpathCollection("spindle_test")
        pt = ToolpathPoint(
            position=Vector3(0, 0, 0),
            feed_rate=1000,
            process_params={"spindle_speed": 3000},
        )
        col.add(Toolpath([pt], name="cut"))
        gcode = post.process(col, resolve_ik=False)
        assert "S3000" in gcode

    def test_xy_coordinates_in_output(self):
        post = self._make_3axis_post()
        col = make_collection(n=2)
        gcode = post.process(col, resolve_ik=False)
        assert "X0.000" in gcode or "X0" in gcode

    def test_empty_collection(self):
        post = self._make_3axis_post()
        col = ToolpathCollection("empty")
        gcode = post.process(col, resolve_ik=False)
        assert isinstance(gcode, str)
        assert "M30" in gcode

    def test_save_writes_file(self, tmp_path):
        post = self._make_3axis_post()
        col = make_collection()
        filepath = str(tmp_path / "output.nc")
        result = post.save(col, filepath, resolve_ik=False)
        assert result == filepath
        with open(filepath) as f:
            content = f.read()
        assert "G1" in content


# ── DebugPostProcessor ────────────────────────────────────────────────────────


def make_debug_collection() -> ToolpathCollection:
    col = ToolpathCollection(name="debug_job")
    pts = [
        ToolpathPoint(
            position=Vector3(0.0, 0.0, 0.0),
            orientation=Orientation.z_down(),
            feed_rate=500.0,
            source="raster_fill",
            path_type="cut",
        ),
        ToolpathPoint(
            position=Vector3(10.0, 0.0, 0.0),
            orientation=Orientation.z_down(),
            feed_rate=500.0,
            source="raster_fill",
            path_type="cut",
        ),
        ToolpathPoint(
            position=Vector3(10.0, 5.0, 0.0),
            orientation=Orientation.z_down(),
            feed_rate=500.0,
            rapid=True,
            source="raster_fill",
            path_type="travel",
        ),
    ]
    col.add(Toolpath(pts, name="layer_0"))
    return col


class TestDebugPostProcessor:
    def test_invalid_format_raises(self):
        with pytest.raises(ValueError):
            DebugPostProcessor(format="gcode")

    def test_text_returns_string(self):
        post = DebugPostProcessor(format="text")
        out = post.process(make_debug_collection())
        assert isinstance(out, str)
        assert len(out) > 0

    def test_text_contains_collection_name(self):
        post = DebugPostProcessor(format="text")
        out = post.process(make_debug_collection())
        assert "debug_job" in out

    def test_text_contains_toolpath_name(self):
        post = DebugPostProcessor(format="text")
        out = post.process(make_debug_collection())
        assert "layer_0" in out

    def test_text_contains_xyz_coordinates(self):
        post = DebugPostProcessor(format="text")
        out = post.process(make_debug_collection())
        assert "X=" in out
        assert "Y=" in out
        assert "Z=" in out

    def test_text_contains_ijk_orientation(self):
        post = DebugPostProcessor(format="text")
        out = post.process(make_debug_collection())
        assert "IJK" in out

    def test_text_contains_source_and_path_type(self):
        post = DebugPostProcessor(format="text")
        out = post.process(make_debug_collection())
        assert "raster_fill" in out
        assert "cut" in out

    def test_text_rapid_flag_shown(self):
        post = DebugPostProcessor(format="text")
        out = post.process(make_debug_collection())
        assert "rapid=Y" in out

    def test_text_feed_rate_shown(self):
        post = DebugPostProcessor(format="text")
        out = post.process(make_debug_collection())
        assert "feed=500" in out

    def test_text_point_indices(self):
        post = DebugPostProcessor(format="text")
        out = post.process(make_debug_collection())
        assert "#0000" in out
        assert "#0001" in out

    def test_json_returns_valid_json(self):
        post = DebugPostProcessor(format="json")
        out = post.process(make_debug_collection())
        data = json.loads(out)
        assert data["collection"] == "debug_job"
        assert data["total_points"] == 3

    def test_json_structure(self):
        post = DebugPostProcessor(format="json")
        data = json.loads(post.process(make_debug_collection()))
        tp = data["toolpaths"][0]
        assert tp["name"] == "layer_0"
        pt = tp["points"][0]
        assert "position" in pt
        assert "orientation" in pt
        assert "feed_rate" in pt
        assert "source" in pt
        assert "path_type" in pt

    def test_json_position_values(self):
        post = DebugPostProcessor(format="json")
        data = json.loads(post.process(make_debug_collection()))
        pt = data["toolpaths"][0]["points"][1]
        assert pt["position"]["x"] == pytest.approx(10.0)

    def test_json_rapid_flag(self):
        post = DebugPostProcessor(format="json")
        data = json.loads(post.process(make_debug_collection()))
        pts = data["toolpaths"][0]["points"]
        assert pts[2]["rapid"] is True
        assert pts[0]["rapid"] is False

    def test_large_move_warning_text(self):
        post = DebugPostProcessor(format="text", large_move_threshold=5.0)
        col = ToolpathCollection("warn_test")
        pts = [
            ToolpathPoint(position=Vector3(0, 0, 0), orientation=Orientation.z_down(), feed_rate=100),
            ToolpathPoint(position=Vector3(200, 0, 0), orientation=Orientation.z_down(), feed_rate=100),
        ]
        col.add(Toolpath(pts, name="big_move"))
        out = post.process(col)
        assert "WARN: large move" in out

    def test_large_move_warning_json(self):
        post = DebugPostProcessor(format="json", large_move_threshold=5.0)
        col = ToolpathCollection("warn_test")
        pts = [
            ToolpathPoint(position=Vector3(0, 0, 0), orientation=Orientation.z_down(), feed_rate=100),
            ToolpathPoint(position=Vector3(200, 0, 0), orientation=Orientation.z_down(), feed_rate=100),
        ]
        col.add(Toolpath(pts, name="big_move"))
        data = json.loads(post.process(col))
        assert "warnings" in data["toolpaths"][0]["points"][1]

    def test_zero_orientation_warning(self):
        post = DebugPostProcessor(format="text")
        col = ToolpathCollection("zero_orient")
        pt = ToolpathPoint(
            position=Vector3(0, 0, 0),
            orientation=Orientation(i=0.0, j=0.0, k=0.0),
            feed_rate=100,
        )
        col.add(Toolpath([pt], name="bad_orient"))
        out = post.process(col)
        assert "zero-length orientation" in out

    def test_no_warning_for_normal_move(self):
        post = DebugPostProcessor(format="text")
        out = post.process(make_debug_collection())
        assert "WARN" not in out

    def test_process_params_shown_in_text(self):
        post = DebugPostProcessor(format="text")
        col = ToolpathCollection("params_test")
        pt = ToolpathPoint(
            position=Vector3(0, 0, 0),
            orientation=Orientation.z_down(),
            feed_rate=100,
            process_params={"power": 1500, "wire_feed": 8.0},
        )
        col.add(Toolpath([pt], name="cut"))
        out = post.process(col)
        assert "power" in out
        assert "wire_feed" in out

    def test_empty_collection(self):
        post = DebugPostProcessor(format="text")
        col = ToolpathCollection("empty")
        out = post.process(col)
        assert "empty" in out
        assert isinstance(out, str)
