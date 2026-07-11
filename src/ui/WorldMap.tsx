import { useCallback, useEffect, useRef, useState } from "react";
import { CHUNK_SIZE } from "../game/constants";
import type { MapEnemy, TrackedTarget } from "../game/map/types";
import type { BiomeId, ChunkPayload } from "../game/types";

const colors: Record<BiomeId, string> = { 0: "#4a9ac7", 1: "#777f83", 2: "#28744a", 3: "#80664e", 4: "#c7b36f", 5: "#65a958" };
const MIN_SCALE = 0.45;
const MAX_SCALE = 8;

function abs(value: bigint): bigint {
  return value < 0n ? -value : value;
}

export function WorldMap({ chunks, visitedChunks, playerX, playerY, playerOffsetX, playerOffsetY, playerYaw, enemies, target, onSelectTarget, onClose }: {
  chunks: ChunkPayload[];
  visitedChunks: string[];
  playerX: string;
  playerY: string;
  playerOffsetX: number;
  playerOffsetY: number;
  playerYaw: number;
  enemies: MapEnemy[];
  target: TrackedTarget | null;
  onSelectTarget: (enemy: MapEnemy) => void;
  onClose: () => void;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const center = useRef({ x: BigInt(playerX), y: BigInt(playerY), residualX: 0, residualY: 0 });
  const drag = useRef({ pointerId: -1, x: 0, y: 0, moved: false });
  const enemyHits = useRef<Array<{ enemy: MapEnemy; x: number; y: number }>>([]);
  const [scale, setScale] = useState(2.4);
  const [revision, setRevision] = useState(0);

  const centerOnPlayer = useCallback(() => {
    center.current = { x: BigInt(playerX), y: BigInt(playerY), residualX: 0, residualY: 0 };
    setRevision((value) => value + 1);
  }, [playerX, playerY]);

  const pan = useCallback((dx: number, dy: number) => {
    const view = center.current;
    view.residualX += dx;
    view.residualY += dy;
    const tileShiftX = Math.trunc(view.residualX / scale);
    const tileShiftY = Math.trunc(view.residualY / scale);
    if (tileShiftX !== 0) {
      view.x -= BigInt(tileShiftX);
      view.residualX -= tileShiftX * scale;
    }
    if (tileShiftY !== 0) {
      view.y -= BigInt(tileShiftY);
      view.residualY -= tileShiftY * scale;
    }
    setRevision((value) => value + 1);
  }, [scale]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    const rect = canvas.getBoundingClientRect();
    const dpr = Math.max(1, Math.min(2, window.devicePixelRatio || 1));
    canvas.width = Math.max(1, Math.floor(rect.width * dpr));
    canvas.height = Math.max(1, Math.floor(rect.height * dpr));
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    const width = rect.width;
    const height = rect.height;
    ctx.fillStyle = "#17242a";
    ctx.fillRect(0, 0, width, height);
    const view = center.current;
    const visibleTiles = BigInt(Math.ceil(Math.max(width, height) / scale) + CHUNK_SIZE * 2);
    const project = (x: bigint, y: bigint, ox = 0, oy = 0) => ({
      x: width / 2 + Number(x - view.x) * scale + ox * scale + view.residualX,
      y: height / 2 + Number(y - view.y) * scale + oy * scale + view.residualY,
    });

    ctx.fillStyle = "rgba(255, 255, 255, 0.035)";
    for (const key of visitedChunks) {
      const [cxText, cyText] = key.split(",");
      const chunkX = BigInt(cxText) * BigInt(CHUNK_SIZE);
      const chunkY = BigInt(cyText) * BigInt(CHUNK_SIZE);
      if (abs(chunkX - view.x) > visibleTiles || abs(chunkY - view.y) > visibleTiles) continue;
      const point = project(chunkX, chunkY);
      ctx.fillRect(point.x, point.y, CHUNK_SIZE * scale, CHUNK_SIZE * scale);
    }

    for (const chunk of chunks) {
      const chunkX = BigInt(chunk.cx) * BigInt(CHUNK_SIZE);
      const chunkY = BigInt(chunk.cy) * BigInt(CHUNK_SIZE);
      if (abs(chunkX - view.x) > visibleTiles || abs(chunkY - view.y) > visibleTiles) continue;
      for (let y = 0; y < CHUNK_SIZE; y += 1) for (let x = 0; x < CHUNK_SIZE; x += 1) {
        const point = project(chunkX + BigInt(x), chunkY + BigInt(y));
        ctx.fillStyle = colors[(chunk.biomes[y * CHUNK_SIZE + x] ?? 5) as BiomeId];
        ctx.fillRect(point.x, point.y, Math.max(1, scale + 0.35), Math.max(1, scale + 0.35));
      }
      const point = project(chunkX, chunkY);
      ctx.strokeStyle = "rgba(255, 255, 255, 0.16)";
      ctx.lineWidth = 1;
      ctx.strokeRect(point.x, point.y, CHUNK_SIZE * scale, CHUNK_SIZE * scale);
    }

    enemyHits.current = [];
    for (const enemy of enemies) {
      const enemyX = BigInt(enemy.worldX);
      const enemyY = BigInt(enemy.worldY);
      if (abs(enemyX - view.x) > visibleTiles || abs(enemyY - view.y) > visibleTiles) continue;
      const point = project(enemyX, enemyY, enemy.offsetX, enemy.offsetY);
      if (point.x < -12 || point.y < -12 || point.x > width + 12 || point.y > height + 12) continue;
      ctx.fillStyle = enemy.id === target?.id ? "#ffd45c" : "#e95665";
      ctx.strokeStyle = "rgba(22, 28, 31, 0.9)";
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(point.x, point.y, enemy.id === target?.id ? 8 : 6, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
      enemyHits.current.push({ enemy, x: point.x, y: point.y });
    }

    const playerPoint = project(BigInt(playerX), BigInt(playerY), playerOffsetX, playerOffsetY);
    ctx.save();
    ctx.translate(playerPoint.x, playerPoint.y);
    ctx.rotate(Math.PI - playerYaw);
    ctx.fillStyle = "#ffffff";
    ctx.beginPath();
    ctx.moveTo(0, -12);
    ctx.lineTo(8, 9);
    ctx.lineTo(0, 5);
    ctx.lineTo(-8, 9);
    ctx.closePath();
    ctx.fill();
    ctx.restore();

    ctx.fillStyle = "rgba(7, 13, 16, 0.42)";
    ctx.fillRect(0, 0, width, height);
    ctx.globalCompositeOperation = "destination-out";
    for (const key of visitedChunks) {
      const [cxText, cyText] = key.split(",");
      const chunkX = BigInt(cxText) * BigInt(CHUNK_SIZE);
      const chunkY = BigInt(cyText) * BigInt(CHUNK_SIZE);
      if (abs(chunkX - view.x) > visibleTiles || abs(chunkY - view.y) > visibleTiles) continue;
      const point = project(chunkX, chunkY);
      ctx.fillRect(point.x, point.y, CHUNK_SIZE * scale, CHUNK_SIZE * scale);
    }
    ctx.globalCompositeOperation = "source-over";
  }, [chunks, enemies, playerOffsetX, playerOffsetY, playerX, playerY, playerYaw, revision, scale, target?.id, visitedChunks]);

  return <div className="worldMapOverlay" role="dialog" aria-modal="true" aria-label="Bản đồ thế giới">
    <header className="worldMapHeader">
      <div><span>Bản đồ thế giới</span><strong>{center.current.x.toString()}, {center.current.y.toString()}</strong></div>
      <div className="worldMapTools">
        <button type="button" onClick={() => setScale((value) => Math.max(MIN_SCALE, value / 1.35))} title="Thu nhỏ" aria-label="Thu nhỏ">−</button>
        <button type="button" onClick={centerOnPlayer} title="Về vị trí người chơi" aria-label="Về vị trí người chơi">◎</button>
        <button type="button" onClick={() => setScale((value) => Math.min(MAX_SCALE, value * 1.35))} title="Phóng to" aria-label="Phóng to">+</button>
        <button type="button" onClick={onClose} title="Đóng bản đồ" aria-label="Đóng bản đồ">×</button>
      </div>
    </header>
    <canvas
      ref={canvasRef}
      className="worldMapCanvas"
      onWheel={(event) => { event.preventDefault(); setScale((value) => Math.max(MIN_SCALE, Math.min(MAX_SCALE, value * (event.deltaY > 0 ? 0.88 : 1.12)))); }}
      onPointerDown={(event) => { drag.current = { pointerId: event.pointerId, x: event.clientX, y: event.clientY, moved: false }; event.currentTarget.setPointerCapture(event.pointerId); }}
      onPointerMove={(event) => { if (drag.current.pointerId !== event.pointerId) return; const dx = event.clientX - drag.current.x; const dy = event.clientY - drag.current.y; if (Math.hypot(dx, dy) > 2) drag.current.moved = true; drag.current.x = event.clientX; drag.current.y = event.clientY; pan(dx, dy); }}
      onPointerUp={(event) => { if (!drag.current.moved) { const rect = event.currentTarget.getBoundingClientRect(); const x = event.clientX - rect.left; const y = event.clientY - rect.top; const hit = enemyHits.current.find((entry) => Math.hypot(entry.x - x, entry.y - y) <= 14); if (hit) onSelectTarget(hit.enemy); } drag.current.pointerId = -1; }}
    />
    <div className="worldMapLegend"><span><i className="enemyLegend" />Quái</span><span><i className="playerLegend" />Người chơi</span><small>Kéo để khám phá · Nhấn quái để theo dõi</small></div>
  </div>;
}
