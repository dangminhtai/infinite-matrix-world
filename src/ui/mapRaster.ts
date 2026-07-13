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
  getBiome,
  isDiscovered,
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
  isDiscovered?: (x: bigint, y: bigint) => boolean;
}): void {
  const rasterWidth = Math.max(1, Math.ceil(width * resolutionScale));
  const rasterHeight = Math.max(1, Math.ceil(height * resolutionScale));
  const canvas = document.createElement("canvas");
  canvas.width = rasterWidth;
  canvas.height = rasterHeight;
  const raster = canvas.getContext("2d");
  if (!raster) return;
  const image = raster.createImageData(rasterWidth, rasterHeight);
  const fogImage = isDiscovered ? raster.createImageData(rasterWidth, rasterHeight) : null;
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
      if (fogImage && isDiscovered) {
        const visible = [
          isDiscovered(worldX, worldY) ? 1 : 0,
          isDiscovered(worldX + 1n, worldY) ? 1 : 0,
          isDiscovered(worldX, worldY + 1n) ? 1 : 0,
          isDiscovered(worldX + 1n, worldY + 1n) ? 1 : 0,
        ];
        const top = visible[0] + (visible[1] - visible[0]) * tx;
        const bottom = visible[2] + (visible[3] - visible[2]) * tx;
        const visibility = top + (bottom - top) * ty;
        fogImage.data[target] = background[0];
        fogImage.data[target + 1] = background[1];
        fogImage.data[target + 2] = background[2];
        fogImage.data[target + 3] = Math.round((1 - visibility) * 255);
      }
    }
  }
  raster.putImageData(image, 0, 0);
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = "high";
  ctx.save();
  ctx.drawImage(canvas, 0, 0, rasterWidth, rasterHeight, 0, 0, width, height);
  if (fogImage) {
    const fogCanvas = document.createElement("canvas");
    fogCanvas.width = rasterWidth;
    fogCanvas.height = rasterHeight;
    const fogContext = fogCanvas.getContext("2d");
    if (fogContext) {
      fogContext.putImageData(fogImage, 0, 0);
      ctx.drawImage(fogCanvas, 0, 0, rasterWidth, rasterHeight, 0, 0, width, height);
    }
  }
  ctx.restore();
}
