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
        result = FollowCurveStrategy().generate(curves=curves, chain=False)
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

    def test_normal_offset_lifts_z(self):
        curve = Curve.line((0, 0, 0), (10, 0, 0), num_points=5)
        result = FollowCurveStrategy().generate(curve=curve, normal_offset=2.0)
        for pt in result.all_points():
            assert abs(pt.position.z - 2.0) < 1e-9

    def test_normal_offset_negative(self):
        curve = Curve.line((0, 0, 0), (10, 0, 0), num_points=5)
        result = FollowCurveStrategy().generate(curve=curve, normal_offset=-1.5)
        for pt in result.all_points():
            assert abs(pt.position.z - (-1.5)) < 1e-9

    def test_inset_shifts_laterally(self):
        # Curve travels in +X; default normal is +Z; lateral = tangent × normal = X × Z = -Y
        curve = Curve.line((0, 0, 0), (10, 0, 0), num_points=5)
        result = FollowCurveStrategy().generate(curve=curve, inset=3.0)
        for pt in result.all_points():
            assert abs(pt.position.y - (-3.0)) < 1e-9
            assert abs(pt.position.z) < 1e-9

    def test_normal_offset_and_inset_combined(self):
        curve = Curve.line((0, 0, 0), (10, 0, 0), num_points=5)
        result = FollowCurveStrategy().generate(curve=curve, normal_offset=1.0, inset=2.0)
        for pt in result.all_points():
            assert abs(pt.position.z - 1.0) < 1e-9
            assert abs(pt.position.y - (-2.0)) < 1e-9

    def test_zero_offsets_unchanged(self):
        curve = Curve.line((0, 0, 0), (10, 0, 0), num_points=5)
        base = FollowCurveStrategy().generate(curve=curve)
        offset = FollowCurveStrategy().generate(curve=curve, normal_offset=0.0, inset=0.0)
        for a, b in zip(base.all_points(), offset.all_points()):
            assert abs(a.position.x - b.position.x) < 1e-9
            assert abs(a.position.y - b.position.y) < 1e-9
            assert abs(a.position.z - b.position.z) < 1e-9

    def test_chain_false_produces_separate_toolpaths(self):
        curves = [
            Curve.line((0, 0, 0), (5, 0, 0), num_points=5),
            Curve.line((5, 0, 0), (10, 0, 0), num_points=5),
        ]
        result = FollowCurveStrategy().generate(curves=curves, chain=False)
        assert len(result) == 2

    def test_chain_true_produces_single_toolpath(self):
        curves = [
            Curve.line((0, 0, 0), (5, 0, 0), num_points=5),
            Curve.line((5, 0, 0), (10, 0, 0), num_points=5),
        ]
        result = FollowCurveStrategy().generate(curves=curves, chain=True)
        assert len(result) == 1

    def test_chain_total_points(self):
        curves = [
            Curve.line((0, 0, 0), (5, 0, 0), num_points=5),
            Curve.line((5, 0, 0), (10, 0, 0), num_points=5),
        ]
        result = FollowCurveStrategy().generate(curves=curves, chain=True)
        # Both curves concatenated = 10 points
        assert result.total_points() == 10

    def test_chain_orients_all_curves_forward(self):
        # c2 runs backward relative to travel direction — chain must flip it
        c1 = Curve.line((0, 0, 0), (5, 0, 0), num_points=6)
        c2 = Curve.line((10, 0, 0), (5, 0, 0), num_points=6)  # stored backward
        result = FollowCurveStrategy().generate(curves=[c1, c2], chain=True)
        pts = result.all_points()
        xs = [p.position.x for p in pts]
        # Path should start near 0 and end near 10 — no doubling back
        assert xs[0] < xs[-1]
        assert max(xs) <= 10.0 + 1e-9

    def test_chain_no_backtracking_three_curves(self):
        # Three lines in travel order but supplied in scrambled order
        c1 = Curve.line((0,  0, 0), (5,  0, 0), num_points=3)
        c2 = Curve.line((20, 0, 0), (25, 0, 0), num_points=3)
        c3 = Curve.line((10, 0, 0), (15, 0, 0), num_points=3)
        result = FollowCurveStrategy().generate(curves=[c1, c2, c3], chain=True)
        pts = result.all_points()
        xs = [p.position.x for p in pts]
        # Each x should be >= the previous (monotonically non-decreasing)
        for i in range(1, len(xs)):
            assert xs[i] >= xs[i - 1] - 1e-9, f"backtrack at index {i}: {xs[i-1]:.2f} → {xs[i]:.2f}"

    def test_chain_single_curve_unchanged(self):
        curve = Curve.line((0, 0, 0), (10, 0, 0), num_points=5)
        r_chain   = FollowCurveStrategy().generate(curve=curve, chain=True)
        r_no_chain= FollowCurveStrategy().generate(curve=curve, chain=False)
        assert r_chain.total_points() == r_no_chain.total_points()

    def test_chain_connected_u_shape(self):
        # Three segments forming a U: right, down, left — topology-based chaining
        # must follow the physical connections, not a global direction.
        c1 = Curve.line((0, 0, 0), (10, 0, 0), num_points=3)   # rightward
        c2 = Curve.line((10, 0, 0), (10, 10, 0), num_points=3)  # downward
        c3 = Curve.line((10, 10, 0), (0, 10, 0), num_points=3)  # leftward
        # Supply in scrambled order
        result = FollowCurveStrategy().generate(curves=[c3, c1, c2], chain=True)
        pts = result.all_points()
        assert len(pts) == 9
        # Path must be continuous: each successive point within a small jump
        for i in range(1, len(pts)):
            prev = pts[i - 1].position
            curr = pts[i].position
            dist = ((curr.x - prev.x)**2 + (curr.y - prev.y)**2 + (curr.z - prev.z)**2) ** 0.5
            # Max jump between any two consecutive points should be ≤ 10 (leg length)
            assert dist <= 10.0 + 1e-6, f"gap {dist:.2f} at index {i}"

    def test_chain_start_connects_at_end_zero(self):
        # Regression: DFS must not terminate early when the start curve's
        # only connection is at its *start* (end 0) rather than its end (end 1).
        # c3 starts at (10,0,0) which matches c2's start — so c3 connects at end 0.
        c1 = Curve.line((0, 0, 0), (5, 0, 0), num_points=3)
        c2 = Curve.line((5, 0, 0), (10, 0, 0), num_points=3)
        c3 = Curve.line((10, 0, 0), (15, 0, 0), num_points=3)
        # Supply in reverse order so curve 0 in the list is c3 (connects at start)
        result = FollowCurveStrategy().generate(curves=[c3, c2, c1], chain=True)
        pts = result.all_points()
        assert len(pts) == 9
        # Must be continuous — no gaps larger than 5 (the leg length)
        for i in range(1, len(pts)):
            prev, curr = pts[i - 1].position, pts[i].position
            dist = ((curr.x-prev.x)**2 + (curr.y-prev.y)**2 + (curr.z-prev.z)**2)**0.5
            assert dist <= 5.0 + 1e-6, f"jump {dist:.2f} between points {i-1} and {i}"

    def test_chain_connected_reversed_middle(self):
        # Middle segment stored backward — topology must flip it.
        c1 = Curve.line((0, 0, 0), (5, 0, 0), num_points=3)
        c2 = Curve.line((10, 0, 0), (5, 0, 0), num_points=3)   # stored backward
        c3 = Curve.line((10, 0, 0), (15, 0, 0), num_points=3)
        result = FollowCurveStrategy().generate(curves=[c1, c2, c3], chain=True)
        pts = result.all_points()
        xs = [p.position.x for p in pts]
        # Should start at 0 and end at 15 with no gaps > 5
        assert xs[0] < 1e-6
        assert abs(xs[-1] - 15.0) < 1e-6

    def test_normal_offset_with_surface(self):
        from toolpath_engine.core.geometry import Surface
        surf = Surface.plane(origin=(0, 0, 5), normal=(0, 0, 1))
        curve = Curve.line((0, 0, 5), (10, 0, 5), num_points=5)
        result = FollowCurveStrategy().generate(curve=curve, normal_offset=2.0, surface=surf)
        for pt in result.all_points():
            assert abs(pt.position.z - 7.0) < 1e-6


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

    def test_interior_hole_reduces_points(self):
        """Points inside the hole should be excluded when respect_interior_boundaries=True."""
        surface = Surface.plane(origin=(0, 0, 0), normal=(0, 0, 1), size=50)
        # Outer boundary: 40x40 square
        surface.boundary_loop = [
            (-20, -20, 0), (20, -20, 0), (20, 20, 0), (-20, 20, 0)
        ]
        # Interior hole: 10x10 square at centre
        surface.interior_loops = [
            [(-5, -5, 0), (5, -5, 0), (5, 5, 0), (-5, 5, 0)]
        ]
        with_holes = RasterFillStrategy().generate(
            surface=surface, spacing=2.0, respect_interior_boundaries=True
        )
        without_holes = RasterFillStrategy().generate(
            surface=surface, spacing=2.0, respect_interior_boundaries=False
        )
        # Respecting the hole must produce fewer points
        assert with_holes.total_points() < without_holes.total_points()

    def test_interior_hole_no_points_inside_hole(self):
        """No generated point should land inside the hole polygon."""
        surface = Surface.plane(origin=(0, 0, 0), normal=(0, 0, 1), size=50)
        surface.boundary_loop = [
            (-20, -20, 0), (20, -20, 0), (20, 20, 0), (-20, 20, 0)
        ]
        # 6x6 hole centred at origin
        hx = 3.0
        surface.interior_loops = [
            [(-hx, -hx, 0), (hx, -hx, 0), (hx, hx, 0), (-hx, hx, 0)]
        ]
        result = RasterFillStrategy().generate(
            surface=surface, spacing=1.0, step_size=0.5,
            respect_interior_boundaries=True
        )
        for pt in result.all_points():
            x, y = pt.position.x, pt.position.y
            # No point should be strictly inside the 6x6 hole
            assert not (-hx < x < hx and -hx < y < hx), (
                f"Point ({x:.3f}, {y:.3f}) found inside hole"
            )

    def test_respect_false_ignores_holes(self):
        """With respect_interior_boundaries=False the hole has no effect."""
        surface = Surface.plane(origin=(0, 0, 0), normal=(0, 0, 1), size=50)
        surface.boundary_loop = [
            (-20, -20, 0), (20, -20, 0), (20, 20, 0), (-20, 20, 0)
        ]
        surface.interior_loops = [
            [(-5, -5, 0), (5, -5, 0), (5, 5, 0), (-5, 5, 0)]
        ]
        surface_no_holes = Surface.plane(origin=(0, 0, 0), normal=(0, 0, 1), size=50)
        surface_no_holes.boundary_loop = surface.boundary_loop

        result_ignored = RasterFillStrategy().generate(
            surface=surface, spacing=2.0, respect_interior_boundaries=False
        )
        result_plain = RasterFillStrategy().generate(
            surface=surface_no_holes, spacing=2.0
        )
        assert result_ignored.total_points() == result_plain.total_points()

    def test_edge_boundary_single_curve(self):
        """A closed Curve passed as boundary produces a toolpath inside it."""
        boundary = Curve.from_points(
            [(-15, -15, 0), (15, -15, 0), (15, 15, 0), (-15, 15, 0)],
            name="square", closed=True,
        )
        result = RasterFillStrategy().generate(boundary=boundary, spacing=3.0)
        assert result.total_points() > 0

    def test_edge_boundary_multi_curve(self):
        """Multiple curves that form a closed loop are accepted via curves=."""
        side_a = Curve.from_points([(-10, -10, 0), (10, -10, 0)], name="a")
        side_b = Curve.from_points([(10, -10, 0), (10, 10, 0)],  name="b")
        side_c = Curve.from_points([(10, 10, 0),  (-10, 10, 0)], name="c")
        side_d = Curve.from_points([(-10, 10, 0), (-10, -10, 0)],name="d")
        result = RasterFillStrategy().generate(curves=[side_a, side_b, side_c, side_d], spacing=3.0)
        assert result.total_points() > 0

    def test_edge_boundary_stays_inside_loop(self):
        """All generated points must lie within the bounding box of the boundary curve."""
        boundary = Curve.from_points(
            [(-10, -10, 0), (10, -10, 0), (10, 10, 0), (-10, 10, 0)],
            name="square", closed=True,
        )
        result = RasterFillStrategy().generate(boundary=boundary, spacing=2.0, step_size=1.0)
        for pt in result.all_points():
            assert -11 <= pt.position.x <= 11
            assert -11 <= pt.position.y <= 11

    def test_edge_boundary_tilted_plane(self):
        """Edge boundary on a non-horizontal plane is handled correctly."""
        import math
        # 45° tilted square boundary
        pts = [
            (0, 0, 0), (10, 0, 0), (10, 0, 10), (0, 0, 10)
        ]
        boundary = Curve.from_points(pts, name="tilted", closed=True)
        result = RasterFillStrategy().generate(boundary=boundary, spacing=2.0)
        assert result.total_points() > 0


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

    def test_boundaries_list_uses_first_when_chain_false(self):
        b1 = Curve.circle(center=(0, 0, 0), radius=10, num_points=32)
        b2 = Curve.circle(center=(0, 0, 0), radius=20, num_points=32)
        result = ContourParallelStrategy().generate(
            boundaries=[b1, b2], stepover=2.0, num_passes=2, chain=False
        )
        # Without chaining, only the first boundary is used — still produces passes
        assert isinstance(result, ToolpathCollection)
        assert len(result) == 2

    def test_boundaries_chain_produces_collection(self):
        # Two connected line segments forming a chain
        b1 = Curve.line((0, 0, 0), (10, 0, 0), num_points=5)
        b2 = Curve.line((10, 0, 0), (20, 0, 0), num_points=5)
        result = ContourParallelStrategy().generate(
            boundaries=[b1, b2], stepover=1.0, num_passes=2, chain=True
        )
        assert isinstance(result, ToolpathCollection)
        assert len(result) == 2

    def test_boundaries_chain_more_points_than_single(self):
        # Chained boundary has more points → more toolpath points per pass
        single = Curve.line((0, 0, 0), (10, 0, 0), num_points=5)
        b1 = Curve.line((0, 0, 0), (5, 0, 0), num_points=3)
        b2 = Curve.line((5, 0, 0), (10, 0, 0), num_points=3)
        r_single = ContourParallelStrategy().generate(boundary=single, stepover=1.0, num_passes=1)
        r_chain  = ContourParallelStrategy().generate(boundaries=[b1, b2], stepover=1.0, num_passes=1, chain=True)
        assert r_chain.total_points() >= r_single.total_points()


