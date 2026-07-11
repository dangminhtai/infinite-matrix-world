import { useEffect, useMemo } from "react";
import * as THREE from "three";
import type { ChunkPayload } from "../types";
import { TERRAIN_VISUAL_SUBDIVISIONS } from "../constants";
import type { GameSettings } from "../settings";

function indicesForDetail(source: Uint32Array, detail: GameSettings["graphics"]["terrainDetail"]): Uint32Array {
  if (detail === "high") return source;
  const subdivisions = TERRAIN_VISUAL_SUBDIVISIONS;
  const row = subdivisions + 1;
  const stride = detail === "medium" ? 2 : 4;
  const cells = subdivisions / stride;
  const sourceCoreIndexCount = subdivisions * subdivisions * 6;
  const skirt = source.subarray(sourceCoreIndexCount);
  const indices = new Uint32Array(cells * cells * 6 + skirt.length);
  let cursor = 0;
  for (let z = 0; z < subdivisions; z += stride) {
    for (let x = 0; x < subdivisions; x += stride) {
      const a = z * row + x;
      const b = a + stride;
      const c = a + row * stride;
      const d = c + stride;
      indices[cursor++] = a;
      indices[cursor++] = c;
      indices[cursor++] = b;
      indices[cursor++] = b;
      indices[cursor++] = c;
      indices[cursor++] = d;
    }
  }
  indices.set(skirt, cursor);
  return indices;
}

export function TerrainChunk({ chunk, originCx, originCy, castShadow, detail }: { chunk: ChunkPayload; originCx: bigint; originCy: bigint; castShadow: boolean; detail: GameSettings["graphics"]["terrainDetail"] }) {
  const geometry = useMemo(() => {
    const geo = new THREE.BufferGeometry();
    geo.setAttribute("position", new THREE.BufferAttribute(chunk.terrainPositions, 3));
    geo.setAttribute("normal", new THREE.BufferAttribute(chunk.terrainNormals, 3));
    geo.setAttribute("color", new THREE.BufferAttribute(chunk.terrainColors, 3));
    geo.setIndex(new THREE.BufferAttribute(indicesForDetail(chunk.terrainIndices, detail), 1));
    return geo;
  }, [chunk, detail]);

  useEffect(() => () => geometry.dispose(), [geometry]);

  const position = useMemo<[number, number, number]>(() => {
    const baseX = Number(BigInt(chunk.cx) - originCx) * chunk.size;
    const baseZ = Number(BigInt(chunk.cy) - originCy) * chunk.size;
    return [baseX, 0, baseZ];
  }, [chunk.cx, chunk.cy, chunk.size, originCx, originCy]);

  return (
    <mesh geometry={geometry} position={position} userData={{ terrain: true }} receiveShadow castShadow={castShadow}>
      <meshStandardMaterial vertexColors roughness={0.9} />
    </mesh>
  );
}
