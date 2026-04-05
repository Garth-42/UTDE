"""Tests for orientation rules: to_normal, fixed, lead, lag, side_tilt, blend, avoid_collision."""

import math
import pytest

from toolpath_engine.core.primitives import Vector3, Orientation
from toolpath_engine.core.geometry import Surface
from toolpath_engine.core.toolpath import ToolpathPoint
from toolpath_engine.orient.rules import to_normal, fixed, lead, lag, side_tilt, blend, avoid_collision


def make_pt(x=0.0, y=0.0, z=0.0, orient=None) -> ToolpathPoint:
    return ToolpathPoint(
        position=Vector3(x, y, z),
        orientation=orient or Orientation.z_down(),
    )


def make_ctx(index=1, total=3, prev=None, nxt=None):
    return {"index": index, "total": total, "prev": prev, "next": nxt}


# ── fixed ─────────────────────────────────────────────────────────────────────


class TestFixed:
    def test_fixed_returns_constant(self):
        rule = fixed(0, 0, -1)
        pt = make_pt()
        ctx = make_ctx()
        result = rule(pt, ctx)
        assert isinstance(result, Orientation)
        assert abs(result.k - (-1.0)) < 1e-10

    def test_fixed_custom_direction(self):
        rule = fixed(1, 0, 0)
        pt = make_pt()
        result = rule(pt, make_ctx())
        assert abs(result.i - 1.0) < 1e-10

    def test_fixed_same_for_all_points(self):
        rule = fixed(0, 1, 0)
        for x in range(5):
            pt = make_pt(x=float(x))
            r = rule(pt, make_ctx(index=x))
            assert abs(r.j - 1.0) < 1e-10


# ── to_normal ─────────────────────────────────────────────────────────────────


class TestToNormal:
    def test_plane_normal(self):
        surface = Surface.plane(origin=(0, 0, 0), normal=(0, 0, 1))
        rule = to_normal(surface)
        pt = make_pt(0, 0, 5)
        result = rule(pt, make_ctx())
        assert abs(result.k - 1.0) < 1e-6

    def test_rule_name(self):
        surface = Surface.plane(name="top_face")
        rule = to_normal(surface)
        assert "to_normal" in rule.__name__

    def test_tilted_plane_normal(self):
        surface = Surface.plane(origin=(0, 0, 0), normal=(1, 0, 0))
        rule = to_normal(surface)
        pt = make_pt(5, 0, 0)
        result = rule(pt, make_ctx())
        assert abs(result.i - 1.0) < 1e-3


# ── lead / lag ────────────────────────────────────────────────────────────────


class TestLeadLag:
    def _line_context(self, i, pts):
        """Build context with prev/next points from a list."""
        return {
            "index": i,
            "total": len(pts),
            "prev": pts[i - 1] if i > 0 else None,
            "next": pts[i + 1] if i < len(pts) - 1 else None,
        }

    def test_lead_tilts_forward(self):
        """Lead should tilt tool axis toward travel direction."""
        pts = [make_pt(x=float(i), orient=Orientation(0, 0, -1)) for i in range(5)]
        rule = lead(15)
        ctx = self._line_context(2, pts)
        result = rule(pts[2], ctx)
        assert result is not None
        # Original is (0,0,-1), travel is +X; lead should introduce X component
        assert result.i != 0.0

    def test_lag_is_negative_lead(self):
        """lag(angle) should tilt opposite to lead(angle)."""
        pts = [make_pt(x=float(i), orient=Orientation(0, 0, -1)) for i in range(5)]
        lead_rule = lead(15)
        lag_rule = lag(15)
        ctx = self._line_context(2, pts)
        r_lead = lead_rule(pts[2], ctx)
        r_lag = lag_rule(pts[2], ctx)
        # X components should be opposite
        assert r_lead.i * r_lag.i < 0

    def test_lead_no_context_returns_none(self):
        pt = make_pt()
        rule = lead(10)
        result = rule(pt, {"index": 0, "total": 1, "prev": None, "next": None})
        assert result is None

    def test_lead_with_only_prev(self):
        prev = make_pt(x=0, orient=Orientation(0, 0, -1))
        pt = make_pt(x=1, orient=Orientation(0, 0, -1))
        rule = lead(10)
        ctx = {"index": 1, "total": 2, "prev": prev, "next": None}
        result = rule(pt, ctx)
        assert result is not None


# ── side_tilt ─────────────────────────────────────────────────────────────────


class TestSideTilt:
    def test_side_tilt_modifies_orientation(self):
        pts = [make_pt(x=float(i), orient=Orientation(0, 0, -1)) for i in range(5)]
        rule = side_tilt(10)
        ctx = {
            "index": 2, "total": 5,
            "prev": pts[1], "next": pts[3],
        }
        result = rule(pts[2], ctx)
        assert result is not None
        # Side tilt should not be the same as z_down
        assert abs(result.i) > 1e-6 or abs(result.j) > 1e-6

    def test_side_tilt_no_context_returns_none(self):
        pt = make_pt()
        rule = side_tilt(10)
        result = rule(pt, {"index": 0, "total": 1, "prev": None, "next": None})
        assert result is None


# ── blend ─────────────────────────────────────────────────────────────────────


class TestBlend:
    def test_blend_at_start_is_rule_a(self):
        rule_a = fixed(0, 0, -1)
        rule_b = fixed(1, 0, 0)
        rule = blend(rule_a, rule_b, over=10)
        pt = make_pt()
        ctx = {"index": 0, "total": 10, "prev": None, "next": None}
        result = rule(pt, ctx)
        assert result is not None

    def test_blend_at_end_is_rule_b(self):
        rule_a = fixed(0, 0, -1)
        rule_b = fixed(1, 0, 0)
        rule = blend(rule_a, rule_b, over=10)
        pt = make_pt()
        ctx = {"index": 9, "total": 10, "prev": None, "next": None}
        result = rule(pt, ctx)
        assert result is not None
        # At t=1, should be approximately rule_b direction (1,0,0)
        assert result.i > 0.9

    def test_blend_rule_name(self):
        rule_a = fixed(0, 0, -1)
        rule_b = fixed(1, 0, 0)
        rule = blend(rule_a, rule_b)
        assert "blend" in rule.__name__


# ── avoid_collision ───────────────────────────────────────────────────────────


class TestAvoidCollision:
    def test_within_limit_returns_none(self):
        rule = avoid_collision(max_tilt=45)
        # Tool pointing straight up (0 tilt from Z) — no clamping needed
        pt = make_pt(orient=Orientation(0, 0, 1))
        result = rule(pt, make_ctx())
        assert result is None

    def test_exceeds_limit_clamps(self):
        rule = avoid_collision(max_tilt=10)
        # Tool pointing mostly horizontal — exceeds 10 deg from Z
        pt = make_pt(orient=Orientation(1, 0, 0))
        result = rule(pt, make_ctx())
        assert result is not None
        # After clamping, angle from Z should be <= 10 degrees
        z_up = Vector3(0, 0, 1)
        angle_deg = math.degrees(result.vec.angle_to(z_up))
        assert angle_deg <= 10.5  # small tolerance for floating point

    def test_rule_name_contains_max_tilt(self):
        rule = avoid_collision(max_tilt=20)
        assert "20" in rule.__name__
