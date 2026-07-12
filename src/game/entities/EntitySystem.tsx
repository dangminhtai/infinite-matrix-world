import { Suspense, useEffect, useMemo, useRef, type MutableRefObject } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";
import { CHUNK_SIZE } from "../constants";
import type { GameState, PlayerInputState } from "../GameCanvas";
import type { ChunkPayload } from "../types";
import { addModification, loadWorldSave, saveWorld } from "../core/SaveManager";
import { spawnChunkEntities, type SpawnedEntity } from "../spawn/deterministicSpawn";
import type { MapEnemy } from "../map/types";
import { CollectibleInstances, type CollectibleInstancesHandle } from "./CollectibleInstances";
import { EntityModelErrorBoundary } from "./EntityModelErrorBoundary";
import { SlimeInstances, type SlimeInstancesHandle, type SlimeKind } from "./SlimeInstances";
import type { CharacterStats } from "../characters/characterProgression";

type RuntimeEntity = SpawnedEntity & {
  hp: number;
  maxHP: number;
  level: number;
  atk: number;
  def: number;
  moveX: number;
  moveZ: number;
  lastAttackAt: number;
  lastUsedAt: number;
};

export type EnemyCombatState = {
  id: string;
  name: string;
  level: number;
  hp: number;
  maxHP: number;
} | null;

const MAX_ACTIVE_ENTITIES = 512;

function floorDiv(value: bigint, divisor: bigint): bigint {
  let quotient = value / divisor;
  if (value < 0n && value % divisor !== 0n) quotient -= 1n;
  return quotient;
}

function entityLabel(entity: RuntimeEntity): string {
  if (entity.kind === "collectible") return "Nhặt Nguyên Thạch";
  if (entity.kind === "chest") return "Mở rương";
  if (entity.kind === "healing") return "Hồi phục";
  return "";
}

function slimeKind(entity: RuntimeEntity): SlimeKind {
  return Math.min(2, Math.floor((entity.phase / (Math.PI * 2)) * 3)) as SlimeKind;
}

const SLIME_NAMES = ["Slime Băng", "Slime Hỏa", "Slime Lôi"] as const;
const SLIME_BASE_STATS = [
  { hp: 150, atk: 22, def: 28 },
  { hp: 125, atk: 30, def: 18 },
  { hp: 135, atk: 26, def: 22 },
] as const;

function slimeLevel(entity: SpawnedEntity): number {
  const cx = floorDiv(entity.worldX, BigInt(CHUNK_SIZE));
  const cy = floorDiv(entity.worldY, BigInt(CHUNK_SIZE));
  const distance = (cx < 0n ? -cx : cx) > (cy < 0n ? -cy : cy) ? (cx < 0n ? -cx : cx) : (cy < 0n ? -cy : cy);
  return distance >= 1188n ? 100 : Math.min(100, 1 + Number(distance / 12n));
}

function createRuntimeEntity(spawn: SpawnedEntity): RuntimeEntity {
  if (spawn.kind !== "enemy") return { ...spawn, hp: 1, maxHP: 1, level: 1, atk: 0, def: 0, moveX: 0, moveZ: 0, lastAttackAt: 0, lastUsedAt: 0 };
  const kind = Math.min(2, Math.floor((spawn.phase / (Math.PI * 2)) * 3)) as SlimeKind;
  const level = slimeLevel(spawn);
  const base = SLIME_BASE_STATS[kind];
  const maxHP = Math.round(base.hp * (1 + 0.055 * (level - 1)));
  return {
    ...spawn,
    hp: maxHP,
    maxHP,
    level,
    atk: Math.round(base.atk * (1 + 0.035 * (level - 1))),
    def: Math.round(base.def * (1 + 0.03 * (level - 1))),
    moveX: 0,
    moveZ: 0,
    lastAttackAt: 0,
    lastUsedAt: 0,
  };
}

function reducedDamage(attack: number, defense: number, multiplier = 1): number {
  return Math.max(1, Math.round(attack * multiplier * 100 / (100 + Math.max(0, defense))));
}

