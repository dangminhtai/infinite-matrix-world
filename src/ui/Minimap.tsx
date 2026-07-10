import { useEffect, useRef } from "react";
import { CHUNK_SIZE } from "../game/constants";
import type { BiomeId, ChunkPayload } from "../game/types";

const biomeColors: Record<BiomeId, string> = {
  0: "#4aa3df",
  1: "#8c8f95",
  2: "#2f8f4e",
  3: "#9b7653",
  4: "#d9c27c",
  5: "#71bf54",
};

export function Minimap({
  chunks,
  worldTileX,
  worldTileY,
  offsetX,
  offsetY,
  cameraYaw,
}: {
  chunks: ChunkPayload[];
  worldTileX: string;
  worldTileY: string;
  offsetX: number;
  offsetY: number;
  cameraYaw: number;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext("2d");
    if (!canvas || !ctx) return;
    const dpr = Math.max(1, Math.min(2, window.devicePixelRatio || 1));
    const cssSize = 172;
    canvas.width = cssSize * dpr;
    canvas.height = cssSize * dpr;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, cssSize, cssSize);
    ctx.fillStyle = "rgba(11, 24, 31, 0.72)";
    ctx.beginPath();
    ctx.arc(cssSize / 2, cssSize / 2, cssSize / 2 - 2, 0, Math.PI * 2);
    ctx.fill();
    ctx.save();
    ctx.beginPath();
    ctx.arc(cssSize / 2, cssSize / 2, cssSize / 2 - 7, 0, Math.PI * 2);
    ctx.clip();

    const px = BigInt(worldTileX || "0");
    const py = BigInt(worldTileY || "0");
    const scale = 3.2;
    for (const chunk of chunks) {
      const cx = BigInt(chunk.cx);
      const cy = BigInt(chunk.cy);
      const chunkBaseX = cx * BigInt(CHUNK_SIZE);
      const chunkBaseY = cy * BigInt(CHUNK_SIZE);
      for (let y = 0; y < CHUNK_SIZE; y += 1) {
        for (let x = 0; x < CHUNK_SIZE; x += 1) {
          const wx = chunkBaseX + BigInt(x);
          const wy = chunkBaseY + BigInt(y);
          const sx = cssSize / 2 + (Number(wx - px) - offsetX) * scale;
          const sy = cssSize / 2 + (Number(wy - py) - offsetY) * scale;
          if (sx < -4 || sy < -4 || sx > cssSize + 4 || sy > cssSize + 4) continue;
          ctx.fillStyle = biomeColors[(chunk.biomes[y * CHUNK_SIZE + x] ?? 5) as BiomeId];
          ctx.fillRect(sx, sy, scale + 0.5, scale + 0.5);
        }
      }
      ctx.strokeStyle = "rgba(255, 255, 255, 0.22)";
      ctx.lineWidth = 1;
      ctx.strokeRect(
        cssSize / 2 + (Number(chunkBaseX - px) - offsetX) * scale,
        cssSize / 2 + (Number(chunkBaseY - py) - offsetY) * scale,
        CHUNK_SIZE * scale,
        CHUNK_SIZE * scale,
      );
    }
    ctx.restore();

    ctx.save();
    ctx.translate(cssSize / 2, cssSize / 2);
    ctx.rotate(-cameraYaw);
    ctx.fillStyle = "#ffffff";
    ctx.beginPath();
    ctx.moveTo(0, -11);
    ctx.lineTo(7, 8);
    ctx.lineTo(0, 4);
    ctx.lineTo(-7, 8);
    ctx.closePath();
    ctx.fill();
    ctx.restore();

    ctx.strokeStyle = "rgba(255, 255, 255, 0.84)";
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(cssSize / 2, cssSize / 2, cssSize / 2 - 5, 0, Math.PI * 2);
    ctx.stroke();
  }, [cameraYaw, chunks, offsetX, offsetY, worldTileX, worldTileY]);

  return <canvas ref={canvasRef} className="minimap" aria-label="Minimap" />;
}
