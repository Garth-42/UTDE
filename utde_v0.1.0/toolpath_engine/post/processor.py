"""
Post-processor: converts toolpath data into machine-specific G-code.

The post-processor takes a ToolpathCollection and a Machine definition,
resolves inverse kinematics, and formats the output for a specific
controller dialect.
"""

from __future__ import annotations

import math
from dataclasses import dataclass, field
from typing import Optional, Dict, List, Any, Callable
from io import StringIO

from ..core.primitives import Vector3, Orientation
from ..core.toolpath import ToolpathPoint, Toolpath, ToolpathCollection
from ..kinematics.machine import Machine


@dataclass
class PostConfig:
    """Configuration for G-code output format."""
    # General
    program_number: int = 1000
    use_line_numbers: bool = False
    line_number_start: int = 10
    line_number_increment: int = 10

    # Formatting
    decimal_places_linear: int = 3
    decimal_places_rotary: int = 3
    decimal_places_feed: int = 0
    axis_names: Dict[str, str] = field(default_factory=lambda: {
        "X": "X", "Y": "Y", "Z": "Z", "A": "A", "B": "B", "C": "C"
    })

    # Motion
    rapid_code: str = "G0"
    linear_code: str = "G1"
    use_incremental: bool = False
    output_ijk: bool = False  # Output IJK tool vector instead of rotary axes

    # Units and coordinates
    units: str = "metric"  # "metric" or "imperial"
    units_code: str = "G21"  # G21=mm, G20=inch

    # TCP (Tool Center Point) control
    tcp_on_code: str = "G43.4 H1"
    tcp_off_code: str = "G49"
    use_tcp: bool = True

    # Safe start block
    safe_start: List[str] = field(default_factory=lambda: [
        "G90",      # Absolute mode
        "G21",      # Metric
        "G17",      # XY plane
        "G40",      # Cancel cutter compensation
    ])

    # Program end
    program_end: List[str] = field(default_factory=lambda: [
        "M5",       # Spindle off
        "G49",      # Cancel TCP
        "G28 G91 Z0",  # Return to Z home
        "M30",      # Program end
    ])

    # Value words: process-param key -> G-code letter, emitted as <letter><value>
    # (e.g. spindle_speed -> S3000). Booleans are NOT valid here — a bool is a
    # subclass of int in Python, so formatting one through "<letter><value>"
    # produced corrupt codes (M3 + True -> "M31", M3 + False -> "M30" = program
    # end mid-program). Standalone on/off codes belong in flag_codes below.
    param_codes: Dict[str, str] = field(default_factory=lambda: {
        "spindle_speed": "S",
        "laser_power": "S",
        "extrusion_rate": "E",
    })

    # Standalone flag codes: process-param key -> a complete G-code word emitted
    # verbatim when the param is truthy (e.g. spindle_on_cw -> "M3"). Kept
    # separate from param_codes because these are whole codes, not letter+value.
    flag_codes: Dict[str, str] = field(default_factory=lambda: {
        "spindle_on_cw":  "M3",
        "spindle_on_ccw": "M4",
        "coolant_on":     "M8",
        "coolant_off":    "M9",
    })


