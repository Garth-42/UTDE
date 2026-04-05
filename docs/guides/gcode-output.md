# G-code Output

The `PostProcessor` converts a `ToolpathCollection` into machine-specific G-code by resolving inverse kinematics for each point and formatting the output per your controller's dialect.

---

## Basic usage

```python
from toolpath_engine import PostProcessor, Machine

machine = Machine.gantry_5axis_ac(name="my_machine")
post    = PostProcessor(machine)
gcode   = post.process(paths)

with open("output.nc", "w") as f:
    f.write(gcode)
```

---

## PostConfig

`PostConfig` controls every aspect of the G-code output format.

```python
from toolpath_engine.post import PostProcessor, PostConfig

config = PostConfig(
    program_number=1001,          # O-number at top of program
    use_tcp=True,                 # emit TCPON/TCPOFF (tool center point)
    units="metric",               # "metric" (G21) or "imperial" (G20)

    # Startup and shutdown blocks
    safe_start=["G90", "G21", "G17", "G40", "G54"],
    program_end=["M5", "G49", "G28 G91 Z0", "M30"],

    # Motion codes
    rapid_code="G0",
    feed_code="G1",

    # Axis letter overrides (defaults: X Y Z A B C)
    axis_letters={"X": "X", "Y": "Y", "Z": "Z", "A": "A", "C": "C"},

    # Output precision (decimal places)
    pos_precision=3,
    angle_precision=3,
)

# Map process parameters to G-code output letters
config.param_codes["laser_power"] = "S"
config.param_codes["wire_feed"]   = "E"
config.param_codes["coolant"]     = "Q"

post  = PostProcessor(machine, config)
gcode = post.process(paths)
```

---

## Skipping IK (3-axis / analytical geometry)

If you're working in 3-axis mode or have pre-solved joint positions, you can skip the numerical IK solver:

```python
gcode = post.process(paths, resolve_ik=False)
```

In this mode, the post-processor uses position values directly without calling `machine.inverse_kinematics()`.

---

## Sample output

```gcode
O1001
G90 G21 G17 G40 G54
TCPON
G0 X0.000 Y0.000 Z300.000
G0 X50.000 Y0.000 Z150.000
G1 X39.945 Y3.488 Z0.000 F600 S2000 E3.0
G1 X39.781 Y6.963 Z0.069 F600 S2000 E3.0
...
M5
G49
G28 G91 Z0
M30
```

---

## Rapid vs. feed moves

A `ToolpathPoint` with `rapid=True` outputs as `G0`; all others output as `G1`.

```python
from toolpath_engine.core.toolpath import Toolpath

# Rapid move to a named position
retract = Toolpath.rapid_to(home_position)
collection.add(retract)
```

---

## Modal suppression

The post-processor suppresses repeated modal codes — if two consecutive points have the same feed rate and process parameters, redundant values are omitted to keep the output clean.
