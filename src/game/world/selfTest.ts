import { CHUNK_SIZE, DEFAULT_SEED, MAX_CHUNK_STATES, MAX_RANDOM_CACHE, P, TERRAIN_VISUAL_SUBDIVISIONS } from "../constants";
import { applyTransform, invertTransform } from "./recurrence";
import { HybridMatrixWorld, floorDiv } from "./hybridWorld";
import { matMul, matPow } from "./matrix";
import { generateChunk } from "./chunkGenerator";
import { QualityManager } from "../core/QualityManager";
import { generateMapTile } from "../map/mapTile";
import { calculateMapMinScale, MAP_ZOOM_MAX_SCALE, zoomLevelToScale } from "../map/mapZoom";
import { sampleTerrainSurface } from "../player/terrainSurface";
import { migrateInventory } from "../core/SaveManager";
import { CHARACTER_CATALOG } from "../characters/characterCatalog";
import { ASCENSION_CAPS, ascensionCostAt, calculateCharacterStats, moraCostForNextLevel, totalMoraCost } from "../characters/characterProgression";
import { ascendCharacter, createDefaultProfile, migrateWorldWallet, purchaseCharacter, sanitizeProfile, upgradeCharacter, upgradeCharacterMax } from "../characters/ProfileManager";
import { decodeHex256, decodeHex64, discoverAtWorldTile, discoverChunk, discoverChunkRadius, encodeHex256, encodeHex64, floorDivBigInt, floorModBigInt, hasBit, isChunkDiscovered, isWorldTileDiscovered, migrateVisitedChunks, parsePairKey, setBit } from "../exploration/mapExploration";

function assert(condition: unknown, message: string): void {
  if (!condition) throw new Error(`selfTest failed: ${message}`);
}

function sameMatrix(a: bigint[][], b: bigint[][]): boolean {
  return a.length === b.length && a.every((row, i) => row.length === b[i].length && row.every((value, j) => value === b[i][j]));
}