# ── Surface.max_step_for_tolerance / max_spacing_for_scallop ────────────────

class TestSurfacePrecisionMethods:
    def test_flat_surface_returns_inf(self):
        plane = Surface.plane()
        assert plane.max_step_for_tolerance(0.1) == float("inf")
        assert plane.max_spacing_for_scallop(0.05) == float("inf")

    def test_cylinder_step_finite(self):
        cyl = Surface.cylinder(center=(0, 0, 0), axis=(0, 0, 1), radius=50, height=100)
        step = cyl.max_step_for_tolerance(0.1)
        assert 0 < step < float("inf")

    def test_cylinder_spacing_finite(self):
        cyl = Surface.cylinder(center=(0, 0, 0), axis=(0, 0, 1), radius=50, height=100)
        spacing = cyl.max_spacing_for_scallop(0.05)
        assert 0 < spacing < float("inf")

    def test_sphere_step_finite(self):
        sph = Surface.sphere(center=(0, 0, 0), radius=30)
        step = sph.max_step_for_tolerance(0.1)
        assert 0 < step < float("inf")

    def test_smaller_tolerance_gives_smaller_step(self):
        cyl = Surface.cylinder(center=(0, 0, 0), axis=(0, 0, 1), radius=50, height=100)
        assert cyl.max_step_for_tolerance(0.05) < cyl.max_step_for_tolerance(0.2)

    def test_smaller_scallop_gives_smaller_spacing(self):
        cyl = Surface.cylinder(center=(0, 0, 0), axis=(0, 0, 1), radius=50, height=100)
        assert cyl.max_spacing_for_scallop(0.02) < cyl.max_spacing_for_scallop(0.1)

    def test_tighter_radius_gives_smaller_step(self):
        cyl_small = Surface.cylinder(center=(0, 0, 0), axis=(0, 0, 1), radius=10, height=100)
        cyl_large = Surface.cylinder(center=(0, 0, 0), axis=(0, 0, 1), radius=100, height=100)
        assert cyl_small.max_step_for_tolerance(0.1) < cyl_large.max_step_for_tolerance(0.1)

    def test_invalid_tolerance_raises(self):
        plane = Surface.plane()
        with pytest.raises(ValueError):
            plane.max_step_for_tolerance(0)
        with pytest.raises(ValueError):
            plane.max_spacing_for_scallop(-1.0)


