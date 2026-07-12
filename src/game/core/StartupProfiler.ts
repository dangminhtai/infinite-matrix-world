export type StartupProfile = {
  appToWorkerMs: number | null;
  workerToFirstChunkMs: number | null;
  workerToCenterChunkMs: number | null;
  centerToControllableMs: number | null;
  appToControllableMs: number | null;
  nearbyChunksReadyMs: number | null;
  characterReadyMs: number | null;
  glbResources: Array<{ name: string; durationMs: number; transferKB: number }>;
  runtimeSamples: number;
  minimumFps: number | null;
  maximumFrameMs: number;
  minimapDraws: number;
  minimapAverageMs: number;
  minimapMaximumMs: number;
};

const startedAt = performance.now();
const marks = new Map<string, number>([["app-start", startedAt]]);
let runtimeSamples = 0;
let minimumFps = Infinity;
let maximumFrameMs = 0;
let minimapDraws = 0;
let minimapTotalMs = 0;
let minimapMaximumMs = 0;

export function markStartup(name: string): void {
  if (!marks.has(name)) marks.set(name, performance.now());
}

export function recordRuntimeSample(fps: number, frameMaxMs: number): void {
  if (Number.isFinite(fps) && fps > 0) {
    runtimeSamples += 1;
    minimumFps = Math.min(minimumFps, fps);
  }
  if (Number.isFinite(frameMaxMs)) maximumFrameMs = Math.max(maximumFrameMs, frameMaxMs);
}

export function recordMinimapDraw(durationMs: number): void {
  if (!Number.isFinite(durationMs) || durationMs < 0) return;
  minimapDraws += 1;
  minimapTotalMs += durationMs;
  minimapMaximumMs = Math.max(minimapMaximumMs, durationMs);
}

function elapsed(from: string, to: string): number | null {
  const start = marks.get(from);
  const end = marks.get(to);
  return start === undefined || end === undefined ? null : Math.max(0, end - start);
}

function resourceName(url: string): string {
  try {
    return decodeURIComponent(new URL(url).pathname.split("/").pop() ?? url);
  } catch {
    return url;
  }
}

export function getStartupProfile(): StartupProfile {
  const resources = performance.getEntriesByType("resource") as PerformanceResourceTiming[];
  return {
    appToWorkerMs: elapsed("app-start", "worker-created"),
    workerToFirstChunkMs: elapsed("worker-created", "first-chunk-ready"),
    workerToCenterChunkMs: elapsed("worker-created", "center-chunk-ready"),
    centerToControllableMs: elapsed("center-chunk-ready", "player-controllable"),
    appToControllableMs: elapsed("app-start", "player-controllable"),
    nearbyChunksReadyMs: elapsed("app-start", "nearby-chunks-ready"),
    characterReadyMs: elapsed("app-start", "character-ready"),
    glbResources: resources
      .filter((entry) => entry.name.toLowerCase().includes(".glb"))
      .map((entry) => ({
        name: resourceName(entry.name),
        durationMs: entry.duration,
        transferKB: entry.transferSize / 1024,
      }))
      .sort((a, b) => b.durationMs - a.durationMs),
    runtimeSamples,
    minimumFps: Number.isFinite(minimumFps) ? minimumFps : null,
    maximumFrameMs,
    minimapDraws,
    minimapAverageMs: minimapDraws ? minimapTotalMs / minimapDraws : 0,
    minimapMaximumMs,
  };
}
