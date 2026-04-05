# Getting Started

## Installation

### Prerequisites

- Python 3.9 or later
- pip

### Install dependencies

```bash
pip install numpy scipy pyyaml
```

### Optional extras

```bash
# STEP/CAD file support (requires OpenCASCADE)
pip install pythonocc-core>=7.7

# Visualization helpers
pip install trimesh matplotlib

# Development tools
pip install pytest black mypy
```

### Install UTDE

```bash
# Editable install (recommended for development)
pip install -e utde_v0.1.0/

# Or add to your project directly
cd utde_v0.1.0
pip install .
```

### Verify

```bash
python -c "from toolpath_engine import *; print('OK')"
```

---

## Your first toolpath

This walks through generating a simple helical toolpath on a cylinder — the core workflow in about 20 lines.

### 1. Define geometry

```python
from toolpath_engine import *

# A cylindrical surface (what you're working on)
cylinder = Surface.cylinder(
    center=(0, 0, 0),
    axis=(0, 0, 1),
    radius=40,
    height=80,
    name="my_cylinder",
)

# A helical curve (the path to follow)
helix = Curve.helix(
    center=(0, 0, 0),
    radius=40,
    pitch=5,
    turns=4,
)
```

### 2. Generate a toolpath

```python
paths = FollowCurveStrategy().generate(
    curve=helix,
    feed_rate=600,       # mm/min
    path_type="deposit", # metadata — UTDE doesn't interpret this
)
```

### 3. Orient the tool

```python
# Point the tool perpendicular to the cylinder surface
paths.orient(to_normal(cylinder))

# Add a 10° lead angle in the direction of travel
paths.orient(lead(10))
```

Rules are applied in order and stack on top of each other. See [Orientation Rules](guides/orientation.md) for the full list.

### 4. Define a machine

```python
machine = Machine.gantry_5axis_ac(
    name="my_machine",
    travel=(500, 500, 400),  # X, Y, Z travel in mm
)
machine.set_tool_offset(z=100)  # 100mm tool length
```

### 5. Generate G-code

```python
post = PostProcessor(machine)
gcode = post.process(paths)

print(gcode[:500])  # preview first 500 chars
```

### 6. Save to file

```python
with open("output.nc", "w") as f:
    f.write(gcode)
```

---

## Run the built-in demo

The included demo runs a complete 5-axis directed energy deposition (DED) welding job — geometry definition, machine setup, all four strategies, orientation rules, G-code output, collision checking, and the external engine wrapper:

```bash
cd utde_v0.1.0
python toolpath_engine/examples/demo_5axis_ded.py
```

See the [annotated walkthrough](examples/5axis-ded.md) for a line-by-line explanation.
