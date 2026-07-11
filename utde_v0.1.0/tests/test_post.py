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


# ── Flag codes (M3/M4/M8/M9) — regression for the bool-as-int corruption ───────


class TestFlagCodes:
    def _post(self):
        return PostProcessor(Machine.cartesian_3axis())

    def _line_with(self, gcode, token):
        return [l for l in gcode.split("\n")
                if l.startswith("G0") or l.startswith("G1") if token in l]

    def test_spindle_on_true_emits_bare_m3(self):
        col = ToolpathCollection("spin")
        col.add(Toolpath([ToolpathPoint(position=Vector3(0, 0, 0), feed_rate=500,
                                        process_params={"spindle_on_cw": True})], name="c"))
        g = self._post().process(col, resolve_ik=False)
        assert self._line_with(g, "M3")            # emitted
        assert "M31" not in g                       # NOT M3 + "1"

    def test_spindle_off_does_not_emit_program_end(self):
        # The old bug: spindle_on_cw=False formatted M3 + 0 -> "M30" (program end)
        # injected mid-program. It must not appear on a motion line.
        col = ToolpathCollection("spin")
        col.add(Toolpath([
            ToolpathPoint(position=Vector3(0, 0, 0), feed_rate=500,
                          process_params={"spindle_on_cw": False}),
            ToolpathPoint(position=Vector3(10, 0, 0), feed_rate=500,
                          process_params={"spindle_on_cw": False}),
        ], name="c"))
        g = self._post().process(col, resolve_ik=False)
        motion = [l for l in g.split("\n") if l.startswith("G1")]
        assert not any("M30" in l for l in motion)
        assert not any("M3" in l for l in motion)   # off -> no spindle code at all

    def test_coolant_on_emits_m8(self):
        col = ToolpathCollection("cool")
        col.add(Toolpath([ToolpathPoint(position=Vector3(0, 0, 0), feed_rate=500,
                                        process_params={"coolant_on": True})], name="c"))
        g = self._post().process(col, resolve_ik=False)
        assert self._line_with(g, "M8")

    def test_value_word_still_numeric(self):
        # spindle_speed stays a value word: S3000, not a flag.
        col = ToolpathCollection("s")
        col.add(Toolpath([ToolpathPoint(position=Vector3(0, 0, 0), feed_rate=500,
                                        process_params={"spindle_speed": 3000})], name="c"))
        g = self._post().process(col, resolve_ik=False)
        assert "S3000" in g


# ── I/J/K tool-vector output (orientation reaching the G-code) ─────────────────


class TestIjkOutput:
    def _tilted_collection(self):
        col = ToolpathCollection("ijk")
        col.add(Toolpath([
            ToolpathPoint(position=Vector3(0, 0, 0),
                          orientation=Orientation.from_vector(Vector3(1, 0, 1)), feed_rate=500),
            ToolpathPoint(position=Vector3(10, 0, 0),
                          orientation=Orientation.from_vector(Vector3(0, 1, 1)), feed_rate=500),
        ], name="c"))
        return col

    def test_ijk_emitted_when_enabled(self):
        post = PostProcessor(Machine.gantry_5axis_ac(), PostConfig(output_ijk=True))
        g = post.process(self._tilted_collection(), resolve_ik=False)
        assert "I" in g and "J" in g and "K" in g

    def test_ijk_absent_by_default(self):
        post = PostProcessor(Machine.cartesian_3axis())  # output_ijk defaults False
        g = post.process(self._tilted_collection(), resolve_ik=False)
        motion = [l for l in g.split("\n") if l.startswith("G1")]
        assert not any("I" in l or "J" in l or "K" in l for l in motion)

    def test_ijk_modally_suppressed_when_constant(self):
        # Constant orientation -> I/J/K appear once, then suppressed.
        post = PostProcessor(Machine.gantry_5axis_ac(), PostConfig(output_ijk=True))
        col = ToolpathCollection("const")
        col.add(Toolpath([
            ToolpathPoint(position=Vector3(0, 0, 0), orientation=Orientation.z_down(), feed_rate=500),
            ToolpathPoint(position=Vector3(10, 0, 0), orientation=Orientation.z_down(), feed_rate=500),
            ToolpathPoint(position=Vector3(20, 0, 0), orientation=Orientation.z_down(), feed_rate=500),
        ], name="c"))
        g = post.process(col, resolve_ik=False)
        assert sum(l.count("K") for l in g.split("\n") if l.startswith("G1")) == 1


