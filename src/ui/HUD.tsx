import type { ChunkPayload, WorkerStatus } from "../game/types";

export function HUD({
  worldX,
  worldY,
  chunkX,
  chunkY,
  chunks,
  pending,
  status,
  seed,
  debug,
  tests,
  onSeed,
  onTeleport,
  onClear,
  onDebug,
  onResetCamera,
  onPerformance,
  onExploration,
}: {
  worldX: string;
  worldY: string;
  chunkX: string;
  chunkY: string;
  chunks: ChunkPayload[];
  pending: number;
  status: WorkerStatus;
  seed: string[][];
  debug: boolean;
  tests: string[];
  onSeed: () => void;
  onTeleport: () => void;
  onClear: () => void;
  onDebug: () => void;
  onResetCamera: () => void;
  onPerformance: () => void;
  onExploration: () => void;
}) {
  const current = chunks[0];
  return (
    <div className="hud">
      <div className="hudStats">
        <span>World {worldX}, {worldY}</span>
        <span>Chunk {chunkX}, {chunkY}</span>
        <span>Render {chunks.length}</span>
        <span>Queue {pending}</span>
        <span>Worker {status}</span>
        {debug && <span>Hash {current?.hash ?? "n/a"}</span>}
      </div>
      <div className="hudSeed">Seed {seed.map((row) => `[${row.join(", ")}]`).join(" ")}</div>
      {debug && <div className="hudTests">Tests: {tests.join(", ")}</div>}
      <div className="hudButtons">
        <button onClick={onSeed}>Seed</button>
        <button onClick={onTeleport}>Teleport</button>
        <button onClick={onClear}>Clear cache</button>
        <button onClick={onResetCamera}>Reset camera</button>
        <button onClick={onDebug}>{debug ? "Hide debug" : "Debug"}</button>
        <button onClick={onPerformance}>Performance</button>
        <button onClick={onExploration}>Journey</button>
      </div>
    </div>
  );
}
