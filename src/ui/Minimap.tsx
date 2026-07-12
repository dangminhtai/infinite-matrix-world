import { useEffect, useRef } from "react";
import { CHUNK_SIZE } from "../game/constants";
import { recordMinimapDraw } from "../game/core/StartupProfiler";
import { isChunkDiscovered, type MapExplorationSave } from "../game/exploration/mapExploration";
import type { MapEnemy, MapWaypoint, TrackedTarget } from "../game/map/types";
import type { BiomeId, ChunkPayload } from "../game/types";
import { drawSmoothBiomeLayer } from "./mapRaster";

function floorDiv(value: bigint, divisor: bigint): bigint {
  let result = value / divisor;
  if (value < 0n && value % divisor !== 0n) result -= 1n;
  return result;
}

function canvasSize(): number {
  return Math.min(window.innerWidth, window.innerHeight) <= 760 ? 148 : 172;
}

export function Minimap({ chunks, exploration, worldTileX, worldTileY, offsetX, offsetY, playerYaw, enemies, target, waypoint, onOpenMap }: {
  chunks: ChunkPayload[];
  exploration: MapExplorationSave;
  worldTileX: string;
  worldTileY: string;
  offsetX: number;
  offsetY: number;
  playerYaw: number;
  enemies: MapEnemy[];
  target: TrackedTarget | null;
  waypoint: MapWaypoint | null;
  onOpenMap: () => void;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const terrainRef = useRef<HTMLCanvasElement | null>(null);
  const terrainKeyRef = useRef("");

  useEffect(() => {
    const startedAt = performance.now();
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext("2d");
    if (!canvas || !ctx) return;

    const cssSize = canvasSize();
    const dpr = Math.min(window.devicePixelRatio || 1, cssSize === 148 ? 1 : 2);
    const pixelSize = Math.round(cssSize * dpr);
    if (canvas.width !== pixelSize || canvas.height !== pixelSize) {
      canvas.width = pixelSize;
      canvas.height = pixelSize;
    }
    canvas.style.width = `${cssSize}px`;
    canvas.style.height = `${cssSize}px`;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    const px = BigInt(worldTileX || "0");
    const py = BigInt(worldTileY || "0");
    const scale = 3.2;
    const chunkKey = chunks.map((chunk) => `${chunk.cx},${chunk.cy}`).sort().join("|");
    const terrainKey = `${worldTileX},${worldTileY}:${chunkKey}:${cssSize}:${dpr}`;

    if (!terrainRef.current) terrainRef.current = document.createElement("canvas");
    const terrainCanvas = terrainRef.current;
    if (terrainKeyRef.current !== terrainKey || terrainCanvas.width !== pixelSize || terrainCanvas.height !== pixelSize) {
      terrainKeyRef.current = terrainKey;
      terrainCanvas.width = pixelSize;
      terrainCanvas.height = pixelSize;
      const terrainCtx = terrainCanvas.getContext("2d");
      if (terrainCtx) {
        terrainCtx.setTransform(dpr, 0, 0, dpr, 0, 0);
        terrainCtx.clearRect(0, 0, cssSize, cssSize);
        terrainCtx.fillStyle = "rgba(11, 24, 31, 0.78)";
        terrainCtx.beginPath();
        terrainCtx.arc(cssSize / 2, cssSize / 2, cssSize / 2 - 2, 0, Math.PI * 2);
        terrainCtx.fill();
        terrainCtx.save();
        terrainCtx.beginPath();
        terrainCtx.arc(cssSize / 2, cssSize / 2, cssSize / 2 - 7, 0, Math.PI * 2);
        terrainCtx.clip();
        const chunkMap = new Map(chunks.map((chunk) => [`${chunk.cx},${chunk.cy}`, chunk]));
        drawSmoothBiomeLayer({
          ctx: terrainCtx,
          width: cssSize,
          height: cssSize,
          centerX: px,
          centerY: py,
          residualX: 0,
          residualY: 0,
          pixelsPerTile: scale,
          getBiome: (wx, wy) => {
            const cx = floorDiv(wx, BigInt(CHUNK_SIZE));
            const cy = floorDiv(wy, BigInt(CHUNK_SIZE));
            if (!isChunkDiscovered(exploration, cx, cy)) return null;
            const chunk = chunkMap.get(`${cx},${cy}`);
            if (!chunk) return null;
            const x = Number(wx - cx * BigInt(CHUNK_SIZE));
            const y = Number(wy - cy * BigInt(CHUNK_SIZE));
            return (chunk.biomes[y * CHUNK_SIZE + x] ?? 5) as BiomeId;
          },
        });
        terrainCtx.restore();
      }
    }

    ctx.clearRect(0, 0, cssSize, cssSize);
    ctx.drawImage(terrainCanvas, 0, 0, pixelSize, pixelSize, 0, 0, cssSize, cssSize);
    ctx.save();
    ctx.beginPath();
    ctx.arc(cssSize / 2, cssSize / 2, cssSize / 2 - 7, 0, Math.PI * 2);
    ctx.clip();

    for (const enemy of enemies) {
      const enemyCx = floorDiv(BigInt(enemy.worldX), BigInt(CHUNK_SIZE));
      const enemyCy = floorDiv(BigInt(enemy.worldY), BigInt(CHUNK_SIZE));
      if (!isChunkDiscovered(exploration, enemyCx, enemyCy)) continue;
      const sx = cssSize / 2 + (Number(BigInt(enemy.worldX) - px) + enemy.offsetX - offsetX) * scale;
      const sy = cssSize / 2 + (Number(BigInt(enemy.worldY) - py) + enemy.offsetY - offsetY) * scale;
      if (Math.hypot(sx - cssSize / 2, sy - cssSize / 2) > cssSize / 2 - 10) continue;
      ctx.fillStyle = enemy.id === target?.id ? "#ffd45c" : "#e95665";
      ctx.beginPath();
      ctx.arc(sx, sy, enemy.id === target?.id ? 4.5 : 3.5, 0, Math.PI * 2);
      ctx.fill();
    }

    const drawEdgeMarker = (worldX: string, worldY: string, markerOffsetX: number, markerOffsetY: number, color: string, radius: number) => {
      const dx = (Number(BigInt(worldX) - px) + markerOffsetX - offsetX) * scale;
      const dy = (Number(BigInt(worldY) - py) + markerOffsetY - offsetY) * scale;
      const distance = Math.hypot(dx, dy);
      const edge = cssSize / 2 - 15;
      const factor = distance > 0.001 ? Math.min(1, edge / distance) : 1;
      ctx.fillStyle = color;
      ctx.strokeStyle = "rgba(22, 28, 31, 0.9)";
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(cssSize / 2 + dx * factor, cssSize / 2 + dy * factor, radius, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
    };
    if (target) drawEdgeMarker(target.worldX, target.worldY, target.offsetX, target.offsetY, "#ffd45c", 5);
    if (waypoint) drawEdgeMarker(waypoint.worldX, waypoint.worldY, waypoint.offsetX, waypoint.offsetY, "#ffb347", 5.5);
    ctx.restore();

    ctx.save();
    ctx.translate(cssSize / 2, cssSize / 2);
    ctx.rotate(Math.PI - playerYaw);
    ctx.fillStyle = "#fff";
    ctx.beginPath();
    ctx.moveTo(0, -11);
    ctx.lineTo(7, 8);
    ctx.lineTo(0, 4);
    ctx.lineTo(-7, 8);
    ctx.closePath();
    ctx.fill();
    ctx.restore();
    ctx.strokeStyle = "rgba(255, 255, 255, 0.86)";
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(cssSize / 2, cssSize / 2, cssSize / 2 - 5, 0, Math.PI * 2);
    ctx.stroke();
    recordMinimapDraw(performance.now() - startedAt);
  }, [chunks, enemies, exploration, offsetX, offsetY, playerYaw, target, waypoint, worldTileX, worldTileY]);

  return <canvas ref={canvasRef} className="minimap" aria-label="Mở bản đồ" role="button" tabIndex={0} onClick={onOpenMap} onKeyDown={(event) => { if (event.key === "Enter" || event.key === " ") onOpenMap(); }} />;
}
