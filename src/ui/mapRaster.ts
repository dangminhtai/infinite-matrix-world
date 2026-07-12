import type { BiomeId } from "../game/types";

const COLORS: Record<BiomeId, [number, number, number]> = {
  0: [74, 163, 223],
  1: [163, 167, 173],
  2: [47, 143, 78],
  3: [155, 118, 83],
  4: [217, 194, 124],
  5: [113, 191, 84],
};

function smoothstep(value: number): number {
  const t = Math.max(0, Math.min(1, value));
  return t * t * (3 - 2 * t);
}

type CachedBiomeTile = {
  key: string;
  canvas: HTMLCanvasElement;
  lastUsed: number;
};

const biomeCache = new Map<string, CachedBiomeTile>();
const MAX_CACHE_SIZE = 64;

function evictOldCacheEntries(): void {
  if (biomeCache.size <= MAX_CACHE_SIZE) return;
  const entries = Array.from(biomeCache.entries()).sort((a, b) => a[1].lastUsed - b[1].lastUsed);
  const toRemove = entries.slice(0, biomeCache.size - MAX_CACHE_SIZE);
  for (const [key] of toRemove) {
    biomeCache.delete(key);
  }
}

function getCachedBiomeTile(
  key: string,
  size: number,
  getBiome: (x: bigint, y: bigint) => BiomeId | null,
  baseX: bigint,
  baseY: bigint
): HTMLCanvasElement {
  const now = performance.now();
  const cached = biomeCache.get(key);
  if (cached) {
    cached.lastUsed = now;
    return cached.canvas;
  }

  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext("2d");
  if (!ctx) return canvas;

  const image = ctx.createImageData(size, size);
  const background: [number, number, number] = [23, 36, 42];

  for (let py = 0; py < size; py += 1) {
    const ty = py / size;
    for (let px = 0; px < size; px += 1) {
      const tx = px / size;
      const ids = [
        getBiome(baseX, baseY),
        getBiome(baseX + 1n, baseY),
        getBiome(baseX, baseY + 1n),
        getBiome(baseX + 1n, baseY + 1n),
      ];
      const colors = ids.map((id) => id === null ? background : COLORS[id]);
      const target = (py * size + px) * 4;
      const smoothTx = smoothstep(tx);
      const smoothTy = smoothstep(ty);
      for (let channel = 0; channel < 3; channel += 1) {
        const top = colors[0][channel] + (colors[1][channel] - colors[0][channel]) * smoothTx;
        const bottom = colors[2][channel] + (colors[3][channel] - colors[2][channel]) * smoothTx;
        image.data[target + channel] = Math.round(top + (bottom - top) * smoothTy);
      }
      image.data[target + 3] = 255;
    }
  }
  ctx.putImageData(image, 0, 0);
  biomeCache.set(key, { key, canvas, lastUsed: now });
  evictOldCacheEntries();
  return canvas;
}

export function drawSmoothBiomeLayer({
  ctx,
  width,
  height,
  centerX,
  centerY,
  residualX = 0,
  residualY = 0,
  pixelsPerTile,
  resolutionScale = 1,
  getBiome,
}: {
  ctx: CanvasRenderingContext2D;
  width: number;
  height: number;
  centerX: bigint;
  centerY: bigint;
  residualX?: number;
  residualY?: number;
  pixelsPerTile: number;
  resolutionScale?: number;
  getBiome: (x: bigint, y: bigint) => BiomeId | null;
}): void {
  const tilesPerScreen = Math.ceil(Math.max(width, height) / pixelsPerTile) + 2;
  const tileSize = 32;
  
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = "high";
  ctx.save();

  for (let ty = -tilesPerScreen; ty <= tilesPerScreen; ty += 1) {
    for (let tx = -tilesPerScreen; tx <= tilesPerScreen; tx += 1) {
      const worldX = centerX + BigInt(tx);
      const worldY = centerY + BigInt(ty);
      const key = `${worldX},${worldY}`;
      const tileCanvas = getCachedBiomeTile(key, tileSize, getBiome, worldX, worldY);
      
      const screenX = width / 2 + residualX + tx * pixelsPerTile;
      const screenY = height / 2 + residualY + ty * pixelsPerTile;
      
      ctx.drawImage(tileCanvas, screenX, screenY, pixelsPerTile, pixelsPerTile);
    }
  }

  ctx.restore();
}