# ── RasterFillStrategy chord_tolerance / scallop_height ─────────────────────

class TestRasterFillPrecisionParams:
    def test_chord_tolerance_reduces_step_on_cylinder(self):
        cyl = Surface.cylinder(center=(0, 0, 0), axis=(0, 0, 1), radius=50, height=100)
        # Large explicit step_size; tight chord_tolerance should force finer steps
        result_coarse = RasterFillStrategy().generate(
            surface=cyl, spacing=5.0, step_size=20.0
        )
        result_fine = RasterFillStrategy().generate(
            surface=cyl, spacing=5.0, step_size=20.0, chord_tolerance=0.01
        )
        assert result_fine.total_points() >= result_coarse.total_points()

    def test_scallop_height_reduces_spacing_on_cylinder(self):
        cyl = Surface.cylinder(center=(0, 0, 0), axis=(0, 0, 1), radius=50, height=100)
        result_coarse = RasterFillStrategy().generate(
            surface=cyl, spacing=20.0
        )
        result_fine = RasterFillStrategy().generate(
            surface=cyl, spacing=20.0, scallop_height=0.01
        )
        assert result_fine.total_points() >= result_coarse.total_points()

    def test_chord_tolerance_no_effect_on_flat_surface(self):
        plane = Surface.plane(origin=(0, 0, 0), normal=(0, 0, 1))
        # flat → max_step_for_tolerance returns inf, so step_size unchanged
        result_default = RasterFillStrategy().generate(
            surface=plane, spacing=5.0, step_size=2.0
        )
        result_with_tol = RasterFillStrategy().generate(
            surface=plane, spacing=5.0, step_size=2.0, chord_tolerance=0.001
        )
        assert result_default.total_points() == result_with_tol.total_points()

    def test_scallop_height_no_effect_on_flat_surface(self):
        plane = Surface.plane(origin=(0, 0, 0), normal=(0, 0, 1))
        result_default = RasterFillStrategy().generate(
            surface=plane, spacing=5.0
        )
        result_with_scallop = RasterFillStrategy().generate(
            surface=plane, spacing=5.0, scallop_height=0.001
        )
        assert result_default.total_points() == result_with_scallop.total_points()

    def test_returns_collection(self):
        cyl = Surface.cylinder(center=(0, 0, 0), axis=(0, 0, 1), radius=50, height=100)
        result = RasterFillStrategy().generate(
            surface=cyl, spacing=10.0, chord_tolerance=0.5, scallop_height=0.5
        )
        assert isinstance(result, ToolpathCollection)


