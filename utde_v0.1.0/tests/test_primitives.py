"""Tests for core primitive types: Vector3, Position, Orientation, Frame, Variable."""

import math
import pytest
import numpy as np

from toolpath_engine.core.primitives import Vector3, Position, Orientation, Frame, Variable


# ── Vector3 ──────────────────────────────────────────────────────────────────


class TestVector3:
    def test_default_construction(self):
        v = Vector3()
        assert v.x == 0.0 and v.y == 0.0 and v.z == 0.0

    def test_from_array(self):
        v = Vector3.from_array([1.0, 2.0, 3.0])
        assert v.x == 1.0 and v.y == 2.0 and v.z == 3.0

    def test_from_tuple(self):
        v = Vector3.from_tuple((4.0, 5.0, 6.0))
        assert v.x == 4.0 and v.y == 5.0 and v.z == 6.0

    def test_to_array(self):
        v = Vector3(1.0, 2.0, 3.0)
        arr = v.to_array()
        assert isinstance(arr, np.ndarray)
        np.testing.assert_array_equal(arr, [1.0, 2.0, 3.0])

    def test_add(self):
        a = Vector3(1, 2, 3)
        b = Vector3(4, 5, 6)
        c = a + b
        assert c.x == 5 and c.y == 7 and c.z == 9

    def test_sub(self):
        a = Vector3(4, 5, 6)
        b = Vector3(1, 2, 3)
        c = a - b
        assert c.x == 3 and c.y == 3 and c.z == 3

    def test_mul_scalar(self):
        v = Vector3(1, 2, 3)
        r = v * 2
        assert r.x == 2 and r.y == 4 and r.z == 6

    def test_rmul_scalar(self):
        v = Vector3(1, 2, 3)
        r = 3 * v
        assert r.x == 3 and r.y == 6 and r.z == 9

    def test_neg(self):
        v = Vector3(1, -2, 3)
        n = -v
        assert n.x == -1 and n.y == 2 and n.z == -3

    def test_dot_product(self):
        a = Vector3(1, 0, 0)
        b = Vector3(0, 1, 0)
        assert a.dot(b) == 0.0
        assert a.dot(a) == 1.0

    def test_cross_product(self):
        x = Vector3(1, 0, 0)
        y = Vector3(0, 1, 0)
        z = x.cross(y)
        assert abs(z.x - 0.0) < 1e-10
        assert abs(z.y - 0.0) < 1e-10
        assert abs(z.z - 1.0) < 1e-10

    def test_length(self):
        v = Vector3(3, 4, 0)
        assert abs(v.length() - 5.0) < 1e-10

    def test_normalized(self):
        v = Vector3(3, 0, 0)
        n = v.normalized()
        assert abs(n.x - 1.0) < 1e-10
        assert n.y == 0.0 and n.z == 0.0

    def test_normalized_zero_vector(self):
        v = Vector3(0, 0, 0)
        n = v.normalized()
        assert n.x == 0 and n.y == 0 and n.z == 0

    def test_angle_to(self):
        x = Vector3(1, 0, 0)
        y = Vector3(0, 1, 0)
        assert abs(x.angle_to(y) - math.pi / 2) < 1e-10

        same = Vector3(1, 0, 0)
        assert abs(x.angle_to(same) - 0.0) < 1e-10

    def test_lerp(self):
        a = Vector3(0, 0, 0)
        b = Vector3(10, 0, 0)
        mid = a.lerp(b, 0.5)
        assert abs(mid.x - 5.0) < 1e-10

        assert a.lerp(b, 0).x == 0.0
        assert a.lerp(b, 1).x == 10.0

    def test_distance_to(self):
        a = Vector3(0, 0, 0)
        b = Vector3(3, 4, 0)
        assert abs(a.distance_to(b) - 5.0) < 1e-10

    def test_repr(self):
        v = Vector3(1.0, 2.0, 3.0)
        assert "Vector3" in repr(v)


# ── Position ──────────────────────────────────────────────────────────────────


