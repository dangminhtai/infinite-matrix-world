export const P = (1n << 61n) - 1n;
export const LIMB_BITS = 61n;
export const LIMB_MASK = (1n << LIMB_BITS) - 1n;
export const CHUNK_SIZE = 16;
export const TERRAIN_VISUAL_SUBDIVISIONS = 32;
export const ACTIVE_RADIUS = 3;
export const MAX_CHUNK_STATES = 256;
export const MAX_GENERATED_CHUNKS = 96;
export const MAX_RENDERED_CHUNKS = 64;
export const MAX_VISITED_CHUNKS = 4096;
export const MAX_SEEN_DECOR_KEYS = 50_000;
export const RANDOM_MASK_53 = (1n << 53n) - 1n;

export const DEFAULT_SEED = [
  [1n, 3n],
  [2n, 4n],
] as const;

export const SALTS = {
  heightA: 0xa11cen,
  heightB: 0xbeef1n,
  heightC: 0xc0ffeen,
  moistureA: 0x12345678n,
  moistureB: 0x87654321n,
  temperature: 0x51a7en,
  tree: 0x7ace11n,
  rock: 0x0c0bb1en,
  flower: 0xf10a11n,
  waterPhase: 0xda7a11n,
} as const;
