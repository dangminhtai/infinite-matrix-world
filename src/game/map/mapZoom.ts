export const MAP_ZOOM_MIN_LEVEL = 0;
export const MAP_ZOOM_MAX_LEVEL = 100;
export const MAP_ZOOM_DEFAULT_LEVEL = 65;
export const MAP_ZOOM_MAX_SCALE = 16;
export const MAX_VISIBLE_MAP_TILES = 420;

const MAP_CHUNK_SIZE = 16;
const MIN_SCALE_FLOOR = 1.5;
const VIEWPORT_SAFETY_FACTOR = 1.15;

export function clampZoomLevel(level: number): number {
  return Math.max(MAP_ZOOM_MIN_LEVEL, Math.min(MAP_ZOOM_MAX_LEVEL, level));
}

export function calculateMapMinScale(width: number, height: number): number {
  const safeWidth = Math.max(1, width);
  const safeHeight = Math.max(1, height);
  const tileBudgetArea = MAX_VISIBLE_MAP_TILES * MAP_CHUNK_SIZE * MAP_CHUNK_SIZE;
  return Math.min(MAP_ZOOM_MAX_SCALE, Math.max(MIN_SCALE_FLOOR, Math.sqrt((safeWidth * safeHeight) / tileBudgetArea) * VIEWPORT_SAFETY_FACTOR));
}

export function zoomLevelToScale(level: number, minScale: number, maxScale = MAP_ZOOM_MAX_SCALE): number {
  if (minScale >= maxScale) return maxScale;
  const progress = clampZoomLevel(level) / MAP_ZOOM_MAX_LEVEL;
  return minScale * Math.pow(maxScale / minScale, progress);
}

export function scaleRatioToZoomDelta(ratio: number, minScale: number, maxScale = MAP_ZOOM_MAX_SCALE): number {
  if (!Number.isFinite(ratio) || ratio <= 0 || minScale >= maxScale) return 0;
  return (Math.log(ratio) / Math.log(maxScale / minScale)) * MAP_ZOOM_MAX_LEVEL;
}
