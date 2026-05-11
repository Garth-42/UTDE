"""
Template: Pocket — 3-Axis Pocket Milling
=========================================

Process-agnostic template for clearing material from a pocket bounded by a
single face. Demonstrates the Q5(b) pattern: an Operation template may call
multiple strategies internally to compose a single timeline entry.

Pipeline:
    1. Roughing — ContourParallelStrategy, multi-pass offset paths at each
       Z stepdown until reaching (total_depth - stock_to_leave).
    2. Finishing — FollowCurveStrategy along the boundary at full depth,
       removing the stock the rougher left behind.
    3. Both passes get a fixed (0, 0, -1) orientation so output is 3-axis.

Usage:
    from toolpath_engine import get_process
    fn = get_process("pocket")
    result = fn(model=None, geometry=[[face]], params={"depth": 8.0})
"""

import math

from toolpath_engine import (
    process,
    Surface, Curve,
    ContourParallelStrategy, FollowCurveStrategy,
    fixed,
)
from toolpath_engine.core.toolpath import ToolpathCollection


def _resolve_face(geometry, fallback_size=60.0):
    """Pull the picked face (a Surface) out of the geometry slot list.

    geometry is shaped [[Surface, ...], ...] matching the @process requires.
    Falls back to a synthetic square plane when nothing is picked, so the
    template stays runnable for tests and previews without a real model.
    """
    if geometry and geometry[0]:
        first = geometry[0][0]
        if isinstance(first, Surface):
            return first
    return Surface.plane(
        origin=(0, 0, 0),
        normal=(0, 0, 1),
        size=fallback_size,
        name="synthetic_pocket_floor",
    )


def _boundary_curve(face: Surface) -> Curve:
    """Build a closed Curve from the face's boundary loop, or a synthetic
    square sized to the face's u/v bounds."""
    if face.boundary_loop:
        return Curve.from_points(
            list(face.boundary_loop),
            name=f"{face.name}_boundary",
            closed=True,
        )
    u0, u1, v0, v1 = face.bounds
    o = face._origin
    return Curve.from_points(
        [
            (o.x + u0, o.y + v0, o.z),
            (o.x + u1, o.y + v0, o.z),
            (o.x + u1, o.y + v1, o.z),
            (o.x + u0, o.y + v1, o.z),
            (o.x + u0, o.y + v0, o.z),
        ],
        name=f"{face.name}_boundary",
        closed=True,
    )


def _translate_curve(curve: Curve, dz: float) -> Curve:
    """Return a copy of curve translated by dz along Z."""
    coords = [(p.x, p.y, p.z + dz) for p in curve.points]
    return Curve.from_points(coords, name=f"{curve.name}_z{dz:+.2f}", closed=curve.closed)


_TOOL_DIAMETER = {
    "T07 — Ø25 end mill": 25.0,
    "T11 — Ø10 end mill": 10.0,
    "T15 — Ø6 end mill":   6.0,
}


@process(
    "pocket",
    description="3-axis pocket milling: contour-parallel rough + boundary finish.",
    tags=["subtractive", "milling", "pocket", "3-axis"],
    kind="sub",
    label="Pocket",
    icon="pocket",
    requires=[{"type": "face", "label": "Pocket floor", "count": 1}],
    params=[
        {"id": "tool",     "type": "select", "default": "T11 — Ø10 end mill",
         "options": ["T07 — Ø25 end mill", "T11 — Ø10 end mill", "T15 — Ø6 end mill"],
         "label": "Tool"},
        {"id": "depth",    "type": "number", "default": 8.0,  "unit": "mm",
         "label": "Total depth"},
        {"id": "stepdown", "type": "number", "default": 1.5,  "unit": "mm",
         "label": "Step down"},
        {"id": "stepover", "type": "number", "default": 45,   "unit": "%",
         "label": "Stepover"},
        {"id": "stock",    "type": "number", "default": 0.10, "unit": "mm",
         "label": "Stock to leave"},
        {"id": "feedrate", "type": "number", "default": 1200, "unit": "mm/min",
         "label": "Feed"},
        {"id": "spindle",  "type": "number", "default": 9500, "unit": "rpm",
         "label": "Spindle"},
    ],
    est_time=4.6,
    est_volume=2.2,
)
def pocket(model=None, geometry=None, params=None):
    """Generate a 3-axis pocket toolpath (rough + finish).

    Args:
        model:    GeometryModel (optional — only used as context, geometry
                  resolution happens upstream in the server).
        geometry: List-of-lists of resolved primitives matching `requires`.
                  geometry[0][0] is expected to be the pocket-floor Surface.
        params:   Dict of param values; see schema in @process decorator.
    """
    p = params or {}
    tool      = p.get("tool",     "T11 — Ø10 end mill")
    depth     = float(p.get("depth",     8.0))
    stepdown  = float(p.get("stepdown",  1.5))
    stepover  = float(p.get("stepover",  45.0))
    stock     = float(p.get("stock",     0.10))
    feedrate  = float(p.get("feedrate",  1200))
    spindle   = float(p.get("spindle",   9500))

    tool_dia  = _TOOL_DIAMETER.get(tool, 10.0)
    step_xy   = max(0.1, tool_dia * (stepover / 100.0))

    face     = _resolve_face(geometry)
    boundary = _boundary_curve(face)

    bounds = face.bounds
    half_extent = max(abs(bounds[1] - bounds[0]), abs(bounds[3] - bounds[2])) / 2.0
    n_offset_passes = max(1, int(math.ceil(half_extent / step_xy)))

    n_z = max(1, int(math.ceil(max(0.0, depth - stock) / stepdown)))

    collection = ToolpathCollection(name=f"pocket_{face.name}")

    rough_strategy = ContourParallelStrategy()
    for z_idx in range(n_z):
        z_target = -min((z_idx + 1) * stepdown, depth - stock)
        rough = rough_strategy.generate(
            boundary=_translate_curve(boundary, z_target),
            stepover=step_xy,
            num_passes=n_offset_passes,
            feed_rate=feedrate,
            direction="inward",
            path_type="rough",
        )
        rough.orient(fixed(0, 0, -1))
        for tp in rough.toolpaths:
            for pt in tp.points:
                pt.process_params["spindle_rpm"] = spindle
                pt.process_params["tool"]        = tool
            collection.add(tp)

    finish = FollowCurveStrategy().generate(
        curve=_translate_curve(boundary, -depth),
        feed_rate=feedrate,
        path_type="finish",
    )
    finish.orient(fixed(0, 0, -1))
    for tp in finish.toolpaths:
        for pt in tp.points:
            pt.process_params["spindle_rpm"] = spindle
            pt.process_params["tool"]        = tool
        collection.add(tp)

    return collection


if __name__ == "__main__":
    result = pocket()
    n_pts = sum(len(tp.points) for tp in result.toolpaths)
    print(f"Generated {len(result.toolpaths)} toolpaths, {n_pts} total points")
    by_type = {}
    for tp in result.toolpaths:
        for pt in tp.points:
            by_type[pt.path_type] = by_type.get(pt.path_type, 0) + 1
    print("Path-type breakdown:", by_type)
