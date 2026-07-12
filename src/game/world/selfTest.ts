import { CHUNK_SIZE, DEFAULT_SEED, MAX_CHUNK_STATES, MAX_RANDOM_CACHE, P, TERRAIN_VISUAL_SUBDIVISIONS } from "../constants";
import { applyTransform, invertTransform } from "./recurrence";
import { HybridMatrixWorld, floorDiv } from "./hybridWorld";
import { matMul, matPow } from "./matrix";
import { generateChunk } from "./chunkGenerator";
import { QualityManager } from "../core/QualityManager";
import { generateMapTile } from "../map/mapTile";
import { calculateMapMinScale, MAP_ZOOM_MAX_SCALE, zoomLevelToScale } from "../map/mapZoom";
import { sampleTerrainSurface } from "../player/terrainSurface";
import { migrateInventory } from "../core/SaveManager";

function assert(condition: unknown, message: string): void {
  if (!condition) throw new Error(`selfTest failed: ${message}`);
}

function sameMatrix(a: bigint[][], b: bigint[][]): boolean {
  return a.length === b.length && a.every((row, i) => row.length === b[i].length && row.every((value, j) => value === b[i][j]));
}

export function selfTest(): string[] {
  const passed: string[] = [];
  const vOld = [1n, 2n];
  const vNow = [3n, 4n];
  const vNext = applyTransform(vNow, vOld);
  assert(vNext[0] === P - 2n && vNext[1] === 14n, "recurrence forward");
  assert(invertTransform(vNow, vNext).every((v, i) => v === vOld[i]), "recurrence inverse");
  passed.push("Recurrence");

  const world = new HybridMatrixWorld(DEFAULT_SEED);
  assert(sameMatrix(matMul(matMul(world.a, world.seed), world.b), matMul(world.a, matMul(world.seed, world.b))), "path independence");
  passed.push("Path independence");

  const directEast = matMul(matPow(world.a, 1n), world.seed);
  const directWest = matMul(matPow(world.a, -1n), world.seed);
  const directSouth = matMul(world.seed, matPow(world.b, 1n));
  const directNorth = matMul(world.seed, matPow(world.b, -1n));
  assert(sameMatrix(world.chunkState(1n, 0n), directEast), "east neighbor");
  assert(sameMatrix(world.chunkState(-1n, 0n), directWest), "west neighbor");
  assert(sameMatrix(world.chunkState(0n, 1n), directSouth), "south neighbor");
  assert(sameMatrix(world.chunkState(0n, -1n), directNorth), "north neighbor");
  passed.push("Neighbor movement");

  const points = [
    [0n, 0n],
    [-17n, 31n],
    [10n ** 80n + 123n, -(10n ** 75n) + 7n],
  ] as const;
  const before = points.map(([cx, cy]) => generateChunk(world, cx, cy).hash);
  world.clearCaches();
  const after = points.map(([cx, cy]) => generateChunk(world, cx, cy).hash);
  assert(before.every((hash, i) => hash === after[i]), "regeneration");
  passed.push("Regeneration");

  const chunkA = generateChunk(world, 0n, 0n);
  const chunkB = generateChunk(world, 1n, 0n);
  for (let z = 0; z <= CHUNK_SIZE; z += 1) {
    const rightA = chunkA.heights[z * (CHUNK_SIZE + 1) + CHUNK_SIZE];
    const leftB = chunkB.heights[z * (CHUNK_SIZE + 1)];
    assert(Math.abs(rightA - leftB) < 1e-9, "chunk seam");
  }
  const visualRow = TERRAIN_VISUAL_SUBDIVISIONS + 1;
  for (let z = 0; z <= TERRAIN_VISUAL_SUBDIVISIONS; z += 1) {
    const rightA = (z * visualRow + TERRAIN_VISUAL_SUBDIVISIONS) * 3;
    const leftB = z * visualRow * 3;
    for (let axis = 0; axis < 3; axis += 1) {
      assert(Math.abs(chunkA.terrainNormals[rightA + axis] - chunkB.terrainNormals[leftB + axis]) < 1e-6, "chunk normal seam");
    }
  }
  passed.push("Chunk seam");

  const surfaceChunks = new Map([["0,0", chunkA], ["1,0", chunkB]]);
  const seamLeft = sampleTerrainSurface(surfaceChunks, BigInt(CHUNK_SIZE - 1), 4n, 0.999999, 0.5);
  const seamRight = sampleTerrainSurface(surfaceChunks, BigInt(CHUNK_SIZE), 4n, 0.000001, 0.5);
  if (!seamLeft || !seamRight) throw new Error("selfTest failed: terrain surface seam loaded");
  assert(Math.abs(seamLeft.height - seamRight.height) < 1e-4, "terrain surface height seam");
  assert(Math.abs(seamLeft.normalY - seamRight.normalY) < 0.15, "terrain surface normal seam");
  passed.push("Terrain surface");

  const mapTile = generateMapTile(world, 0n, 0n);
  assert(mapTile.biomes.length === chunkA.biomes.length, "map tile size");
  assert(mapTile.biomes.every((biome, index) => biome === chunkA.biomes[index]), "map tile matches world chunk");
  passed.push("Map tile");

  const desktopMinScale = calculateMapMinScale(1920, 1080);
  const fourKMinScale = calculateMapMinScale(3840, 2160);
  assert(fourKMinScale > desktopMinScale, "map zoom tightens for larger viewport");
  assert(zoomLevelToScale(0, desktopMinScale) === desktopMinScale, "map zoom minimum");
  assert(zoomLevelToScale(100, desktopMinScale) === MAP_ZOOM_MAX_SCALE, "map zoom maximum");
  assert(zoomLevelToScale(50, desktopMinScale) > desktopMinScale, "map zoom midpoint");
  passed.push("Map zoom");

  for (let i = 0; i < MAX_CHUNK_STATES + 20; i += 1) world.chunkState(BigInt(i * 1000), BigInt(-i * 977));
  assert(world.chunkCache.size <= MAX_CHUNK_STATES, "cache bound");
  assert(world.randomCache.size <= MAX_RANDOM_CACHE, "random cache bound");
  passed.push("Cache bound");

  let origin = 0n;
  let local = 0;
  for (let i = 0; i < 30; i += 1) {
    local += 9.25;
    if (Math.abs(local) > 64) {
      const shift = BigInt(Math.trunc(local));
      origin += shift;
      local -= Number(shift);
    }
  }
  assert(origin + BigInt(Math.trunc(local)) === 277n, "floating origin accounting");
  assert(floorDiv(-1n, BigInt(CHUNK_SIZE)) === -1n, "negative floor div");
  passed.push("Floating origin");

  const qualityStart = performance.now();
  const degradingQuality = new QualityManager("auto", "high");
  assert(degradingQuality.sample(20, qualityStart + 4_001, 60) === "medium", "auto quality degrades one level");
  const improvingQuality = new QualityManager("auto", "low");
  improvingQuality.sample(60, qualityStart + 4_001, 60);
  improvingQuality.sample(60, qualityStart + 8_002, 60);
  assert(improvingQuality.sample(60, qualityStart + 12_003, 60) === "medium", "auto quality raises after stable windows");
  passed.push("Quality manager");

  const migrated = migrateInventory({ matrix_crystal: 2, matrix_shard: 3, echo_core: 4, mora: 25 });
  assert(migrated.primogem === 2, "inventory primogem migration");
  assert(migrated.mora === 325, "inventory mora migration");
  assert(migrated.slime_condensate === 4, "inventory slime migration");
  assert(!("matrix_crystal" in migrated) && !("matrix_shard" in migrated) && !("echo_core" in migrated), "legacy inventory removed");
  const migratedTwice = migrateInventory(migrated);
  assert(migratedTwice.primogem === 2 && migratedTwice.mora === 325 && migratedTwice.slime_condensate === 4, "inventory migration idempotent");
  passed.push("Inventory migration");

  return passed;
}
