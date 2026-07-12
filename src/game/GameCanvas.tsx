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
import { DEFAULT_CAMERA_DISTANCE, DEFAULT_CAMERA_PITCH } from "./camera/cameraConfig";
import { EntitySystem } from "./entities/EntitySystem";
import type { Inventory } from "./core/SaveManager";
import type { MapEnemy } from "./map/types";
import { sampleTerrainSurface, type TerrainSurface } from "./player/terrainSurface";
import { CLIMBABLE_MAX_NORMAL_Y, CLIMBABLE_MIN_NORMAL_Y, CLIMB_IDLE_STAMINA_PER_SECOND, CLIMB_JUMP_COST, CLIMB_MOVE_STAMINA_PER_SECOND, CLIMB_REATTACH_DELAY, CLIMB_RELEASE_NORMAL_Y, CLIMB_SPEED, CLIMB_VERTICAL_SPEED, MANTLE_DURATION, WALKABLE_NORMAL_Y } from "./player/climbingConfig";

function floorDiv(a: bigint, b: bigint): bigint {
  let q = a / b;
  const r = a % b;
  if (r !== 0n && (r > 0n) !== (b > 0n)) q -= 1n;
  return q;
}

function sampleLocalSurface(chunks: Map<string, ChunkPayload>, tileX: bigint, tileY: bigint, localX: number, localZ: number): TerrainSurface | null {
  const wholeX = Math.floor(localX);
  const wholeZ = Math.floor(localZ);
  return sampleTerrainSurface(chunks, tileX + BigInt(wholeX), tileY + BigInt(wholeZ), localX - wholeX, localZ - wholeZ);
}

function isClimbableSurface(surface: TerrainSurface): boolean {
  if (surface.water) return false;
  if (!surface.walkable && surface.biome === 1) return true;
  return surface.normalY >= CLIMBABLE_MIN_NORMAL_Y && surface.normalY <= CLIMBABLE_MAX_NORMAL_Y;
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
  movementState: "idle" | "walk" | "run" | "jump" | "fall" | "swim" | "climbIdle" | "climb" | "mantle";
  swimming: boolean;
  climbing: boolean;
  mantling: boolean;
  climbNormalX: number;
  climbNormalY: number;
  climbNormalZ: number;
  health: number;
  stamina: number;
  cameraYaw: number;
  cameraZoom: number;
  fps: number;
  frameTimeMs: number;
  frameTimeMaxMs: number;
  drawCalls: number;
  triangles: number;
  geometries: number;
  textures: number;
};

export type PlayerInputState = {
  pressed: Set<string>;
  joystick: MoveInput;
  jumpQueued: boolean;
  mobileRun: boolean;
  interactQueued: boolean;
  attackQueued: boolean;
  skillQueued: boolean;
};

