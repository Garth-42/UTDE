"""Tests for ToolpathPoint, Toolpath, and ToolpathCollection."""

import pytest

from toolpath_engine.core.primitives import Vector3, Orientation, Position
from toolpath_engine.core.toolpath import ToolpathPoint, Toolpath, ToolpathCollection


def make_point(x=0.0, y=0.0, z=0.0, feed=1000.0) -> ToolpathPoint:
    return ToolpathPoint(
        position=Vector3(x, y, z),
        orientation=Orientation.z_down(),
        feed_rate=feed,
    )


def make_line_toolpath(n=5, name="tp") -> Toolpath:
    pts = [make_point(x=float(i)) for i in range(n)]
    return Toolpath(pts, name=name)


# ── ToolpathPoint ─────────────────────────────────────────────────────────────


class TestToolpathPoint:
    def test_defaults(self):
        pt = ToolpathPoint()
        assert pt.position.x == 0.0
        assert pt.feed_rate == 0.0
        assert pt.rapid is False
        assert pt.source == "manual"
        assert pt.path_type == "cut"

    def test_xyz_property(self):
        pt = make_point(1, 2, 3)
        arr = pt.xyz
        assert arr[0] == 1.0 and arr[1] == 2.0 and arr[2] == 3.0

    def test_ijk_property(self):
        pt = ToolpathPoint(orientation=Orientation(0, 0, -1))
        arr = pt.ijk
        assert arr[2] == -1.0

    def test_copy_is_deep(self):
        pt = make_point(1, 2, 3)
        copy = pt.copy()
        copy.position = Vector3(99, 99, 99)
        assert pt.position.x == 1.0  # original unchanged

    def test_with_position(self):
        pt = make_point(0, 0, 0)
        moved = pt.with_position(Vector3(5, 5, 5))
        assert moved.position.x == 5.0
        assert pt.position.x == 0.0  # original unchanged

    def test_with_orientation(self):
        pt = make_point()
        new_orient = Orientation(1, 0, 0)
        changed = pt.with_orientation(new_orient)
        assert changed.orientation.i == 1.0

    def test_with_feed(self):
        pt = make_point(feed=500)
        fast = pt.with_feed(2000)
        assert fast.feed_rate == 2000
        assert pt.feed_rate == 500  # original unchanged

    def test_set_and_get_param(self):
        pt = make_point()
        pt.set_param("wire_feed", 3.5)
        assert pt.get_param("wire_feed") == 3.5

    def test_get_param_default(self):
        pt = make_point()
        assert pt.get_param("missing", default=42) == 42


# ── Toolpath ──────────────────────────────────────────────────────────────────


