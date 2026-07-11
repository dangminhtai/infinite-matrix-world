import { useEffect, useMemo, useRef, type MutableRefObject } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";
import { CHUNK_SIZE } from "../constants";
import type { GameState, PlayerInputState } from "../GameCanvas";
import type { ChunkPayload } from "../types";
import { addInventoryItem, addModification, loadWorldSave, saveWorld, type Inventory } from "../core/SaveManager";
import { spawnChunkEntities, type SpawnedEntity } from "../spawn/deterministicSpawn";
import type { MapEnemy } from "../map/types";

type RuntimeEntity = SpawnedEntity & {
  hp: number;
  moveX: number;
  moveZ: number;
  lastAttackAt: number;
  lastUsedAt: number;
};

const MAX_ACTIVE_ENTITIES = 512;

function floorDiv(value: bigint, divisor: bigint): bigint {
  let quotient = value / divisor;
  if (value < 0n && value % divisor !== 0n) quotient -= 1n;
  return quotient;
}

function entityLabel(entity: RuntimeEntity): string {
  if (entity.kind === "collectible") return "Nhặt tinh thể";
  if (entity.kind === "chest") return "Mở rương";
  if (entity.kind === "healing") return "Hồi phục";
  return "";
}

export function EntitySystem({
  chunks,
  originCx,
  originCy,
  player,
  actions,
  seedKey,
  onInventoryChange,
  onInteractionChange,
  onNotify,
  onMapEnemiesChange,
  onEnemyDefeated,
}: {
  chunks: ChunkPayload[];
  originCx: bigint;
  originCy: bigint;
  player: MutableRefObject<GameState>;
  actions: MutableRefObject<PlayerInputState>;
  seedKey: string;
  onInventoryChange: (inventory: Inventory) => void;
  onInteractionChange: (label: string) => void;
  onNotify: (message: string) => void;
  onMapEnemiesChange: (enemies: MapEnemy[]) => void;
  onEnemyDefeated: (id: string) => void;
}) {
  const collectibleRef = useRef<THREE.InstancedMesh>(null);
  const chestRef = useRef<THREE.InstancedMesh>(null);
  const healingRef = useRef<THREE.InstancedMesh>(null);
  const enemyRef = useRef<THREE.InstancedMesh>(null);
  const dummy = useMemo(() => new THREE.Object3D(), []);
  const saveRef = useRef(loadWorldSave(seedKey));
  const entitiesRef = useRef(new Map<string, RuntimeEntity>());
  const activeIds = useRef(new Set<string>());
  const interactionLabelRef = useRef("");
  const skillReadyAt = useRef(0);
  const lastMapUpdateAt = useRef(0);
  const spawns = useMemo(() => chunks.flatMap(spawnChunkEntities), [chunks]);

  useEffect(() => {
    saveRef.current = loadWorldSave(seedKey);
    entitiesRef.current.clear();
    activeIds.current.clear();
    onInventoryChange({ ...saveRef.current.inventory });
  }, [onInventoryChange, seedKey]);

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
        entitiesRef.current.set(spawn.id, { ...spawn, hp: spawn.kind === "enemy" ? 100 : 1, moveX: 0, moveZ: 0, lastAttackAt: 0, lastUsedAt: 0 });
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
    let chestCount = 0;
    let healingCount = 0;
    let enemyCount = 0;
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
          state.health = Math.max(0, state.health - 8);
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
        dummy.scale.setScalar(0.18);
        dummy.updateMatrix();
        collectibleRef.current?.setMatrixAt(collectibleCount++, dummy.matrix);
      } else if (entity.kind === "chest") {
        dummy.scale.set(0.65, 0.42, 0.48);
        dummy.updateMatrix();
        chestRef.current?.setMatrixAt(chestCount++, dummy.matrix);
      } else if (entity.kind === "healing") {
        dummy.rotation.y = now * 0.6;
        dummy.scale.set(0.24, 0.55, 0.24);
        dummy.updateMatrix();
        healingRef.current?.setMatrixAt(healingCount++, dummy.matrix);
      } else {
        dummy.position.y += Math.sin(now * 3 + entity.phase) * 0.06;
        dummy.scale.setScalar(0.55);
        dummy.updateMatrix();
        enemyRef.current?.setMatrixAt(enemyCount++, dummy.matrix);
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

    const nextLabel = nearestInteraction ? entityLabel(nearestInteraction) : "";
    if (nextLabel !== interactionLabelRef.current) {
      interactionLabelRef.current = nextLabel;
      onInteractionChange(nextLabel);
    }

    const save = saveRef.current;
    if (actions.current.interactQueued && nearestInteraction) {
      if (nearestInteraction.kind === "collectible") {
        addModification(save.collected, nearestInteraction.id);
        addInventoryItem(save, "matrix_crystal", 1);
        onNotify("Đã nhận Tinh thể ma trận");
        activeIds.current.delete(nearestInteraction.id);
      } else if (nearestInteraction.kind === "chest") {
        addModification(save.openedChests, nearestInteraction.id);
        addInventoryItem(save, "matrix_shard", 3);
        onNotify("Rương: +3 Mảnh ma trận");
        activeIds.current.delete(nearestInteraction.id);
      } else if (nearestInteraction.kind === "healing" && now - nearestInteraction.lastUsedAt > 3) {
        nearestInteraction.lastUsedAt = now;
        state.health = 100;
        onNotify("Đã hồi phục hoàn toàn");
      }
      saveWorld(seedKey, save);
      onInventoryChange({ ...save.inventory });
    }
    actions.current.interactQueued = false;

    const damageEnemy = (entity: RuntimeEntity, damage: number) => {
      entity.hp -= damage;
      if (entity.hp > 0) return;
      addModification(save.defeatedEnemies, entity.id);
      addInventoryItem(save, "echo_core", 1);
      activeIds.current.delete(entity.id);
      onEnemyDefeated(entity.id);
      saveWorld(seedKey, save);
      onInventoryChange({ ...save.inventory });
      onNotify("Đã đánh bại Echo");
    };
    if (actions.current.attackQueued && nearestEnemy && nearestEnemyDistance <= 2.2) damageEnemy(nearestEnemy, 34);
    actions.current.attackQueued = false;
    if (actions.current.skillQueued && now >= skillReadyAt.current) {
      skillReadyAt.current = now + 5;
      for (const id of [...activeIds.current]) {
        const entity = entitiesRef.current.get(id);
        if (!entity || entity.kind !== "enemy") continue;
        const x = Number(entity.worldX - originX) + entity.offsetX + entity.moveX;
        const z = Number(entity.worldY - originY) + entity.offsetZ + entity.moveZ;
        if (Math.hypot(x - state.localX, z - state.localZ) <= 3.5) damageEnemy(entity, 52);
      }
      onNotify("Kỹ năng đã kích hoạt");
    }
    actions.current.skillQueued = false;

    const updateMesh = (mesh: THREE.InstancedMesh | null, count: number) => {
      if (!mesh) return;
      mesh.count = Math.min(count, MAX_ACTIVE_ENTITIES);
      mesh.instanceMatrix.needsUpdate = true;
    };
    updateMesh(collectibleRef.current, collectibleCount);
    updateMesh(chestRef.current, chestCount);
    updateMesh(healingRef.current, healingCount);
    updateMesh(enemyRef.current, enemyCount);
  });

  return <group>
    <instancedMesh ref={collectibleRef} args={[undefined, undefined, MAX_ACTIVE_ENTITIES]} frustumCulled={false}><octahedronGeometry args={[1, 0]} /><meshStandardMaterial color="#55d6d0" emissive="#174d55" emissiveIntensity={0.8} /></instancedMesh>
    <instancedMesh ref={chestRef} args={[undefined, undefined, MAX_ACTIVE_ENTITIES]} frustumCulled={false}><boxGeometry args={[1, 1, 1]} /><meshStandardMaterial color="#b57a37" roughness={0.72} /></instancedMesh>
    <instancedMesh ref={healingRef} args={[undefined, undefined, MAX_ACTIVE_ENTITIES]} frustumCulled={false}><cylinderGeometry args={[0.55, 0.55, 1, 8]} /><meshStandardMaterial color="#79df9a" emissive="#225f3b" emissiveIntensity={0.65} /></instancedMesh>
    <instancedMesh ref={enemyRef} args={[undefined, undefined, MAX_ACTIVE_ENTITIES]} castShadow frustumCulled={false}><dodecahedronGeometry args={[1, 0]} /><meshStandardMaterial color="#b84d69" roughness={0.62} /></instancedMesh>
  </group>;
}
