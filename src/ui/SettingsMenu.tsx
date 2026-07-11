import { useEffect, useState } from "react";
import type { GameSettings } from "../game/settings";
import { DEFAULT_SETTINGS } from "../game/settings";
import type { WorkerStatus } from "../game/types";
import type { PerformanceStats } from "./PerformancePanel";
import type { ExplorationStats } from "./ExplorationPanel";
import type { RuntimeQuality } from "../game/core/QualityManager";

type Tab = "gameplay" | "graphics" | "controls" | "world" | "developer";

type DeveloperStats = {
  worldX: string;
  worldY: string;
  chunkX: string;
  chunkY: string;
  originX: string;
  originY: string;
  loadedChunks: number;
  pendingChunks: number;
  inFlightChunks: number;
  queuedChunks: number;
  cacheSize: number;
  status: WorkerStatus;
  tests: string[];
};

const KEY_OPTIONS = ["KeyW", "KeyA", "KeyS", "KeyD", "KeyQ", "KeyE", "KeyR", "KeyF", "ShiftLeft", "Space"];

function Toggle({ checked, onChange, label }: { checked: boolean; onChange: (checked: boolean) => void; label: string }) {
  return (
    <label className="settingToggle">
      <span>{label}</span>
      <input type="checkbox" checked={checked} onChange={(event) => onChange(event.target.checked)} />
    </label>
  );
}

function Range({ label, value, min, max, step, onChange, suffix = "" }: { label: string; value: number; min: number; max: number; step: number; onChange: (value: number) => void; suffix?: string }) {
  return (
    <label className="settingRange">
      <span>{label}<output>{value.toFixed(step < 1 ? 2 : 0)}{suffix}</output></span>
      <input type="range" value={value} min={min} max={max} step={step} onChange={(event) => onChange(Number(event.target.value))} />
    </label>
  );
}

