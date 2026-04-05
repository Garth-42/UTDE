#!/usr/bin/env python3
"""
Example: Complete 5-Axis DED Welding Process
=============================================

Demonstrates the full workflow:
1. Define geometry (curves and surfaces)
2. Define machine kinematics
3. Generate toolpaths using strategies
4. Apply orient rules (composable, chainable)
5. Use named positions for approach/retract
6. Post-process to G-code
7. Run collision check simulation

This is what a real process definition looks like using
the Universal Toolpath Design Environment.
"""

import sys
import os
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from toolpath_engine.core.primitives import Position, Orientation, Frame, Variable, Vector3
from toolpath_engine.core.geometry import Curve, Surface, GeometryModel
from toolpath_engine.core.toolpath import Toolpath, ToolpathCollection
from toolpath_engine.strategies import FollowCurveStrategy, RasterFillStrategy, ContourParallelStrategy
from toolpath_engine.orient import to_normal, fixed, lead, avoid_collision
from toolpath_engine.kinematics import Machine, Linear, Rotary
from toolpath_engine.post import PostProcessor, PostConfig
from toolpath_engine.simulation import CollisionChecker


def main():
    print("=" * 60)
    print("Universal Toolpath Design Environment - v0.1.0")
    print("Example: 5-Axis DED Weld on Cylindrical Surface")
    print("=" * 60)

    # ── 1. Named positions & frames ──────────────────────────────────────
    print("\n[1] Defining named positions and frames...")

    home = Position(0, 0, 300, name="home")
    approach = Position(50, 0, 150, name="approach")
    safe_z = Variable("safe_z", 250, unit="mm")

    wcs = Frame.from_origin_and_z(
        "workpiece",
        origin=(100, 100, 0),
        z_axis=(0, 0, 1),
    )
    print(f"    Home:      {home}")
    print(f"    Approach:  {approach}")
    print(f"    WCS:       {wcs}")

    # ── 2. Define geometry ───────────────────────────────────────────────
    print("\n[2] Creating geometry...")

    # A cylindrical surface to deposit onto
    cylinder = Surface.cylinder(
        center=(0, 0, 0),
        axis=(0, 0, 1),
        radius=40,
        height=80,
        name="deposition_surface",
    )

    # A helical curve wrapping around the cylinder (the weld path)
    helix = Curve.helix(
        center=(0, 0, 0),
        radius=40,
        pitch=5,
        turns=4,
        num_points_per_turn=72,
    )

    # A circle for a single-pass ring weld
    ring = Curve.circle(center=(0, 0, 20), radius=40, num_points=64)

    # A flat surface for raster fill demo
    top_plate = Surface.plane(
        origin=(0, 0, 80),
        normal=(0, 0, 1),
        size=60,
        name="top_plate",
    )

    model = GeometryModel("weld_assembly")
    model.add_surface(cylinder, tags=["weld_target"])
    model.add_surface(top_plate, tags=["coat_target"])
    model.add_curve(helix, tags=["weld_path"])
    model.add_curve(ring, tags=["weld_path"])
    print(f"    Model: {model}")

    # ── 3. Define machine kinematics ─────────────────────────────────────
    print("\n[3] Setting up machine kinematics...")

    machine = Machine.gantry_5axis_ac(
        name="DED_5axis",
        travel=(500, 500, 400),
        a_limits=(-120, 120),
    )
    machine.set_tool_offset(z=100)
    machine.config["process"] = "DED"
    machine.config["wire_diameter"] = 1.2

    print(f"    Machine: {machine}")
    print(f"    YAML config:\n")
    yaml_str = machine.to_yaml()
    for line in yaml_str.strip().split("\n"):
        print(f"      {line}")

    # Verify round-trip
    machine_copy = Machine.from_yaml(yaml_str)
    print(f"\n    YAML round-trip: {machine_copy}")

    # ── 4. Generate toolpaths ────────────────────────────────────────────
    print("\n[4] Generating toolpaths...")

    # Strategy 1: Follow the helical curve
    follow = FollowCurveStrategy()
    helix_paths = follow.generate(
        curve=helix,
        feed_rate=600,
        spacing=1.0,
        path_type="deposit",
    )
    helix_paths.set_param("wire_feed", 3.0)
    helix_paths.set_param("laser_power", 2000)
    print(f"    Helix path: {helix_paths}")

    # Strategy 2: Follow the ring curve
    ring_paths = follow.generate(
        curve=ring,
        feed_rate=800,
        path_type="deposit",
    )
    print(f"    Ring path:  {ring_paths}")

    # Strategy 3: Raster fill on top plate
    raster = RasterFillStrategy()
    fill_paths = raster.generate(
        surface=top_plate,
        spacing=3.0,
        feed_rate=500,
        step_size=0.5,
        path_type="deposit",
    )
    print(f"    Fill paths: {fill_paths}")

    # Strategy 4: Contour parallel
    boundary = Curve.circle(center=(0, 0, 80), radius=30, num_points=64)
    contour = ContourParallelStrategy()
    contour_paths = contour.generate(
        boundary=boundary,
        stepover=3.0,
        num_passes=4,
        feed_rate=700,
        path_type="deposit",
    )
    print(f"    Contour:    {contour_paths}")

    # ── 5. Apply orient rules (composable & chainable) ───────────────────
    print("\n[5] Applying orientation rules...")

    # Helix: orient to surface normal (5-axis), then add lead angle
    print("    Helix → to_normal(cylinder)")
    helix_paths.orient(to_normal(cylinder))
    print("    Helix → lead(10°)")
    helix_paths.orient(lead(10))
    print("    Helix → avoid_collision(max_tilt=45°)")
    helix_paths.orient(avoid_collision(machine, max_tilt=45))

    # Ring: orient to surface normal
    ring_paths.orient(to_normal(cylinder))

    # Fill: fixed Z-down (3-axis behavior)
    fill_paths.orient(fixed(0, 0, -1))

    # Show sample orientations
    if helix_paths.toolpaths and helix_paths.toolpaths[0].points:
        sample = helix_paths.toolpaths[0].points[0]
        print(f"\n    Sample helix point:")
        print(f"      Position:    {sample.position}")
        print(f"      Orientation: {sample.orientation}")
        print(f"      Feed:        {sample.feed_rate} mm/min")
        print(f"      Params:      {sample.process_params}")

    # ── 6. Assemble full toolpath with approach/retract ──────────────────
    print("\n[6] Assembling full toolpath with approach/retract...")

    full_collection = ToolpathCollection(name="ded_weld_job")

    # Approach sequence
    full_collection.add(Toolpath.rapid_to(home))
    full_collection.add(Toolpath.rapid_to(approach))

    # Welding passes
    for tp in helix_paths:
        full_collection.add(tp)

    # Retract and move to ring
    full_collection.add(Toolpath.rapid_to(approach))

    for tp in ring_paths:
        full_collection.add(tp)

    # Retract home
    full_collection.add(Toolpath.rapid_to(approach))
    full_collection.add(Toolpath.rapid_to(home))

    print(f"    Full job: {full_collection}")

    # ── 7. Post-process to G-code ────────────────────────────────────────
    print("\n[7] Generating G-code...")

    config = PostConfig(
        program_number=1001,
        use_tcp=True,
        safe_start=["G90", "G21", "G17", "G40", "G54"],
        program_end=["M5", "G49", "G28 G91 Z0", "M30"],
    )
    config.param_codes["laser_power"] = "S"
    config.param_codes["wire_feed"] = "E"

    post = PostProcessor(machine, config)

    # Use 3-axis mode (no IK) for this demo since we have analytical geometry
    gcode = post.process(full_collection, resolve_ik=False)

    # Show first 30 lines
    lines = gcode.strip().split("\n")
    print(f"    Generated {len(lines)} lines of G-code")
    print(f"    First 25 lines:")
    for line in lines[:25]:
        print(f"      {line}")
    print(f"      ...")
    for line in lines[-5:]:
        print(f"      {line}")

    # Save to file
    gcode_path = os.path.join(os.path.dirname(__file__), "output.nc")
    with open(gcode_path, "w") as f:
        f.write(gcode)
    print(f"\n    Saved to: {gcode_path}")

    # ── 8. Run collision check ───────────────────────────────────────────
    print("\n[8] Running collision simulation...")

    checker = CollisionChecker(max_tilt_deg=60)
    sim_result = checker.run(full_collection, machine=machine)
    print(f"    Result: {'PASS' if sim_result.success else 'FAIL'}")
    for msg in sim_result.messages:
        print(f"    {msg}")
    if sim_result.collisions:
        print(f"    First 3 collisions:")
        for c in sim_result.collisions[:3]:
            print(f"      {c}")

    # ── 9. Demonstrate wrapper pattern ───────────────────────────────────
    print("\n[9] Demonstrating external engine wrapper...")

    from toolpath_engine.integration import EngineWrapper

    wrapper = EngineWrapper("demo_slicer")

    @wrapper.before_slice
    def log_input(geometry, params):
        print(f"    [pre-hook] Geometry: {geometry}, Params: {params}")
        return geometry, params

    @wrapper.on_each_point
    def add_process_params(point):
        point.process_params["layer_time"] = 2.5
        return point

    @wrapper.after_slice
    def log_output(collection):
        print(f"    [post-hook] Got {collection.total_points()} points")
        return collection

    # Set a simple engine that generates a test pattern
    def demo_engine(geometry, params):
        strat = FollowCurveStrategy()
        test_curve = Curve.circle(center=(0, 0, 0), radius=20, num_points=32)
        return strat.generate(curve=test_curve, feed_rate=500)

    wrapper.set_engine(demo_engine)
    result = wrapper.run("test_model", {"layer_height": 0.3})
    print(f"    Wrapper result: {result}")

    # ── Summary ──────────────────────────────────────────────────────────
    print("\n" + "=" * 60)
    print("Summary:")
    print(f"  Primitives: Position, Orientation, Frame, Variable, Vector3")
    print(f"  Geometry:   Surface (plane, cylinder, sphere), Curve (line, circle, helix)")
    print(f"  Strategies: FollowCurve, RasterFill, ContourParallel")
    print(f"  Orient:     to_normal, fixed, lead, lag, side_tilt, blend, avoid_collision")
    print(f"  Kinematics: Linear/Rotary joints, FK/IK, YAML serialization")
    print(f"  Post:       Configurable G-code generation with modal suppression")
    print(f"  Simulation: Plugin interface with CollisionChecker")
    print(f"  Wrapper:    Hook-based external engine integration")
    print("=" * 60)


if __name__ == "__main__":
    main()
