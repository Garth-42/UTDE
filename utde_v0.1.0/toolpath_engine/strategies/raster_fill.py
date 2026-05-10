"""
Raster-Fill strategy: generate parallel passes over a surface region,
clipped to the actual surface boundary.
"""

from __future__ import annotations

import math
from typing import Optional, List, Tuple

import numpy as np

from ..core.primitives import Vector3, Orientation
from ..core.toolpath import ToolpathPoint, Toolpath, ToolpathCollection
from ..core.geometry import Surface, Curve
from .base import ToolpathStrategy
from .follow_curve import _chain_curves

# ── Clipper backend (pyclipper when available, hand-rolled fallback) ───────────

try:
    import pyclipper as _pc
    _CLIPPER_SCALE = int(1e6)
    _PYCLIPPER = True
except ImportError:
    _PYCLIPPER = False


def _clip_segment_pyclipper(
    p1: Tuple[float, float],
    p2: Tuple[float, float],
    clip_poly: List[Tuple[float, float]],
) -> List[Tuple[Tuple[float, float], Tuple[float, float]]]:
    """Clip an open segment to the inside of clip_poly using Clipper."""
    subj = _pc.scale_to_clipper([list(p1), list(p2)], _CLIPPER_SCALE)
    clip = _pc.scale_to_clipper([list(p) for p in clip_poly], _CLIPPER_SCALE)
    pc = _pc.Pyclipper()
    pc.AddPath(subj, _pc.PT_SUBJECT, False)
    pc.AddPath(clip, _pc.PT_CLIP, True)
    tree = pc.Execute2(_pc.CT_INTERSECTION, _pc.PFT_NONZERO, _pc.PFT_NONZERO)
    segs = []
    for path in _pc.OpenPathsFromPolyTree(tree):
        pts = _pc.scale_from_clipper(path, _CLIPPER_SCALE)
        for i in range(len(pts) - 1):
            segs.append((tuple(pts[i]), tuple(pts[i + 1])))
    return segs


def _subtract_hole_pyclipper(
    segments: List[Tuple[Tuple[float, float], Tuple[float, float]]],
    hole: List[Tuple[float, float]],
) -> List[Tuple[Tuple[float, float], Tuple[float, float]]]:
    """Remove portions of segments inside the hole polygon using Clipper."""
    hole_int = _pc.scale_to_clipper([list(p) for p in hole], _CLIPPER_SCALE)
    result = []
    for p1, p2 in segments:
        subj = _pc.scale_to_clipper([list(p1), list(p2)], _CLIPPER_SCALE)
        pc = _pc.Pyclipper()
        pc.AddPath(subj, _pc.PT_SUBJECT, False)
        pc.AddPath(hole_int, _pc.PT_CLIP, True)
        tree = pc.Execute2(_pc.CT_DIFFERENCE, _pc.PFT_NONZERO, _pc.PFT_NONZERO)
        for path in _pc.OpenPathsFromPolyTree(tree):
            pts = _pc.scale_from_clipper(path, _CLIPPER_SCALE)
            for i in range(len(pts) - 1):
                result.append((tuple(pts[i]), tuple(pts[i + 1])))
    return result


# ── 2D polygon utilities ───────────────────────────────────────────────────────

def _polygon_signed_area(poly: List[Tuple[float, float]]) -> float:
    """Signed area (positive = CCW)."""
    n = len(poly)
    area = 0.0
    for i in range(n):
        x1, y1 = poly[i]
        x2, y2 = poly[(i + 1) % n]
        area += x1 * y2 - x2 * y1
    return area / 2.0


def _ensure_ccw(poly: List[Tuple[float, float]]) -> List[Tuple[float, float]]:
    return poly if _polygon_signed_area(poly) > 0 else list(reversed(poly))


def _point_in_polygon(px: float, py: float, poly: List[Tuple[float, float]]) -> bool:
    """Ray-casting point-in-polygon test."""
    inside = False
    n = len(poly)
    j = n - 1
    for i in range(n):
        xi, yi = poly[i]
        xj, yj = poly[j]
        if ((yi > py) != (yj > py)) and (px < (xj - xi) * (py - yi) / (yj - yi + 1e-30) + xi):
            inside = not inside
        j = i
    return inside


