"""Tests for toolpath generation strategies."""

import pytest

from toolpath_engine.core.geometry import Curve, Surface
from toolpath_engine.core.toolpath import ToolpathCollection
from toolpath_engine.strategies.follow_curve import FollowCurveStrategy
from toolpath_engine.strategies.raster_fill import RasterFillStrategy
from toolpath_engine.strategies.contour_parallel import ContourParallelStrategy


# ── FollowCurveStrategy ───────────────────────────────────────────────────────


class TestFollowCurveStrategy:
    def test_generates_collection(self):
        curve = Curve.line((0, 0, 0), (10, 0, 0), num_points=10)
        strat = FollowCurveStrategy()
        result = strat.generate(curve=curve)
        assert isinstance(result, ToolpathCollection)

    def test_single_curve_one_toolpath(self):
        curve = Curve.line((0, 0, 0), (10, 0, 0), num_points=10)
        result = FollowCurveStrategy().generate(curve=curve)
        assert len(result) == 1

    def test_multiple_curves(self):
        curves = [
            Curve.line((0, 0, 0), (10, 0, 0), num_points=5),
            Curve.line((0, 5, 0), (10, 5, 0), num_points=5),
        ]
        result = FollowCurveStrategy().generate(curves=curves)
        assert len(result) == 2

    def test_point_count_matches_curve(self):
        curve = Curve.line((0, 0, 0), (10, 0, 0), num_points=15)
        result = FollowCurveStrategy().generate(curve=curve)
        assert result.total_points() == 15

    def test_resampling_with_spacing(self):
        curve = Curve.line((0, 0, 0), (10, 0, 0), num_points=3)
        result = FollowCurveStrategy().generate(curve=curve, spacing=1.0)
        # After resampling at 1.0 spacing, should have ~10 points
        assert result.total_points() >= 8

    def test_feed_rate_applied(self):
        curve = Curve.line((0, 0, 0), (10, 0, 0), num_points=5)
        result = FollowCurveStrategy().generate(curve=curve, feed_rate=800)
        for pt in result.all_points():
            assert pt.feed_rate == 800

    def test_path_type_applied(self):
        curve = Curve.line((0, 0, 0), (10, 0, 0), num_points=5)
        result = FollowCurveStrategy().generate(curve=curve, path_type="deposit")
        for pt in result.all_points():
            assert pt.path_type == "deposit"

    def test_curve_ref_set(self):
        curve = Curve.line((0, 0, 0), (10, 0, 0), num_points=5)
        curve.name = "weld_path"
        result = FollowCurveStrategy().generate(curve=curve)
        for pt in result.all_points():
            assert pt.curve_ref == "weld_path"

    def test_source_applied(self):
        curve = Curve.line((0, 0, 0), (5, 0, 0), num_points=3)
        result = FollowCurveStrategy().generate(curve=curve, source="my_engine")
        for pt in result.all_points():
            assert pt.source == "my_engine"

    def test_no_input_returns_empty(self):
        result = FollowCurveStrategy().generate()
        assert len(result) == 0

    def test_circle_curve(self):
        curve = Curve.circle(center=(0, 0, 0), radius=10, num_points=32)
        result = FollowCurveStrategy().generate(curve=curve)
        assert result.total_points() == 32

    def test_points_match_curve_positions(self):
        curve = Curve.line((0, 0, 0), (10, 0, 0), num_points=5)
        result = FollowCurveStrategy().generate(curve=curve)
        tp_pts = result.all_points()
        for i, pt in enumerate(tp_pts):
            assert abs(pt.position.x - curve.points[i].x) < 1e-10


# ── RasterFillStrategy ────────────────────────────────────────────────────────


class TestRasterFillStrategy:
    def test_generates_collection(self):
        surface = Surface.plane(origin=(0, 0, 0), normal=(0, 0, 1), size=50)
        result = RasterFillStrategy().generate(surface=surface, spacing=5.0)
        assert isinstance(result, ToolpathCollection)

    def test_produces_points(self):
        surface = Surface.plane(origin=(0, 0, 0), normal=(0, 0, 1), size=50)
        result = RasterFillStrategy().generate(surface=surface, spacing=5.0)
        assert result.total_points() > 0

    def test_feed_rate_applied(self):
        surface = Surface.plane(origin=(0, 0, 0), normal=(0, 0, 1), size=20)
        result = RasterFillStrategy().generate(surface=surface, spacing=5.0, feed_rate=1200)
        for pt in result.all_points():
            assert pt.feed_rate == 1200

    def test_different_angle(self):
        surface = Surface.plane(origin=(0, 0, 0), normal=(0, 0, 1), size=20)
        r0 = RasterFillStrategy().generate(surface=surface, spacing=5.0, angle=0)
        r45 = RasterFillStrategy().generate(surface=surface, spacing=5.0, angle=45)
        assert r0.total_points() > 0
        assert r45.total_points() > 0

    def test_with_boundary_loop(self):
        surface = Surface.plane(origin=(0, 0, 0), normal=(0, 0, 1), size=50)
        # Simple square boundary at z=0
        surface.boundary_loop = [
            (0, 0, 0), (10, 0, 0), (10, 10, 0), (0, 10, 0)
        ]
        result = RasterFillStrategy().generate(surface=surface, spacing=2.0)
        assert isinstance(result, ToolpathCollection)


# ── ContourParallelStrategy ───────────────────────────────────────────────────


class TestContourParallelStrategy:
    def test_generates_collection(self):
        boundary = Curve.circle(center=(0, 0, 0), radius=20, num_points=64)
        result = ContourParallelStrategy().generate(
            boundary=boundary, stepover=3.0, num_passes=3
        )
        assert isinstance(result, ToolpathCollection)

    def test_num_passes(self):
        boundary = Curve.circle(center=(0, 0, 0), radius=20, num_points=64)
        result = ContourParallelStrategy().generate(
            boundary=boundary, stepover=3.0, num_passes=4
        )
        assert len(result) == 4

    def test_inward_direction(self):
        boundary = Curve.circle(center=(0, 0, 0), radius=20, num_points=64)
        result = ContourParallelStrategy().generate(
            boundary=boundary, stepover=3.0, num_passes=3, direction="inward"
        )
        # Each successive pass should be offset further from the boundary.
        # Verify passes have distinct radii, each differing by ~stepover.
        import math
        radii = [
            max(math.sqrt(pt.position.x**2 + pt.position.y**2) for pt in tp.points)
            for tp in result.toolpaths
        ]
        # All passes must be distinct
        assert len(set(round(r, 1) for r in radii)) == len(radii)
        # Each consecutive pair differs by approximately the stepover (3.0)
        for i in range(1, len(radii)):
            assert abs(abs(radii[i] - radii[i - 1]) - 3.0) < 0.5

    def test_feed_rate_applied(self):
        boundary = Curve.circle(center=(0, 0, 0), radius=10, num_points=32)
        result = ContourParallelStrategy().generate(
            boundary=boundary, stepover=2.0, num_passes=2, feed_rate=900
        )
        for pt in result.all_points():
            assert pt.feed_rate == 900
