import { CHUNK_SIZE, MAX_CHUNK_STATES, MAX_RANDOM_CACHE, P } from "../constants";
import { Matrix, deriveAxisMatrices, flatten, matMul, matPow, normalizeMatrix, rowsToColumns } from "./matrix";
import { LruCache } from "./lruCache";
import { MIX_CONSTANTS, foldBigInt, mix61, unitFromBigInt } from "./coordinateHash";
import { recurrenceRound } from "./recurrence";
import { lerp, smoothstep } from "./noise";

function floorDiv(a: bigint, b: bigint): bigint {
  let q = a / b;
  const r = a % b;
  if (r !== 0n && (r > 0n) !== (b > 0n)) q -= 1n;
  return q;
}

export class HybridMatrixWorld {
  readonly seed: Matrix;
  readonly n: number;
  readonly a: Matrix;
  readonly b: Matrix;
  readonly aInv: Matrix;
  readonly bInv: Matrix;
  readonly chunkCache = new LruCache<string, Matrix>(MAX_CHUNK_STATES);
  readonly randomCache = new LruCache<string, bigint>(MAX_RANDOM_CACHE);

  constructor(seedInput: readonly (readonly bigint[])[]) {
    this.seed = normalizeMatrix(seedInput);
    this.n = this.seed.length;
    const axes = deriveAxisMatrices(this.seed);
    this.a = axes.a;
    this.b = axes.b;
    this.aInv = axes.aInv;
    this.bInv = axes.bInv;
    this.rememberChunk(0n, 0n, this.seed);
  }

  chunkKey(cx: bigint, cy: bigint): string {
    return `${cx},${cy}`;
  }

  rememberChunk(cx: bigint, cy: bigint, state: Matrix): Matrix {
    this.chunkCache.set(this.chunkKey(cx, cy), state);
    return state;
  }

  chunkState(cx: bigint, cy: bigint): Matrix {
    const key = this.chunkKey(cx, cy);
    const cached = this.chunkCache.get(key);
    if (cached) return cached;

    const west = this.chunkCache.get(this.chunkKey(cx - 1n, cy));
    if (west) return this.rememberChunk(cx, cy, matMul(this.a, west));
    const east = this.chunkCache.get(this.chunkKey(cx + 1n, cy));
    if (east) return this.rememberChunk(cx, cy, matMul(this.aInv, east));
    const north = this.chunkCache.get(this.chunkKey(cx, cy - 1n));
    if (north) return this.rememberChunk(cx, cy, matMul(north, this.b));
    const south = this.chunkCache.get(this.chunkKey(cx, cy + 1n));
    if (south) return this.rememberChunk(cx, cy, matMul(south, this.bInv));

    return this.rememberChunk(cx, cy, matMul(matMul(matPow(this.a, cx), this.seed), matPow(this.b, cy)));
  }

  randomAt(x: bigint, y: bigint, salt: bigint): bigint {
    const cacheKey = `${x},${y},${salt}`;
    const cached = this.randomCache.get(cacheKey);
    if (cached !== undefined) return cached;
    const cx = floorDiv(x, BigInt(CHUNK_SIZE));
    const cy = floorDiv(y, BigInt(CHUNK_SIZE));
    const state = this.chunkState(cx, cy);
    const hx = foldBigInt(x, salt ^ MIX_CONSTANTS.C2);
    const hy = foldBigInt(y, salt ^ MIX_CONSTANTS.C3);
    const value = this.mixedValue(flatten(state), hx, hy, salt % P);
    this.randomCache.set(cacheKey, value);
    return value;
  }

  unitRandom(x: bigint, y: bigint, salt: bigint): number {
    return unitFromBigInt(this.randomAt(x, y, salt));
  }

  valueNoise(x: bigint, y: bigint, scale: bigint, salt: bigint): number {
    const gx = floorDiv(x, scale);
    const gy = floorDiv(y, scale);
    const rx = x - gx * scale;
    const ry = y - gy * scale;
    const tx = smoothstep(Number(rx) / Number(scale));
    const ty = smoothstep(Number(ry) / Number(scale));
    const n00 = this.unitRandom(gx, gy, salt);
    const n10 = this.unitRandom(gx + 1n, gy, salt);
    const n01 = this.unitRandom(gx, gy + 1n, salt);
    const n11 = this.unitRandom(gx + 1n, gy + 1n, salt);
    return lerp(lerp(n00, n10, tx), lerp(n01, n11, tx), ty);
  }

  clearCaches(): void {
    this.chunkCache.clear();
    this.randomCache.clear();
    this.rememberChunk(0n, 0n, this.seed);
  }

  private mixedValue(stateFlat: readonly bigint[], hx: bigint, hy: bigint, salt: bigint): bigint {
    const state: Matrix = [];
    for (let i = 0; i < this.n; i += 1) state.push(stateFlat.slice(i * this.n, (i + 1) * this.n));
    let columns = rowsToColumns(state).map((column, i) =>
      column.map((value, j) => (value + BigInt(i + 1) * hx + BigInt(j + 1) * hy + BigInt((i + 1) * (j + 1)) * salt + hx * hy) % P),
    );
    let accumulator = mix61(hx + 3n * hy + 5n * salt + MIX_CONSTANTS.C1);
    const rounds = 2 * this.n + 8;
    for (let r = 0; r < rounds; r += 1) {
      columns = recurrenceRound(columns);
      accumulator = mix61(accumulator + columns[columns.length - 1][r % this.n] + BigInt(r + 1) * MIX_CONSTANTS.C4);
    }
    for (const column of columns) {
      for (const value of column) accumulator = mix61(accumulator + value + MIX_CONSTANTS.C2);
    }
    return mix61(accumulator + hx * MIX_CONSTANTS.C3 + hy * MIX_CONSTANTS.C4 + salt);
  }
}

export { floorDiv };
