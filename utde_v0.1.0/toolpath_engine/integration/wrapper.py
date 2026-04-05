"""
External engine integration wrapper.

Wraps any external toolpath engine (slicer, CAM kernel, robot planner)
with a hook system that gives users full control over input and output
while preserving native primitive types.
"""

from __future__ import annotations

from typing import Optional, List, Dict, Callable, Any
from ..core.primitives import Vector3, Orientation
from ..core.toolpath import ToolpathPoint, Toolpath, ToolpathCollection
from ..core.geometry import GeometryModel


class EngineWrapper:
    """
    Wraps an external engine with before/after hooks.
    
    Usage:
        slicer = EngineWrapper("libslic3r")
        
        @slicer.before_slice
        def scale_geometry(geometry, params):
            geometry = geometry.scale(1.02)
            return geometry, params
        
        @slicer.on_each_point
        def add_orientation(point):
            point.orientation = surface.normal_at_closest(point.position)
            return point
        
        result = slicer.run(my_model, {"layer_height": 0.2})
    """

    def __init__(self, engine_name: str = "generic"):
        self.engine_name = engine_name
        self._pre_hooks: List[Callable] = []
        self._post_hooks: List[Callable] = []
        self._layer_hooks: List[Callable] = []
        self._point_hooks: List[Callable] = []
        self._engine_fn: Optional[Callable] = None

    # --- hook decorators -----------------------------------------------------
    def before_slice(self, fn: Callable) -> Callable:
        """Hook: modify geometry/params before engine runs."""
        self._pre_hooks.append(fn)
        return fn

    def after_slice(self, fn: Callable) -> Callable:
        """Hook: modify complete ToolpathCollection after engine runs."""
        self._post_hooks.append(fn)
        return fn

    def on_each_layer(self, fn: Callable) -> Callable:
        """Hook: modify/inspect each layer as it's produced."""
        self._layer_hooks.append(fn)
        return fn

    def on_each_point(self, fn: Callable) -> Callable:
        """Hook: modify/inspect each toolpath point."""
        self._point_hooks.append(fn)
        return fn

    def set_engine(self, fn: Callable):
        """Set the actual engine function that generates toolpaths."""
        self._engine_fn = fn

    # --- execution -----------------------------------------------------------
    def run(
        self,
        geometry: Any = None,
        params: Optional[Dict[str, Any]] = None,
    ) -> ToolpathCollection:
        """
        Execute the wrapped engine with all hooks applied.
        
        1. Run pre-hooks on input
        2. Call engine
        3. Parse output to native types
        4. Run layer hooks
        5. Run point hooks
        6. Run post-hooks on output
        """
        if params is None:
            params = {}

        # --- Pre-hooks -------------------------------------------------------
        for hook in self._pre_hooks:
            result = hook(geometry, params)
            if result is not None:
                geometry, params = result

        # --- Call engine -----------------------------------------------------
        if self._engine_fn:
            collection = self._engine_fn(geometry, params)
        else:
            collection = self._default_engine(geometry, params)

        # Ensure we have a ToolpathCollection
        if not isinstance(collection, ToolpathCollection):
            raise TypeError(
                f"Engine must return ToolpathCollection, got {type(collection)}"
            )

        # --- Layer hooks -----------------------------------------------------
        if self._layer_hooks and collection.layers:
            for layer_idx in list(collection.layers.keys()):
                for hook in self._layer_hooks:
                    toolpaths = collection.layers[layer_idx]
                    result = hook(layer_idx, toolpaths)
                    if result is not None:
                        collection.layers[layer_idx] = result

        # --- Point hooks -----------------------------------------------------
        if self._point_hooks:
            for tp in collection.toolpaths:
                for i, point in enumerate(tp.points):
                    for hook in self._point_hooks:
                        result = hook(point)
                        if result is not None:
                            tp.points[i] = result

        # --- Post-hooks ------------------------------------------------------
        for hook in self._post_hooks:
            result = hook(collection)
            if result is not None:
                collection = result

        return collection

    def _default_engine(self, geometry: Any, params: Dict) -> ToolpathCollection:
        """Default: return empty collection. Override or use set_engine()."""
        return ToolpathCollection(name=f"{self.engine_name}_output")

    # --- convenience: parse G-code to native types ---------------------------
    @staticmethod
    def parse_gcode_to_collection(
        gcode: str,
        source: str = "external",
    ) -> ToolpathCollection:
        """
        Parse simple G-code into a ToolpathCollection.
        
        Handles G0 (rapid), G1 (linear) with X Y Z E F parameters.
        Useful for wrapping FFF slicers that output G-code.
        """
        collection = ToolpathCollection(name=f"{source}_parsed")
        current_layer = 0
        current_path = Toolpath(name=f"layer_{current_layer}")
        x, y, z, e, f = 0.0, 0.0, 0.0, 0.0, 1000.0
        last_z = 0.0

        for line in gcode.strip().split("\n"):
            line = line.strip()
            if not line or line.startswith(";") or line.startswith("("):
                # Check for layer comments
                if ";LAYER:" in line.upper() or "; LAYER " in line.upper():
                    if current_path.points:
                        collection.add(current_path, layer=current_layer)
                    current_layer += 1
                    current_path = Toolpath(name=f"layer_{current_layer}")
                continue

            parts = line.split()
            if not parts:
                continue

            cmd = parts[0].upper()
            if cmd not in ("G0", "G1", "G00", "G01"):
                continue

            rapid = cmd in ("G0", "G00")
            params = {}
            for part in parts[1:]:
                if part[0].upper() in "XYZEF" and len(part) > 1:
                    try:
                        params[part[0].upper()] = float(part[1:])
                    except ValueError:
                        pass

            x = params.get("X", x)
            y = params.get("Y", y)
            z = params.get("Z", z)
            e = params.get("E", e)
            f = params.get("F", f)

            # Detect layer change by Z increase
            if z > last_z + 0.01:
                if current_path.points:
                    collection.add(current_path, layer=current_layer)
                current_layer += 1
                current_path = Toolpath(name=f"layer_{current_layer}")
                last_z = z

            path_type = "rapid" if rapid else ("travel" if "E" not in params else "extrude")
            pt = ToolpathPoint(
                position=Vector3(x, y, z),
                orientation=Orientation.z_down(),
                feed_rate=f,
                rapid=rapid,
                path_type=path_type,
                source=source,
                layer_index=current_layer,
                process_params={"extrusion": e} if "E" in params else {},
            )
            current_path.append(pt)

        # Add final path
        if current_path.points:
            collection.add(current_path, layer=current_layer)

        return collection

    def __repr__(self):
        return (
            f"EngineWrapper('{self.engine_name}', "
            f"pre={len(self._pre_hooks)}, post={len(self._post_hooks)}, "
            f"layer={len(self._layer_hooks)}, point={len(self._point_hooks)})"
        )
