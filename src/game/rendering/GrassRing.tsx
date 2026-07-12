import { useFrame } from "@react-three/fiber";
import { useEffect, useMemo, useRef, type MutableRefObject } from "react";
import * as THREE from "three";
import { CHUNK_SIZE } from "../constants";
import type { GameState } from "../GameCanvas";
import { BIOME_IDS, type ChunkPayload } from "../types";

function grassAreaSize(density: number): number {
  if (density <= 0.28) return 22;
  if (density <= 0.45) return 28;
  return 36;
}

function grassDetail(density: number): number {
  if (density <= 0.28) return 52;
  if (density <= 0.45) return 76;
  if (density <= 0.7) return 112;
  if (density <= 0.9) return 152;
  return 192;
}

const vertexShader = /* glsl */ `
  uniform float uTime;
  uniform float uAreaSize;
  uniform vec2 uPlayer;
  uniform sampler2D uTerrainData;
  uniform vec2 uDataOrigin;
  uniform vec2 uDataSize;
  attribute vec2 bladeCenter;
  attribute vec2 bladeShape;
  attribute float bladeRandom;
  varying vec3 vColor;
  varying float vVisible;

  float hash21(vec2 p) {
    return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453123);
  }

  void main() {
    vec2 center = bladeCenter;
    center -= uPlayer;
    center = mod(center + uAreaSize * 0.5, uAreaSize) - uAreaSize * 0.5;
    center += uPlayer;

    vec2 uv = (center - uDataOrigin + vec2(0.5)) / uDataSize;
    bool inside = all(greaterThanEqual(uv, vec2(0.0))) && all(lessThanEqual(uv, vec2(1.0)));
    vec4 terrain = texture2D(uTerrainData, clamp(uv, 0.0, 1.0));
    float biomeFade = smoothstep(0.08, 0.88, terrain.a);
    float slopeFade = smoothstep(0.68, 0.88, terrain.g);
    float grassMask = biomeFade * slopeFade * float(inside);
    float distanceFade = 1.0 - smoothstep(uAreaSize * 0.3, uAreaSize * 0.5, distance(center, uPlayer));
    float scale = grassMask * distanceFade;

    float angle = atan(cameraPosition.x - center.x, cameraPosition.z - center.y);
    vec2 facing = vec2(cos(angle), -sin(angle));
    float width = mix(0.045, 0.09, bladeRandom);
    float height = mix(0.28, 0.62, hash21(center + bladeRandom));
    float tip = bladeShape.y;
    float wind = sin(uTime * 1.7 + center.x * 0.31 + center.y * 0.23 + bladeRandom * 6.283) * 0.09 * tip;

    vec3 worldPosition = vec3(center.x, terrain.r, center.y);
    worldPosition.xz += facing * bladeShape.x * width * scale;
    worldPosition.y += tip * height * scale;
    worldPosition.x += wind * scale;
    worldPosition.z += wind * 0.45 * scale;

    float shade = mix(0.68, 1.08, tip) * mix(0.86, 1.08, bladeRandom);
    vColor = mix(vec3(0.12, 0.34, 0.10), vec3(0.36, 0.72, 0.22), tip) * shade;
    vVisible = scale;
    gl_Position = projectionMatrix * viewMatrix * vec4(worldPosition, 1.0);
  }
`;

const fragmentShader = /* glsl */ `
  varying vec3 vColor;
  varying float vVisible;
  void main() {
    if (vVisible < 0.01) discard;
    gl_FragColor = vec4(vColor, 1.0);
  }
`;

function createGrassGeometry(details: number, areaSize: number): THREE.BufferGeometry {
  const count = details * details;
  const positions = new Float32Array(count * 9);
  const centers = new Float32Array(count * 6);
  const shapes = new Float32Array(count * 6);
  const randoms = new Float32Array(count * 3);
  const spacing = areaSize / details;
  let blade = 0;
  for (let z = 0; z < details; z += 1) {
    for (let x = 0; x < details; x += 1) {
      const random = ((x * 73856093 ^ z * 19349663) >>> 0) / 0xffffffff;
      const randomB = ((x * 83492791 ^ z * 297657976) >>> 0) / 0xffffffff;
      const centerX = (x + 0.5 + (random - 0.5) * 0.72) * spacing - areaSize * 0.5;
      const centerZ = (z + 0.5 + (randomB - 0.5) * 0.72) * spacing - areaSize * 0.5;
      const vertex = blade * 3;
      for (let n = 0; n < 3; n += 1) {
        centers[(vertex + n) * 2] = centerX;
        centers[(vertex + n) * 2 + 1] = centerZ;
        randoms[vertex + n] = random;
      }
      shapes[vertex * 2] = -1;
      shapes[vertex * 2 + 1] = 0;
      shapes[(vertex + 1) * 2] = 0;
      shapes[(vertex + 1) * 2 + 1] = 1;
      shapes[(vertex + 2) * 2] = 1;
      shapes[(vertex + 2) * 2 + 1] = 0;
      blade += 1;
    }
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.BufferAttribute(positions, 3));
  geometry.setAttribute("bladeCenter", new THREE.BufferAttribute(centers, 2));
  geometry.setAttribute("bladeShape", new THREE.BufferAttribute(shapes, 2));
  geometry.setAttribute("bladeRandom", new THREE.BufferAttribute(randoms, 1));
  geometry.boundingSphere = new THREE.Sphere(new THREE.Vector3(), 1_000_000);
  return geometry;
}

