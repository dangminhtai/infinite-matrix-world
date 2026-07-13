import { useCallback, useEffect, useRef, useState } from "react";
import { CHUNK_SIZE } from "../game/constants";
import type { MapTile } from "../game/map/mapTile";
import type { MapEnemy, MapWaypoint, TrackedTarget } from "../game/map/types";
import { calculateMapMinScale, clampZoomLevel, MAP_ZOOM_DEFAULT_LEVEL, MAP_ZOOM_MAX_LEVEL, MAP_ZOOM_MAX_SCALE, MAP_ZOOM_MIN_LEVEL, MAX_VISIBLE_MAP_TILES, scaleRatioToZoomDelta, zoomLevelToScale } from "../game/map/mapZoom";
import type { BiomeId, ChunkPayload } from "../game/types";
import { drawSmoothBiomeLayer } from "./mapRaster";
import { isChunkDiscovered, isWorldTileDiscovered, type MapExplorationSave } from "../game/exploration/mapExploration";

const MAX_MAP_TILES = 512;
const MOBILE_CACHE_BYTES = 24 * 1024 * 1024;
const DESKTOP_CACHE_BYTES = 64 * 1024 * 1024;
const ZOOM_BUTTON_STEP = 8;
const sharedTileCaches = new Map<string, Map<string, MapTile>>();

function abs(value: bigint): bigint {
  return value < 0n ? -value : value;
}

function floorDiv(value: bigint, divisor: bigint): bigint {
  let quotient = value / divisor;
  if (value < 0n && value % divisor !== 0n) quotient -= 1n;
  return quotient;
}

function tileKey(cx: string | bigint, cy: string | bigint): string {
  return `${cx},${cy}`;
}

function getSeedCache(seedKey: string): Map<string, MapTile> {
  const existing = sharedTileCaches.get(seedKey);
  if (existing) return existing;
  const cache = new Map<string, MapTile>();
  sharedTileCaches.set(seedKey, cache);
  while (sharedTileCaches.size > 3) sharedTileCaches.delete(sharedTileCaches.keys().next().value as string);
  return cache;
}

