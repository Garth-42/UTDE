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

_Z_UP = Vector3(0.0, 0.0, 1.0)
_CHAIN_EPSILON = 0.01  # mm — endpoints closer than this are considered connected


def _chain_curves(curve_list: list) -> Curve:
    """
    Order and orient a list of curves into one continuous, non-backtracking chain.

    Algorithm:

    1. **Topology pass** — build an adjacency graph by matching curve endpoints
       within ``_CHAIN_EPSILON`` mm.  If the curves form a connected path (every
       curve shares at least one endpoint with a neighbour), use a depth-first
       traversal to produce the correct order and per-curve orientation.  This
       handles U-shapes, L-turns, and any other non-monotone arrangement that
       a global direction vector cannot represent.

    2. **Direction fallback** — when curves are genuinely disconnected (no shared
       endpoints), fall back to the three-pass direction-based sort: find the
       global travel axis, orient all curves along it, and sort by projection.
       This is the right behaviour for parallel raster lines that happen to be
       supplied in scrambled order.

    Returns a single Curve whose points are the concatenated result.
    """
    non_empty = [c for c in curve_list if c.points]
    if not non_empty:
        return Curve([], name="chained")
    if len(non_empty) == 1:
        return Curve(list(non_empty[0].points), name=f"chained_{non_empty[0].name}")

    # ── Topology pass ────────────────────────────────────────────────────────
    # For each curve store (start_point, end_point) so we can match endpoints.
    n = len(non_empty)

    def _near(a, b):
        return a.distance_to(b) < _CHAIN_EPSILON

    # adjacency[i] = list of (j, flip_i, flip_j) meaning:
    #   curve i (possibly flipped) connects to curve j (possibly flipped)
    # We represent connections as (neighbour_index, this_end, neighbour_end)
    # where end ∈ {0, 1} — 0 = start point, 1 = end point.
    adj = [[] for _ in range(n)]
    for i in range(n):
        for j in range(i + 1, n):
            si, ei = non_empty[i].points[0], non_empty[i].points[-1]
            sj, ej = non_empty[j].points[0], non_empty[j].points[-1]
            # Check all four endpoint pairs
            if _near(ei, sj):
                adj[i].append((j, 1, 0))   # i-end → j-start  (both forward)
                adj[j].append((i, 0, 1))
            elif _near(ei, ej):
                adj[i].append((j, 1, 1))   # i-end → j-end  (j reversed)
                adj[j].append((i, 1, 1))
            elif _near(si, sj):
                adj[i].append((j, 0, 0))   # i-start → j-start  (i reversed)
                adj[j].append((i, 0, 0))
            elif _near(si, ej):
                adj[i].append((j, 0, 1))   # i-start → j-end  (both reversed)
                adj[j].append((i, 1, 0))

    connected = any(adj[i] for i in range(n))

    if connected:
        # DFS from a degree-1 or degree-0 node (a chain end), or any node.
        # Pick the node with fewest connections as the start.
        start = min(range(n), key=lambda i: len(adj[i]))

        visited = [False] * n
        order = []      # list of (curve_index, reversed: bool)

        def _dfs(idx, came_from_end):
            """
            came_from_end: which end of curves[idx] we arrived at.
              0 = we arrived at the start → travel through it forward
              1 = we arrived at the end   → travel through it reversed
            """
            visited[idx] = True
            forward = (came_from_end == 0)
            order.append((idx, not forward))
            departure_end = 1 if forward else 0   # end we leave from

            for (nb, this_end, nb_end) in adj[idx]:
                if not visited[nb] and this_end == departure_end:
                    _dfs(nb, nb_end)

        # Determine which end of the start node is FREE (not connected to any
        # neighbour).  We "arrive" at that free end so the DFS departs toward
        # the connected side — if we always start with came_from_end=0 and the
        # only connection is at end 0, the DFS finds no neighbours and stops.
        if adj[start]:
            start_came_from = 1 - adj[start][0][1]  # free end = opposite of connected end
        else:
            start_came_from = 0

        _dfs(start, start_came_from)

        # If DFS didn't visit all curves (disconnected sub-groups), append
        # remaining in arbitrary order.
        for i in range(n):
            if not visited[i]:
                order.append((i, False))

        chain_pts: list = []
        name_parts: list = []
        for idx, do_reverse in order:
            crv = non_empty[idx]
            pts = list(reversed(crv.points)) if do_reverse else list(crv.points)
            chain_pts.extend(pts)
            name_parts.append(crv.name)

        return Curve(chain_pts, name="chained_" + "_".join(name_parts))

    # ── Direction fallback (disconnected curves) ─────────────────────────────
    endpoints = [pt for c in non_empty for pt in (c.points[0], c.points[-1])]
    p_a, p_b = endpoints[0], endpoints[1]
    best_dist = -1.0
    for i in range(len(endpoints)):
        for j in range(i + 1, len(endpoints)):
            d = endpoints[i].distance_to(endpoints[j])
            if d > best_dist:
                best_dist, p_a, p_b = d, endpoints[i], endpoints[j]

    travel_dir = (p_b - p_a).normalized()
    if travel_dir.length() < 1e-9:
        travel_dir = Vector3(1.0, 0.0, 0.0)

    oriented = []
    for crv in non_empty:
        net = crv.points[-1] - crv.points[0]
        pts = list(crv.points) if net.dot(travel_dir) >= 0 else list(reversed(crv.points))
        oriented.append(Curve(pts, name=crv.name))

    oriented.sort(key=lambda c: c.points[0].dot(travel_dir))

    chain_pts = []
    name_parts = []
    for crv in oriented:
        chain_pts.extend(crv.points)
        name_parts.append(crv.name)

    return Curve(chain_pts, name="chained_" + "_".join(name_parts))


