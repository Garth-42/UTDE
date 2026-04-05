"""
Geometry abstractions for surfaces, curves, and imported models.

In a full implementation, these would wrap pythonocc/OpenCascade objects.
This initial version provides a functional interface using analytical
and mesh-based geometry that can be replaced with a full CAD kernel later.
"""

from __future__ import annotations

import math
from dataclasses import dataclass, field
from typing import Optional, Dict, List, Tuple, Callable, Any
import numpy as np

from .primitives import Vector3, Frame


@dataclass
class Curve:
    """
    A 3D curve defined by a sequence of sample points.
    
    In the full implementation, this wraps an OpenCascade curve
    (NURBS, BSpline, etc.) with parametric evaluation. This version
    uses polyline representation with interpolation.
    """
    points: List[Vector3] = field(default_factory=list)
    name: str = ""
    closed: bool = False

    @classmethod
    def from_points(cls, coords: List[Tuple[float, float, float]], name: str = "", closed: bool = False) -> "Curve":
        return cls(
            points=[Vector3(*c) for c in coords],
            name=name,
            closed=closed,
        )

    @classmethod
    def line(cls, start: Tuple[float, float, float], end: Tuple[float, float, float], num_points: int = 50) -> "Curve":
        s, e = Vector3(*start), Vector3(*end)
        pts = [s.lerp(e, t / (num_points - 1)) for t in range(num_points)]
        return cls(pts, name="line")

    @classmethod
    def circle(cls, center: Tuple[float, float, float], radius: float, normal: Tuple[float, float, float] = (0, 0, 1), num_points: int = 64) -> "Curve":
        """Create a circle in the plane defined by normal."""
        c = Vector3(*center)
        n = Vector3(*normal).normalized()

        # Build local frame
        if abs(n.z) < 0.9:
            u = Vector3(0, 0, 1).cross(n).normalized()
        else:
            u = Vector3(1, 0, 0).cross(n).normalized()
        v = n.cross(u).normalized()

        pts = []
        for i in range(num_points):
            angle = 2 * math.pi * i / num_points
            p = c + u * (radius * math.cos(angle)) + v * (radius * math.sin(angle))
            pts.append(p)
        return cls(pts, name="circle", closed=True)

    @classmethod
    def helix(cls, center: Tuple[float, float, float], radius: float, pitch: float, turns: float, num_points_per_turn: int = 64) -> "Curve":
        c = Vector3(*center)
        total = int(turns * num_points_per_turn)
        pts = []
        for i in range(total + 1):
            angle = 2 * math.pi * i / num_points_per_turn
            z_offset = pitch * i / num_points_per_turn
            p = Vector3(
                c.x + radius * math.cos(angle),
                c.y + radius * math.sin(angle),
                c.z + z_offset,
            )
            pts.append(p)
        return cls(pts, name="helix")

    def tangent_at(self, index: int) -> Vector3:
        """Approximate tangent at a point index."""
        if len(self.points) < 2:
            return Vector3(1, 0, 0)
        if index == 0:
            return (self.points[1] - self.points[0]).normalized()
        if index >= len(self.points) - 1:
            return (self.points[-1] - self.points[-2]).normalized()
        return (self.points[index + 1] - self.points[index - 1]).normalized()

    def length(self) -> float:
        dist = 0.0
        for i in range(1, len(self.points)):
            dist += self.points[i].distance_to(self.points[i - 1])
        return dist

    def resample(self, spacing: float) -> "Curve":
        """Resample curve at uniform arc-length spacing."""
        if len(self.points) < 2:
            return Curve(list(self.points), self.name, self.closed)

        total = self.length()
        num = max(2, int(total / spacing))
        target_spacing = total / num

        new_pts = [self.points[0]]
        accum = 0.0
        j = 0
        for i in range(1, len(self.points)):
            seg_len = self.points[i].distance_to(self.points[i - 1])
            accum += seg_len
            while accum >= target_spacing and len(new_pts) < num:
                overshoot = accum - target_spacing
                t = 1.0 - (overshoot / seg_len) if seg_len > 1e-12 else 1.0
                new_pt = self.points[i - 1].lerp(self.points[i], t)
                new_pts.append(new_pt)
                accum = overshoot

        if len(new_pts) < num + 1:
            new_pts.append(self.points[-1])
        return Curve(new_pts, f"{self.name}_resampled", self.closed)

    def __len__(self):
        return len(self.points)

    def __repr__(self):
        return f"Curve('{self.name}', {len(self.points)} pts, length={self.length():.1f}mm)"


