import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { memo, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type MutableRefObject } from "react";
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
import type { GameSettings } from "./settings";

function floorDiv(a: bigint, b: bigint): bigint {
  let q = a / b;
  const r = a % b;
  if (r !== 0n && (r > 0n) !== (b > 0n)) q -= 1n;
  return q;
}

function FrameLimiter({ limit }: { limit: number }) {
  const invalidate = useThree((state) => state.invalidate);
  useEffect(() => {
    if (limit <= 0) return;
    const timer = window.setInterval(invalidate, 1000 / limit);
    invalidate();
    return () => window.clearInterval(timer);
  }, [invalidate, limit]);
  return null;
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
  health: number;
  stamina: number;
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

const FLOATING_ORIGIN_THRESHOLD = CHUNK_SIZE * 4;

function Scene({
  chunks,
  debug,
  onChunkChange,
  onStats,
  inputRef,
  teleport,
  resetCameraToken,
  settings,
  paused,
  debugCollision,
}: {
  chunks: ChunkPayload[];
  debug: boolean;
  onChunkChange: (cx: bigint, cy: bigint) => void;
  onStats: (state: GameState) => void;
  inputRef: MutableRefObject<PlayerInputState>;
  teleport: { x: bigint; y: bigint; token: number } | null;
  resetCameraToken: number;
  settings: GameSettings;
  paused: boolean;
  debugCollision: boolean;
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
    health: 100,
    stamina: 100,
    cameraYaw: Math.PI * 0.75,
    cameraZoom: 18,
    fps: 0,
  });
  const target = useRef<{ x: bigint; y: bigint } | null>(null);
  const pendingRebase = useRef<{ shiftX: number; shiftZ: number } | null>(null);
  const pendingTeleport = useRef<{ tileX: bigint; tileY: bigint; localX: number; localZ: number } | null>(null);
  const [renderOrigin, setRenderOrigin] = useState({ cx: 0n, cy: 0n });
  const cameraAngles = useRef<CameraState>({ yaw: Math.PI * 0.75, pitch: Math.PI / 5, distance: 18, targetHeight: 1.15 });
  const fpsRef = useRef({ frames: 0, elapsed: 0, fps: 0 });
  const { camera, raycaster, scene } = useThree();

  useEffect(() => {
    cameraAngles.current.yaw = Math.PI * 0.75;
    cameraAngles.current.pitch = Math.PI / 5;
    cameraAngles.current.distance = settings.gameplay.cameraDistance;
  }, [resetCameraToken, settings.gameplay.cameraDistance]);

  useEffect(() => {
    cameraAngles.current.distance = settings.gameplay.cameraDistance;
  }, [settings.gameplay.cameraDistance]);

  useEffect(() => {
    if (!teleport) return;
    const cx = floorDiv(teleport.x, BigInt(CHUNK_SIZE));
    const cy = floorDiv(teleport.y, BigInt(CHUNK_SIZE));
    const tileX = cx * BigInt(CHUNK_SIZE);
    const tileY = cy * BigInt(CHUNK_SIZE);
    pendingTeleport.current = {
      tileX,
      tileY,
      localX: Number(teleport.x - tileX),
      localZ: Number(teleport.y - tileY),
    };
    pendingRebase.current = null;
    setRenderOrigin({ cx, cy });
    target.current = null;
    onChunkChange(cx, cy);
  }, [onChunkChange, teleport]);

  useLayoutEffect(() => {
    const teleportState = pendingTeleport.current;
    if (teleportState) {
      game.current.tileX = teleportState.tileX;
      game.current.tileY = teleportState.tileY;
      game.current.localX = teleportState.localX;
      game.current.localZ = teleportState.localZ;
      game.current.verticalVelocity = 0;
      game.current.grounded = true;
      pendingTeleport.current = null;
      return;
    }
    const rebase = pendingRebase.current;
    if (!rebase) return;
    game.current.tileX += BigInt(rebase.shiftX);
    game.current.tileY += BigInt(rebase.shiftZ);
    game.current.localX -= rebase.shiftX;
    game.current.localZ -= rebase.shiftZ;
    pendingRebase.current = null;
  }, [renderOrigin]);

  const rotate = useCallback((dx: number, dy: number, pointerType: string) => {
    const sensitivity = settings.gameplay.cameraSensitivity * (pointerType === "touch" ? settings.controls.touchCameraSensitivity : 1);
    const verticalDirection = settings.gameplay.invertY ? -1 : 1;
    cameraAngles.current.yaw -= dx * 0.006 * sensitivity;
    const clamped = clampCamera(cameraAngles.current.pitch + dy * 0.004 * sensitivity * verticalDirection, cameraAngles.current.distance);
    cameraAngles.current.pitch = clamped.pitch;
  }, [settings.controls.touchCameraSensitivity, settings.gameplay.cameraSensitivity, settings.gameplay.invertY]);

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
    if (!paused) return;
    inputRef.current.pressed.clear();
    inputRef.current.joystick = { x: 0, y: 0 };
    inputRef.current.jumpQueued = false;
    inputRef.current.mobileRun = false;
    target.current = null;
  }, [inputRef, paused]);

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
      const bindings = settings.controls;
      if ([bindings.forward, bindings.backward, bindings.left, bindings.right, bindings.run].includes(e.code)) inputRef.current.pressed.add(e.code);
      if (e.code === bindings.jump && !e.repeat) {
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
  }, [inputRef, settings.controls]);

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
    const keyX = paused ? 0 : (controls.pressed.has(settings.controls.right) ? 1 : 0) - (controls.pressed.has(settings.controls.left) ? 1 : 0);
    const keyY = paused ? 0 : (controls.pressed.has(settings.controls.backward) ? 1 : 0) - (controls.pressed.has(settings.controls.forward) ? 1 : 0);
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
    const requestedRun = settings.gameplay.autoRun || controls.mobileRun || controls.pressed.has(settings.controls.run);
    const running = requestedRun && state.stamina > 0.1;
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
    state.stamina = Math.max(0, Math.min(100, state.stamina + (moved && running ? -20 : 12) * delta));
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
    if (!pendingRebase.current && (Math.abs(state.localX) >= FLOATING_ORIGIN_THRESHOLD || Math.abs(state.localZ) >= FLOATING_ORIGIN_THRESHOLD)) {
      const shiftX = Math.trunc(state.localX / CHUNK_SIZE) * CHUNK_SIZE;
      const shiftZ = Math.trunc(state.localZ / CHUNK_SIZE) * CHUNK_SIZE;
      pendingRebase.current = { shiftX, shiftZ };
      setRenderOrigin({
        cx: floorDiv(state.tileX + BigInt(shiftX), BigInt(CHUNK_SIZE)),
        cy: floorDiv(state.tileY + BigInt(shiftZ), BigInt(CHUNK_SIZE)),
      });
    }
    const worldTileX = state.tileX + BigInt(Math.floor(state.localX));
    const worldTileY = state.tileY + BigInt(Math.floor(state.localZ));
    const cx = floorDiv(worldTileX, BigInt(CHUNK_SIZE));
    const cy = floorDiv(worldTileY, BigInt(CHUNK_SIZE));
    onChunkChange(cx, cy);
    state.cameraYaw = cameraAngles.current.yaw;
    state.cameraZoom = cameraAngles.current.distance;
    state.fps = fpsRef.current.fps;
    onStats(state);
  });

  const originCx = renderOrigin.cx;
  const originCy = renderOrigin.cy;
  return (
    <>
      <WorldRenderer chunks={chunks} originCx={originCx} originCy={originCy} debug={debug} graphics={settings.graphics} />
      {settings.graphics.decorativeGrass && <GrassRing chunks={chunks} originCx={originCx} originCy={originCy} player={game} density={settings.graphics.vegetationDensity} />}
      <Player state={game} debugCollision={debugCollision} />
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

export const GameCanvas = memo(function GameCanvas(props: {
  chunks: ChunkPayload[];
  debug: boolean;
  onChunkChange: (cx: bigint, cy: bigint) => void;
  onStats: (state: GameState) => void;
  teleport: { x: bigint; y: bigint; token: number } | null;
  resetCameraToken: number;
  settings: GameSettings;
  paused: boolean;
  debugCollision: boolean;
}) {
  const inputRef = useRef<PlayerInputState>({ pressed: new Set(), joystick: { x: 0, y: 0 }, jumpQueued: false, mobileRun: false });
  return (
    <div className="gameShell">
      <Canvas
        shadows={props.settings.graphics.shadowQuality !== "off"}
        camera={{ position: [18, 18, 18], fov: 52 }}
        dpr={[Math.min(1, props.settings.graphics.pixelRatio), props.settings.graphics.pixelRatio]}
        frameloop={props.settings.graphics.fpsLimit > 0 ? "demand" : "always"}
      >
        <FrameLimiter limit={props.settings.graphics.fpsLimit} />
        <Scene
          chunks={props.chunks}
          debug={props.debug}
          onChunkChange={props.onChunkChange}
          onStats={props.onStats}
          inputRef={inputRef}
          teleport={props.teleport}
          resetCameraToken={props.resetCameraToken}
          settings={props.settings}
          paused={props.paused}
          debugCollision={props.debugCollision}
        />
      </Canvas>
      <VirtualJoystick
        size={props.settings.controls.joystickSize}
        opacity={props.settings.controls.joystickOpacity}
        onChange={(input) => { inputRef.current.joystick = input; }}
      />
      <MobileActionButtons
        onJump={() => { inputRef.current.jumpQueued = true; }}
        onRunChange={(running) => { inputRef.current.mobileRun = running; }}
      />
    </div>
  );
});
