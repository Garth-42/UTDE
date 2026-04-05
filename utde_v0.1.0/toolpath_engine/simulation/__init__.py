"""
Simulation plugin interface.

All simulation capabilities — built-in and future — implement this
interface. The common contract allows the visualizer to display
results from any plugin uniformly.
"""

from __future__ import annotations

from abc import ABC, abstractmethod
from dataclasses import dataclass, field
from typing import Optional, Dict, List, Any

from ..core.primitives import Vector3
from ..core.toolpath import ToolpathPoint, Toolpath, ToolpathCollection
from ..kinematics.machine import Machine


@dataclass
class SimulationResult:
    """Container for simulation output."""
    success: bool = True
    messages: List[str] = field(default_factory=list)
    collisions: List[Dict[str, Any]] = field(default_factory=list)
    data: Dict[str, Any] = field(default_factory=dict)


class SimulationPlugin(ABC):
    """
    Base class for all simulation plugins.
    
    Implement setup(), step(), and results() to create a custom simulation.
    """

    def __init__(self, name: str = "simulation"):
        self.name = name

    @abstractmethod
    def setup(self, machine: Optional[Machine] = None, **kwargs):
        """Initialize with geometry/machine context."""
        pass

    @abstractmethod
    def step(self, point: ToolpathPoint, dt: float = 0.0) -> Optional[Dict]:
        """Process one toolpath sample point. Called sequentially."""
        pass

    @abstractmethod
    def results(self) -> SimulationResult:
        """Return simulation output after processing all points."""
        pass

    def run(self, collection: ToolpathCollection, **kwargs) -> SimulationResult:
        """Convenience: run simulation over an entire collection."""
        self.setup(**kwargs)
        for tp in collection.toolpaths:
            for i, point in enumerate(tp.points):
                dt = 0.0
                if i > 0 and point.feed_rate > 0:
                    dist = point.position.distance_to(tp.points[i - 1].position)
                    dt = (dist / point.feed_rate) * 60  # seconds
                self.step(point, dt)
        return self.results()


class CollisionChecker(SimulationPlugin):
    """
    Basic collision detection: checks tool orientation limits
    and joint limits at each point.
    
    A full implementation would check tool/holder mesh against
    workpiece/fixture geometry.
    """

    def __init__(self, max_tilt_deg: float = 90.0):
        super().__init__("collision_checker")
        self.max_tilt_deg = max_tilt_deg
        self._machine: Optional[Machine] = None
        self._collisions: List[Dict[str, Any]] = []
        self._point_count = 0

    def setup(self, machine: Optional[Machine] = None, **kwargs):
        self._machine = machine
        self._collisions = []
        self._point_count = 0

    def step(self, point: ToolpathPoint, dt: float = 0.0) -> Optional[Dict]:
        import math
        self._point_count += 1

        # Check tool tilt angle
        z_up = Vector3(0, 0, 1)
        tool_axis = point.orientation.vec
        angle_deg = math.degrees(tool_axis.angle_to(z_up))

        if angle_deg > self.max_tilt_deg:
            collision = {
                "type": "tilt_exceeded",
                "point_index": self._point_count - 1,
                "position": (point.position.x, point.position.y, point.position.z),
                "angle_deg": angle_deg,
                "limit_deg": self.max_tilt_deg,
            }
            self._collisions.append(collision)
            return collision

        # Check joint limits if machine is defined
        if self._machine:
            try:
                joint_values = self._machine.inverse_kinematics(
                    point.position, point.orientation
                )
                violations = self._machine.check_limits(joint_values)
                if violations:
                    collision = {
                        "type": "joint_limit",
                        "point_index": self._point_count - 1,
                        "violations": violations,
                    }
                    self._collisions.append(collision)
                    return collision
            except Exception:
                pass  # IK failure — handled elsewhere

        return None

    def results(self) -> SimulationResult:
        return SimulationResult(
            success=len(self._collisions) == 0,
            messages=[
                f"Checked {self._point_count} points, found {len(self._collisions)} issues"
            ],
            collisions=self._collisions,
        )
