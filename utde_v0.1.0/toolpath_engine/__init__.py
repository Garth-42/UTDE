"""
Universal Toolpath Design Environment
======================================

A process-agnostic, programmable platform for multi-axis toolpath
generation, simulation, and G-code export.

Core design principle: The app does not know about processes.
It provides primitives that let users define any process.
"""

__version__ = "0.1.0"

from .core.primitives import (
    Position,
    Orientation,
    Frame,
    Variable,
)
from .core.toolpath import ToolpathPoint, Toolpath, ToolpathCollection
from .core.geometry import Surface, Curve, GeometryModel
from .orient.rules import (
    to_normal,
    fixed,
    lead,
    lag,
    side_tilt,
    blend,
    avoid_collision,
)
from .strategies.base import ToolpathStrategy
from .strategies.follow_curve import FollowCurveStrategy
from .strategies.raster_fill import RasterFillStrategy
from .strategies.contour_parallel import ContourParallelStrategy
from .kinematics.machine import Machine, Joint, Linear, Rotary
from .post.processor import PostProcessor
from .integration.wrapper import EngineWrapper
from .process import process, get_process, list_processes
from .simulation import SimulationPlugin, CollisionChecker, SimulationResult

__all__ = [
    "Position", "Orientation", "Frame", "Variable",
    "ToolpathPoint", "Toolpath", "ToolpathCollection",
    "Surface", "Curve", "GeometryModel",
    "to_normal", "fixed", "lead", "lag", "side_tilt", "blend", "avoid_collision",
    "ToolpathStrategy",
    "FollowCurveStrategy", "RasterFillStrategy", "ContourParallelStrategy",
    "Machine", "Joint", "Linear", "Rotary",
    "PostProcessor",
    "EngineWrapper",
    "process", "get_process", "list_processes",
    "SimulationPlugin", "CollisionChecker", "SimulationResult",
]
