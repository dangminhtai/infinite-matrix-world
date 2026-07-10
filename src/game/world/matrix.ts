import { P } from "../constants";
import { mod, modInv, modNonZero } from "./fieldMath";

export type Matrix = bigint[][];

export function normalizeMatrix(input: readonly (readonly bigint[])[]): Matrix {
  const n = input.length;
  if (n < 2 || input.some((row) => row.length !== n)) {
    throw new Error("Seed must be a square n x n matrix with n >= 2");
  }
  return input.map((row) => row.map(mod));
}

export function matrixFromStrings(input: string[][]): Matrix {
  return normalizeMatrix(input.map((row) => row.map((value) => BigInt(value.trim()))));
}

export function matrixToStrings(matrix: Matrix): string[][] {
  return matrix.map((row) => row.map((value) => value.toString()));
}

export function identity(n: number): Matrix {
  return Array.from({ length: n }, (_, i) =>
    Array.from({ length: n }, (_, j) => (i === j ? 1n : 0n)),
  );
}

export function matMul(a: Matrix, b: Matrix): Matrix {
  const rows = a.length;
  const inner = b.length;
  const cols = b[0]?.length ?? 0;
  if ((a[0]?.length ?? 0) !== inner) throw new Error("Incompatible matrix dimensions");
  const out = Array.from({ length: rows }, () => Array<bigint>(cols).fill(0n));
  for (let i = 0; i < rows; i += 1) {
    for (let k = 0; k < inner; k += 1) {
      const aik = a[i][k];
      if (aik === 0n) continue;
      for (let j = 0; j < cols; j += 1) out[i][j] = mod(out[i][j] + aik * b[k][j]);
    }
  }
  return out;
}

export function matInv(matrix: Matrix): Matrix {
  const n = matrix.length;
  const aug = matrix.map((row, i) => [
    ...row.map(mod),
    ...Array.from({ length: n }, (_, j) => (i === j ? 1n : 0n)),
  ]);

  for (let col = 0; col < n; col += 1) {
    let pivot = -1;
    for (let row = col; row < n; row += 1) {
      if (mod(aug[row][col]) !== 0n) {
        pivot = row;
        break;
      }
    }
    if (pivot < 0) throw new Error("Matrix is singular modulo P");
    [aug[col], aug[pivot]] = [aug[pivot], aug[col]];
    const invPivot = modInv(aug[col][col]);
    aug[col] = aug[col].map((value) => mod(value * invPivot));
    for (let row = 0; row < n; row += 1) {
      if (row === col) continue;
      const factor = mod(aug[row][col]);
      if (factor === 0n) continue;
      aug[row] = aug[row].map((value, j) => mod(value - factor * aug[col][j]));
    }
  }
  return aug.map((row) => row.slice(n));
}

export function matPow(baseInput: Matrix, exponentInput: bigint): Matrix {
  let base = baseInput;
  let exponent = exponentInput;
  if (exponent < 0n) {
    base = matInv(base);
    exponent = -exponent;
  }
  let result = identity(base.length);
  while (exponent > 0n) {
    if ((exponent & 1n) === 1n) result = matMul(result, base);
    base = matMul(base, base);
    exponent >>= 1n;
  }
  return result;
}

function elementary(n: number, row: number, col: number, amount: bigint): Matrix {
  const data = identity(n);
  data[row][col] = mod(amount);
  return data;
}

export function deriveAxisMatrices(seed: Matrix): { a: Matrix; b: Matrix; aInv: Matrix; bInv: Matrix } {
  const n = seed.length;
  let a = identity(n);
  let b = identity(n);
  for (let i = 0; i < n; i += 1) {
    a[i][i] = modNonZero(seed[i][i] + 2n * BigInt(i) + 3n);
    b[i][i] = modNonZero(seed[i][i] + 3n * BigInt(i) + 5n);
  }
  for (let i = 0; i < n; i += 1) {
    for (let j = 0; j < n; j += 1) {
      if (i === j) continue;
      const amountA = seed[i][j] + BigInt(i + 1) * 0x9e3779b1n + BigInt(j + 1) * 0x85ebca77n;
      const amountB = seed[j][i] + BigInt(i + 1) * 0xc2b2ae3dn + BigInt(j + 1) * 0x27d4eb2fn;
      a = matMul(elementary(n, i, j, amountA), a);
      b = matMul(b, elementary(n, i, j, amountB));
    }
  }
  return { a, b, aInv: matInv(a), bInv: matInv(b) };
}

export function flatten(matrix: Matrix): bigint[] {
  return matrix.flat();
}

export function rowsToColumns(matrix: Matrix): bigint[][] {
  return matrix[0].map((_, col) => matrix.map((row) => row[col]));
}

export function matrixHashInput(matrix: Matrix): string {
  return flatten(matrix).map((value) => value.toString(16)).join(":") + `:${P.toString(16)}`;
}
