import { useFrame } from "@react-three/fiber";
import { useMemo, useRef, type MutableRefObject } from "react";
import * as THREE from "three";
import type { GameState } from "../GameCanvas";

export function Player({ state, debugCollision }: { state: MutableRefObject<GameState>; debugCollision: boolean }) {
  const group = useRef<THREE.Group>(null);
  const leftLeg = useRef<THREE.Mesh>(null);
  const rightLeg = useRef<THREE.Mesh>(null);
  const color = useMemo(() => new THREE.Color("#f6d7b0"), []);
  useFrame(({ clock }) => {
    if (group.current) {
      group.current.position.set(state.current.localX, state.current.height, state.current.localZ);
      group.current.rotation.y = state.current.yaw;
    }
    const moving = state.current.movementState === "walk" || state.current.movementState === "run";
    const frequency = state.current.movementState === "run" ? 12 : 8;
    const speed = moving ? Math.sin(clock.elapsedTime * frequency) * 0.35 : 0;
    if (leftLeg.current) leftLeg.current.rotation.x = speed;
    if (rightLeg.current) rightLeg.current.rotation.x = -speed;
  });
  return (
    <group ref={group} position={[state.current.localX, state.current.height, state.current.localZ]} rotation-y={state.current.yaw}>
      <mesh position={[0, 0.8, 0]} castShadow>
        <capsuleGeometry args={[0.28, 0.5, 4, 8]} />
        <meshStandardMaterial color="#3d6fd9" roughness={0.75} />
      </mesh>
      <mesh position={[0, 1.35, 0]} castShadow>
        <sphereGeometry args={[0.24, 12, 10]} />
        <meshStandardMaterial color={color} roughness={0.8} />
      </mesh>
      <mesh ref={leftLeg} position={[-0.13, 0.28, 0]} castShadow>
        <boxGeometry args={[0.13, 0.55, 0.16]} />
        <meshStandardMaterial color="#26334d" />
      </mesh>
      <mesh ref={rightLeg} position={[0.13, 0.28, 0]} castShadow>
        <boxGeometry args={[0.13, 0.55, 0.16]} />
        <meshStandardMaterial color="#26334d" />
      </mesh>
      {debugCollision && <mesh rotation-x={-Math.PI / 2} position={[0, 0.035, 0]}>
        <ringGeometry args={[0.3, 0.36, 24]} />
        <meshBasicMaterial color="#ff4d5e" depthTest={false} />
      </mesh>}
    </group>
  );
}
