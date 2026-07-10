export type ExplorationStats = {
  seedKey: string;
  visitedChunks: string[];
  visitedBiomes: string[];
  distanceTiles: number;
  farthestDistance: number;
  maxAbsX: string;
  maxAbsY: string;
  seenTrees: number;
  seenRocks: number;
  seenFlowers: number;
  teleports: number;
};

export function emptyExploration(seedKey: string): ExplorationStats {
  return {
    seedKey,
    visitedChunks: [],
    visitedBiomes: [],
    distanceTiles: 0,
    farthestDistance: 0,
    maxAbsX: "0",
    maxAbsY: "0",
    seenTrees: 0,
    seenRocks: 0,
    seenFlowers: 0,
    teleports: 0,
  };
}

export function ExplorationPanel({ stats }: { stats: ExplorationStats }) {
  return (
    <section className="sidePanel explorationPanel">
      <h2>Exploration</h2>
      <span>Chunks {stats.visitedChunks.length}</span>
      <span>Biomes {stats.visitedBiomes.join(", ") || "n/a"}</span>
      <span>Distance {stats.distanceTiles.toFixed(1)} tiles</span>
      <span>Farthest {stats.farthestDistance.toFixed(1)} tiles</span>
      <span>Max |X| {stats.maxAbsX}</span>
      <span>Max |Y| {stats.maxAbsY}</span>
      <span>Seen trees {stats.seenTrees}</span>
      <span>Seen rocks {stats.seenRocks}</span>
      <span>Seen flowers {stats.seenFlowers}</span>
      <span>Teleports {stats.teleports}</span>
    </section>
  );
}
