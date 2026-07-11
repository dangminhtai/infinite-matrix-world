import { generateMapTile } from "../map/mapTile";
import { HybridMatrixWorld } from "../world/hybridWorld";
import { matrixFromStrings } from "../world/matrix";

type MapRequest = { requestId: number; seed: string[][]; cx: string; cy: string };

let world: HybridMatrixWorld | null = null;
let seedKey = "";

self.onmessage = (event: MessageEvent<MapRequest>) => {
  const request = event.data;
  try {
    const nextSeedKey = JSON.stringify(request.seed);
    if (!world || nextSeedKey !== seedKey) {
      world = new HybridMatrixWorld(matrixFromStrings(request.seed));
      seedKey = nextSeedKey;
    }
    const tile = generateMapTile(world, BigInt(request.cx), BigInt(request.cy));
    self.postMessage({ requestId: request.requestId, tile }, [tile.biomes.buffer]);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    self.postMessage({ requestId: request.requestId, error: message });
  }
};