@dataclass
class Surface:
    """
    A parametric surface that can return position and normal at (u, v).
    
    This base implementation supports analytical surfaces (plane, cylinder,
    sphere). The full implementation wraps OpenCascade NURBS surfaces.
    """
    name: str = ""
    surface_type: str = "plane"     # "plane", "cylinder", "sphere", "mesh"

    # Plane parameters
    _origin: Vector3 = field(default_factory=Vector3)
    _normal: Vector3 = field(default_factory=lambda: Vector3(0, 0, 1))
    _u_dir: Vector3 = field(default_factory=lambda: Vector3(1, 0, 0))
    _v_dir: Vector3 = field(default_factory=lambda: Vector3(0, 1, 0))

    # Bounds (u_min, u_max, v_min, v_max)
    bounds: Tuple[float, float, float, float] = (-100, 100, -100, 100)

    # For mesh-based surfaces
    _vertices: Optional[np.ndarray] = None
    _faces: Optional[np.ndarray] = None
    _normals: Optional[np.ndarray] = None

    # Boundary loop: list of (x, y, z) tuples tracing the outer edge of the surface
    boundary_loop: Optional[List] = None

    @classmethod
    def plane(cls, origin=(0, 0, 0), normal=(0, 0, 1), size=100, name="plane") -> "Surface":
        n = Vector3(*normal).normalized()
        # Build U/V directions
        if abs(n.z) < 0.9:
            u = Vector3(0, 0, 1).cross(n).normalized()
        else:
            u = Vector3(1, 0, 0).cross(n).normalized()
        v = n.cross(u).normalized()
        return cls(
            name=name,
            surface_type="plane",
            _origin=Vector3(*origin),
            _normal=n,
            _u_dir=u,
            _v_dir=v,
            bounds=(-size / 2, size / 2, -size / 2, size / 2),
        )

    @classmethod
    def cylinder(cls, center=(0, 0, 0), axis=(0, 0, 1), radius=50, height=100, name="cylinder") -> "Surface":
        """Cylindrical surface. u = angle (0 to 2pi), v = height (0 to h)."""
        return cls(
            name=name,
            surface_type="cylinder",
            _origin=Vector3(*center),
            _normal=Vector3(*axis).normalized(),
            _u_dir=Vector3(radius, 0, 0),  # stores radius in x component
            bounds=(0, 2 * math.pi, 0, height),
        )

    @classmethod
    def sphere(cls, center=(0, 0, 0), radius=50, name="sphere") -> "Surface":
        return cls(
            name=name,
            surface_type="sphere",
            _origin=Vector3(*center),
            _u_dir=Vector3(radius, 0, 0),
            bounds=(0, 2 * math.pi, -math.pi / 2, math.pi / 2),
        )

    def evaluate(self, u: float, v: float) -> Vector3:
        """Get position at parametric coordinates (u, v)."""
        if self.surface_type == "plane":
            return self._origin + self._u_dir * u + self._v_dir * v

        elif self.surface_type == "cylinder":
            r = self._u_dir.x  # radius stored here
            axis = self._normal
            # Build local frame for cylinder
            if abs(axis.z) < 0.9:
                ref = Vector3(0, 0, 1).cross(axis).normalized()
            else:
                ref = Vector3(1, 0, 0).cross(axis).normalized()
            perp = axis.cross(ref).normalized()
            return (
                self._origin
                + ref * (r * math.cos(u))
                + perp * (r * math.sin(u))
                + axis * v
            )

        elif self.surface_type == "sphere":
            r = self._u_dir.x
            return Vector3(
                self._origin.x + r * math.cos(v) * math.cos(u),
                self._origin.y + r * math.cos(v) * math.sin(u),
                self._origin.z + r * math.sin(v),
            )

        return self._origin

    def normal_at(self, u: float, v: float) -> Vector3:
        """Get outward surface normal at (u, v)."""
        if self.surface_type == "plane":
            return self._normal

        elif self.surface_type == "cylinder":
            pos = self.evaluate(u, v)
            # Normal points radially outward from axis
            axis = self._normal
            center_on_axis = self._origin + axis * v
            radial = (pos - center_on_axis).normalized()
            return radial

        elif self.surface_type == "sphere":
            pos = self.evaluate(u, v)
            return (pos - self._origin).normalized()

        return self._normal

    def closest_point(self, point: Vector3) -> Tuple[float, float, Vector3]:
        """Find closest point on surface. Returns (u, v, closest_point)."""
        if self.surface_type == "plane":
            diff = point - self._origin
            u = diff.dot(self._u_dir)
            v = diff.dot(self._v_dir)
            cp = self.evaluate(u, v)
            return u, v, cp

        # For other types, use numerical sampling (simplified)
        best_u, best_v = 0.0, 0.0
        best_dist = float("inf")
        nu, nv = 50, 50
        u0, u1, v0, v1 = self.bounds
        for i in range(nu):
            for j in range(nv):
                u = u0 + (u1 - u0) * i / (nu - 1)
                v = v0 + (v1 - v0) * j / (nv - 1)
                p = self.evaluate(u, v)
                d = p.distance_to(point)
                if d < best_dist:
                    best_dist = d
                    best_u, best_v = u, v
        return best_u, best_v, self.evaluate(best_u, best_v)

    def normal_at_closest(self, point: Vector3) -> Vector3:
        """Get surface normal at the point on the surface closest to the given point."""
        u, v, _ = self.closest_point(point)
        return self.normal_at(u, v)

    def __repr__(self):
        return f"Surface('{self.name}', type='{self.surface_type}')"


