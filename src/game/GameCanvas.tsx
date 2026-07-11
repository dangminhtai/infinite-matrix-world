import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { useCallback, useEffect, useMemo, useRef, type MutableRefObject } from "react";
import * as THREE from "three";
import { CHUNK_SIZE } from "./constants";
import type { ChunkPayload } from "./types";
import { WorldRenderer } from "./rendering/WorldRenderer";
import { Player } from "./player/Player";
import { ThirdPersonCamera, type CameraState } from "./camera/ThirdPersonCamera";
import { MobileActionButtons, VirtualJoystick } from "./controls/VirtualJoystick";
import { clampCamera } from "./controls/TouchCameraControls";
import { usePointerControls } from "./controls/PointerControls";
import { dampAngle, type MoveInput } from "./player/movement";
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
  verticalVelocity: number;
  grounded: boolean;
  movementState: "idle" | "walk" | "run" | "jump" | "fall";
  cameraYaw: number;
  cameraZoom: number;
  fps: number;
};

type PlayerInputState = {
  pressed: Set<string>;
  joystick: MoveInput;
  jumpQueued: boolean;
  mobileRun: boolean;
};

function Scene({
  chunks,
  debug,
  onChunkChange,
  onStats,
  inputRef,
  teleport,
  resetCameraToken,
}: {
  chunks: ChunkPayload[];
  debug: boolean;
  onChunkChange: (cx: bigint, cy: bigint) => void;
  onStats: (state: GameState) => void;
  inputRef: MutableRefObject<PlayerInputState>;
  teleport: { x: bigint; y: bigint; token: number } | null;
  resetCameraToken: number;
}) {
  const chunkMap = useMemo(() => new Map(chunks.map((chunk) => [`${chunk.cx},${chunk.cy}`, chunk])), [chunks]);
  const game = useRef<GameState>({
    tileX: 0n,
    tileY: 0n,
    localX: 8,
    localZ: 8,
    height: 0,
    yaw: 0,
    verticalVelocity: 0,
    grounded: true,
    movementState: "idle",
    cameraYaw: Math.PI * 0.75,
    cameraZoom: 18,
    fps: 0,
  });
  const target = useRef<{ x: bigint; y: bigint } | null>(null);
  const cameraAngles = useRef<CameraState>({ yaw: Math.PI * 0.75, pitch: Math.PI / 5, distance: 18, targetHeight: 1.15 });
  const fpsRef = useRef({ frames: 0, elapsed: 0, fps: 0 });
  const { camera, raycaster, scene } = useThree();

  useEffect(() => {
    cameraAngles.current.yaw = Math.PI * 0.75;
    cameraAngles.current.pitch = Math.PI / 5;
    cameraAngles.current.distance = 18;
  }, [resetCameraToken]);

  useEffect(() => {
    if (!teleport) return;
    const cx = floorDiv(teleport.x, BigInt(CHUNK_SIZE));
    const cy = floorDiv(teleport.y, BigInt(CHUNK_SIZE));
    game.current.tileX = cx * BigInt(CHUNK_SIZE);
    game.current.tileY = cy * BigInt(CHUNK_SIZE);
    game.current.localX = Number(teleport.x - game.current.tileX);
    game.current.localZ = Number(teleport.y - game.current.tileY);
    game.current.verticalVelocity = 0;
    game.current.grounded = true;
    target.current = null;
    onChunkChange(cx, cy);
  }, [onChunkChange, teleport]);

  const rotate = useCallback((dx: number, dy: number) => {
    cameraAngles.current.yaw -= dx * 0.006;
    const clamped = clampCamera(cameraAngles.current.pitch + dy * 0.004, cameraAngles.current.distance);
    cameraAngles.current.pitch = clamped.pitch;
  }, []);

  const zoom = useCallback((amount: number) => {
    const clamped = clampCamera(cameraAngles.current.pitch, cameraAngles.current.distance + amount * 0.02);
    cameraAngles.current.distance = clamped.zoom;
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
    const resetInput = () => {
      inputRef.current.pressed.clear();
      inputRef.current.joystick = { x: 0, y: 0 };
      inputRef.current.jumpQueued = false;
      inputRef.current.mobileRun = false;
      target.current = null;
    };
    const down = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement || e.target instanceof HTMLSelectElement) return;
      if (["KeyW", "KeyA", "KeyS", "KeyD", "ShiftLeft", "ShiftRight"].includes(e.code)) inputRef.current.pressed.add(e.code);
      if (e.code === "Space" && !e.repeat) {
        e.preventDefault();
        inputRef.current.jumpQueued = true;
      }
    };
    const up = (e: KeyboardEvent) => {
      inputRef.current.pressed.delete(e.code);
    };
    const visibility = () => {
      if (document.hidden) resetInput();
    };
    window.addEventListener("keydown", down);
    window.addEventListener("keyup", up);
    window.addEventListener("blur", resetInput);
    document.addEventListener("visibilitychange", visibility);
    return () => {
      window.removeEventListener("keydown", down);
      window.removeEventListener("keyup", up);
      window.removeEventListener("blur", resetInput);
      document.removeEventListener("visibilitychange", visibility);
    };
  }, [inputRef]);

  useFrame((_, delta) => {
    fpsRef.current.frames += 1;
    fpsRef.current.elapsed += delta;
    if (fpsRef.current.elapsed >= 0.5) {
      fpsRef.current.fps = Math.round(fpsRef.current.frames / fpsRef.current.elapsed);
      fpsRef.current.frames = 0;
      fpsRef.current.elapsed = 0;
    }
    const state = game.current;
    const controls = inputRef.current;
    const keyX = (controls.pressed.has("KeyD") ? 1 : 0) - (controls.pressed.has("KeyA") ? 1 : 0);
    const keyY = (controls.pressed.has("KeyS") ? 1 : 0) - (controls.pressed.has("KeyW") ? 1 : 0);
    let inputX = Math.max(-1, Math.min(1, keyX + controls.joystick.x));
    let inputY = Math.max(-1, Math.min(1, keyY + controls.joystick.y));
    const inputLength = Math.hypot(inputX, inputY);
    if (inputLength > 1) {
      inputX /= inputLength;
      inputY /= inputLength;
    }
    const hasManualInput = Math.abs(inputX) > 1e-4 || Math.abs(inputY) > 1e-4;
    if (hasManualInput) target.current = null;
    let worldDx = 0;
    let worldDz = 0;
    if (target.current && !hasManualInput) {
      const tx = Number(target.current.x - state.tileX) - state.localX;
      const tz = Number(target.current.y - state.tileY) - state.localZ;
      const dist = Math.hypot(tx, tz);
      if (dist < 0.35) target.current = null;
      else {
        worldDx = tx / dist;
        worldDz = tz / dist;
      }
    } else if (hasManualInput) {
      const cyaw = cameraAngles.current.yaw;
      const forward = -inputY;
      worldDx = -Math.sin(cyaw) * forward + Math.cos(cyaw) * inputX;
      worldDz = -Math.cos(cyaw) * forward - Math.sin(cyaw) * inputX;
    }
    const running = controls.mobileRun || controls.pressed.has("ShiftLeft") || controls.pressed.has("ShiftRight");
    const moving = worldDx !== 0 || worldDz !== 0;
    const speed = running ? 7.2 : 4.2;
    const currentWorldX = state.tileX + BigInt(Math.floor(state.localX));
    const currentWorldY = state.tileY + BigInt(Math.floor(state.localZ));
    let groundHeight = sampleChunkHeight(chunkMap, currentWorldX, currentWorldY)?.height ?? state.height;
    let moved = false;
    if (moving) {
      const nextX = state.localX + worldDx * speed * delta;
      const nextZ = state.localZ + worldDz * speed * delta;
      const wx = state.tileX + BigInt(Math.floor(nextX));
      const wy = state.tileY + BigInt(Math.floor(nextZ));
      const sample = sampleChunkHeight(chunkMap, wx, wy);
      if (sample?.walkable) {
        state.localX = nextX;
        state.localZ = nextZ;
        groundHeight = sample.height;
        moved = true;
        state.yaw = dampAngle(state.yaw, Math.atan2(worldDx, worldDz), 14, delta);
      }
    }
    if (controls.jumpQueued && state.grounded) {
      state.verticalVelocity = 6.8;
      state.grounded = false;
    }
    controls.jumpQueued = false;
    if (!state.grounded) {
      state.verticalVelocity -= 18 * delta;
      state.height += state.verticalVelocity * delta;
      if (state.height <= groundHeight && state.verticalVelocity <= 0) {
        state.height = groundHeight;
        state.verticalVelocity = 0;
        state.grounded = true;
      }
    } else {
      state.height += (groundHeight - state.height) * (1 - Math.exp(-12 * delta));
    }
    state.movementState = !state.grounded
      ? (state.verticalVelocity > 0 ? "jump" : "fall")
      : moved
        ? (running ? "run" : "walk")
        : "idle";
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
    state.cameraYaw = cameraAngles.current.yaw;
    state.cameraZoom = cameraAngles.current.distance;
    state.fps = fpsRef.current.fps;
    onStats(state);
  });

  const originCx = floorDiv(game.current.tileX, BigInt(CHUNK_SIZE));
  const originCy = floorDiv(game.current.tileY, BigInt(CHUNK_SIZE));
  return (
    <>
      <WorldRenderer chunks={chunks} originCx={originCx} originCy={originCy} debug={debug} />
      <GrassRing chunks={chunks} originCx={originCx} originCy={originCy} player={game} />
      <Player state={game} />
      <ThirdPersonCamera
        player={game}
        angles={cameraAngles}
        chunks={chunkMap}
        originCx={originCx}
        originCy={originCy}
        teleportToken={teleport?.token ?? null}
      />
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
  const inputRef = useRef<PlayerInputState>({ pressed: new Set(), joystick: { x: 0, y: 0 }, jumpQueued: false, mobileRun: false });
  return (
    <div className="gameShell">
      <Canvas shadows camera={{ position: [18, 18, 18], fov: 52 }} dpr={[1, 1.75]}>
        <Scene
          chunks={props.chunks}
          debug={props.debug}
          onChunkChange={props.onChunkChange}
          onStats={props.onStats}
          inputRef={inputRef}
          teleport={props.teleport}
          resetCameraToken={props.resetCameraToken}
        />
      </Canvas>
      <VirtualJoystick onChange={(input) => { inputRef.current.joystick = input; }} />
      <MobileActionButtons
        onJump={() => { inputRef.current.jumpQueued = true; }}
        onRunChange={(running) => { inputRef.current.mobileRun = running; }}
      />
    </div>
  );
}
