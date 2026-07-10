import { SALTS } from "../constants";
import { Biome } from "../types";
import { HybridMatrixWorld } from "./hybridWorld";

export function smoothstep(t: number): number {
  return t * t * (3 - 2 * t);
}

export function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

export function sampleHeight(world: HybridMatrixWorld, x: bigint, y: bigint): number {
  return (
    0.52 * world.valueNoise(x, y, 96n, SALTS.heightA) +
    0.3 * world.valueNoise(x, y, 37n, SALTS.heightB) +
    0.18 * world.valueNoise(x, y, 13n, SALTS.heightC)
  );
}

export function sampleMoisture(world: HybridMatrixWorld, x: bigint, y: bigint): number {
  return 0.72 * world.valueNoise(x, y, 71n, SALTS.moistureA) + 0.28 * world.valueNoise(x, y, 19n, SALTS.moistureB);
}

export function classifyBiome(height: number, moisture: number): Biome {
  if (height < 0.29) return "water";
  if (height > 0.8) return "mountain";
  if (height < 0.34) return "sand";
  if (moisture > 0.67) return "forest";
  if (moisture < 0.34) return "soil";
  return "grass";
}

export function terrainElevation(height: number): number {
  if (height < 0.29) return -0.35 + height * 0.6;
  if (height > 0.8) return 1.6 + (height - 0.8) * 14;
  return (height - 0.29) * 3.6;
}
