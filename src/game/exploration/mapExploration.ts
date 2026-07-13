import { exportExploration, importExploration, loadExplorationFromIndexedDb, saveExplorationToIndexedDb } from "./indexedDbExploration";

const CHUNK_SIZE_TILES = 16n;
const FINE_GRID_SIZE = 8n;
const FINE_CELL_SIZE_TILES = CHUNK_SIZE_TILES / FINE_GRID_SIZE;
const SECTOR_CHUNKS = 8n;
const REGION_SECTORS = 16n;
const MAX_DETAILED_CHUNKS = 4_096;
const MAX_DETAILED_SECTORS = 8_192;
const MAX_REGIONS = 16_384;
const FULL_MASK_64 = (1n << 64n) - 1n;
const SAVE_DELAY_MS = 1_000;

export type MapExplorationSave = {
  version: 2;
  fineChunks: Record<string, string>;
  detailedChunks: string[];
  discoveredSectors: Record<string, string>;
  sectorOrder: string[];
  discoveredRegions: string[];
  compactedRegions: string[];
  pinnedRegions: string[];
  lastPosition: { worldX: string; worldY: string };
  revision: number;
};

export type MapExplorationMetrics = {
  revealCount: number;
  lastRevealMs: number;
  lastSaveMs: number;
  saveBytes: number;
  saveError: string | null;
};

const metrics: MapExplorationMetrics = { revealCount: 0, lastRevealMs: 0, lastSaveMs: 0, saveBytes: 0, saveError: null };
const pendingSaves = new Map<string, { save: MapExplorationSave; timer: ReturnType<typeof setTimeout> }>();
let flushListenersInstalled = false;

export function floorDivBigInt(value: bigint, divisor: bigint): bigint {
  if (divisor === 0n) throw new Error("floorDivBigInt: divisor must not be zero");
  let quotient = value / divisor;
  const remainder = value % divisor;
  if (remainder !== 0n && (remainder > 0n) !== (divisor > 0n)) quotient -= 1n;
  return quotient;
}

export function floorModBigInt(value: bigint, divisor: bigint): bigint {
  return value - floorDivBigInt(value, divisor) * divisor;
}

export function pairKey(x: bigint, y: bigint): string {
  return `${x},${y}`;
}

export function parsePairKey(key: string): [bigint, bigint] | null {
  const match = /^(-?\d+),(-?\d+)$/.exec(key);
  if (!match) return null;
  try {
    return [BigInt(match[1]), BigInt(match[2])];
  } catch {
    return null;
  }
}

export function setBit(mask: bigint, index: number): bigint {
  if (!Number.isInteger(index) || index < 0) throw new Error("setBit: invalid index");
  return mask | (1n << BigInt(index));
}

export function hasBit(mask: bigint, index: number): boolean {
  return Number.isInteger(index) && index >= 0 && (mask & (1n << BigInt(index))) !== 0n;
}

function encodeHex(mask: bigint, digits: number): string {
  if (mask < 0n || mask >= (1n << BigInt(digits * 4))) throw new Error(`encodeHex: value exceeds ${digits * 4} bits`);
  return mask.toString(16).padStart(digits, "0");
}

export const encodeHex64 = (mask: bigint): string => encodeHex(mask, 16);
export const encodeHex256 = (mask: bigint): string => encodeHex(mask, 64);

function decodeHex(value: string | undefined, digits: number): bigint {
  if (!value || !new RegExp(`^[0-9a-fA-F]{1,${digits}}$`).test(value)) return 0n;
  try {
    return BigInt(`0x${value}`);
  } catch {
    return 0n;
  }
}

export const decodeHex64 = (value: string | undefined): bigint => decodeHex(value, 16);
export const decodeHex256 = (value: string | undefined): bigint => decodeHex(value, 64);

export function emptyMapExploration(): MapExplorationSave {
  return {
    version: 2,
    fineChunks: {},
    detailedChunks: [],
    discoveredSectors: {},
    sectorOrder: [],
    discoveredRegions: [],
    compactedRegions: [],
    pinnedRegions: [],
    lastPosition: { worldX: "0", worldY: "0" },
    revision: 0,
  };
}

function sectorInfo(cx: bigint, cy: bigint): { key: string; bit: number; sx: bigint; sy: bigint } {
  const sx = floorDivBigInt(cx, SECTOR_CHUNKS);
  const sy = floorDivBigInt(cy, SECTOR_CHUNKS);
  const localX = Number(floorModBigInt(cx, SECTOR_CHUNKS));
  const localY = Number(floorModBigInt(cy, SECTOR_CHUNKS));
  return { key: pairKey(sx, sy), bit: localY * 8 + localX, sx, sy };
}