class FollowCurveStrategy(ToolpathStrategy):
    """
    Generate a toolpath by following one or more curves.

    Parameters:
        feed_rate:     Feed rate in mm/min (default 1000)
        spacing:       Resample spacing in mm (default None = use original points)
        path_type:     Classification string (default "cut")
        chain:         When True and multiple curves are supplied, sort them by
                       nearest endpoint and concatenate into a single continuous
                       toolpath.  Individual curves that need to be reversed to
                       maintain continuity are flipped automatically.
                       When False (default), each curve produces its own Toolpath.
        normal_offset: Offset each point along the surface normal (or +Z when no
                       surface is supplied).  Positive lifts the tool away from
                       the surface (mm, default 0).
        inset:         Lateral offset perpendicular to the travel direction, in
                       the surface plane.  Computed as (tangent × normal).
                       Positive shifts left-of-travel for a right-hand normal
                       (mm, default 0).
        surface:       Optional Surface used to look up per-point normals for
                       normal_offset and inset.  When omitted, +Z is used.
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
        chain: bool = True,
        normal_offset: float = 0.0,
        inset: float = 0.0,
        surface: Optional[Surface] = None,
        **kwargs,
    ) -> ToolpathCollection:
        collection = ToolpathCollection(name="follow_curve")

        apply_offset = normal_offset != 0.0 or inset != 0.0

        curve_list = curves or ([curve] if curve else [])

        if chain and len(curve_list) > 1:
            curve_list = [_chain_curves(curve_list)]

        for crv in curve_list:
            if spacing:
                crv = crv.resample(spacing)

            points = []
            for i, pt in enumerate(crv.points):
                pos = pt

                if apply_offset:
                    if surface is not None:
                        normal = surface.normal_at_closest(pt)
                    else:
                        normal = _Z_UP

                    offset = normal * normal_offset

                    if inset != 0.0:
                        tangent = crv.tangent_at(i)
                        lateral = tangent.cross(normal).normalized()
                        offset = offset + lateral * inset

                    pos = Vector3(
                        x=pt.x + offset.x,
                        y=pt.y + offset.y,
                        z=pt.z + offset.z,
                    )

                tp = ToolpathPoint(
                    position=pos,
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
