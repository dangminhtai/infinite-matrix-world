import { CHUNK_SIZE } from "../constants";
import { BIOME_IDS } from "../types";
import { classifyBiome, sampleHeight, sampleMoisture } from "../world/noise";
import type { HybridMatrixWorld } from "../world/hybridWorld";

export type MapTile = {
  cx: string;
  cy: string;
  biomes: Uint8Array;
};

export function generateMapTile(world: HybridMatrixWorld, cx: bigint, cy: bigint): MapTile {
  const biomes = new Uint8Array(CHUNK_SIZE * CHUNK_SIZE);
  const baseX = cx * BigInt(CHUNK_SIZE);
  const baseY = cy * BigInt(CHUNK_SIZE);
  for (let y = 0; y < CHUNK_SIZE; y += 1) {
    for (let x = 0; x < CHUNK_SIZE; x += 1) {
      const worldX = baseX + BigInt(x);
      const worldY = baseY + BigInt(y);
      biomes[y * CHUNK_SIZE + x] = BIOME_IDS[classifyBiome(sampleHeight(world, worldX, worldY), sampleMoisture(world, worldX, worldY))];
    }
  }
  return { cx: cx.toString(), cy: cy.toString(), biomes };
}
