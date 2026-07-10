import type { ChunkPayload } from "../types";
import { TerrainChunk } from "./TerrainChunk";
import { Water } from "./Water";
import { TreeInstances } from "./TreeInstances";
import { RockInstances } from "./RockInstances";
import { FlowerInstances } from "./FlowerInstances";
import { Lighting } from "./Lighting";

export function WorldRenderer({ chunks, originCx, originCy, debug }: { chunks: ChunkPayload[]; originCx: bigint; originCy: bigint; debug: boolean }) {
  return (
    <>
      <Lighting />
      <Water />
      {chunks.map((chunk) => <TerrainChunk key={`${chunk.cx},${chunk.cy}`} chunk={chunk} originCx={originCx} originCy={originCy} />)}
      {debug && <gridHelper args={[128, 64, "#29404f", "#8aa4b3"]} position={[0, 0.03, 0]} />}
      <TreeInstances chunks={chunks} originCx={originCx} originCy={originCy} />
      <RockInstances chunks={chunks} originCx={originCx} originCy={originCy} />
      <FlowerInstances chunks={chunks} originCx={originCx} originCy={originCy} />
    </>
  );
}