# ── ContourParallelStrategy normal_offset ────────────────────────────────────

class TestContourParallelNormalOffset:
    def test_zero_offset_unchanged(self):
        boundary = Curve.circle(center=(0, 0, 0), radius=20, num_points=32)
        r_no_offset = ContourParallelStrategy().generate(
            boundary=boundary, stepover=5.0, num_passes=2
        )
        r_zero = ContourParallelStrategy().generate(
            boundary=boundary, stepover=5.0, num_passes=2, normal_offset=0.0
        )
        for tp_a, tp_b in zip(r_no_offset.toolpaths, r_zero.toolpaths):
            for pt_a, pt_b in zip(tp_a.points, tp_b.points):
                assert abs(pt_a.position.z - pt_b.position.z) < 1e-9

    def test_positive_offset_lifts_z(self):
        # Flat boundary (Z=0) with no surface → offset in +Z direction
        boundary = Curve.circle(center=(0, 0, 0), radius=20, num_points=32)
        result = ContourParallelStrategy().generate(
            boundary=boundary, stepover=5.0, num_passes=2, normal_offset=3.0
        )
        for tp in result.toolpaths:
            for pt in tp.points:
                assert abs(pt.position.z - 3.0) < 1e-6

    def test_negative_offset_lowers_z(self):
        boundary = Curve.circle(center=(0, 0, 0), radius=20, num_points=32)
        result = ContourParallelStrategy().generate(
            boundary=boundary, stepover=5.0, num_passes=1, normal_offset=-2.0
        )
        for pt in result.all_points():
            assert abs(pt.position.z - (-2.0)) < 1e-6

    def test_offset_with_surface_uses_surface_normal(self):
        # Cylinder surface — normal at each boundary point should be radial (outward)
        import math
        cyl = Surface.cylinder(center=(0, 0, 0), axis=(0, 0, 1), radius=20, height=50)
        # Boundary at Z=25 (mid-height)
        pts = [(20 * math.cos(t), 20 * math.sin(t), 25)
               for t in [i * 2 * math.pi / 32 for i in range(32)]]
        pts.append(pts[0])
        boundary = Curve.from_points(pts, name="cyl_boundary", closed=True)
        result = ContourParallelStrategy().generate(
            boundary=boundary, stepover=1.0, num_passes=1,
            normal_offset=5.0, surface=cyl
        )
        # All points should be lifted away from the cylinder axis by ~5 mm radially
        for pt in result.all_points():
            r = math.sqrt(pt.position.x**2 + pt.position.y**2)
            assert r > 20.0, f"Expected radius > 20mm, got {r:.3f}"

    def test_point_count_unchanged_by_offset(self):
        boundary = Curve.circle(center=(0, 0, 0), radius=15, num_points=20)
        r_base   = ContourParallelStrategy().generate(boundary=boundary, stepover=3.0, num_passes=3)
        r_offset = ContourParallelStrategy().generate(boundary=boundary, stepover=3.0, num_passes=3, normal_offset=1.0)
        assert r_base.total_points() == r_offset.total_points()