export function WorldMap({ seed, chunks, exploration, playerX, playerY, playerOffsetX, playerOffsetY, playerYaw, enemies, target, waypoint, allowMapTeleport, onSelectTarget, onSetWaypoint, onTeleportWaypoint, onClose }: {
  seed: string[][];
  chunks: ChunkPayload[];
  exploration: MapExplorationSave;
  playerX: string;
  playerY: string;
  playerOffsetX: number;
  playerOffsetY: number;
  playerYaw: number;
  enemies: MapEnemy[];
  target: TrackedTarget | null;
  waypoint: MapWaypoint | null;
  allowMapTeleport: boolean;
  onSelectTarget: (enemy: MapEnemy) => void;
  onSetWaypoint: (waypoint: MapWaypoint) => void;
  onTeleportWaypoint: (waypoint: MapWaypoint) => void;
  onClose: () => void;
}) {
  const seedKey = JSON.stringify(seed);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const center = useRef({ x: BigInt(playerX), y: BigInt(playerY), residualX: 0, residualY: 0 });
  const drag = useRef({ pointerId: -1, x: 0, y: 0, moved: false });
  const pointers = useRef(new Map<number, { x: number; y: number }>());
  const pinchDistance = useRef(0);
  const enemyHits = useRef<Array<{ enemy: MapEnemy; x: number; y: number }>>([]);
  const cache = useRef(getSeedCache(seedKey));
  const workerRef = useRef<Worker | null>(null);
  const queue = useRef<Array<{ key: string; cx: string; cy: string }>>([]);
  const inFlight = useRef(new Map<number, { key: string; epoch: number }>());
  const wanted = useRef(new Set<string>());
  const viewportEpoch = useRef(0);
  const requestId = useRef(1);
  const pumpRef = useRef<() => void>(() => undefined);
  const [viewport, setViewport] = useState({ width: window.innerWidth, height: window.innerHeight });
  const [zoomLevel, setZoomLevel] = useState(MAP_ZOOM_DEFAULT_LEVEL);
  const [revision, setRevision] = useState(0);
  const [pendingTiles, setPendingTiles] = useState(0);
  const minScale = calculateMapMinScale(viewport.width, viewport.height);
  const scale = zoomLevelToScale(zoomLevel, minScale);
  const zoomLocked = minScale >= MAP_ZOOM_MAX_SCALE;
  const atMinZoom = zoomLocked || zoomLevel <= MAP_ZOOM_MIN_LEVEL;
  const atMaxZoom = zoomLocked || zoomLevel >= MAP_ZOOM_MAX_LEVEL;
  const constrainedDevice = viewport.width <= 900 || window.matchMedia("(pointer: coarse)").matches;
  const cacheBudgetBytes = useRef(DESKTOP_CACHE_BYTES);
  const maxInFlight = useRef(2);
  cacheBudgetBytes.current = constrainedDevice ? MOBILE_CACHE_BYTES : DESKTOP_CACHE_BYTES;
  maxInFlight.current = constrainedDevice ? 1 : 2;

  const rememberTile = useCallback((tile: MapTile) => {
    const key = tileKey(tile.cx, tile.cy);
    cache.current.delete(key);
    cache.current.set(key, tile);
    let bytes = 0;
    for (const cached of cache.current.values()) bytes += cached.biomes.byteLength;
    while (cache.current.size > MAX_MAP_TILES || bytes > cacheBudgetBytes.current) {
      const oldestKey = cache.current.keys().next().value as string | undefined;
      if (!oldestKey) break;
      const oldest = cache.current.get(oldestKey);
      if (oldest) bytes -= oldest.biomes.byteLength;
      cache.current.delete(oldestKey);
    }
  }, []);

  useEffect(() => {
    for (const chunk of chunks) rememberTile({ cx: chunk.cx, cy: chunk.cy, biomes: chunk.biomes });
    setRevision((value) => value + 1);
  }, [chunks, rememberTile]);

  useEffect(() => {
    const worker = new Worker(new URL("../game/workers/map.worker.ts", import.meta.url), { type: "module" });
    workerRef.current = worker;
    const updatePending = () => setPendingTiles(queue.current.length + inFlight.current.size);
    pumpRef.current = () => {
      while (workerRef.current && inFlight.current.size < maxInFlight.current && queue.current.length) {
        const job = queue.current.shift();
        if (!job || cache.current.has(job.key)) continue;
        const id = requestId.current++;
        inFlight.current.set(id, { key: job.key, epoch: viewportEpoch.current });
        workerRef.current.postMessage({ requestId: id, seed, cx: job.cx, cy: job.cy });
      }
      updatePending();
    };
    worker.onmessage = (event: MessageEvent<{ requestId: number; tile?: MapTile; error?: string }>) => {
      const request = inFlight.current.get(event.data.requestId);
      inFlight.current.delete(event.data.requestId);
      if (event.data.tile && request && request.epoch === viewportEpoch.current && wanted.current.has(request.key)) {
        rememberTile(event.data.tile);
        setRevision((value) => value + 1);
      }
      pumpRef.current();
    };
    pumpRef.current();
    return () => {
      worker.terminate();
      workerRef.current = null;
      queue.current = [];
      inFlight.current.clear();
    };
  }, [rememberTile, seed, seedKey]);

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

  const waypointFromScreenPoint = useCallback((x: number, y: number): MapWaypoint | null => {
    const rect = canvasRef.current?.getBoundingClientRect();
    if (!rect) return null;
    const view = center.current;
    const worldFloatX = (x - rect.width / 2 - view.residualX) / scale;
    const worldFloatY = (y - rect.height / 2 - view.residualY) / scale;
    const tileOffsetX = Math.floor(worldFloatX);
    const tileOffsetY = Math.floor(worldFloatY);
    return {
      id: `${Date.now()}`,
      worldX: (view.x + BigInt(tileOffsetX)).toString(),
      worldY: (view.y + BigInt(tileOffsetY)).toString(),
      offsetX: worldFloatX - tileOffsetX,
      offsetY: worldFloatY - tileOffsetY,
    };
  }, [scale]);

  useEffect(() => {
    const redraw = () => {
      setViewport({ width: window.innerWidth, height: window.innerHeight });
      setRevision((value) => value + 1);
    };
    window.addEventListener("resize", redraw);
    return () => window.removeEventListener("resize", redraw);
  }, []);

  useEffect(() => {
    const rect = canvasRef.current?.getBoundingClientRect();
    if (!rect) return;
    const view = center.current;
    const halfTilesX = BigInt(Math.ceil(rect.width / scale / 2) + CHUNK_SIZE);
    const halfTilesY = BigInt(Math.ceil(rect.height / scale / 2) + CHUNK_SIZE);
    const minCx = floorDiv(view.x - halfTilesX, BigInt(CHUNK_SIZE));
    const maxCx = floorDiv(view.x + halfTilesX, BigInt(CHUNK_SIZE));
    const minCy = floorDiv(view.y - halfTilesY, BigInt(CHUNK_SIZE));
    const maxCy = floorDiv(view.y + halfTilesY, BigInt(CHUNK_SIZE));
    const centerCx = floorDiv(view.x, BigInt(CHUNK_SIZE));
    const centerCy = floorDiv(view.y, BigInt(CHUNK_SIZE));
    const jobs: Array<{ key: string; cx: string; cy: string; distance: number }> = [];
    const nextWanted = new Set<string>();
    for (let cy = minCy; cy <= maxCy; cy += 1n) for (let cx = minCx; cx <= maxCx; cx += 1n) {
      const key = tileKey(cx, cy);
      if (!isChunkDiscovered(exploration, cx, cy)) continue;
      nextWanted.add(key);
      if (!cache.current.has(key) && ![...inFlight.current.values()].some((request) => request.key === key)) {
        jobs.push({ key, cx: cx.toString(), cy: cy.toString(), distance: Math.max(Math.abs(Number(cx - centerCx)), Math.abs(Number(cy - centerCy))) });
      }
    }
    viewportEpoch.current += 1;
    wanted.current = nextWanted;
    jobs.sort((a, b) => a.distance - b.distance);
    queue.current = jobs.slice(0, MAX_VISIBLE_MAP_TILES);
    pumpRef.current();
  }, [exploration, revision, scale]);

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

    drawSmoothBiomeLayer({
      ctx,
      width,
      height,
      centerX: view.x,
      centerY: view.y,
      residualX: view.residualX,
      residualY: view.residualY,
      pixelsPerTile: scale,
      resolutionScale: 0.5,
      getBiome: (wx, wy) => {
        const cx = floorDiv(wx, BigInt(CHUNK_SIZE));
        const cy = floorDiv(wy, BigInt(CHUNK_SIZE));
        const tile = cache.current.get(tileKey(cx, cy));
        if (!tile) return null;
        const x = Number(wx - cx * BigInt(CHUNK_SIZE));
        const y = Number(wy - cy * BigInt(CHUNK_SIZE));
        return (tile.biomes[y * CHUNK_SIZE + x] ?? 5) as BiomeId;
      },
      isDiscovered: (wx, wy) => isWorldTileDiscovered(exploration, wx, wy),
    });

    enemyHits.current = [];
    for (const enemy of enemies) {
      const enemyX = BigInt(enemy.worldX);
      const enemyY = BigInt(enemy.worldY);
      if (!isWorldTileDiscovered(exploration, enemyX, enemyY)) continue;
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

    if (waypoint) {
      const point = project(BigInt(waypoint.worldX), BigInt(waypoint.worldY), waypoint.offsetX, waypoint.offsetY);
      if (point.x >= -18 && point.y >= -18 && point.x <= width + 18 && point.y <= height + 18) {
        ctx.fillStyle = "#ffb347";
        ctx.strokeStyle = "rgba(22, 28, 31, 0.9)";
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.arc(point.x, point.y, 8, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();
        ctx.strokeStyle = "rgba(255, 255, 255, 0.82)";
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.arc(point.x, point.y, 13, 0, Math.PI * 2);
        ctx.stroke();
      }
    }

    const playerPoint = project(BigInt(playerX), BigInt(playerY), playerOffsetX, playerOffsetY);
    ctx.save();
    ctx.translate(playerPoint.x, playerPoint.y);
    ctx.rotate(Math.PI - playerYaw);
    ctx.fillStyle = "#ffffff";
    ctx.strokeStyle = "rgba(22, 28, 31, 0.9)";
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(0, -12);
    ctx.lineTo(8, 9);
    ctx.lineTo(0, 5);
    ctx.lineTo(-8, 9);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
    ctx.restore();
  }, [enemies, exploration, playerOffsetX, playerOffsetY, playerX, playerY, playerYaw, revision, scale, target?.id, waypoint]);

  const waypointDiscovered = waypoint ? isWorldTileDiscovered(exploration, BigInt(waypoint.worldX), BigInt(waypoint.worldY)) : false;

  return <div className="worldMapOverlay" role="dialog" aria-modal="true" aria-label="Bản đồ thế giới">
    <header className="worldMapHeader">
      <div><span>Bản đồ thế giới</span><strong>{center.current.x.toString()}, {center.current.y.toString()}</strong>{pendingTiles > 0 && <small>Đang tải {pendingTiles} tile...</small>}</div>
      <div className="worldMapTools">
        <button type="button" onClick={centerOnPlayer} title="Về vị trí người chơi" aria-label="Về vị trí người chơi">◎</button>
        <button type="button" onClick={onClose} title="Đóng bản đồ" aria-label="Đóng bản đồ">×</button>
      </div>
    </header>
    <canvas
      ref={canvasRef}
      className="worldMapCanvas"
      onWheel={(event) => { event.preventDefault(); setZoomLevel((value) => clampZoomLevel(value + (event.deltaY > 0 ? -6 : 6))); }}
      onPointerDown={(event) => {
        pointers.current.set(event.pointerId, { x: event.clientX, y: event.clientY });
        event.currentTarget.setPointerCapture(event.pointerId);
        if (pointers.current.size === 1) drag.current = { pointerId: event.pointerId, x: event.clientX, y: event.clientY, moved: false };
        if (pointers.current.size === 2) {
          const [first, second] = [...pointers.current.values()];
          pinchDistance.current = Math.hypot(first.x - second.x, first.y - second.y);
          drag.current.moved = true;
        }
      }}
      onPointerMove={(event) => {
        if (!pointers.current.has(event.pointerId)) return;
        pointers.current.set(event.pointerId, { x: event.clientX, y: event.clientY });
        if (pointers.current.size >= 2) {
          const [first, second] = [...pointers.current.values()];
          const distance = Math.hypot(first.x - second.x, first.y - second.y);
          if (pinchDistance.current > 0 && distance > 0) {
            const ratio = distance / pinchDistance.current;
            setZoomLevel((value) => clampZoomLevel(value + scaleRatioToZoomDelta(ratio, minScale)));
          }
          pinchDistance.current = distance;
          drag.current.moved = true;
          return;
        }
        if (drag.current.pointerId !== event.pointerId) return;
        const dx = event.clientX - drag.current.x;
        const dy = event.clientY - drag.current.y;
        if (Math.hypot(dx, dy) > 2) drag.current.moved = true;
        drag.current.x = event.clientX;
        drag.current.y = event.clientY;
        pan(dx, dy);
      }}
      onPointerUp={(event) => {
        const wasPinching = pointers.current.size > 1;
        pointers.current.delete(event.pointerId);
        if (!drag.current.moved && !wasPinching) {
          const rect = event.currentTarget.getBoundingClientRect();
          const x = event.clientX - rect.left;
          const y = event.clientY - rect.top;
          const hit = enemyHits.current.find((entry) => Math.hypot(entry.x - x, entry.y - y) <= 14);
          if (hit) onSelectTarget(hit.enemy);
          else {
            const nextWaypoint = waypointFromScreenPoint(x, y);
            if (nextWaypoint) onSetWaypoint(nextWaypoint);
          }
        }
        const remaining = [...pointers.current.entries()][0];
        if (remaining) drag.current = { pointerId: remaining[0], x: remaining[1].x, y: remaining[1].y, moved: true };
        else drag.current.pointerId = -1;
        pinchDistance.current = 0;
      }}
      onPointerCancel={(event) => { pointers.current.delete(event.pointerId); drag.current.pointerId = -1; pinchDistance.current = 0; }}
    />
    <div className="worldMapZoomControl" aria-label="Điều khiển thu phóng bản đồ">
      <button type="button" onClick={() => setZoomLevel((value) => clampZoomLevel(value + ZOOM_BUTTON_STEP))} disabled={atMaxZoom} title="Phóng to" aria-label="Phóng to">+</button>
      <input type="range" min={MAP_ZOOM_MIN_LEVEL} max={MAP_ZOOM_MAX_LEVEL} step={1} value={zoomLevel} disabled={zoomLocked} onChange={(event) => setZoomLevel(clampZoomLevel(Number(event.target.value)))} aria-label="Mức thu phóng bản đồ" />
      <button type="button" onClick={() => setZoomLevel((value) => clampZoomLevel(value - ZOOM_BUTTON_STEP))} disabled={atMinZoom} title="Thu nhỏ" aria-label="Thu nhỏ">−</button>
    </div>
    {waypoint && <div className="worldMapWaypointPanel">
      <span>Mốc đánh dấu</span>
      <strong>{waypoint.worldX}, {waypoint.worldY}</strong>
      {allowMapTeleport && waypointDiscovered && <button type="button" onClick={() => onTeleportWaypoint(waypoint)}>Teleport</button>}
    </div>}
    <div className="worldMapLegend"><span><i className="enemyLegend" />Quái</span><span><i className="waypointLegend" />Mốc</span><span><i className="mountainLegend" />Núi</span><span><i className="playerLegend" />Người chơi</span><small>Kéo để khám phá · Nhấn quái để theo dõi · Nhấn map để đặt mốc</small></div>
  </div>;
}
