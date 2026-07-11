import { CHUNK_SIZE } from "../constants";
import type { ChunkPayload } from "../types";

export type TerrainSurface = {
  height: number;
  normalX: number;
  normalY: number;
  normalZ: number;
  walkable: boolean;
  water: boolean;
  biome: number;
};

function floorDiv(value: bigint, divisor: bigint): bigint {
  let quotient = value / divisor;
  if (value < 0n && value % divisor !== 0n) quotient -= 1n;
  return quotient;
}

function vertexHeight(chunks: Map<string, ChunkPayload>, wx: bigint, wy: bigint): number | null {
  const size = BigInt(CHUNK_SIZE);
  const cx = floorDiv(wx, size);
  const cy = floorDiv(wy, size);
  const chunk = chunks.get(`${cx},${cy}`);
  if (!chunk) return null;
  const lx = Number(wx - cx * size);
  const ly = Number(wy - cy * size);
  return chunk.heights[ly * (CHUNK_SIZE + 1) + lx] ?? null;
}

export function sampleTerrainSurface(chunks: Map<string, ChunkPayload>, wx: bigint, wy: bigint, offsetX = 0, offsetY = 0): TerrainSurface | null {
  const h00 = vertexHeight(chunks, wx, wy);
  const h10 = vertexHeight(chunks, wx + 1n, wy);
  const h01 = vertexHeight(chunks, wx, wy + 1n);
  const h11 = vertexHeight(chunks, wx + 1n, wy + 1n);
  if (h00 === null || h10 === null || h01 === null || h11 === null) return null;

  const fx = Math.max(0, Math.min(1, offsetX));
  const fy = Math.max(0, Math.min(1, offsetY));
  const top = h00 + (h10 - h00) * fx;
  const bottom = h01 + (h11 - h01) * fx;
  const height = top + (bottom - top) * fy;
  const dhdx = (h10 - h00) * (1 - fy) + (h11 - h01) * fy;
  const dhdz = (h01 - h00) * (1 - fx) + (h11 - h10) * fx;
  const length = Math.hypot(dhdx, 1, dhdz);

  const size = BigInt(CHUNK_SIZE);
  const cx = floorDiv(wx, size);
  const cy = floorDiv(wy, size);
  const chunk = chunks.get(`${cx},${cy}`);
  if (!chunk) return null;
  const lx = Number(wx - cx * size);
  const ly = Number(wy - cy * size);
  const index = ly * CHUNK_SIZE + lx;
  const biome = chunk.biomes[index] ?? 0;
  return {
    height,
    normalX: -dhdx / length,
    normalY: 1 / length,
    normalZ: -dhdz / length,
    walkable: (chunk.walkable[index] ?? 0) === 1,
    water: biome === 0,
    biome,
  };
}
