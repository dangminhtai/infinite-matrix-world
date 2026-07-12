import type { GameSettings, QualityPreset } from "../settings";

export type RuntimeQuality = "low" | "medium" | "high";

type NavigatorWithDeviceMemory = Navigator & { deviceMemory?: number };

const WINDOW_MS = 4_000;
const COOLDOWN_MS = 10_000;
const STABLE_WINDOWS_TO_RAISE = 3;

function detectInitialQuality(): RuntimeQuality {
  const memory = (navigator as NavigatorWithDeviceMemory).deviceMemory ?? 8;
  const cores = navigator.hardwareConcurrency || 4;
  const touchDevice = window.matchMedia("(pointer: coarse)").matches;
  if (memory <= 4 || cores <= 4) return "low";
  if (touchDevice || memory <= 6 || cores <= 6) return "medium";
  return "high";
}

function detectConstrainedDevice(): boolean {
  const memory = (navigator as NavigatorWithDeviceMemory).deviceMemory ?? 8;
  const cores = navigator.hardwareConcurrency || 4;
  const coarsePointer = window.matchMedia("(pointer: coarse)").matches;
  const smallViewport = Math.min(window.innerWidth, window.innerHeight) <= 760;
  return coarsePointer || smallViewport || memory <= 6 || cores <= 6;
}

function presetLevel(preset: QualityPreset, current: RuntimeQuality): RuntimeQuality {
  return preset === "auto" ? current : preset;
}

export class QualityManager {
  private preset: QualityPreset;
  private level: RuntimeQuality;
  private windowStartedAt = performance.now();
  private fpsTotal = 0;
  private sampleCount = 0;
  private stableWindows = 0;
  private lastChangedAt = -COOLDOWN_MS;

  constructor(preset: QualityPreset, initialLevel = detectInitialQuality()) {
    this.preset = preset;
    this.level = presetLevel(preset, initialLevel);
  }

  get runtimeLevel(): RuntimeQuality {
    return this.level;
  }

  setPreset(preset: QualityPreset): RuntimeQuality {
    this.preset = preset;
    this.level = presetLevel(preset, this.level);
    this.resetWindow(performance.now());
    return this.level;
  }

  sample(fps: number, now: number, targetFps: number): RuntimeQuality | null {
    if (this.preset !== "auto" || !Number.isFinite(fps) || fps <= 0) return null;
    this.fpsTotal += fps;
    this.sampleCount += 1;
    if (now - this.windowStartedAt < WINDOW_MS) return null;

    const average = this.sampleCount ? this.fpsTotal / this.sampleCount : targetFps;
    const canChange = now - this.lastChangedAt >= COOLDOWN_MS;
    let next = this.level;
    if (average < targetFps * 0.82) {
      this.stableWindows = 0;
      if (canChange) next = this.level === "high" ? "medium" : "low";
    } else if (average >= targetFps * 0.95) {
      this.stableWindows += 1;
      if (canChange && this.stableWindows >= STABLE_WINDOWS_TO_RAISE) next = this.level === "low" ? "medium" : "high";
    } else {
      this.stableWindows = 0;
    }

    this.resetWindow(now);
    if (next === this.level) return null;
    this.level = next;
    this.stableWindows = 0;
    this.lastChangedAt = now;
    return next;
  }

  private resetWindow(now: number): void {
    this.windowStartedAt = now;
    this.fpsTotal = 0;
    this.sampleCount = 0;
  }
}

export function resolveGraphicsQuality(graphics: GameSettings["graphics"], level: RuntimeQuality): GameSettings["graphics"] {
  const constrainedDevice = detectConstrainedDevice();
  if (level === "low") {
    return {
      ...graphics,
      renderDistance: 1,
      terrainDetail: "low",
      vegetationDensity: constrainedDevice ? 0.16 : 0.3,
      shadowQuality: "off",
      waterQuality: "low",
      pixelRatio: Math.min(graphics.pixelRatio, 1),
      fogQuality: "low",
      decorativeGrass: false,
      flowers: false,
      distantShadows: false,
    };
  }
  if (level === "medium") {
    return {
      ...graphics,
      renderDistance: constrainedDevice ? 1 : 2,
      terrainDetail: "medium",
      vegetationDensity: constrainedDevice ? 0.22 : 0.65,
      shadowQuality: constrainedDevice ? "off" : "low",
      waterQuality: "medium",
      pixelRatio: Math.min(graphics.pixelRatio, constrainedDevice ? 1 : 1.25),
      fogQuality: "medium",
      decorativeGrass: true,
      flowers: !constrainedDevice,
      distantShadows: false,
    };
  }
  if (constrainedDevice) {
    return {
      ...graphics,
      renderDistance: 1,
      terrainDetail: "medium",
      vegetationDensity: Math.min(graphics.vegetationDensity, 0.3),
      shadowQuality: "low",
      waterQuality: "medium",
      pixelRatio: Math.min(graphics.pixelRatio, 1.15),
      fogQuality: "medium",
      decorativeGrass: true,
      flowers: false,
      distantShadows: false,
    };
  }
  return {
    ...graphics,
    renderDistance: Math.min(4, Math.max(3, graphics.renderDistance)),
    terrainDetail: "high",
    vegetationDensity: 1,
    shadowQuality: "high",
    waterQuality: "high",
    pixelRatio: Math.min(graphics.pixelRatio, 1.75),
    fogQuality: "high",
    decorativeGrass: true,
    flowers: true,
  };
}