# ── ContourParallelStrategy inset (perpendicular offset) ─────────────────────

class TestContourParallelInset:
    def test_zero_inset_unchanged(self):
        boundary = Curve.circle(center=(0, 0, 0), radius=20, num_points=32)
        r_base  = ContourParallelStrategy().generate(boundary=boundary, stepover=5.0, num_passes=2)
        r_inset = ContourParallelStrategy().generate(boundary=boundary, stepover=5.0, num_passes=2, inset=0.0)
        for tp_a, tp_b in zip(r_base.toolpaths, r_inset.toolpaths):
            for pt_a, pt_b in zip(tp_a.points, tp_b.points):
                assert abs(pt_a.position.x - pt_b.position.x) < 1e-9
                assert abs(pt_a.position.y - pt_b.position.y) < 1e-9

    def test_inset_shifts_points(self):
        # Any nonzero inset must produce different XY positions
        boundary = Curve.circle(center=(0, 0, 0), radius=20, num_points=32)
        r_base  = ContourParallelStrategy().generate(boundary=boundary, stepover=5.0, num_passes=1)
        r_inset = ContourParallelStrategy().generate(boundary=boundary, stepover=5.0, num_passes=1, inset=2.0)
        diffs = [
            abs(a.position.x - b.position.x) + abs(a.position.y - b.position.y)
            for a, b in zip(r_base.all_points(), r_inset.all_points())
        ]
        assert any(d > 1e-6 for d in diffs)

    def test_point_count_unchanged_by_inset(self):
        boundary = Curve.circle(center=(0, 0, 0), radius=20, num_points=32)
        r_base  = ContourParallelStrategy().generate(boundary=boundary, stepover=5.0, num_passes=3)
        r_inset = ContourParallelStrategy().generate(boundary=boundary, stepover=5.0, num_passes=3, inset=1.5)
        assert r_base.total_points() == r_inset.total_points()

    def test_inset_and_normal_offset_combined(self):
        # Both together should shift in Z and laterally
        boundary = Curve.circle(center=(0, 0, 0), radius=20, num_points=32)
        result = ContourParallelStrategy().generate(
            boundary=boundary, stepover=5.0, num_passes=1,
            normal_offset=3.0, inset=2.0,
        )
        # Z should be lifted by normal_offset
        for pt in result.all_points():
            assert abs(pt.position.z - 3.0) < 1e-6

    def test_opposite_inset_mirrors_laterally(self):
        # +inset and -inset produce points on opposite sides of the un-inset contour
        import math
        boundary = Curve.circle(center=(0, 0, 0), radius=20, num_points=32)
        r_pos = ContourParallelStrategy().generate(boundary=boundary, stepover=5.0, num_passes=1, inset=2.0)
        r_neg = ContourParallelStrategy().generate(boundary=boundary, stepover=5.0, num_passes=1, inset=-2.0)
        # Radii should differ: one pass is pushed in, the other pushed out
        def mean_radius(result):
            pts = list(result.all_points())
            return sum(math.sqrt(p.position.x**2 + p.position.y**2) for p in pts) / len(pts)
        assert abs(mean_radius(r_pos) - mean_radius(r_neg)) > 0.5
