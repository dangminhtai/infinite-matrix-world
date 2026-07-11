import { CHUNK_SIZE } from "../constants";
import type { ChunkPayload } from "../types";

export type EntityKind = "collectible" | "chest" | "healing" | "enemy";

export type SpawnedEntity = {
  id: string;
  kind: EntityKind;
  worldX: bigint;
  worldY: bigint;
  offsetX: number;
  offsetZ: number;
  height: number;
  phase: number;
};

function hash32(value: string): number {
  let hash = 2166136261;
  for (let i = 0; i < value.length; i += 1) {
    hash ^= value.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

function findWalkableCell(chunk: ChunkPayload, salt: string): number | null {
  const start = hash32(`${chunk.hash}:${salt}`) % (CHUNK_SIZE * CHUNK_SIZE);
  for (let attempt = 0; attempt < CHUNK_SIZE * CHUNK_SIZE; attempt += 1) {
    const index = (start + attempt * 73) % (CHUNK_SIZE * CHUNK_SIZE);
    if (chunk.walkable[index] === 1) return index;
  }
  return null;
}

function spawnOne(chunk: ChunkPayload, kind: EntityKind, salt: string): SpawnedEntity | null {
  const cell = findWalkableCell(chunk, salt);
  if (cell === null) return null;
  const lx = cell % CHUNK_SIZE;
  const lz = Math.floor(cell / CHUNK_SIZE);
  const worldX = BigInt(chunk.cx) * BigInt(CHUNK_SIZE) + BigInt(lx);
  const worldY = BigInt(chunk.cy) * BigInt(CHUNK_SIZE) + BigInt(lz);
  return {
    id: `${chunk.cx}:${chunk.cy}:${kind}:${salt}`,
    kind,
    worldX,
    worldY,
    offsetX: 0.5,
    offsetZ: 0.5,
    height: chunk.heights[lz * (CHUNK_SIZE + 1) + lx] ?? 0,
    phase: (hash32(`${chunk.hash}:${kind}:${salt}`) / 0xffffffff) * Math.PI * 2,
  };
}

export function spawnChunkEntities(chunk: ChunkPayload): SpawnedEntity[] {
  const entities: SpawnedEntity[] = [];
  const collectibleA = spawnOne(chunk, "collectible", "resource-a");
  const collectibleB = spawnOne(chunk, "collectible", "resource-b");
  if (collectibleA) entities.push(collectibleA);
  if (collectibleB) entities.push(collectibleB);
  if (hash32(`${chunk.hash}:chest`) % 3 === 0) {
    const chest = spawnOne(chunk, "chest", "chest");
    if (chest) entities.push(chest);
  }
  if (hash32(`${chunk.hash}:healing`) % 4 === 0) {
    const healing = spawnOne(chunk, "healing", "healing");
    if (healing) entities.push(healing);
  }
  if (hash32(`${chunk.hash}:enemy`) % 2 === 0) {
    const enemy = spawnOne(chunk, "enemy", "enemy");
    if (enemy) entities.push(enemy);
  }
  return entities;
}