function regionInfo(sx: bigint, sy: bigint): { key: string; bit: number } {
  const rx = floorDivBigInt(sx, REGION_SECTORS);
  const ry = floorDivBigInt(sy, REGION_SECTORS);
  const localX = Number(floorModBigInt(sx, REGION_SECTORS));
  const localY = Number(floorModBigInt(sy, REGION_SECTORS));
  return { key: pairKey(rx, ry), bit: localY * 16 + localX };
}

function regionKey(sx: bigint, sy: bigint): string {
  return regionInfo(sx, sy).key;
}

function chunkRegionKey(cx: bigint, cy: bigint): string {
  const sector = sectorInfo(cx, cy);
  return regionKey(sector.sx, sector.sy);
}

function detailedChunkIsPinned(save: MapExplorationSave, key: string): boolean {
  const parsed = parsePairKey(key);
  return parsed ? save.pinnedRegions.includes(chunkRegionKey(parsed[0], parsed[1])) : false;
}

function sectorIsPinned(save: MapExplorationSave, key: string): boolean {
  const parsed = parsePairKey(key);
  return parsed ? save.pinnedRegions.includes(regionKey(parsed[0], parsed[1])) : false;
}

export function isChunkDiscovered(save: MapExplorationSave, cx: bigint, cy: bigint): boolean {
  const sector = sectorInfo(cx, cy);
  if (save.compactedRegions.includes(regionKey(sector.sx, sector.sy))) return true;
  return hasBit(decodeHex64(save.discoveredSectors[sector.key]), sector.bit);
}

export type ChunkExplorationLevel = "unknown" | "partial" | "detailed" | "coarse";

export function getChunkExplorationLevel(save: MapExplorationSave, cx: bigint, cy: bigint): ChunkExplorationLevel {
  const sector = sectorInfo(cx, cy);
  if (save.compactedRegions.includes(regionKey(sector.sx, sector.sy))) return "coarse";
  const key = pairKey(cx, cy);
  const fineMask = save.fineChunks[key];
  if (fineMask) return decodeHex64(fineMask) === FULL_MASK_64 ? "detailed" : "partial";
  return isChunkDiscovered(save, cx, cy) ? "coarse" : "unknown";
}

export function isWorldTileDiscovered(save: MapExplorationSave, worldX: bigint, worldY: bigint): boolean {
  const cx = floorDivBigInt(worldX, CHUNK_SIZE_TILES);
  const cy = floorDivBigInt(worldY, CHUNK_SIZE_TILES);
  const key = pairKey(cx, cy);
  const fineMask = save.fineChunks[key];
  if (!fineMask) return isChunkDiscovered(save, cx, cy) && !save.detailedChunks.includes(key);
  const fineX = Number(floorDivBigInt(floorModBigInt(worldX, CHUNK_SIZE_TILES), FINE_CELL_SIZE_TILES));
  const fineY = Number(floorDivBigInt(floorModBigInt(worldY, CHUNK_SIZE_TILES), FINE_CELL_SIZE_TILES));
  return hasBit(decodeHex64(fineMask), fineY * 8 + fineX);
}

function cloneExploration(save: MapExplorationSave): MapExplorationSave {
  return {
    ...save,
    fineChunks: { ...save.fineChunks },
    detailedChunks: [...save.detailedChunks],
    discoveredSectors: { ...save.discoveredSectors },
    sectorOrder: [...save.sectorOrder],
    discoveredRegions: [...save.discoveredRegions],
    compactedRegions: [...save.compactedRegions],
    pinnedRegions: [...save.pinnedRegions],
    lastPosition: { ...save.lastPosition },
  };
}

