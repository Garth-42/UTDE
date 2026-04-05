"""
Core primitive types for the toolpath design environment.

These are the atoms from which all processes are built.
Every part of the system - API, node graph, process files -
operates on these same types.
"""

from __future__ import annotations

import math
import json
from dataclasses import dataclass, field
from typing import Optional, Tuple, Union
import numpy as np


# --------------------------------------------------------------------------- #
#  Vector3 helper
# --------------------------------------------------------------------------- #

@dataclass
class Vector3:
    """A 3D vector / point."""
    x: float = 0.0
    y: float = 0.0
    z: float = 0.0

    # --- construction helpers ------------------------------------------------
    @classmethod
    def from_array(cls, arr) -> "Vector3":
        return cls(float(arr[0]), float(arr[1]), float(arr[2]))

    @classmethod
    def from_tuple(cls, t: Tuple[float, float, float]) -> "Vector3":
        return cls(t[0], t[1], t[2])

    # --- numpy interop -------------------------------------------------------
    def to_array(self) -> np.ndarray:
        return np.array([self.x, self.y, self.z], dtype=float)

    # --- arithmetic ----------------------------------------------------------
    def __add__(self, other: "Vector3") -> "Vector3":
        return Vector3(self.x + other.x, self.y + other.y, self.z + other.z)

    def __sub__(self, other: "Vector3") -> "Vector3":
        return Vector3(self.x - other.x, self.y - other.y, self.z - other.z)

    def __mul__(self, scalar: float) -> "Vector3":
        return Vector3(self.x * scalar, self.y * scalar, self.z * scalar)

    def __rmul__(self, scalar: float) -> "Vector3":
        return self.__mul__(scalar)

    def __neg__(self) -> "Vector3":
        return Vector3(-self.x, -self.y, -self.z)

    # --- vector operations ---------------------------------------------------
    def dot(self, other: "Vector3") -> float:
        return self.x * other.x + self.y * other.y + self.z * other.z

    def cross(self, other: "Vector3") -> "Vector3":
        return Vector3(
            self.y * other.z - self.z * other.y,
            self.z * other.x - self.x * other.z,
            self.x * other.y - self.y * other.x,
        )

    def length(self) -> float:
        return math.sqrt(self.x ** 2 + self.y ** 2 + self.z ** 2)

    def normalized(self) -> "Vector3":
        ln = self.length()
        if ln < 1e-12:
            return Vector3(0, 0, 0)
        return Vector3(self.x / ln, self.y / ln, self.z / ln)

    def angle_to(self, other: "Vector3") -> float:
        """Angle in radians between two vectors."""
        d = self.normalized().dot(other.normalized())
        d = max(-1.0, min(1.0, d))
        return math.acos(d)

    def lerp(self, other: "Vector3", t: float) -> "Vector3":
        """Linear interpolation."""
        return self * (1 - t) + other * t

    def distance_to(self, other: "Vector3") -> float:
        return (self - other).length()

    def __repr__(self):
        return f"Vector3({self.x:.4f}, {self.y:.4f}, {self.z:.4f})"


# --------------------------------------------------------------------------- #
#  Position
# --------------------------------------------------------------------------- #

@dataclass
class Position:
    """A named 3D point in a specified coordinate frame."""
    x: float = 0.0
    y: float = 0.0
    z: float = 0.0
    name: Optional[str] = None
    frame: Optional["Frame"] = None

    @property
    def vec(self) -> Vector3:
        return Vector3(self.x, self.y, self.z)

    def to_array(self) -> np.ndarray:
        return np.array([self.x, self.y, self.z], dtype=float)

    def distance_to(self, other: "Position") -> float:
        return self.vec.distance_to(other.vec)

    def __repr__(self):
        name_str = f" '{self.name}'" if self.name else ""
        return f"Position({self.x:.3f}, {self.y:.3f}, {self.z:.3f}{name_str})"


# --------------------------------------------------------------------------- #
#  Orientation
# --------------------------------------------------------------------------- #

