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


# --------------------------------------------------------------------------- #
#  Mesh helpers (used by mesh-backed Surface)
# --------------------------------------------------------------------------- #

def _compute_vertex_normals(verts: np.ndarray, tris: np.ndarray) -> np.ndarray:
    """Area-weighted per-vertex normals for a triangle mesh.

    Each triangle contributes its (un-normalised) cross product — whose length
    is proportional to twice its area — to each of its vertices, then the
    accumulated vectors are normalised. Sign follows the triangle winding, which
    the OCC tessellator emits consistently for a face.
    """
    vn = np.zeros_like(verts)
    if len(tris) == 0:
        return vn
    a, b, c = verts[tris[:, 0]], verts[tris[:, 1]], verts[tris[:, 2]]
    face_n = np.cross(b - a, c - a)          # length ∝ 2·area
    for k in range(3):
        np.add.at(vn, tris[:, k], face_n)
    lens = np.linalg.norm(vn, axis=1, keepdims=True)
    lens[lens < 1e-12] = 1.0
    return vn / lens


def _closest_point_on_triangle(p, a, b, c):
    """Closest point on triangle (a,b,c) to point p, with its barycentric
    weights (wa, wb, wc). Ericson, *Real-Time Collision Detection* §5.1.5."""
    ab, ac, ap = b - a, c - a, p - a
    d1, d2 = float(np.dot(ab, ap)), float(np.dot(ac, ap))
    if d1 <= 0 and d2 <= 0:
        return a, (1.0, 0.0, 0.0)
    bp = p - b
    d3, d4 = float(np.dot(ab, bp)), float(np.dot(ac, bp))
    if d3 >= 0 and d4 <= d3:
        return b, (0.0, 1.0, 0.0)
    vc = d1 * d4 - d3 * d2
    if vc <= 0 and d1 >= 0 and d3 <= 0:
        v = d1 / (d1 - d3)
        return a + v * ab, (1.0 - v, v, 0.0)
    cp = p - c
    d5, d6 = float(np.dot(ab, cp)), float(np.dot(ac, cp))
    if d6 >= 0 and d5 <= d6:
        return c, (0.0, 0.0, 1.0)
    vb = d5 * d2 - d1 * d6
    if vb <= 0 and d2 >= 0 and d6 <= 0:
        w = d2 / (d2 - d6)
        return a + w * ac, (1.0 - w, 0.0, w)
    va = d3 * d6 - d5 * d4
    if va <= 0 and (d4 - d3) >= 0 and (d5 - d6) >= 0:
        w = (d4 - d3) / ((d4 - d3) + (d5 - d6))
        return b + w * (c - b), (0.0, 1.0 - w, w)
    denom = 1.0 / (va + vb + vc)
    v, w = vb * denom, vc * denom
    return a + ab * v + ac * w, (1.0 - v - w, v, w)


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

    # Interior loops (holes): list of boundary loops, each a list of (x, y, z) tuples
    interior_loops: Optional[List[List]] = None

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

    @classmethod
    def mesh(cls, vertices, faces, name="mesh", boundary_loop=None) -> "Surface":
        """Build a mesh-backed surface from a triangulation.

        ``vertices`` is a flat ``[x,y,z, ...]`` list or an ``(N,3)`` array;
        ``faces`` is a flat ``[i,j,k, ...]`` list or an ``(M,3)`` array of
        vertex indices. This is the fallback for CAD faces with no analytic
        parameterisation (cone, torus, NURBS). It supports ``normal_at_closest``
        and ``closest_point`` — enough for surface-normal orientation — but not
        the ``evaluate(u,v)`` UV sweep that raster fill needs (a mesh has no
        global UV; that's a separate parameterisation step).
        """
        verts = np.asarray(vertices, dtype=float).reshape(-1, 3)
        tris = np.asarray(faces, dtype=int).reshape(-1, 3)
        origin = Vector3(*verts.mean(axis=0)) if len(verts) else Vector3()
        s = cls(
            name=name,
            surface_type="mesh",
            _origin=origin,
            _vertices=verts,
            _faces=tris,
            _normals=_compute_vertex_normals(verts, tris),
        )
        if boundary_loop is not None:
            s.boundary_loop = boundary_loop
        return s

    def _ensure_mesh_index(self):
        """Lazily build the KD-tree over vertices + a vertex→faces adjacency.

        scipy is already a runtime dependency (IK) and is present in Pyodide, so
        this works in both the server and the browser build.
        """
        if getattr(self, "_kdtree", None) is not None:
            return
        from scipy.spatial import cKDTree
        self._kdtree = cKDTree(self._vertices)
        adjacency = [[] for _ in range(len(self._vertices))]
        for fi, tri in enumerate(self._faces):
            for v in tri:
                adjacency[int(v)].append(fi)
        self._vertex_faces = adjacency

    def _closest_on_mesh(self, q: np.ndarray):
        """Return ``(face_index, closest_point, barycentric)`` for the mesh point
        nearest ``q``, or ``None`` for an empty mesh.

        KD-tree accelerated: gather the triangles incident to the k nearest
        vertices and take the closest point over that candidate set. Exact for
        reasonably uniform tessellations (what OCC emits).
        """
        if self._vertices is None or len(self._vertices) == 0 or len(self._faces) == 0:
            return None
        self._ensure_mesh_index()
        k = min(8, len(self._vertices))
        _, idxs = self._kdtree.query(q, k=k)
        idxs = np.atleast_1d(idxs)
        best = None
        best_d2 = float("inf")
        seen = set()
        for vi in idxs:
            for fi in self._vertex_faces[int(vi)]:
                if fi in seen:
                    continue
                seen.add(fi)
                tri = self._vertices[self._faces[fi]]
                cp, bary = _closest_point_on_triangle(q, tri[0], tri[1], tri[2])
                diff = cp - q
                d2 = float(np.dot(diff, diff))
                if d2 < best_d2:
                    best_d2, best = d2, (fi, cp, bary)
        return best

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
        """
        Find the closest point on the surface to *point*.
        Returns ``(u, v, closest_3d_point)``.

        Analytical implementations are provided for every built-in surface
        type so that strategies can call this uniformly without branching on
        ``surface_type``.
        """
        if self.surface_type == "mesh":
            q = np.array([point.x, point.y, point.z])
            res = self._closest_on_mesh(q)
            if res is None:
                return 0.0, 0.0, Vector3.from_array(self._origin.to_array())
            _, cp, _bary = res
            # A mesh has no global (u,v); the parametric coordinates are not
            # meaningful here, so return placeholders with the true 3D point.
            return 0.0, 0.0, Vector3(cp[0], cp[1], cp[2])

        if self.surface_type == "plane":
            diff = point - self._origin
            u = diff.dot(self._u_dir)
            v = diff.dot(self._v_dir)
            return u, v, self.evaluate(u, v)

        if self.surface_type == "cylinder":
            # v = signed height along axis; u = angle around axis
            axis = self._normal
            d = point - self._origin
            v = d.dot(axis)
            # Rebuild local radial frame (same as evaluate())
            if abs(axis.z) < 0.9:
                ref = Vector3(0, 0, 1).cross(axis).normalized()
            else:
                ref = Vector3(1, 0, 0).cross(axis).normalized()
            perp = axis.cross(ref).normalized()
            radial = d - axis * v
            u = math.atan2(radial.dot(perp), radial.dot(ref))
            u_min, u_max = self.bounds[0], self.bounds[1]
            while u < u_min - 1e-9:
                u += 2 * math.pi
            while u > u_max + 1e-9:
                u -= 2 * math.pi
            return u, v, self.evaluate(u, v)

        if self.surface_type == "sphere":
            # v = latitude (asin), u = longitude (atan2)
            d = point - self._origin
            length = math.sqrt(d.x**2 + d.y**2 + d.z**2)
            if length < 1e-12:
                return 0.0, 0.0, self._origin
            v = math.asin(max(-1.0, min(1.0, d.z / length)))
            u = math.atan2(d.y, d.x)
            u_min, u_max = self.bounds[0], self.bounds[1]
            while u < u_min - 1e-9:
                u += 2 * math.pi
            while u > u_max + 1e-9:
                u -= 2 * math.pi
            return u, v, self.evaluate(u, v)

        # Generic fallback for any other surface type: coarse grid then refine
        best_u, best_v = 0.0, 0.0
        best_dist = float("inf")
        u0, u1, v0, v1 = self.bounds
        for i in range(20):
            for j in range(20):
                u = u0 + (u1 - u0) * i / 19
                v = v0 + (v1 - v0) * j / 19
                d = self.evaluate(u, v).distance_to(point)
                if d < best_dist:
                    best_dist, best_u, best_v = d, u, v
        return best_u, best_v, self.evaluate(best_u, best_v)

    def _estimate_curvatures(self) -> Tuple[float, float]:
        """
        Estimate principal curvatures (κ_u, κ_v) at the surface centre using
        finite differences on the normal field.  κ = |Δn| / |Δp| per unit arc.

        Returns ``(kappa_u, kappa_v)`` in units of 1/mm.  Zero means flat in
        that direction.
        """
        u0, u1, v0, v1 = self.bounds
        uc = (u0 + u1) / 2.0
        vc = (v0 + v1) / 2.0
        du = (u1 - u0) * 0.02
        dv = (v1 - v0) * 0.02

        kappa_u = 0.0
        if du > 1e-12:
            p0 = self.evaluate(uc - du, vc)
            p1 = self.evaluate(uc + du, vc)
            arc = p0.distance_to(p1)
            if arc > 1e-12:
                n0 = self.normal_at(uc - du, vc)
                n1 = self.normal_at(uc + du, vc)
                kappa_u = n0.distance_to(n1) / arc

        kappa_v = 0.0
        if dv > 1e-12:
            p0 = self.evaluate(uc, vc - dv)
            p1 = self.evaluate(uc, vc + dv)
            arc = p0.distance_to(p1)
            if arc > 1e-12:
                n0 = self.normal_at(uc, vc - dv)
                n1 = self.normal_at(uc, vc + dv)
                kappa_v = n0.distance_to(n1) / arc

        return kappa_u, kappa_v

    def max_step_for_tolerance(self, chord_tol: float) -> float:
        """
        Return the maximum step size in mm such that the chord between
        consecutive toolpath points deviates from the true surface by at most
        ``chord_tol`` mm.

        Derived from the chordal-deviation formula for a circular arc of
        radius R:  step = 2 √(2 R δ)  where δ = chord_tol.

        Returns ``float('inf')`` for flat surfaces (no curvature constraint).
        """
        if chord_tol <= 0:
            raise ValueError("chord_tol must be positive")
        kappa_u, kappa_v = self._estimate_curvatures()
        kappa_max = max(kappa_u, kappa_v)
        if kappa_max < 1e-12:
            return float("inf")
        return 2.0 * math.sqrt(2.0 * chord_tol / kappa_max)

    def max_spacing_for_scallop(self, scallop_height: float) -> float:
        """
        Return the maximum pass spacing in mm such that the maximum uncut
        ridge between adjacent raster passes is at most ``scallop_height`` mm.

        Uses the same chordal formula applied to the cross-pass curvature.

        Returns ``float('inf')`` for surfaces that are flat in the cross-pass
        direction.
        """
        if scallop_height <= 0:
            raise ValueError("scallop_height must be positive")
        kappa_u, kappa_v = self._estimate_curvatures()
        kappa_max = max(kappa_u, kappa_v)
        if kappa_max < 1e-12:
            return float("inf")
        return 2.0 * math.sqrt(2.0 * scallop_height / kappa_max)

    def normal_at_closest(self, point: Vector3) -> Vector3:
        """Get surface normal at the point on the surface closest to the given point."""
        if self.surface_type == "mesh":
            q = np.array([point.x, point.y, point.z])
            res = self._closest_on_mesh(q)
            if res is None:
                return self._normal
            fi, _cp, bary = res
            # Barycentric blend of the triangle's vertex normals — smooth across
            # the face rather than faceted per triangle.
            vns = self._normals[self._faces[fi]]
            n = bary[0] * vns[0] + bary[1] * vns[1] + bary[2] * vns[2]
            nv = Vector3(float(n[0]), float(n[1]), float(n[2]))
            return nv.normalized() if nv.length() > 1e-12 else self._normal
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

    def face_by_id(self, fid) -> Optional[Surface]:
        """Look up a surface by face id.

        Surfaces built from a parsed STEP model are named ``face_<id>`` (see
        ``webapi.build_geometry_dicts``); a direct name match is also accepted.
        Returns ``None`` if no such surface exists. This is the lookup the
        Setup-tab's generated ``to_normal(model.face_by_id(...))`` relies on.
        """
        key = f"face_{fid}"
        if key in self.surfaces:
            return self.surfaces[key]
        name = str(fid)
        return self.surfaces.get(name)

    def top_surface(self) -> Optional[Surface]:
        """Return the surface whose origin sits highest in Z — a convenient
        default target for orientation rules. ``None`` when there are none."""
        if not self.surfaces:
            return None
        return max(
            self.surfaces.values(),
            key=lambda s: getattr(s, "_origin", Vector3()).z,
        )

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
