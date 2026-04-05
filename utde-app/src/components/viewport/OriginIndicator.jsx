import { useMemo } from "react";
import * as THREE from "three";

/**
 * A permanent XYZ axis indicator at world origin (0, 0, 0).
 * X = red, Y = green, Z = accent purple.
 * Arrow length scales with `size` (default 30 mm).
 */
export default function OriginIndicator({ size = 30 }) {
  const arrows = useMemo(() => {
    const headLen = size * 0.18;
    const headWidth = size * 0.08;
    return [
      new THREE.ArrowHelper(new THREE.Vector3(1, 0, 0), new THREE.Vector3(0, 0, 0), size, 0xe53535, headLen, headWidth),
      new THREE.ArrowHelper(new THREE.Vector3(0, 1, 0), new THREE.Vector3(0, 0, 0), size, 0x16a34a, headLen, headWidth),
      new THREE.ArrowHelper(new THREE.Vector3(0, 0, 1), new THREE.Vector3(0, 0, 0), size, 0x6355e0, headLen, headWidth),
    ];
  }, [size]);

  return (
    <group>
      {/* Origin sphere */}
      <mesh>
        <sphereGeometry args={[size * 0.05, 10, 10]} />
        <meshBasicMaterial color="#1a1a2e" />
      </mesh>
      {arrows.map((arrow, i) => (
        <primitive key={i} object={arrow} />
      ))}
    </group>
  );
}
