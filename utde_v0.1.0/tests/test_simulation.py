"""Tests for the simulation plugins (CollisionChecker)."""

from toolpath_engine.core.primitives import Vector3, Orientation
from toolpath_engine.core.toolpath import ToolpathPoint, Toolpath, ToolpathCollection
from toolpath_engine.simulation import CollisionChecker, SimulationResult


def _single_point_collection(orient):
    col = ToolpathCollection("sim")
    col.add(Toolpath([ToolpathPoint(position=Vector3(0, 0, 0),
                                    orientation=orient, feed_rate=500)], name="c"))
    return col


class TestCollisionCheckerTilt:
    def test_straight_down_tool_is_not_a_collision(self):
        # Regression: tilt is measured from the nearest vertical pole, so a
        # standard 3-axis z_down tool (0,0,-1) reads 0° tilt. It previously read
        # 180° and flagged a collision at every point.
        checker = CollisionChecker(max_tilt_deg=90.0)
        result = checker.run(_single_point_collection(Orientation(0, 0, -1)))
        assert isinstance(result, SimulationResult)
        assert result.success
        assert result.collisions == []

    def test_horizontal_tool_exceeds_limit(self):
        checker = CollisionChecker(max_tilt_deg=45.0)
        result = checker.run(_single_point_collection(Orientation(1, 0, 0)))
        assert not result.success
        assert any(c["type"] == "tilt_exceeded" for c in result.collisions)

    def test_straight_up_tool_is_not_a_collision(self):
        checker = CollisionChecker(max_tilt_deg=45.0)
        result = checker.run(_single_point_collection(Orientation(0, 0, 1)))
        assert result.success
