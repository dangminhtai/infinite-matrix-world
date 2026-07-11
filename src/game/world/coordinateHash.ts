import { LIMB_BITS, LIMB_MASK, P, RANDOM_MASK_53 } from "../constants";
import { mod } from "./fieldMath";

const C1 = 0x9e3779b97f4a7c15n % P;
const C2 = 0xbf58476d1ce4e5b9n % P;
const C3 = 0x94d049bb133111ebn % P;
const C4 = 0xd6e8feb86659fd93n % P;

export const MIX_CONSTANTS = { C1, C2, C3, C4 };

export function zigzag(value: bigint): bigint {
  return value >= 0n ? value * 2n : -2n * value - 1n;
}

export function mix61(value: bigint): bigint {
  let v = mod(value);
  v ^= v >> 30n;
  v = mod(v * C2);
  v ^= v >> 27n;
  v = mod(v * C3);
  v ^= v >> 31n;
  return mod(v);
}

export function foldBigInt(valueInput: bigint, salt: bigint): bigint {
  let value = zigzag(valueInput);
  let h = mix61(salt + C1);
  let counter = 1n;
  while (true) {
    const limb = value & LIMB_MASK;
    value >>= LIMB_BITS;
    h = mix61(h + limb + counter * C4);
    counter += 1n;
    if (value === 0n) return h;
  }
}

export function unitFromBigInt(value: bigint): number {
  return Number(value & RANDOM_MASK_53) / 2 ** 53;
}

export function hashBigInts(values: readonly bigint[]): string {
  let h = mix61(0x6d2b79f5n);
  for (const value of values) h = mix61(h + value + C4);
  return h.toString(16).padStart(16, "0");
}