# ── Program assembly: header / body / footer separation ───────────────────────


class TestProgramAssembly:
    def test_process_body_has_no_header_or_footer(self):
        post = PostProcessor(Machine.cartesian_3axis())
        body = post.process_body(make_collection(), resolve_ik=False)
        assert "M30" not in body     # no program end
        assert "%" not in body       # no program markers
        assert "O1000" not in body   # no program number
        assert "G1" in body          # but the motion is there

    def test_process_equals_header_body_footer(self):
        post = PostProcessor(Machine.cartesian_3axis())
        col = make_collection()
        whole = post.process(col, resolve_ik=False)
        reassembled = (post.program_header(col)
                       + post.process_body(col, resolve_ik=False)
                       + post.program_footer())
        assert whole == reassembled

    def test_point_lines_maps_points_to_motion_lines(self):
        post = PostProcessor(Machine.cartesian_3axis())
        col = make_collection(n=3)
        point_lines = []
        body = post.process_body(col, resolve_ik=False, point_lines=point_lines)
        lines = body.split("\n")
        assert len(point_lines) == 3
        for li in point_lines:
            assert li >= 0
            assert lines[li].startswith("G1")

    def test_point_lines_reuses_line_for_suppressed_duplicate(self):
        # A point that repeats the previous position+feed emits no line; it must
        # map to the previous motion line, not drift the whole mapping.
        post = PostProcessor(Machine.cartesian_3axis())
        col = ToolpathCollection("dup")
        col.add(Toolpath([
            ToolpathPoint(position=Vector3(0, 0, 0), orientation=Orientation.z_down(), feed_rate=500),
            ToolpathPoint(position=Vector3(10, 0, 0), orientation=Orientation.z_down(), feed_rate=500),
            ToolpathPoint(position=Vector3(10, 0, 0), orientation=Orientation.z_down(), feed_rate=500),  # dup
            ToolpathPoint(position=Vector3(20, 0, 0), orientation=Orientation.z_down(), feed_rate=500),
        ], name="c"))
        point_lines = []
        body = post.process_body(col, resolve_ik=False, point_lines=point_lines)
        lines = body.split("\n")
        assert len(point_lines) == 4
        assert point_lines[2] == point_lines[1]           # dup reuses prev line
        assert lines[point_lines[3]].endswith("X20.000")  # last point still correct


# ── IK warm-start (continuity across points) ──────────────────────────────────


class TestIkWarmStart:
    def test_initial_guess_steers_degenerate_solution(self):
        # Vertical tool axis leaves table rotation C free; the seed should decide
        # which C is returned — the basis for per-point continuity.
        m = Machine.gantry_5axis_ac()
        pos, orient = Vector3(0, 0, 0), Orientation(0, 0, 1)
        c0 = m.inverse_kinematics(pos, orient, initial_guess={"C": 0})["C"]
        c90 = m.inverse_kinematics(pos, orient, initial_guess={"C": 90})["C"]
        assert abs(c0 - c90) > 30

    def test_processor_threads_previous_solution(self):
        m = Machine.gantry_5axis_ac()
        post = PostProcessor(m)
        col = ToolpathCollection("p")
        col.add(Toolpath([
            ToolpathPoint(position=Vector3(0, 0, 0), orientation=Orientation.z_down(), feed_rate=500),
            ToolpathPoint(position=Vector3(10, 0, 0), orientation=Orientation.z_down(), feed_rate=500),
        ], name="c"))
        post.process(col, resolve_ik=True)
        assert post._prev_joint_solution is not None


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
