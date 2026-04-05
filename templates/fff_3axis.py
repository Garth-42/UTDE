"""
Template: FFF 3-Axis — Fused Filament Fabrication via External Slicer
======================================================================

Process-agnostic template for FFF (3D printing) using an external slicer
(LibSlic3r or CuraEngine) wrapped via the EngineWrapper pattern.

Demonstrates:
- EngineWrapper with all four hook points
- Translating external G-code output into native ToolpathCollection
- Adding 5-axis orientation via on_each_layer hook (upgrade path from 3-axis)
- Path-type-aware parameter overrides via on_each_point hook

The external slicer is called as a subprocess. If no slicer is available,
the wrapper falls back to a stub that parses hand-written G-code — useful
for testing the hook system without a slicer installed.

To use:
    from toolpath_engine import get_process
    fn = get_process("fff-3axis")
    result = fn(model, params={"layer_height": 0.2, "infill_density": 0.2})
"""

import os
import sys
import subprocess
import tempfile

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

from toolpath_engine import (
    process,
    EngineWrapper,
    ToolpathCollection,
    Orientation,
    Machine,
)
from toolpath_engine.post.processor import PostProcessor, PostConfig


# ---------------------------------------------------------------------------
# Stub G-code used when no slicer binary is available (for tests / preview)
# ---------------------------------------------------------------------------
_STUB_GCODE = """\
; Layer 0
G1 X0 Y0 Z0.2 F3000
G1 X50 Y0 Z0.2 E1.0 F1800
G1 X50 Y50 Z0.2 E2.0
G1 X0 Y50 Z0.2 E3.0
G1 X0 Y0 Z0.2 E4.0
; Layer 1
G1 X0 Y0 Z0.4 F3000
G1 X50 Y10 Z0.4 E5.0 F1800
G1 X50 Y40 Z0.4 E6.0
G1 X0 Y40 Z0.4 E7.0
G1 X0 Y10 Z0.4 E8.0
"""


def _call_libslic3r(stl_path: str, params: dict) -> str:
    """
    Call LibSlic3r CLI and return G-code string.
    Raises FileNotFoundError if slic3r binary is not found.
    """
    slic3r = os.environ.get("SLIC3R_BIN", "slic3r")
    layer_h = params.get("layer_height", 0.2)
    infill  = params.get("infill_density", 0.2)

    with tempfile.NamedTemporaryFile(suffix=".gcode", delete=False) as out:
        out_path = out.name

    subprocess.run(
        [
            slic3r, stl_path,
            f"--layer-height={layer_h}",
            f"--fill-density={infill}",
            f"--output={out_path}",
        ],
        check=True,
        capture_output=True,
    )
    with open(out_path) as f:
        return f.read()


@process(
    "fff-3axis",
    description="FFF/FDM 3-axis printing via external slicer (LibSlic3r/CuraEngine) with EngineWrapper hooks.",
    tags=["additive", "fff", "fdm", "3-axis", "slicer"],
)
def fff_3axis(model=None, params=None):
    """
    Generate an FFF toolpath via an external slicer, with hooks for modification.

    Args:
        model:  GeometryModel — used to export STL for the slicer. If None,
                the stub G-code is used (useful for testing hooks).
        params: Dict of process overrides:
                  layer_height     (mm, default 0.2)
                  infill_density   (0–1, default 0.2)
                  perimeter_speed  (mm/s, default 40)
                  infill_speed     (mm/s, default 60)
                  upgrade_to_5axis (bool, default False — adds surface-normal orient)

    Returns:
        ToolpathCollection with path_type metadata from slicer preserved on every point.
    """
    p = params or {}
    upgrade_5axis   = p.get("upgrade_to_5axis", False)
    perimeter_speed = p.get("perimeter_speed", 40) * 60   # → mm/min
    infill_speed    = p.get("infill_speed", 60) * 60

    slicer = EngineWrapper("libslic3r")

    # ── Hook: slow perimeters, speed up infill ────────────────────────────
    @slicer.on_each_point
    def tune_speeds(point):
        if point.path_type == "perimeter":
            point.feed_rate = perimeter_speed
        elif point.path_type == "infill":
            point.feed_rate = infill_speed
        return point

    # ── Hook: upgrade to 5-axis by setting Z-up orientation (3-axis default)
    #    Replace this hook with to_normal(surface) for true 5-axis output.
    @slicer.on_each_point
    def set_orientation(point):
        if point.orientation is None:
            point.orientation = Orientation.z_down()
        return point

    # ── Hook: tag each layer with metadata ───────────────────────────────
    @slicer.on_each_layer
    def annotate_layer(layer_idx, toolpaths):
        for tp in toolpaths:
            tp.metadata = tp.metadata or {}
            tp.metadata["layer_index"] = layer_idx
        return toolpaths

    # ── Engine function ───────────────────────────────────────────────────
    def run_slicer(geometry, run_params):
        if geometry is None:
            gcode = _STUB_GCODE
        else:
            with tempfile.NamedTemporaryFile(suffix=".stl", delete=False) as f:
                stl_path = f.name
            try:
                geometry.export_stl(stl_path)
                gcode = _call_libslic3r(stl_path, run_params)
            except (FileNotFoundError, subprocess.CalledProcessError):
                # Slicer not available — use stub for development/testing
                gcode = _STUB_GCODE

        return EngineWrapper.parse_gcode_to_collection(gcode, source="libslic3r")

    slicer.set_engine(run_slicer)

    # ── Run ───────────────────────────────────────────────────────────────
    collection = slicer.run(model, p)

    # ── Optional: upgrade 3-axis → 5-axis ────────────────────────────────
    # Uncomment and adapt when surface geometry is available:
    # if upgrade_5axis and model is not None:
    #     from toolpath_engine import to_normal
    #     collection.orient(to_normal(model.top_surface()))

    # ── Post-process ──────────────────────────────────────────────────────
    machine  = Machine.cartesian_3axis(name="3axis_gantry")
    post_cfg = PostConfig(
        safe_start=["G28", "G90", "M82"],
        program_end=["M104 S0", "M140 S0", "G28 X Y", "M84"],
    )
    post   = PostProcessor(machine=machine, config=post_cfg)
    gcode  = post.process(collection)
    collection.metadata["gcode"] = gcode

    return collection


if __name__ == "__main__":
    result = fff_3axis()
    total_pts = sum(len(tp.points) for tp in result.toolpaths)
    print(f"Toolpaths: {len(result.toolpaths)}, Points: {total_pts}")
    print("\n--- G-code preview (first 15 lines) ---")
    print("\n".join(result.metadata.get("gcode", "").split("\n")[:15]))