export function selfTest(): string[] {
  const passed: string[] = [];
  const vOld = [1n, 2n];
  const vNow = [3n, 4n];
  const vNext = applyTransform(vNow, vOld);
  assert(vNext[0] === P - 2n && vNext[1] === 14n, "recurrence forward");
  assert(invertTransform(vNow, vNext).every((v, i) => v === vOld[i]), "recurrence inverse");
  passed.push("Recurrence");

  const world = new HybridMatrixWorld(DEFAULT_SEED);
  assert(sameMatrix(matMul(matMul(world.a, world.seed), world.b), matMul(world.a, matMul(world.seed, world.b))), "path independence");
  passed.push("Path independence");

  const directEast = matMul(matPow(world.a, 1n), world.seed);
  const directWest = matMul(matPow(world.a, -1n), world.seed);
  const directSouth = matMul(world.seed, matPow(world.b, 1n));
  const directNorth = matMul(world.seed, matPow(world.b, -1n));
  assert(sameMatrix(world.chunkState(1n, 0n), directEast), "east neighbor");
  assert(sameMatrix(world.chunkState(-1n, 0n), directWest), "west neighbor");
  assert(sameMatrix(world.chunkState(0n, 1n), directSouth), "south neighbor");
  assert(sameMatrix(world.chunkState(0n, -1n), directNorth), "north neighbor");
  passed.push("Neighbor movement");

  const points = [
    [0n, 0n],
    [-17n, 31n],
    [10n ** 80n + 123n, -(10n ** 75n) + 7n],
  ] as const;
  const before = points.map(([cx, cy]) => generateChunk(world, cx, cy).hash);
  world.clearCaches();
  const after = points.map(([cx, cy]) => generateChunk(world, cx, cy).hash);
  assert(before.every((hash, i) => hash === after[i]), "regeneration");
  passed.push("Regeneration");

  const chunkA = generateChunk(world, 0n, 0n);
  const chunkB = generateChunk(world, 1n, 0n);
  for (let z = 0; z <= CHUNK_SIZE; z += 1) {
    const rightA = chunkA.heights[z * (CHUNK_SIZE + 1) + CHUNK_SIZE];
    const leftB = chunkB.heights[z * (CHUNK_SIZE + 1)];
    assert(Math.abs(rightA - leftB) < 1e-9, "chunk seam");
  }
  const visualRow = TERRAIN_VISUAL_SUBDIVISIONS + 1;
  for (let z = 0; z <= TERRAIN_VISUAL_SUBDIVISIONS; z += 1) {
    const rightA = (z * visualRow + TERRAIN_VISUAL_SUBDIVISIONS) * 3;
    const leftB = z * visualRow * 3;
    for (let axis = 0; axis < 3; axis += 1) {
      assert(Math.abs(chunkA.terrainNormals[rightA + axis] - chunkB.terrainNormals[leftB + axis]) < 1e-6, "chunk normal seam");
    }
  }
  passed.push("Chunk seam");

  const surfaceChunks = new Map([["0,0", chunkA], ["1,0", chunkB]]);
  const seamLeft = sampleTerrainSurface(surfaceChunks, BigInt(CHUNK_SIZE - 1), 4n, 0.999999, 0.5);
  const seamRight = sampleTerrainSurface(surfaceChunks, BigInt(CHUNK_SIZE), 4n, 0.000001, 0.5);
  if (!seamLeft || !seamRight) throw new Error("selfTest failed: terrain surface seam loaded");
  assert(Math.abs(seamLeft.height - seamRight.height) < 1e-4, "terrain surface height seam");
  assert(Math.abs(seamLeft.normalY - seamRight.normalY) < 0.15, "terrain surface normal seam");
  passed.push("Terrain surface");

  const mapTile = generateMapTile(world, 0n, 0n);
  assert(mapTile.biomes.length === chunkA.biomes.length, "map tile size");
  assert(mapTile.biomes.every((biome, index) => biome === chunkA.biomes[index]), "map tile matches world chunk");
  passed.push("Map tile");

  const desktopMinScale = calculateMapMinScale(1920, 1080);
  const fourKMinScale = calculateMapMinScale(3840, 2160);
  assert(fourKMinScale > desktopMinScale, "map zoom tightens for larger viewport");
  assert(zoomLevelToScale(0, desktopMinScale) === desktopMinScale, "map zoom minimum");
  assert(zoomLevelToScale(100, desktopMinScale) === MAP_ZOOM_MAX_SCALE, "map zoom maximum");
  assert(zoomLevelToScale(50, desktopMinScale) > desktopMinScale, "map zoom midpoint");
  passed.push("Map zoom");

  for (let i = 0; i < MAX_CHUNK_STATES + 20; i += 1) world.chunkState(BigInt(i * 1000), BigInt(-i * 977));
  assert(world.chunkCache.size <= MAX_CHUNK_STATES, "cache bound");
  assert(world.randomCache.size <= MAX_RANDOM_CACHE, "random cache bound");
  passed.push("Cache bound");

  let origin = 0n;
  let local = 0;
  for (let i = 0; i < 30; i += 1) {
    local += 9.25;
    if (Math.abs(local) > 64) {
      const shift = BigInt(Math.trunc(local));
      origin += shift;
      local -= Number(shift);
    }
  }
  assert(origin + BigInt(Math.trunc(local)) === 277n, "floating origin accounting");
  assert(floorDiv(-1n, BigInt(CHUNK_SIZE)) === -1n, "negative floor div");
  passed.push("Floating origin");

  const qualityStart = performance.now();
  const degradingQuality = new QualityManager("auto", "high");
  assert(degradingQuality.sample(20, qualityStart + 4_001, 60) === "medium", "auto quality degrades one level");
  const improvingQuality = new QualityManager("auto", "low");
  improvingQuality.sample(60, qualityStart + 4_001, 60);
  improvingQuality.sample(60, qualityStart + 8_002, 60);
  assert(improvingQuality.sample(60, qualityStart + 12_003, 60) === "medium", "auto quality raises after stable windows");
  passed.push("Quality manager");

  const migrated = migrateInventory({ matrix_crystal: 2, matrix_shard: 3, echo_core: 4, mora: 25 });
  assert(migrated.primogem === 2, "inventory primogem migration");
  assert(migrated.mora === 325, "inventory mora migration");
  assert(migrated.slime_condensate === 4, "inventory slime migration");
  assert(!("matrix_crystal" in migrated) && !("matrix_shard" in migrated) && !("echo_core" in migrated), "legacy inventory removed");
  const migratedTwice = migrateInventory(migrated);
  assert(migratedTwice.primogem === 2 && migratedTwice.mora === 325 && migratedTwice.slime_condensate === 4, "inventory migration idempotent");
  passed.push("Inventory migration");

  assert(moraCostForNextLevel(1) === 600, "level 1 mora cost");
  assert(moraCostForNextLevel(99) === 784_600, "level 99 mora cost");
  assert(moraCostForNextLevel(100) === 0, "max level mora cost");
  assert(totalMoraCost(1, 100) === 26_322_000, "total mora cost");
  assert(ASCENSION_CAPS.every((cap) => (ascensionCostAt(cap) ?? 0) > 0), "all ascension caps have costs");
  const levelOneStats = calculateCharacterStats(CHARACTER_CATALOG.aether, 1);
  const levelHundredStats = calculateCharacterStats(CHARACTER_CATALOG.aether, 100);
  assert(levelOneStats.maxHP === 1000 && levelOneStats.atk === 55 && levelOneStats.def === 55, "level 1 character stats");
  assert(levelHundredStats.maxHP > levelOneStats.maxHP && levelHundredStats.atk > levelOneStats.atk && levelHundredStats.def > levelOneStats.def, "level 100 character stats");

  const repairedProfile = sanitizeProfile({ characters: {}, selectedCharacterId: "nahida", wallet: { primogem: -10, mora: 20.9, slimeCondensate: 3 } });
  assert(repairedProfile.characters.aether?.level === 1 && repairedProfile.selectedCharacterId === "aether", "profile always owns Aether");
  assert(repairedProfile.wallet.primogem === 0 && repairedProfile.wallet.mora === 20, "profile wallet sanitization");
  const walletMigration = migrateWorldWallet(createDefaultProfile(), "seed-a", { primogem: 4, mora: 500, slime_condensate: 2, custom_item: 7 });
  assert(walletMigration.profile.wallet.primogem === 4 && walletMigration.profile.wallet.mora === 500 && walletMigration.profile.wallet.slimeCondensate === 2, "world wallet moves to profile");
  assert(walletMigration.inventory.custom_item === 7 && !("mora" in walletMigration.inventory), "world wallet migration preserves other items");
  const walletMigrationTwice = migrateWorldWallet(walletMigration.profile, "seed-a", { primogem: 4, mora: 500, slime_condensate: 2 });
  assert(walletMigrationTwice.profile.wallet.primogem === 4 && walletMigrationTwice.profile.wallet.mora === 500, "world wallet migration idempotent");

  const purchaseProfile = createDefaultProfile();
  purchaseProfile.wallet.primogem = 600;
  const purchasedNahida = purchaseCharacter(purchaseProfile, "nahida");
  assert(purchasedNahida.ok && purchasedNahida.profile.wallet.primogem === 0 && purchasedNahida.profile.characters.nahida?.level === 1, "character purchase transaction");
  const duplicatePurchase = purchaseCharacter(purchasedNahida.profile, "nahida");
  assert(!duplicatePurchase.ok && duplicatePurchase.reason === "already-owned", "duplicate character purchase blocked");

  const ascensionProfile = createDefaultProfile();
  ascensionProfile.characters.aether = { level: 20, ascendedCaps: [] };
  ascensionProfile.wallet.mora = 10_000_000;
  ascensionProfile.wallet.slimeCondensate = 2;
  const blockedUpgrade = upgradeCharacter(ascensionProfile, "aether");
  assert(!blockedUpgrade.ok && blockedUpgrade.reason === "ascension-required", "level 20 upgrade requires ascension");
  const insufficientSlime = ascendCharacter(ascensionProfile, "aether");
  assert(!insufficientSlime.ok && insufficientSlime.reason === "insufficient-slime", "ascension checks slime material");
  ascensionProfile.wallet.slimeCondensate = 3;
  const ascendedAether = ascendCharacter(ascensionProfile, "aether");
  assert(ascendedAether.ok && ascendedAether.profile.wallet.slimeCondensate === 0, "ascension spends exact slime material");
  const levelTwentyOne = upgradeCharacter(ascendedAether.profile, "aether");
  assert(levelTwentyOne.ok && levelTwentyOne.profile.characters.aether?.level === 21, "ascension unlocks next level range");
  const maxWithinCap = upgradeCharacterMax(levelTwentyOne.profile, "aether");
  assert(maxWithinCap.ok && maxWithinCap.profile.characters.aether?.level === 30, "max upgrade stops at next ascension cap");
  const blockedAtNextCap = upgradeCharacterMax(maxWithinCap.profile, "aether");
  assert(!blockedAtNextCap.ok && blockedAtNextCap.reason === "ascension-required", "max upgrade never auto ascends");
  const repeatedAscension = ascendCharacter(ascendedAether.profile, "aether");
  assert(!repeatedAscension.ok && repeatedAscension.reason === "not-at-ascension", "ascension cannot repeat at same cap");
  passed.push("Character progression");

  assert(floorDivBigInt(7n, 8n) === 0n && floorDivBigInt(8n, 8n) === 1n, "positive exploration floor division");
  assert(floorDivBigInt(-1n, 8n) === -1n && floorDivBigInt(-8n, 8n) === -1n && floorDivBigInt(-9n, 8n) === -2n, "negative exploration floor division");
  assert(floorModBigInt(-1n, 8n) === 7n && floorModBigInt(-8n, 8n) === 0n && floorModBigInt(-9n, 8n) === 7n, "non-negative exploration floor modulo");
  assert(parsePairKey("-10,20")?.[0] === -10n && parsePairKey("invalid") === null, "exploration pair key parser");
  const cornerMask = setBit(setBit(setBit(setBit(0n, 0), 7), 56), 63);
  assert([0, 7, 56, 63].every((index) => hasBit(cornerMask, index)), "exploration bitset corners");
  assert(decodeHex64(encodeHex64(cornerMask)) === cornerMask, "hex64 roundtrip");
  const mask256 = (1n << 255n) | 1n;
  assert(decodeHex256(encodeHex256(mask256)) === mask256, "hex256 roundtrip");
  const migratedExploration = migrateVisitedChunks(["0,0", "7,7", "8,8", "-1,-1", "-8,-8", "-9,-9", "invalid"]);
  assert(migratedExploration.discoveredRegions.includes("-1,-1"), "negative sector maps to negative region");
  assert(isChunkDiscovered(migratedExploration, 0n, 0n), "origin exploration migration");
  assert(isChunkDiscovered(migratedExploration, -9n, -9n), "negative exploration migration");
  assert(!isChunkDiscovered(migratedExploration, 1n, 0n), "undiscovered chunk remains hidden");
  const discoveredAgain = discoverChunk(migratedExploration, -9n, -9n);
  assert(discoveredAgain.discoveredSectors["-2,-2"] === migratedExploration.discoveredSectors["-2,-2"], "exploration discovery idempotent");
  const damagedPosition = { ...migratedExploration, lastPosition: { worldX: "broken", worldY: "save" } };
  assert(isChunkDiscovered(discoverChunkRadius(damagedPosition, 0n, 0n), 1n, 1n), "damaged exploration position does not crash reveal");
  assert(JSON.stringify(migrateVisitedChunks(["0,0", "-1,-1"])) === JSON.stringify(migrateVisitedChunks(["0,0", "-1,-1"])), "exploration migration deterministic and idempotent");
  const partialExploration = discoverAtWorldTile({ ...migrateVisitedChunks([]), fineChunks: {}, detailedChunks: [] }, 100n, 100n, 1);
  assert(isWorldTileDiscovered(partialExploration, 100n, 100n) && !isWorldTileDiscovered(partialExploration, 110n, 110n), "fine exploration keeps unknown cells hidden");
  passed.push("Map exploration");

  return passed;
}