const FLOATING_ORIGIN_THRESHOLD = CHUNK_SIZE * 4;
const WATER_SURFACE_Y = -0.14;
const SWIM_PLAYER_Y = WATER_SURFACE_Y - 0.24;

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
  seedKey,
  onInventoryChange,
  onInteractionChange,
  onNotify,
  onMapEnemiesChange,
  onEnemyDefeated,
}: {
  chunks: ChunkPayload[];
  debug: boolean;
  onChunkChange: (cx: bigint, cy: bigint, direction?: { x: number; y: number }) => void;
  onStats: (state: GameState) => void;
  inputRef: MutableRefObject<PlayerInputState>;
  teleport: { x: bigint; y: bigint; token: number } | null;
  resetCameraToken: number;
  settings: GameSettings;
  paused: boolean;
  debugCollision: boolean;
  seedKey: string;
  onInventoryChange: (inventory: Inventory) => void;
  onInteractionChange: (label: string) => void;
  onNotify: (message: string) => void;
  onMapEnemiesChange: (enemies: MapEnemy[]) => void;
  onEnemyDefeated: (id: string) => void;
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
    swimming: false,
    climbing: false,
    mantling: false,
    climbNormalX: 0,
    climbNormalY: 1,
    climbNormalZ: 0,
    health: 100,
    stamina: 100,
    cameraYaw: Math.PI * 0.75,
    cameraZoom: 18,
    fps: 0,
    frameTimeMs: 0,
    frameTimeMaxMs: 0,
    drawCalls: 0,
    triangles: 0,
    geometries: 0,
    textures: 0,
  });
  const target = useRef<{ x: bigint; y: bigint } | null>(null);
  const pendingRebase = useRef<{ shiftX: number; shiftZ: number } | null>(null);
  const pendingTeleport = useRef<{ tileX: bigint; tileY: bigint; localX: number; localZ: number; height?: number } | null>(null);
  const [renderOrigin, setRenderOrigin] = useState({ cx: 0n, cy: 0n });
  const cameraAngles = useRef<CameraState>({ yaw: Math.PI * 0.75, pitch: DEFAULT_CAMERA_PITCH, distance: DEFAULT_CAMERA_DISTANCE, targetHeight: 1.15 });
  const fpsRef = useRef({ frames: 0, elapsed: 0, fps: 0, frameTimeMs: 0, frameTimeMaxMs: 0 });
  const swimKickUntil = useRef(0);
  const safeGround = useRef({ worldX: 8n, worldY: 8n, offsetX: 0, offsetZ: 0, height: 0 });
  const climbReattachAt = useRef(0);
  const mantle = useRef<{ elapsed: number; startX: number; startZ: number; startHeight: number; targetX: number; targetZ: number; targetHeight: number } | null>(null);
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
    onChunkChange(cx, cy, { x: 0, y: 0 });
  }, [onChunkChange, teleport]);

  useLayoutEffect(() => {
    const teleportState = pendingTeleport.current;
    if (teleportState) {
      game.current.tileX = teleportState.tileX;
      game.current.tileY = teleportState.tileY;
      game.current.localX = teleportState.localX;
      game.current.localZ = teleportState.localZ;
      if (teleportState.height !== undefined) game.current.height = teleportState.height;
      game.current.verticalVelocity = 0;
      game.current.grounded = true;
      game.current.swimming = false;
      game.current.climbing = false;
      game.current.mantling = false;
      mantle.current = null;
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
    inputRef.current.interactQueued = false;
    inputRef.current.attackQueued = false;
    inputRef.current.skillQueued = false;
    target.current = null;
  }, [inputRef, paused]);

  useEffect(() => {
    const resetInput = () => {
      inputRef.current.pressed.clear();
      inputRef.current.joystick = { x: 0, y: 0 };
      inputRef.current.jumpQueued = false;
      inputRef.current.mobileRun = false;
      inputRef.current.interactQueued = false;
      inputRef.current.attackQueued = false;
      inputRef.current.skillQueued = false;
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
      if (e.code === bindings.interact && !e.repeat) inputRef.current.interactQueued = true;
      if (e.code === bindings.attack && !e.repeat) inputRef.current.attackQueued = true;
      if (e.code === bindings.skill && !e.repeat) inputRef.current.skillQueued = true;
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

  useFrame((renderState, delta) => {
    const state = game.current;
    fpsRef.current.frames += 1;
    fpsRef.current.elapsed += delta;
    fpsRef.current.frameTimeMaxMs = Math.max(fpsRef.current.frameTimeMaxMs, delta * 1000);
    if (fpsRef.current.elapsed >= 0.5) {
      fpsRef.current.fps = Math.round(fpsRef.current.frames / fpsRef.current.elapsed);
      fpsRef.current.frameTimeMs = (fpsRef.current.elapsed / fpsRef.current.frames) * 1000;
      fpsRef.current.frames = 0;
      fpsRef.current.elapsed = 0;
      state.frameTimeMaxMs = fpsRef.current.frameTimeMaxMs;
      fpsRef.current.frameTimeMaxMs = 0;
    }
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
    const now = renderState.clock.elapsedTime;
    const currentSurface = sampleLocalSurface(chunkMap, state.tileX, state.tileY, state.localX, state.localZ);
    state.swimming = !state.climbing && !state.mantling && currentSurface?.water === true && state.height <= WATER_SURFACE_Y + 0.8;
    const requestedRun = settings.gameplay.autoRun || controls.mobileRun || controls.pressed.has(settings.controls.run);
    const running = requestedRun && state.stamina > 0.1;
    const moving = worldDx !== 0 || worldDz !== 0;
    const speed = state.swimming ? (state.stamina <= 0 ? 1.5 : running ? 4.8 : 2.8) : running ? 7.2 : 4.2;
    let groundHeight = currentSurface?.height ?? state.height;
    let moved = false;
    if (state.mantling && mantle.current) {
      const step = mantle.current;
      step.elapsed = Math.min(MANTLE_DURATION, step.elapsed + delta);
      const t = step.elapsed / MANTLE_DURATION;
      const eased = t * t * (3 - 2 * t);
      state.localX = step.startX + (step.targetX - step.startX) * eased;
      state.localZ = step.startZ + (step.targetZ - step.startZ) * eased;
      state.height = step.startHeight + (step.targetHeight - step.startHeight) * eased;
      if (t >= 1) {
        state.mantling = false;
        state.grounded = true;
        mantle.current = null;
      }
    } else if (state.climbing) {
      if (!currentSurface || currentSurface.water || state.stamina <= 0) {
        state.climbing = false;
        state.grounded = false;
        climbReattachAt.current = now + CLIMB_REATTACH_DELAY;
      } else if (controls.jumpQueued && state.stamina >= CLIMB_JUMP_COST) {
        state.stamina = Math.max(0, state.stamina - CLIMB_JUMP_COST);
        state.localX += state.climbNormalX * 0.18;
        state.localZ += state.climbNormalZ * 0.18;
        state.verticalVelocity = 4.6;
        state.climbing = false;
        state.grounded = false;
        climbReattachAt.current = now + CLIMB_REATTACH_DELAY;
      } else if (moving) {
        const desiredX = state.localX + worldDx * CLIMB_SPEED * delta;
        const desiredZ = state.localZ + worldDz * CLIMB_SPEED * delta;
        let nextSurface = sampleLocalSurface(chunkMap, state.tileX, state.tileY, desiredX, desiredZ);
        if (nextSurface?.walkable && nextSurface.normalY >= WALKABLE_NORMAL_Y) {
          if (nextSurface.height >= state.height - 0.08) {
            const mantleX = desiredX + worldDx * 0.22;
            const mantleZ = desiredZ + worldDz * 0.22;
            const mantleSurface = sampleLocalSurface(chunkMap, state.tileX, state.tileY, mantleX, mantleZ);
            if (mantleSurface?.walkable) {
              mantle.current = { elapsed: 0, startX: state.localX, startZ: state.localZ, startHeight: state.height, targetX: mantleX, targetZ: mantleZ, targetHeight: mantleSurface.height };
              state.climbing = false;
              state.mantling = true;
            }
          } else {
            state.localX = desiredX;
            state.localZ = desiredZ;
            state.height = nextSurface.height;
            state.climbing = false;
            state.grounded = true;
            moved = true;
          }
        } else if (nextSurface && !nextSurface.water && (isClimbableSurface(nextSurface) || nextSurface.normalY <= CLIMB_RELEASE_NORMAL_Y)) {
          const heightDelta = nextSurface.height - state.height;
          const maxHeightDelta = CLIMB_VERTICAL_SPEED * delta;
          const ratio = Math.min(1, maxHeightDelta / Math.max(Math.abs(heightDelta), 0.0001));
          const nextX = state.localX + (desiredX - state.localX) * ratio;
          const nextZ = state.localZ + (desiredZ - state.localZ) * ratio;
          nextSurface = sampleLocalSurface(chunkMap, state.tileX, state.tileY, nextX, nextZ);
          if (nextSurface && !nextSurface.water && (isClimbableSurface(nextSurface) || nextSurface.normalY <= CLIMB_RELEASE_NORMAL_Y)) {
            state.localX = nextX;
            state.localZ = nextZ;
            state.height = nextSurface.height;
            state.climbNormalX += (nextSurface.normalX - state.climbNormalX) * (1 - Math.exp(-14 * delta));
            state.climbNormalY += (nextSurface.normalY - state.climbNormalY) * (1 - Math.exp(-14 * delta));
            state.climbNormalZ += (nextSurface.normalZ - state.climbNormalZ) * (1 - Math.exp(-14 * delta));
            state.yaw = dampAngle(state.yaw, Math.atan2(-state.climbNormalX, -state.climbNormalZ), 12, delta);
            moved = true;
          }
        }
      }
      if (state.climbing) state.stamina = Math.max(0, state.stamina - (moving ? CLIMB_MOVE_STAMINA_PER_SECOND : CLIMB_IDLE_STAMINA_PER_SECOND) * delta);
      state.verticalVelocity = 0;
      state.grounded = state.climbing;
    } else {
      if (moving) {
        const nextX = state.localX + worldDx * speed * delta;
        const nextZ = state.localZ + worldDz * speed * delta;
        const sample = sampleLocalSurface(chunkMap, state.tileX, state.tileY, nextX, nextZ);
        if (sample && (sample.walkable || sample.water)) {
          state.localX = nextX;
          state.localZ = nextZ;
          groundHeight = sample.height;
          moved = true;
          state.yaw = dampAngle(state.yaw, Math.atan2(worldDx, worldDz), 14, delta);
        } else if (sample && isClimbableSurface(sample) && state.stamina >= 5 && now >= climbReattachAt.current) {
          state.climbing = true;
          state.grounded = true;
          state.verticalVelocity = 0;
          state.climbNormalX = sample.normalX;
          state.climbNormalY = sample.normalY;
          state.climbNormalZ = sample.normalZ;
          state.yaw = dampAngle(state.yaw, Math.atan2(-sample.normalX, -sample.normalZ), 12, delta);
        }
      }
      const finalSurface = sampleLocalSurface(chunkMap, state.tileX, state.tileY, state.localX, state.localZ);
      state.swimming = finalSurface?.water === true && state.height <= WATER_SURFACE_Y + 0.8;
      groundHeight = finalSurface?.height ?? groundHeight;
      if (controls.jumpQueued && state.swimming) {
        swimKickUntil.current = now + 0.42;
      } else if (controls.jumpQueued && state.grounded) {
        state.verticalVelocity = 6.8;
        state.grounded = false;
      }
      const staminaRate = state.swimming ? (moving && running ? -14 : -2) : moved && running ? -20 : 12;
      state.stamina = Math.max(0, Math.min(100, state.stamina + staminaRate * delta));
      if (state.swimming && state.stamina <= 0) state.health = Math.max(0, state.health - 8 * delta);
      if (state.swimming) {
        const kick = now < swimKickUntil.current ? Math.sin((swimKickUntil.current - now) * Math.PI / 0.42) * 0.1 : 0;
        state.height += (SWIM_PLAYER_Y + kick - state.height) * (1 - Math.exp(-10 * delta));
        state.verticalVelocity = 0;
        state.grounded = true;
      } else if (!state.grounded) {
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
    }
    controls.jumpQueued = false;
    const finalWorldX = state.tileX + BigInt(Math.floor(state.localX));
    const finalWorldY = state.tileY + BigInt(Math.floor(state.localZ));
    const finalSurface = sampleLocalSurface(chunkMap, state.tileX, state.tileY, state.localX, state.localZ);
    if (!state.swimming && finalSurface?.walkable && state.grounded) {
      safeGround.current = {
        worldX: finalWorldX,
        worldY: finalWorldY,
        offsetX: state.localX - Math.floor(state.localX),
        offsetZ: state.localZ - Math.floor(state.localZ),
        height: finalSurface.height,
      };
    }
    if (state.health <= 0 && !pendingTeleport.current) {
      const safe = safeGround.current;
      const safeCx = floorDiv(safe.worldX, BigInt(CHUNK_SIZE));
      const safeCy = floorDiv(safe.worldY, BigInt(CHUNK_SIZE));
      const safeTileX = safeCx * BigInt(CHUNK_SIZE);
      const safeTileY = safeCy * BigInt(CHUNK_SIZE);
      const respawn = {
        tileX: safeTileX,
        tileY: safeTileY,
        localX: Number(safe.worldX - safeTileX) + safe.offsetX,
        localZ: Number(safe.worldY - safeTileY) + safe.offsetZ,
        height: safe.height,
      };
      if (safeCx === renderOrigin.cx && safeCy === renderOrigin.cy) {
        state.tileX = respawn.tileX;
        state.tileY = respawn.tileY;
        state.localX = respawn.localX;
        state.localZ = respawn.localZ;
        state.height = respawn.height;
        state.verticalVelocity = 0;
        state.grounded = true;
      } else {
        pendingTeleport.current = respawn;
        setRenderOrigin({ cx: safeCx, cy: safeCy });
      }
      state.health = 100;
      state.stamina = 100;
      state.swimming = false;
      onChunkChange(safeCx, safeCy, { x: 0, y: 0 });
    }
    state.movementState = state.mantling
      ? "mantle"
      : state.climbing
      ? (moved ? "climb" : "climbIdle")
      : state.swimming
      ? "swim"
      : !state.grounded
      ? (state.verticalVelocity > 0 ? "jump" : "fall")
      : moved
        ? (running ? "run" : "walk")
        : "idle";
    if (!state.mantling && !pendingRebase.current && (Math.abs(state.localX) >= FLOATING_ORIGIN_THRESHOLD || Math.abs(state.localZ) >= FLOATING_ORIGIN_THRESHOLD)) {
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
    onChunkChange(cx, cy, { x: worldDx, y: worldDz });
    state.cameraYaw = cameraAngles.current.yaw;
    state.cameraZoom = cameraAngles.current.distance;
    state.fps = fpsRef.current.fps;
    state.frameTimeMs = fpsRef.current.frameTimeMs;
    state.drawCalls = renderState.gl.info.render.calls;
    state.triangles = renderState.gl.info.render.triangles;
    state.geometries = renderState.gl.info.memory.geometries;
    state.textures = renderState.gl.info.memory.textures;
    onStats(state);
  });

  const originCx = renderOrigin.cx;
  const originCy = renderOrigin.cy;
  return (
    <>
      <WorldRenderer chunks={chunks} originCx={originCx} originCy={originCy} debug={debug} graphics={settings.graphics} player={game} />
      {settings.graphics.decorativeGrass && <GrassRing chunks={chunks} originCx={originCx} originCy={originCy} player={game} density={settings.graphics.vegetationDensity} />}
      <EntitySystem
        chunks={chunks}
        originCx={originCx}
        originCy={originCy}
        player={game}
        actions={inputRef}
        seedKey={seedKey}
        onInventoryChange={onInventoryChange}
        onInteractionChange={onInteractionChange}
        onNotify={onNotify}
        onMapEnemiesChange={onMapEnemiesChange}
        onEnemyDefeated={onEnemyDefeated}
      />
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
  onChunkChange: (cx: bigint, cy: bigint, direction?: { x: number; y: number }) => void;
  onStats: (state: GameState) => void;
  teleport: { x: bigint; y: bigint; token: number } | null;
  resetCameraToken: number;
  settings: GameSettings;
  paused: boolean;
  debugCollision: boolean;
  seedKey: string;
  onInventoryChange: (inventory: Inventory) => void;
  onInteractionChange: (label: string) => void;
  onNotify: (message: string) => void;
  onMapEnemiesChange: (enemies: MapEnemy[]) => void;
  onEnemyDefeated: (id: string) => void;
}) {
  const inputRef = useRef<PlayerInputState>({ pressed: new Set(), joystick: { x: 0, y: 0 }, jumpQueued: false, mobileRun: false, interactQueued: false, attackQueued: false, skillQueued: false });
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
          seedKey={props.seedKey}
          onInventoryChange={props.onInventoryChange}
          onInteractionChange={props.onInteractionChange}
          onNotify={props.onNotify}
          onMapEnemiesChange={props.onMapEnemiesChange}
          onEnemyDefeated={props.onEnemyDefeated}
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
        onInteract={() => { inputRef.current.interactQueued = true; }}
        onAttack={() => { inputRef.current.attackQueued = true; }}
        onSkill={() => { inputRef.current.skillQueued = true; }}
      />
    </div>
  );
});