def _subtract_polygon_from_segments(
    segments: List[Tuple[Tuple[float, float], Tuple[float, float]]],
    hole: List[Tuple[float, float]],
) -> List[Tuple[Tuple[float, float], Tuple[float, float]]]:
    """
    Remove the portions of each segment that fall inside the hole polygon.
    Returns the surviving (outside) sub-segments.
    """
    result = []
    for seg_s, seg_e in segments:
        dx = seg_e[0] - seg_s[0]
        dy = seg_e[1] - seg_s[1]
        if math.sqrt(dx * dx + dy * dy) < 1e-12:
            if not _point_in_polygon(seg_s[0], seg_s[1], hole):
                result.append((seg_s, seg_e))
            continue

        t_vals = [0.0, 1.0]
        n = len(hole)
        for i in range(n):
            ax, ay = hole[i]
            bx, by = hole[(i + 1) % n]
            ex, ey = bx - ax, by - ay
            denom = dx * ey - dy * ex
            if abs(denom) < 1e-12:
                continue
            t = ((ax - seg_s[0]) * ey - (ay - seg_s[1]) * ex) / denom
            s = ((ax - seg_s[0]) * dy - (ay - seg_s[1]) * dx) / denom
            if -1e-9 <= s <= 1.0 + 1e-9:
                t_vals.append(max(0.0, min(1.0, t)))

        t_vals = sorted(set(round(t, 10) for t in t_vals))

        for i in range(len(t_vals) - 1):
            t_mid = (t_vals[i] + t_vals[i + 1]) / 2.0
            mx = seg_s[0] + t_mid * dx
            my = seg_s[1] + t_mid * dy
            if not _point_in_polygon(mx, my, hole):   # keep OUTSIDE the hole
                start = (seg_s[0] + t_vals[i] * dx,     seg_s[1] + t_vals[i] * dy)
                end   = (seg_s[0] + t_vals[i + 1] * dx, seg_s[1] + t_vals[i + 1] * dy)
                result.append((start, end))
    return result


def _clip_segment_to_polygon(
    p1: Tuple[float, float],
    p2: Tuple[float, float],
    poly: List[Tuple[float, float]],
) -> List[Tuple[Tuple[float, float], Tuple[float, float]]]:
    """
    Clip line segment p1→p2 to a general (possibly concave) polygon.
    Returns a list of (start, end) 2D point pairs for inside sub-segments.
    """
    dx = p2[0] - p1[0]
    dy = p2[1] - p1[1]
    if math.sqrt(dx * dx + dy * dy) < 1e-12:
        return []

    t_vals = [0.0, 1.0]
    n = len(poly)
    for i in range(n):
        ax, ay = poly[i]
        bx, by = poly[(i + 1) % n]
        ex, ey = bx - ax, by - ay
        denom = dx * ey - dy * ex
        if abs(denom) < 1e-12:
            continue
        t = ((ax - p1[0]) * ey - (ay - p1[1]) * ex) / denom
        s = ((ax - p1[0]) * dy - (ay - p1[1]) * dx) / denom
        if -1e-9 <= s <= 1.0 + 1e-9:
            t_vals.append(max(0.0, min(1.0, t)))

    t_vals = sorted(set(round(t, 10) for t in t_vals))

    segments = []
    for i in range(len(t_vals) - 1):
        t_mid = (t_vals[i] + t_vals[i + 1]) / 2.0
        mx = p1[0] + t_mid * dx
        my = p1[1] + t_mid * dy
        if _point_in_polygon(mx, my, poly):
            start = (p1[0] + t_vals[i] * dx,       p1[1] + t_vals[i] * dy)
            end   = (p1[0] + t_vals[i + 1] * dx,   p1[1] + t_vals[i + 1] * dy)
            segments.append((start, end))
    return segments


