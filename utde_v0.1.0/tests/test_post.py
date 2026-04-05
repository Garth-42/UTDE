"""Tests for PostProcessor and PostConfig."""

import pytest

from toolpath_engine.core.primitives import Vector3, Orientation
from toolpath_engine.core.toolpath import ToolpathPoint, Toolpath, ToolpathCollection
from toolpath_engine.kinematics.machine import Machine
from toolpath_engine.post.processor import PostProcessor, PostConfig


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
