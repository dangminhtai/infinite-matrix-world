import { CHUNK_SIZE } from "../constants";
import type { ChunkPayload } from "../types";

export function sampleChunkHeight(chunks: Map<string, ChunkPayload>, wx: bigint, wy: bigint): { height: number; walkable: boolean } | null {
  const cx = wx >= 0n ? wx / BigInt(CHUNK_SIZE) : (wx - BigInt(CHUNK_SIZE - 1)) / BigInt(CHUNK_SIZE);
  const cy = wy >= 0n ? wy / BigInt(CHUNK_SIZE) : (wy - BigInt(CHUNK_SIZE - 1)) / BigInt(CHUNK_SIZE);
  const chunk = chunks.get(`${cx},${cy}`);
  if (!chunk) return null;
  const lx = Number(wx - cx * BigInt(CHUNK_SIZE));
  const ly = Number(wy - cy * BigInt(CHUNK_SIZE));
  const clampedX = Math.max(0, Math.min(CHUNK_SIZE - 1, lx));
  const clampedY = Math.max(0, Math.min(CHUNK_SIZE - 1, ly));
  return {
    height: chunk.heights[clampedY * (CHUNK_SIZE + 1) + clampedX] ?? 0,
    walkable: (chunk.walkable[clampedY * CHUNK_SIZE + clampedX] ?? 0) === 1,
  };
}
