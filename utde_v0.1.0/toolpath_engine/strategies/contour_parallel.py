"""
Contour-Parallel strategy: generate offset paths inward from a boundary.

Used for perimeters, finishing passes, and pocket clearing.
"""

from __future__ import annotations

import math
from typing import Optional, List

from ..core.primitives import Vector3, Orientation
from ..core.toolpath import ToolpathPoint, Toolpath, ToolpathCollection
from ..core.geometry import Curve, Surface
from .base import ToolpathStrategy
from .follow_curve import _chain_curves

_Z_UP = Vector3(0.0, 0.0, 1.0)


class ContourParallelStrategy(ToolpathStrategy):
    """
    Generate contour-parallel (offset) toolpaths from a boundary curve.

    Parameters:
        stepover:      Distance between offset passes (mm).
        num_passes:    Number of offset passes.
        feed_rate:     Feed rate (mm/min).
        direction:     ``"inward"`` shrinks the contour, ``"outward"`` expands it.
        path_type:     Toolpath type label.
        chain:         Chain multiple boundary curves into one before offsetting.
        normal_offset: Lift each point along the surface normal (or +Z when no
                       surface is supplied).  Positive lifts away from the surface
                       (mm, default 0).
        inset:         Additional lateral offset perpendicular to the travel
                       direction, within the surface plane.  Computed as
                       ``tangent × normal``.  Positive shifts left-of-travel for a
                       right-hand normal (mm, default 0).  Applied on top of the
                       stepover offset — use to fine-tune contact width.
        surface:       Optional Surface used to look up per-point normals for
                       ``normal_offset`` and ``inset``.  When omitted, +Z is used.
    """

    def __init__(self):
        super().__init__("contour_parallel")

    def _offset_curve_2d(self, curve: Curve, distance: float) -> Curve:
        """
        Offset a curve by a distance (positive = outward, negative = inward).
        Simple 2D offset using point normals — works for planar curves.
        """
        if len(curve.points) < 3:
            return curve

        new_points = []
        n = len(curve.points)

        for i in range(n):
            # Compute local normal (perpendicular to tangent, in XY plane)
            p = curve.points[i]
            tangent = curve.tangent_at(i)
            # 2D normal: rotate tangent 90° in XY
            normal = Vector3(-tangent.y, tangent.x, 0).normalized()

            # Offset point
            new_p = p + normal * distance
            new_points.append(new_p)

        return Curve(new_points, name=f"{curve.name}_offset_{distance:.1f}", closed=curve.closed)

    def generate(
        self,
        boundary: Optional[Curve] = None,
        boundaries: Optional[list] = None,
        stepover: float = 5.0,
        num_passes: int = 5,
        feed_rate: float = 1000.0,
        direction: str = "inward",
        path_type: str = "contour",
        chain: bool = True,
        normal_offset: float = 0.0,
        inset: float = 0.0,
        surface: Optional[Surface] = None,
        **kwargs,
    ) -> ToolpathCollection:
        # Resolve boundary: explicit list > single curve > default square
        curve_list = boundaries or ([boundary] if boundary else [])
        non_empty = [c for c in curve_list if c.points]

        if not non_empty:
            boundary = Curve.from_points(
                [(50, 50, 0), (-50, 50, 0), (-50, -50, 0), (50, -50, 0), (50, 50, 0)],
                name="default_boundary",
                closed=True,
            )
        elif chain and len(non_empty) > 1:
            boundary = _chain_curves(non_empty)
        elif len(non_empty) == 1:
            boundary = non_empty[0]
        else:
            # Multiple boundaries, no chain — use the first (same as before)
            boundary = non_empty[0]

        collection = ToolpathCollection(name="contour_parallel")
        sign = -1.0 if direction == "inward" else 1.0

        for pass_idx in range(num_passes):
            offset_dist = sign * stepover * (pass_idx + 1)
            offset_curve = self._offset_curve_2d(boundary, offset_dist)

            apply_offset = normal_offset != 0.0 or inset != 0.0
            points = []
            for i, pt in enumerate(offset_curve.points):
                if apply_offset:
                    if surface is not None:
                        normal = surface.normal_at_closest(pt)
                    else:
                        normal = _Z_UP
                    offset = normal * normal_offset
                    if inset != 0.0:
                        tangent = offset_curve.tangent_at(i)
                        lateral = tangent.cross(normal).normalized()
                        offset = offset + lateral * inset
                    pos = pt + offset
                else:
                    pos = pt
                tp = ToolpathPoint(
                    position=pos,
                    orientation=Orientation.z_down(),
                    feed_rate=feed_rate,
                    path_type=path_type,
                    source="contour_parallel",
                    curve_ref=boundary.name,
                )
                points.append(tp)

            toolpath = Toolpath(points, name=f"contour_pass_{pass_idx}")
            collection.add(toolpath)

        return collection
