import { useFrame, useLoader } from "@react-three/fiber";
import { useMemo, useRef, type MutableRefObject } from "react";
import * as THREE from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import aetherUrl from "../../models/genshin_impact_aether.glb?url";
import swordUrl from "../../models/aethers_lumines_sword.glb?url";
import type { GameState } from "../GameCanvas";
import {
  PLAYER_MODEL_HEIGHT,
  PLAYER_MODEL_ROTATION_Y,
  SWORD_BACK_OFFSET,
  SWORD_BACK_ROTATION,
  SWORD_MODEL_LENGTH,
} from "./playerModelConfig";

function prepareModel(source: THREE.Group, targetSize: number, useHeight: boolean): { object: THREE.Group; scale: number } {
  const object = source.clone(true);
  object.traverse((child) => {
    if (!(child instanceof THREE.Mesh)) return;
    child.castShadow = true;
    child.receiveShadow = true;
  });
  object.updateMatrixWorld(true);
  const bounds = new THREE.Box3().setFromObject(object);
  const center = bounds.getCenter(new THREE.Vector3());
  const size = bounds.getSize(new THREE.Vector3());
  object.position.set(-center.x, -bounds.min.y, -center.z);
  const measuredSize = useHeight ? size.y : Math.max(size.x, size.y, size.z);
  return { object, scale: targetSize / Math.max(measuredSize, 0.001) };
}

export function PlayerGltfModel({ state }: { state: MutableRefObject<GameState> }) {
  const visual = useRef<THREE.Group>(null);
  const aether = useLoader(GLTFLoader, aetherUrl);
  const sword = useLoader(GLTFLoader, swordUrl);
  const preparedAether = useMemo(() => prepareModel(aether.scene, PLAYER_MODEL_HEIGHT, true), [aether.scene]);
  const preparedSword = useMemo(() => prepareModel(sword.scene, SWORD_MODEL_LENGTH, false), [sword.scene]);

  useFrame(({ clock }) => {
    if (!visual.current) return;
    const movement = state.current.movementState;
    const moving = movement === "walk" || movement === "run";
    const climbing = movement === "climb";
    const swimming = movement === "swim";
    const frequency = movement === "run" ? 12 : swimming ? 7 : climbing ? 6 : 8;
    const amplitude = movement === "run" ? 0.035 : moving ? 0.022 : climbing || swimming ? 0.026 : 0.006;
    visual.current.position.y = Math.abs(Math.sin(clock.elapsedTime * frequency)) * amplitude;
    visual.current.rotation.z = moving ? Math.sin(clock.elapsedTime * frequency) * 0.025 : 0;
  });

  return <group ref={visual} rotation-y={PLAYER_MODEL_ROTATION_Y}>
    <group scale={preparedAether.scale}>
      <primitive object={preparedAether.object} dispose={null} />
    </group>
    <group position={SWORD_BACK_OFFSET} rotation={SWORD_BACK_ROTATION} scale={preparedSword.scale}>
      <primitive object={preparedSword.object} dispose={null} />
    </group>
  </group>;
}

useLoader.preload(GLTFLoader, aetherUrl);
useLoader.preload(GLTFLoader, swordUrl);
