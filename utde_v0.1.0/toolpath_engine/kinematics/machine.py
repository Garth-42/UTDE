"""
User-defined machine kinematics.

Supports arbitrary kinematic chains with linear and rotary joints.
The user defines their machine as a chain of joints; the system provides
forward kinematics (auto-generated) and inverse kinematics (numerical
solver with optional analytical override).
"""

from __future__ import annotations

import math
import yaml
from dataclasses import dataclass, field
from typing import Optional, List, Dict, Tuple, Any
import numpy as np
from scipy.optimize import minimize

from ..core.primitives import Vector3, Orientation, Frame


@dataclass
class Joint:
    """Base class for kinematic joints."""
    name: str
    axis: Vector3 = field(default_factory=lambda: Vector3(0, 0, 1))
    limits: Optional[Tuple[float, float]] = None  # None = unlimited
    home: float = 0.0
    value: float = 0.0  # current joint value

    def transform_matrix(self) -> np.ndarray:
        """4x4 transform for current joint value."""
        raise NotImplementedError


@dataclass
class Linear(Joint):
    """A linear (prismatic) joint — translates along its axis."""

    def transform_matrix(self) -> np.ndarray:
        m = np.eye(4)
        a = self.axis.to_array()
        m[:3, 3] = a * self.value
        return m


@dataclass
class Rotary(Joint):
    """A rotary joint — rotates around its axis. Value in degrees."""

    def transform_matrix(self) -> np.ndarray:
        angle = math.radians(self.value)
        a = self.axis.normalized().to_array()
        c, s = math.cos(angle), math.sin(angle)
        t = 1 - c
        x, y, z = a

        m = np.eye(4)
        m[0, 0] = t * x * x + c
        m[0, 1] = t * x * y - s * z
        m[0, 2] = t * x * z + s * y
        m[1, 0] = t * x * y + s * z
        m[1, 1] = t * y * y + c
        m[1, 2] = t * y * z - s * x
        m[2, 0] = t * x * z - s * y
        m[2, 1] = t * y * z + s * x
        m[2, 2] = t * z * z + c
        return m


@dataclass
class Link:
    """A rigid link between joints, defined by a fixed transform."""
    offset: Vector3 = field(default_factory=Vector3)
    rotation: Optional[np.ndarray] = None  # 3x3 rotation matrix

    def transform_matrix(self) -> np.ndarray:
        m = np.eye(4)
        if self.rotation is not None:
            m[:3, :3] = self.rotation
        m[:3, 3] = self.offset.to_array()
        return m


class KinematicChain:
    """
    A chain of joints and links from base to end effector.
    """

    def __init__(self, name: str = "chain"):
        self.name = name
        self.joints: List[Joint] = []
        self.links: List[Link] = []  # link[i] is the fixed transform BEFORE joint[i]

    def add_joint(self, joint: Joint, link: Optional[Link] = None):
        if link is None:
            link = Link()
        self.links.append(link)
        self.joints.append(joint)

    def forward_kinematics(self, joint_values: Optional[List[float]] = None) -> np.ndarray:
        """
        Compute the 4x4 end-effector transform given joint values.
        If joint_values is None, uses current joint values.
        """
        if joint_values is not None:
            for j, val in zip(self.joints, joint_values):
                j.value = val

        m = np.eye(4)
        for link, joint in zip(self.links, self.joints):
            m = m @ link.transform_matrix() @ joint.transform_matrix()
        return m

    def get_joint_values(self) -> List[float]:
        return [j.value for j in self.joints]

    def set_joint_values(self, values: List[float]):
        for j, v in zip(self.joints, values):
            j.value = v

    def joint_names(self) -> List[str]:
        return [j.name for j in self.joints]