function buildTerrainTexture(chunks: ChunkPayload[], originCx: bigint, originCy: bigint) {
  if (chunks.length === 0) {
    const texture = new THREE.DataTexture(new Float32Array([0, 1, 0, 0]), 1, 1, THREE.RGBAFormat, THREE.FloatType);
    texture.needsUpdate = true;
    return { texture, origin: new THREE.Vector2(), size: new THREE.Vector2(1, 1) };
  }
  const relative = chunks.map((chunk) => ({ chunk, x: Number(BigInt(chunk.cx) - originCx) * CHUNK_SIZE, z: Number(BigInt(chunk.cy) - originCy) * CHUNK_SIZE }));
  const minX = Math.min(...relative.map((entry) => entry.x));
  const minZ = Math.min(...relative.map((entry) => entry.z));
  const maxX = Math.max(...relative.map((entry) => entry.x + CHUNK_SIZE));
  const maxZ = Math.max(...relative.map((entry) => entry.z + CHUNK_SIZE));
  const width = maxX - minX + 1;
  const height = maxZ - minZ + 1;
  const data = new Float32Array(width * height * 4);

  for (const { chunk, x: baseX, z: baseZ } of relative) {
    for (let z = 0; z <= CHUNK_SIZE; z += 1) {
      for (let x = 0; x <= CHUNK_SIZE; x += 1) {
        const tx = baseX + x - minX;
        const tz = baseZ + z - minZ;
        const target = (tz * width + tx) * 4;
        const heightIndex = z * (CHUNK_SIZE + 1) + x;
        const left = chunk.heights[z * (CHUNK_SIZE + 1) + Math.max(0, x - 1)] ?? 0;
        const right = chunk.heights[z * (CHUNK_SIZE + 1) + Math.min(CHUNK_SIZE, x + 1)] ?? 0;
        const down = chunk.heights[Math.max(0, z - 1) * (CHUNK_SIZE + 1) + x] ?? 0;
        const up = chunk.heights[Math.min(CHUNK_SIZE, z + 1) * (CHUNK_SIZE + 1) + x] ?? 0;
        const normalY = 2 / (Math.hypot(left - right, 2, down - up) || 1);
        const bx = Math.min(CHUNK_SIZE - 1, x);
        const bz = Math.min(CHUNK_SIZE - 1, z);
        const biome = chunk.biomes[bz * CHUNK_SIZE + bx] ?? BIOME_IDS.grass;
        data[target] = chunk.heights[heightIndex] ?? 0;
        data[target + 1] = normalY;
        data[target + 2] = biome / 5;
        data[target + 3] = biome === BIOME_IDS.grass || biome === BIOME_IDS.forest || biome === BIOME_IDS.soil ? 1 : 0;
      }
    }
  }

  const texture = new THREE.DataTexture(data, width, height, THREE.RGBAFormat, THREE.FloatType);
  texture.minFilter = THREE.LinearFilter;
  texture.magFilter = THREE.LinearFilter;
  texture.generateMipmaps = false;
  texture.needsUpdate = true;
  return { texture, origin: new THREE.Vector2(minX, minZ), size: new THREE.Vector2(width, height) };
}

export function GrassRing({ chunks, originCx, originCy, player, density }: { chunks: ChunkPayload[]; originCx: bigint; originCy: bigint; player: MutableRefObject<GameState>; density: number }) {
  const areaSize = grassAreaSize(density);
  const details = grassDetail(density);
  const geometry = useMemo(() => createGrassGeometry(details, areaSize), [areaSize, details]);
  const terrain = useMemo(() => buildTerrainTexture(chunks, originCx, originCy), [chunks, originCx, originCy]);
  const material = useMemo(() => new THREE.ShaderMaterial({
    vertexShader,
    fragmentShader,
    side: THREE.DoubleSide,
    uniforms: {
      uTime: { value: 0 },
      uAreaSize: { value: areaSize },
      uPlayer: { value: new THREE.Vector2() },
      uTerrainData: { value: terrain.texture },
      uDataOrigin: { value: terrain.origin },
      uDataSize: { value: terrain.size },
    },
  }), [areaSize, terrain]);

  useEffect(() => () => geometry.dispose(), [geometry]);
  useEffect(() => () => material.dispose(), [material]);
  useEffect(() => () => terrain.texture.dispose(), [terrain]);
  useFrame(({ clock }) => {
    material.uniforms.uTime.value = clock.elapsedTime;
    material.uniforms.uPlayer.value.set(player.current.localX, player.current.localZ);
  });

  return <mesh geometry={geometry} material={material} frustumCulled={false} renderOrder={1} />;
}
