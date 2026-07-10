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
  const manager = useMemo(() => new ChunkManager(seed), []);
  const [chunks, setChunks] = useState<ChunkPayload[]>([]);
  const [status, setStatus] = useState<WorkerStatus>("idle");
  const [error, setError] = useState("");
  const [debug, setDebug] = useState(false);
  const [tests, setTests] = useState<string[]>([]);
  const [showSeed, setShowSeed] = useState(false);
  const [showTeleport, setShowTeleport] = useState(false);
  const [pending, setPending] = useState(0);
  const [stats, setStats] = useState({ worldX: "0", worldY: "0", chunkX: "0", chunkY: "0" });
  const [teleport, setTeleport] = useState<{ x: bigint; y: bigint; token: number } | null>(null);
  const lastChunk = useRef("0,0");

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
    setSeed(nextSeed);
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

  const onStats = useCallback((state: { tileX: bigint; tileY: bigint; localX: number; localZ: number }) => {
    const worldX = state.tileX + BigInt(Math.floor(state.localX));
    const worldY = state.tileY + BigInt(Math.floor(state.localZ));
    const chunkX = worldX >= 0n ? worldX / 16n : (worldX - 15n) / 16n;
    const chunkY = worldY >= 0n ? worldY / 16n : (worldY - 15n) / 16n;
    setStats({ worldX: worldX.toString(), worldY: worldY.toString(), chunkX: chunkX.toString(), chunkY: chunkY.toString() });
  }, []);

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
      />
      {showSeed && <SeedEditor seed={seed} onApply={applySeed} onClose={() => setShowSeed(false)} />}
      {showTeleport && <TeleportDialog onClose={() => setShowTeleport(false)} onApply={(x, y) => {
        setTeleport({ x, y, token: Date.now() });
        manager.ensureAround(x >= 0n ? x / 16n : (x - 15n) / 16n, y >= 0n ? y / 16n : (y - 15n) / 16n);
        setStatus("loading");
        setPending(manager.pending.size);
      }} />}
      {status === "loading" && chunks.length === 0 && <LoadingOverlay text="Đang sinh chunk bằng Web Worker..." />}
      {error && <pre className="errorOverlay">{error}</pre>}
    </main>
  );
}
