import type { ChunkPayload } from "../types";

export type GenerateChunkRequest = {
  type: "generateChunk";
  requestId: number;
  cx: string;
  cy: string;
  seed: string[][];
};

export type ClearWorkerCacheRequest = {
  type: "clear";
  requestId: number;
};

export type ChunkWorkerRequest = GenerateChunkRequest | ClearWorkerCacheRequest;

export type GenerateChunkResponse = {
  type: "chunkGenerated";
  requestId: number;
  cx: string;
  cy: string;
  payload: ChunkPayload;
};

export type WorkerErrorResponse = {
  type: "error";
  requestId: number;
  message: string;
  stack?: string;
};

export type ChunkWorkerResponse = GenerateChunkResponse | WorkerErrorResponse;
