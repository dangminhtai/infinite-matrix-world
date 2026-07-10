import type { Matrix } from "./world/matrix";

export type WorldCoordinate = bigint;
export type ChunkCoordinate = bigint;

export type Biome = "water" | "mountain" | "forest" | "soil" | "sand" | "grass";
export type BiomeId = 0 | 1 | 2 | 3 | 4 | 5;

export const BIOME_IDS: Record<Biome, BiomeId> = {
  water: 0,
  mountain: 1,
  forest: 2,
  soil: 3,
  sand: 4,
  grass: 5,
};

export const BIOME_NAMES: readonly Biome[] = ["water", "mountain", "forest", "soil", "sand", "grass"] as const;

export type WorldPosition = {
  tileX: bigint;
  tileY: bigint;
  offsetX: number;
  offsetY: number;
};

export type DecorInstance = {
  x: number;
  y: number;
  z: number;
  scale: number;
  rotation: number;
  id: string;
};

export type ChunkPayload = {
  cx: string;
  cy: string;
  size: number;
  heights: Float32Array;
  biomes: Uint8Array;
  walkable: Uint8Array;
  terrainPositions: Float32Array;
  terrainNormals: Float32Array;
  terrainColors: Float32Array;
  terrainIndices: Uint32Array;
  trees: DecorInstance[];
  rocks: DecorInstance[];
  flowers: DecorInstance[];
  payloadBytes: number;
  waterPhase: number;
  hash: string;
  state: string[][];
  durationMs: number;
};

export type ChunkStateEntry = {
  cx: bigint;
  cy: bigint;
  state: Matrix;
};

export type WorkerStatus = "idle" | "loading" | "ready" | "error";
