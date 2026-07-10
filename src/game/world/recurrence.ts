import { mod, modNonZero, modInv } from "./fieldMath";

export function applyTransform(v: readonly bigint[], u: readonly bigint[]): bigint[] {
  if (v.length !== u.length || v.length < 2) throw new Error("Vectors must have equal dimension >= 2");
  const n = v.length;
  const t = modNonZero(v[n - 1]);
  let subtract = 0n;
  for (let j = 0; j < n - 1; j += 1) subtract = mod(subtract + v[j] * u[j + 1]);
  const w0 = mod(t * u[0] - subtract);
  const out = [w0];
  for (let i = 1; i < n; i += 1) out.push(mod(t * u[i] - v[i - 1] * w0));
  return out;
}

export function invertTransform(v: readonly bigint[], w: readonly bigint[]): bigint[] {
  if (v.length !== w.length || v.length < 2) throw new Error("Vectors must have equal dimension >= 2");
  const n = v.length;
  const t = modNonZero(v[n - 1]);
  const invT = modInv(t);
  const u = Array<bigint>(n).fill(0n);
  for (let i = 1; i < n; i += 1) u[i] = mod((w[i] + v[i - 1] * w[0]) * invT);
  let sum = 0n;
  for (let j = 0; j < n - 1; j += 1) sum = mod(sum + v[j] * u[j + 1]);
  u[0] = mod((w[0] + sum) * invT);
  return u;
}

export function recurrenceRound(columns: readonly (readonly bigint[])[]): bigint[][] {
  const next = applyTransform(columns[columns.length - 1], columns[0]);
  return [...columns.slice(1).map((col) => [...col]), next];
}
