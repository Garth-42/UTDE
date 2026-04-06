"""
Debug post-processor: produces human-readable, annotated output for development.

Instead of machine G-code, outputs world-space positions, orientations, process
parameters, and warnings — making it easy to verify toolpath generation without
a real machine configuration.
"""

from __future__ import annotations

import json
import math
from io import StringIO
from typing import Optional

from ..core.toolpath import ToolpathCollection


# Distance threshold (mm) above which a move is flagged as unusually large.
_LARGE_MOVE_THRESHOLD_MM = 100.0


class DebugPostProcessor:
    """
    Generates annotated debug output from a ToolpathCollection.

    No machine or IK is involved — all values are world-space, pre-IK.

    Usage:
        post = DebugPostProcessor(format="text")
        output = post.process(toolpath_collection)

        post_json = DebugPostProcessor(format="json")
        output_json = post_json.process(toolpath_collection)
    """

    def __init__(self, format: str = "text", large_move_threshold: float = _LARGE_MOVE_THRESHOLD_MM):
        if format not in ("text", "json"):
            raise ValueError(f"format must be 'text' or 'json', got {format!r}")
        self.format = format
        self.large_move_threshold = large_move_threshold

    def process(self, collection: ToolpathCollection) -> str:
        if self.format == "json":
            return self._process_json(collection)
        return self._process_text(collection)

    # ── Text output ──────────────────────────────────────────────────────────

    def _process_text(self, collection: ToolpathCollection) -> str:
        out = StringIO()
        total_points = sum(len(tp.points) for tp in collection.toolpaths)

        out.write("=" * 60 + "\n")
        out.write("  UTDE Debug Output\n")
        out.write("=" * 60 + "\n")
        out.write(f"  Collection : {collection.name}\n")
        out.write(f"  Toolpaths  : {len(collection.toolpaths)}\n")
        out.write(f"  Points     : {total_points}\n")
        out.write("=" * 60 + "\n")

        for tp in collection.toolpaths:
            out.write(f"\n--- Toolpath: {tp.name} ({len(tp.points)} points) ---\n\n")
            prev_pos = None

            for idx, pt in enumerate(tp.points):
                warnings = []

                # Orientation magnitude check
                o = pt.orientation
                if o is not None:
                    mag = math.sqrt(o.i ** 2 + o.j ** 2 + o.k ** 2)
                    if mag < 0.001:
                        warnings.append("WARN: zero-length orientation vector")

                # Large move check
                x, y, z = pt.position.x, pt.position.y, pt.position.z
                if prev_pos is not None:
                    dx = x - prev_pos[0]
                    dy = y - prev_pos[1]
                    dz = z - prev_pos[2]
                    dist = math.sqrt(dx * dx + dy * dy + dz * dz)
                    if dist > self.large_move_threshold:
                        warnings.append(f"WARN: large move {dist:.1f} mm")
                prev_pos = (x, y, z)

                rapid_flag = "Y" if pt.rapid else "N"
                source = pt.source or "unknown"
                path_type = pt.path_type or "cut"
                feed = pt.feed_rate

                out.write(
                    f"  #{idx:04d}  source={source:<16s}  type={path_type:<12s}"
                    f"  rapid={rapid_flag}  feed={feed:.1f}\n"
                )

                if o is not None:
                    out.write(
                        f"         XYZ:  X={x:>10.4f}  Y={y:>10.4f}  Z={z:>10.4f}\n"
                        f"         IJK:  I={o.i:>10.4f}  J={o.j:>10.4f}  K={o.k:>10.4f}\n"
                    )
                else:
                    out.write(
                        f"         XYZ:  X={x:>10.4f}  Y={y:>10.4f}  Z={z:>10.4f}\n"
                        f"         IJK:  (no orientation)\n"
                    )

                if pt.process_params:
                    params_str = "  ".join(f"{k}={v}" for k, v in pt.process_params.items())
                    out.write(f"         params: {params_str}\n")

                if pt.layer_index:
                    out.write(f"         layer: {pt.layer_index}\n")

                for w in warnings:
                    out.write(f"         *** {w} ***\n")

                out.write("\n")

        out.write("=" * 60 + "\n")
        out.write("  End of debug output\n")
        out.write("=" * 60 + "\n")

        return out.getvalue()

    # ── JSON output ───────────────────────────────────────────────────────────

    def _process_json(self, collection: ToolpathCollection) -> str:
        toolpaths = []

        for tp in collection.toolpaths:
            points = []
            prev_pos = None

            for idx, pt in enumerate(tp.points):
                warnings = []

                o = pt.orientation
                if o is not None:
                    mag = math.sqrt(o.i ** 2 + o.j ** 2 + o.k ** 2)
                    if mag < 0.001:
                        warnings.append("zero-length orientation vector")

                x, y, z = pt.position.x, pt.position.y, pt.position.z
                if prev_pos is not None:
                    dx = x - prev_pos[0]
                    dy = y - prev_pos[1]
                    dz = z - prev_pos[2]
                    dist = math.sqrt(dx * dx + dy * dy + dz * dz)
                    if dist > self.large_move_threshold:
                        warnings.append(f"large move {dist:.1f} mm")
                prev_pos = (x, y, z)

                point_data: dict = {
                    "index": idx,
                    "source": pt.source,
                    "path_type": pt.path_type,
                    "layer_index": pt.layer_index,
                    "rapid": pt.rapid,
                    "feed_rate": pt.feed_rate,
                    "position": {"x": x, "y": y, "z": z},
                    "orientation": (
                        {"i": o.i, "j": o.j, "k": o.k} if o is not None else None
                    ),
                    "process_params": pt.process_params,
                }
                if warnings:
                    point_data["warnings"] = warnings

                points.append(point_data)

            toolpaths.append({"name": tp.name, "points": points})

        payload = {
            "collection": collection.name,
            "toolpath_count": len(collection.toolpaths),
            "total_points": sum(len(t["points"]) for t in toolpaths),
            "toolpaths": toolpaths,
        }

        return json.dumps(payload, indent=2)
