import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { DEFAULT_SEED, MAX_SEEN_DECOR_KEYS, MAX_VISITED_CHUNKS } from "./game/constants";
import { GameCanvas } from "./game/GameCanvas";
import { ChunkManager } from "./game/world/chunkManager";
import type { ChunkPayload, WorkerStatus } from "./game/types";
import { HUD } from "./ui/HUD";
import { SeedEditor } from "./ui/SeedEditor";
import { TeleportDialog } from "./ui/TeleportDialog";
import { LoadingOverlay } from "./ui/LoadingOverlay";
import { Minimap } from "./ui/Minimap";
import { collectPerformanceStats } from "./ui/PerformancePanel";
import { emptyExploration, type ExplorationStats } from "./ui/ExplorationPanel";
import { BIOME_NAMES } from "./game/types";
import { loadSettings, saveSettings, type GameSettings } from "./game/settings";
import { SettingsMenu } from "./ui/SettingsMenu";
import { QualityManager, resolveGraphicsQuality, type RuntimeQuality } from "./game/core/QualityManager";
import { InventoryMenu } from "./ui/InventoryMenu";
import { WorldMap } from "./ui/WorldMap";
import type { MapEnemy, MapWaypoint, TrackedTarget } from "./game/map/types";
import { CHARACTER_CATALOG } from "./game/characters/characterCatalog";
import { calculateCharacterStats } from "./game/characters/characterProgression";
import { addProfileReward, ascendCharacter, loadAndMigratePlayerProfile, profileInventory, purchaseCharacter, savePlayerProfile, selectCharacter, upgradeCharacter, upgradeCharacterMax, type PlayerProfile, type ProfileTransaction } from "./game/characters/ProfileManager";
import { CharacterMenu } from "./ui/CharacterMenu";
import type { EnemyCombatState } from "./game/entities/EntitySystem";

function formatWorldCoordinate(baseTile: bigint, localOffset: number): string {
  const wholeOffset = Math.floor(localOffset);
  const fraction = localOffset - wholeOffset;
  const integerPart = baseTile + BigInt(wholeOffset);
  if (fraction < 0.0005) return integerPart.toString();
  if (integerPart < 0n) {
    const magnitude = -integerPart - 1n;
    return `-${magnitude.toString()}.${Math.floor((1 - fraction) * 100).toString().padStart(2, "0")}`;
  }
  return `${integerPart.toString()}.${Math.floor(fraction * 100).toString().padStart(2, "0")}`;
}

function defaultSeedStrings(): string[][] {
  const saved = localStorage.getItem("ihmw.seed");
  if (saved) {
    try {
      const parsed = JSON.parse(saved) as string[][];
      parsed.forEach((row) => row.forEach((value) => BigInt(value)));
      return parsed;
    } catch {
      localStorage.removeItem("ihmw.seed");
    }
  }
  return DEFAULT_SEED.map((row) => row.map((value) => value.toString()));
}

function addBounded(set: Set<string>, value: string, maxSize: number): boolean {
  if (set.has(value)) return false;
  set.add(value);
  while (set.size > maxSize) {
    const oldest = set.values().next().value as string | undefined;
    if (oldest === undefined) break;
    set.delete(oldest);
  }
  return true;
}

function formatTargetDistance(target: { worldX: string; worldY: string; offsetX: number; offsetY: number } | null, worldTileX: string, worldTileY: string, offsetX: number, offsetY: number): string {
  if (!target) return "";
  const dx = Number(BigInt(target.worldX) - BigInt(worldTileX)) + target.offsetX - offsetX;
  const dy = Number(BigInt(target.worldY) - BigInt(worldTileY)) + target.offsetY - offsetY;
  const distance = Math.hypot(dx, dy);
  if (!Number.isFinite(distance)) return "Rất xa";
  if (distance < 1000) return `${Math.round(distance)} m`;
  return `${(distance / 1000).toFixed(distance < 10_000 ? 1 : 0)} km`;
}