class Machine:
    """
    Complete machine definition with kinematics, tool offset, and configuration.
    
    Supports two kinematic chains: tool-side and workpiece-side.
    For simple machines (3-axis gantry), only the tool chain is needed.
    """

    def __init__(self, name: str = "machine"):
        self.name = name
        self.tool_chain = KinematicChain("tool")
        self.workpiece_chain = KinematicChain("workpiece")
        self.tool_offset = Vector3(0, 0, 0)
        self.config: Dict[str, Any] = {}

    def add_joint(self, joint: Joint, link: Optional[Link] = None, chain: str = "tool"):
        """Add a joint to the specified chain."""
        if chain == "tool":
            self.tool_chain.add_joint(joint, link)
        else:
            self.workpiece_chain.add_joint(joint, link)

    def set_tool_offset(self, x: float = 0, y: float = 0, z: float = 0):
        self.tool_offset = Vector3(x, y, z)

    def forward_kinematics(self, joint_values: Optional[Dict[str, float]] = None) -> Tuple[Vector3, Vector3]:
        """
        Compute tool tip position and tool axis direction.
        Returns (position, tool_axis) in world coordinates.
        """
        if joint_values:
            tool_vals = [joint_values.get(j.name, j.value) for j in self.tool_chain.joints]
            wp_vals = [joint_values.get(j.name, j.value) for j in self.workpiece_chain.joints]
        else:
            tool_vals = None
            wp_vals = None

        # Tool chain: base → tool tip
        tool_m = self.tool_chain.forward_kinematics(tool_vals)

        # Apply tool offset
        offset_m = np.eye(4)
        offset_m[:3, 3] = self.tool_offset.to_array()
        tool_m = tool_m @ offset_m

        # Workpiece chain: base → workpiece (inverted, since we want world → workpiece)
        if self.workpiece_chain.joints:
            wp_m = self.workpiece_chain.forward_kinematics(wp_vals)
            # Tool tip in workpiece frame
            wp_inv = np.linalg.inv(wp_m)
            final_m = wp_inv @ tool_m
        else:
            final_m = tool_m

        position = Vector3.from_array(final_m[:3, 3])
        tool_axis = Vector3.from_array(final_m[:3, 2])  # Z axis of tool frame

        return position, tool_axis

    def inverse_kinematics(
        self,
        target_pos: Vector3,
        target_orient: Orientation,
        initial_guess: Optional[Dict[str, float]] = None,
    ) -> Dict[str, float]:
        """
        Numerical IK solver: find joint values that place the tool tip
        at target_pos with tool axis along target_orient.
        
        Uses scipy.optimize.minimize with joint limit constraints.
        """
        all_joints = self.tool_chain.joints + self.workpiece_chain.joints
        n = len(all_joints)

        if n == 0:
            return {}

        # Initial guess
        x0 = np.zeros(n)
        if initial_guess:
            for i, j in enumerate(all_joints):
                x0[i] = initial_guess.get(j.name, j.home)
        else:
            x0 = np.array([j.home for j in all_joints])

        target_p = target_pos.to_array()
        target_d = target_orient.to_array()

        def objective(x):
            # Set joint values
            jv = {}
            for i, j in enumerate(all_joints):
                jv[j.name] = x[i]
            pos, axis = self.forward_kinematics(jv)
            pos_err = np.linalg.norm(pos.to_array() - target_p)
            dir_err = np.linalg.norm(axis.normalized().to_array() - target_d)
            return pos_err ** 2 + (dir_err * 100) ** 2  # weight orientation

        # Bounds from joint limits
        bounds = []
        for j in all_joints:
            if j.limits:
                bounds.append(j.limits)
            elif isinstance(j, Rotary):
                bounds.append((-360, 360))
            else:
                bounds.append((-10000, 10000))

        result = minimize(objective, x0, method="L-BFGS-B", bounds=bounds,
                          options={"maxiter": 500, "ftol": 1e-12})

        solution = {}
        for i, j in enumerate(all_joints):
            solution[j.name] = result.x[i]
        return solution

    def check_limits(self, joint_values: Dict[str, float]) -> List[str]:
        """Check if joint values are within limits. Returns list of violations."""
        violations = []
        all_joints = self.tool_chain.joints + self.workpiece_chain.joints
        for j in all_joints:
            if j.name in joint_values and j.limits:
                val = joint_values[j.name]
                if val < j.limits[0] or val > j.limits[1]:
                    violations.append(
                        f"{j.name}: {val:.3f} outside [{j.limits[0]}, {j.limits[1]}]"
                    )
        return violations

    # --- serialization -------------------------------------------------------
    def to_dict(self) -> Dict:
        """Serialize machine to a dictionary (for YAML export)."""
        def joint_to_dict(j):
            d = {
                "name": j.name,
                "type": "linear" if isinstance(j, Linear) else "rotary",
                "axis": [j.axis.x, j.axis.y, j.axis.z],
                "home": j.home,
            }
            if j.limits:
                d["limits"] = list(j.limits)
            return d

        return {
            "name": self.name,
            "tool_chain": [joint_to_dict(j) for j in self.tool_chain.joints],
            "workpiece_chain": [joint_to_dict(j) for j in self.workpiece_chain.joints],
            "tool_offset": [self.tool_offset.x, self.tool_offset.y, self.tool_offset.z],
            "config": self.config,
        }

    def to_yaml(self) -> str:
        return yaml.dump(self.to_dict(), default_flow_style=False, sort_keys=False)

    @classmethod
    def from_dict(cls, data: Dict) -> "Machine":
        m = cls(data.get("name", "machine"))

        for jd in data.get("tool_chain", []):
            JointCls = Linear if jd["type"] == "linear" else Rotary
            j = JointCls(
                name=jd["name"],
                axis=Vector3(*jd["axis"]),
                limits=tuple(jd["limits"]) if "limits" in jd else None,
                home=jd.get("home", 0),
            )
            m.add_joint(j, chain="tool")

        for jd in data.get("workpiece_chain", []):
            JointCls = Linear if jd["type"] == "linear" else Rotary
            j = JointCls(
                name=jd["name"],
                axis=Vector3(*jd["axis"]),
                limits=tuple(jd["limits"]) if "limits" in jd else None,
                home=jd.get("home", 0),
            )
            m.add_joint(j, chain="workpiece")

        if "tool_offset" in data:
            m.set_tool_offset(*data["tool_offset"])

        m.config = data.get("config", {})
        return m

    @classmethod
    def from_yaml(cls, yaml_str: str) -> "Machine":
        data = yaml.safe_load(yaml_str)
        return cls.from_dict(data)

    # --- common machine presets ----------------------------------------------
    @classmethod
    def cartesian_3axis(cls, name="3axis_gantry", travel=(500, 500, 400)) -> "Machine":
        """Standard XYZ cartesian gantry."""
        m = cls(name)
        m.add_joint(Linear("X", Vector3(1, 0, 0), limits=(0, travel[0])))
        m.add_joint(Linear("Y", Vector3(0, 1, 0), limits=(0, travel[1])))
        m.add_joint(Linear("Z", Vector3(0, 0, 1), limits=(0, travel[2])))
        return m

    @classmethod
    def gantry_5axis_ac(cls, name="5axis_AC", travel=(500, 500, 400),
                        a_limits=(-120, 120)) -> "Machine":
        """5-axis gantry with AC rotary table."""
        m = cls(name)
        # Gantry (tool side)
        m.add_joint(Linear("X", Vector3(1, 0, 0), limits=(0, travel[0])))
        m.add_joint(Linear("Y", Vector3(0, 1, 0), limits=(0, travel[1])))
        m.add_joint(Linear("Z", Vector3(0, 0, 1), limits=(0, travel[2])))
        # Rotary table (workpiece side)
        m.add_joint(Rotary("A", Vector3(1, 0, 0), limits=a_limits), chain="workpiece")
        m.add_joint(Rotary("C", Vector3(0, 0, 1), limits=None), chain="workpiece")
        return m

    @classmethod
    def gantry_5axis_bc(cls, name="5axis_BC", travel=(500, 500, 400),
                        b_limits=(-120, 120)) -> "Machine":
        """5-axis gantry with BC rotary table."""
        m = cls(name)
        m.add_joint(Linear("X", Vector3(1, 0, 0), limits=(0, travel[0])))
        m.add_joint(Linear("Y", Vector3(0, 1, 0), limits=(0, travel[1])))
        m.add_joint(Linear("Z", Vector3(0, 0, 1), limits=(0, travel[2])))
        m.add_joint(Rotary("B", Vector3(0, 1, 0), limits=b_limits), chain="workpiece")
        m.add_joint(Rotary("C", Vector3(0, 0, 1), limits=None), chain="workpiece")
        return m

    def __repr__(self):
        tool_joints = ", ".join(j.name for j in self.tool_chain.joints)
        wp_joints = ", ".join(j.name for j in self.workpiece_chain.joints)
        return f"Machine('{self.name}', tool=[{tool_joints}], workpiece=[{wp_joints}])"
