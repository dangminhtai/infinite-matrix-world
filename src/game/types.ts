import type { Matrix } from "./world/matrix";

export type WorldCoordinate = bigint;
export type ChunkCoordinate = bigint;

export type Biome = "water" | "mountain" | "forest" | "soil" | "sand" | "grass";

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
  heights: number[];
  biomes: Biome[];
  walkable: boolean[];
  trees: DecorInstance[];
  rocks: DecorInstance[];
  flowers: DecorInstance[];
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
