const SECTOR_CHUNKS = 8n;
const REGION_SECTORS = 16n;
const MAX_DETAILED_CHUNKS = 4_096;
const MAX_REGIONS = 16_384;

export type MapExplorationSave = {
  version: 2;
  detailedChunks: string[];
  discoveredSectors: Record<string, string>;
  discoveredRegions: string[];
  lastPosition: { worldX: string; worldY: string };
};

export function floorDivBigInt(value: bigint, divisor: bigint): bigint {
  let quotient = value / divisor;
  if (value < 0n && value % divisor !== 0n) quotient -= 1n;
  return quotient;
}

export function emptyMapExploration(): MapExplorationSave {
  return { version: 2, detailedChunks: [], discoveredSectors: {}, discoveredRegions: [], lastPosition: { worldX: "0", worldY: "0" } };
}

function chunkKey(cx: bigint, cy: bigint): string {
  return `${cx},${cy}`;
}

function sectorInfo(cx: bigint, cy: bigint): { key: string; bit: bigint; sx: bigint; sy: bigint } {
  const sx = floorDivBigInt(cx, SECTOR_CHUNKS);
  const sy = floorDivBigInt(cy, SECTOR_CHUNKS);
  const localX = cx - sx * SECTOR_CHUNKS;
  const localY = cy - sy * SECTOR_CHUNKS;
  return { key: `${sx},${sy}`, bit: localY * SECTOR_CHUNKS + localX, sx, sy };
}

function regionKey(sx: bigint, sy: bigint): string {
  return `${floorDivBigInt(sx, REGION_SECTORS)},${floorDivBigInt(sy, REGION_SECTORS)}`;
}

function parseMask(value: string | undefined): bigint {
  if (!value) return 0n;
  try {
    return BigInt(`0x${value}`);
  } catch {
    return 0n;
  }
}

export function isChunkDiscovered(save: MapExplorationSave, cx: bigint, cy: bigint): boolean {
  const sector = sectorInfo(cx, cy);
  return (parseMask(save.discoveredSectors[sector.key]) & (1n << sector.bit)) !== 0n;
}

export function discoverChunk(save: MapExplorationSave, cx: bigint, cy: bigint, worldX = cx * 16n, worldY = cy * 16n): MapExplorationSave {
  const sector = sectorInfo(cx, cy);
  const mask = parseMask(save.discoveredSectors[sector.key]);
  const bitMask = 1n << sector.bit;
  const key = chunkKey(cx, cy);
  if ((mask & bitMask) !== 0n && save.detailedChunks.at(-1) === key && save.lastPosition.worldX === worldX.toString() && save.lastPosition.worldY === worldY.toString()) return save;

  const detailedChunks = save.detailedChunks.filter((entry) => entry !== key);
  detailedChunks.push(key);
  if (detailedChunks.length > MAX_DETAILED_CHUNKS) detailedChunks.splice(0, detailedChunks.length - MAX_DETAILED_CHUNKS);
  const region = regionKey(sector.sx, sector.sy);
  const discoveredRegions = save.discoveredRegions.includes(region) ? save.discoveredRegions : [...save.discoveredRegions, region].slice(-MAX_REGIONS);
  return {
    version: 2,
    detailedChunks,
    discoveredSectors: { ...save.discoveredSectors, [sector.key]: (mask | bitMask).toString(16) },
    discoveredRegions,
    lastPosition: { worldX: worldX.toString(), worldY: worldY.toString() },
  };
}

export function migrateVisitedChunks(visitedChunks: readonly string[]): MapExplorationSave {
  let save = emptyMapExploration();
  for (const key of visitedChunks) {
    const [cxText, cyText] = key.split(",");
    try {
      save = discoverChunk(save, BigInt(cxText), BigInt(cyText));
    } catch {
      // Ignore malformed legacy keys without discarding valid exploration.
    }
  }
  return visitedChunks.length === 0 ? discoverChunk(save, 0n, 0n, 8n, 8n) : save;
}

function storageKey(seedKey: string): string {
  return `genshin-fake.map-exploration.v2.${seedKey}`;
}

export function loadMapExploration(seedKey: string, legacyVisitedChunks: readonly string[] = []): MapExplorationSave {
  const raw = localStorage.getItem(storageKey(seedKey));
  if (!raw) {
    const migrated = migrateVisitedChunks(legacyVisitedChunks);
    saveMapExploration(seedKey, migrated);
    return migrated;
  }
  try {
    const parsed = JSON.parse(raw) as Partial<MapExplorationSave>;
    if (parsed.version !== 2) throw new Error("Unsupported exploration save");
    return {
      version: 2,
      detailedChunks: Array.isArray(parsed.detailedChunks) ? parsed.detailedChunks.slice(-MAX_DETAILED_CHUNKS) : [],
      discoveredSectors: parsed.discoveredSectors && typeof parsed.discoveredSectors === "object" ? parsed.discoveredSectors : {},
      discoveredRegions: Array.isArray(parsed.discoveredRegions) ? parsed.discoveredRegions.slice(-MAX_REGIONS) : [],
      lastPosition: parsed.lastPosition && typeof parsed.lastPosition.worldX === "string" && typeof parsed.lastPosition.worldY === "string" ? parsed.lastPosition : { worldX: "0", worldY: "0" },
    };
  } catch {
    const migrated = migrateVisitedChunks(legacyVisitedChunks);
    saveMapExploration(seedKey, migrated);
    return migrated;
  }
}

export function saveMapExploration(seedKey: string, save: MapExplorationSave): void {
  localStorage.setItem(storageKey(seedKey), JSON.stringify(save));
}

export function clearMapExploration(seedKey: string): MapExplorationSave {
  const empty = discoverChunk(emptyMapExploration(), 0n, 0n, 8n, 8n);
  saveMapExploration(seedKey, empty);
  return empty;
}