def _inset_polygon_2d(
    poly: List[Tuple[float, float]],
    inset: float,
) -> List[Tuple[float, float]]:
    """
    Inset a CCW 2D polygon by offsetting each edge inward by `inset` mm,
    then finding new vertex positions at adjacent edge intersections.
    """
    if inset <= 0 or len(poly) < 3:
        return poly

    n = len(poly)

    # Offset each edge inward (for CCW polygon, inward normal = left of edge direction)
    offset_edges = []
    for i in range(n):
        ax, ay = poly[i]
        bx, by = poly[(i + 1) % n]
        ex, ey = bx - ax, by - ay
        length = math.sqrt(ex * ex + ey * ey)
        if length < 1e-12:
            offset_edges.append(((ax, ay), (bx, by)))
            continue
        nx, ny = -ey / length, ex / length   # inward normal for CCW polygon
        offset_edges.append((
            (ax + nx * inset, ay + ny * inset),
            (bx + nx * inset, by + ny * inset),
        ))

    # New vertices: intersection of adjacent offset edges
    result = []
    for i in range(n):
        p1, p2 = offset_edges[(i - 1) % n]
        p3, p4 = offset_edges[i]
        dx1, dy1 = p2[0] - p1[0], p2[1] - p1[1]
        dx2, dy2 = p4[0] - p3[0], p4[1] - p3[1]
        denom = dx1 * dy2 - dy1 * dx2
        if abs(denom) < 1e-12:
            result.append(p3)   # parallel edges — use start of second edge
            continue
        t = ((p3[0] - p1[0]) * dy2 - (p3[1] - p1[1]) * dx2) / denom
        result.append((p1[0] + t * dx1, p1[1] + t * dy1))

    return result


def _project_boundary_to_uv(
    boundary_3d: List[Tuple[float, float, float]],
    surface: Surface,
) -> Optional[List[Tuple[float, float]]]:
    """
    Project a 3D boundary loop into UV space by inverting the surface
    parameterisation via ``Surface.closest_point()``.  Works for any
    surface type — no branching on ``surface_type`` here.
    """
    if not boundary_3d or len(boundary_3d) < 3:
        return None
    result = []
    for p in boundary_3d:
        pt = p if hasattr(p, 'x') else Vector3(p[0], p[1], p[2])
        u, v, _ = surface.closest_point(pt)
        result.append((u, v))
    return result


# ── Plane fitting ─────────────────────────────────────────────────────────────

def _fit_plane_to_curve(curve: Curve) -> Surface:
    """
    Fit a best-fit plane to a curve's points using PCA and return a Surface.plane
    with the curve's points set as boundary_loop.
    """
    pts = np.array([[p.x, p.y, p.z] for p in curve.points], dtype=float)
    centroid = pts.mean(axis=0)
    centred = pts - centroid
    # SVD: singular vector with smallest singular value is the plane normal
    _, _, Vt = np.linalg.svd(centred, full_matrices=False)
    normal = Vt[-1]  # last row of Vt = eigenvector for smallest variance

    # Build U/V axes (orthonormal to normal)
    n = Vector3(*normal).normalized()
    if abs(n.z) < 0.9:
        u = Vector3(0, 0, 1).cross(n).normalized()
    else:
        u = Vector3(1, 0, 0).cross(n).normalized()

    # Estimate surface extent for bounds
    origin = Vector3(*centroid)
    diffs = [Vector3(*p) - origin for p in pts]
    us = [d.dot(u) for d in diffs]
    v_dir = n.cross(u).normalized()
    vs_ = [d.dot(v_dir) for d in diffs]
    half = max(max(abs(x) for x in us), max(abs(x) for x in vs_), 1.0) * 1.1

    surface = Surface(
        name="edge_boundary",
        surface_type="plane",
        _origin=origin,
        _normal=n,
        _u_dir=u,
        _v_dir=v_dir,
        bounds=(-half, half, -half, half),
    )
    surface.boundary_loop = [(p.x, p.y, p.z) for p in curve.points]
    return surface


# ── Strategy ───────────────────────────────────────────────────────────────────