export default function App() {
  const [seed, setSeed] = useState(defaultSeedStrings);
  const [settings, setSettings] = useState(loadSettings);
  const qualityManager = useMemo(() => new QualityManager(settings.graphics.qualityPreset), []);
  const [runtimeQuality, setRuntimeQuality] = useState<RuntimeQuality>(qualityManager.runtimeLevel);
  const effectiveSettings = useMemo<GameSettings>(() => ({
    ...settings,
    graphics: resolveGraphicsQuality(settings.graphics, runtimeQuality),
  }), [runtimeQuality, settings]);
  const seedKey = JSON.stringify(seed);
  const [profile, setProfile] = useState<PlayerProfile>(() => loadAndMigratePlayerProfile(seedKey));
  const inventory = useMemo(() => profileInventory(profile), [profile]);
  const [showInventory, setShowInventory] = useState(false);
  const [showCharacters, setShowCharacters] = useState(false);
  const [interactionLabel, setInteractionLabel] = useState("");
  const [notification, setNotification] = useState("");
  const [showMap, setShowMap] = useState(false);
  const [mapEnemies, setMapEnemies] = useState<MapEnemy[]>([]);
  const [trackedTarget, setTrackedTarget] = useState<TrackedTarget | null>(null);
  const [mapWaypoint, setMapWaypoint] = useState<MapWaypoint | null>(null);
  const [enemyCombat, setEnemyCombat] = useState<EnemyCombatState>(null);
  const manager = useMemo(() => {
    const next = new ChunkManager(seed);
    next.setActiveRadius(effectiveSettings.graphics.renderDistance);
    return next;
  }, []);
  const [chunks, setChunks] = useState<ChunkPayload[]>([]);
  const [status, setStatus] = useState<WorkerStatus>("idle");
  const [error, setError] = useState("");
  const [debug, setDebug] = useState(false);
  const [debugCollision, setDebugCollision] = useState(false);
  const [tests, setTests] = useState<string[]>([]);
  const [showSeed, setShowSeed] = useState(false);
  const [showTeleport, setShowTeleport] = useState(false);
  const [showSettings, setShowSettings] = useState(() => import.meta.env.DEV && new URLSearchParams(window.location.search).has("settings"));
  const [pending, setPending] = useState(0);
  const [worldRevealed, setWorldRevealed] = useState(false);
  const [stats, setStats] = useState({
    worldX: "0",
    worldY: "0",
    worldTileX: "0",
    worldTileY: "0",
    offsetX: 0,
    offsetY: 0,
    chunkX: "0",
    chunkY: "0",
    originX: "0",
    originY: "0",
    cameraYaw: 0,
    playerYaw: 0,
    cameraZoom: 23,
    fps: 0,
    health: 100,
    maxHealth: 100,
    stamina: 100,
    swimming: false,
    climbing: false,
    frameTimeMs: 0,
    frameTimeMaxMs: 0,
    drawCalls: 0,
    triangles: 0,
    geometries: 0,
    textures: 0,
  });
  const [resetCameraToken, setResetCameraToken] = useState(0);
  const [exploration, setExploration] = useState<ExplorationStats>(() => {
    const saved = localStorage.getItem(`ihmw.exploration.${seedKey}`);
    if (!saved) return emptyExploration(seedKey);
    try {
      return JSON.parse(saved) as ExplorationStats;
    } catch {
      return emptyExploration(seedKey);
    }
  });
  const [teleport, setTeleport] = useState<{ x: bigint; y: bigint; token: number } | null>(null);
  const lastChunk = useRef("0,0");
  const lastTile = useRef<{ x: bigint; y: bigint; offsetX: number; offsetY: number } | null>(null);
  const lastStatsAt = useRef(0);
  const lastExplorationAt = useRef(0);
  const chunkRefreshFrame = useRef<number | null>(null);
  const notificationTimer = useRef<number | null>(null);
  const seenDecorKeys = useRef(new Set<string>());

  const performanceStats = useMemo(
    () => collectPerformanceStats(chunks, stats.fps, effectiveSettings.graphics, stats),
    [chunks, effectiveSettings.graphics, stats],
  );
  const initialWorldReady = chunks.length >= 9;

  useEffect(() => {
    if (!initialWorldReady || worldRevealed) return;
    const timer = window.setTimeout(() => setWorldRevealed(true), 280);
    return () => window.clearTimeout(timer);
  }, [initialWorldReady, worldRevealed]);

  useEffect(() => {
    setRuntimeQuality(qualityManager.setPreset(settings.graphics.qualityPreset));
  }, [qualityManager, settings.graphics.qualityPreset]);

  useEffect(() => {
    manager.setActiveRadius(effectiveSettings.graphics.renderDistance);
    const [cxText, cyText] = lastChunk.current.split(",");
    const cx = BigInt(cxText);
    const cy = BigInt(cyText);
    manager.ensureAround(cx, cy);
    setChunks(manager.rendered.entries().map(([, chunk]) => chunk));
    setPending(manager.pendingCount);
  }, [effectiveSettings.graphics.renderDistance, manager]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      const formTarget = event.target instanceof HTMLInputElement || event.target instanceof HTMLTextAreaElement || event.target instanceof HTMLSelectElement;
      if (event.code === "KeyM" && !formTarget) {
        const next = !showMap;
        setShowMap(next);
        if (next) {
          setShowInventory(false);
          setShowCharacters(false);
          setShowSeed(false);
          setShowTeleport(false);
          setShowSettings(false);
        }
        return;
      }
      if (event.code === "KeyI" && !formTarget) {
        setShowMap(false);
        setShowCharacters(false);
        setShowInventory((current) => !current);
        return;
      }
      if (event.code === "KeyC" && !formTarget) {
        setShowMap(false);
        setShowInventory(false);
        setShowCharacters((current) => !current);
        return;
      }
      if (event.key !== "Escape") return;
      if (showMap) setShowMap(false);
      else if (showCharacters) setShowCharacters(false);
      else if (showInventory) setShowInventory(false);
      else if (showSeed) setShowSeed(false);
      else if (showTeleport) setShowTeleport(false);
      else setShowSettings((current) => !current);
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [showCharacters, showInventory, showMap, showSeed, showTeleport]);

  useEffect(() => {
    const offChunk = manager.onChunk(() => {
      if (chunkRefreshFrame.current !== null) return;
      chunkRefreshFrame.current = window.requestAnimationFrame(() => {
        chunkRefreshFrame.current = null;
        setChunks(manager.rendered.entries().map(([, chunk]) => chunk));
        setPending(manager.pendingCount);
        setStatus(manager.pendingCount ? "loading" : "ready");
      });
    });
    const offError = manager.onError((message) => {
      setError(message);
      setStatus("error");
    });
    manager.ensureAround(0n, 0n);
    setStatus("loading");
    setPending(manager.pendingCount);
    return () => {
      offChunk();
      offError();
      if (chunkRefreshFrame.current !== null) window.cancelAnimationFrame(chunkRefreshFrame.current);
      manager.dispose();
    };
  }, [manager]);

  const ensureChunk = useCallback((cx: bigint, cy: bigint, direction: { x: number; y: number } = { x: 0, y: 0 }) => {
    const key = `${cx},${cy}`;
    if (key === lastChunk.current) return;
    lastChunk.current = key;
    manager.ensureAround(cx, cy, direction);
    setChunks(manager.rendered.entries().map(([, chunk]) => chunk));
    setPending(manager.pendingCount);
    setStatus(manager.pendingCount ? "loading" : "ready");
  }, [manager]);

  const applySeed = useCallback((nextSeed: string[][]) => {
    const nextKey = JSON.stringify(nextSeed);
    setSeed(nextSeed);
    setProfile(loadAndMigratePlayerProfile(nextKey));
    setMapEnemies([]);
    setTrackedTarget(null);
    setMapWaypoint(null);
    const saved = localStorage.getItem(`ihmw.exploration.${nextKey}`);
    setExploration(saved ? JSON.parse(saved) as ExplorationStats : emptyExploration(nextKey));
    seenDecorKeys.current.clear();
    lastTile.current = null;
    manager.setSeed(nextSeed);
    setChunks([]);
    lastChunk.current = "0,0";
    manager.ensureAround(0n, 0n);
    setPending(manager.pendingCount);
    setStatus("loading");
  }, [manager]);

  const clearCache = useCallback(() => {
    manager.clear();
    const cx = BigInt(stats.chunkX);
    const cy = BigInt(stats.chunkY);
    manager.ensureAround(cx, cy);
    setChunks([]);
    setPending(manager.pendingCount);
    setStatus("loading");
  }, [manager, stats.chunkX, stats.chunkY]);

  const teleportTo = useCallback((x: bigint, y: bigint) => {
    setTeleport({ x, y, token: Date.now() });
    setExploration((current) => {
      const next = { ...current, teleports: current.teleports + 1 };
      localStorage.setItem(`ihmw.exploration.${seedKey}`, JSON.stringify(next));
      return next;
    });
    const cx = x >= 0n ? x / 16n : (x - 15n) / 16n;
    const cy = y >= 0n ? y / 16n : (y - 15n) / 16n;
    lastChunk.current = `${cx},${cy}`;
    manager.teleportTo(cx, cy);
    setChunks([]);
    setStatus("loading");
    setPending(manager.pendingCount);
  }, [manager, seedKey]);

  const applySettings = useCallback((next: GameSettings) => {
    saveSettings(next);
    setSettings(next);
  }, []);

  const runSelfTests = useCallback(() => {
    void import("./game/world/selfTest").then(({ selfTest }) => setTests(selfTest())).catch((err: unknown) => {
      const e = err instanceof Error ? err : new Error(String(err));
      setError(e.stack ?? e.message);
    });
  }, []);

  const notify = useCallback((message: string) => {
    setNotification(message);
    if (notificationTimer.current !== null) window.clearTimeout(notificationTimer.current);
    notificationTimer.current = window.setTimeout(() => {
      notificationTimer.current = null;
      setNotification("");
    }, 2200);
  }, []);

  const selectedProgress = profile.characters[profile.selectedCharacterId] ?? { level: 1, ascendedCaps: [] };
  const playerStats = useMemo(() => calculateCharacterStats(CHARACTER_CATALOG[profile.selectedCharacterId], selectedProgress.level), [profile.selectedCharacterId, selectedProgress.level]);

  const commitProfileTransaction = useCallback((transaction: ProfileTransaction, successMessage: string) => {
    if (!transaction.ok) {
      const messages: Record<typeof transaction.reason, string> = {
        "already-owned": "Nhân vật này đã được sở hữu",
        "character-locked": "Nhân vật chưa được mở khóa",
        "insufficient-primogem": "Không đủ Nguyên Thạch",
        "insufficient-mora": "Không đủ Mora",
        "insufficient-slime": "Không đủ Dịch Slime",
        "ascension-required": "Cần đột phá trước khi nâng cấp",
        "not-at-ascension": "Chưa đến mốc đột phá",
        "max-level": "Nhân vật đã đạt cấp 100",
      };
      notify(messages[transaction.reason]);
      return;
    }
    savePlayerProfile(transaction.profile);
    setProfile(transaction.profile);
    notify(successMessage);
  }, [notify]);

  const handleReward = useCallback((itemId: "primogem" | "mora" | "slime_condensate", amount: number) => {
    setProfile((current) => {
      const next = addProfileReward(current, itemId, amount);
      savePlayerProfile(next);
      return next;
    });
  }, []);

  const updateMapEnemies = useCallback((enemies: MapEnemy[]) => {
    setMapEnemies(enemies);
    setTrackedTarget((current) => current ? enemies.find((enemy) => enemy.id === current.id) ?? current : null);
  }, []);

  const handleEnemyDefeated = useCallback((id: string) => {
    setTrackedTarget((current) => current?.id === id ? null : current);
  }, []);

  useEffect(() => () => {
    if (notificationTimer.current !== null) window.clearTimeout(notificationTimer.current);
  }, []);

  const resetExploration = useCallback(() => {
    const next = emptyExploration(seedKey);
    seenDecorKeys.current.clear();
    lastTile.current = null;
    localStorage.setItem(`ihmw.exploration.${seedKey}`, JSON.stringify(next));
    setExploration(next);
  }, [seedKey]);

  const onStats = useCallback((state: { tileX: bigint; tileY: bigint; localX: number; localZ: number; yaw: number; cameraYaw: number; cameraZoom: number; fps: number; health: number; maxHealth: number; stamina: number; swimming: boolean; climbing: boolean; frameTimeMs: number; frameTimeMaxMs: number; drawCalls: number; triangles: number; geometries: number; textures: number }) => {
    const worldTileX = state.tileX + BigInt(Math.floor(state.localX));
    const worldTileY = state.tileY + BigInt(Math.floor(state.localZ));
    const offsetX = state.localX - Math.floor(state.localX);
    const offsetY = state.localZ - Math.floor(state.localZ);
    const chunkX = worldTileX >= 0n ? worldTileX / 16n : (worldTileX - 15n) / 16n;
    const chunkY = worldTileY >= 0n ? worldTileY / 16n : (worldTileY - 15n) / 16n;
    const now = performance.now();
    if (now - lastStatsAt.current >= 250) {
      lastStatsAt.current = now;
      const touchDevice = window.matchMedia("(pointer: coarse)").matches;
      const targetFps = settings.graphics.fpsLimit || (touchDevice ? 45 : 60);
      const nextQuality = qualityManager.sample(state.fps, now, targetFps);
      if (nextQuality) setRuntimeQuality(nextQuality);
      setStats({
        worldX: formatWorldCoordinate(state.tileX, state.localX),
        worldY: formatWorldCoordinate(state.tileY, state.localZ),
        worldTileX: worldTileX.toString(),
        worldTileY: worldTileY.toString(),
        offsetX,
        offsetY,
        chunkX: chunkX.toString(),
        chunkY: chunkY.toString(),
        originX: state.tileX.toString(),
        originY: state.tileY.toString(),
        cameraYaw: state.cameraYaw,
        playerYaw: state.yaw,
        cameraZoom: state.cameraZoom,
        fps: state.fps,
        health: state.health,
        maxHealth: state.maxHealth,
        stamina: state.stamina,
        swimming: state.swimming,
        climbing: state.climbing,
        frameTimeMs: state.frameTimeMs,
        frameTimeMaxMs: state.frameTimeMaxMs,
        drawCalls: state.drawCalls,
        triangles: state.triangles,
        geometries: state.geometries,
        textures: state.textures,
      });
    }
    if (now - lastExplorationAt.current < 1500) return;
    lastExplorationAt.current = now;
    const previous = lastTile.current;
    lastTile.current = { x: worldTileX, y: worldTileY, offsetX, offsetY };
    setExploration((current) => {
      const visitedChunks = new Set(current.visitedChunks);
      addBounded(visitedChunks, `${chunkX},${chunkY}`, MAX_VISITED_CHUNKS);
      const biomes = new Set(current.visitedBiomes);
      const currentChunk = chunks.find((chunk) => chunk.cx === chunkX.toString() && chunk.cy === chunkY.toString());
      currentChunk?.biomes.forEach((biome) => biomes.add(BIOME_NAMES[biome] ?? "grass"));
      let seenTrees = current.seenTrees;
      let seenRocks = current.seenRocks;
      let seenFlowers = current.seenFlowers;
      for (const chunk of chunks) {
        for (const tree of chunk.trees) if (addBounded(seenDecorKeys.current, tree.id, MAX_SEEN_DECOR_KEYS)) seenTrees += 1;
        for (const rock of chunk.rocks) if (addBounded(seenDecorKeys.current, rock.id, MAX_SEEN_DECOR_KEYS)) seenRocks += 1;
        for (const flower of chunk.flowers) if (addBounded(seenDecorKeys.current, flower.id, MAX_SEEN_DECOR_KEYS)) seenFlowers += 1;
      }
      const distanceAdd = previous ? Math.hypot(Number(worldTileX - previous.x) + offsetX - previous.offsetX, Number(worldTileY - previous.y) + offsetY - previous.offsetY) : 0;
      const farthest = Math.hypot(Number(worldTileX), Number(worldTileY));
      const next: ExplorationStats = {
        ...current,
        seedKey,
        visitedChunks: [...visitedChunks],
        visitedBiomes: [...biomes],
        distanceTiles: current.distanceTiles + distanceAdd,
        farthestDistance: Math.max(current.farthestDistance, farthest),
        maxAbsX: (BigInt(current.maxAbsX) > (worldTileX < 0n ? -worldTileX : worldTileX) ? BigInt(current.maxAbsX) : (worldTileX < 0n ? -worldTileX : worldTileX)).toString(),
        maxAbsY: (BigInt(current.maxAbsY) > (worldTileY < 0n ? -worldTileY : worldTileY) ? BigInt(current.maxAbsY) : (worldTileY < 0n ? -worldTileY : worldTileY)).toString(),
        seenTrees,
        seenRocks,
        seenFlowers,
      };
      localStorage.setItem(`ihmw.exploration.${seedKey}`, JSON.stringify(next));
      return next;
    });
  }, [chunks, qualityManager, seedKey, settings.graphics.fpsLimit]);

  const targetDistance = formatTargetDistance(trackedTarget, stats.worldTileX, stats.worldTileY, stats.offsetX, stats.offsetY);
  const waypointDistance = formatTargetDistance(mapWaypoint, stats.worldTileX, stats.worldTileY, stats.offsetX, stats.offsetY);

  return (
    <main>
      <GameCanvas chunks={chunks} debug={debug} debugCollision={debugCollision} onChunkChange={ensureChunk} onStats={onStats} teleport={teleport} resetCameraToken={resetCameraToken} settings={effectiveSettings} paused={!worldRevealed || showSettings || showSeed || showTeleport || showInventory || showCharacters || showMap} seedKey={seedKey} characterId={profile.selectedCharacterId} playerStats={playerStats} onReward={handleReward} onInteractionChange={setInteractionLabel} onNotify={notify} onMapEnemiesChange={updateMapEnemies} onEnemyDefeated={handleEnemyDefeated} onEnemyCombatChange={setEnemyCombat} />
      <HUD
        health={stats.health}
        maxHealth={stats.maxHealth}
        stamina={stats.stamina}
        swimming={stats.swimming}
        climbing={stats.climbing}
        interactionLabel={interactionLabel}
        interactionKey={settings.controls.interact.replace("Key", "")}
        notification={notification}
        trackedTarget={trackedTarget}
        targetDistance={targetDistance}
        waypoint={mapWaypoint}
        waypointDistance={waypointDistance}
        enemyCombat={enemyCombat}
        onClearTarget={() => setTrackedTarget(null)}
        onClearWaypoint={() => setMapWaypoint(null)}
        onInventory={() => setShowInventory(true)}
        onCharacters={() => setShowCharacters(true)}
        onSettings={() => setShowSettings(true)}
      />
      {settings.gameplay.showMinimap && <Minimap chunks={chunks} worldTileX={stats.worldTileX} worldTileY={stats.worldTileY} offsetX={stats.offsetX} offsetY={stats.offsetY} playerYaw={stats.playerYaw} enemies={mapEnemies} target={trackedTarget} waypoint={mapWaypoint} onOpenMap={() => setShowMap(true)} />}
      {showSettings && <SettingsMenu
        settings={settings}
        runtimeQuality={runtimeQuality}
        seed={seed}
        performance={performanceStats}
        developer={{ worldX: stats.worldX, worldY: stats.worldY, chunkX: stats.chunkX, chunkY: stats.chunkY, originX: stats.originX, originY: stats.originY, loadedChunks: chunks.length, pendingChunks: pending, inFlightChunks: manager.inFlightCount, queuedChunks: manager.queuedCount, cacheSize: manager.generated.size, status, tests }}
        exploration={exploration}
        debug={debug}
        debugCollision={debugCollision}
        onApply={applySettings}
        onClose={() => setShowSettings(false)}
        onOpenSeed={() => { setShowSettings(false); setShowSeed(true); }}
        onOpenTeleport={() => { setShowSettings(false); setShowTeleport(true); }}
        onResetPosition={() => teleportTo(8n, 8n)}
        onClearCache={clearCache}
        onResetCamera={() => setResetCameraToken((value) => value + 1)}
        onToggleDebug={() => setDebug((value) => !value)}
        onToggleCollisionDebug={() => setDebugCollision((value) => !value)}
        onRunTests={runSelfTests}
        onResetExploration={resetExploration}
      />}
      {showInventory && <InventoryMenu inventory={inventory} onClose={() => setShowInventory(false)} />}
      {showCharacters && <CharacterMenu
        profile={profile}
        onPurchase={(id) => commitProfileTransaction(purchaseCharacter(profile, id), `Đã mở khóa ${CHARACTER_CATALOG[id].name}`)}
        onSelect={(id) => commitProfileTransaction(selectCharacter(profile, id), `Đã chọn ${CHARACTER_CATALOG[id].name}`)}
        onUpgrade={(id) => commitProfileTransaction(upgradeCharacter(profile, id), `${CHARACTER_CATALOG[id].name} đã tăng cấp`)}
        onUpgradeMax={(id) => commitProfileTransaction(upgradeCharacterMax(profile, id), `${CHARACTER_CATALOG[id].name} đã được nâng tối đa trong giới hạn`)}
        onAscend={(id) => commitProfileTransaction(ascendCharacter(profile, id), `${CHARACTER_CATALOG[id].name} đã đột phá`)}
        onClose={() => setShowCharacters(false)}
      />}
      {showMap && <WorldMap seed={seed} chunks={chunks} visitedChunks={exploration.visitedChunks} playerX={stats.worldTileX} playerY={stats.worldTileY} playerOffsetX={stats.offsetX} playerOffsetY={stats.offsetY} playerYaw={stats.playerYaw} enemies={mapEnemies} target={trackedTarget} waypoint={mapWaypoint} allowMapTeleport={settings.gameplay.allowMapTeleport} onSelectTarget={(enemy) => { setTrackedTarget(enemy); setShowMap(false); }} onSetWaypoint={setMapWaypoint} onTeleportWaypoint={(waypoint) => { teleportTo(BigInt(waypoint.worldX), BigInt(waypoint.worldY)); setShowMap(false); }} onClose={() => setShowMap(false)} />}
      {showSeed && <SeedEditor seed={seed} onApply={applySeed} onClose={() => setShowSeed(false)} />}
      {showTeleport && <TeleportDialog onClose={() => setShowTeleport(false)} onApply={teleportTo} />}
      {!worldRevealed && <LoadingOverlay ready={initialWorldReady} text={initialWorldReady ? "Sẵn sàng" : `Đang chuẩn bị thế giới... ${Math.min(chunks.length, 9)}/9`} />}
      {error && <pre className="errorOverlay">{error}</pre>}
    </main>
  );
}
