import { generateChunk } from "../world/chunkGenerator";
import { HybridMatrixWorld } from "../world/hybridWorld";
import { matrixFromStrings, matrixToStrings } from "../world/matrix";
import type { ChunkWorkerRequest, ChunkWorkerResponse } from "./workerMessages";

let world: HybridMatrixWorld | null = null;
let seedKey = "";

function getWorld(seed: string[][]): HybridMatrixWorld {
  const key = JSON.stringify(seed);
  if (!world || key !== seedKey) {
    world = new HybridMatrixWorld(matrixFromStrings(seed));
    seedKey = key;
  }
  return world;
}

self.onmessage = (event: MessageEvent<ChunkWorkerRequest>) => {
  const request = event.data;
  try {
    if (request.type === "clear") {
      world?.clearCaches();
      self.postMessage({ type: "chunkGenerated", requestId: request.requestId, cx: "0", cy: "0", payload: generateChunk(getWorld(matrixToStrings(world?.seed ?? [[1n, 3n], [2n, 4n]])), 0n, 0n) } satisfies ChunkWorkerResponse);
      return;
    }
    const activeWorld = getWorld(request.seed);
    const payload = generateChunk(activeWorld, BigInt(request.cx), BigInt(request.cy));
    self.postMessage({ type: "chunkGenerated", requestId: request.requestId, cx: request.cx, cy: request.cy, payload } satisfies ChunkWorkerResponse);
  } catch (error) {
    const err = error instanceof Error ? error : new Error(String(error));
    self.postMessage({ type: "error", requestId: request.requestId, message: err.message, stack: err.stack } satisfies ChunkWorkerResponse);
  }
};
