"""
Contour-Parallel strategy: generate offset paths inward from a boundary.

Used for perimeters, finishing passes, and pocket clearing.
"""

from __future__ import annotations

import math
from typing import Optional, List

from ..core.primitives import Vector3, Orientation
from ..core.toolpath import ToolpathPoint, Toolpath, ToolpathCollection
from ..core.geometry import Curve
from .base import ToolpathStrategy


class ContourParallelStrategy(ToolpathStrategy):
    """
    Generate contour-parallel (offset) toolpaths from a boundary curve.
    
    Parameters:
        stepover: Distance between offset passes (mm)
        num_passes: Number of offset passes (or auto from stepover)
        feed_rate: Feed rate mm/min
        direction: "inward" or "outward"
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
        stepover: float = 5.0,
        num_passes: int = 5,
        feed_rate: float = 1000.0,
        direction: str = "inward",
        path_type: str = "contour",
        **kwargs,
    ) -> ToolpathCollection:
        if boundary is None:
            # Default: a square boundary
            boundary = Curve.from_points(
                [(50, 50, 0), (-50, 50, 0), (-50, -50, 0), (50, -50, 0), (50, 50, 0)],
                name="default_boundary",
                closed=True,
            )

        collection = ToolpathCollection(name="contour_parallel")
        sign = -1.0 if direction == "inward" else 1.0

        for pass_idx in range(num_passes):
            offset_dist = sign * stepover * (pass_idx + 1)
            offset_curve = self._offset_curve_2d(boundary, offset_dist)

            points = []
            for pt in offset_curve.points:
                tp = ToolpathPoint(
                    position=pt,
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
