# Example: 5-Axis DED Welding

This is a line-by-line walkthrough of `toolpath_engine/examples/demo_5axis_ded.py` — a complete directed energy deposition (DED) welding job on a cylindrical workpiece.

The example demonstrates every major subsystem: geometry, machine definition, all four strategies, composable orientation, G-code output, collision checking, and the external engine wrapper.

---

## 1. Named positions and frames

```python
home     = Position(0, 0, 300, name="home")
approach = Position(50, 0, 150, name="approach")
safe_z   = Variable("safe_z", 250, unit="mm")

wcs = Frame.from_origin_and_z(
    "workpiece",
    origin=(100, 100, 0),
    z_axis=(0, 0, 1),
)
```

`Position` and `Variable` are named primitives — they make process scripts readable and searchable. `Frame` defines a coordinate system for a workpiece or fixture offset.

---

## 2. Geometry

```python
cylinder = Surface.cylinder(
    center=(0, 0, 0), axis=(0, 0, 1),
    radius=40, height=80,
    name="deposition_surface",
)

helix = Curve.helix(
    center=(0, 0, 0), radius=40,
    pitch=5, turns=4, num_points_per_turn=72,
)

ring     = Curve.circle(center=(0, 0, 20), radius=40, num_points=64)
top_plate = Surface.plane(origin=(0, 0, 80), normal=(0, 0, 1), size=60)
```

The cylinder is the deposition surface. The helix is the weld path — a multi-turn spiral wrapping around the cylinder at 5mm pitch per turn.

The geometry model groups everything with tags:

```python
model = GeometryModel("weld_assembly")
model.add_surface(cylinder, tags=["weld_target"])
model.add_surface(top_plate, tags=["coat_target"])
model.add_curve(helix, tags=["weld_path"])
```

---

## 3. Machine kinematics

```python
machine = Machine.gantry_5axis_ac(
    name="DED_5axis",
    travel=(500, 500, 400),
    a_limits=(-120, 120),
)
machine.set_tool_offset(z=100)
machine.config["process"]       = "DED"
machine.config["wire_diameter"] = 1.2
```

This is a standard 5-axis gantry with an AC rotary table. The 100mm tool offset accounts for the DED nozzle length. Process metadata goes in `config` — it doesn't affect kinematics but is preserved in YAML and available to post-processing.

---

## 4. Toolpath strategies

Four strategies are demonstrated:

```python
# Follow the helical weld path
helix_paths = FollowCurveStrategy().generate(
    curve=helix, feed_rate=600, spacing=1.0, path_type="deposit",
)
helix_paths.set_param("wire_feed", 3.0)
helix_paths.set_param("laser_power", 2000)

# Single-pass ring weld
ring_paths = FollowCurveStrategy().generate(
    curve=ring, feed_rate=800, path_type="deposit",
)

# Raster fill on the top plate
fill_paths = RasterFillStrategy().generate(
    surface=top_plate, spacing=3.0, feed_rate=500,
    step_size=0.5, path_type="deposit",
)

# Contour-parallel passes from a circular boundary
boundary = Curve.circle(center=(0, 0, 80), radius=30, num_points=64)
contour_paths = ContourParallelStrategy().generate(
    boundary=boundary, stepover=3.0, num_passes=4,
    feed_rate=700, path_type="deposit",
)
```

Each strategy returns a `ToolpathCollection`. Process parameters set on a collection propagate to all points.

---

## 5. Orientation rules

```python
# Helix: normal to cylinder, 10° lead, collision-safe
helix_paths.orient(to_normal(cylinder))
helix_paths.orient(lead(10))
helix_paths.orient(avoid_collision(machine, max_tilt=45))

# Ring: normal to cylinder only
ring_paths.orient(to_normal(cylinder))

# Top plate fill: fixed Z-down (3-axis behavior)
fill_paths.orient(fixed(0, 0, -1))
```

The helix uses the most complex chain: surface-normal orientation (5-axis), a forward lead angle (prevents wire-ahead-of-pool issues in DED), and a collision safety clamp.

The fill path is treated as 3-axis — no need for 5-axis orientation on a flat surface.

---

## 6. Assembling the full job

```python
full_collection = ToolpathCollection(name="ded_weld_job")

# Approach
full_collection.add(Toolpath.rapid_to(home))
full_collection.add(Toolpath.rapid_to(approach))

# Helix passes
for tp in helix_paths:
    full_collection.add(tp)

# Retract, then ring pass
full_collection.add(Toolpath.rapid_to(approach))
for tp in ring_paths:
    full_collection.add(tp)

# Return home
full_collection.add(Toolpath.rapid_to(approach))
full_collection.add(Toolpath.rapid_to(home))
```

`Toolpath.rapid_to(position)` creates a single-point rapid move toolpath. Interleaving these with the welding passes produces the correct approach/retract sequence in the G-code output.

---

## 7. G-code output

```python
config = PostConfig(
    program_number=1001,
    use_tcp=True,
    safe_start=["G90", "G21", "G17", "G40", "G54"],
    program_end=["M5", "G49", "G28 G91 Z0", "M30"],
)
config.param_codes["laser_power"] = "S"
config.param_codes["wire_feed"]   = "E"

post  = PostProcessor(machine, config)
gcode = post.process(full_collection, resolve_ik=False)
```

`resolve_ik=False` is used here because the example uses analytical geometry. In production with a real machine, set `resolve_ik=True` to solve IK for each point.

---

## 8. Collision check

```python
checker    = CollisionChecker(max_tilt_deg=60)
sim_result = checker.run(full_collection, machine=machine)

print("PASS" if sim_result.success else "FAIL")
for msg in sim_result.messages:
    print(msg)
```

`CollisionChecker` verifies that no toolpath point has a tool axis tilt exceeding the limit. The full simulation plugin interface supports custom collision geometry — see `toolpath_engine/simulation/__init__.py`.

---

## 9. External engine wrapper

```python
wrapper = EngineWrapper("demo_slicer")

@wrapper.before_slice
def log_input(geometry, params):
    return geometry, params          # pre-process inputs

@wrapper.on_each_point
def add_layer_time(point):
    point.process_params["layer_time"] = 2.5
    return point                     # augment each point

@wrapper.after_slice
def log_output(collection):
    return collection                # post-process output

wrapper.set_engine(my_external_slicer)
result = wrapper.run("model.stl", {"layer_height": 0.3})
```

The wrapper pattern lets you hook into any external slicer or CAM engine and use UTDE's kinematics and post-processing on the output.
