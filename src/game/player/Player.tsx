import { useFrame } from "@react-three/fiber";
import { Suspense, useRef, type MutableRefObject } from "react";
import * as THREE from "three";
import type { GameState } from "../GameCanvas";
import { PlayerGltfModel } from "./PlayerGltfModel";
import { PlayerModelErrorBoundary } from "./PlayerModelErrorBoundary";
import { PlayerProceduralModel } from "./PlayerProceduralModel";

export function Player({ state, debugCollision }: { state: MutableRefObject<GameState>; debugCollision: boolean }) {
  const group = useRef<THREE.Group>(null);
  const leftLeg = useRef<THREE.Mesh>(null);
  const rightLeg = useRef<THREE.Mesh>(null);
  const leftArm = useRef<THREE.Mesh>(null);
  const rightArm = useRef<THREE.Mesh>(null);
  useFrame(({ clock }) => {
    const movementState = state.current.movementState;
    const climbing = movementState === "climb" || movementState === "climbIdle";
    const mantling = movementState === "mantle";
    if (group.current) {
      group.current.position.set(state.current.localX, state.current.height, state.current.localZ);
      group.current.rotation.y = state.current.yaw;
      group.current.rotation.x = movementState === "swim" ? -0.42 : climbing ? -0.72 * (1 - state.current.climbNormalY * 0.35) : mantling ? -0.5 : 0;
    }
    const swimming = movementState === "swim";
    const moving = movementState === "walk" || movementState === "run";
    const frequency = movementState === "run" ? 12 : 8;
    const climbCycle = climbing ? Math.sin(clock.elapsedTime * (movementState === "climb" ? 7 : 2.5)) : 0;
    const speed = swimming ? Math.sin(clock.elapsedTime * 9) * 0.48 : climbing ? climbCycle * (movementState === "climb" ? 0.52 : 0.08) : mantling ? Math.sin(clock.elapsedTime * 12) * 0.22 : moving ? Math.sin(clock.elapsedTime * frequency) * 0.35 : 0;
    if (leftLeg.current) leftLeg.current.rotation.x = speed;
    if (rightLeg.current) rightLeg.current.rotation.x = -speed;
    const armStroke = swimming ? Math.sin(clock.elapsedTime * 5.5) * 1.05 : climbing ? -speed * 1.75 : mantling ? -0.95 : moving ? -speed * 0.7 : 0;
    if (leftArm.current) leftArm.current.rotation.x = armStroke;
    if (rightArm.current) rightArm.current.rotation.x = -armStroke;
  });
  return (
    <group ref={group} position={[state.current.localX, state.current.height, state.current.localZ]} rotation-y={state.current.yaw}>
      <PlayerModelErrorBoundary fallback={<PlayerProceduralModel leftLeg={leftLeg} rightLeg={rightLeg} leftArm={leftArm} rightArm={rightArm} />}>
        <Suspense fallback={<PlayerProceduralModel leftLeg={leftLeg} rightLeg={rightLeg} leftArm={leftArm} rightArm={rightArm} />}>
          <PlayerGltfModel state={state} />
        </Suspense>
      </PlayerModelErrorBoundary>
      {debugCollision && <mesh rotation-x={-Math.PI / 2} position={[0, 0.035, 0]}>
        <ringGeometry args={[0.3, 0.36, 24]} />
        <meshBasicMaterial color="#ff4d5e" depthTest={false} />
      </mesh>}
    </group>
  );
}
