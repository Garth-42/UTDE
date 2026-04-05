"""
Orientation rules — composable, chainable functions that determine
tool axis direction at each toolpath point.

Each rule is a callable: (point, context) -> Orientation or None.
Returning None means "no change" (pass through).

Rules are applied via toolpath.orient(rule), and they stack:
    paths.orient(to_normal(surface))     # base orientation
    paths.orient(lead(15))               # tilt 15° in travel direction
    paths.orient(avoid_collision(machine, max_tilt=20))
"""

from __future__ import annotations

import math
from typing import Optional, Callable, Dict, Any

from ..core.primitives import Vector3, Orientation
from ..core.toolpath import ToolpathPoint
from ..core.geometry import Surface


def to_normal(surface: Surface) -> Callable:
    """Orient tool axis to surface normal at the closest point."""
    def rule(point: ToolpathPoint, context: Dict[str, Any]) -> Orientation:
        normal = surface.normal_at_closest(point.position)
        return Orientation.from_vector(normal)
    rule.__name__ = f"to_normal({surface.name})"
    return rule


def fixed(i: float = 0, j: float = 0, k: float = -1) -> Callable:
    """Fixed orientation for all points (e.g. 3-axis: tool Z-down)."""
    orient = Orientation(i, j, k, name="fixed")
    def rule(point: ToolpathPoint, context: Dict[str, Any]) -> Orientation:
        return orient
    rule.__name__ = f"fixed({i}, {j}, {k})"
    return rule


def lead(angle_deg: float) -> Callable:
    """
    Tilt the tool forward (in travel direction) by the specified angle.
    
    Requires context with 'prev' or 'next' point to determine travel direction.
    Modifies the existing orientation rather than replacing it.
    """
    angle_rad = math.radians(angle_deg)

    def rule(point: ToolpathPoint, context: Dict[str, Any]) -> Orientation:
        # Determine travel direction
        prev = context.get("prev")
        nxt = context.get("next")
        if nxt:
            travel = (nxt.position - point.position).normalized()
        elif prev:
            travel = (point.position - prev.position).normalized()
        else:
            return None  # can't determine travel direction

        if travel.length() < 1e-9:
            return None

        # Current tool axis
        tool_axis = point.orientation.vec

        # Rotation axis: perpendicular to both tool axis and travel
        rot_axis = tool_axis.cross(travel).normalized()
        if rot_axis.length() < 1e-9:
            return None  # tool axis parallel to travel — can't lead

        # Rodrigues rotation of tool_axis around rot_axis by angle
        cos_a = math.cos(angle_rad)
        sin_a = math.sin(angle_rad)
        k = rot_axis
        v = tool_axis
        rotated = (
            v * cos_a
            + k.cross(v) * sin_a
            + k * (k.dot(v)) * (1 - cos_a)
        )
        return Orientation.from_vector(rotated)

    rule.__name__ = f"lead({angle_deg}°)"
    return rule


def lag(angle_deg: float) -> Callable:
    """Tilt the tool backward (opposite travel direction)."""
    return lead(-angle_deg)


def side_tilt(angle_deg: float) -> Callable:
    """
    Tilt the tool sideways (perpendicular to travel and current tool axis).
    """
    angle_rad = math.radians(angle_deg)

    def rule(point: ToolpathPoint, context: Dict[str, Any]) -> Orientation:
        prev = context.get("prev")
        nxt = context.get("next")
        if nxt:
            travel = (nxt.position - point.position).normalized()
        elif prev:
            travel = (point.position - prev.position).normalized()
        else:
            return None

        tool_axis = point.orientation.vec

        # Side direction: perpendicular to travel in the plane of the tool axis
        side = travel.cross(tool_axis).normalized()
        if side.length() < 1e-9:
            return None

        # Rotate tool axis around travel direction
        cos_a = math.cos(angle_rad)
        sin_a = math.sin(angle_rad)
        k = travel
        v = tool_axis
        rotated = (
            v * cos_a
            + k.cross(v) * sin_a
            + k * (k.dot(v)) * (1 - cos_a)
        )
        return Orientation.from_vector(rotated)

    rule.__name__ = f"side_tilt({angle_deg}°)"
    return rule


def blend(rule_a: Callable, rule_b: Callable, over: float = 10.0) -> Callable:
    """
    Smoothly blend between two orient rules over a distance (mm).
    
    Starts with rule_a, transitions to rule_b over the specified distance
    from the start of the toolpath.
    """
    def rule(point: ToolpathPoint, context: Dict[str, Any]) -> Orientation:
        idx = context.get("index", 0)
        total = context.get("total", 1)

        orient_a = rule_a(point, context)
        orient_b = rule_b(point, context)
        if orient_a is None:
            return orient_b
        if orient_b is None:
            return orient_a

        # Compute blend factor based on position along path
        t = min(1.0, idx / max(1, total - 1))  # simple linear for now

        # Lerp the direction vectors
        va = orient_a.vec
        vb = orient_b.vec
        blended = va.lerp(vb, t).normalized()
        return Orientation.from_vector(blended)

    rule.__name__ = f"blend({getattr(rule_a, '__name__', '?')}, {getattr(rule_b, '__name__', '?')})"
    return rule


def avoid_collision(machine=None, max_tilt: float = 20.0) -> Callable:
    """
    Adjust orientation to avoid collisions, up to max_tilt degrees
    from the current orientation.
    
    This is a placeholder for the full collision-avoidance system.
    In the full implementation, this checks the tool assembly against
    workpiece/fixture geometry at each point and adjusts minimally.
    
    For now, it ensures tool axis doesn't go past a maximum tilt from Z.
    """
    max_rad = math.radians(max_tilt)

    def rule(point: ToolpathPoint, context: Dict[str, Any]) -> Optional[Orientation]:
        tool_axis = point.orientation.vec
        z_up = Vector3(0, 0, 1)
        angle = tool_axis.angle_to(z_up)

        # If angle from Z exceeds max, clamp it
        if angle > max_rad:
            # Rotate tool axis toward Z by the excess
            excess = angle - max_rad
            rot_axis = tool_axis.cross(z_up).normalized()
            if rot_axis.length() < 1e-9:
                return None
            cos_a = math.cos(excess)
            sin_a = math.sin(excess)
            k = rot_axis
            v = tool_axis
            clamped = (
                v * cos_a
                + k.cross(v) * sin_a
                + k * (k.dot(v)) * (1 - cos_a)
            )
            return Orientation.from_vector(clamped)
        return None  # no adjustment needed

    rule.__name__ = f"avoid_collision(max_tilt={max_tilt}°)"
    return rule
