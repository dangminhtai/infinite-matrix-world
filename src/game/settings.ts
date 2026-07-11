export type QualityPreset = "low" | "medium" | "high" | "auto";
export type DetailLevel = "low" | "medium" | "high";
export type ShadowQuality = "off" | "low" | "medium" | "high";
export type FpsLimit = 0 | 30 | 45 | 60;

export type GameSettings = {
  gameplay: {
    cameraSensitivity: number;
    cameraDistance: number;
    invertY: boolean;
    autoRun: boolean;
    showMinimap: boolean;
    allowMapTeleport: boolean;
    developerMode: boolean;
  };
  graphics: {
    qualityPreset: QualityPreset;
    renderDistance: number;
    terrainDetail: DetailLevel;
    vegetationDensity: number;
    shadowQuality: ShadowQuality;
    waterQuality: DetailLevel;
    pixelRatio: number;
    fpsLimit: FpsLimit;
    fogQuality: DetailLevel;
    decorativeGrass: boolean;
    flowers: boolean;
    distantShadows: boolean;
  };
  controls: {
    forward: string;
    backward: string;
    left: string;
    right: string;
    run: string;
    jump: string;
    interact: string;
    attack: string;
    skill: string;
    joystickSize: number;
    joystickOpacity: number;
    touchCameraSensitivity: number;
  };
};

export const DEFAULT_SETTINGS: GameSettings = {
  gameplay: {
    cameraSensitivity: 1,
    cameraDistance: 18,
    invertY: false,
    autoRun: false,
    showMinimap: true,
    allowMapTeleport: false,
    developerMode: import.meta.env.DEV,
  },
  graphics: {
    qualityPreset: "auto",
    renderDistance: 3,
    terrainDetail: "high",
    vegetationDensity: 1,
    shadowQuality: "medium",
    waterQuality: "medium",
    pixelRatio: 1.5,
    fpsLimit: 0,
    fogQuality: "medium",
    decorativeGrass: true,
    flowers: true,
    distantShadows: false,
  },
  controls: {
    forward: "KeyW",
    backward: "KeyS",
    left: "KeyA",
    right: "KeyD",
    run: "ShiftLeft",
    jump: "Space",
    interact: "KeyE",
    attack: "KeyJ",
    skill: "KeyK",
    joystickSize: 112,
    joystickOpacity: 0.72,
    touchCameraSensitivity: 1,
  },
};

function clamp(value: unknown, fallback: number, min: number, max: number): number {
  return typeof value === "number" && Number.isFinite(value) ? Math.max(min, Math.min(max, value)) : fallback;
}

export function loadSettings(): GameSettings {
  const saved = localStorage.getItem("ihmw.settings.v1");
  if (!saved) return structuredClone(DEFAULT_SETTINGS);
  try {
    const parsed = JSON.parse(saved) as Partial<GameSettings>;
    return {
      gameplay: {
        ...DEFAULT_SETTINGS.gameplay,
        ...parsed.gameplay,
        cameraSensitivity: clamp(parsed.gameplay?.cameraSensitivity, 1, 0.25, 2.5),
        cameraDistance: clamp(parsed.gameplay?.cameraDistance, 18, 6, 36),
      },
      graphics: {
        ...DEFAULT_SETTINGS.graphics,
        ...parsed.graphics,
        renderDistance: Math.round(clamp(parsed.graphics?.renderDistance, 3, 1, 4)),
        vegetationDensity: clamp(parsed.graphics?.vegetationDensity, 1, 0.2, 1),
        pixelRatio: clamp(parsed.graphics?.pixelRatio, 1.5, 0.75, 2),
      },
      controls: {
        ...DEFAULT_SETTINGS.controls,
        ...parsed.controls,
        joystickSize: clamp(parsed.controls?.joystickSize, 112, 88, 160),
        joystickOpacity: clamp(parsed.controls?.joystickOpacity, 0.72, 0.25, 1),
        touchCameraSensitivity: clamp(parsed.controls?.touchCameraSensitivity, 1, 0.25, 2.5),
      },
    };
  } catch {
    localStorage.removeItem("ihmw.settings.v1");
    return structuredClone(DEFAULT_SETTINGS);
  }
}

export function saveSettings(settings: GameSettings): void {
  localStorage.setItem("ihmw.settings.v1", JSON.stringify(settings));
}
