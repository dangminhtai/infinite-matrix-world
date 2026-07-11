import { useMemo, type RefObject } from "react";
import * as THREE from "three";

export function PlayerProceduralModel({
  leftLeg,
  rightLeg,
  leftArm,
  rightArm,
}: {
  leftLeg?: RefObject<THREE.Mesh>;
  rightLeg?: RefObject<THREE.Mesh>;
  leftArm?: RefObject<THREE.Mesh>;
  rightArm?: RefObject<THREE.Mesh>;
}) {
  const skinColor = useMemo(() => new THREE.Color("#f6d7b0"), []);

  return <group>
    <mesh position={[0, 0.8, 0]} castShadow>
      <capsuleGeometry args={[0.28, 0.5, 4, 8]} />
      <meshStandardMaterial color="#3d6fd9" roughness={0.75} />
    </mesh>
    <mesh position={[0, 1.35, 0]} castShadow>
      <sphereGeometry args={[0.24, 12, 10]} />
      <meshStandardMaterial color={skinColor} roughness={0.8} />
    </mesh>
    <mesh ref={leftArm} position={[-0.35, 0.86, 0]} castShadow>
      <boxGeometry args={[0.12, 0.5, 0.14]} />
      <meshStandardMaterial color="#3d6fd9" roughness={0.75} />
    </mesh>
    <mesh ref={rightArm} position={[0.35, 0.86, 0]} castShadow>
      <boxGeometry args={[0.12, 0.5, 0.14]} />
      <meshStandardMaterial color="#3d6fd9" roughness={0.75} />
    </mesh>
    <mesh ref={leftLeg} position={[-0.13, 0.28, 0]} castShadow>
      <boxGeometry args={[0.13, 0.55, 0.16]} />
      <meshStandardMaterial color="#26334d" />
    </mesh>
    <mesh ref={rightLeg} position={[0.13, 0.28, 0]} castShadow>
      <boxGeometry args={[0.13, 0.55, 0.16]} />
      <meshStandardMaterial color="#26334d" />
    </mesh>
  </group>;
}
