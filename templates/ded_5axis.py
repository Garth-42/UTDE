"""
Template: 5-Axis DED (Directed Energy Deposition) — Helical Weld on Cylinder
=============================================================================

Process-agnostic template for depositing material onto a cylindrical surface
using a helical follow-curve path with 5-axis surface-normal orientation.

Demonstrates:
- Named positions (home, approach, retract)
- Named coordinate frame (workpiece WCS)
- FollowCurve strategy on a helix
- Composable orient chain: to_normal → lead → avoid_collision
- Machine definition loaded from machines/generic_5axis_ac.yaml
- G-code output via configurable post-processor

To use this template, call ded_helical() or import it via the process registry:

    from toolpath_engine import get_process
    fn = get_process("ded-5axis-helical")
    result = fn(model, params={"wire_feed": 5.0, "travel_speed": 300})
"""

import os
import sys

# Allow running directly from templates/ without install
sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

from toolpath_engine import (
    process,
    Position, Orientation, Frame, Variable,
    Curve, Surface, GeometryModel,
    FollowCurveStrategy,
    to_normal, lead, avoid_collision,
    Machine,
    PostProcessor,
    ToolpathCollection,
)
from toolpath_engine.post.processor import PostConfig


@process(
    "ded-5axis-helical",
    description="Helical DED deposition on a cylindrical surface with 5-axis surface-normal orientation.",
    tags=["additive", "ded", "5-axis", "cylinder"],
)
def ded_helical(model=None, params=None):
    """
    Generate a 5-axis helical DED toolpath.

    Args:
        model:  GeometryModel from a loaded STEP file (optional — uses synthetic
                geometry if not provided, for testing/preview).
        params: Dict of process overrides:
                  cylinder_radius  (mm, default 40)
                  helix_pitch      (mm per turn, default 5)
                  helix_turns      (default 4)
                  wire_feed        (mm/min, default 3000)
                  travel_speed     (mm/min, default 300)
                  lead_angle       (degrees, default 10)
                  max_tilt         (degrees before collision warn, default 45)

    Returns:
        ToolpathCollection
    """
    p = params or {}

    radius       = p.get("cylinder_radius", 40)
    pitch        = p.get("helix_pitch", 5)
    turns        = p.get("helix_turns", 4)
    wire_feed    = p.get("wire_feed", 3000)
    travel_speed = p.get("travel_speed", 300)
    lead_angle   = p.get("lead_angle", 10)
    max_tilt     = p.get("max_tilt", 45)

    # ── Named positions ───────────────────────────────────────────────────
    home     = Position(0, 0, 300, name="home")
    approach = Position(0, 0, radius + 60, name="approach")
    _safe_z  = Variable("safe_z", home.z, unit="mm")

    # ── Workpiece frame ───────────────────────────────────────────────────
    wcs = Frame.from_origin_and_z(
        "workpiece",
        origin=(0, 0, 0),
        z_axis=(0, 0, 1),
    )

    # ── Geometry ──────────────────────────────────────────────────────────
    if model is not None:
        # In a real workflow, select the target surface from the loaded model
        surfaces = model.select(tag="deposition_surface")
        cylinder = surfaces[0] if surfaces else Surface.cylinder(
            center=(0, 0, 0), axis=(0, 0, 1), radius=radius, height=pitch * turns
        )
    else:
        cylinder = Surface.cylinder(
            center=(0, 0, 0),
            axis=(0, 0, 1),
            radius=radius,
            height=pitch * turns,
            name="deposition_surface",
        )

    helix = Curve.helix(
        center=(0, 0, 0),
        radius=radius,
        pitch=pitch,
        turns=turns,
        num_points_per_turn=72,
    )

    # ── Strategy ──────────────────────────────────────────────────────────
    strategy = FollowCurveStrategy()
    collection = strategy.generate(helix, feed_rate=wire_feed, path_type="deposit")

    # ── Orientation chain ─────────────────────────────────────────────────
    # 1. Align tool axis to cylinder surface normal
    # 2. Add lead angle in travel direction
    # 3. Limit tilt to avoid collision
    collection.orient(to_normal(cylinder))
    collection.orient(lead(lead_angle))
    collection.orient(avoid_collision(max_tilt=max_tilt))

    # ── Process parameters on every point ────────────────────────────────
    for tp in collection.toolpaths:
        for pt in tp.points:
            pt.process_params["wire_feed_mm_min"] = wire_feed
            pt.process_params["travel_speed"]     = travel_speed

    # ── Machine + post-processor ──────────────────────────────────────────
    machines_dir = os.path.join(os.path.dirname(__file__), "..", "machines")
    yaml_path = os.path.join(machines_dir, "generic_5axis_ac.yaml")

    if os.path.exists(yaml_path):
        with open(yaml_path) as f:
            machine = Machine.from_yaml(f.read())
    else:
        machine = Machine.gantry_5axis_ac(name="5axis_AC")

    post_cfg = PostConfig(
        safe_start=["G17", "G40", "G49", "G80", "G90"],
        program_end=["M5", "M9", "G91", "G28", "Z0", "M30"],
    )
    post = PostProcessor(machine=machine, config=post_cfg)
    gcode = post.process(collection)
    collection.metadata["gcode"] = gcode

    return collection


if __name__ == "__main__":
    result = ded_helical()
    print(f"Generated {sum(len(tp.points) for tp in result.toolpaths)} toolpath points")
    gcode = result.metadata.get("gcode", "")
    lines = gcode.strip().split("\n")
    print(f"G-code: {len(lines)} lines")
    print("\n--- First 20 lines ---")
    print("\n".join(lines[:20]))
