import { generateChunk } from "../world/chunkGenerator";
import { HybridMatrixWorld } from "../world/hybridWorld";
import { matrixFromStrings } from "../world/matrix";
import type { ChunkWorkerRequest, ChunkWorkerResponse } from "./workerMessages";

let world: HybridMatrixWorld | null = null;
let seedKey = "";

function transferChunk(response: ChunkWorkerResponse): void {
  if (response.type !== "chunkGenerated") {
    self.postMessage(response);
    return;
  }
  const payload = response.payload;
  self.postMessage(response, [
    payload.heights.buffer,
    payload.biomes.buffer,
    payload.walkable.buffer,
    payload.terrainPositions.buffer,
    payload.terrainNormals.buffer,
    payload.terrainColors.buffer,
    payload.terrainIndices.buffer,
  ]);
}

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
      self.postMessage({ type: "cleared", requestId: request.requestId, generationId: request.generationId } satisfies ChunkWorkerResponse);
      return;
    }
    const activeWorld = getWorld(request.seed);
    const payload = generateChunk(activeWorld, BigInt(request.cx), BigInt(request.cy));
    const response = { type: "chunkGenerated", requestId: request.requestId, generationId: request.generationId, cx: request.cx, cy: request.cy, payload } satisfies ChunkWorkerResponse;
    transferChunk(response);
  } catch (error) {
    const err = error instanceof Error ? error : new Error(String(error));
    self.postMessage({ type: "error", requestId: request.requestId, generationId: request.generationId, message: err.message, stack: err.stack } satisfies ChunkWorkerResponse);
  }
};
