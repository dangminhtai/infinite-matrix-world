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

export default function App() {
  const [seed, setSeed] = useState(defaultSeedStrings);
  const [settings, setSettings] = useState(loadSettings);
  const seedKey = JSON.stringify(seed);
  const manager = useMemo(() => {
    const next = new ChunkManager(seed);
    next.setActiveRadius(settings.graphics.renderDistance);
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
    cameraZoom: 23,
    fps: 0,
    health: 100,
    stamina: 100,
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
  const seenDecorKeys = useRef(new Set<string>());

  const performanceStats = useMemo(() => collectPerformanceStats(chunks, stats.fps), [chunks, stats.fps]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      if (showSeed) {
        setShowSeed(false);
        return;
      }
      if (showTeleport) {
        setShowTeleport(false);
        return;
      }
      setShowSettings((current) => !current);
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [showSeed, showTeleport]);

  useEffect(() => {
    if (!import.meta.env.DEV) return;
    void import("./game/world/selfTest").then(({ selfTest }) => {
      setTests(selfTest());
    }).catch((err: unknown) => {
      const e = err instanceof Error ? err : new Error(String(err));
      setError(e.stack ?? e.message);
      setStatus("error");
    });
  }, []);

  useEffect(() => {
    const offChunk = manager.onChunk(() => {
      setChunks(manager.rendered.entries().map(([, chunk]) => chunk));
      setPending(manager.pending.size);
      setStatus("ready");
    });
    const offError = manager.onError((message) => {
      setError(message);
      setStatus("error");
    });
    manager.ensureAround(0n, 0n);
    setStatus("loading");
    setPending(manager.pending.size);
    return () => {
      offChunk();
      offError();
      manager.dispose();
    };
  }, [manager]);

  const ensureChunk = useCallback((cx: bigint, cy: bigint) => {
    const key = `${cx},${cy}`;
    if (key === lastChunk.current) return;
    lastChunk.current = key;
    manager.ensureAround(cx, cy);
    setPending(manager.pending.size);
    setStatus(manager.pending.size ? "loading" : "ready");
  }, [manager]);

  const applySeed = useCallback((nextSeed: string[][]) => {
    const nextKey = JSON.stringify(nextSeed);
    setSeed(nextSeed);
    const saved = localStorage.getItem(`ihmw.exploration.${nextKey}`);
    setExploration(saved ? JSON.parse(saved) as ExplorationStats : emptyExploration(nextKey));
    seenDecorKeys.current.clear();
    lastTile.current = null;
    manager.setSeed(nextSeed);
    setChunks([]);
    lastChunk.current = "0,0";
    manager.ensureAround(0n, 0n);
    setPending(manager.pending.size);
    setStatus("loading");
  }, [manager]);

  const clearCache = useCallback(() => {
    manager.clear();
    const cx = BigInt(stats.chunkX);
    const cy = BigInt(stats.chunkY);
    manager.ensureAround(cx, cy);
    setChunks([]);
    setPending(manager.pending.size);
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
    setPending(manager.pending.size);
  }, [manager, seedKey]);

  const applySettings = useCallback((next: GameSettings) => {
    saveSettings(next);
    setSettings(next);
    manager.setActiveRadius(next.graphics.renderDistance);
    const cx = BigInt(stats.chunkX);
    const cy = BigInt(stats.chunkY);
    manager.ensureAround(cx, cy);
    setChunks(manager.rendered.entries().map(([, chunk]) => chunk));
    setPending(manager.pending.size);
  }, [manager, stats.chunkX, stats.chunkY]);

  const runSelfTests = useCallback(() => {
    void import("./game/world/selfTest").then(({ selfTest }) => setTests(selfTest())).catch((err: unknown) => {
      const e = err instanceof Error ? err : new Error(String(err));
      setError(e.stack ?? e.message);
    });
  }, []);

  const resetExploration = useCallback(() => {
    const next = emptyExploration(seedKey);
    seenDecorKeys.current.clear();
    lastTile.current = null;
    localStorage.setItem(`ihmw.exploration.${seedKey}`, JSON.stringify(next));
    setExploration(next);
  }, [seedKey]);

  const onStats = useCallback((state: { tileX: bigint; tileY: bigint; localX: number; localZ: number; cameraYaw: number; cameraZoom: number; fps: number; health: number; stamina: number }) => {
    const worldTileX = state.tileX + BigInt(Math.floor(state.localX));
    const worldTileY = state.tileY + BigInt(Math.floor(state.localZ));
    const offsetX = state.localX - Math.floor(state.localX);
    const offsetY = state.localZ - Math.floor(state.localZ);
    const chunkX = worldTileX >= 0n ? worldTileX / 16n : (worldTileX - 15n) / 16n;
    const chunkY = worldTileY >= 0n ? worldTileY / 16n : (worldTileY - 15n) / 16n;
    const now = performance.now();
    if (now - lastStatsAt.current >= 250) {
      lastStatsAt.current = now;
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
        cameraZoom: state.cameraZoom,
        fps: state.fps,
        health: state.health,
        stamina: state.stamina,
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
  }, [chunks, seedKey]);

  return (
    <main>
      <GameCanvas chunks={chunks} debug={debug} debugCollision={debugCollision} onChunkChange={ensureChunk} onStats={onStats} teleport={teleport} resetCameraToken={resetCameraToken} settings={settings} paused={showSettings || showSeed || showTeleport} />
      <HUD
        health={stats.health}
        stamina={stats.stamina}
        showQuestTracker={settings.gameplay.showQuestTracker}
        onSettings={() => setShowSettings(true)}
      />
      {settings.gameplay.showMinimap && <Minimap chunks={chunks} worldTileX={stats.worldTileX} worldTileY={stats.worldTileY} offsetX={stats.offsetX} offsetY={stats.offsetY} cameraYaw={stats.cameraYaw} />}
      {showSettings && <SettingsMenu
        settings={settings}
        seed={seed}
        performance={performanceStats}
        developer={{ worldX: stats.worldX, worldY: stats.worldY, chunkX: stats.chunkX, chunkY: stats.chunkY, originX: stats.originX, originY: stats.originY, loadedChunks: chunks.length, pendingChunks: pending, cacheSize: manager.generated.size, status, tests }}
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
      {showSeed && <SeedEditor seed={seed} onApply={applySeed} onClose={() => setShowSeed(false)} />}
      {showTeleport && <TeleportDialog onClose={() => setShowTeleport(false)} onApply={teleportTo} />}
      {status === "loading" && chunks.length === 0 && <LoadingOverlay text="Đang sinh chunk bằng Web Worker..." />}
      {error && <pre className="errorOverlay">{error}</pre>}
    </main>
  );
}