class PostProcessor:
    """
    Generates G-code from toolpath data using machine kinematics.
    
    Usage:
        machine = Machine.gantry_5axis_ac()
        post = PostProcessor(machine)
        gcode = post.process(toolpath_collection)
    """

    def __init__(self, machine: Machine, config: Optional[PostConfig] = None):
        self.machine = machine
        self.config = config or PostConfig()
        self._prev_values: Dict[str, float] = {}
        self._line_number = self.config.line_number_start
        # Last inverse-kinematics solution, used to warm-start the next point so
        # adjacent points stay on a continuous branch (no ±360° rotary winding).
        self._prev_joint_solution: Optional[Dict[str, float]] = None

    def process(self, collection: ToolpathCollection, resolve_ik: bool = True) -> str:
        """
        Generate a complete G-code program from a ToolpathCollection.

        If resolve_ik is True, runs inverse kinematics at each point.
        If False, expects joint values in point.process_params.

        This wraps :meth:`process_body` in one program header/footer. To
        concatenate several collections into a single program (e.g. a timeline
        of ops), emit one ``program_header`` / ``program_footer`` yourself and
        call ``process_body`` per collection so the program ends exactly once.
        """
        return (
            self.program_header(collection)
            + self.process_body(collection, resolve_ik)
            + self.program_footer()
        )

    def program_header(self, collection: ToolpathCollection) -> str:
        """The program header (comments, ``%``, program number, safe start, TCP)."""
        out = StringIO()
        self._write_header(out, collection)
        return out.getvalue()

    def program_footer(self) -> str:
        """The program footer (spindle off, TCP cancel, home, ``M30``, ``%``)."""
        out = StringIO()
        self._write_footer(out)
        return out.getvalue()

    def process_body(
        self,
        collection: ToolpathCollection,
        resolve_ik: bool = True,
        point_lines: Optional[List[int]] = None,
    ) -> str:
        """Motion lines for a collection with **no** program header/footer.

        Use this (not :meth:`process`) when stitching multiple collections into
        one program, so the header/footer appear exactly once for the whole
        program instead of once per collection.

        If ``point_lines`` is provided, one entry is appended per point (in
        ``collection.all_points()`` order): the 0-based index — within the string
        this call returns — of the line that point produced, or the most recent
        line for a modally-suppressed point (-1 if none yet). This gives the UI
        an exact point<->line map instead of re-deriving it from the text.
        """
        lines: List[str] = []
        for tp in collection.toolpaths:
            lines.append("")
            lines.append(f"( Toolpath: {tp.name} )")
            # Reset modal + IK-seed state at each toolpath boundary: a new
            # toolpath may start far from the previous one, so re-emit full
            # coordinates and don't seed IK across the discontinuity.
            self._prev_values = {}
            self._prev_joint_solution = None
            last_line = -1
            for point in tp.points:
                gline = self._process_point(point, resolve_ik)
                if gline:
                    if self.config.use_line_numbers:
                        lines.append(f"N{self._line_number} {gline}")
                        self._line_number += self.config.line_number_increment
                    else:
                        lines.append(gline)
                    last_line = len(lines) - 1
                if point_lines is not None:
                    point_lines.append(last_line)
        return "\n".join(lines) + "\n"

    def _write_header(self, out: StringIO, collection: ToolpathCollection):
        out.write(f"( Generated by Universal Toolpath Design Environment )\n")
        out.write(f"( Machine: {self.machine.name} )\n")
        out.write(f"( Toolpath: {collection.name} )\n")
        out.write(f"( Points: {collection.total_points()}, Length: {collection.total_length():.1f}mm )\n")
        out.write(f"%\n")
        out.write(f"O{self.config.program_number}\n")

        # Safe start block
        for code in self.config.safe_start:
            out.write(f"{code}\n")

        # TCP mode
        if self.config.use_tcp and self._has_rotary_axes():
            out.write(f"{self.config.tcp_on_code}\n")

        out.write("\n")

    def _write_footer(self, out: StringIO):
        out.write("\n")
        for code in self.config.program_end:
            out.write(f"{code}\n")
        out.write("%\n")

    def _process_point(self, point: ToolpathPoint, resolve_ik: bool) -> str:
        """Generate a single G-code line for a toolpath point."""

        if resolve_ik and self._has_rotary_axes():
            # Solve IK to get joint values, warm-started from the previous
            # point's solution so the rotary axes stay on a continuous branch
            # (a cold solve per point can wind ±360° or flip between points).
            joint_values = self.machine.inverse_kinematics(
                point.position, point.orientation,
                initial_guess=self._prev_joint_solution,
            )
            self._prev_joint_solution = joint_values
        else:
            # For 3-axis or pre-solved: use position directly
            joint_values = {
                "X": point.position.x,
                "Y": point.position.y,
                "Z": point.position.z,
            }
            # Add any rotary values from process params
            for key in ["A", "B", "C"]:
                if key in point.process_params:
                    joint_values[key] = point.process_params[key]

        # Build G-code line
        motion = self.config.rapid_code if point.rapid else self.config.linear_code
        parts = [motion]

        # Axis values
        dp_lin = self.config.decimal_places_linear
        dp_rot = self.config.decimal_places_rotary

        for joint_name, value in joint_values.items():
            axis_letter = self.config.axis_names.get(joint_name, joint_name)
            is_rotary = joint_name in ("A", "B", "C")
            dp = dp_rot if is_rotary else dp_lin

            # Only output changed values (modal suppression)
            prev = self._prev_values.get(joint_name)
            if prev is not None and abs(value - prev) < 10 ** (-dp - 1):
                continue

            parts.append(f"{axis_letter}{value:.{dp}f}")
            self._prev_values[joint_name] = value

        # Tool-orientation vector (I/J/K), TCP / G43.4 style. This is how a
        # multi-axis tool axis reaches the G-code when we don't resolve IK to
        # rotary words — without it, orientation computed by the strategy/orient
        # chain is silently dropped and the output is effectively 3-axis.
        if self.config.output_ijk and not point.rapid and point.orientation is not None:
            o = point.orientation
            for letter, comp in (("I", o.i), ("J", o.j), ("K", o.k)):
                prev = self._prev_values.get(letter)
                if prev is not None and abs(comp - prev) < 10 ** (-dp_lin - 1):
                    continue
                parts.append(f"{letter}{comp:.{dp_lin}f}")
                self._prev_values[letter] = comp

        # Feed rate (not on rapids)
        if not point.rapid and point.feed_rate > 0:
            dp_f = self.config.decimal_places_feed
            prev_f = self._prev_values.get("F")
            if prev_f is None or abs(point.feed_rate - prev_f) > 0.1:
                parts.append(f"F{point.feed_rate:.{dp_f}f}")
                self._prev_values["F"] = point.feed_rate

        # Value words (S, E, …): emit <letter><value>. Guard against bool
        # explicitly — bool is a subclass of int, so a flag left here would be
        # formatted as a number (M3 + True -> "M31"). Flags belong in flag_codes.
        for param_key, gcode_letter in self.config.param_codes.items():
            if param_key in point.process_params:
                val = point.process_params[param_key]
                if isinstance(val, bool):
                    continue
                if isinstance(val, (int, float)):
                    parts.append(f"{gcode_letter}{val:.0f}")
                elif isinstance(val, str):
                    parts.append(val)

        # Standalone flag codes (M3/M4/M8/M9): emit the whole code when truthy.
        for param_key, gcode_word in self.config.flag_codes.items():
            if point.process_params.get(param_key):
                parts.append(gcode_word)

        # If only the motion code, nothing changed — skip
        if len(parts) <= 1:
            return ""

        return " ".join(parts)

    def _has_rotary_axes(self) -> bool:
        """Check if machine has any rotary joints."""
        return self.machine.has_rotary_axes()

    # --- convenience ---------------------------------------------------------
    def save(self, collection: ToolpathCollection, filepath: str, **kwargs):
        """Generate and save G-code to a file."""
        gcode = self.process(collection, **kwargs)
        with open(filepath, "w") as f:
            f.write(gcode)
        return filepath
