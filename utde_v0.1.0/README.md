# Universal Toolpath Design Environment (UTDE)

**A process-agnostic, programmable platform for multi-axis toolpath generation.**

## Core Principle

The app does not know about processes. It provides primitives that let users define any process — additive, subtractive, hybrid, coating, inspection, or anything else.

## Quick Start

```bash
pip install numpy scipy pyyaml
cd toolpath_engine
python examples/demo_5axis_ded.py
```

## Architecture

```
toolpath_engine/
├── core/               # Primitive types
│   ├── primitives.py   # Position, Orientation, Frame, Variable, Vector3
│   ├── toolpath.py     # ToolpathPoint, Toolpath, ToolpathCollection
│   └── geometry.py     # Surface, Curve, GeometryModel
├── orient/             # Composable orientation rules
│   └── rules.py        # to_normal, fixed, lead, lag, blend, avoid_collision
├── strategies/         # Toolpath generation strategies
│   ├── base.py         # ToolpathStrategy base class
│   ├── follow_curve.py # Follow existing curves
│   ├── raster_fill.py  # Parallel raster passes over surfaces
│   └── contour_parallel.py  # Offset passes from boundary
├── kinematics/         # Machine definition and IK
│   └── machine.py      # Machine, Linear, Rotary, FK/IK solver
├── post/               # G-code generation
│   └── processor.py    # PostProcessor with configurable output
├── integration/        # External engine wrappers
│   └── wrapper.py      # Hook-based wrapper for slicers/CAM engines
├── simulation/         # Simulation plugin interface
│   └── __init__.py     # SimulationPlugin, CollisionChecker
└── examples/
    └── demo_5axis_ded.py  # Complete end-to-end example
```

## Example Usage

```python
from toolpath_engine import *

# Define geometry
cylinder = Surface.cylinder(center=(0,0,0), radius=40, height=80)
helix = Curve.helix(center=(0,0,0), radius=40, pitch=5, turns=4)

# Generate toolpath
paths = FollowCurveStrategy().generate(curve=helix, feed_rate=600)

# Orient: chain rules (5-axis normal-follow + lead angle)
paths.orient(to_normal(cylinder))
paths.orient(lead(10))

# Define machine
machine = Machine.gantry_5axis_ac(name="my_machine")

# Generate G-code
post = PostProcessor(machine)
gcode = post.process(paths)
```

## Key Features

- **Process-agnostic**: No built-in process knowledge. Define any process from primitives.
- **Composable orient**: Chain orientation rules — `to_normal → lead → avoid_collision`
- **User-defined kinematics**: YAML machine definitions with automatic IK solving
- **External engine wrappers**: Hook into LibSlic3r, CuraEngine, or any external tool
- **Plain-text everything**: Process files are Python scripts. Machine configs are YAML. Version control with Git.
- **Simulation plugins**: Extensible interface from basic collision checking to future physics

## License

MIT
