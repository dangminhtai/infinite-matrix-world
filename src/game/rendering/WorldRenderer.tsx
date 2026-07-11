import type { ChunkPayload } from "../types";
import { TerrainChunk } from "./TerrainChunk";
import { Water } from "./Water";
import { TreeInstances } from "./TreeInstances";
import { RockInstances } from "./RockInstances";
import { FlowerInstances } from "./FlowerInstances";
import { Lighting } from "./Lighting";
import { SkyDome } from "./SkyDome";
import type { GameSettings } from "../settings";
import type { GameState } from "../GameCanvas";
import type { MutableRefObject } from "react";

function floorDiv(a: bigint, b: bigint): bigint {
  let q = a / b;
  const r = a % b;
  if (r !== 0n && (r > 0n) !== (b > 0n)) q -= 1n;
  return q;
}

function chunkDetail(base: GameSettings["graphics"]["terrainDetail"], distance: number): GameSettings["graphics"]["terrainDetail"] {
  if (base === "low") return "low";
  if (base === "medium") return distance <= 1 ? "medium" : "low";
  return distance <= 1 ? "high" : distance <= 2 ? "medium" : "low";
}

export function WorldRenderer({ chunks, originCx, originCy, debug, graphics, player }: { chunks: ChunkPayload[]; originCx: bigint; originCy: bigint; debug: boolean; graphics: GameSettings["graphics"]; player: MutableRefObject<GameState> }) {
  const worldX = player.current.tileX + BigInt(Math.floor(player.current.localX));
  const worldY = player.current.tileY + BigInt(Math.floor(player.current.localZ));
  const playerCx = floorDiv(worldX, 16n);
  const playerCy = floorDiv(worldY, 16n);
  const withDistance = chunks.map((chunk) => ({
    chunk,
    distance: Math.max(Math.abs(Number(BigInt(chunk.cx) - playerCx)), Math.abs(Number(BigInt(chunk.cy) - playerCy))),
  }));
  const nearChunks = withDistance.filter(({ distance }) => distance <= 1).map(({ chunk }) => chunk);
  const farTreeChunks = withDistance.filter(({ distance }) => distance > 1 && distance <= graphics.renderDistance).map(({ chunk }) => chunk);
  const rockChunks = withDistance.filter(({ distance }) => distance <= Math.max(1, graphics.renderDistance - 1)).map(({ chunk }) => chunk);
  return (
    <>
      <SkyDome />
      <Lighting shadowQuality={graphics.shadowQuality} fogQuality={graphics.fogQuality} player={player} />
      <Water quality={graphics.waterQuality} />
      {withDistance.map(({ chunk, distance }) => <TerrainChunk key={`${chunk.cx},${chunk.cy}`} chunk={chunk} originCx={originCx} originCy={originCy} castShadow={graphics.distantShadows && distance <= 1} detail={chunkDetail(graphics.terrainDetail, distance)} />)}
      {debug && <gridHelper args={[128, 64, "#29404f", "#8aa4b3"]} position={[0, 0.03, 0]} />}
      <TreeInstances nearChunks={nearChunks} farChunks={farTreeChunks} originCx={originCx} originCy={originCy} density={graphics.vegetationDensity} castShadow={graphics.shadowQuality === "high"} />
      <RockInstances chunks={rockChunks} originCx={originCx} originCy={originCy} density={graphics.vegetationDensity} castShadow={graphics.shadowQuality === "high"} />
      {graphics.flowers && <FlowerInstances chunks={nearChunks} originCx={originCx} originCy={originCy} density={graphics.vegetationDensity} />}
    </>
  );
}
