"""
Follow-Curve strategy: trace an existing curve as a toolpath.

The simplest and most fundamental strategy — used for single-bead
deposition, edge following, and any path defined by explicit geometry.
"""

from __future__ import annotations

from typing import Optional

from ..core.primitives import Vector3, Orientation
from ..core.toolpath import ToolpathPoint, Toolpath, ToolpathCollection
from ..core.geometry import Curve, Surface
from .base import ToolpathStrategy


class FollowCurveStrategy(ToolpathStrategy):
    """
    Generate a toolpath by following one or more curves.
    
    Parameters:
        feed_rate: Feed rate in mm/min (default 1000)
        spacing: Resample spacing in mm (default None = use original points)
        path_type: Classification string (default "cut")
    """

    def __init__(self):
        super().__init__("follow_curve")

    def generate(
        self,
        curve: Optional[Curve] = None,
        curves: Optional[list] = None,
        feed_rate: float = 1000.0,
        spacing: Optional[float] = None,
        path_type: str = "cut",
        source: str = "follow_curve",
        **kwargs,
    ) -> ToolpathCollection:
        collection = ToolpathCollection(name="follow_curve")
        
        curve_list = curves or ([curve] if curve else [])

        for crv in curve_list:
            if spacing:
                crv = crv.resample(spacing)

            points = []
            for i, pt in enumerate(crv.points):
                tp = ToolpathPoint(
                    position=pt,
                    orientation=Orientation.z_down(),
                    feed_rate=feed_rate,
                    path_type=path_type,
                    source=source,
                    curve_ref=crv.name,
                )
                points.append(tp)

            toolpath = Toolpath(points, name=f"follow_{crv.name}")
            collection.add(toolpath)

        return collection
