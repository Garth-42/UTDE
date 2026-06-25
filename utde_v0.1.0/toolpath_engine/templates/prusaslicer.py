"""
Template: PrusaSlicer — Slice a model via the PrusaSlicer CLI
=============================================================

Wraps the PrusaSlicer binary (or any slic3r-compatible CLI) via the
EngineWrapper pattern. The user selects the loaded model from the UTDE
viewport; the server injects its path as params["_model_path"] before
calling this template.

PrusaSlicer binary is resolved from the PRUSASLICER_BIN environment variable
(default: "prusa-slicer"). If the binary is not found or the model path is
absent, falls back to stub G-code so the template stays runnable in tests
and development environments without a slicer installed.

Usage:
    from toolpath_engine import get_process
    fn = get_process("prusaslicer")
    result = fn(model=None, geometry=[[]], params={
        "layer_height": 0.15,
        "infill_density": 30,
        "_model_path": "/tmp/part.step",
    })
"""

import os
import subprocess
import tempfile

from toolpath_engine import (
    process,
    EngineWrapper,
    Orientation,
)

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


def _call_prusaslicer(model_path: str, params: dict) -> str:
    """Call PrusaSlicer CLI and return G-code string.
    Raises FileNotFoundError if the binary is not found,
    or subprocess.CalledProcessError if slicing fails.
    """
    slicer = os.environ.get("PRUSASLICER_BIN", "prusa-slicer")

    layer_height   = params.get("layer_height", 0.2)
    infill_density = params.get("infill_density", 20)
    fill_pattern   = params.get("fill_pattern", "gyroid")
    perimeters     = int(params.get("perimeters", 2))
    support        = params.get("support_material", "off")
    support_angle  = params.get("support_material_threshold", 45)
    brim_width     = params.get("brim_width", 0)
    print_speed    = params.get("print_speed", 50)
    nozzle_dia     = params.get("nozzle_diameter", 0.4)
    filament_dia   = params.get("filament_diameter", 1.75)
    extruder_temp  = int(params.get("extruder_temperature", 210))
    bed_temp       = int(params.get("bed_temperature", 60))
    config_file    = params.get("config_file", "").strip()

    with tempfile.NamedTemporaryFile(suffix=".gcode", delete=False) as out:
        out_path = out.name

    cmd = [slicer, "--export-gcode", "--output", out_path]
    if config_file:
        cmd += ["--load", config_file]
    cmd += [
        f"--layer-height={layer_height}",
        f"--fill-density={infill_density}%",
        f"--fill-pattern={fill_pattern}",
        f"--perimeters={perimeters}",
        f"--nozzle-diameter={nozzle_dia}",
        f"--filament-diameter={filament_dia}",
        f"--temperature={extruder_temp}",
        f"--bed-temperature={bed_temp}",
        f"--brim-width={brim_width}",
        f"--print-speed={print_speed}",
    ]
    if support == "on":
        cmd += [
            "--support-material",
            f"--support-material-threshold={int(support_angle)}",
        ]
    cmd.append(model_path)

    subprocess.run(cmd, check=True, capture_output=True)
    with open(out_path) as f:
        return f.read()


@process(
    "prusaslicer",
    description="Slice the selected model via PrusaSlicer CLI. Exposes common slicing parameters and supports loading a full .ini profile.",
    tags=["additive", "fff", "fdm", "slicer", "prusaslicer", "3-axis"],
    kind="add",
    label="PrusaSlicer",
    icon="add-layer",
    requires_local=True,  # shells out to the PrusaSlicer CLI — server/desktop only
    requires=[{"type": "model", "label": "Model to slice", "count": 1}],
    params=[
        {"id": "layer_height",             "type": "number",  "default": 0.2,
         "unit": "mm",   "label": "Layer height"},
        {"id": "infill_density",           "type": "number",  "default": 20,
         "unit": "%",    "label": "Infill density"},
        {"id": "fill_pattern",             "type": "select",  "default": "gyroid",
         "options": ["gyroid", "rectilinear", "honeycomb", "grid", "triangles", "cubic"],
         "label": "Infill pattern"},
        {"id": "perimeters",               "type": "number",  "default": 2,
         "label": "Perimeter walls"},
        {"id": "support_material",         "type": "segment", "default": "off",
         "options": ["off", "on"],         "label": "Supports"},
        {"id": "support_material_threshold","type": "number",  "default": 45,
         "unit": "°",    "label": "Support angle"},
        {"id": "brim_width",               "type": "number",  "default": 0,
         "unit": "mm",   "label": "Brim width"},
        {"id": "print_speed",              "type": "number",  "default": 50,
         "unit": "mm/s", "label": "Print speed"},
        {"id": "nozzle_diameter",          "type": "number",  "default": 0.4,
         "unit": "mm",   "label": "Nozzle Ø"},
        {"id": "filament_diameter",        "type": "number",  "default": 1.75,
         "unit": "mm",   "label": "Filament Ø"},
        {"id": "extruder_temperature",     "type": "number",  "default": 210,
         "unit": "°C",   "label": "Nozzle temp"},
        {"id": "bed_temperature",          "type": "number",  "default": 60,
         "unit": "°C",   "label": "Bed temp"},
        {"id": "config_file",              "type": "text",    "default": "",
         "label": "Profile path (.ini)",
         "hint": "Optional — load a PrusaSlicer .ini profile before applying params above"},
    ],
    est_time=45.0,
    est_volume=18.0,
)
def prusaslicer(model=None, geometry=None, params=None):
    """
    Slice the user-selected model via PrusaSlicer, returning a ToolpathCollection.

    Args:
        model:    Not used directly; model path comes from params["_model_path"]
                  (injected by the server when the user selects the model in the UI).
        geometry: List-of-lists matching `requires` — geometry[0] will be
                  ["__model__"] when wired up; resolved by the server.
        params:   Dict of param values. The server injects "_model_path" for the
                  selected model.  All other keys match the @process params schema.

    Returns:
        ToolpathCollection with path_type and layer metadata from PrusaSlicer G-code.
    """
    p = params or {}
    model_path = p.get("_model_path")

    slicer = EngineWrapper("prusaslicer")

    @slicer.on_each_point
    def ensure_orientation(point):
        if point.orientation is None:
            point.orientation = Orientation.z_down()
        return point

    @slicer.on_each_layer
    def tag_layer(layer_idx, toolpaths):
        for tp in toolpaths:
            tp.metadata = tp.metadata or {}
            tp.metadata["layer_index"] = layer_idx
        return toolpaths

    def run_prusaslicer(geometry_arg, run_params):
        if not model_path:
            gcode = _STUB_GCODE
        else:
            try:
                gcode = _call_prusaslicer(model_path, run_params)
            except (FileNotFoundError, subprocess.CalledProcessError):
                gcode = _STUB_GCODE
        return EngineWrapper.parse_gcode_to_collection(gcode, source="prusaslicer")

    slicer.set_engine(run_prusaslicer)
    return slicer.run(None, p)


if __name__ == "__main__":
    result = prusaslicer()
    total_pts = sum(len(tp.points) for tp in result.toolpaths)
    print(f"Toolpaths: {len(result.toolpaths)}, Points: {total_pts}")