class GeometryModel:
    """
    A container for imported CAD geometry — surfaces, curves, and metadata.
    
    In the full implementation, this wraps an OpenCascade TopoDS_Shape loaded
    from a STEP file. This version holds explicit Surface and Curve objects.
    """

    def __init__(self, name: str = "model"):
        self.name = name
        self.surfaces: Dict[str, Surface] = {}
        self.curves: Dict[str, Curve] = {}
        self.metadata: Dict[str, Any] = {}
        self.tags: Dict[str, List[str]] = {}  # tag -> list of entity names

    def add_surface(self, surface: Surface, tags: Optional[List[str]] = None):
        self.surfaces[surface.name] = surface
        if tags:
            for tag in tags:
                if tag not in self.tags:
                    self.tags[tag] = []
                self.tags[tag].append(surface.name)

    def add_curve(self, curve: Curve, tags: Optional[List[str]] = None):
        self.curves[curve.name] = curve
        if tags:
            for tag in tags:
                if tag not in self.tags:
                    self.tags[tag] = []
                self.tags[tag].append(curve.name)

    def select_surfaces(self, tag: Optional[str] = None) -> List[Surface]:
        if tag and tag in self.tags:
            return [self.surfaces[n] for n in self.tags[tag] if n in self.surfaces]
        return list(self.surfaces.values())

    def select_curves(self, tag: Optional[str] = None) -> List[Curve]:
        if tag and tag in self.tags:
            return [self.curves[n] for n in self.tags[tag] if n in self.curves]
        return list(self.curves.values())

    def __repr__(self):
        return (
            f"GeometryModel('{self.name}', "
            f"{len(self.surfaces)} surfaces, "
            f"{len(self.curves)} curves)"
        )
