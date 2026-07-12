import { useEffect, useRef, useState } from "react";
import { CHUNK_SIZE } from "../game/constants";
import type { MapEnemy, MapWaypoint, TrackedTarget } from "../game/map/types";
import type { BiomeId, ChunkPayload } from "../game/types";
import { drawSmoothBiomeLayer } from "./mapRaster";

function floorDiv(value: bigint, divisor: bigint): bigint {
  let result = value / divisor;
  if (value < 0n && value % divisor !== 0n) result -= 1n;
  return result;
}

export function Minimap({
  chunks,
  worldTileX,
  worldTileY,
  offsetX,
  offsetY,
  playerYaw,
  enemies,
  target,
  waypoint,
  onOpenMap,
}: {
  chunks: ChunkPayload[];
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
  const terrainCanvasRef = useRef<HTMLCanvasElement>(null);
  const overlayCanvasRef = useRef<HTMLCanvasElement>(null);
  const [lastTerrainUpdate, setLastTerrainUpdate] = useState({ tileX: "0", tileY: "0", chunkCount: 0 });
  const overlayFrameRef = useRef(0);

  const px = BigInt(worldTileX || "0");
  const py = BigInt(worldTileY || "0");
  const cssSize = 172;
  const scale = 3.2;

  // Terrain layer - only redraw when player moves to new tile or chunks change
  useEffect(() => {
    const currentTileX = worldTileX;
    const currentTileY = worldTileY;
    const currentChunkCount = chunks.length;
    
    if (
      lastTerrainUpdate.tileX === currentTileX &&
      lastTerrainUpdate.tileY === currentTileY &&
      lastTerrainUpdate.chunkCount === currentChunkCount
    ) {
      return;
    }

    const canvas = terrainCanvasRef.current;
    const ctx = canvas?.getContext("2d");
    if (!canvas || !ctx) return;

    const dpr = Math.max(1, Math.min(window.devicePixelRatio || 1, 1));
    canvas.width = cssSize * dpr;
    canvas.height = cssSize * dpr;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    ctx.clearRect(0, 0, cssSize, cssSize);
    ctx.fillStyle = "rgba(11, 24, 31, 0.78)";
    ctx.beginPath();
    ctx.arc(cssSize / 2, cssSize / 2, cssSize / 2 - 2, 0, Math.PI * 2);
    ctx.fill();

    ctx.save();
    ctx.beginPath();
    ctx.arc(cssSize / 2, cssSize / 2, cssSize / 2 - 7, 0, Math.PI * 2);
    ctx.clip();

    const chunkMap = new Map(chunks.map((chunk) => [`${chunk.cx},${chunk.cy}`, chunk]));
    drawSmoothBiomeLayer({
      ctx,
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
        const chunk = chunkMap.get(`${cx},${cy}`);
        if (!chunk) return null;
        const x = Number(wx - cx * BigInt(CHUNK_SIZE));
        const y = Number(wy - cy * BigInt(CHUNK_SIZE));
        return (chunk.biomes[y * CHUNK_SIZE + x] ?? 5) as BiomeId;
      },
    });

    ctx.restore();

    setLastTerrainUpdate({ tileX: currentTileX, tileY: currentTileY, chunkCount: currentChunkCount });
  }, [chunks, worldTileX, worldTileY, px, py, cssSize, scale, lastTerrainUpdate]);

  // Overlay layer - redraw frequently but throttled
  useEffect(() => {
    const drawOverlay = () => {
      const canvas = overlayCanvasRef.current;
      const ctx = canvas?.getContext("2d");
      if (!canvas || !ctx) return;

      const dpr = Math.max(1, Math.min(window.devicePixelRatio || 1, 1));
      canvas.width = cssSize * dpr;
      canvas.height = cssSize * dpr;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

      ctx.clearRect(0, 0, cssSize, cssSize);

      ctx.save();
      ctx.beginPath();
      ctx.arc(cssSize / 2, cssSize / 2, cssSize / 2 - 7, 0, Math.PI * 2);
      ctx.clip();

      // Draw enemies
      for (const enemy of enemies) {
        const sx = cssSize / 2 + (Number(BigInt(enemy.worldX) - px) + enemy.offsetX - offsetX) * scale;
        const sy = cssSize / 2 + (Number(BigInt(enemy.worldY) - py) + enemy.offsetY - offsetY) * scale;
        const distanceFromCenter = Math.hypot(sx - cssSize / 2, sy - cssSize / 2);
        if (distanceFromCenter > cssSize / 2 - 10) continue;
        ctx.fillStyle = enemy.id === target?.id ? "#ffd45c" : "#e95665";
        ctx.beginPath();
        ctx.arc(sx, sy, enemy.id === target?.id ? 4.5 : 3.5, 0, Math.PI * 2);
        ctx.fill();
      }

      // Draw target marker
      if (target) {
        const targetX = (Number(BigInt(target.worldX) - px) + target.offsetX - offsetX) * scale;
        const targetY = (Number(BigInt(target.worldY) - py) + target.offsetY - offsetY) * scale;
        const targetDistance = Math.hypot(targetX, targetY);
        if (targetDistance > 0.001) {
          const radius = cssSize / 2 - 14;
          const factor = Math.min(1, radius / targetDistance);
          const markerX = cssSize / 2 + targetX * factor;
          const markerY = cssSize / 2 + targetY * factor;
          ctx.fillStyle = "#ffd45c";
          ctx.strokeStyle = "rgba(22, 28, 31, 0.9)";
          ctx.lineWidth = 2;
          ctx.beginPath();
          ctx.arc(markerX, markerY, 5, 0, Math.PI * 2);
          ctx.fill();
          ctx.stroke();
        }
      }

      // Draw waypoint
      if (waypoint) {
        const waypointX = (Number(BigInt(waypoint.worldX) - px) + waypoint.offsetX - offsetX) * scale;
        const waypointY = (Number(BigInt(waypoint.worldY) - py) + waypoint.offsetY - offsetY) * scale;
        const waypointDistance = Math.hypot(waypointX, waypointY);
        const radius = cssSize / 2 - 15;
        const factor = waypointDistance > 0.001 ? Math.min(1, radius / waypointDistance) : 1;
        const markerX = cssSize / 2 + waypointX * factor;
        const markerY = cssSize / 2 + waypointY * factor;
        ctx.fillStyle = "#ffb347";
        ctx.strokeStyle = "rgba(22, 28, 31, 0.9)";
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.arc(markerX, markerY, 5.5, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();
        ctx.strokeStyle = "rgba(255, 255, 255, 0.75)";
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.arc(markerX, markerY, 9, 0, Math.PI * 2);
        ctx.stroke();
      }

      ctx.restore();

      // Draw player arrow
      ctx.save();
      ctx.translate(cssSize / 2, cssSize / 2);
      ctx.rotate(Math.PI - playerYaw);
      ctx.fillStyle = "#ffffff";
      ctx.beginPath();
      ctx.moveTo(0, -11);
      ctx.lineTo(7, 8);
      ctx.lineTo(0, 4);
      ctx.lineTo(-7, 8);
      ctx.closePath();
      ctx.fill();
      ctx.restore();

      // Draw border
      ctx.strokeStyle = "rgba(255, 255, 255, 0.86)";
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(cssSize / 2, cssSize / 2, cssSize / 2 - 5, 0, Math.PI * 2);
      ctx.stroke();
    };

    const intervalId = window.setInterval(() => {
      cancelAnimationFrame(overlayFrameRef.current);
      overlayFrameRef.current = requestAnimationFrame(drawOverlay);
    }, 1000 / 15); // 15 FPS for overlay

    drawOverlay();

    return () => {
      window.clearInterval(intervalId);
      cancelAnimationFrame(overlayFrameRef.current);
    };
  }, [enemies, offsetX, offsetY, playerYaw, target, waypoint, px, py, cssSize, scale]);

  return (
    <div className="minimap" style={{ position: "relative", width: cssSize, height: cssSize }}>
      <canvas
        ref={terrainCanvasRef}
        style={{ position: "absolute", top: 0, left: 0, width: cssSize, height: cssSize }}
      />
      <canvas
        ref={overlayCanvasRef}
        style={{ position: "absolute", top: 0, left: 0, width: cssSize, height: cssSize }}
        aria-label="Mở bản đồ"
        role="button"
        tabIndex={0}
        onClick={onOpenMap}
        onKeyDown={(event) => {
          if (event.key === "Enter" || event.key === " ") onOpenMap();
        }}
      />
    </div>
  );
}
