"""
Template: FFF 3-Axis — Fused Filament Fabrication via External Slicer
======================================================================

Process-agnostic template for FFF (3D printing) using an external slicer
(LibSlic3r or CuraEngine) wrapped via the EngineWrapper pattern.

The user explicitly selects the model to slice via the "model" geometry slot.
The server injects the file path as params["_model_path"] before calling this
template. Falls back to stub G-code when no binary or model path is available.

Binary is resolved from the SLIC3R_BIN environment variable (default: "slic3r").

Demonstrates:
- EngineWrapper with all four hook points
- Translating external G-code output into native ToolpathCollection
- Path-type-aware parameter overrides via on_each_point hook
"""

import os
import subprocess
import tempfile

from toolpath_engine import (
    process,
    EngineWrapper,
    Orientation,
    Machine,
)
from toolpath_engine.post.processor import PostProcessor, PostConfig


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


def _call_libslic3r(model_path: str, params: dict) -> str:
    """
    Call LibSlic3r CLI and return G-code string.
    Raises FileNotFoundError if the binary is not found,
    or subprocess.CalledProcessError if slicing fails.
    """
    slic3r      = os.environ.get("SLIC3R_BIN", "slic3r")
    layer_h     = params.get("layer_height", 0.2)
    infill      = params.get("infill_density", 0.2)
    perimeters  = int(params.get("perimeters", 2))
    nozzle_dia  = params.get("nozzle_diameter", 0.4)
    filament_dia = params.get("filament_diameter", 1.75)
    extruder_temp = int(params.get("extruder_temperature", 200))
    bed_temp    = int(params.get("bed_temperature", 60))
    brim_width  = params.get("brim_width", 0)
    support     = params.get("support_material", "off")
    support_angle = params.get("support_material_threshold", 45)
    config_file = params.get("config_file", "").strip()

    with tempfile.NamedTemporaryFile(suffix=".gcode", delete=False) as out:
        out_path = out.name

    cmd = [slic3r, model_path, f"--output={out_path}"]
    if config_file:
        cmd += ["--load", config_file]
    cmd += [
        f"--layer-height={layer_h}",
        f"--fill-density={infill}",
        f"--perimeters={perimeters}",
        f"--nozzle-diameter={nozzle_dia}",
        f"--filament-diameter={filament_dia}",
        f"--temperature={extruder_temp}",
        f"--bed-temperature={bed_temp}",
        f"--brim-width={brim_width}",
    ]
    if support == "on":
        cmd += [
            "--support-material",
            f"--support-material-threshold={int(support_angle)}",
        ]

    subprocess.run(cmd, check=True, capture_output=True)
    with open(out_path) as f:
        return f.read()


@process(
    "libslic3r",
    description="Slice the selected model via LibSlic3r CLI. Exposes common slicing parameters and supports loading a full .ini config.",
    tags=["additive", "fff", "fdm", "3-axis", "slicer", "libslic3r"],
    kind="add",
    label="LibSlic3r",
    icon="add-layer",
    requires_local=True,  # shells out to the LibSlic3r CLI — server/desktop only
    requires=[{"type": "model", "label": "Model to slice", "count": 1}],
    params=[
        {"id": "layer_height",              "type": "number",  "default": 0.2,
         "unit": "mm",   "label": "Layer height"},
        {"id": "infill_density",            "type": "number",  "default": 0.2,
         "unit": "0–1",  "label": "Infill density", "hint": "0.0 – 1.0"},
        {"id": "perimeters",                "type": "number",  "default": 2,
         "label": "Perimeter walls"},
        {"id": "support_material",          "type": "segment", "default": "off",
         "options": ["off", "on"],          "label": "Supports"},
        {"id": "support_material_threshold","type": "number",  "default": 45,
         "unit": "°",    "label": "Support angle"},
        {"id": "brim_width",                "type": "number",  "default": 0,
         "unit": "mm",   "label": "Brim width"},
        {"id": "nozzle_diameter",           "type": "number",  "default": 0.4,
         "unit": "mm",   "label": "Nozzle Ø"},
        {"id": "filament_diameter",         "type": "number",  "default": 1.75,
         "unit": "mm",   "label": "Filament Ø"},
        {"id": "extruder_temperature",      "type": "number",  "default": 200,
         "unit": "°C",   "label": "Nozzle temp"},
        {"id": "bed_temperature",           "type": "number",  "default": 60,
         "unit": "°C",   "label": "Bed temp"},
        {"id": "perimeter_speed",           "type": "number",  "default": 40,
         "unit": "mm/s", "label": "Perimeter speed"},
        {"id": "infill_speed",              "type": "number",  "default": 60,
         "unit": "mm/s", "label": "Infill speed"},
        {"id": "config_file",               "type": "text",    "default": "",
         "label": "Config path (.ini)",
         "hint": "Optional — load a LibSlic3r .ini config before applying params above"},
    ],
    est_time=30.0,
    est_volume=12.0,
)
def fff_3axis(model=None, geometry=None, params=None):
    """
    Generate an FFF toolpath via LibSlic3r, with hooks for modification.

    Args:
        model:    Not used directly; model path comes from params["_model_path"]
                  (injected by the server when the user selects the model in the UI).
        geometry: List-of-lists matching `requires` — geometry[0] will be
                  ["__model__"] when wired up; resolved by the server.
        params:   Dict of param values. The server injects "_model_path" for the
                  selected model. All other keys match the @process params schema.

    Returns:
        ToolpathCollection with path_type metadata from slicer preserved on every point.
    """
    p = params or {}
    model_path      = p.get("_model_path")
    perimeter_speed = p.get("perimeter_speed", 40) * 60   # mm/s → mm/min
    infill_speed    = p.get("infill_speed", 60) * 60

    slicer = EngineWrapper("libslic3r")

    @slicer.on_each_point
    def tune_speeds(point):
        if point.path_type == "perimeter":
            point.feed_rate = perimeter_speed
        elif point.path_type == "infill":
            point.feed_rate = infill_speed
        return point

    @slicer.on_each_point
    def set_orientation(point):
        if point.orientation is None:
            point.orientation = Orientation.z_down()
        return point

    @slicer.on_each_layer
    def annotate_layer(layer_idx, toolpaths):
        for tp in toolpaths:
            tp.metadata = tp.metadata or {}
            tp.metadata["layer_index"] = layer_idx
        return toolpaths

    def run_slicer(geometry_arg, run_params):
        if not model_path:
            gcode = _STUB_GCODE
        else:
            try:
                gcode = _call_libslic3r(model_path, run_params)
            except (FileNotFoundError, subprocess.CalledProcessError):
                gcode = _STUB_GCODE
        return EngineWrapper.parse_gcode_to_collection(gcode, source="libslic3r")

    slicer.set_engine(run_slicer)

    collection = slicer.run(None, p)

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
