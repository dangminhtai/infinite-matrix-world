import { useFrame } from "@react-three/fiber";
import { useEffect, useMemo, useRef, type MutableRefObject } from "react";
import * as THREE from "three";
import { CHUNK_SIZE } from "../constants";
import type { GameState } from "../GameCanvas";
import { BIOME_IDS, type ChunkPayload } from "../types";

function grassAreaSize(density: number): number {
  if (density <= 0.2) return 14;
  if (density <= 0.3) return 16;
  if (density <= 0.45) return 22;
  if (density <= 0.7) return 28;
  return 32;
}

function grassDetail(density: number): number {
  if (density <= 0.2) return 18;
  if (density <= 0.3) return 28;
  if (density <= 0.45) return 40;
  if (density <= 0.7) return 56;
  if (density <= 0.9) return 70;
  return 80;
}

const vertexShader = /* glsl */ `
  uniform float uTime;
  attribute vec3 instancePosition;
  attribute float instanceHeight;
  attribute float instanceRandom;
  attribute vec3 instanceNormal;
  varying vec3 vColor;
  varying float vVisible;

  float hash21(vec2 p) {
    return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453123);
  }

  void main() {
    vec3 pos = position;
    
    // Billboard facing camera
    vec3 center = instancePosition;
    float angle = atan(cameraPosition.x - center.x, cameraPosition.z - center.z);
    vec2 facing = vec2(cos(angle), -sin(angle));
    
    float width = mix(0.045, 0.09, instanceRandom);
    float height = mix(0.28, 0.62, hash21(center.xz + instanceRandom));
    float tip = pos.y;
    
    // Wind animation
    float wind = sin(uTime * 1.7 + center.x * 0.31 + center.z * 0.23 + instanceRandom * 6.283) * 0.09 * tip;
    
    vec3 worldPosition = center;
    worldPosition.xz += facing * pos.x * width;
    worldPosition.y = instanceHeight + tip * height;
    worldPosition.x += wind;
    worldPosition.z += wind * 0.45;
    
    // Fade based on slope and biome (already checked in CPU)
    float distanceFade = 1.0 - smoothstep(15.0, 20.0, distance(center, cameraPosition));
    vVisible = distanceFade;
    
    float shade = mix(0.68, 1.08, tip) * mix(0.86, 1.08, instanceRandom);
    vColor = mix(vec3(0.12, 0.34, 0.10), vec3(0.36, 0.72, 0.22), tip) * shade;
    
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

type GrassInstance = {
  position: THREE.Vector3;
  height: number;
  random: number;
  normal: THREE.Vector3;
};

function sampleChunkSurface(
  chunks: Map<string, ChunkPayload>,
  originCx: bigint,
  originCy: bigint,
  localX: number,
  localZ: number
): { height: number; biome: number; normalY: number } | null {
  const wholeX = Math.floor(localX);
  const wholeZ = Math.floor(localZ);
  const cx = originCx + BigInt(Math.floor(wholeX / CHUNK_SIZE));
  const cy = originCy + BigInt(Math.floor(wholeZ / CHUNK_SIZE));
  
  const chunk = chunks.get(`${cx},${cy}`);
  if (!chunk) return null;
  
  const chunkLocalX = wholeX - Number(cx - originCx) * CHUNK_SIZE;
  const chunkLocalZ = wholeZ - Number(cy - originCy) * CHUNK_SIZE;
  
  if (chunkLocalX < 0 || chunkLocalX >= CHUNK_SIZE || chunkLocalZ < 0 || chunkLocalZ >= CHUNK_SIZE) {
    return null;
  }
  
  const heightIndex = chunkLocalZ * (CHUNK_SIZE + 1) + chunkLocalX;
  const biomeIndex = chunkLocalZ * CHUNK_SIZE + chunkLocalX;
  
  const height = chunk.heights[heightIndex] ?? 0;
  const biome = chunk.biomes[biomeIndex] ?? BIOME_IDS.grass;
  
  // Calculate normal
  const left = chunk.heights[chunkLocalZ * (CHUNK_SIZE + 1) + Math.max(0, chunkLocalX - 1)] ?? height;
  const right = chunk.heights[chunkLocalZ * (CHUNK_SIZE + 1) + Math.min(CHUNK_SIZE, chunkLocalX + 1)] ?? height;
  const down = chunk.heights[Math.max(0, chunkLocalZ - 1) * (CHUNK_SIZE + 1) + chunkLocalX] ?? height;
  const up = chunk.heights[Math.min(CHUNK_SIZE, chunkLocalZ + 1) * (CHUNK_SIZE + 1) + chunkLocalX] ?? height;
  
  const normalY = 2 / (Math.hypot(left - right, 2, down - up) || 1);
  
  return { height, biome, normalY };
}

function createGrassInstances(
  chunks: Map<string, ChunkPayload>,
  originCx: bigint,
  originCy: bigint,
  player: GameState,
  areaSize: number,
  count: number
): GrassInstance[] {
  const instances: GrassInstance[] = [];
  const details = Math.sqrt(count);
  const spacing = areaSize / details;
  
  for (let z = 0; z < details; z++) {
    for (let x = 0; x < details; x++) {
      const random = ((x * 73856093 ^ z * 19349663) >>> 0) / 0xffffffff;
      const randomB = ((x * 83492791 ^ z * 297657976) >>> 0) / 0xffffffff;
      
      const localX = (x + 0.5 + (random - 0.5) * 0.72) * spacing - areaSize * 0.5 + player.localX;
      const localZ = (z + 0.5 + (randomB - 0.5) * 0.72) * spacing - areaSize * 0.5 + player.localZ;
      
      const surface = sampleChunkSurface(chunks, originCx, originCy, localX, localZ);
      if (!surface) continue;
      
      // Check if grass can grow here
      const isGrassBiome = surface.biome === BIOME_IDS.grass || 
                          surface.biome === BIOME_IDS.forest || 
                          surface.biome === BIOME_IDS.soil;
      
      const isFlatEnough = surface.normalY >= 0.68;
      const notUnderwater = surface.height > -0.14;
      
      if (!isGrassBiome || !isFlatEnough || !notUnderwater) continue;
      
      instances.push({
        position: new THREE.Vector3(localX, 0, localZ),
        height: surface.height,
        random,
        normal: new THREE.Vector3(0, surface.normalY, 0),
      });
    }
  }
  
  return instances;
}

export function GrassCPUInstanced({ 
  chunks, 
  originCx, 
  originCy, 
  player, 
  density 
}: { 
  chunks: ChunkPayload[]; 
  originCx: bigint; 
  originCy: bigint; 
  player: MutableRefObject<GameState>; 
  density: number;
}) {
  const meshRef = useRef<THREE.InstancedMesh>(null);
  const areaSize = grassAreaSize(density);
  const targetCount = grassDetail(density) ** 2;
  const chunkMap = useMemo(() => new Map(chunks.map((chunk) => [`${chunk.cx},${chunk.cy}`, chunk])), [chunks]);
  
  const lastUpdatePos = useRef({ x: player.current.localX, z: player.current.localZ });
  
  // Base geometry for a single blade
  const bladeGeometry = useMemo(() => {
    const geometry = new THREE.BufferGeometry();
    const positions = new Float32Array([
      -1, 0, 0,
      0, 1, 0,
      1, 0, 0,
    ]);
    geometry.setAttribute("position", new THREE.BufferAttribute(positions, 3));
    return geometry;
  }, []);
  
  const material = useMemo(() => new THREE.ShaderMaterial({
    vertexShader,
    fragmentShader,
    side: THREE.FrontSide,
    precision: "mediump",
    uniforms: {
      uTime: { value: 0 },
    },
  }), []);
  
  // Update grass instances when player moves significantly
  useEffect(() => {
    const mesh = meshRef.current;
    if (!mesh) return;
    
    const dx = player.current.localX - lastUpdatePos.current.x;
    const dz = player.current.localZ - lastUpdatePos.current.z;
    const distanceMoved = Math.hypot(dx, dz);
    
    // Only update if player moved more than 2 units
    if (distanceMoved < 2 && mesh.count > 0) return;
    
    lastUpdatePos.current = { x: player.current.localX, z: player.current.localZ };
    
    const instances = createGrassInstances(chunkMap, originCx, originCy, player.current, areaSize, targetCount);
    
    mesh.count = instances.length;
    
    // Update instance attributes
    if (instances.length > 0) {
      const instancePosition = new THREE.InstancedBufferAttribute(new Float32Array(instances.length * 3), 3);
      const instanceHeight = new THREE.InstancedBufferAttribute(new Float32Array(instances.length), 1);
      const instanceRandom = new THREE.InstancedBufferAttribute(new Float32Array(instances.length), 1);
      const instanceNormal = new THREE.InstancedBufferAttribute(new Float32Array(instances.length * 3), 3);
      
      instances.forEach((inst, i) => {
        instancePosition.setXYZ(i, inst.position.x, inst.position.y, inst.position.z);
        instanceHeight.setX(i, inst.height);
        instanceRandom.setX(i, inst.random);
        instanceNormal.setXYZ(i, inst.normal.x, inst.normal.y, inst.normal.z);
      });
      
      mesh.geometry.setAttribute("instancePosition", instancePosition);
      mesh.geometry.setAttribute("instanceHeight", instanceHeight);
      mesh.geometry.setAttribute("instanceRandom", instanceRandom);
      mesh.geometry.setAttribute("instanceNormal", instanceNormal);
      mesh.geometry.attributes.instancePosition.needsUpdate = true;
      mesh.geometry.attributes.instanceHeight.needsUpdate = true;
      mesh.geometry.attributes.instanceRandom.needsUpdate = true;
      mesh.geometry.attributes.instanceNormal.needsUpdate = true;
    }
  }, [chunks, originCx, originCy, chunkMap, areaSize, targetCount, player]);
  
  useEffect(() => () => bladeGeometry.dispose(), [bladeGeometry]);
  useEffect(() => () => material.dispose(), [material]);
  
  useFrame(({ clock }) => {
    material.uniforms.uTime.value = clock.elapsedTime;
  });
  
  return (
    <instancedMesh 
      ref={meshRef} 
      args={[bladeGeometry, material, targetCount]}
      frustumCulled={true}
      renderOrder={1}
    />
  );
}