class TestToolpath:
    def test_empty(self):
        tp = Toolpath()
        assert len(tp) == 0
        assert tp.start is None
        assert tp.end is None

    def test_append(self):
        tp = Toolpath()
        tp.append(make_point(1, 0, 0))
        assert len(tp) == 1

    def test_iteration(self):
        tp = make_line_toolpath(3)
        pts = list(tp)
        assert len(pts) == 3

    def test_getitem(self):
        tp = make_line_toolpath(5)
        assert tp[0].position.x == 0.0
        assert tp[4].position.x == 4.0

    def test_slice(self):
        tp = make_line_toolpath(5)
        sliced = tp[1:3]
        assert isinstance(sliced, Toolpath)
        assert len(sliced) == 2

    def test_start_end(self):
        tp = make_line_toolpath(5)
        assert tp.start.position.x == 0.0
        assert tp.end.position.x == 4.0

    def test_concatenation(self):
        a = make_line_toolpath(3, name="a")
        b = make_line_toolpath(3, name="b")
        combined = a + b
        assert len(combined) == 6

    def test_total_length(self):
        tp = make_line_toolpath(5)
        # Points at x=0,1,2,3,4 — total length should be 4
        assert abs(tp.total_length() - 4.0) < 1e-10

    def test_total_length_empty(self):
        tp = Toolpath()
        assert tp.total_length() == 0.0

    def test_bounding_box(self):
        tp = make_line_toolpath(5)
        lo, hi = tp.bounding_box()
        assert lo.x == 0.0
        assert hi.x == 4.0

    def test_bounding_box_empty(self):
        tp = Toolpath()
        lo, hi = tp.bounding_box()
        assert isinstance(lo, Vector3)

    def test_set_feed_rate(self):
        tp = make_line_toolpath(3)
        tp.set_feed_rate(1500)
        for pt in tp:
            assert pt.feed_rate == 1500

    def test_set_param(self):
        tp = make_line_toolpath(3)
        tp.set_param("laser_power", 100)
        for pt in tp:
            assert pt.process_params["laser_power"] == 100

    def test_set_path_type(self):
        tp = make_line_toolpath(3)
        tp.set_path_type("deposit")
        for pt in tp:
            assert pt.path_type == "deposit"

    def test_where_filter(self):
        tp = make_line_toolpath(5)
        filtered = tp.where(lambda pt: pt.position.x > 2)
        assert len(filtered) == 2  # x=3, x=4

    def test_transform(self):
        tp = make_line_toolpath(3)
        shifted = tp.transform(lambda pt: pt.with_position(
            Vector3(pt.position.x + 10, pt.position.y, pt.position.z)
        ))
        assert shifted[0].position.x == 10.0
        assert tp[0].position.x == 0.0  # original unchanged

    def test_orient_applies_rule(self):
        tp = make_line_toolpath(3)
        fixed_orient = Orientation(1, 0, 0)
        tp.orient(lambda pt, ctx: fixed_orient)
        for pt in tp:
            assert pt.orientation.i == 1.0

    def test_orient_rule_can_return_none(self):
        tp = make_line_toolpath(3)
        original = tp[0].orientation
        tp.orient(lambda pt, ctx: None)  # no-op rule
        assert tp[0].orientation == original

    def test_rapid_to(self):
        pos = Position(10, 20, 30, name="safe")
        tp = Toolpath.rapid_to(pos)
        assert len(tp) == 1
        assert tp[0].rapid is True
        assert tp[0].path_type == "rapid"
        assert tp[0].position.x == 10

    def test_linear_to(self):
        pos = Position(5, 5, 5)
        tp = Toolpath.linear_to(pos, feed=800)
        assert len(tp) == 1
        assert tp[0].feed_rate == 800
        assert tp[0].path_type == "travel"


# ── ToolpathCollection ────────────────────────────────────────────────────────


class TestToolpathCollection:
    def test_empty(self):
        col = ToolpathCollection()
        assert len(col) == 0
        assert col.total_points() == 0
        assert col.total_length() == 0.0

    def test_add(self):
        col = ToolpathCollection()
        col.add(make_line_toolpath(5))
        assert len(col) == 1
        assert col.total_points() == 5

    def test_add_with_layer(self):
        col = ToolpathCollection()
        col.add(make_line_toolpath(3), layer=0)
        col.add(make_line_toolpath(3), layer=1)
        assert 0 in col.layers
        assert 1 in col.layers

    def test_all_points(self):
        col = ToolpathCollection()
        col.add(make_line_toolpath(3))
        col.add(make_line_toolpath(4))
        assert len(col.all_points()) == 7

    def test_total_length(self):
        col = ToolpathCollection()
        col.add(make_line_toolpath(5))  # length=4
        col.add(make_line_toolpath(5))  # length=4
        assert abs(col.total_length() - 8.0) < 1e-10

    def test_set_feed_rate(self):
        col = ToolpathCollection()
        col.add(make_line_toolpath(3))
        col.set_feed_rate(2000)
        for pt in col.all_points():
            assert pt.feed_rate == 2000

    def test_set_param(self):
        col = ToolpathCollection()
        col.add(make_line_toolpath(2))
        col.set_param("power", 75)
        for pt in col.all_points():
            assert pt.process_params["power"] == 75

    def test_orient(self):
        col = ToolpathCollection()
        col.add(make_line_toolpath(3))
        col.orient(lambda pt, ctx: Orientation(0, 1, 0))
        for pt in col.all_points():
            assert pt.orientation.j == 1.0

    def test_iteration(self):
        col = ToolpathCollection()
        col.add(make_line_toolpath(2, name="first"))
        col.add(make_line_toolpath(2, name="second"))
        names = [tp.name for tp in col]
        assert "first" in names and "second" in names

    def test_repr(self):
        col = ToolpathCollection("run1")
        col.add(make_line_toolpath(3))
        assert "run1" in repr(col)
