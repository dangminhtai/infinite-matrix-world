import { P } from "../constants";

export function mod(value: bigint): bigint {
  const out = value % P;
  return out >= 0n ? out : out + P;
}

export function modNonZero(value: bigint): bigint {
  const out = mod(value);
  return out === 0n ? 1n : out;
}

export function modPow(base: bigint, exponent: bigint): bigint {
  if (exponent < 0n) throw new Error("modPow exponent must be non-negative");
  let b = mod(base);
  let e = exponent;
  let result = 1n;
  while (e > 0n) {
    if ((e & 1n) === 1n) result = mod(result * b);
    b = mod(b * b);
    e >>= 1n;
  }
  return result;
}

export function modInv(value: bigint): bigint {
  const normalized = mod(value);
  if (normalized === 0n) throw new Error("Cannot invert zero modulo P");
  return modPow(normalized, P - 2n);
}

export function toUnit(value: bigint): number {
  return Number(value) / Number(P);
}
