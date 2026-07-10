import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { DEFAULT_SEED } from "./game/constants";
import { GameCanvas } from "./game/GameCanvas";
import { ChunkManager } from "./game/world/chunkManager";
import { selfTest } from "./game/world/selfTest";
import type { ChunkPayload, WorkerStatus } from "./game/types";
import { HUD } from "./ui/HUD";
import { SeedEditor } from "./ui/SeedEditor";
import { TeleportDialog } from "./ui/TeleportDialog";
import { LoadingOverlay } from "./ui/LoadingOverlay";
import { Minimap } from "./ui/Minimap";
import { collectPerformanceStats, PerformancePanel } from "./ui/PerformancePanel";
import { emptyExploration, ExplorationPanel, type ExplorationStats } from "./ui/ExplorationPanel";

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

export default function App() {
  const [seed, setSeed] = useState(defaultSeedStrings);
  const seedKey = JSON.stringify(seed);
  const manager = useMemo(() => new ChunkManager(seed), []);
  const [chunks, setChunks] = useState<ChunkPayload[]>([]);
  const [status, setStatus] = useState<WorkerStatus>("idle");
  const [error, setError] = useState("");
  const [debug, setDebug] = useState(false);
  const [tests, setTests] = useState<string[]>([]);
  const [showSeed, setShowSeed] = useState(false);
  const [showTeleport, setShowTeleport] = useState(false);
  const [pending, setPending] = useState(0);
  const [stats, setStats] = useState({ worldX: "0", worldY: "0", chunkX: "0", chunkY: "0", cameraYaw: 0, cameraZoom: 23, fps: 0 });
  const [showPerformance, setShowPerformance] = useState(false);
  const [showExploration, setShowExploration] = useState(false);
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
  const lastTile = useRef<{ x: bigint; y: bigint } | null>(null);
  const lastStatsAt = useRef(0);
  const seenDecorKeys = useRef(new Set<string>());

  const performanceStats = useMemo(() => collectPerformanceStats(chunks, stats.fps), [chunks, stats.fps]);

  useEffect(() => {
    try {
      setTests(selfTest());
    } catch (err) {
      const e = err instanceof Error ? err : new Error(String(err));
      setError(e.stack ?? e.message);
      setStatus("error");
    }
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

  const onStats = useCallback((state: { tileX: bigint; tileY: bigint; localX: number; localZ: number; cameraYaw: number; cameraZoom: number; fps: number }) => {
    const worldX = state.tileX + BigInt(Math.floor(state.localX));
    const worldY = state.tileY + BigInt(Math.floor(state.localZ));
    const chunkX = worldX >= 0n ? worldX / 16n : (worldX - 15n) / 16n;
    const chunkY = worldY >= 0n ? worldY / 16n : (worldY - 15n) / 16n;
    const now = performance.now();
    const previous = lastTile.current;
    lastTile.current = { x: worldX, y: worldY };
    if (now - lastStatsAt.current < 250) return;
    lastStatsAt.current = now;
    setStats({ worldX: worldX.toString(), worldY: worldY.toString(), chunkX: chunkX.toString(), chunkY: chunkY.toString(), cameraYaw: state.cameraYaw, cameraZoom: state.cameraZoom, fps: state.fps });
    setExploration((current) => {
      const visitedChunks = new Set(current.visitedChunks);
      visitedChunks.add(`${chunkX},${chunkY}`);
      const biomes = new Set(current.visitedBiomes);
      const currentChunk = chunks.find((chunk) => chunk.cx === chunkX.toString() && chunk.cy === chunkY.toString());
      currentChunk?.biomes.forEach((biome) => biomes.add(biome));
      let seenTrees = current.seenTrees;
      let seenRocks = current.seenRocks;
      let seenFlowers = current.seenFlowers;
      for (const chunk of chunks) {
        for (const tree of chunk.trees) if (!seenDecorKeys.current.has(tree.id)) { seenDecorKeys.current.add(tree.id); seenTrees += 1; }
        for (const rock of chunk.rocks) if (!seenDecorKeys.current.has(rock.id)) { seenDecorKeys.current.add(rock.id); seenRocks += 1; }
        for (const flower of chunk.flowers) if (!seenDecorKeys.current.has(flower.id)) { seenDecorKeys.current.add(flower.id); seenFlowers += 1; }
      }
      const distanceAdd = previous ? Math.hypot(Number(worldX - previous.x), Number(worldY - previous.y)) : 0;
      const farthest = Math.hypot(Number(worldX), Number(worldY));
      const next: ExplorationStats = {
        ...current,
        seedKey,
        visitedChunks: [...visitedChunks],
        visitedBiomes: [...biomes],
        distanceTiles: current.distanceTiles + distanceAdd,
        farthestDistance: Math.max(current.farthestDistance, farthest),
        maxAbsX: (BigInt(current.maxAbsX) > (worldX < 0n ? -worldX : worldX) ? BigInt(current.maxAbsX) : (worldX < 0n ? -worldX : worldX)).toString(),
        maxAbsY: (BigInt(current.maxAbsY) > (worldY < 0n ? -worldY : worldY) ? BigInt(current.maxAbsY) : (worldY < 0n ? -worldY : worldY)).toString(),
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
      <GameCanvas chunks={chunks} debug={debug} onChunkChange={ensureChunk} onStats={onStats} teleport={teleport} />
      <HUD
        worldX={stats.worldX}
        worldY={stats.worldY}
        chunkX={stats.chunkX}
        chunkY={stats.chunkY}
        chunks={chunks}
        pending={pending}
        status={status}
        seed={seed}
        debug={debug}
        tests={tests}
        onSeed={() => setShowSeed(true)}
        onTeleport={() => setShowTeleport(true)}
        onClear={clearCache}
        onDebug={() => setDebug((v) => !v)}
        onPerformance={() => setShowPerformance((v) => !v)}
        onExploration={() => setShowExploration((v) => !v)}
      />
      <Minimap chunks={chunks} worldX={stats.worldX} worldY={stats.worldY} cameraYaw={stats.cameraYaw} />
      {showPerformance && <PerformancePanel stats={performanceStats} />}
      {showExploration && <ExplorationPanel stats={exploration} />}
      {showSeed && <SeedEditor seed={seed} onApply={applySeed} onClose={() => setShowSeed(false)} />}
      {showTeleport && <TeleportDialog onClose={() => setShowTeleport(false)} onApply={(x, y) => {
        setTeleport({ x, y, token: Date.now() });
        setExploration((current) => {
          const next = { ...current, teleports: current.teleports + 1 };
          localStorage.setItem(`ihmw.exploration.${seedKey}`, JSON.stringify(next));
          return next;
        });
        manager.ensureAround(x >= 0n ? x / 16n : (x - 15n) / 16n, y >= 0n ? y / 16n : (y - 15n) / 16n);
        setStatus("loading");
        setPending(manager.pending.size);
      }} />}
      {status === "loading" && chunks.length === 0 && <LoadingOverlay text="Đang sinh chunk bằng Web Worker..." />}
      {error && <pre className="errorOverlay">{error}</pre>}
    </main>
  );
}
