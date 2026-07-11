import { useFrame, useThree } from "@react-three/fiber";
import { useMemo, useRef, type MutableRefObject } from "react";
import * as THREE from "three";
import { CHUNK_SIZE } from "../constants";
import type { GameState } from "../GameCanvas";
import type { ChunkPayload } from "../types";
import { sampleChunkHeight } from "../player/collision";

export type CameraState = {
  yaw: number;
  pitch: number;
  distance: number;
  targetHeight: number;
};

export function ThirdPersonCamera({
  player,
  angles,
  chunks,
  originCx,
  originCy,
  teleportToken,
}: {
  player: MutableRefObject<GameState>;
  angles: MutableRefObject<CameraState>;
  chunks: Map<string, ChunkPayload>;
  originCx: bigint;
  originCy: bigint;
  teleportToken: number | null;
}) {
  const desired = useMemo(() => new THREE.Vector3(), []);
  const smoothTarget = useMemo(() => new THREE.Vector3(), []);
  const desiredTarget = useMemo(() => new THREE.Vector3(), []);
  const previousOrigin = useRef({ cx: originCx, cy: originCy });
  const previousTeleportToken = useRef(teleportToken);
  const { camera } = useThree();
  useFrame((_, delta) => {
    const state = player.current;
    const cameraState = angles.current;
    if (previousTeleportToken.current !== teleportToken) {
      smoothTarget.set(state.localX, state.height + cameraState.targetHeight, state.localZ);
      camera.position.set(
        smoothTarget.x + Math.sin(cameraState.yaw) * Math.cos(cameraState.pitch) * cameraState.distance,
        smoothTarget.y + Math.sin(cameraState.pitch) * cameraState.distance,
        smoothTarget.z + Math.cos(cameraState.yaw) * Math.cos(cameraState.pitch) * cameraState.distance,
      );
      previousOrigin.current.cx = originCx;
      previousOrigin.current.cy = originCy;
      previousTeleportToken.current = teleportToken;
    } else if (previousOrigin.current.cx !== originCx || previousOrigin.current.cy !== originCy) {
      const shiftX = Number(previousOrigin.current.cx - originCx) * CHUNK_SIZE;
      const shiftZ = Number(previousOrigin.current.cy - originCy) * CHUNK_SIZE;
      camera.position.x += shiftX;
      camera.position.z += shiftZ;
      smoothTarget.x += shiftX;
      smoothTarget.z += shiftZ;
      previousOrigin.current.cx = originCx;
      previousOrigin.current.cy = originCy;
    }
    desiredTarget.set(state.localX, state.height + cameraState.targetHeight, state.localZ);
    smoothTarget.lerp(desiredTarget, 1 - Math.exp(-12 * delta));
    desired.set(
      smoothTarget.x + Math.sin(cameraState.yaw) * Math.cos(cameraState.pitch) * cameraState.distance,
      smoothTarget.y + Math.sin(cameraState.pitch) * cameraState.distance,
      smoothTarget.z + Math.cos(cameraState.yaw) * Math.cos(cameraState.pitch) * cameraState.distance,
    );
    const worldX = originCx * BigInt(CHUNK_SIZE) + BigInt(Math.floor(desired.x));
    const worldY = originCy * BigInt(CHUNK_SIZE) + BigInt(Math.floor(desired.z));
    const terrain = sampleChunkHeight(chunks, worldX, worldY);
    if (terrain) desired.y = Math.max(desired.y, terrain.height + 1.1);
    camera.position.lerp(desired, 1 - Math.exp(-8 * delta));
    camera.lookAt(smoothTarget);
  });
  return null;
}
