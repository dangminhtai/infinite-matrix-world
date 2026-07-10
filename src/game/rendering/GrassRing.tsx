import { useFrame } from "@react-three/fiber";
import { useMemo, useRef, type MutableRefObject } from "react";
import * as THREE from "three";
import { CHUNK_SIZE } from "../constants";
import type { ChunkPayload } from "../types";
import type { GameState } from "../GameCanvas";

const MAX_GRASS_BLADES = 1400;
const GRASS_RADIUS = 13;

function floorDiv(a: bigint, b: bigint): bigint {
  let q = a / b;
  const r = a % b;
  if (r !== 0n && (r > 0n) !== (b > 0n)) q -= 1n;
  return q;
}

function random01(x: bigint, y: bigint, salt: bigint): number {
  let v = (x * 0x9e3779b97f4a7c15n) ^ (y * 0xbf58476d1ce4e5b9n) ^ salt;
  v ^= v >> 30n;
  v *= 0xbf58476d1ce4e5b9n;
  v ^= v >> 27n;
  v *= 0x94d049bb133111ebn;
  v ^= v >> 31n;
  return Number(v & ((1n << 53n) - 1n)) / 2 ** 53;
}

function sampleGrassCell(chunks: Map<string, ChunkPayload>, wx: bigint, wy: bigint): { height: number; density: number } | null {
  const cx = floorDiv(wx, BigInt(CHUNK_SIZE));
  const cy = floorDiv(wy, BigInt(CHUNK_SIZE));
  const chunk = chunks.get(`${cx},${cy}`);
  if (!chunk) return null;
  const lx = Number(wx - cx * BigInt(CHUNK_SIZE));
  const ly = Number(wy - cy * BigInt(CHUNK_SIZE));
  const cell = ly * CHUNK_SIZE + lx;
  const biome = chunk.biomes[cell] ?? 0;
  if (biome === 0 || biome === 1 || biome === 4) return null;
  return {
    height: chunk.heights[ly * (CHUNK_SIZE + 1) + lx] ?? 0,
    density: biome === 2 ? 0.72 : biome === 3 ? 0.34 : 0.56,
  };
}

export function GrassRing({
  chunks,
  originCx,
  originCy,
  player,
}: {
  chunks: ChunkPayload[];
  originCx: bigint;
  originCy: bigint;
  player: MutableRefObject<GameState>;
}) {
  const meshRef = useRef<THREE.InstancedMesh>(null);
  const dummy = useMemo(() => new THREE.Object3D(), []);
  const chunkMap = useMemo(() => new Map(chunks.map((chunk) => [`${chunk.cx},${chunk.cy}`, chunk])), [chunks]);
  const lastKey = useRef("");
  const updateBudget = useRef(0);

  useFrame((_, delta) => {
    updateBudget.current -= delta;
    const state = player.current;
    const worldX = state.tileX + BigInt(Math.floor(state.localX));
    const worldY = state.tileY + BigInt(Math.floor(state.localZ));
    const key = `${worldX},${worldY},${originCx},${originCy},${chunks.length}`;
    if (key === lastKey.current || updateBudget.current > 0) return;
    lastKey.current = key;
    updateBudget.current = 0.18;

    let count = 0;
    for (let dz = -GRASS_RADIUS; dz <= GRASS_RADIUS; dz += 1) {
      for (let dx = -GRASS_RADIUS; dx <= GRASS_RADIUS; dx += 1) {
        if (count >= MAX_GRASS_BLADES) break;
        const distance = Math.hypot(dx, dz);
        if (distance > GRASS_RADIUS) continue;
        const wx = worldX + BigInt(dx);
        const wy = worldY + BigInt(dz);
        const sample = sampleGrassCell(chunkMap, wx, wy);
        if (!sample) continue;
        if (random01(wx, wy, 0x67a55n) > sample.density) continue;

        const jitterX = random01(wx, wy, 0x123n) - 0.5;
        const jitterZ = random01(wx, wy, 0x456n) - 0.5;
        const localX = Number(wx - originCx * BigInt(CHUNK_SIZE)) + jitterX;
        const localZ = Number(wy - originCy * BigInt(CHUNK_SIZE)) + jitterZ;
        const fade = Math.max(0.15, 1 - distance / GRASS_RADIUS);
        const height = 0.25 + random01(wx, wy, 0x789n) * 0.28;
        dummy.position.set(localX, sample.height + height * 0.5, localZ);
        dummy.rotation.set(0, random01(wx, wy, 0xabcn) * Math.PI * 2, 0);
        dummy.scale.set(0.11 * fade, height, 0.11 * fade);
        dummy.updateMatrix();
        meshRef.current?.setMatrixAt(count, dummy.matrix);
        count += 1;
      }
    }

    if (meshRef.current) {
      meshRef.current.count = count;
      meshRef.current.instanceMatrix.needsUpdate = true;
    }
  });

  return (
    <instancedMesh ref={meshRef} args={[undefined, undefined, MAX_GRASS_BLADES]} frustumCulled={false}>
      <coneGeometry args={[0.5, 1, 3]} />
      <meshStandardMaterial color="#7fcf4f" roughness={0.95} side={THREE.DoubleSide} />
    </instancedMesh>
  );
}
