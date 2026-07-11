import { CHUNK_SIZE, SALTS, TERRAIN_VISUAL_SUBDIVISIONS } from "../constants";
import { BIOME_IDS, BiomeId, ChunkPayload, DecorInstance } from "../types";
import { matrixToStrings } from "./matrix";
import { HybridMatrixWorld } from "./hybridWorld";
import { classifyBiome, sampleHeight, sampleMoisture, terrainElevation } from "./noise";
import { hashBigInts } from "./coordinateHash";

const biomeColors: Record<BiomeId, [number, number, number]> = {
  0: [0.29, 0.64, 0.87],
  1: [0.55, 0.56, 0.58],
  2: [0.18, 0.56, 0.31],
  3: [0.61, 0.46, 0.33],
  4: [0.85, 0.76, 0.49],
  5: [0.44, 0.75, 0.33],
};

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

function logicHeightAt(heights: Float32Array, size: number, x: number, z: number): number {
  return heights[z * (size + 1) + x] ?? 0;
}

function bilinearHeight(heights: Float32Array, size: number, x: number, z: number): number {
  const x0 = Math.max(0, Math.min(size, Math.floor(x)));
  const z0 = Math.max(0, Math.min(size, Math.floor(z)));
  const x1 = Math.max(0, Math.min(size, x0 + 1));
  const z1 = Math.max(0, Math.min(size, z0 + 1));
  const tx = x - x0;
  const tz = z - z0;
  const h00 = logicHeightAt(heights, size, x0, z0);
  const h10 = logicHeightAt(heights, size, x1, z0);
  const h01 = logicHeightAt(heights, size, x0, z1);
  const h11 = logicHeightAt(heights, size, x1, z1);
  const a = h00 + (h10 - h00) * tx;
  const b = h01 + (h11 - h01) * tx;
  return a + (b - a) * tz;
}

function writeNormal(normals: Float32Array, index: number, left: number, right: number, down: number, up: number, step: number): void {
  const nx = left - right;
  const ny = step * 2;
  const nz = down - up;
  const length = Math.hypot(nx, ny, nz) || 1;
  normals[index] = nx / length;
  normals[index + 1] = ny / length;
  normals[index + 2] = nz / length;
}

