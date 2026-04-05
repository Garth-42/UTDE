"""
Raster-Fill strategy: generate parallel passes over a surface region,
clipped to the actual surface boundary.
"""

from __future__ import annotations

import math
from typing import Optional, List, Tuple

from ..core.primitives import Vector3, Orientation
from ..core.toolpath import ToolpathPoint, Toolpath, ToolpathCollection
from ..core.geometry import Surface
from .base import ToolpathStrategy


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
    """Project a 3D boundary loop into UV space for a planar surface."""
    if surface.surface_type != "plane":
        return None
    O = surface._origin
    U = surface._u_dir
    V = surface._v_dir
    result = []
    for p in boundary_3d:
        dx, dy, dz = p[0] - O.x, p[1] - O.y, p[2] - O.z
        result.append((
            dx * U.x + dy * U.y + dz * U.z,
            dx * V.x + dy * V.y + dz * V.z,
        ))
    return result


# ── Strategy ───────────────────────────────────────────────────────────────────

class RasterFillStrategy(ToolpathStrategy):
    """
    Generate raster (zigzag) toolpaths over a surface, clipped to the actual
    surface boundary.

    Parameters:
        spacing:       Distance between raster lines (mm).
        angle:         Raster angle in degrees (0 = along U direction).
        feed_rate:     Feed rate (mm/min).
        step_size:     Point spacing along each raster pass (mm).
        overshoot:     Extra extension past bounds when no boundary is set (mm).
        zigzag:        Alternate pass direction on each row (default True).
        path_type:     Toolpath type label.
        normal_offset: Lift each point off the surface in the normal direction (mm).
        edge_inset:    Shrink the clipping boundary inward from the surface edges (mm).
    """

    def __init__(self):
        super().__init__("raster_fill")

    def generate(
        self,
        surface: Optional[Surface] = None,
        spacing: float = 5.0,
        angle: float = 0.0,
        feed_rate: float = 1000.0,
        step_size: float = 1.0,
        overshoot: float = 0.0,
        zigzag: bool = True,
        path_type: str = "infill",
        normal_offset: float = 0.0,
        edge_inset: float = 0.0,
        **kwargs,
    ) -> ToolpathCollection:
        if surface is None:
            surface = Surface.plane()

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

        if surface.boundary_loop and surface.surface_type == "plane":
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

        # ── Sweep the raster lines across the full UV extent ──────────────────
        # Use the half-diagonal from the surface centre as sweep radius so that
        # rotated raster lines fully cover the surface before clipping.
        sweep = half_diag + max(overshoot, 0)
        v_sweep_min = v_center - sweep
        v_sweep_max = v_center + sweep
        u_line_min  = u_center - sweep
        u_line_max  = u_center + sweep

        num_passes = max(1, int((v_sweep_max - v_sweep_min) / spacing))

        for pass_idx in range(num_passes + 1):
            v = v_sweep_min + pass_idx * spacing

            # Endpoints of this raster line in UV space (rotated by angle)
            uv_start = (u_line_min * cos_a - v * sin_a,
                        u_line_min * sin_a + v * cos_a)
            uv_end   = (u_line_max * cos_a - v * sin_a,
                        u_line_max * sin_a + v * cos_a)

            segments = _clip_segment_to_polygon(uv_start, uv_end, clip_poly)

            # Zigzag: reverse segment order and direction on odd passes
            if zigzag and pass_idx % 2 == 1:
                segments = [(e, s) for s, e in reversed(segments)]

            for seg_s, seg_e in segments:
                seg_len = math.sqrt(
                    (seg_e[0] - seg_s[0]) ** 2 + (seg_e[1] - seg_s[1]) ** 2
                )
                num_steps = max(2, int(seg_len / step_size))

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
