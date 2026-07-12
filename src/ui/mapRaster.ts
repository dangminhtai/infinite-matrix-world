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
  blurPixels = 0,
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
  blurPixels?: number;
  getBiome: (x: bigint, y: bigint) => BiomeId | null;
}): void {
  const rasterWidth = Math.max(1, Math.ceil(width * resolutionScale));
  const rasterHeight = Math.max(1, Math.ceil(height * resolutionScale));
  const canvas = document.createElement("canvas");
  canvas.width = rasterWidth;
  canvas.height = rasterHeight;
  const raster = canvas.getContext("2d");
  if (!raster) return;
  const image = raster.createImageData(rasterWidth, rasterHeight);
  const background: [number, number, number] = [23, 36, 42];

  for (let py = 0; py < rasterHeight; py += 1) {
    const screenY = (py + 0.5) / resolutionScale;
    const worldOffsetY = (screenY - height / 2 - residualY) / pixelsPerTile;
    const cellOffsetY = Math.floor(worldOffsetY);
    const ty = smoothstep(worldOffsetY - cellOffsetY);
    const worldY = centerY + BigInt(cellOffsetY);
    for (let px = 0; px < rasterWidth; px += 1) {
      const screenX = (px + 0.5) / resolutionScale;
      const worldOffsetX = (screenX - width / 2 - residualX) / pixelsPerTile;
      const cellOffsetX = Math.floor(worldOffsetX);
      const tx = smoothstep(worldOffsetX - cellOffsetX);
      const worldX = centerX + BigInt(cellOffsetX);
      const ids = [
        getBiome(worldX, worldY),
        getBiome(worldX + 1n, worldY),
        getBiome(worldX, worldY + 1n),
        getBiome(worldX + 1n, worldY + 1n),
      ];
      const colors = ids.map((id) => id === null ? background : COLORS[id]);
      const target = (py * rasterWidth + px) * 4;
      for (let channel = 0; channel < 3; channel += 1) {
        const top = colors[0][channel] + (colors[1][channel] - colors[0][channel]) * tx;
        const bottom = colors[2][channel] + (colors[3][channel] - colors[2][channel]) * tx;
        image.data[target + channel] = Math.round(top + (bottom - top) * ty);
      }
      image.data[target + 3] = 255;
    }
  }
  raster.putImageData(image, 0, 0);
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = "high";
  ctx.save();
  if (blurPixels > 0) ctx.filter = `blur(${blurPixels}px)`;
  ctx.drawImage(canvas, 0, 0, rasterWidth, rasterHeight, 0, 0, width, height);
  ctx.restore();
}
