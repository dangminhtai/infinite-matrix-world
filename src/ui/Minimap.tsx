import { useEffect, useRef } from "react";
import { CHUNK_SIZE } from "../game/constants";
import type { MapEnemy, MapWaypoint, TrackedTarget } from "../game/map/types";
import type { BiomeId, ChunkPayload } from "../game/types";

const biomeColors: Record<BiomeId, string> = {
  0: "#4aa3df",
  1: "#a3a7ad",
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
    ctx.fillStyle = "rgba(11, 24, 31, 0.78)";
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
          const biome = (chunk.biomes[y * CHUNK_SIZE + x] ?? 5) as BiomeId;
          ctx.fillStyle = biomeColors[biome];
          ctx.fillRect(sx, sy, scale + 0.5, scale + 0.5);
          if (biome === 1) {
            ctx.fillStyle = "rgba(55, 61, 68, 0.45)";
            ctx.fillRect(sx, sy + scale * 0.58, scale + 0.5, 1);
          }
        }
      }
      ctx.strokeStyle = "rgba(255, 255, 255, 0.2)";
      ctx.lineWidth = 1;
      ctx.strokeRect(
        cssSize / 2 + (Number(chunkBaseX - px) - offsetX) * scale,
        cssSize / 2 + (Number(chunkBaseY - py) - offsetY) * scale,
        CHUNK_SIZE * scale,
        CHUNK_SIZE * scale,
      );
    }

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

    ctx.strokeStyle = "rgba(255, 255, 255, 0.86)";
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(cssSize / 2, cssSize / 2, cssSize / 2 - 5, 0, Math.PI * 2);
    ctx.stroke();
  }, [chunks, enemies, offsetX, offsetY, playerYaw, target?.id, waypoint?.id, worldTileX, worldTileY]);

  return <canvas ref={canvasRef} className="minimap" aria-label="Mở bản đồ" role="button" tabIndex={0} onClick={onOpenMap} onKeyDown={(event) => { if (event.key === "Enter" || event.key === " ") onOpenMap(); }} />;
}