export function EntitySystem({
  chunks,
  originCx,
  originCy,
  player,
  actions,
  seedKey,
  playerStats,
  onReward,
  onInteractionChange,
  onNotify,
  onMapEnemiesChange,
  onEnemyDefeated,
  onEnemyCombatChange,
  detailedModels,
}: {
  chunks: ChunkPayload[];
  originCx: bigint;
  originCy: bigint;
  player: MutableRefObject<GameState>;
  actions: MutableRefObject<PlayerInputState>;
  seedKey: string;
  playerStats: CharacterStats;
  onReward: (itemId: "primogem" | "mora" | "slime_condensate", amount: number) => void;
  onInteractionChange: (label: string) => void;
  onNotify: (message: string) => void;
  onMapEnemiesChange: (enemies: MapEnemy[]) => void;
  onEnemyDefeated: (id: string) => void;
  onEnemyCombatChange: (enemy: EnemyCombatState) => void;
  detailedModels: boolean;
}) {
  const collectibleRef = useRef<THREE.InstancedMesh>(null);
  const primogemRef = useRef<CollectibleInstancesHandle>(null);
  const chestRef = useRef<THREE.InstancedMesh>(null);
  const healingRef = useRef<THREE.InstancedMesh>(null);
  const enemyRef = useRef<THREE.InstancedMesh>(null);
  const slimeRef = useRef<SlimeInstancesHandle>(null);
  const dummy = useMemo(() => new THREE.Object3D(), []);
  const saveRef = useRef(loadWorldSave(seedKey));
  const entitiesRef = useRef(new Map<string, RuntimeEntity>());
  const activeIds = useRef(new Set<string>());
  const interactionLabelRef = useRef("");
  const skillReadyAt = useRef(0);
  const lastMapUpdateAt = useRef(0);
  const lastCombatUpdateAt = useRef(0);
  const spawns = useMemo(() => chunks.flatMap(spawnChunkEntities), [chunks]);
  const hasEnemySpawns = useMemo(() => spawns.some((spawn) => spawn.kind === "enemy"), [spawns]);
  const hasCollectibleSpawns = useMemo(() => spawns.some((spawn) => spawn.kind === "collectible"), [spawns]);

  useEffect(() => {
    saveRef.current = loadWorldSave(seedKey);
    entitiesRef.current.clear();
    activeIds.current.clear();
  }, [seedKey]);

  useEffect(() => {
    const save = saveRef.current;
    const collected = new Set(save.collected);
    const opened = new Set(save.openedChests);
    const defeated = new Set(save.defeatedEnemies);
    const nextIds = new Set<string>();
    for (const spawn of spawns) {
      if (spawn.kind === "collectible" && collected.has(spawn.id)) continue;
      if (spawn.kind === "chest" && opened.has(spawn.id)) continue;
      if (spawn.kind === "enemy" && defeated.has(spawn.id)) continue;
      nextIds.add(spawn.id);
      if (!entitiesRef.current.has(spawn.id)) {
        entitiesRef.current.set(spawn.id, createRuntimeEntity(spawn));
      }
    }
    for (const id of entitiesRef.current.keys()) if (!nextIds.has(id)) entitiesRef.current.delete(id);
    activeIds.current = nextIds;
  }, [spawns]);

  useFrame(({ clock }, delta) => {
    const state = player.current;
    const now = clock.elapsedTime;
    const originX = originCx * BigInt(CHUNK_SIZE);
    const originY = originCy * BigInt(CHUNK_SIZE);
    const playerWorldX = state.tileX + BigInt(Math.floor(state.localX));
    const playerWorldY = state.tileY + BigInt(Math.floor(state.localZ));
    let collectibleCount = 0;
    let collectibleFallbackCount = 0;
    let chestCount = 0;
    let chestFallbackCount = 0;
    let healingCount = 0;
    let enemyCount = 0;
    const slimeCounts: [number, number, number] = [0, 0, 0];
    let nearestInteraction: RuntimeEntity | null = null;
    let nearestInteractionDistance = Infinity;
    let nearestEnemy: RuntimeEntity | null = null;
    let nearestEnemyDistance = Infinity;
    const mapEnemies: MapEnemy[] = [];

    for (const id of activeIds.current) {
      const entity = entitiesRef.current.get(id);
      if (!entity) continue;
      const chunkDistance = Math.max(
        Math.abs(Number(floorDiv(entity.worldX, BigInt(CHUNK_SIZE)) - floorDiv(playerWorldX, BigInt(CHUNK_SIZE)))),
        Math.abs(Number(floorDiv(entity.worldY, BigInt(CHUNK_SIZE)) - floorDiv(playerWorldY, BigInt(CHUNK_SIZE)))),
      );
      let localX = Number(entity.worldX - originX) + entity.offsetX + entity.moveX;
      let localZ = Number(entity.worldY - originY) + entity.offsetZ + entity.moveZ;
      let distance = Math.hypot(localX - state.localX, localZ - state.localZ);

      if (entity.kind === "enemy" && chunkDistance <= 1) {
        if (!state.swimming && distance < 7 && Math.hypot(entity.moveX, entity.moveZ) < 8) {
          const dx = (state.localX - localX) / Math.max(distance, 0.001);
          const dz = (state.localZ - localZ) / Math.max(distance, 0.001);
          entity.moveX += dx * 1.45 * delta;
          entity.moveZ += dz * 1.45 * delta;
        } else {
          const returnDistance = Math.hypot(entity.moveX, entity.moveZ);
          if (returnDistance > 1.2) {
            entity.moveX -= (entity.moveX / returnDistance) * Math.min(returnDistance, delta * 0.9);
            entity.moveZ -= (entity.moveZ / returnDistance) * Math.min(returnDistance, delta * 0.9);
          } else {
            entity.moveX = Math.sin(now * 0.45 + entity.phase) * 0.35;
            entity.moveZ = Math.cos(now * 0.4 + entity.phase) * 0.35;
          }
        }
        localX = Number(entity.worldX - originX) + entity.offsetX + entity.moveX;
        localZ = Number(entity.worldY - originY) + entity.offsetZ + entity.moveZ;
        distance = Math.hypot(localX - state.localX, localZ - state.localZ);
        if (distance < 1.1 && now - entity.lastAttackAt > 1.2) {
          entity.lastAttackAt = now;
          state.health = Math.max(0, state.health - reducedDamage(entity.atk, playerStats.def));
        }
      }

      if (entity.kind === "enemy" && distance < nearestEnemyDistance) {
        nearestEnemy = entity;
        nearestEnemyDistance = distance;
      } else if (entity.kind !== "enemy" && distance < 2 && distance < nearestInteractionDistance) {
        nearestInteraction = entity;
        nearestInteractionDistance = distance;
      }

      dummy.position.set(localX, entity.height + (entity.kind === "enemy" ? 0.42 : entity.kind === "chest" ? 0.24 : 0.38), localZ);
      dummy.rotation.set(0, entity.phase, 0);
      if (entity.kind === "collectible") {
        dummy.position.y += Math.sin(now * 2 + entity.phase) * 0.1;
        dummy.rotation.y = now * 0.85 + entity.phase;
        dummy.scale.setScalar(0.3);
        dummy.updateMatrix();
        if (primogemRef.current) {
          primogemRef.current.setMatrixAt(collectibleCount++, dummy.matrix);
        } else {
          dummy.scale.setScalar(0.18);
          dummy.updateMatrix();
          collectibleRef.current?.setMatrixAt(collectibleFallbackCount++, dummy.matrix);
          collectibleCount += 1;
        }
      } else if (entity.kind === "chest") {
        dummy.scale.set(0.65, 0.42, 0.48);
        dummy.updateMatrix();
        chestRef.current?.setMatrixAt(chestFallbackCount++, dummy.matrix);
        chestCount += 1;
      } else if (entity.kind === "healing") {
        dummy.rotation.y = now * 0.6;
        dummy.scale.set(0.24, 0.55, 0.24);
        dummy.updateMatrix();
        healingRef.current?.setMatrixAt(healingCount++, dummy.matrix);
      } else {
        dummy.position.y += Math.sin(now * 3 + entity.phase) * 0.06;
        dummy.scale.setScalar(1);
        dummy.updateMatrix();
        if (slimeRef.current) {
          const kind = slimeKind(entity);
          slimeRef.current.setMatrixAt(kind, slimeCounts[kind]++, dummy.matrix);
        } else {
          dummy.scale.setScalar(0.55);
          dummy.updateMatrix();
          enemyRef.current?.setMatrixAt(enemyCount++, dummy.matrix);
        }
        mapEnemies.push({
          id: entity.id,
          worldX: entity.worldX.toString(),
          worldY: entity.worldY.toString(),
          offsetX: entity.offsetX + entity.moveX,
          offsetY: entity.offsetZ + entity.moveZ,
        });
      }
    }

    if (now - lastMapUpdateAt.current >= 0.25) {
      lastMapUpdateAt.current = now;
      onMapEnemiesChange(mapEnemies);
    }
    if (now - lastCombatUpdateAt.current >= 0.15) {
      lastCombatUpdateAt.current = now;
      if (nearestEnemy && nearestEnemyDistance <= 8) {
        const kind = slimeKind(nearestEnemy);
        onEnemyCombatChange({ id: nearestEnemy.id, name: SLIME_NAMES[kind], level: nearestEnemy.level, hp: Math.max(0, nearestEnemy.hp), maxHP: nearestEnemy.maxHP });
      } else onEnemyCombatChange(null);
    }

    const nextLabel = nearestInteraction ? entityLabel(nearestInteraction) : "";
    if (nextLabel !== interactionLabelRef.current) {
      interactionLabelRef.current = nextLabel;
      onInteractionChange(nextLabel);
    }

    const save = saveRef.current;
    if (actions.current.interactQueued && nearestInteraction) {
      if (nearestInteraction.kind === "collectible") {
        addModification(save.collected, nearestInteraction.id);
        onReward("primogem", 1);
        onNotify("Đã nhận 1 Nguyên Thạch");
        activeIds.current.delete(nearestInteraction.id);
      } else if (nearestInteraction.kind === "chest") {
        addModification(save.openedChests, nearestInteraction.id);
        onReward("mora", 500);
        onNotify("Rương: +500 Mora");
        activeIds.current.delete(nearestInteraction.id);
      } else if (nearestInteraction.kind === "healing" && now - nearestInteraction.lastUsedAt > 3) {
        nearestInteraction.lastUsedAt = now;
        state.health = state.maxHealth;
        onNotify("Đã hồi phục hoàn toàn");
      }
      saveWorld(seedKey, save);
    }
    actions.current.interactQueued = false;

    const damageEnemy = (entity: RuntimeEntity, damage: number) => {
      entity.hp -= damage;
      if (entity.hp > 0) return;
      addModification(save.defeatedEnemies, entity.id);
      onReward("slime_condensate", 1);
      activeIds.current.delete(entity.id);
      onEnemyDefeated(entity.id);
      saveWorld(seedKey, save);
      onNotify("Đã nhận 1 Dịch Slime");
    };
    if (actions.current.attackQueued && nearestEnemy && nearestEnemyDistance <= 2.2) damageEnemy(nearestEnemy, reducedDamage(playerStats.atk, nearestEnemy.def, 0.75));
    actions.current.attackQueued = false;
    if (actions.current.skillQueued && now >= skillReadyAt.current) {
      skillReadyAt.current = now + 5;
      for (const id of [...activeIds.current]) {
        const entity = entitiesRef.current.get(id);
        if (!entity || entity.kind !== "enemy") continue;
        const x = Number(entity.worldX - originX) + entity.offsetX + entity.moveX;
        const z = Number(entity.worldY - originY) + entity.offsetZ + entity.moveZ;
        if (Math.hypot(x - state.localX, z - state.localZ) <= 3.5) damageEnemy(entity, reducedDamage(playerStats.atk, entity.def, 1.35));
      }
      onNotify("Kỹ năng đã kích hoạt");
    }
    actions.current.skillQueued = false;

    const updateMesh = (mesh: THREE.InstancedMesh | null, count: number) => {
      if (!mesh) return;
      mesh.count = Math.min(count, MAX_ACTIVE_ENTITIES);
      mesh.instanceMatrix.needsUpdate = true;
    };
    updateMesh(collectibleRef.current, collectibleFallbackCount);
    updateMesh(chestRef.current, chestFallbackCount);
    updateMesh(healingRef.current, healingCount);
    updateMesh(enemyRef.current, enemyCount);
    primogemRef.current?.commit(collectibleCount - collectibleFallbackCount);
    slimeRef.current?.commit(slimeCounts);
  });

  return <group>
    <instancedMesh ref={collectibleRef} args={[undefined, undefined, MAX_ACTIVE_ENTITIES]} frustumCulled={false}><tetrahedronGeometry args={[1, 0]} /><meshStandardMaterial color="#d8a6ff" emissive="#5d2f82" emissiveIntensity={0.7} /></instancedMesh>
    <instancedMesh ref={chestRef} args={[undefined, undefined, MAX_ACTIVE_ENTITIES]} frustumCulled={false}><boxGeometry args={[1, 1, 1]} /><meshStandardMaterial color="#b57a37" roughness={0.72} /></instancedMesh>
    <instancedMesh ref={healingRef} args={[undefined, undefined, MAX_ACTIVE_ENTITIES]} frustumCulled={false}><cylinderGeometry args={[0.55, 0.55, 1, 8]} /><meshStandardMaterial color="#79df9a" emissive="#225f3b" emissiveIntensity={0.65} /></instancedMesh>
    <instancedMesh ref={enemyRef} args={[undefined, undefined, MAX_ACTIVE_ENTITIES]} castShadow frustumCulled={false}><dodecahedronGeometry args={[1, 0]} /><meshStandardMaterial color="#b84d69" roughness={0.62} /></instancedMesh>
    {detailedModels && hasEnemySpawns && <EntityModelErrorBoundary>
      <Suspense fallback={null}>
        <SlimeInstances ref={slimeRef} maxCount={MAX_ACTIVE_ENTITIES} />
      </Suspense>
    </EntityModelErrorBoundary>}
    {detailedModels && hasCollectibleSpawns && <EntityModelErrorBoundary>
      <Suspense fallback={null}>
        <CollectibleInstances ref={primogemRef} maxCount={MAX_ACTIVE_ENTITIES} />
      </Suspense>
    </EntityModelErrorBoundary>}
  </group>;
}
