import { ACTIVE_RADIUS, MAX_GENERATED_CHUNKS, MAX_RENDERED_CHUNKS } from "../constants";
import type { ChunkPayload } from "../types";
import { LruCache } from "./lruCache";
import type { ChunkWorkerResponse } from "../workers/workerMessages";

type Listener = (payload: ChunkPayload) => void;
type ErrorListener = (message: string) => void;

export class ChunkManager {
  readonly generated = new LruCache<string, ChunkPayload>(MAX_GENERATED_CHUNKS);
  readonly rendered = new LruCache<string, ChunkPayload>(MAX_RENDERED_CHUNKS);
  readonly pending = new Set<string>();
  private wantedKeys = new Set<string>();
  private readonly worker = new Worker(new URL("../workers/chunk.worker.ts", import.meta.url), { type: "module" });
  private requestId = 1;
  private generationId = 0;
  private activeRadius = ACTIVE_RADIUS;
  private readonly requestKeys = new Map<number, string>();
  private readonly listeners = new Set<Listener>();
  private readonly errorListeners = new Set<ErrorListener>();

  constructor(private seed: string[][]) {
    this.worker.onmessage = (event: MessageEvent<ChunkWorkerResponse>) => {
      const msg = event.data;
      if (msg.generationId !== this.generationId) return;
      if (msg.type === "cleared") return;
      const pendingKey = this.requestKeys.get(msg.requestId);
      this.requestKeys.delete(msg.requestId);
      if (pendingKey) this.pending.delete(pendingKey);
      if (msg.type === "error") {
        this.errorListeners.forEach((listener) => listener(`${msg.message}\n${msg.stack ?? ""}`));
        return;
      }
      const key = this.key(BigInt(msg.cx), BigInt(msg.cy));
      this.generated.set(key, msg.payload);
      if (this.wantedKeys.has(key)) {
        this.rendered.set(key, msg.payload);
      }
      this.listeners.forEach((listener) => listener(msg.payload));
    };
    this.worker.onerror = (event) => {
      this.pending.clear();
      this.requestKeys.clear();
      this.errorListeners.forEach((listener) => listener(event.message));
    };
  }

  onChunk(listener: Listener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  onError(listener: ErrorListener): () => void {
    this.errorListeners.add(listener);
    return () => this.errorListeners.delete(listener);
  }

  setSeed(seed: string[][]): void {
    this.seed = seed;
    this.clear();
  }

  clear(): void {
    this.beginGeneration();
    this.generated.clear();
    this.rendered.clear();
    this.wantedKeys.clear();
    this.worker.postMessage({ type: "clear", requestId: this.requestId++, generationId: this.generationId });
  }

  teleportTo(cx: bigint, cy: bigint): void {
    this.beginGeneration();
    this.rendered.clear();
    this.wantedKeys.clear();
    this.ensureAround(cx, cy);
  }

  dispose(): void {
    this.worker.terminate();
  }

  key(cx: bigint, cy: bigint): string {
    return `${cx},${cy}`;
  }

  setActiveRadius(radius: number): void {
    this.activeRadius = Math.max(1, Math.min(4, Math.round(radius)));
  }

  ensureAround(cx: bigint, cy: bigint): void {
    const wanted: [bigint, bigint, number][] = [];
    for (let dy = -this.activeRadius; dy <= this.activeRadius; dy += 1) {
      for (let dx = -this.activeRadius; dx <= this.activeRadius; dx += 1) {
        const x = cx + BigInt(dx);
        const y = cy + BigInt(dy);
        wanted.push([x, y, dx * dx + dy * dy]);
      }
    }
    wanted.sort((a, b) => a[2] - b[2]);
    const keep = new Set(wanted.map(([x, y]) => this.key(x, y)));
    this.wantedKeys = keep;
    for (const [x, y] of wanted) this.request(x, y);
    for (const key of this.rendered.keys()) {
      if (!keep.has(key)) this.rendered.delete(key);
    }
  }

  request(cx: bigint, cy: bigint): void {
    const key = this.key(cx, cy);
    const cached = this.generated.get(key);
    if (cached) {
      this.rendered.set(key, cached);
      return;
    }
    if (this.pending.has(key)) return;
    const requestId = this.requestId++;
    this.pending.add(key);
    this.requestKeys.set(requestId, key);
    this.worker.postMessage({ type: "generateChunk", requestId, generationId: this.generationId, cx: cx.toString(), cy: cy.toString(), seed: this.seed });
  }

  private beginGeneration(): void {
    this.generationId += 1;
    this.pending.clear();
    this.requestKeys.clear();
  }
}
