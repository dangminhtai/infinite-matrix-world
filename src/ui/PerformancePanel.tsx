import type { ChunkPayload } from "../game/types";
import { TERRAIN_VISUAL_SUBDIVISIONS } from "../game/constants";
import type { GameSettings } from "../game/settings";

export type PerformanceStats = {
  fps: number;
  jsHeap: string;
  workerAvgMs: number;
  workerMaxMs: number;
  treeCount: number;
  rockCount: number;
  flowerCount: number;
  estimatedTriangles: number;
  estimatedDrawCalls: number;
  avgPayloadBytes: number;
  chunkPayloadBytes: number;
};

type PerformanceWithMemory = Performance & {
  memory?: {
    usedJSHeapSize: number;
    totalJSHeapSize: number;
    jsHeapSizeLimit: number;
  };
};

function formatBytes(bytes: number): string {
  if (!Number.isFinite(bytes)) return "n/a";
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

export function collectPerformanceStats(chunks: ChunkPayload[], fps: number, graphics?: GameSettings["graphics"]): PerformanceStats {
  const perf = performance as PerformanceWithMemory;
  const durations = chunks.map((chunk) => chunk.durationMs);
  const density = graphics?.vegetationDensity ?? 1;
  const treeCount = Math.ceil(chunks.reduce((sum, chunk) => sum + chunk.trees.length, 0) * density);
  const rockCount = Math.ceil(chunks.reduce((sum, chunk) => sum + chunk.rocks.length, 0) * density);
  const flowerCount = graphics?.flowers === false ? 0 : Math.ceil(chunks.reduce((sum, chunk) => sum + chunk.flowers.length, 0) * density);
  const avgPayloadBytes = chunks.length ? chunks.reduce((sum, chunk) => sum + chunk.payloadBytes, 0) / chunks.length : 0;
  const terrainStride = graphics?.terrainDetail === "low" ? 4 : graphics?.terrainDetail === "medium" ? 2 : 1;
  const terrainCells = TERRAIN_VISUAL_SUBDIVISIONS / terrainStride;
  const terrainTrianglesPerChunk = terrainCells * terrainCells * 2 + TERRAIN_VISUAL_SUBDIVISIONS * 8;
  return {
    fps,
    jsHeap: perf.memory ? `${formatBytes(perf.memory.usedJSHeapSize)} / ${formatBytes(perf.memory.jsHeapSizeLimit)}` : "Browser không hỗ trợ",
    workerAvgMs: durations.length ? durations.reduce((a, b) => a + b, 0) / durations.length : 0,
    workerMaxMs: durations.length ? Math.max(...durations) : 0,
    treeCount,
    rockCount,
    flowerCount,
    estimatedTriangles: chunks.length * terrainTrianglesPerChunk + treeCount * 11 + rockCount * 20 + flowerCount * 8,
    estimatedDrawCalls: chunks.length + (treeCount ? 2 : 0) + (rockCount ? 1 : 0) + (flowerCount ? 1 : 0) + 2,
    avgPayloadBytes,
    chunkPayloadBytes: chunks.reduce((sum, chunk) => sum + chunk.payloadBytes, 0),
  };
}

export function PerformancePanel({ stats }: { stats: PerformanceStats }) {
  return (
    <section className="sidePanel performancePanel">
      <h2>Performance</h2>
      <span>FPS {stats.fps}</span>
      <span>JS heap {stats.jsHeap}</span>
      <span>Worker avg {stats.workerAvgMs.toFixed(1)} ms</span>
      <span>Worker max {stats.workerMaxMs.toFixed(1)} ms</span>
      <span>Triangles ~{stats.estimatedTriangles.toLocaleString()}</span>
      <span>Draw calls ~{stats.estimatedDrawCalls}</span>
      <span>Payload avg {formatBytes(stats.avgPayloadBytes)}</span>
      <span>Trees {stats.treeCount}</span>
      <span>Rocks {stats.rockCount}</span>
      <span>Flowers {stats.flowerCount}</span>
    </section>
  );
}
