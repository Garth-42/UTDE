# API Reference

Auto-generated from source docstrings via [mkdocstrings](https://mkdocstrings.github.io/).

All public symbols are importable from the top-level package:

```python
from toolpath_engine import (
    # Primitives
    Vector3, Position, Orientation, Frame, Variable,
    # Geometry
    Curve, Surface, GeometryModel,
    # Toolpath
    ToolpathPoint, Toolpath, ToolpathCollection,
    # Strategies
    FollowCurveStrategy, RasterFillStrategy, ContourParallelStrategy,
    # Orientation rules
    to_normal, fixed, lead, lag, side_tilt, blend, avoid_collision,
    # Kinematics
    Machine, Linear, Rotary,
    # Post-processing
    PostProcessor, PostConfig,
    # Simulation
    CollisionChecker,
    # Integration
    EngineWrapper,
)
```

## Modules

| Module | Description |
|--------|-------------|
| [core.primitives](primitives.md) | `Vector3`, `Position`, `Orientation`, `Frame`, `Variable` |
| [core.toolpath](toolpath.md) | `ToolpathPoint`, `Toolpath`, `ToolpathCollection` |
| [core.geometry](geometry.md) | `Curve`, `Surface`, `GeometryModel` |
| [orient.rules](orient.md) | `to_normal`, `fixed`, `lead`, `lag`, `side_tilt`, `blend`, `avoid_collision` |
| [strategies](strategies.md) | `FollowCurveStrategy`, `RasterFillStrategy`, `ContourParallelStrategy` |
| [kinematics.machine](machine.md) | `Machine`, `Linear`, `Rotary`, `KinematicChain` |
| [post.processor](post.md) | `PostProcessor`, `PostConfig` |
