"""
Toolpath data structures.

A Toolpath is a sequence of ToolpathPoints — each carrying position,
orientation, and process parameters. ToolpathCollection groups multiple
toolpaths (e.g. layers, passes, regions).
"""

from __future__ import annotations

import copy
from dataclasses import dataclass, field
from typing import Optional, Dict, List, Callable, Any
import numpy as np

from .primitives import Vector3, Position, Orientation, Frame


@dataclass
class ToolpathPoint:
    """
    A single point on a toolpath with full manufacturing context.
    
    Every point is a first-class citizen regardless of its origin
    (manual, slicer, CAM engine, etc.).
    """
    position: Vector3 = field(default_factory=Vector3)
    orientation: Orientation = field(default_factory=Orientation.z_down)
    feed_rate: float = 0.0          # mm/min
    rapid: bool = False

    # Process parameters — flexible dict for any process
    process_params: Dict[str, Any] = field(default_factory=dict)

    # Metadata
    source: str = "manual"          # origin: "manual", "libslic3r", "raster_fill", etc.
    layer_index: int = 0
    path_type: str = "cut"          # "perimeter", "infill", "travel", "rapid", "cut", "deposit"
    frame: Optional[Frame] = None

    # Optional reference back to source geometry
    surface_ref: Optional[str] = None
    curve_ref: Optional[str] = None

    @property
    def xyz(self) -> np.ndarray:
        return self.position.to_array()

    @property
    def ijk(self) -> np.ndarray:
        return self.orientation.to_array()

    def copy(self) -> "ToolpathPoint":
        return copy.deepcopy(self)

    def with_position(self, pos: Vector3) -> "ToolpathPoint":
        pt = self.copy()
        pt.position = pos
        return pt

    def with_orientation(self, orient: Orientation) -> "ToolpathPoint":
        pt = self.copy()
        pt.orientation = orient
        return pt

    def with_feed(self, feed: float) -> "ToolpathPoint":
        pt = self.copy()
        pt.feed_rate = feed
        return pt

    def set_param(self, key: str, value: Any):
        self.process_params[key] = value

    def get_param(self, key: str, default: Any = None) -> Any:
        return self.process_params.get(key, default)

    def __repr__(self):
        return (
            f"ToolpathPoint(pos={self.position}, "
            f"orient={self.orientation}, "
            f"F={self.feed_rate:.0f}, type='{self.path_type}')"
        )


