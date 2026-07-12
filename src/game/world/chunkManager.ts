import { ACTIVE_RADIUS, MAX_GENERATED_CHUNKS, MAX_RENDERED_CHUNKS } from "../constants";
import type { ChunkPayload } from "../types";
import { LruCache } from "./lruCache";
import type { ChunkWorkerResponse } from "../workers/workerMessages";
import { markStartup } from "../core/StartupProfiler";

type Listener = (payload: ChunkPayload) => void;
type ErrorListener = (message: string) => void;
type ChunkJob = { key: string; cx: bigint; cy: bigint; priority: number; attempts: number };

const MAX_IN_FLIGHT_REQUESTS = 2;
const MAX_JOB_ATTEMPTS = 3;

export class ChunkManager {
  readonly generated = new LruCache<string, ChunkPayload>(MAX_GENERATED_CHUNKS);
  readonly rendered = new LruCache<string, ChunkPayload>(MAX_RENDERED_CHUNKS);
  readonly pending = new Set<string>();
  private wantedKeys = new Set<string>();
  private readonly wantedJobs = new Map<string, ChunkJob>();
  private readonly worker = new Worker(new URL("../workers/chunk.worker.ts", import.meta.url), { type: "module" });
  private requestId = 1;
  private generationId = 0;
  private activeRadius = ACTIVE_RADIUS;
  private readonly requestKeys = new Map<number, string>();
  private readonly listeners = new Set<Listener>();
  private readonly errorListeners = new Set<ErrorListener>();

  constructor(private seed: string[][]) {
    markStartup("worker-created");
    this.worker.onmessage = (event: MessageEvent<ChunkWorkerResponse>) => {
      const msg = event.data;
      if (msg.generationId !== this.generationId) return;
      if (msg.type === "cleared") {
        this.pumpQueue();
        return;
      }
      const pendingKey = this.requestKeys.get(msg.requestId);
      this.requestKeys.delete(msg.requestId);
      if (pendingKey) this.pending.delete(pendingKey);
      if (msg.type === "error") {
        const failedJob = pendingKey ? this.wantedJobs.get(pendingKey) : undefined;
        if (failedJob && failedJob.attempts >= MAX_JOB_ATTEMPTS) this.wantedJobs.delete(failedJob.key);
        this.errorListeners.forEach((listener) => listener(`${msg.message}\n${msg.stack ?? ""}`));
        this.pumpQueue();
        return;
      }
      const key = this.key(BigInt(msg.cx), BigInt(msg.cy));
      markStartup("first-chunk-ready");
      if (msg.cx === "0" && msg.cy === "0") markStartup("center-chunk-ready");
      this.wantedJobs.delete(key);
      this.generated.set(key, msg.payload);
      if (this.wantedKeys.has(key)) {
        this.rendered.set(key, msg.payload);
      }
      this.pumpQueue();
      this.listeners.forEach((listener) => listener(msg.payload));
    };
    this.worker.onerror = (event) => {
      this.pending.clear();
      this.requestKeys.clear();
      this.wantedJobs.clear();
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
    this.wantedJobs.clear();
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

  get pendingCount(): number {
    return this.wantedJobs.size;
  }

  get inFlightCount(): number {
    return this.pending.size;
  }

  get queuedCount(): number {
    return Math.max(0, this.wantedJobs.size - this.pending.size);
  }

  setActiveRadius(radius: number): void {
    this.activeRadius = Math.max(1, Math.min(4, Math.round(radius)));
  }

  ensureAround(cx: bigint, cy: bigint, direction: { x: number; y: number } = { x: 0, y: 0 }): void {
    const wanted: [bigint, bigint, number][] = [];
    const directionLength = Math.hypot(direction.x, direction.y);
    const directionX = directionLength > 1e-5 ? direction.x / directionLength : 0;
    const directionY = directionLength > 1e-5 ? direction.y / directionLength : 0;
    for (let dy = -this.activeRadius; dy <= this.activeRadius; dy += 1) {
      for (let dx = -this.activeRadius; dx <= this.activeRadius; dx += 1) {
        const x = cx + BigInt(dx);
        const y = cy + BigInt(dy);
        const forwardBias = dx * directionX + dy * directionY;
        wanted.push([x, y, dx * dx + dy * dy - forwardBias * 0.75]);
      }
    }
    wanted.sort((a, b) => a[2] - b[2]);
    const keep = new Set(wanted.map(([x, y]) => this.key(x, y)));
    this.wantedKeys = keep;
    for (const [x, y, priority] of wanted) {
      const key = this.key(x, y);
      const cached = this.generated.get(key);
      if (cached) {
        this.rendered.set(key, cached);
        this.wantedJobs.delete(key);
      } else {
        const existing = this.wantedJobs.get(key);
        this.wantedJobs.set(key, { key, cx: x, cy: y, priority, attempts: existing?.attempts ?? 0 });
      }
    }
    for (const key of [...this.wantedJobs.keys()]) {
      if (!keep.has(key) && !this.pending.has(key)) this.wantedJobs.delete(key);
    }
    for (const key of this.rendered.keys()) {
      if (!keep.has(key)) this.rendered.delete(key);
    }
    this.pumpQueue();
  }

  private pumpQueue(): void {
    while (this.requestKeys.size < MAX_IN_FLIGHT_REQUESTS) {
      let next: ChunkJob | undefined;
      for (const job of this.wantedJobs.values()) {
        if (this.pending.has(job.key) || this.generated.has(job.key)) continue;
        if (!next || job.priority < next.priority) next = job;
      }
      if (!next) return;
      next.attempts += 1;
      const requestId = this.requestId++;
      this.pending.add(next.key);
      this.requestKeys.set(requestId, next.key);
      this.worker.postMessage({ type: "generateChunk", requestId, generationId: this.generationId, cx: next.cx.toString(), cy: next.cy.toString(), seed: this.seed });
    }
  }

  private beginGeneration(): void {
    this.generationId += 1;
    this.pending.clear();
    this.requestKeys.clear();
    this.wantedJobs.clear();
  }
}
