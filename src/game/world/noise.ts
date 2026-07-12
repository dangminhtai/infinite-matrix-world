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
  const warpX = BigInt(Math.round((world.valueNoise(x, y, 181n, SALTS.heightA + 41n) - 0.5) * 18));
  const warpY = BigInt(Math.round((world.valueNoise(x, y, 173n, SALTS.heightB + 43n) - 0.5) * 18));
  const warpedX = x + warpX;
  const warpedY = y + warpY;
  const base =
    0.52 * world.valueNoise(warpedX, warpedY, 96n, SALTS.heightA) +
    0.3 * world.valueNoise(warpedX, warpedY, 37n, SALTS.heightB) +
    0.18 * world.valueNoise(warpedX, warpedY, 13n, SALTS.heightC);
  const ridgeSource = world.valueNoise(warpedX, warpedY, 29n, SALTS.heightC + 47n);
  const ridge = 1 - Math.abs(ridgeSource * 2 - 1);
  const mountainMask = smoothstep(Math.max(0, Math.min(1, (base - 0.66) / 0.24)));
  return Math.max(0, Math.min(1, base + mountainMask * (ridge * ridge - 0.42) * 0.13));
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
  if (height > 0.8) {
    const mountain = (height - 0.8) / 0.2;
    return 1.6 + mountain * 4.8 + mountain * mountain * 3.4;
  }
  return (height - 0.29) * 3.6;
}
