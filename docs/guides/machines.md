# Machines & Kinematics

UTDE lets you define any machine as a chain of joints. Forward kinematics is computed automatically; inverse kinematics is solved numerically.

---

## Joint types

### `Linear`

A prismatic joint that translates along its axis.

```python
from toolpath_engine import Linear, Vector3

x_axis = Linear("X", axis=Vector3(1, 0, 0), limits=(0, 500), home=0)
```

`value` is the current position in **millimeters**.

### `Rotary`

A revolute joint that rotates around its axis.

```python
from toolpath_engine import Rotary, Vector3

a_axis = Rotary("A", axis=Vector3(1, 0, 0), limits=(-120, 120), home=0)
```

`value` is the current angle in **degrees**.

---

## Defining a machine

A `Machine` has two kinematic chains:

- **tool chain** — joints that move the tool (X, Y, Z on a gantry)
- **workpiece chain** — joints that move the workpiece (A, C on a rotary table)

```python
from toolpath_engine import Machine, Linear, Rotary, Vector3

machine = Machine("my_5axis")

# Tool side: XYZ gantry
machine.add_joint(Linear("X", Vector3(1, 0, 0), limits=(0, 500)), chain="tool")
machine.add_joint(Linear("Y", Vector3(0, 1, 0), limits=(0, 500)), chain="tool")
machine.add_joint(Linear("Z", Vector3(0, 0, 1), limits=(0, 400)), chain="tool")

# Workpiece side: AC rotary table
machine.add_joint(Rotary("A", Vector3(1, 0, 0), limits=(-120, 120)), chain="workpiece")
machine.add_joint(Rotary("C", Vector3(0, 0, 1)), chain="workpiece")  # unlimited rotation

# Tool length compensation
machine.set_tool_offset(z=100)  # 100mm tool
```

### Built-in presets

For common configurations, use the factory methods:

```python
# Standard 3-axis gantry (XYZ)
machine = Machine.cartesian_3axis(name="3axis", travel=(500, 500, 400))

# 5-axis gantry with AC rotary table
machine = Machine.gantry_5axis_ac(
    name="5axis_AC",
    travel=(500, 500, 400),
    a_limits=(-120, 120),
)

# 5-axis gantry with BC rotary table
machine = Machine.gantry_5axis_bc(
    name="5axis_BC",
    travel=(500, 500, 400),
    b_limits=(-120, 120),
)
```

---

## Forward kinematics

Computes tool tip position and tool axis direction from current joint values.

```python
# Using current joint values
position, tool_axis = machine.forward_kinematics()

# Or with explicit values
position, tool_axis = machine.forward_kinematics({
    "X": 100.0,
    "Y": 200.0,
    "Z": 50.0,
    "A": 30.0,
    "C": 45.0,
})
```

---

## Inverse kinematics

Finds the joint values that place the tool at a target position and orientation. Uses `scipy.optimize.minimize` (L-BFGS-B) with joint limits as bounds.

```python
from toolpath_engine import Position, Orientation

target_pos    = Position(100, 150, 50)
target_orient = Orientation(0.1, 0, -0.99)  # slightly tilted from Z-down

joint_values = machine.inverse_kinematics(
    target_pos=target_pos,
    target_orient=target_orient,
    initial_guess={"X": 100, "Y": 150, "Z": 50, "A": 0, "C": 0},
)
# Returns: {"X": 100.0, "Y": 150.0, "Z": 48.3, "A": 5.7, "C": 0.0}
```

### Checking joint limits

```python
violations = machine.check_limits(joint_values)
if violations:
    for v in violations:
        print(f"Limit violation: {v}")
```

---

## YAML serialization

Machines serialize to YAML for version control and sharing:

```python
yaml_str = machine.to_yaml()
print(yaml_str)
```

```yaml
name: my_5axis
tool_chain:
  - name: X
    type: linear
    axis: [1.0, 0.0, 0.0]
    limits: [0, 500]
    home: 0
  # ...
workpiece_chain:
  - name: A
    type: rotary
    axis: [1.0, 0.0, 0.0]
    limits: [-120, 120]
    home: 0
  # ...
tool_offset: [0.0, 0.0, 100.0]
config: {}
```

Round-trip load:

```python
machine2 = Machine.from_yaml(yaml_str)
```

Or load from a file:

```python
import yaml

with open("machine.yaml") as f:
    machine = Machine.from_yaml(f.read())
```

---

## Custom process metadata

The `config` dict on a machine is free-form — use it to store process-specific settings:

```python
machine.config["process"]         = "DED"
machine.config["wire_diameter"]   = 1.2
machine.config["shielding_gas"]   = "Ar"
```

These are serialized to YAML and available at post-processing time.
