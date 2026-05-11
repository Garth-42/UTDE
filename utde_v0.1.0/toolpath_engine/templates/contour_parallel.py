"""
Strategy template: Contour Parallel
====================================

Thin `@process` wrapper around `ContourParallelStrategy` so the front-end
Library can surface contour-parallel offsets as a standalone Operation card.
The user picks one boundary edge; the strategy emits offset passes inward
(or outward) at the given stepover.

Usage:
    from toolpath_engine import get_process
    fn = get_process("contour_parallel")
    result = fn(model=None, geometry=[[boundary]],
                params={"stepover": 3.0, "num_passes": 4})
"""

from toolpath_engine import (
    process,
    Curve,
    ContourParallelStrategy,
)


def _resolve_boundary(geometry):
    """First picked edge in slot 0 wins. Falls back to a synthetic
    square so the template stays runnable in tests."""
    if geometry and geometry[0]:
        for item in geometry[0]:
            if isinstance(item, Curve):
                return item
    return Curve.from_points(
        [(50, 50, 0), (-50, 50, 0), (-50, -50, 0), (50, -50, 0), (50, 50, 0)],
        name="synthetic_contour_boundary",
        closed=True,
    )


@process(
    "contour_parallel",
    description="Offset passes inward (or outward) from a boundary edge. "
                "Building block for pocket clearing, perimeter machining, "
                "finishing passes.",
    tags=["primitive", "offset", "contour"],
    kind="primitive",
    label="Contour Parallel",
    icon="contour",
    requires=[{"type": "edge", "label": "Boundary", "count": 1}],
    params=[
        {"id": "stepover",   "type": "number",  "default": 3.0,
         "unit": "mm", "label": "Stepover"},
        {"id": "num_passes", "type": "number",  "default": 4,
         "label": "Pass count"},
        {"id": "direction",  "type": "segment", "default": "inward",
         "options": ["inward", "outward"], "label": "Direction"},
        {"id": "feed_rate",  "type": "number",  "default": 1000.0,
         "unit": "mm/min", "label": "Feed"},
        {"id": "path_type",  "type": "select",  "default": "contour",
         "options": ["contour", "rough", "finish", "deposit"],
         "label": "Path type"},
    ],
    est_time=2.5,
    est_volume=1.2,
)
def contour_parallel(model=None, geometry=None, params=None):
    """Generate contour-parallel offset toolpaths from the picked boundary."""
    p = params or {}
    boundary = _resolve_boundary(geometry)
    return ContourParallelStrategy().generate(
        boundary=boundary,
        stepover=float(p.get("stepover", 3.0)),
        num_passes=int(p.get("num_passes", 4)),
        direction=p.get("direction", "inward"),
        feed_rate=float(p.get("feed_rate", 1000.0)),
        path_type=p.get("path_type", "contour"),
    )


if __name__ == "__main__":
    result = contour_parallel()
    n_pts = sum(len(tp.points) for tp in result.toolpaths)
    print(f"Generated {len(result.toolpaths)} toolpaths, {n_pts} points")