class RasterFillStrategy(ToolpathStrategy):
    """
    Generate raster (zigzag) toolpaths over a surface, clipped to the actual
    surface boundary.

    Parameters:
        surface:       Surface to fill. If omitted, a plane is fitted to ``boundary``/``curves``.
        boundary:      Closed Curve defining the fill region (used when no surface is given).
        curves:        List of Curves forming a closed loop (chained automatically).
        spacing:       Distance between raster lines (mm).
        angle:         Raster angle in degrees (0 = along U direction).
        feed_rate:     Feed rate (mm/min).
        step_size:     Point spacing along each raster pass (mm).
        overshoot:                    Extra extension past bounds when no boundary is set (mm).
        zigzag:                       Alternate pass direction on each row (default True).
        path_type:                    Toolpath type label.
        normal_offset:                Lift each point off the surface in the normal direction (mm).
        edge_inset:                   Shrink the clipping boundary inward from the surface edges (mm).
        respect_interior_boundaries:  When True, raster lines are clipped away from any
                                      interior holes (``surface.interior_loops``). Default True.
    """

    def __init__(self):
        super().__init__("raster_fill")

    def generate(
        self,
        surface: Optional[Surface] = None,
        boundary: Optional[Curve] = None,
        curves: Optional[List[Curve]] = None,
        spacing: float = 5.0,
        angle: float = 0.0,
        feed_rate: float = 1000.0,
        step_size: float = 1.0,
        overshoot: float = 0.0,
        zigzag: bool = True,
        path_type: str = "infill",
        normal_offset: float = 0.0,
        edge_inset: float = 0.0,
        respect_interior_boundaries: bool = True,
        chord_tolerance: Optional[float] = None,
        scallop_height: Optional[float] = None,
        **kwargs,
    ) -> ToolpathCollection:
        # Resolve surface from boundary curves when no surface is provided
        if surface is None:
            curve_list = curves or ([boundary] if boundary else [])
            if curve_list:
                chained = _chain_curves(curve_list) if len(curve_list) > 1 else curve_list[0]
                surface = _fit_plane_to_curve(chained)
            else:
                surface = Surface.plane()

        # ── Apply adaptive precision overrides ────────────────────────────────
        # When chord_tolerance or scallop_height are set, compute the maximum
        # step_size / spacing that keeps the geometry error within the budget.
        # Use the minimum of the computed limit and any explicit value supplied.
        if chord_tolerance is not None:
            max_step = surface.max_step_for_tolerance(chord_tolerance)
            if max_step != float("inf"):
                step_size = min(step_size, max_step)
        if scallop_height is not None:
            max_spacing = surface.max_spacing_for_scallop(scallop_height)
            if max_spacing != float("inf"):
                spacing = min(spacing, max_spacing)

        collection = ToolpathCollection(name="raster_fill")
        u_min, u_max, v_min, v_max = surface.bounds
        angle_rad = math.radians(angle)
        cos_a = math.cos(angle_rad)
        sin_a = math.sin(angle_rad)

        u_center = (u_min + u_max) / 2.0
        v_center = (v_min + v_max) / 2.0
        half_diag = math.sqrt((u_max - u_min) ** 2 + (v_max - v_min) ** 2) / 2.0

        # ── Build the 2D UV clipping polygon ──────────────────────────────────
        clip_poly: Optional[List[Tuple[float, float]]] = None

        if surface.boundary_loop:
            uv_pts = _project_boundary_to_uv(surface.boundary_loop, surface)
            if uv_pts and len(uv_pts) >= 3:
                uv_pts = _ensure_ccw(uv_pts)
                if edge_inset > 0:
                    uv_pts = _inset_polygon_2d(uv_pts, edge_inset)
                if len(uv_pts) >= 3:
                    clip_poly = uv_pts

        if clip_poly is None:
            # Fallback: rectangular surface bounds, expanded by overshoot
            o = overshoot
            clip_poly = _ensure_ccw([
                (u_min - o, v_min - o),
                (u_max + o, v_min - o),
                (u_max + o, v_max + o),
                (u_min - o, v_max + o),
            ])

        # ── Project interior holes to UV ──────────────────────────────────────
        hole_polys: List[List[Tuple[float, float]]] = []
        if respect_interior_boundaries and surface.interior_loops:
            for loop_3d in surface.interior_loops:
                uv_hole = _project_boundary_to_uv(loop_3d, surface)
                if uv_hole and len(uv_hole) >= 3:
                    hole_polys.append(uv_hole)

        # ── Convert spacing/step_size to UV units for non-plane surfaces ────────
        # For planes, 1 UV unit = 1 mm.  For curved surfaces (cylinder, sphere,
        # etc.) the UV parameterisation is angular or otherwise non-metric, so
        # measure the 3D distance per UV unit at the surface centre and scale.
        spacing_uv  = spacing
        step_size_uv = step_size          # used only as a fallback
        if surface.surface_type != "plane":
            dv = (v_max - v_min) * 0.05   # 5% of v range as probe step
            if dv > 1e-10:
                p0 = surface.evaluate(u_center, v_center - dv)
                p1 = surface.evaluate(u_center, v_center + dv)
                mm_per_uv_v = p0.distance_to(p1) / (2.0 * dv)
                if mm_per_uv_v > 1e-10:
                    spacing_uv = spacing / mm_per_uv_v

        # ── Sweep the raster lines across the full UV extent ──────────────────
        # Use the half-diagonal from the surface centre as sweep radius so that
        # rotated raster lines fully cover the surface before clipping.
        sweep = half_diag + max(overshoot, 0)
        v_sweep_min = v_center - sweep
        v_sweep_max = v_center + sweep
        u_line_min  = u_center - sweep
        u_line_max  = u_center + sweep

        num_passes = max(1, int((v_sweep_max - v_sweep_min) / spacing_uv))

        for pass_idx in range(num_passes + 1):
            v = v_sweep_min + pass_idx * spacing_uv

            # Endpoints of this raster line in UV space (rotated by angle)
            uv_start = (u_line_min * cos_a - v * sin_a,
                        u_line_min * sin_a + v * cos_a)
            uv_end   = (u_line_max * cos_a - v * sin_a,
                        u_line_max * sin_a + v * cos_a)

            if _PYCLIPPER:
                segments = _clip_segment_pyclipper(uv_start, uv_end, clip_poly)
                for hole in hole_polys:
                    segments = _subtract_hole_pyclipper(segments, hole)
            else:
                segments = _clip_segment_to_polygon(uv_start, uv_end, clip_poly)
                for hole in hole_polys:
                    segments = _subtract_polygon_from_segments(segments, hole)

            # Zigzag: reverse segment order and direction on odd passes
            if zigzag and pass_idx % 2 == 1:
                segments = [(e, s) for s, e in reversed(segments)]

            for seg_s, seg_e in segments:
                # Estimate physical 3D arc length using 5 probe points so that
                # step_size is in mm regardless of the surface parameterisation.
                seg_du = seg_e[0] - seg_s[0]
                seg_dv = seg_e[1] - seg_s[1]
                _n_probe = 5
                arc_len_3d = 0.0
                _prev = surface.evaluate(seg_s[0], seg_s[1])
                for _k in range(1, _n_probe + 1):
                    _t = _k / _n_probe
                    _p = surface.evaluate(seg_s[0] + _t * seg_du,
                                          seg_s[1] + _t * seg_dv)
                    arc_len_3d += _prev.distance_to(_p)
                    _prev = _p
                num_steps = max(2, int(arc_len_3d / step_size))

                points = []
                for step in range(num_steps + 1):
                    t  = step / num_steps
                    ru = seg_s[0] + t * (seg_e[0] - seg_s[0])
                    rv = seg_s[1] + t * (seg_e[1] - seg_s[1])

                    pos    = surface.evaluate(ru, rv)
                    normal = surface.normal_at(ru, rv)

                    if normal_offset != 0.0:
                        pos = pos + normal * normal_offset

                    points.append(ToolpathPoint(
                        position=pos,
                        orientation=Orientation.from_vector(normal),
                        feed_rate=feed_rate,
                        path_type=path_type,
                        source="raster_fill",
                        surface_ref=surface.name,
                    ))

                if points:
                    collection.add(
                        Toolpath(points, name=f"raster_pass_{pass_idx}"),
                        layer=0,
                    )

        return collection