function revealFineCellMutable(save: MapExplorationSave, globalFineX: bigint, globalFineY: bigint): boolean {
  const cx = floorDivBigInt(globalFineX, FINE_GRID_SIZE);
  const cy = floorDivBigInt(globalFineY, FINE_GRID_SIZE);
  const localX = Number(floorModBigInt(globalFineX, FINE_GRID_SIZE));
  const localY = Number(floorModBigInt(globalFineY, FINE_GRID_SIZE));
  const key = pairKey(cx, cy);
  const oldFineMask = decodeHex64(save.fineChunks[key]);
  const newFineMask = setBit(oldFineMask, localY * 8 + localX);
  if (newFineMask === oldFineMask) return false;

  const sector = sectorInfo(cx, cy);
  const sectorMask = setBit(decodeHex64(save.discoveredSectors[sector.key]), sector.bit);
  save.fineChunks[key] = encodeHex64(newFineMask);
  if (save.detailedChunks.at(-1) !== key) {
    save.detailedChunks = save.detailedChunks.filter((entry) => entry !== key);
    save.detailedChunks.push(key);
  }
  while (save.detailedChunks.length > MAX_DETAILED_CHUNKS) {
    const evictionIndex = save.detailedChunks.findIndex((entry) => !detailedChunkIsPinned(save, entry));
    if (evictionIndex < 0) break;
    const [evicted] = save.detailedChunks.splice(evictionIndex, 1);
    if (evicted) delete save.fineChunks[evicted];
  }

  save.discoveredSectors[sector.key] = encodeHex64(sectorMask);
  if (save.sectorOrder.at(-1) !== sector.key) {
    save.sectorOrder = save.sectorOrder.filter((entry) => entry !== sector.key);
    save.sectorOrder.push(sector.key);
  }
  while (save.sectorOrder.length > MAX_DETAILED_SECTORS) {
    const evictionIndex = save.sectorOrder.findIndex((entry) => !sectorIsPinned(save, entry));
    if (evictionIndex < 0) break;
    const [evicted] = save.sectorOrder.splice(evictionIndex, 1);
    if (!evicted) break;
    delete save.discoveredSectors[evicted];
    const parsed = parsePairKey(evicted);
    if (!parsed) continue;
    const evictedRegion = regionKey(parsed[0], parsed[1]);
    if (!save.compactedRegions.includes(evictedRegion)) save.compactedRegions.push(evictedRegion);
  }
  if (save.compactedRegions.length > MAX_REGIONS) save.compactedRegions.splice(0, save.compactedRegions.length - MAX_REGIONS);

  const region = regionInfo(sector.sx, sector.sy);
  if (!save.discoveredRegions.includes(region.key)) save.discoveredRegions = [...save.discoveredRegions, region.key].slice(-MAX_REGIONS);
  save.revision += 1;
  return true;
}

export function discoverAtWorldTile(save: MapExplorationSave, worldX: bigint, worldY: bigint, radius = 3): MapExplorationSave {
  const startedAt = performance.now();
  const centerFineX = floorDivBigInt(worldX, FINE_CELL_SIZE_TILES);
  const centerFineY = floorDivBigInt(worldY, FINE_CELL_SIZE_TILES);
  const next = cloneExploration(save);
  let changed = false;
  for (let dy = -radius; dy <= radius; dy += 1) {
    for (let dx = -radius; dx <= radius; dx += 1) {
      if (dx * dx + dy * dy <= radius * radius) changed = revealFineCellMutable(next, centerFineX + BigInt(dx), centerFineY + BigInt(dy)) || changed;
    }
  }
  if (changed) {
    next.lastPosition = { worldX: worldX.toString(), worldY: worldY.toString() };
    metrics.revealCount += 1;
  }
  metrics.lastRevealMs = performance.now() - startedAt;
  return changed ? next : save;
}

export function discoverChunk(save: MapExplorationSave, cx: bigint, cy: bigint, worldX = cx * CHUNK_SIZE_TILES, worldY = cy * CHUNK_SIZE_TILES): MapExplorationSave {
  const next = cloneExploration(save);
  let changed = false;
  for (let fy = 0n; fy < FINE_GRID_SIZE; fy += 1n) {
    for (let fx = 0n; fx < FINE_GRID_SIZE; fx += 1n) changed = revealFineCellMutable(next, cx * FINE_GRID_SIZE + fx, cy * FINE_GRID_SIZE + fy) || changed;
  }
  if (changed) next.lastPosition = { worldX: worldX.toString(), worldY: worldY.toString() };
  return changed ? next : save;
}

export function discoverChunkRadius(save: MapExplorationSave, cx: bigint, cy: bigint, radius = 1, worldX = cx * CHUNK_SIZE_TILES, worldY = cy * CHUNK_SIZE_TILES): MapExplorationSave {
  let next = save;
  for (let dy = -radius; dy <= radius; dy += 1) {
    for (let dx = -radius; dx <= radius; dx += 1) next = discoverChunk(next, cx + BigInt(dx), cy + BigInt(dy), worldX, worldY);
  }
  return next;
}

