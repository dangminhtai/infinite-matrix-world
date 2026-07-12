import type { CharacterDefinition } from "./characterCatalog";

export const MIN_CHARACTER_LEVEL = 1;
export const MAX_CHARACTER_LEVEL = 100;
export const ASCENSION_CAPS = [20, 30, 40, 50, 60, 70, 80, 90] as const;

const ASCENSION_SLIME_COSTS: Record<(typeof ASCENSION_CAPS)[number], number> = {
  20: 3,
  30: 5,
  40: 8,
  50: 12,
  60: 18,
  70: 25,
  80: 35,
  90: 50,
};

export type CharacterStats = { maxHP: number; atk: number; def: number };

export function clampCharacterLevel(level: number): number {
  if (!Number.isFinite(level)) return MIN_CHARACTER_LEVEL;
  return Math.max(MIN_CHARACTER_LEVEL, Math.min(MAX_CHARACTER_LEVEL, Math.floor(level)));
}

export function moraCostForNextLevel(level: number): number {
  const currentLevel = clampCharacterLevel(level);
  if (currentLevel >= MAX_CHARACTER_LEVEL) return 0;
  return Math.ceil((500 + 80 * currentLevel ** 2) / 100) * 100;
}

export function totalMoraCost(fromLevel = MIN_CHARACTER_LEVEL, toLevel = MAX_CHARACTER_LEVEL): number {
  const start = clampCharacterLevel(fromLevel);
  const end = clampCharacterLevel(toLevel);
  let total = 0;
  for (let level = start; level < end; level += 1) total += moraCostForNextLevel(level);
  return total;
}

export function ascensionCostAt(level: number): number | null {
  const cap = clampCharacterLevel(level) as (typeof ASCENSION_CAPS)[number];
  return ASCENSION_CAPS.includes(cap) ? ASCENSION_SLIME_COSTS[cap] : null;
}

export function isAscendedAt(ascendedCaps: readonly number[], level: number): boolean {
  return ascendedCaps.includes(clampCharacterLevel(level));
}

export function needsAscension(level: number, ascendedCaps: readonly number[]): boolean {
  return ascensionCostAt(level) !== null && !isAscendedAt(ascendedCaps, level);
}

export function calculateCharacterStats(definition: CharacterDefinition, level: number): CharacterStats {
  const levelOffset = clampCharacterLevel(level) - 1;
  return {
    maxHP: Math.round(definition.baseHP * (1 + 0.045 * levelOffset)),
    atk: Math.round(definition.baseATK * (1 + 0.032 * levelOffset)),
    def: Math.round(definition.baseDEF * (1 + 0.038 * levelOffset)),
  };
}
