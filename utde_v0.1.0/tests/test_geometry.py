"""Tests for Curve, Surface, and GeometryModel."""

import math
import pytest
import numpy as np

from toolpath_engine.core.geometry import Curve, Surface, GeometryModel
from toolpath_engine.core.primitives import Vector3


# ── Curve ─────────────────────────────────────────────────────────────────────


class TestCurve:
    def test_from_points(self):
        c = Curve.from_points([(0, 0, 0), (1, 0, 0), (2, 0, 0)])
        assert len(c) == 3
        assert c.points[0].x == 0
        assert c.points[2].x == 2

    def test_line_factory(self):
        c = Curve.line((0, 0, 0), (10, 0, 0), num_points=11)
        assert len(c) == 11
        assert abs(c.points[0].x - 0.0) < 1e-10
        assert abs(c.points[-1].x - 10.0) < 1e-10
        assert c.name == "line"

    def test_line_length(self):
        c = Curve.line((0, 0, 0), (10, 0, 0), num_points=50)
        assert abs(c.length() - 10.0) < 0.01

    def test_circle_factory(self):
        c = Curve.circle(center=(0, 0, 0), radius=5.0, num_points=64)
        assert len(c) == 64
        assert c.closed is True
        # All points should be ~5 units from center
        for pt in c.points:
            dist = math.sqrt(pt.x ** 2 + pt.y ** 2)
            assert abs(dist - 5.0) < 1e-6

    def test_helix_factory(self):
        c = Curve.helix(center=(0, 0, 0), radius=5.0, pitch=2.0, turns=3.0)
        assert len(c) > 0
        # Z should increase by pitch * turns
        z_start = c.points[0].z
        z_end = c.points[-1].z
        assert abs(z_end - z_start - 2.0 * 3.0) < 0.1

    def test_tangent_at_start(self):
        c = Curve.line((0, 0, 0), (10, 0, 0), num_points=10)
        t = c.tangent_at(0)
        assert abs(t.x - 1.0) < 1e-6
        assert abs(t.y) < 1e-6

    def test_tangent_at_end(self):
        c = Curve.line((0, 0, 0), (10, 0, 0), num_points=10)
        t = c.tangent_at(len(c) - 1)
        assert abs(t.x - 1.0) < 1e-6

    def test_tangent_at_middle(self):
        c = Curve.line((0, 0, 0), (0, 10, 0), num_points=10)
        t = c.tangent_at(5)
        assert abs(t.y - 1.0) < 1e-6

    def test_resample(self):
        c = Curve.line((0, 0, 0), (10, 0, 0), num_points=3)
        r = c.resample(1.0)
        # Should have approximately 10 segments
        assert len(r) >= 9

    def test_resample_preserves_endpoints(self):
        c = Curve.line((0, 0, 0), (10, 0, 0), num_points=5)
        r = c.resample(2.0)
        assert r.points[0].x == pytest.approx(0.0, abs=1e-6)

    def test_length_single_point(self):
        c = Curve(points=[Vector3(0, 0, 0)])
        assert c.length() == 0.0

    def test_len(self):
        c = Curve.from_points([(0, 0, 0), (1, 0, 0)])
        assert len(c) == 2

    def test_repr(self):
        c = Curve.line((0, 0, 0), (5, 0, 0))
        assert "Curve" in repr(c)


# ── Surface ───────────────────────────────────────────────────────────────────