export function migrateVisitedChunks(visitedChunks: readonly string[]): MapExplorationSave {
  let save = emptyMapExploration();
  for (const key of visitedChunks) {
    const parsed = parsePairKey(key);
    if (parsed) save = discoverChunk(save, parsed[0], parsed[1]);
  }
  return visitedChunks.length === 0 ? discoverAtWorldTile(save, 8n, 8n) : save;
}

function storageKey(seedKey: string): string {
  return `genshin-fake.map-exploration.v2.${seedKey}`;
}

function sanitizeRecord(value: unknown, digits: number): Record<string, string> {
  if (!value || typeof value !== "object") return {};
  const result: Record<string, string> = {};
  for (const [key, mask] of Object.entries(value)) {
    if (parsePairKey(key) && typeof mask === "string" && decodeHex(mask, digits) !== 0n) result[key] = encodeHex(decodeHex(mask, digits), digits);
  }
  return result;
}

export function loadMapExploration(seedKey: string, legacyVisitedChunks: readonly string[] = []): MapExplorationSave {
  const raw = localStorage.getItem(storageKey(seedKey));
  if (!raw) {
    const migrated = migrateVisitedChunks(legacyVisitedChunks);
    writeMapExploration(seedKey, migrated);
    return migrated;
  }
  try {
    const parsed = JSON.parse(raw) as Partial<MapExplorationSave>;
    if (parsed.version !== 2) throw new Error("Unsupported exploration save");
    const discoveredSectors = sanitizeRecord(parsed.discoveredSectors, 16);
    const detailedChunks = Array.isArray(parsed.detailedChunks) ? parsed.detailedChunks.filter((key) => parsePairKey(key)).slice(-MAX_DETAILED_CHUNKS) : [];
    const fineChunks = sanitizeRecord(parsed.fineChunks, 16);
    // Older V2 saves only had chunk masks. Treat their detailed chunks as fully revealed.
    for (const key of detailedChunks) if (!fineChunks[key]) fineChunks[key] = encodeHex64(FULL_MASK_64);
    return {
      version: 2,
      fineChunks,
      detailedChunks,
      discoveredSectors,
      sectorOrder: Array.isArray(parsed.sectorOrder) ? parsed.sectorOrder.filter((key) => parsePairKey(key)).slice(-MAX_DETAILED_SECTORS) : Object.keys(discoveredSectors).slice(-MAX_DETAILED_SECTORS),
      discoveredRegions: Array.isArray(parsed.discoveredRegions) ? parsed.discoveredRegions.filter((key) => parsePairKey(key)).slice(-MAX_REGIONS) : [],
      compactedRegions: Array.isArray(parsed.compactedRegions) ? parsed.compactedRegions.filter((key) => parsePairKey(key)).slice(-MAX_REGIONS) : [],
      pinnedRegions: Array.isArray(parsed.pinnedRegions) ? parsed.pinnedRegions.filter((key) => parsePairKey(key)).slice(-100) : [],
      lastPosition: parsed.lastPosition && /^-?\d+$/.test(parsed.lastPosition.worldX) && /^-?\d+$/.test(parsed.lastPosition.worldY) ? parsed.lastPosition : { worldX: "0", worldY: "0" },
      revision: Number.isSafeInteger(parsed.revision) && (parsed.revision ?? 0) >= 0 ? parsed.revision as number : 0,
    };
  } catch {
    const migrated = migrateVisitedChunks(legacyVisitedChunks);
    writeMapExploration(seedKey, migrated);
    return migrated;
  }
}

function writeMapExploration(seedKey: string, save: MapExplorationSave): void {
  const startedAt = performance.now();
  const serialized = JSON.stringify(save);
  try {
    localStorage.setItem(storageKey(seedKey), serialized);
    metrics.saveError = null;
  } catch (error) {
    metrics.saveError = error instanceof Error ? error.message : String(error);
  }
  metrics.lastSaveMs = performance.now() - startedAt;
  metrics.saveBytes = new TextEncoder().encode(serialized).byteLength;
  void saveExplorationToIndexedDb(seedKey, save).catch((error: unknown) => {
    metrics.saveError = `IndexedDB: ${error instanceof Error ? error.message : String(error)}`;
  });
}

