# Geometry

UTDE's geometry layer provides the surfaces and curves that strategies and orientation rules operate on. It is intentionally simple — just enough to drive toolpath generation.

---

## Curve

A `Curve` is a 3D path defined by a sequence of sampled points.

### Factory methods

```python
from toolpath_engine import Curve

# Straight line from A to B
line = Curve.line(start=(0, 0, 0), end=(100, 0, 0), num_points=50)

# Circle in the XY plane
circle = Curve.circle(center=(0, 0, 20), radius=40, num_points=64)

# Helix along Z axis
helix = Curve.helix(
    center=(0, 0, 0),
    radius=40,
    pitch=5,          # mm per turn
    turns=4,
    num_points_per_turn=72,
)

# Cubic spline through control points
spline = Curve.spline(
    control_points=[(0,0,0), (50,30,10), (100,0,20)],
    num_points=100,
)
```

### Working with curves

```python
# Resample to evenly-spaced points by arc length
resampled = curve.resample(num_points=200)

# Compute normal at a point (returns Vector3)
normal = curve.normal_at(index=10)

# Access raw points
for pt in curve.points:
    print(pt)  # Vector3
```

---

## Surface

A `Surface` is a 3D surface that can answer two key queries: **normal at a point** and **closest point on the surface**. These power the `to_normal` orientation rule.

### Factory methods

```python
from toolpath_engine import Surface

# Infinite plane
plane = Surface.plane(
    origin=(0, 0, 80),
    normal=(0, 0, 1),
    size=60,           # display size only, not a hard boundary
    name="top_plate",
)

# Cylinder
cylinder = Surface.cylinder(
    center=(0, 0, 0),
    axis=(0, 0, 1),
    radius=40,
    height=80,
    name="deposition_surface",
)

# Sphere
sphere = Surface.sphere(center=(0, 0, 0), radius=50, name="dome")

# Cone
cone = Surface.cone(
    apex=(0, 0, 100),
    axis=(0, 0, -1),
    half_angle_deg=30,
    name="nozzle",
)
```

### Querying surfaces

```python
from toolpath_engine import Vector3

point = Vector3(40, 0, 30)

# Surface normal at the point closest to `point`
normal = surface.normal_at_closest(point)

# Closest point on the surface to `point`
closest = surface.closest_point(point)

# Tessellate the surface for visualization
vertices, indices = surface.tessellate(resolution=32)
```

---

## GeometryModel

A `GeometryModel` groups surfaces and curves together with tags, making it easy to query subsets.

```python
from toolpath_engine import GeometryModel

model = GeometryModel("weld_assembly")

model.add_surface(cylinder, tags=["weld_target"])
model.add_surface(top_plate, tags=["coat_target"])
model.add_curve(helix, tags=["weld_path"])
model.add_curve(ring, tags=["weld_path"])

# Query by tag
weld_surfaces = model.surfaces_with_tag("weld_target")
weld_paths    = model.curves_with_tag("weld_path")
```

---

## STEP file import

For real CAD geometry, use the STEP server (requires `pythonocc-core`):

```bash
# Start the server
python step_server.py
```

Then POST a STEP file to get tessellated face data:

```bash
curl -X POST http://localhost:5174/parse-step \
     -F "file=@part.step" | python -m json.tool
```

The response includes vertex/index data and geometric parameters (plane normal, cylinder axis/radius, etc.) that you can use to construct `Surface` objects.
