import { CHARACTER_CATALOG, isCharacterId, type CharacterId } from "./characterCatalog";
import { ASCENSION_CAPS, ascensionCostAt, clampCharacterLevel, MAX_CHARACTER_LEVEL, moraCostForNextLevel, needsAscension } from "./characterProgression";
import { loadWorldSave, saveWorld } from "../core/SaveManager";

export type CharacterProgress = {
  level: number;
  ascendedCaps: number[];
};

export type PlayerProfile = {
  version: 1;
  wallet: { primogem: number; mora: number; slimeCondensate: number };
  characters: Partial<Record<CharacterId, CharacterProgress>>;
  selectedCharacterId: CharacterId;
  importedWorldWallets: string[];
};

export type ProfileTransaction =
  | { ok: true; profile: PlayerProfile }
  | { ok: false; profile: PlayerProfile; reason: "already-owned" | "character-locked" | "insufficient-primogem" | "insufficient-mora" | "insufficient-slime" | "ascension-required" | "not-at-ascension" | "max-level" };

const PROFILE_KEY = "genshin-fake.profile.v1";

export function createDefaultProfile(): PlayerProfile {
  return {
    version: 1,
    wallet: { primogem: 0, mora: 0, slimeCondensate: 0 },
    characters: { aether: { level: 1, ascendedCaps: [] } },
    selectedCharacterId: "aether",
    importedWorldWallets: [],
  };
}

function safeAmount(value: unknown): number {
  return typeof value === "number" && Number.isFinite(value) ? Math.max(0, Math.floor(value)) : 0;
}

export function sanitizeProfile(source: unknown): PlayerProfile {
  const fallback = createDefaultProfile();
  if (!source || typeof source !== "object") return fallback;
  const value = source as Partial<PlayerProfile>;
  const wallet = value.wallet && typeof value.wallet === "object" ? value.wallet : fallback.wallet;
  const characters: PlayerProfile["characters"] = { aether: { level: 1, ascendedCaps: [] } };
  if (value.characters && typeof value.characters === "object") {
    for (const [id, progress] of Object.entries(value.characters)) {
      if (!isCharacterId(id) || !progress || typeof progress !== "object") continue;
      const candidate = progress as Partial<CharacterProgress>;
      const level = clampCharacterLevel(candidate.level ?? 1);
      const ascendedCaps = Array.isArray(candidate.ascendedCaps)
        ? [...new Set(candidate.ascendedCaps.filter((cap) => ASCENSION_CAPS.includes(cap as (typeof ASCENSION_CAPS)[number]) && cap <= level))].sort((a, b) => a - b)
        : [];
      characters[id] = { level, ascendedCaps };
    }
  }
  const selectedCharacterId = isCharacterId(value.selectedCharacterId) && characters[value.selectedCharacterId]
    ? value.selectedCharacterId
    : "aether";
  return {
    version: 1,
    wallet: {
      primogem: safeAmount(wallet.primogem),
      mora: safeAmount(wallet.mora),
      slimeCondensate: safeAmount(wallet.slimeCondensate),
    },
    characters,
    selectedCharacterId,
    importedWorldWallets: Array.isArray(value.importedWorldWallets)
      ? [...new Set(value.importedWorldWallets.filter((key): key is string => typeof key === "string"))]
      : [],
  };
}

function cloneProfile(profile: PlayerProfile): PlayerProfile {
  return sanitizeProfile(structuredClone(profile));
}

export function loadPlayerProfile(): PlayerProfile {
  const raw = localStorage.getItem(PROFILE_KEY);
  if (!raw) return createDefaultProfile();
  try {
    return sanitizeProfile(JSON.parse(raw));
  } catch {
    return createDefaultProfile();
  }
}

export function savePlayerProfile(profile: PlayerProfile): void {
  localStorage.setItem(PROFILE_KEY, JSON.stringify(sanitizeProfile(profile)));
}

export function loadAndMigratePlayerProfile(seedKey: string): PlayerProfile {
  const profile = loadPlayerProfile();
  if (profile.importedWorldWallets.includes(seedKey)) return profile;
  const world = loadWorldSave(seedKey);
  const migrated = migrateWorldWallet(profile, seedKey, world.inventory);
  world.inventory = migrated.inventory;
  savePlayerProfile(migrated.profile);
  saveWorld(seedKey, world);
  return migrated.profile;
}

