import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { useCallback, useEffect, useMemo, useRef, useState, type MutableRefObject } from "react";
import * as THREE from "three";
import { CHUNK_SIZE } from "./constants";
import type { ChunkPayload } from "./types";
import { WorldRenderer } from "./rendering/WorldRenderer";
import { Player } from "./player/Player";
import { ThirdPersonCamera } from "./camera/ThirdPersonCamera";
import { VirtualJoystick } from "./controls/VirtualJoystick";
import { clampCamera } from "./controls/TouchCameraControls";
import { usePointerControls } from "./controls/PointerControls";
import { normalizeInput, type MoveInput } from "./player/movement";
import { sampleChunkHeight } from "./player/collision";
import { GrassRing } from "./rendering/GrassRing";

function floorDiv(a: bigint, b: bigint): bigint {
  let q = a / b;
  const r = a % b;
  if (r !== 0n && (r > 0n) !== (b > 0n)) q -= 1n;
  return q;
}

export type GameState = {
  tileX: bigint;
  tileY: bigint;
  localX: number;
  localZ: number;
  height: number;
  yaw: number;
  cameraYaw: number;
  cameraZoom: number;
  fps: number;
};

function Scene({
  chunks,
  debug,
  onChunkChange,
  onStats,
  moveRef,
  teleport,
  resetCameraToken,
}: {
  chunks: ChunkPayload[];
  debug: boolean;
  onChunkChange: (cx: bigint, cy: bigint) => void;
  onStats: (state: GameState) => void;
  moveRef: MutableRefObject<MoveInput>;
  teleport: { x: bigint; y: bigint; token: number } | null;
  resetCameraToken: number;
}) {
  const chunkMap = useMemo(() => new Map(chunks.map((chunk) => [`${chunk.cx},${chunk.cy}`, chunk])), [chunks]);
  const game = useRef<GameState>({ tileX: 0n, tileY: 0n, localX: 8, localZ: 8, height: 0, yaw: 0, cameraYaw: Math.PI * 0.75, cameraZoom: 23, fps: 0 });
  const target = useRef<{ x: bigint; y: bigint } | null>(null);
  const cameraAngles = useRef({ yaw: Math.PI * 0.75, pitch: 0.72, zoom: 23 });
  const fpsRef = useRef({ frames: 0, elapsed: 0, fps: 0 });
  const [, forceRender] = useState(0);
  const { camera, raycaster, scene } = useThree();
  const playerTarget = useMemo(() => new THREE.Vector3(), []);

  useEffect(() => {
    cameraAngles.current.yaw = Math.PI * 0.75;
    cameraAngles.current.pitch = 0.72;
    cameraAngles.current.zoom = 23;
    forceRender((v) => v + 1);
  }, [resetCameraToken]);

  useEffect(() => {
    if (!teleport) return;
    const cx = floorDiv(teleport.x, BigInt(CHUNK_SIZE));
    const cy = floorDiv(teleport.y, BigInt(CHUNK_SIZE));
    game.current.tileX = cx * BigInt(CHUNK_SIZE);
    game.current.tileY = cy * BigInt(CHUNK_SIZE);
    game.current.localX = Number(teleport.x - game.current.tileX);
    game.current.localZ = Number(teleport.y - game.current.tileY);
    target.current = null;
    onChunkChange(cx, cy);
  }, [onChunkChange, teleport]);

  const rotate = useCallback((dx: number, dy: number) => {
    cameraAngles.current.yaw -= dx * 0.006;
    const clamped = clampCamera(cameraAngles.current.pitch + dy * 0.004, cameraAngles.current.zoom);
    cameraAngles.current.pitch = clamped.pitch;
    forceRender((v) => v + 1);
  }, []);

  const zoom = useCallback((amount: number) => {
    const clamped = clampCamera(cameraAngles.current.pitch, cameraAngles.current.zoom + amount * 0.02);
    cameraAngles.current.zoom = clamped.zoom;
    forceRender((v) => v + 1);
  }, []);

  const clickMove = useCallback((x: number, y: number) => {
    const ndc = new THREE.Vector2((x / window.innerWidth) * 2 - 1, -(y / window.innerHeight) * 2 + 1);
    raycaster.setFromCamera(ndc, camera);
    const hits = raycaster.intersectObjects(scene.children, true).filter((hit) => hit.object.userData.terrain === true);
    const hit = hits[0];
    if (!hit) return;
    const originCx = floorDiv(game.current.tileX, BigInt(CHUNK_SIZE));
    const originCy = floorDiv(game.current.tileY, BigInt(CHUNK_SIZE));
    target.current = {
      x: originCx * BigInt(CHUNK_SIZE) + BigInt(Math.floor(hit.point.x)),
      y: originCy * BigInt(CHUNK_SIZE) + BigInt(Math.floor(hit.point.z)),
    };
  }, [camera, raycaster, scene]);

  usePointerControls(rotate, zoom, clickMove);

  useEffect(() => {
    const down = (e: KeyboardEvent) => {
      if (e.key.toLowerCase() === "w") moveRef.current.y = -1;
      if (e.key.toLowerCase() === "s") moveRef.current.y = 1;
      if (e.key.toLowerCase() === "a") moveRef.current.x = -1;
      if (e.key.toLowerCase() === "d") moveRef.current.x = 1;
    };
    const up = (e: KeyboardEvent) => {
      if (["w", "s"].includes(e.key.toLowerCase())) moveRef.current.y = 0;
      if (["a", "d"].includes(e.key.toLowerCase())) moveRef.current.x = 0;
    };
    window.addEventListener("keydown", down);
    window.addEventListener("keyup", up);
    return () => {
      window.removeEventListener("keydown", down);
      window.removeEventListener("keyup", up);
    };
  }, [moveRef]);

  useFrame((_, delta) => {
    fpsRef.current.frames += 1;
    fpsRef.current.elapsed += delta;
    if (fpsRef.current.elapsed >= 0.5) {
      fpsRef.current.fps = Math.round(fpsRef.current.frames / fpsRef.current.elapsed);
      fpsRef.current.frames = 0;
      fpsRef.current.elapsed = 0;
    }
    const state = game.current;
    const input = normalizeInput(moveRef.current);
    let dx = input.x;
    let dz = input.y;
    if (target.current && dx === 0 && dz === 0) {
      const tx = Number(target.current.x - state.tileX) - state.localX;
      const tz = Number(target.current.y - state.tileY) - state.localZ;
      const dist = Math.hypot(tx, tz);
      if (dist < 0.35) target.current = null;
      else {
        dx = tx / dist;
        dz = tz / dist;
      }
    }
    const speed = 5.4;
    if (dx || dz) {
      const cyaw = cameraAngles.current.yaw;
      const worldDx = Math.cos(cyaw) * dx + Math.sin(cyaw) * dz;
      const worldDz = -Math.sin(cyaw) * dx + Math.cos(cyaw) * dz;
      const nextX = state.localX + worldDx * speed * delta;
      const nextZ = state.localZ + worldDz * speed * delta;
      const wx = state.tileX + BigInt(Math.floor(nextX));
      const wy = state.tileY + BigInt(Math.floor(nextZ));
      const sample = sampleChunkHeight(chunkMap, wx, wy);
      if (sample?.walkable) {
        state.localX = nextX;
        state.localZ = nextZ;
        state.height += ((sample.height ?? 0) - state.height) * Math.min(1, delta * 12);
        state.yaw = Math.atan2(worldDx, worldDz);
      }
    }
    while (state.localX >= CHUNK_SIZE) {
      state.tileX += BigInt(CHUNK_SIZE);
      state.localX -= CHUNK_SIZE;
    }
    while (state.localX < 0) {
      state.tileX -= BigInt(CHUNK_SIZE);
      state.localX += CHUNK_SIZE;
    }
    while (state.localZ >= CHUNK_SIZE) {
      state.tileY += BigInt(CHUNK_SIZE);
      state.localZ -= CHUNK_SIZE;
    }
    while (state.localZ < 0) {
      state.tileY -= BigInt(CHUNK_SIZE);
      state.localZ += CHUNK_SIZE;
    }
    const cx = floorDiv(state.tileX, BigInt(CHUNK_SIZE));
    const cy = floorDiv(state.tileY, BigInt(CHUNK_SIZE));
    onChunkChange(cx, cy);
    playerTarget.set(state.localX, state.height, state.localZ);
    onStats({
      ...state,
      cameraYaw: cameraAngles.current.yaw,
      cameraZoom: cameraAngles.current.zoom,
      fps: fpsRef.current.fps,
    });
  });

  const originCx = floorDiv(game.current.tileX, BigInt(CHUNK_SIZE));
  const originCy = floorDiv(game.current.tileY, BigInt(CHUNK_SIZE));
  return (
    <>
      <WorldRenderer chunks={chunks} originCx={originCx} originCy={originCy} debug={debug} />
      <GrassRing chunks={chunks} originCx={originCx} originCy={originCy} player={game} />
      <Player state={game} />
      <ThirdPersonCamera target={playerTarget} yaw={cameraAngles.current.yaw} pitch={cameraAngles.current.pitch} zoom={cameraAngles.current.zoom} minY={game.current.height + 1.8} />
    </>
  );
}

export function GameCanvas(props: {
  chunks: ChunkPayload[];
  debug: boolean;
  onChunkChange: (cx: bigint, cy: bigint) => void;
  onStats: (state: GameState) => void;
  teleport: { x: bigint; y: bigint; token: number } | null;
  resetCameraToken: number;
}) {
  const moveRef = useRef<MoveInput>({ x: 0, y: 0 });
  return (
    <div className="gameShell">
      <Canvas shadows camera={{ position: [18, 18, 18], fov: 52 }} dpr={[1, 1.75]}>
        <Scene
          chunks={props.chunks}
          debug={props.debug}
          onChunkChange={props.onChunkChange}
          onStats={props.onStats}
          moveRef={moveRef}
          teleport={props.teleport}
          resetCameraToken={props.resetCameraToken}
        />
      </Canvas>
      <VirtualJoystick onChange={(input) => { moveRef.current = input; }} />
    </div>
  );
}