function createTerrainGeometry(world: HybridMatrixWorld, cx: bigint, cy: bigint, heights: Float32Array, biomes: Uint8Array): {
  terrainPositions: Float32Array;
  terrainNormals: Float32Array;
  terrainColors: Float32Array;
  terrainIndices: Uint32Array;
} {
  const size = CHUNK_SIZE;
  const subdivisions = TERRAIN_VISUAL_SUBDIVISIONS;
  const row = subdivisions + 1;
  const coreVertexCount = row * row;
  const skirtVertexCount = row * 4;
  const vertexCount = coreVertexCount + skirtVertexCount;
  const step = size / subdivisions;
  const skirtDrop = 2.5;
  const terrainPositions = new Float32Array(vertexCount * 3);
  const terrainNormals = new Float32Array(vertexCount * 3);
  const terrainColors = new Float32Array(vertexCount * 3);
  const expandedRow = row + 2;
  const visualHeights = new Float32Array(expandedRow * expandedRow);
  const terrainIndices = new Uint32Array((subdivisions * subdivisions + subdivisions * 4) * 6);

  const visualHeightAt = (gridX: number, gridZ: number): number => {
    const localX = gridX * step;
    const localZ = gridZ * step;
    const floorX = Math.floor(localX);
    const floorZ = Math.floor(localZ);
    const fractionalX = localX - floorX;
    const fractionalZ = localZ - floorZ;
    let baseHeight: number;
    if (gridX >= 0 && gridX <= subdivisions && gridZ >= 0 && gridZ <= subdivisions) {
      baseHeight = bilinearHeight(heights, size, localX, localZ);
    } else {
      const wx = cx * BigInt(size) + BigInt(floorX);
      const wy = cy * BigInt(size) + BigInt(floorZ);
      const h00 = terrainElevation(sampleHeight(world, wx, wy));
      const h10 = terrainElevation(sampleHeight(world, wx + 1n, wy));
      const h01 = terrainElevation(sampleHeight(world, wx, wy + 1n));
      const h11 = terrainElevation(sampleHeight(world, wx + 1n, wy + 1n));
      const a = h00 + (h10 - h00) * fractionalX;
      const b = h01 + (h11 - h01) * fractionalX;
      baseHeight = a + (b - a) * fractionalZ;
    }
    const detailMask = Math.sin(Math.PI * fractionalX) * Math.sin(Math.PI * fractionalZ);
    const detailX = cx * BigInt(subdivisions) + BigInt(gridX);
    const detailZ = cy * BigInt(subdivisions) + BigInt(gridZ);
    const detail = (world.unitRandom(detailX, detailZ, SALTS.heightC + 17n) - 0.5) * 0.18 * detailMask;
    return baseHeight + detail;
  };

  for (let z = -1; z <= subdivisions + 1; z += 1) {
    for (let x = -1; x <= subdivisions + 1; x += 1) {
      visualHeights[(z + 1) * expandedRow + x + 1] = visualHeightAt(x, z);
    }
  }

  for (let z = 0; z <= subdivisions; z += 1) {
    for (let x = 0; x <= subdivisions; x += 1) {
      const localX = x * step;
      const localZ = z * step;
      const logicX = Math.min(size - 1, Math.floor(localX));
      const logicZ = Math.min(size - 1, Math.floor(localZ));
      const height = visualHeights[(z + 1) * expandedRow + x + 1];
      const vertexIndex = z * row + x;
      const stride = vertexIndex * 3;
      terrainPositions[stride] = localX;
      terrainPositions[stride + 1] = height;
      terrainPositions[stride + 2] = localZ;

      const biome = (biomes[logicZ * size + logicX] ?? BIOME_IDS.grass) as BiomeId;
      const color = biomeColors[biome];
      const highlandTint = Math.max(0, Math.min(0.22, height * 0.035));
      terrainColors[stride] = Math.min(1, color[0] + highlandTint);
      terrainColors[stride + 1] = Math.min(1, color[1] + highlandTint);
      terrainColors[stride + 2] = Math.min(1, color[2] + highlandTint);
    }
  }

  for (let z = 0; z <= subdivisions; z += 1) {
    for (let x = 0; x <= subdivisions; x += 1) {
      const vertexIndex = z * row + x;
      const expandedX = x + 1;
      const expandedZ = z + 1;
      const left = visualHeights[expandedZ * expandedRow + expandedX - 1];
      const right = visualHeights[expandedZ * expandedRow + expandedX + 1];
      const down = visualHeights[(expandedZ - 1) * expandedRow + expandedX];
      const up = visualHeights[(expandedZ + 1) * expandedRow + expandedX];
      writeNormal(terrainNormals, vertexIndex * 3, left, right, down, up, step);
    }
  }

  let i = 0;
  for (let z = 0; z < subdivisions; z += 1) {
    for (let x = 0; x < subdivisions; x += 1) {
      const a = z * row + x;
      const b = a + 1;
      const c = a + row;
      const d = c + 1;
      terrainIndices[i++] = a;
      terrainIndices[i++] = c;
      terrainIndices[i++] = b;
      terrainIndices[i++] = b;
      terrainIndices[i++] = c;
      terrainIndices[i++] = d;
    }
  }

  let nextVertex = coreVertexCount;
  const addSkirtVertex = (sourceIndex: number): number => {
    const sourceStride = sourceIndex * 3;
    const targetIndex = nextVertex++;
    const targetStride = targetIndex * 3;
    terrainPositions[targetStride] = terrainPositions[sourceStride];
    terrainPositions[targetStride + 1] = terrainPositions[sourceStride + 1] - skirtDrop;
    terrainPositions[targetStride + 2] = terrainPositions[sourceStride + 2];
    terrainNormals[targetStride] = terrainNormals[sourceStride];
    terrainNormals[targetStride + 1] = terrainNormals[sourceStride + 1];
    terrainNormals[targetStride + 2] = terrainNormals[sourceStride + 2];
    terrainColors[targetStride] = terrainColors[sourceStride] * 0.58;
    terrainColors[targetStride + 1] = terrainColors[sourceStride + 1] * 0.58;
    terrainColors[targetStride + 2] = terrainColors[sourceStride + 2] * 0.58;
    return targetIndex;
  };

  const addSkirtStrip = (edge: number[]): void => {
    const lowered = edge.map(addSkirtVertex);
    for (let n = 0; n < edge.length - 1; n += 1) {
      const a = edge[n];
      const b = edge[n + 1];
      const c = lowered[n];
      const d = lowered[n + 1];
      terrainIndices[i++] = b;
      terrainIndices[i++] = d;
      terrainIndices[i++] = a;
      terrainIndices[i++] = c;
      terrainIndices[i++] = a;
      terrainIndices[i++] = d;
    }
  };

  addSkirtStrip(Array.from({ length: row }, (_, x) => x));
  addSkirtStrip(Array.from({ length: row }, (_, x) => subdivisions * row + x));
  addSkirtStrip(Array.from({ length: row }, (_, z) => z * row));
  addSkirtStrip(Array.from({ length: row }, (_, z) => z * row + subdivisions));

  return { terrainPositions, terrainNormals, terrainColors, terrainIndices };
}

