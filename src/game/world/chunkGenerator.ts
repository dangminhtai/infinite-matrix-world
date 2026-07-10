import { CHUNK_SIZE, SALTS } from "../constants";
import { Biome, ChunkPayload, DecorInstance } from "../types";
import { matrixToStrings } from "./matrix";
import { HybridMatrixWorld } from "./hybridWorld";
import { classifyBiome, sampleHeight, sampleMoisture, terrainElevation } from "./noise";
import { hashBigInts } from "./coordinateHash";

function idFor(cx: bigint, cy: bigint, lx: number, ly: number, type: string): string {
  return `${cx}:${cy}:${lx}:${ly}:${type}`;
}

function pushDecor(list: DecorInstance[], world: HybridMatrixWorld, wx: bigint, wy: bigint, lx: number, ly: number, salt: bigint, type: string, y: number): void {
  const jitterX = world.unitRandom(wx, wy, salt + 1n) - 0.5;
  const jitterY = world.unitRandom(wx, wy, salt + 2n) - 0.5;
  list.push({
    x: lx + 0.5 + jitterX * 0.45,
    y,
    z: ly + 0.5 + jitterY * 0.45,
    scale: 0.75 + world.unitRandom(wx, wy, salt + 3n) * 0.65,
    rotation: world.unitRandom(wx, wy, salt + 4n) * Math.PI * 2,
    id: idFor(wx / BigInt(CHUNK_SIZE), wy / BigInt(CHUNK_SIZE), lx, ly, type),
  });
}

export function generateChunk(world: HybridMatrixWorld, cx: bigint, cy: bigint): ChunkPayload {
  const started = performance.now();
  const size = CHUNK_SIZE;
  const heights: number[] = [];
  const biomes: Biome[] = [];
  const walkable: boolean[] = [];
  const trees: DecorInstance[] = [];
  const rocks: DecorInstance[] = [];
  const flowers: DecorInstance[] = [];
  const hashParts: bigint[] = [cx, cy];

  for (let z = 0; z <= size; z += 1) {
    for (let x = 0; x <= size; x += 1) {
      const wx = cx * BigInt(size) + BigInt(x);
      const wy = cy * BigInt(size) + BigInt(z);
      const h = sampleHeight(world, wx, wy);
      heights.push(terrainElevation(h));
      hashParts.push(BigInt(Math.round(h * 1_000_000)));
    }
  }

  for (let z = 0; z < size; z += 1) {
    for (let x = 0; x < size; x += 1) {
      const wx = cx * BigInt(size) + BigInt(x);
      const wy = cy * BigInt(size) + BigInt(z);
      const h = sampleHeight(world, wx, wy);
      const moisture = sampleMoisture(world, wx, wy);
      const biome = classifyBiome(h, moisture);
      const canWalk = biome !== "water" && biome !== "mountain";
      const elevation = terrainElevation(h);
      biomes.push(biome);
      walkable.push(canWalk);
      hashParts.push(BigInt(Math.round(moisture * 1_000_000)));

      if (biome === "forest" && world.unitRandom(wx, wy, SALTS.tree) < 0.26) pushDecor(trees, world, wx, wy, x, z, SALTS.tree, "tree", elevation);
      if (biome !== "water" && world.unitRandom(wx, wy, SALTS.rock) < (biome === "mountain" ? 0.34 : 0.035)) pushDecor(rocks, world, wx, wy, x, z, SALTS.rock, "rock", elevation);
      if ((biome === "grass" || biome === "sand") && world.unitRandom(wx, wy, SALTS.flower) < 0.045) pushDecor(flowers, world, wx, wy, x, z, SALTS.flower, "flower", elevation);
    }
  }

  return {
    cx: cx.toString(),
    cy: cy.toString(),
    size,
    heights,
    biomes,
    walkable,
    trees,
    rocks,
    flowers,
    waterPhase: world.unitRandom(cx, cy, SALTS.waterPhase),
    hash: hashBigInts(hashParts),
    state: matrixToStrings(world.chunkState(cx, cy)),
    durationMs: performance.now() - started,
  };
}