export function SettingsMenu({
  settings,
  runtimeQuality,
  seed,
  performance,
  developer,
  exploration,
  debug,
  debugCollision,
  onApply,
  onClose,
  onOpenSeed,
  onOpenTeleport,
  onResetPosition,
  onClearCache,
  onResetCamera,
  onToggleDebug,
  onToggleCollisionDebug,
  onRunTests,
  onResetExploration,
}: {
  settings: GameSettings;
  runtimeQuality: RuntimeQuality;
  seed: string[][];
  performance: PerformanceStats;
  developer: DeveloperStats;
  exploration: ExplorationStats;
  debug: boolean;
  debugCollision: boolean;
  onApply: (settings: GameSettings) => void;
  onClose: () => void;
  onOpenSeed: () => void;
  onOpenTeleport: () => void;
  onResetPosition: () => void;
  onClearCache: () => void;
  onResetCamera: () => void;
  onToggleDebug: () => void;
  onToggleCollisionDebug: () => void;
  onRunTests: () => void;
  onResetExploration: () => void;
}) {
  const [draft, setDraft] = useState<GameSettings>(() => structuredClone(settings));
  const [tab, setTab] = useState<Tab>(() => {
    if (!import.meta.env.DEV) return "gameplay";
    const requested = new URLSearchParams(window.location.search).get("settings") as Tab | null;
    return requested && ["gameplay", "graphics", "controls", "world", "developer"].includes(requested) ? requested : "gameplay";
  });

  useEffect(() => setDraft(structuredClone(settings)), [settings]);

  const update = <S extends keyof GameSettings>(section: S, values: Partial<GameSettings[S]>) => {
    setDraft((current) => ({ ...current, [section]: { ...current[section], ...values } }));
  };
  const tabs: { id: Tab; label: string }[] = [
    { id: "gameplay", label: "Gameplay" },
    { id: "graphics", label: "Graphics" },
    { id: "controls", label: "Controls" },
    { id: "world", label: "World" },
  ];
  if (import.meta.env.DEV || draft.gameplay.developerMode) tabs.push({ id: "developer", label: "Developer" });

  function apply(): void {
    onApply(draft);
    onClose();
  }

  function resetDefaults(): void {
    setDraft(structuredClone(DEFAULT_SETTINGS));
    setTab("gameplay");
  }

  return (
    <div className="settingsOverlay" role="dialog" aria-modal="true" aria-label="Cài đặt">
      <section className="settingsPanel">
        <header className="settingsHeader">
          <div><span className="settingsEyebrow">Infinite Matrix World</span><h2>Cài đặt</h2></div>
          <button className="iconButton" type="button" onClick={onClose} title="Đóng" aria-label="Đóng">×</button>
        </header>
        <nav className="settingsTabs" aria-label="Nhóm cài đặt">
          {tabs.map((item) => <button key={item.id} className={tab === item.id ? "active" : ""} onClick={() => setTab(item.id)}>{item.label}</button>)}
        </nav>
        <div className="settingsBody">
          {tab === "gameplay" && <div className="settingsSection">
            <h3>Camera và giao diện</h3>
            <Range label="Độ nhạy camera" value={draft.gameplay.cameraSensitivity} min={0.25} max={2.5} step={0.05} onChange={(cameraSensitivity) => update("gameplay", { cameraSensitivity })} />
            <Range label="Khoảng cách camera" value={draft.gameplay.cameraDistance} min={6} max={36} step={1} onChange={(cameraDistance) => update("gameplay", { cameraDistance })} />
            <Toggle label="Đảo trục Y" checked={draft.gameplay.invertY} onChange={(invertY) => update("gameplay", { invertY })} />
            <Toggle label="Tự động chạy" checked={draft.gameplay.autoRun} onChange={(autoRun) => update("gameplay", { autoRun })} />
            <Toggle label="Hiện minimap" checked={draft.gameplay.showMinimap} onChange={(showMinimap) => update("gameplay", { showMinimap })} />
            <Toggle label="Hiện mục tiêu" checked={draft.gameplay.showQuestTracker} onChange={(showQuestTracker) => update("gameplay", { showQuestTracker })} />
            {!import.meta.env.DEV && <Toggle label="Developer mode" checked={draft.gameplay.developerMode} onChange={(developerMode) => update("gameplay", { developerMode })} />}
          </div>}

          {tab === "graphics" && <div className="settingsSection">
            <h3>Chất lượng hiển thị</h3>
            <div className="runtimeQuality"><span>Runtime</span><strong>{runtimeQuality.toUpperCase()}</strong></div>
            <label className="settingSelect"><span>Preset</span><select value={draft.graphics.qualityPreset} onChange={(event) => update("graphics", { qualityPreset: event.target.value as GameSettings["graphics"]["qualityPreset"] })}><option value="low">Low</option><option value="medium">Medium</option><option value="high">High</option><option value="auto">Auto</option></select></label>
            <Range label="Khoảng render" value={draft.graphics.renderDistance} min={1} max={4} step={1} onChange={(renderDistance) => update("graphics", { renderDistance })} suffix=" chunks" />
            <label className="settingSelect"><span>Chi tiết terrain</span><select value={draft.graphics.terrainDetail} onChange={(event) => update("graphics", { terrainDetail: event.target.value as GameSettings["graphics"]["terrainDetail"] })}><option value="low">Low</option><option value="medium">Medium</option><option value="high">High</option></select></label>
            <Range label="Mật độ thực vật" value={draft.graphics.vegetationDensity} min={0.2} max={1} step={0.05} onChange={(vegetationDensity) => update("graphics", { vegetationDensity })} />
            <label className="settingSelect"><span>Shadow</span><select value={draft.graphics.shadowQuality} onChange={(event) => update("graphics", { shadowQuality: event.target.value as GameSettings["graphics"]["shadowQuality"] })}><option value="off">Off</option><option value="low">Low</option><option value="medium">Medium</option><option value="high">High</option></select></label>
            <label className="settingSelect"><span>Water</span><select value={draft.graphics.waterQuality} onChange={(event) => update("graphics", { waterQuality: event.target.value as GameSettings["graphics"]["waterQuality"] })}><option value="low">Low</option><option value="medium">Medium</option><option value="high">High</option></select></label>
            <Range label="Pixel ratio" value={draft.graphics.pixelRatio} min={0.75} max={2} step={0.05} onChange={(pixelRatio) => update("graphics", { pixelRatio })} />
            <label className="settingSelect"><span>Giới hạn FPS</span><select value={draft.graphics.fpsLimit} onChange={(event) => update("graphics", { fpsLimit: Number(event.target.value) as GameSettings["graphics"]["fpsLimit"] })}><option value={0}>Auto</option><option value={30}>30</option><option value={45}>45</option><option value={60}>60</option></select></label>
            <label className="settingSelect"><span>Fog</span><select value={draft.graphics.fogQuality} onChange={(event) => update("graphics", { fogQuality: event.target.value as GameSettings["graphics"]["fogQuality"] })}><option value="low">Low</option><option value="medium">Medium</option><option value="high">High</option></select></label>
            <Toggle label="Cỏ trang trí" checked={draft.graphics.decorativeGrass} onChange={(decorativeGrass) => update("graphics", { decorativeGrass })} />
            <Toggle label="Hoa" checked={draft.graphics.flowers} onChange={(flowers) => update("graphics", { flowers })} />
            <Toggle label="Shadow xa" checked={draft.graphics.distantShadows} onChange={(distantShadows) => update("graphics", { distantShadows })} />
          </div>}

          {tab === "controls" && <div className="settingsSection">
            <h3>Bàn phím và cảm ứng</h3>
            {(["forward", "backward", "left", "right", "run", "jump"] as const).map((control) => <label className="settingSelect" key={control}><span>{({ forward: "Tiến", backward: "Lùi", left: "Trái", right: "Phải", run: "Chạy", jump: "Nhảy" })[control]}</span><select value={draft.controls[control]} onChange={(event) => update("controls", { [control]: event.target.value })}>{KEY_OPTIONS.map((key) => <option key={key} value={key}>{key.replace("Key", "")}</option>)}</select></label>)}
            <Range label="Kích thước joystick" value={draft.controls.joystickSize} min={88} max={160} step={4} onChange={(joystickSize) => update("controls", { joystickSize })} suffix=" px" />
            <Range label="Độ mờ joystick" value={draft.controls.joystickOpacity} min={0.25} max={1} step={0.05} onChange={(joystickOpacity) => update("controls", { joystickOpacity })} />
            <Range label="Độ nhạy camera cảm ứng" value={draft.controls.touchCameraSensitivity} min={0.25} max={2.5} step={0.05} onChange={(touchCameraSensitivity) => update("controls", { touchCameraSensitivity })} />
          </div>}

          {tab === "world" && <div className="settingsSection">
            <h3>Thế giới</h3>
            <div className="worldSeed"><span>Seed hiện tại</span><code>{seed.map((row) => `[${row.join(", ")}]`).join(" ")}</code></div>
            <div className="settingsCommands"><button onClick={onOpenSeed}>Sửa seed</button><button onClick={onOpenTeleport}>Teleport</button><button onClick={onResetPosition}>Về điểm đầu</button><button onClick={onClearCache}>Xóa world cache</button><button onClick={onResetCamera}>Đặt lại camera</button></div>
          </div>}

          {tab === "developer" && <div className="settingsSection developerSection">
            <h3>Runtime</h3>
            <div className="metricsGrid">
              <span>FPS<strong>{performance.fps}</strong></span><span>Frame avg<strong>{performance.frameTimeMs.toFixed(1)} ms</strong></span><span>Frame max<strong>{performance.frameTimeMaxMs.toFixed(1)} ms</strong></span><span>JS heap<strong>{performance.jsHeap}</strong></span><span>Chunk data<strong>{(performance.chunkPayloadBytes / 1024 / 1024).toFixed(1)} MB</strong></span><span>Worker avg<strong>{performance.workerAvgMs.toFixed(1)} ms</strong></span><span>Worker max<strong>{performance.workerMaxMs.toFixed(1)} ms</strong></span><span>Triangles<strong>{performance.estimatedTriangles.toLocaleString()}</strong></span><span>Draw calls<strong>{performance.estimatedDrawCalls}</strong></span><span>Geometries<strong>{performance.geometryCount}</strong></span><span>Textures<strong>{performance.textureCount}</strong></span><span>Loaded chunks<strong>{developer.loadedChunks}</strong></span><span>Wanted chunks<strong>{developer.pendingChunks}</strong></span><span>In-flight<strong>{developer.inFlightChunks}</strong></span><span>Queued locally<strong>{developer.queuedChunks}</strong></span><span>Cache size<strong>{developer.cacheSize}</strong></span><span>Worker<strong>{developer.status}</strong></span><span>World<strong>{developer.worldX}, {developer.worldY}</strong></span><span>Chunk<strong>{developer.chunkX}, {developer.chunkY}</strong></span><span>Floating origin<strong>{developer.originX}, {developer.originY}</strong></span>
            </div>
            <h3>Khám phá</h3>
            <div className="metricsGrid"><span>Chunks đã thăm<strong>{exploration.visitedChunks.length}</strong></span><span>Quãng đường<strong>{exploration.distanceTiles.toFixed(1)}</strong></span><span>Cây đã thấy<strong>{exploration.seenTrees}</strong></span><span>Đá đã thấy<strong>{exploration.seenRocks}</strong></span></div>
            <div className="settingsCommands"><button onClick={onToggleDebug}>{debug ? "Tắt chunk debug" : "Bật chunk debug"}</button><button onClick={onToggleCollisionDebug}>{debugCollision ? "Tắt collision debug" : "Bật collision debug"}</button><button onClick={onRunTests}>Chạy self tests</button><button onClick={onResetExploration}>Xóa hành trình</button></div>
            {developer.tests.length > 0 && <p className="testResult">Tests: {developer.tests.join(", ")}</p>}
          </div>}
        </div>
        <footer className="settingsFooter"><button onClick={resetDefaults}>Mặc định</button><div><button onClick={onClose}>Hủy</button><button className="primaryButton" onClick={apply}>Áp dụng</button></div></footer>
      </section>
    </div>
  );
}