class TestPosition:
    def test_default(self):
        p = Position()
        assert p.x == 0.0 and p.y == 0.0 and p.z == 0.0
        assert p.name is None

    def test_named(self):
        p = Position(1, 2, 3, name="home")
        assert p.name == "home"

    def test_vec_property(self):
        p = Position(1, 2, 3)
        v = p.vec
        assert isinstance(v, Vector3)
        assert v.x == 1 and v.y == 2 and v.z == 3

    def test_to_array(self):
        p = Position(1, 2, 3)
        arr = p.to_array()
        np.testing.assert_array_equal(arr, [1.0, 2.0, 3.0])

    def test_distance_to(self):
        a = Position(0, 0, 0)
        b = Position(3, 4, 0)
        assert abs(a.distance_to(b) - 5.0) < 1e-10


# ── Orientation ───────────────────────────────────────────────────────────────


class TestOrientation:
    def test_default_z_up(self):
        o = Orientation()
        assert o.i == 0.0 and o.j == 0.0 and o.k == 1.0

    def test_z_down(self):
        o = Orientation.z_down()
        assert o.k == -1.0
        assert o.name == "z_down"

    def test_z_up(self):
        o = Orientation.z_up()
        assert o.k == 1.0

    def test_from_vector(self):
        v = Vector3(3, 0, 0)
        o = Orientation.from_vector(v)
        assert abs(o.i - 1.0) < 1e-10
        assert abs(o.j) < 1e-10
        assert abs(o.k) < 1e-10

    def test_from_vector_normalizes(self):
        v = Vector3(0, 0, 5)
        o = Orientation.from_vector(v)
        assert abs(o.k - 1.0) < 1e-10

    def test_vec_property(self):
        o = Orientation(0, 0, -1)
        v = o.vec
        assert isinstance(v, Vector3)
        assert v.z == -1.0

    def test_to_array(self):
        o = Orientation(1, 0, 0)
        arr = o.to_array()
        np.testing.assert_array_equal(arr, [1.0, 0.0, 0.0])

    def test_angle_to(self):
        a = Orientation(1, 0, 0)
        b = Orientation(0, 1, 0)
        assert abs(a.angle_to(b) - math.pi / 2) < 1e-10


# ── Frame ─────────────────────────────────────────────────────────────────────


class TestFrame:
    def test_world_frame(self):
        f = Frame.world()
        assert f.name == "world"
        assert f.origin.x == 0 and f.origin.y == 0 and f.origin.z == 0

    def test_to_matrix_identity(self):
        f = Frame.world()
        m = f.to_matrix()
        np.testing.assert_array_almost_equal(m, np.eye(4))

    def test_transform_point_identity(self):
        f = Frame.world()
        p = Vector3(1, 2, 3)
        tp = f.transform_point(p)
        assert abs(tp.x - 1) < 1e-10
        assert abs(tp.y - 2) < 1e-10
        assert abs(tp.z - 3) < 1e-10

    def test_transform_point_translated(self):
        f = Frame(name="shifted", origin=Vector3(10, 0, 0))
        p = Vector3(0, 0, 0)
        tp = f.transform_point(p)
        assert abs(tp.x - 10) < 1e-10

    def test_from_origin_and_z(self):
        f = Frame.from_origin_and_z("test", (0, 0, 0), (0, 0, 1))
        assert abs(f.z_axis.z - 1.0) < 1e-10

    def test_inverse_matrix(self):
        f = Frame(name="test", origin=Vector3(5, 5, 5))
        m = f.to_matrix()
        inv = f.inverse_matrix()
        product = m @ inv
        np.testing.assert_array_almost_equal(product, np.eye(4))

    def test_transform_direction(self):
        f = Frame.world()
        d = Vector3(1, 0, 0)
        td = f.transform_direction(d)
        assert abs(td.x - 1) < 1e-10


# ── Variable ──────────────────────────────────────────────────────────────────


class TestVariable:
    def test_basic(self):
        v = Variable("speed", 1500.0, unit="mm/min")
        assert v.name == "speed"
        assert v.value == 1500.0
        assert v.unit == "mm/min"

    def test_float_conversion(self):
        v = Variable("x", 3.14)
        assert abs(float(v) - 3.14) < 1e-10

    def test_int_conversion(self):
        v = Variable("n", 42)
        assert int(v) == 42

    def test_bool_value(self):
        v = Variable("flag", True)
        assert v.value is True

    def test_string_value(self):
        v = Variable("mode", "rapid")
        assert v.value == "rapid"

    def test_repr(self):
        v = Variable("power", 500, unit="W")
        r = repr(v)
        assert "power" in r
        assert "500" in r
        assert "W" in r
