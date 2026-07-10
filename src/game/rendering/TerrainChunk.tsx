import { useMemo } from "react";
import * as THREE from "three";
import type { ChunkPayload, Biome } from "../types";

const colors: Record<Biome, THREE.Color> = {
  water: new THREE.Color("#4aa3df"),
  mountain: new THREE.Color("#8c8f95"),
  forest: new THREE.Color("#2f8f4e"),
  soil: new THREE.Color("#9b7653"),
  sand: new THREE.Color("#d9c27c"),
  grass: new THREE.Color("#71bf54"),
};

export function TerrainChunk({ chunk, originCx, originCy }: { chunk: ChunkPayload; originCx: bigint; originCy: bigint }) {
  const geometry = useMemo(() => {
    const size = chunk.size;
    const vertices: number[] = [];
    const colorValues: number[] = [];
    const indices: number[] = [];
    const cx = BigInt(chunk.cx);
    const cy = BigInt(chunk.cy);
    const baseX = Number(cx - originCx) * size;
    const baseZ = Number(cy - originCy) * size;
    for (let z = 0; z <= size; z += 1) {
      for (let x = 0; x <= size; x += 1) {
        const idx = z * (size + 1) + x;
        vertices.push(baseX + x, chunk.heights[idx], baseZ + z);
        const biome = chunk.biomes[Math.min(z, size - 1) * size + Math.min(x, size - 1)] ?? "grass";
        const c = colors[biome];
        colorValues.push(c.r, c.g, c.b);
      }
    }
    for (let z = 0; z < size; z += 1) {
      for (let x = 0; x < size; x += 1) {
        const a = z * (size + 1) + x;
        const b = a + 1;
        const c = a + size + 1;
        const d = c + 1;
        indices.push(a, c, b, b, c, d);
      }
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute("position", new THREE.Float32BufferAttribute(vertices, 3));
    geo.setAttribute("color", new THREE.Float32BufferAttribute(colorValues, 3));
    geo.setIndex(indices);
    geo.computeVertexNormals();
    return geo;
  }, [chunk, originCx, originCy]);

  return (
    <mesh geometry={geometry} receiveShadow castShadow>
      <meshStandardMaterial vertexColors roughness={0.9} />
    </mesh>
  );
}
