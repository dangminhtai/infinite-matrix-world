import type { ChunkPayload } from "../types";

export type GenerateChunkRequest = {
  type: "generateChunk";
  requestId: number;
  generationId: number;
  cx: string;
  cy: string;
  seed: string[][];
};

export type ClearWorkerCacheRequest = {
  type: "clear";
  requestId: number;
  generationId: number;
};

export type ChunkWorkerRequest = GenerateChunkRequest | ClearWorkerCacheRequest;

export type GenerateChunkResponse = {
  type: "chunkGenerated";
  requestId: number;
  generationId: number;
  cx: string;
  cy: string;
  payload: ChunkPayload;
};

export type ClearWorkerCacheResponse = {
  type: "cleared";
  requestId: number;
  generationId: number;
};

export type WorkerErrorResponse = {
  type: "error";
  requestId: number;
  generationId: number;
  message: string;
  stack?: string;
};

export type ChunkWorkerResponse = GenerateChunkResponse | ClearWorkerCacheResponse | WorkerErrorResponse;