export async function hydrateMapExploration(seedKey: string, localSave: MapExplorationSave): Promise<MapExplorationSave> {
  try {
    const indexedSave = await loadExplorationFromIndexedDb(seedKey);
    if (!indexedSave || indexedSave.version !== 2 || indexedSave.revision < localSave.revision) {
      void saveExplorationToIndexedDb(seedKey, localSave);
      return localSave;
    }
    if (indexedSave.revision > localSave.revision) localStorage.setItem(storageKey(seedKey), JSON.stringify(indexedSave));
    return indexedSave;
  } catch (error) {
    metrics.saveError = `IndexedDB: ${error instanceof Error ? error.message : String(error)}`;
    return localSave;
  }
}

export function flushMapExplorationSaves(): void {
  for (const [seedKey, pending] of pendingSaves) {
    clearTimeout(pending.timer);
    writeMapExploration(seedKey, pending.save);
  }
  pendingSaves.clear();
}

export function saveMapExploration(seedKey: string, save: MapExplorationSave): void {
  const previous = pendingSaves.get(seedKey);
  if (previous) clearTimeout(previous.timer);
  const timer = setTimeout(() => {
    const pending = pendingSaves.get(seedKey);
    if (!pending) return;
    writeMapExploration(seedKey, pending.save);
    pendingSaves.delete(seedKey);
  }, SAVE_DELAY_MS);
  pendingSaves.set(seedKey, { save, timer });
  if (!flushListenersInstalled && typeof window !== "undefined") {
    flushListenersInstalled = true;
    window.addEventListener("pagehide", flushMapExplorationSaves);
    document.addEventListener("visibilitychange", () => { if (document.visibilityState === "hidden") flushMapExplorationSaves(); });
  }
}

export function estimateMapExplorationBytes(save: MapExplorationSave): number {
  return new TextEncoder().encode(JSON.stringify(save)).byteLength;
}

export const exportMapExploration = exportExploration;

export function importMapExploration(serialized: string): MapExplorationSave {
  const imported = importExploration(serialized);
  const fineChunks = sanitizeRecord(imported.fineChunks, 16);
  const discoveredSectors = sanitizeRecord(imported.discoveredSectors, 16);
  return {
    version: 2,
    fineChunks,
    detailedChunks: Array.isArray(imported.detailedChunks) ? imported.detailedChunks.filter((key) => parsePairKey(key)).slice(-MAX_DETAILED_CHUNKS) : [],
    discoveredSectors,
    sectorOrder: Array.isArray(imported.sectorOrder) ? imported.sectorOrder.filter((key) => parsePairKey(key)).slice(-MAX_DETAILED_SECTORS) : [],
    discoveredRegions: Array.isArray(imported.discoveredRegions) ? imported.discoveredRegions.filter((key) => parsePairKey(key)).slice(-MAX_REGIONS) : [],
    compactedRegions: Array.isArray(imported.compactedRegions) ? imported.compactedRegions.filter((key) => parsePairKey(key)).slice(-MAX_REGIONS) : [],
    pinnedRegions: Array.isArray(imported.pinnedRegions) ? imported.pinnedRegions.filter((key) => parsePairKey(key)).slice(-100) : [],
    lastPosition: imported.lastPosition && /^-?\d+$/.test(imported.lastPosition.worldX) && /^-?\d+$/.test(imported.lastPosition.worldY) ? imported.lastPosition : { worldX: "0", worldY: "0" },
    revision: Number.isSafeInteger(imported.revision) && imported.revision >= 0 ? imported.revision + 1 : 1,
  };
}

export function getMapExplorationMetrics(): MapExplorationMetrics {
  return { ...metrics };
}

export function setExplorationWaypointPin(save: MapExplorationSave, worldX: bigint | null, worldY: bigint | null): MapExplorationSave {
  const pinnedRegions = worldX === null || worldY === null
    ? []
    : [chunkRegionKey(floorDivBigInt(worldX, CHUNK_SIZE_TILES), floorDivBigInt(worldY, CHUNK_SIZE_TILES))];
  if (pinnedRegions.length === save.pinnedRegions.length && pinnedRegions.every((key, index) => key === save.pinnedRegions[index])) return save;
  return { ...save, pinnedRegions, revision: save.revision + 1 };
}

export function clearMapExploration(seedKey: string): MapExplorationSave {
  const pending = pendingSaves.get(seedKey);
  if (pending) clearTimeout(pending.timer);
  pendingSaves.delete(seedKey);
  const empty = discoverAtWorldTile(emptyMapExploration(), 8n, 8n);
  writeMapExploration(seedKey, empty);
  return empty;
}
