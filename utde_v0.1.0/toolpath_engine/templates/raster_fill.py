"""
Strategy template: Raster Fill
==============================

Thin `@process` wrapper around `RasterFillStrategy` so the front-end Library
can surface raster fill as a standalone Operation card. Parameters mirror
the strategy's `generate()` signature directly — no curated subset (see
TODO #26 for the eventual form-builder that lets users pick "important"
params per Operation).

Usage:
    from toolpath_engine import get_process
    fn = get_process("raster_fill")
    result = fn(model=None, geometry=[[surface]], params={"spacing": 3.0})
"""

from toolpath_engine import (
    process,
    Surface,
    RasterFillStrategy,
)


def _resolve_surface(geometry, fallback_size=100.0):
    """Pull the picked face out of geometry[0][0]. Falls back to a
    synthetic plane so the template stays runnable in tests/preview."""
    if geometry and geometry[0]:
        first = geometry[0][0]
        if isinstance(first, Surface):
            return first
    return Surface.plane(
        origin=(0, 0, 0),
        normal=(0, 0, 1),
        size=fallback_size,
        name="synthetic_raster_surface",
    )


@process(
    "raster_fill",
    description="Parallel raster passes across a face. Building block for "
                "infill, raster machining, coating, and deposition.",
    tags=["primitive", "raster", "fill"],
    kind="primitive",
    label="Raster Fill",
    icon="coat",
    requires=[{"type": "face", "label": "Fill surface", "count": 1}],
    params=[
        {"id": "spacing",       "type": "number",  "default": 3.0,
         "unit": "mm", "label": "Spacing"},
        {"id": "angle",         "type": "number",  "default": 0.0,
         "unit": "deg", "label": "Angle"},
        {"id": "feed_rate",     "type": "number",  "default": 1000.0,
         "unit": "mm/min", "label": "Feed"},
        {"id": "zigzag",        "type": "segment", "default": "on",
         "options": ["on", "off"], "label": "Zigzag"},
        {"id": "path_type",     "type": "select",  "default": "infill",
         "options": ["infill", "deposit", "coat"], "label": "Path type"},
        {"id": "normal_offset", "type": "number",  "default": 0.0,
         "unit": "mm", "label": "Normal offset",
         "hint": "lift along surface normal"},
        {"id": "edge_inset",    "type": "number",  "default": 0.0,
         "unit": "mm", "label": "Edge inset",
         "hint": "shrink boundary before filling"},
    ],
    est_time=2.0,
    est_volume=1.0,
)
def raster_fill(model=None, geometry=None, params=None):
    """Generate a raster-fill toolpath over the picked face."""
    p = params or {}
    surface = _resolve_surface(geometry)
    return RasterFillStrategy().generate(
        surface=surface,
        spacing=float(p.get("spacing", 3.0)),
        angle=float(p.get("angle", 0.0)),
        feed_rate=float(p.get("feed_rate", 1000.0)),
        zigzag=str(p.get("zigzag", "on")).lower() != "off",
        path_type=p.get("path_type", "infill"),
        normal_offset=float(p.get("normal_offset", 0.0)),
        edge_inset=float(p.get("edge_inset", 0.0)),
    )


if __name__ == "__main__":
    result = raster_fill()
    n_pts = sum(len(tp.points) for tp in result.toolpaths)
    print(f"Generated {len(result.toolpaths)} toolpaths, {n_pts} points")
