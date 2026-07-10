import { useFrame } from "@react-three/fiber";
import { useRef } from "react";
import * as THREE from "three";

export function Water() {
  const ref = useRef<THREE.Mesh>(null);
  useFrame(({ clock }) => {
    if (ref.current) ref.current.position.y = -0.12 + Math.sin(clock.elapsedTime * 1.4) * 0.025;
  });
  return (
    <mesh ref={ref} rotation-x={-Math.PI / 2} position={[0, -0.14, 0]} receiveShadow>
      <planeGeometry args={[260, 260, 1, 1]} />
      <meshStandardMaterial color="#5db8e8" transparent opacity={0.58} roughness={0.25} metalness={0.05} />
    </mesh>
  );
}