class TestSurface:
    def test_plane_evaluate(self):
        s = Surface.plane(origin=(0, 0, 0), normal=(0, 0, 1))
        pt = s.evaluate(0, 0)
        assert abs(pt.x - 0.0) < 1e-6
        assert abs(pt.z - 0.0) < 1e-6

    def test_plane_normal(self):
        s = Surface.plane(origin=(0, 0, 5), normal=(0, 0, 1))
        n = s.normal_at(0, 0)
        assert abs(n.z - 1.0) < 1e-6

    def test_plane_closest_point(self):
        s = Surface.plane(origin=(0, 0, 0), normal=(0, 0, 1))
        u, v, cp = s.closest_point(Vector3(3, 4, 10))
        # Closest point on XY plane should project down to z=0
        assert abs(cp.z - 0.0) < 1e-6

    def test_plane_normal_at_closest(self):
        s = Surface.plane(origin=(0, 0, 0), normal=(0, 0, 1))
        n = s.normal_at_closest(Vector3(1, 2, 5))
        assert abs(n.z - 1.0) < 1e-6

    def test_cylinder_evaluate(self):
        s = Surface.cylinder(center=(0, 0, 0), axis=(0, 0, 1), radius=10, height=20)
        # At u=0, point should be at radius distance from center
        pt = s.evaluate(0, 0)
        r = math.sqrt(pt.x ** 2 + pt.y ** 2)
        assert abs(r - 10.0) < 1e-3

    def test_cylinder_normal_radial(self):
        s = Surface.cylinder(center=(0, 0, 0), axis=(0, 0, 1), radius=10, height=20)
        n = s.normal_at(0, 5)
        # Normal should be perpendicular to axis (z component near 0)
        assert abs(n.z) < 1e-3

    def test_sphere_evaluate(self):
        s = Surface.sphere(center=(0, 0, 0), radius=5)
        # All evaluated points should be ~radius from center
        for u in [0, 1, 2]:
            for v in [-1, 0, 1]:
                pt = s.evaluate(u, v)
                dist = math.sqrt(pt.x ** 2 + pt.y ** 2 + pt.z ** 2)
                assert abs(dist - 5.0) < 0.1

    def test_sphere_normal_outward(self):
        s = Surface.sphere(center=(0, 0, 0), radius=5)
        n = s.normal_at(0, 0)
        # Normal should be unit length
        assert abs(n.length() - 1.0) < 1e-6

    def test_repr(self):
        s = Surface.plane()
        assert "Surface" in repr(s)
        assert "plane" in repr(s)

    def test_boundary_loop_attribute(self):
        s = Surface.plane()
        assert s.boundary_loop is None
        s.boundary_loop = [(0, 0, 0), (1, 0, 0), (1, 1, 0)]
        assert len(s.boundary_loop) == 3


# ── GeometryModel ─────────────────────────────────────────────────────────────


class TestGeometryModel:
    def test_empty_model(self):
        m = GeometryModel("test")
        assert m.name == "test"
        assert len(m.surfaces) == 0
        assert len(m.curves) == 0

    def test_add_surface(self):
        m = GeometryModel()
        s = Surface.plane(name="top")
        m.add_surface(s)
        assert "top" in m.surfaces

    def test_add_surface_with_tags(self):
        m = GeometryModel()
        s = Surface.plane(name="weld_area")
        m.add_surface(s, tags=["weldable", "flat"])
        assert "weldable" in m.tags
        assert "weld_area" in m.tags["weldable"]

    def test_add_curve(self):
        m = GeometryModel()
        c = Curve.from_points([(0, 0, 0), (10, 0, 0)], name="path1")
        m.add_curve(c)
        assert "path1" in m.curves

    def test_select_surfaces_all(self):
        m = GeometryModel()
        m.add_surface(Surface.plane(name="s1"))
        m.add_surface(Surface.plane(name="s2"))
        result = m.select_surfaces()
        assert len(result) == 2

    def test_select_surfaces_by_tag(self):
        m = GeometryModel()
        m.add_surface(Surface.plane(name="s1"), tags=["top"])
        m.add_surface(Surface.plane(name="s2"), tags=["bottom"])
        result = m.select_surfaces(tag="top")
        assert len(result) == 1
        assert result[0].name == "s1"

    def test_select_curves_all(self):
        m = GeometryModel()
        m.add_curve(Curve.from_points([(0, 0, 0), (1, 0, 0)], name="c1"))
        m.add_curve(Curve.from_points([(0, 0, 0), (2, 0, 0)], name="c2"))
        assert len(m.select_curves()) == 2

    def test_select_curves_by_tag(self):
        m = GeometryModel()
        m.add_curve(Curve.from_points([(0, 0, 0), (1, 0, 0)], name="weld_path"), tags=["weld"])
        m.add_curve(Curve.from_points([(0, 0, 0), (2, 0, 0)], name="travel"))
        result = m.select_curves(tag="weld")
        assert len(result) == 1

    def test_repr(self):
        m = GeometryModel("mymodel")
        assert "mymodel" in repr(m)