export function migrateWorldWallet(profile: PlayerProfile, seedKey: string, source: Record<string, number>): { profile: PlayerProfile; inventory: Record<string, number> } {
  const next = cloneProfile(profile);
  const inventory = { ...source };
  if (next.importedWorldWallets.includes(seedKey)) return { profile: next, inventory };
  next.wallet.primogem += safeAmount(inventory.primogem);
  next.wallet.mora += safeAmount(inventory.mora);
  next.wallet.slimeCondensate += safeAmount(inventory.slime_condensate);
  delete inventory.primogem;
  delete inventory.mora;
  delete inventory.slime_condensate;
  next.importedWorldWallets.push(seedKey);
  return { profile: next, inventory };
}

export function addProfileReward(profile: PlayerProfile, itemId: "primogem" | "mora" | "slime_condensate", amount: number): PlayerProfile {
  const next = cloneProfile(profile);
  const safe = Math.max(0, Math.floor(amount));
  if (itemId === "primogem") next.wallet.primogem += safe;
  else if (itemId === "mora") next.wallet.mora += safe;
  else next.wallet.slimeCondensate += safe;
  return next;
}

export function profileInventory(profile: PlayerProfile): Record<string, number> {
  return {
    primogem: profile.wallet.primogem,
    mora: profile.wallet.mora,
    slime_condensate: profile.wallet.slimeCondensate,
  };
}

export function purchaseCharacter(profile: PlayerProfile, characterId: CharacterId): ProfileTransaction {
  const next = cloneProfile(profile);
  if (next.characters[characterId]) return { ok: false, profile: next, reason: "already-owned" };
  const cost = CHARACTER_CATALOG[characterId].purchaseCost;
  if (next.wallet.primogem < cost) return { ok: false, profile: next, reason: "insufficient-primogem" };
  next.wallet.primogem -= cost;
  next.characters[characterId] = { level: 1, ascendedCaps: [] };
  return { ok: true, profile: next };
}

export function selectCharacter(profile: PlayerProfile, characterId: CharacterId): ProfileTransaction {
  const next = cloneProfile(profile);
  if (!next.characters[characterId]) return { ok: false, profile: next, reason: "character-locked" };
  next.selectedCharacterId = characterId;
  return { ok: true, profile: next };
}

export function ascendCharacter(profile: PlayerProfile, characterId: CharacterId): ProfileTransaction {
  const next = cloneProfile(profile);
  const progress = next.characters[characterId];
  if (!progress) return { ok: false, profile: next, reason: "character-locked" };
  const cost = ascensionCostAt(progress.level);
  if (cost === null || !needsAscension(progress.level, progress.ascendedCaps)) return { ok: false, profile: next, reason: "not-at-ascension" };
  if (next.wallet.slimeCondensate < cost) return { ok: false, profile: next, reason: "insufficient-slime" };
  next.wallet.slimeCondensate -= cost;
  progress.ascendedCaps.push(progress.level);
  return { ok: true, profile: next };
}

export function upgradeCharacter(profile: PlayerProfile, characterId: CharacterId): ProfileTransaction {
  const next = cloneProfile(profile);
  const progress = next.characters[characterId];
  if (!progress) return { ok: false, profile: next, reason: "character-locked" };
  if (progress.level >= MAX_CHARACTER_LEVEL) return { ok: false, profile: next, reason: "max-level" };
  if (needsAscension(progress.level, progress.ascendedCaps)) return { ok: false, profile: next, reason: "ascension-required" };
  const cost = moraCostForNextLevel(progress.level);
  if (next.wallet.mora < cost) return { ok: false, profile: next, reason: "insufficient-mora" };
  next.wallet.mora -= cost;
  progress.level += 1;
  return { ok: true, profile: next };
}

export function upgradeCharacterMax(profile: PlayerProfile, characterId: CharacterId): ProfileTransaction {
  let next = cloneProfile(profile);
  const initial = next.characters[characterId];
  if (!initial) return { ok: false, profile: next, reason: "character-locked" };
  if (initial.level >= MAX_CHARACTER_LEVEL) return { ok: false, profile: next, reason: "max-level" };
  if (needsAscension(initial.level, initial.ascendedCaps)) return { ok: false, profile: next, reason: "ascension-required" };
  let upgraded = false;
  while (true) {
    const progress = next.characters[characterId];
    if (!progress || progress.level >= MAX_CHARACTER_LEVEL || needsAscension(progress.level, progress.ascendedCaps)) break;
    const cost = moraCostForNextLevel(progress.level);
    if (next.wallet.mora < cost) break;
    next.wallet.mora -= cost;
    progress.level += 1;
    upgraded = true;
  }
  return upgraded ? { ok: true, profile: next } : { ok: false, profile: next, reason: "insufficient-mora" };
}
