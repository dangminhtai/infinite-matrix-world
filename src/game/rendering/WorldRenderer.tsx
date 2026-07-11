import type { ChunkPayload } from "../types";
import { TerrainChunk } from "./TerrainChunk";
import { Water } from "./Water";
import { TreeInstances } from "./TreeInstances";
import { RockInstances } from "./RockInstances";
import { FlowerInstances } from "./FlowerInstances";
import { Lighting } from "./Lighting";
import { SkyDome } from "./SkyDome";
import type { GameSettings } from "../settings";

export function WorldRenderer({ chunks, originCx, originCy, debug, graphics }: { chunks: ChunkPayload[]; originCx: bigint; originCy: bigint; debug: boolean; graphics: GameSettings["graphics"] }) {
  return (
    <>
      <SkyDome />
      <Lighting shadowQuality={graphics.shadowQuality} fogQuality={graphics.fogQuality} />
      <Water quality={graphics.waterQuality} />
      {chunks.map((chunk) => <TerrainChunk key={`${chunk.cx},${chunk.cy}`} chunk={chunk} originCx={originCx} originCy={originCy} castShadow={graphics.distantShadows} />)}
      {debug && <gridHelper args={[128, 64, "#29404f", "#8aa4b3"]} position={[0, 0.03, 0]} />}
      <TreeInstances chunks={chunks} originCx={originCx} originCy={originCy} density={graphics.vegetationDensity} />
      <RockInstances chunks={chunks} originCx={originCx} originCy={originCy} density={graphics.vegetationDensity} />
      {graphics.flowers && <FlowerInstances chunks={chunks} originCx={originCx} originCy={originCy} density={graphics.vegetationDensity} />}
    </>
  );
}