export function generateChunk(world: HybridMatrixWorld, cx: bigint, cy: bigint): ChunkPayload {
  const started = performance.now();
  const size = CHUNK_SIZE;
  const heights = new Float32Array((size + 1) * (size + 1));
  const biomes = new Uint8Array(size * size);
  const walkable = new Uint8Array(size * size);
  const trees: DecorInstance[] = [];
  const rocks: DecorInstance[] = [];
  const flowers: DecorInstance[] = [];
  const hashParts: bigint[] = [cx, cy];

  for (let z = 0; z <= size; z += 1) {
    for (let x = 0; x <= size; x += 1) {
      const wx = cx * BigInt(size) + BigInt(x);
      const wy = cy * BigInt(size) + BigInt(z);
      const h = sampleHeight(world, wx, wy);
      heights[z * (size + 1) + x] = terrainElevation(h);
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
      const cellIndex = z * size + x;
      biomes[cellIndex] = BIOME_IDS[biome];
      walkable[cellIndex] = canWalk ? 1 : 0;
      hashParts.push(BigInt(Math.round(moisture * 1_000_000)));

      if (biome === "forest" && world.unitRandom(wx, wy, SALTS.tree) < 0.26) pushDecor(trees, world, wx, wy, x, z, SALTS.tree, "tree", elevation);
      if (biome !== "water" && world.unitRandom(wx, wy, SALTS.rock) < (biome === "mountain" ? 0.34 : 0.035)) pushDecor(rocks, world, wx, wy, x, z, SALTS.rock, "rock", elevation);
      if ((biome === "grass" || biome === "sand") && world.unitRandom(wx, wy, SALTS.flower) < 0.045) pushDecor(flowers, world, wx, wy, x, z, SALTS.flower, "flower", elevation);
    }
  }

  const terrain = createTerrainGeometry(world, cx, cy, heights, biomes);

  return {
    cx: cx.toString(),
    cy: cy.toString(),
    size,
    heights,
    biomes,
    walkable,
    terrainPositions: terrain.terrainPositions,
    terrainNormals: terrain.terrainNormals,
    terrainColors: terrain.terrainColors,
    terrainIndices: terrain.terrainIndices,
    trees,
    rocks,
    flowers,
    payloadBytes:
      heights.byteLength +
      biomes.byteLength +
      walkable.byteLength +
      terrain.terrainPositions.byteLength +
      terrain.terrainNormals.byteLength +
      terrain.terrainColors.byteLength +
      terrain.terrainIndices.byteLength,
    waterPhase: world.unitRandom(cx, cy, SALTS.waterPhase),
    hash: hashBigInts(hashParts),
    state: matrixToStrings(world.chunkState(cx, cy)),
    durationMs: performance.now() - started,
  };
}
