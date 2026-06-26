/**
 * Rigid-transform helpers for the workpiece (re-orient / translate the imported
 * geometry). A transform is stored as { translation: [x,y,z], quaternion:
 * [x,y,z,w] } and applied both to the rendered geometry group and to the
 * faces/edges JSON sent to the toolpath engine — so generated toolpaths follow
 * the new pose automatically (geometry and toolpaths share one coordinate space).
 */

import * as THREE from "three";

export const IDENTITY_TRANSFORM = { translation: [0, 0, 0], quaternion: [0, 0, 0, 1] };

export function isIdentity(t) {
  if (!t) return true;
  const [tx, ty, tz] = t.translation || [0, 0, 0];
  const [qx, qy, qz, qw] = t.quaternion || [0, 0, 0, 1];
  return (
    tx === 0 && ty === 0 && tz === 0 &&
    qx === 0 && qy === 0 && qz === 0 && Math.abs(qw - 1) < 1e-12
  );
}

export function toMatrix4(t) {
  return new THREE.Matrix4().compose(
    new THREE.Vector3(...(t?.translation || [0, 0, 0])),
    new THREE.Quaternion(...(t?.quaternion || [0, 0, 0, 1])),
    new THREE.Vector3(1, 1, 1)
  );
}

export function fromMatrix4(m) {
  const pos = new THREE.Vector3();
  const quat = new THREE.Quaternion();
  const scale = new THREE.Vector3();
  m.decompose(pos, quat, scale);
  return {
    translation: [pos.x, pos.y, pos.z],
    quaternion: [quat.x, quat.y, quat.z, quat.w],
  };
}

/** Apply a transform to a single [x,y,z] point. */
export function transformPoint(t, p) {
  const v = new THREE.Vector3(p[0], p[1], p[2]).applyMatrix4(toMatrix4(t));
  return [v.x, v.y, v.z];
}

/**
 * Transform that lays a planar face flat on the bed, face-down: rotate its
 * normal to (0,0,-1) and translate so the face centroid lands at the world
 * origin (on Z=0). Returns identity if the face lacks a normal/centroid.
 */
export function alignFaceToBedMatrix(face) {
  const n = face?.params?.normal;
  const c = face?.centroid;
  if (!n || !c) return IDENTITY_TRANSFORM;
  const normal = new THREE.Vector3(n[0], n[1], n[2]).normalize();
  const quat = new THREE.Quaternion().setFromUnitVectors(
    normal,
    new THREE.Vector3(0, 0, -1)
  );
  const rc = new THREE.Vector3(c[0], c[1], c[2]).applyQuaternion(quat);
  return {
    translation: [-rc.x, -rc.y, -rc.z],
    quaternion: [quat.x, quat.y, quat.z, quat.w],
  };
}

/** Lowest Z of all face vertices after applying `transform`. */
export function lowestZ(faces, transform) {
  const m = toMatrix4(transform);
  const v = new THREE.Vector3();
  let min = Infinity;
  for (const f of faces || []) {
    const verts = f.vertices || [];
    for (let i = 0; i < verts.length; i += 3) {
      v.set(verts[i], verts[i + 1], verts[i + 2]).applyMatrix4(m);
      if (v.z < min) min = v.z;
    }
  }
  return min === Infinity ? 0 : min;
}

/** Compose a rotation about world Z (degrees) through `about`, after `transform`. */
export function composeRotateZ(transform, deg, about = [0, 0, 0]) {
  const cur = toMatrix4(transform);
  const T1 = new THREE.Matrix4().makeTranslation(about[0], about[1], about[2]);
  const R = new THREE.Matrix4().makeRotationZ((deg * Math.PI) / 180);
  const T0 = new THREE.Matrix4().makeTranslation(-about[0], -about[1], -about[2]);
  const m = new THREE.Matrix4().multiplyMatrices(T1, R).multiply(T0).multiply(cur);
  return fromMatrix4(m);
}

/**
 * Apply a transform to parsed geometry, returning new faces/edges arrays.
 * Points (vertices, centroid, params positions, inner_loops) get the full
 * transform; directions (normal, axis, direction) get rotation only; scalars
 * (radius, length, height) are invariant. Returns the originals when identity.
 */
export function applyTransformToGeometry(faces, edges, transform) {
  if (isIdentity(transform)) return { faces, edges };
  const m = toMatrix4(transform);
  const nm = new THREE.Matrix3().getNormalMatrix(m);
  const _v = new THREE.Vector3();

  const tp = (p) => {
    _v.set(p[0], p[1], p[2]).applyMatrix4(m);
    return [_v.x, _v.y, _v.z];
  };
  const td = (d) => {
    _v.set(d[0], d[1], d[2]).applyMatrix3(nm).normalize();
    return [_v.x, _v.y, _v.z];
  };
  const tFlat = (arr) => {
    if (!arr) return arr;
    const out = new Array(arr.length);
    for (let i = 0; i < arr.length; i += 3) {
      _v.set(arr[i], arr[i + 1], arr[i + 2]).applyMatrix4(m);
      out[i] = _v.x; out[i + 1] = _v.y; out[i + 2] = _v.z;
    }
    return out;
  };

  const tParams = (params) => {
    const p = params ? { ...params } : {};
    for (const k of ["origin", "center", "apex", "start", "end"]) {
      if (Array.isArray(p[k])) p[k] = tp(p[k]);
    }
    for (const k of ["normal", "axis", "direction"]) {
      if (Array.isArray(p[k])) p[k] = td(p[k]);
    }
    return p;
  };

  const tFace = (f) => {
    const rec = { ...f, params: tParams(f.params) };
    if (f.vertices) rec.vertices = tFlat(f.vertices);
    if (f.centroid) rec.centroid = tp(f.centroid);
    if (f.inner_loops) rec.inner_loops = f.inner_loops.map((loop) => loop.map(tp));
    return rec; // indices unchanged
  };
  const tEdge = (e) => {
    const rec = { ...e, params: tParams(e.params) };
    if (e.vertices) rec.vertices = tFlat(e.vertices);
    if (e.centroid) rec.centroid = tp(e.centroid);
    return rec;
  };

  return { faces: (faces || []).map(tFace), edges: (edges || []).map(tEdge) };
}
