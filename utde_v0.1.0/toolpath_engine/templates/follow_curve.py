"""
Strategy template: Follow Curve
================================

Thin `@process` wrapper around `FollowCurveStrategy` so the front-end Library
can surface follow-curve as a standalone Operation card. The user picks one
or more edges; each becomes a toolpath that traces that edge.

Usage:
    from toolpath_engine import get_process
    fn = get_process("follow_curve")
    result = fn(model=None, geometry=[[curve_a, curve_b]], params={"feed_rate": 800})
"""

from toolpath_engine import (
    process,
    Curve,
    FollowCurveStrategy,
)


def _resolve_curves(geometry):
    """Pull every picked curve out of the multi-pick edge slot. Falls back
    to a single synthetic line so the template stays runnable in tests."""
    curves = []
    if geometry and geometry[0]:
        for item in geometry[0]:
            if isinstance(item, Curve):
                curves.append(item)
    if not curves:
        synthetic = Curve.line((0, 0, 0), (50, 0, 0), num_points=25)
        synthetic.name = "synthetic_follow_line"
        curves = [synthetic]
    return curves


@process(
    "follow_curve",
    description="Trace one or more picked edges as toolpaths. Building "
                "block for perimeters, single-bead deposition, scribing.",
    tags=["primitive", "trace", "edge"],
    kind="primitive",
    label="Follow Curve",
    icon="edge",
    requires=[{"type": "edge", "label": "Edges to follow", "count": 0}],
    params=[
        {"id": "feed_rate",  "type": "number", "default": 1000.0,
         "unit": "mm/min", "label": "Feed"},
        {"id": "spacing",    "type": "number", "default": 0.0,
         "unit": "mm",      "label": "Resample spacing",
         "hint": "0 keeps original curve points"},
        {"id": "path_type",  "type": "select", "default": "cut",
         "options": ["cut", "deposit", "trace", "scribe"],
         "label": "Path type"},
    ],
    est_time=1.5,
    est_volume=0.5,
)
def follow_curve(model=None, geometry=None, params=None):
    """Generate a follow-curve toolpath over the picked edge(s)."""
    p = params or {}
    curves = _resolve_curves(geometry)
    spacing = float(p.get("spacing", 0.0)) or None
    return FollowCurveStrategy().generate(
        curves=curves,
        feed_rate=float(p.get("feed_rate", 1000.0)),
        spacing=spacing,
        path_type=p.get("path_type", "cut"),
    )


if __name__ == "__main__":
    result = follow_curve()
    n_pts = sum(len(tp.points) for tp in result.toolpaths)
    print(f"Generated {len(result.toolpaths)} toolpaths, {n_pts} points")