@dataclass
class Orientation:
    """
    Tool axis direction, typically a unit vector (i, j, k).
    Convention: the vector points from tool tip toward the spindle.
    """
    i: float = 0.0
    j: float = 0.0
    k: float = 1.0  # default: tool pointing Z+
    name: Optional[str] = None

    @property
    def vec(self) -> Vector3:
        return Vector3(self.i, self.j, self.k)

    @classmethod
    def from_vector(cls, v: Vector3, name: Optional[str] = None) -> "Orientation":
        n = v.normalized()
        return cls(n.x, n.y, n.z, name=name)

    @classmethod
    def z_down(cls) -> "Orientation":
        """Standard 3-axis orientation: tool pointing -Z."""
        return cls(0.0, 0.0, -1.0, name="z_down")

    @classmethod
    def z_up(cls) -> "Orientation":
        return cls(0.0, 0.0, 1.0, name="z_up")

    def to_array(self) -> np.ndarray:
        return np.array([self.i, self.j, self.k], dtype=float)

    def angle_to(self, other: "Orientation") -> float:
        """Angle in radians between two orientations."""
        return self.vec.angle_to(other.vec)

    def __repr__(self):
        name_str = f" '{self.name}'" if self.name else ""
        return f"Orientation({self.i:.4f}, {self.j:.4f}, {self.k:.4f}{name_str})"


# --------------------------------------------------------------------------- #
#  Frame (coordinate system)
# --------------------------------------------------------------------------- #

@dataclass
class Frame:
    """
    A named coordinate system defined by an origin and three orthogonal axes.
    Used for workpiece, fixture, feature-local, and machine coordinate systems.
    """
    name: str = "world"
    origin: Vector3 = field(default_factory=lambda: Vector3(0, 0, 0))
    x_axis: Vector3 = field(default_factory=lambda: Vector3(1, 0, 0))
    y_axis: Vector3 = field(default_factory=lambda: Vector3(0, 1, 0))
    z_axis: Vector3 = field(default_factory=lambda: Vector3(0, 0, 1))

    @classmethod
    def world(cls) -> "Frame":
        return cls("world")

    @classmethod
    def from_origin_and_z(
        cls,
        name: str,
        origin: Tuple[float, float, float],
        z_axis: Tuple[float, float, float],
        x_hint: Tuple[float, float, float] = (1, 0, 0),
    ) -> "Frame":
        """Build a frame from an origin and Z direction, with an X hint."""
        o = Vector3(*origin)
        z = Vector3(*z_axis).normalized()
        xh = Vector3(*x_hint)
        # Gram-Schmidt to get orthogonal X and Y
        y = z.cross(xh).normalized()
        if y.length() < 1e-9:
            # x_hint parallel to z — pick an arbitrary perpendicular
            xh = Vector3(0, 1, 0) if abs(z.y) < 0.9 else Vector3(1, 0, 0)
            y = z.cross(xh).normalized()
        x = y.cross(z).normalized()
        return cls(name, o, x, y, z)

    def to_matrix(self) -> np.ndarray:
        """4x4 homogeneous transformation matrix (frame → world)."""
        m = np.eye(4)
        m[:3, 0] = self.x_axis.to_array()
        m[:3, 1] = self.y_axis.to_array()
        m[:3, 2] = self.z_axis.to_array()
        m[:3, 3] = self.origin.to_array()
        return m

    def inverse_matrix(self) -> np.ndarray:
        """4x4 matrix transforming world → frame."""
        return np.linalg.inv(self.to_matrix())

    def transform_point(self, point: Vector3) -> Vector3:
        """Transform a point from this frame to world coordinates."""
        m = self.to_matrix()
        p = np.array([point.x, point.y, point.z, 1.0])
        result = m @ p
        return Vector3(result[0], result[1], result[2])

    def transform_direction(self, direction: Vector3) -> Vector3:
        """Transform a direction vector from this frame to world."""
        m = self.to_matrix()
        d = np.array([direction.x, direction.y, direction.z, 0.0])
        result = m @ d
        return Vector3(result[0], result[1], result[2])

    def __repr__(self):
        return f"Frame('{self.name}', origin={self.origin})"


# --------------------------------------------------------------------------- #
#  Variable
# --------------------------------------------------------------------------- #

@dataclass
class Variable:
    """A named value usable in process logic."""
    name: str
    value: Union[float, int, str, bool]
    unit: Optional[str] = None
    description: Optional[str] = None

    def __float__(self):
        return float(self.value)

    def __int__(self):
        return int(self.value)

    def __repr__(self):
        unit_str = f" {self.unit}" if self.unit else ""
        return f"Variable('{self.name}' = {self.value}{unit_str})"
