# Orientation Rules

Orientation rules are composable, chainable functions that set the tool axis direction at each point on a toolpath. They are the primary mechanism for controlling multi-axis behavior.

---

## How rules work

Each rule is a callable with the signature:

```python
def rule(point: ToolpathPoint, context: dict) -> Orientation | None:
    ...
```

- Returns an `Orientation` to change the tool axis at this point
- Returns `None` to leave it unchanged ("pass through")

The `context` dict provides:

| Key | Value |
|-----|-------|
| `prev` | Previous `ToolpathPoint` (or `None` at start) |
| `next` | Next `ToolpathPoint` (or `None` at end) |
| `index` | Current point index |
| `total` | Total number of points in this toolpath |

Rules are applied by calling `.orient()` on a collection:

```python
paths.orient(rule)
```

Each call **stacks** on top of the previous — rules run in the order they're applied:

```python
paths.orient(to_normal(cylinder))    # sets base orientation
paths.orient(lead(10))               # modifies orientation from previous step
paths.orient(avoid_collision(machine))  # may clamp if needed
```

---

## Built-in rules

### `to_normal(surface)`

Orients the tool axis perpendicular to the surface at the closest point to each toolpath position.

```python
from toolpath_engine import to_normal, Surface

cylinder = Surface.cylinder(center=(0,0,0), radius=40, height=80)
paths.orient(to_normal(cylinder))
```

Use this as the **base rule** for surface-following processes (welding, coating, milling).

---

### `fixed(i, j, k)`

Sets a constant tool axis direction for all points. Default is `(0, 0, -1)` (straight down — standard 3-axis behavior).

```python
from toolpath_engine import fixed

paths.orient(fixed(0, 0, -1))   # 3-axis: tool always Z-down
paths.orient(fixed(0, 1, 0))    # tool always pointing in Y direction
```

---

### `lead(angle_deg)`

Tilts the tool **forward** in the direction of travel by the specified angle.

```python
from toolpath_engine import lead

paths.orient(lead(10))   # 10° forward tilt
paths.orient(lead(15))   # 15° forward tilt
```

Requires a previous or next point to determine the travel direction. Has no effect at isolated points.

!!! tip
    Apply `to_normal` first, then `lead`. The lead rule modifies the existing orientation rather than replacing it.

---

### `lag(angle_deg)`

Tilts the tool **backward** (opposite travel direction). Equivalent to `lead(-angle_deg)`.

```python
from toolpath_engine import lag

paths.orient(lag(5))   # 5° backward tilt
```

---

### `side_tilt(angle_deg)`

Tilts the tool sideways — perpendicular to both the travel direction and current tool axis.

```python
from toolpath_engine import side_tilt

paths.orient(side_tilt(8))   # 8° side tilt
```

---

### `blend(rule_a, rule_b, over=10.0)`

Smoothly interpolates between two rules over the length of the toolpath.

```python
from toolpath_engine import blend, fixed, to_normal

# Transition from fixed Z-down to surface-normal over the path
paths.orient(blend(fixed(0, 0, -1), to_normal(surface), over=20.0))
```

Useful for approach and retract transitions where you want to gradually change tool axis.

---

### `avoid_collision(machine, max_tilt=20.0)`

Clamps the tool axis if it would exceed `max_tilt` degrees from vertical (Z axis). In the full implementation this checks tool assembly against workpiece geometry; currently it enforces a maximum tilt angle.

```python
from toolpath_engine import avoid_collision

paths.orient(avoid_collision(machine, max_tilt=45))
```

Apply this **last** — it's a safety constraint on top of the desired orientation, not a base rule.

---

## Writing a custom rule

```python
def my_rule(surface, offset_deg=5.0):
    """Orient to surface normal with a fixed side offset."""
    import math
    from toolpath_engine.core.primitives import Orientation

    def rule(point, context):
        normal = surface.normal_at_closest(point.position)
        # ... modify normal as needed ...
        return Orientation.from_vector(normal)

    rule.__name__ = f"my_rule(offset={offset_deg}°)"
    return rule

paths.orient(my_rule(cylinder, offset_deg=5))
```

---

## Common patterns

### 5-axis surface following with lead angle

```python
paths.orient(to_normal(surface))
paths.orient(lead(10))
```

### 3-axis (tool always vertical)

```python
paths.orient(fixed(0, 0, -1))
```

### Safe approach with collision avoidance

```python
paths.orient(to_normal(surface))
paths.orient(lead(10))
paths.orient(avoid_collision(machine, max_tilt=45))
```
