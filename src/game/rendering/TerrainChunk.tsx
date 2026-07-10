import { useMemo } from "react";
import * as THREE from "three";
import type { ChunkPayload } from "../types";

export function TerrainChunk({ chunk, originCx, originCy }: { chunk: ChunkPayload; originCx: bigint; originCy: bigint }) {
  const geometry = useMemo(() => {
    const geo = new THREE.BufferGeometry();
    geo.setAttribute("position", new THREE.BufferAttribute(chunk.terrainPositions, 3));
    geo.setAttribute("normal", new THREE.BufferAttribute(chunk.terrainNormals, 3));
    geo.setAttribute("color", new THREE.BufferAttribute(chunk.terrainColors, 3));
    geo.setIndex(new THREE.BufferAttribute(chunk.terrainIndices, 1));
    return geo;
  }, [chunk]);

  const position = useMemo<[number, number, number]>(() => {
    const baseX = Number(BigInt(chunk.cx) - originCx) * chunk.size;
    const baseZ = Number(BigInt(chunk.cy) - originCy) * chunk.size;
    return [baseX, 0, baseZ];
  }, [chunk.cx, chunk.cy, chunk.size, originCx, originCy]);

  return (
    <mesh geometry={geometry} position={position} userData={{ terrain: true }} receiveShadow castShadow>
      <meshStandardMaterial vertexColors roughness={0.9} />
    </mesh>
  );
}
