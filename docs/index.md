# Universal Toolpath Design Environment

**UTDE** is a process-agnostic, programmable platform for multi-axis toolpath generation.

The core idea: UTDE does not know about processes. It provides primitives that let *you* define any process — additive manufacturing, subtractive machining, laser cutting, directed energy deposition, coating, inspection — from the ground up, in plain Python.

## Why UTDE?

Most CAM software locks you into a fixed set of process types. When you need something new — a hybrid process, an unusual machine configuration, a non-standard deposition strategy — you're either stuck or forced into workarounds.

UTDE takes a different approach. You define the geometry, the toolpath strategy, the orientation rules, and the machine. The system handles kinematics and G-code output. There is no hardcoded process knowledge to fight.

## Key features

- **Composable orientation rules** — chain `to_normal → lead → avoid_collision` in any order
- **Programmable strategies** — raster fill, contour parallel, follow-curve, or write your own
- **User-defined kinematics** — define any machine as a joint chain; IK is solved automatically
- **Plain-text everything** — process scripts are Python, machine configs are YAML, version-control friendly
- **Extensible** — plug in external slicers, collision checkers, or simulation engines via hooks

## Quick start

```bash
pip install numpy scipy pyyaml
cd utde_v0.1.0
python toolpath_engine/examples/demo_5axis_ded.py
```

Or install as a package:

```bash
pip install -e utde_v0.1.0/
```

## Minimal example

```python
from toolpath_engine import *

# Define geometry
cylinder = Surface.cylinder(center=(0, 0, 0), radius=40, height=80)
helix    = Curve.helix(center=(0, 0, 0), radius=40, pitch=5, turns=4)

# Generate toolpath
paths = FollowCurveStrategy().generate(curve=helix, feed_rate=600)

# Apply orientation rules (composable)
paths.orient(to_normal(cylinder))
paths.orient(lead(10))

# Define machine and post-process
machine = Machine.gantry_5axis_ac(name="my_machine")
gcode   = PostProcessor(machine).process(paths)
```

## What's next

- [**Getting Started**](getting-started.md) — step-by-step installation and first toolpath
- [**Concepts**](concepts.md) — the mental model behind UTDE
- [**Guides**](guides/geometry.md) — deep dives into each subsystem
- [**Examples**](examples/5axis-ded.md) — annotated real-world workflows