class Toolpath:
    """
    An ordered sequence of ToolpathPoints forming a continuous path.
    
    Supports orient chaining, parameter assignment, and concatenation.
    """

    def __init__(self, points: Optional[List[ToolpathPoint]] = None, name: str = ""):
        self.points: List[ToolpathPoint] = points or []
        self.name = name
        self.metadata: Dict[str, Any] = {}

    # --- point access --------------------------------------------------------
    def __len__(self) -> int:
        return len(self.points)

    def __getitem__(self, idx):
        if isinstance(idx, slice):
            tp = Toolpath(self.points[idx], name=self.name)
            tp.metadata = self.metadata.copy()
            return tp
        return self.points[idx]

    def __iter__(self):
        return iter(self.points)

    def append(self, point: ToolpathPoint):
        self.points.append(point)

    @property
    def start(self) -> Optional[ToolpathPoint]:
        return self.points[0] if self.points else None

    @property
    def end(self) -> Optional[ToolpathPoint]:
        return self.points[-1] if self.points else None

    @property
    def start_orient(self) -> Optional[Orientation]:
        return self.points[0].orientation if self.points else None

    # --- concatenation -------------------------------------------------------
    def __add__(self, other: "Toolpath") -> "Toolpath":
        """Concatenate two toolpaths."""
        return Toolpath(self.points + other.points, name=f"{self.name}+{other.name}")

    # --- orient (the first-class operation) ----------------------------------
    def orient(self, rule: Callable):
        """
        Apply an orientation rule to all points.
        
        Rules are composable — calling orient() multiple times chains them.
        Each rule receives a point and returns a modified orientation.
        
        Usage:
            paths.orient(to_normal(surface))
            paths.orient(lead(15))        # stacks on top of previous
            paths.orient(avoid_collision(machine, max_tilt=20))
        """
        for i, pt in enumerate(self.points):
            context = {
                "index": i,
                "total": len(self.points),
                "prev": self.points[i - 1] if i > 0 else None,
                "next": self.points[i + 1] if i < len(self.points) - 1 else None,
            }
            new_orient = rule(pt, context)
            if new_orient is not None:
                pt.orientation = new_orient

    # --- parameter assignment ------------------------------------------------
    def set_feed_rate(self, feed: float):
        for pt in self.points:
            pt.feed_rate = feed

    def set_param(self, key: str, value: Any):
        for pt in self.points:
            pt.process_params[key] = value

    def set_path_type(self, path_type: str):
        for pt in self.points:
            pt.path_type = path_type

    def set_source(self, source: str):
        for pt in self.points:
            pt.source = source

    # --- filtering -----------------------------------------------------------
    def where(self, predicate: Callable[[ToolpathPoint], bool]) -> "Toolpath":
        """Return a new toolpath with only points matching the predicate."""
        return Toolpath(
            [pt for pt in self.points if predicate(pt)],
            name=f"{self.name}_filtered"
        )

    def transform(self, fn: Callable[[ToolpathPoint], ToolpathPoint]) -> "Toolpath":
        """Return a new toolpath with each point transformed by fn."""
        return Toolpath(
            [fn(pt.copy()) for pt in self.points],
            name=f"{self.name}_transformed"
        )

    # --- geometry queries ----------------------------------------------------
    def total_length(self) -> float:
        """Total path length in mm."""
        length = 0.0
        for i in range(1, len(self.points)):
            length += self.points[i].position.distance_to(
                self.points[i - 1].position
            )
        return length

    def bounding_box(self):
        """Returns (min_corner, max_corner) as Vector3."""
        if not self.points:
            return Vector3(), Vector3()
        xs = [p.position.x for p in self.points]
        ys = [p.position.y for p in self.points]
        zs = [p.position.z for p in self.points]
        return (
            Vector3(min(xs), min(ys), min(zs)),
            Vector3(max(xs), max(ys), max(zs)),
        )

    # --- convenience constructors -------------------------------------------
    @classmethod
    def rapid_to(cls, pos: Position) -> "Toolpath":
        """Create a single-point rapid move."""
        pt = ToolpathPoint(
            position=pos.vec,
            rapid=True,
            path_type="rapid",
            feed_rate=0,
        )
        return cls([pt], name=f"rapid_to_{pos.name or 'point'}")

    @classmethod
    def linear_to(cls, pos: Position, feed: float = 1000.0) -> "Toolpath":
        """Create a single-point linear move."""
        pt = ToolpathPoint(
            position=pos.vec,
            feed_rate=feed,
            path_type="travel",
        )
        return cls([pt], name=f"move_to_{pos.name or 'point'}")

    def __repr__(self):
        return f"Toolpath('{self.name}', {len(self.points)} points, length={self.total_length():.1f}mm)"


class ToolpathCollection:
    """
    A collection of toolpaths, optionally organized by layer.
    
    This is what toolpath strategies return and what post-processors consume.
    """

    def __init__(self, name: str = ""):
        self.name = name
        self.toolpaths: List[Toolpath] = []
        self.layers: Dict[int, List[Toolpath]] = {}
        self.metadata: Dict[str, Any] = {}

    def add(self, toolpath: Toolpath, layer: Optional[int] = None):
        self.toolpaths.append(toolpath)
        if layer is not None:
            if layer not in self.layers:
                self.layers[layer] = []
            self.layers[layer].append(toolpath)

    def all_points(self) -> List[ToolpathPoint]:
        """Flat list of all points across all toolpaths."""
        pts = []
        for tp in self.toolpaths:
            pts.extend(tp.points)
        return pts

    def total_points(self) -> int:
        return sum(len(tp) for tp in self.toolpaths)

    def total_length(self) -> float:
        return sum(tp.total_length() for tp in self.toolpaths)

    def orient(self, rule: Callable):
        """Apply orient rule to all toolpaths in collection."""
        for tp in self.toolpaths:
            tp.orient(rule)

    def set_feed_rate(self, feed: float):
        for tp in self.toolpaths:
            tp.set_feed_rate(feed)

    def set_param(self, key: str, value: Any):
        for tp in self.toolpaths:
            tp.set_param(key, value)

    def __len__(self):
        return len(self.toolpaths)

    def __iter__(self):
        return iter(self.toolpaths)

    def __repr__(self):
        return (
            f"ToolpathCollection('{self.name}', "
            f"{len(self.toolpaths)} paths, "
            f"{self.total_points()} points, "
            f"{self.total_length():.1f}mm)"
        )
