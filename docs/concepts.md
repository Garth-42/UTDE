# Concepts

Understanding these ideas will make UTDE's API feel natural rather than arbitrary.

---

## The environment does not know about processes

This is the central design decision. UTDE has no built-in knowledge of welding, 3D printing, laser cutting, or any other manufacturing process. There are no "weld settings" or "extrusion parameters" baked in.

Instead, UTDE provides **primitives** — geometry, toolpath points, orientation rules, kinematics — and you compose them into a process. Process parameters are just a free-form dictionary on each toolpath point:

```python
point.process_params["laser_power"] = 2000
point.process_params["wire_feed"]   = 3.0
point.process_params["layer_time"]  = 2.5
```

The post-processor maps these to G-code output letters:

```python
config.param_codes["laser_power"] = "S"
config.param_codes["wire_feed"]   = "E"
```

This means UTDE works for any process without modification.

---

## Composable orientation rules

Tool orientation is one of the most complex aspects of multi-axis machining. UTDE handles this with **composable rules** — small functions that each modify orientation in one specific way, applied in a chain:

```python
paths.orient(to_normal(cylinder))         # step 1: perpendicular to surface
paths.orient(lead(10))                    # step 2: add 10° lead angle
paths.orient(avoid_collision(machine))    # step 3: clamp if near singularity
```

Each rule receives the current point (with its existing orientation already set by prior rules) and returns a new orientation — or `None` to leave it unchanged.

This is more flexible than a single combined function because you can:

- Reuse rules across different toolpaths
- Add or remove rules without rewriting others
- Build process-specific rule sets as simple Python functions

---

## Strategies generate paths, not processes

A **strategy** answers one question: *given this geometry, what sequence of positions should the tool visit?*

It does not set orientation, process parameters, or feed rates (beyond a base value). Those concerns are separated:

```python
# Strategy: where to go
paths = RasterFillStrategy().generate(surface=top_plate, spacing=3.0, feed_rate=500)

# Orientation: which way to point
paths.orient(fixed(0, 0, -1))

# Process params: what to do at each point
paths.set_param("laser_power", 1500)
```

---

## Kinematics are user-defined

UTDE does not assume a machine configuration. You define the kinematic chain as a sequence of joints:

```python
machine = Machine("my_robot")
machine.add_joint(Linear("X", Vector3(1, 0, 0), limits=(0, 500)))
machine.add_joint(Linear("Y", Vector3(0, 1, 0), limits=(0, 500)))
machine.add_joint(Linear("Z", Vector3(0, 0, 1), limits=(0, 400)))
machine.add_joint(Rotary("A", Vector3(1, 0, 0), limits=(-120, 120)), chain="workpiece")
machine.add_joint(Rotary("C", Vector3(0, 0, 1)), chain="workpiece")
```

Forward kinematics (FK) is computed from the joint chain automatically. Inverse kinematics (IK) uses a numerical solver (`scipy.optimize`) with your joint limits as constraints.

For common configurations, presets are provided:

```python
machine = Machine.gantry_5axis_ac()
machine = Machine.gantry_5axis_bc()
machine = Machine.cartesian_3axis()
```

Machines serialize to YAML and round-trip cleanly, making them easy to version-control:

```python
yaml_str = machine.to_yaml()
machine2 = Machine.from_yaml(yaml_str)
```

---

## Plain text, version-controllable

Process definitions are Python scripts. Machine configs are YAML. There are no binary files, no proprietary formats. This means:

- Processes live in Git alongside the rest of your code
- Diffs are readable
- You can parameterize anything with standard Python

---

## Coordinate conventions

- All positions are in **millimeters** by default (configurable in `PostConfig`)
- Orientation vectors point **from tool tip toward spindle** (i.e. the tool axis direction)
- `Orientation(0, 0, -1)` means the tool points straight down (standard 3-axis)
- Feed rates are in **mm/min**
