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
  readonly queue: string[] = [];
  private readonly worker = new Worker(new URL("../workers/chunk.worker.ts", import.meta.url), { type: "module" });
  private requestId = 1;
  private readonly listeners = new Set<Listener>();
  private readonly errorListeners = new Set<ErrorListener>();

  constructor(private seed: string[][]) {
    this.worker.onmessage = (event: MessageEvent<ChunkWorkerResponse>) => {
      const msg = event.data;
      if (msg.type === "error") {
        this.errorListeners.forEach((listener) => listener(`${msg.message}\n${msg.stack ?? ""}`));
        return;
      }
      const key = this.key(BigInt(msg.cx), BigInt(msg.cy));
      this.pending.delete(key);
      this.generated.set(key, msg.payload);
      this.rendered.set(key, msg.payload);
      this.listeners.forEach((listener) => listener(msg.payload));
    };
    this.worker.onerror = (event) => {
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
    this.generated.clear();
    this.rendered.clear();
    this.pending.clear();
    this.queue.length = 0;
  }

  dispose(): void {
    this.worker.terminate();
  }

  key(cx: bigint, cy: bigint): string {
    return `${cx},${cy}`;
  }

  ensureAround(cx: bigint, cy: bigint): void {
    const wanted: [bigint, bigint, number][] = [];
    for (let dy = -ACTIVE_RADIUS; dy <= ACTIVE_RADIUS; dy += 1) {
      for (let dx = -ACTIVE_RADIUS; dx <= ACTIVE_RADIUS; dx += 1) {
        const x = cx + BigInt(dx);
        const y = cy + BigInt(dy);
        wanted.push([x, y, dx * dx + dy * dy]);
      }
    }
    wanted.sort((a, b) => a[2] - b[2]);
    const keep = new Set(wanted.map(([x, y]) => this.key(x, y)));
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
    this.pending.add(key);
    this.queue.push(key);
    this.worker.postMessage({ type: "generateChunk", requestId: this.requestId++, cx: cx.toString(), cy: cy.toString(), seed: this.seed });
  }
}
