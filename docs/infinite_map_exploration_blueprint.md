## 0. Tóm tắt quyết định kiến trúc

Hệ thống bản đồ phải tuân theo bốn nguyên tắc:

1. **Thế giới không được lưu dưới dạng ảnh hoặc dữ liệu terrain đã sinh.**
2. **Terrain luôn được tái tạo từ `worldSeed + generatorVersion + tọa độ`.**
3. **Save chỉ lưu bằng chứng khám phá và thay đổi do người chơi tạo ra.**
4. **Độ chính xác của lịch sử giảm dần theo khoảng cách và thời gian để giữ dung lượng hữu hạn.**

Luồng nén thông tin:

```text
Fine chunk mask
    ↓ hết ngân sách chi tiết
Sector chunk mask
    ↓ hết ngân sách sector
Region sector mask
    ↓ hết ngân sách region
Journey digest/statistics
```

Ý nghĩa:

- Khu vực gần hoặc mới đi qua giữ fog chi tiết.
- Khu vực cũ giữ trạng thái đã ghé ở cấp sector.
- Khu vực cực cũ chỉ giữ silhouette region và thống kê hành trình.
- Terrain không bao giờ được ghi vào save.

---

# 1. Sự thật toán học bắt buộc phải chấp nhận

Không tồn tại cách vừa:

- lưu chính xác một tập tọa độ khám phá tùy ý trong thế giới vô hạn;
- vừa bắt save có kích thước hữu hạn tuyệt đối.

Một người chơi có thể teleport tới vô hạn region rời rạc. Để nhớ chính xác mọi region đó, lượng thông tin cần lưu cũng tăng không giới hạn.

Vì vậy hệ thống phải chọn một trong ba chính sách:

1. **Exact but growing**: lưu chính xác, save tiếp tục tăng.
2. **Bounded but lossy**: giới hạn dung lượng, dữ liệu rất cũ mất bớt độ chính xác.
3. **Bounded approximate**: dùng Bloom filter hoặc digest, có xác suất false positive.

Blueprint này chọn:

\[
\boxed{\text{Exact ở gần} + \text{Coarse ở xa} + \text{Bounded}}
\]

Bloom filter chỉ được dùng cho thống kê hoặc phát hiện “có thể đã từng ghé”, không được dùng để tự động mở fog vì false positive có thể làm lộ map chưa khám phá.

---

# 2. Mục tiêu và phạm vi

## 2.1 Mục tiêu

Hệ thống phải hỗ trợ:

- minimap chỉ lộ vùng người chơi đã khám phá;
- world map có nhiều mức zoom;
- map hoạt động ở tọa độ `BigInt` cực lớn;
- pan map không làm gameplay khựng;
- teleport không tự mở đường đi;
- rương, quái và landmark chưa biết không xuất hiện trên map;
- reload không làm mất dữ liệu đang nằm trong ngân sách lưu;
- migration đúng ở tọa độ âm;
- không sinh hoặc lưu toàn bộ map.

## 2.2 Chưa làm trong giai đoạn này

- line-of-sight vật lý chính xác qua núi và công trình;
- bản đồ hang động nhiều tầng;
- đồng bộ save cloud;
- chia sẻ bản đồ giữa nhiều người chơi;
- bản đồ vector hoàn chỉnh cho đường và sông;
- raster hóa toàn bộ khu vực đã khám phá.

---

# 3. Bất biến hệ thống

## 3.1 Determinism

Với cùng:

```text
worldSeed
generatorVersion
tọa độ
mapStyleVersion
```

terrain map phải tái tạo giống nhau.

## 3.2 Không dùng Number cho tọa độ toàn cục

Không được làm:

```ts
const cxNumber = Number(cx);
```

khi `cx` có thể rất lớn.

`Number` chỉ được dùng cho:

- tọa độ local nhỏ bên trong chunk;
- khoảng cách local quanh player;
- chỉ số bit từ 0 đến 255;
- tọa độ render sau floating origin.

## 3.3 Không tiết lộ thông tin qua UI

Vùng chưa khám phá không được để lộ:

- màu biome chính xác;
- đường sông chính xác;
- vị trí rương;
- vị trí quái;
- landmark;
- tài nguyên hiếm;
- độ cao chi tiết.

## 3.4 Map không cạnh tranh với gameplay

Ưu tiên bắt buộc:

```text
Input/camera/player
    >
Gameplay chunk đang cần
    >
Collision gần player
    >
Minimap từ dữ liệu đã tải
    >
World map tile
    >
Map prefetch
```

## 3.5 Save không chứa terrain

Cấm lưu:

- heightmap;
- normal;
- biome array đầy đủ;
- texture;
- canvas;
- `ImageData`;
- vertex buffer;
- instance matrix của cây/đá/cỏ.

---

# 4. Hệ tọa độ phân cấp

## 4.1 Kích thước

```text
Tile:       1 x 1 đơn vị gameplay
Chunk:     16 x 16 tile
Sector:     8 x 8 chunk   = 128 x 128 tile
Region:    16 x 16 sector = 2.048 x 2.048 tile
Superregion tùy chọn: 64 x 64 region
```

Hằng số:

```ts
export const CHUNK_SIZE_TILES = 16n;
export const SECTOR_SIZE_CHUNKS = 8n;
export const REGION_SIZE_SECTORS = 16n;
export const FINE_GRID_SIZE = 8;
```

## 4.2 Tọa độ

```ts
type WorldTileCoord = {
  x: bigint;
  y: bigint;
};

type ChunkCoord = {
  cx: bigint;
  cy: bigint;
};

type SectorCoord = {
  sx: bigint;
  sy: bigint;
};

type RegionCoord = {
  rx: bigint;
  ry: bigint;
};
```

Quy đổi:

\[
c_x=\left\lfloor\frac{x}{16}\right\rfloor
\]

\[
s_x=\left\lfloor\frac{c_x}{8}\right\rfloor
\]

\[
r_x=\left\lfloor\frac{s_x}{16}\right\rfloor
\]

Tương tự cho trục \(y\).

---

# 5. Floor division cho BigInt âm

JavaScript `BigInt /` chia về 0, không phải floor.

Ví dụ:

```ts
-1n / 8n === 0n;
```

Nhưng trong phân vùng không gian ta cần:

\[
\left\lfloor-\frac18\right\rfloor=-1
\]

## 5.1 Hàm chuẩn

```ts
export function floorDiv(a: bigint, b: bigint): bigint {
  if (b === 0n) {
    throw new Error("floorDiv: divisor must not be zero");
  }

  let q = a / b;
  const r = a % b;

  if (r !== 0n && r > 0n !== b > 0n) {
    q -= 1n;
  }

  return q;
}

export function floorMod(a: bigint, b: bigint): bigint {
  if (b === 0n) {
    throw new Error("floorMod: divisor must not be zero");
  }

  return a - floorDiv(a, b) * b;
}
```

Với `b > 0`:

\[
0\le\operatorname{floorMod}(a,b)<b
\]

## 5.2 Bảng kiểm thử bắt buộc

Với divisor `8n`:

|   a | floorDiv(a, 8) | floorMod(a, 8) |
| --: | -------------: | -------------: |
| -17 |             -3 |              7 |
| -16 |             -2 |              0 |
|  -9 |             -2 |              7 |
|  -8 |             -1 |              0 |
|  -1 |             -1 |              7 |
|   0 |              0 |              0 |
|   1 |              0 |              1 |
|   7 |              0 |              7 |
|   8 |              1 |              0 |
|   9 |              1 |              1 |

Mọi phép chia chunk, sector, region và map tile phải dùng cùng module này.

---

# 6. Key không gian

## 6.1 Key dạng chuỗi

MVP có thể dùng:

```ts
export function pairKey(x: bigint, y: bigint): string {
  return `${x.toString()},${y.toString()}`;
}
```

Hai số thập phân có dấu được ngăn bằng dấu phẩy nên không mơ hồ.

Không được dùng:

```ts
`${x}${y}`;
```

vì `(1, 23)` và `(12, 3)` có thể tạo cùng chuỗi.

## 6.2 Key phải gắn world identity

Không được dùng chung dữ liệu khám phá giữa hai seed.

```ts
type WorldIdentity = {
  worldSeed: string;
  generatorVersion: number;
};
```

Storage key:

```ts
const storageKey = `infinite-world:exploration:v2:${generatorVersion}:${worldSeed}`;
```

Nếu seed có thể rất dài, dùng hash ổn định của seed cho tên storage nhưng vẫn lưu seed gốc trong metadata.

---

# 7. Mức chi tiết khám phá

## 7.1 Fine chunk mask

Một chunk chia thành lưới `8 x 8` ô khám phá:

```text
Chunk 16 x 16 tile
Fine cell 2 x 2 tile
Tổng 64 fine cell
```

Mỗi chunk dùng một bitset 64 bit:

\[
F\in[0,2^{64}-1]
\]

Bit index:

\[
i=y*{\text{local}}\times8+x*{\text{local}}
\]

Ý nghĩa:

- bit `0`: chưa thấy;
- bit `1`: đã lộ.

Biên mềm được render từ nội suy hoặc distance transform, không cần lưu opacity từng ô.

## 7.2 Sector chunk mask

Một sector chứa `8 x 8 = 64` chunk.

Mỗi sector dùng một bitset 64 bit để biết chunk nào từng được mở:

\[
S\in[0,2^{64}-1]
\]

Sector mask vẫn chính xác ở cấp chunk.

## 7.3 Region sector mask

Một region chứa `16 x 16 = 256` sector.

Dùng bitset 256 bit:

\[
R\in[0,2^{256}-1]
\]

Region mask chỉ biết sector nào từng được ghé, không biết hình fog chi tiết bên trong sector.

## 7.4 Journey digest

Khi region cũ bị compact khỏi ngân sách:

- tăng số region đã ghé;
- cập nhật bounding box hành trình;
- cập nhật khoảng cách xa nhất;
- có thể thêm hash region vào Bloom filter chỉ phục vụ thống kê.

Journey digest không được mở fog.

---

# 8. Schema runtime và schema lưu trữ

Runtime cần `Map` để lookup nhanh. Persisted save cần mảng tuple để giảm overhead và serialize ổn định.

## 8.1 Runtime state

```ts
type FineChunkRuntimeEntry = {
  mask: bigint;
  lastTouchedTick: number;
};

type SectorRuntimeEntry = {
  visitedChunkMask: bigint;
  lastTouchedTick: number;
};

type RegionRuntimeEntry = {
  visitedSectorMask: bigint;
  lastTouchedTick: number;
};

type ExplorationRuntimeState = {
  fineChunks: Map<string, FineChunkRuntimeEntry>;
  sectors: Map<string, SectorRuntimeEntry>;
  regions: Map<string, RegionRuntimeEntry>;

  fineLru: string[];
  sectorLru: string[];
  regionLru: string[];

  revision: number;
  dirty: boolean;
};
```

## 8.2 Persisted schema V2

```ts
type ExplorationSaveV2 = {
  version: 2;

  world: {
    seed: string;
    generatorVersion: number;
  };

  layout: {
    chunkSizeTiles: 16;
    sectorSizeChunks: 8;
    regionSizeSectors: 16;
    fineGridSize: 8;
  };

  fineChunks: Array<
    [chunkKey: string, maskHex64: string, lastTouchedTick: number]
  >;

  sectors: Array<
    [sectorKey: string, visitedChunkMaskHex64: string, lastTouchedTick: number]
  >;

  regions: Array<
    [
      regionKey: string,
      visitedSectorMaskHex256: string,
      lastTouchedTick: number,
    ]
  >;

  waypoints: Array<{
    id: string;
    name: string;
    worldX: string;
    worldY: string;
    kind: "user" | "quest" | "landmark";
    createdAt: number;
  }>;

  lastPosition: {
    worldX: string;
    worldY: string;
  };

  journey: {
    totalRevealEvents: number;
    uniqueChunksApprox: number;
    compactedRegionCount: number;

    minChunkX: string | null;
    maxChunkX: string | null;
    minChunkY: string | null;
    maxChunkY: string | null;
  };

  revision: number;
  savedAt: number;
};
```

## 8.3 Mã hóa bitset

64 bit luôn ghi đúng 16 ký tự hex:

```ts
export function encodeHex64(mask: bigint): string {
  return mask.toString(16).padStart(16, "0");
}
```

256 bit luôn ghi đúng 64 ký tự hex:

```ts
export function encodeHex256(mask: bigint): string {
  return mask.toString(16).padStart(64, "0");
}
```

Khi decode phải kiểm tra:

- chỉ có `[0-9a-f]`;
- chiều dài đúng;
- giá trị không âm;
- không vượt bit width.

---

# 9. Bit index và mapping

## 9.1 Chunk trong sector

```ts
export function chunkToSector(cx: bigint, cy: bigint) {
  const sx = floorDiv(cx, SECTOR_SIZE_CHUNKS);
  const sy = floorDiv(cy, SECTOR_SIZE_CHUNKS);

  const localX = Number(floorMod(cx, SECTOR_SIZE_CHUNKS));
  const localY = Number(floorMod(cy, SECTOR_SIZE_CHUNKS));

  const bitIndex = localY * 8 + localX;

  return { sx, sy, localX, localY, bitIndex };
}
```

## 9.2 Sector trong region

```ts
export function sectorToRegion(sx: bigint, sy: bigint) {
  const rx = floorDiv(sx, REGION_SIZE_SECTORS);
  const ry = floorDiv(sy, REGION_SIZE_SECTORS);

  const localX = Number(floorMod(sx, REGION_SIZE_SECTORS));
  const localY = Number(floorMod(sy, REGION_SIZE_SECTORS));

  const bitIndex = localY * 16 + localX;

  return { rx, ry, localX, localY, bitIndex };
}
```

## 9.3 Bit operations

```ts
export function setBit(mask: bigint, index: number): bigint {
  if (!Number.isInteger(index) || index < 0) {
    throw new Error("setBit: invalid index");
  }

  return mask | (1n << BigInt(index));
}

export function hasBit(mask: bigint, index: number): boolean {
  return (mask & (1n << BigInt(index))) !== 0n;
}

export function countBits(mask: bigint): number {
  let value = mask;
  let count = 0;

  while (value !== 0n) {
    value &= value - 1n;
    count++;
  }

  return count;
}
```

---

# 10. Quy tắc reveal

## 10.1 Input reveal

```ts
type RevealInput = {
  worldTileX: bigint;
  worldTileY: bigint;

  mode: "walk" | "teleport" | "developerTeleport";
  terrainHeight?: number;
  localAverageHeight?: number;
};
```

## 10.2 Bán kính reveal

```text
Đi bộ:              3 fine cell
Teleport thường:    2 fine cell
Developer teleport: 1 fine cell hoặc 0 tùy setting
```

High-ground bonus:

```ts
const relativeHeight =
  terrainHeight !== undefined && localAverageHeight !== undefined
    ? terrainHeight - localAverageHeight
    : 0;

const heightBonus = relativeHeight >= HIGH_GROUND_THRESHOLD ? 1 : 0;

const revealRadius = clamp(baseRadius + heightBonus, 1, 4);
```

Không dùng độ cao tuyệt đối vì biome cao nguyên sẽ luôn được bonus.

## 10.3 Reveal hình tròn

Với tâm fine cell \((u_0,v_0)\), mở ô \((u,v)\) nếu:

\[
(u-u_0)^2+(v-v_0)^2\le r^2
\]

Phải duyệt qua các chunk lân cận nếu hình tròn vượt biên chunk.

## 10.4 Không mở đường teleport

Teleport từ A tới B chỉ gọi:

```ts
revealAt(B, "teleport");
```

Không nội suy các điểm giữa A và B.

## 10.5 Developer teleport

Setting:

```ts
developerTeleportReveal:
  | "none"
  | "landing-cell"
  | "normal"
```

Mặc định `"none"`.

---

# 11. Cập nhật các tầng dữ liệu

Khi một fine cell được mở:

1. Cập nhật fine chunk mask.
2. Bật bit chunk trong sector mask.
3. Bật bit sector trong region mask.
4. Cập nhật LRU.
5. Tăng `revision` chỉ khi có bit mới.
6. Đánh dấu save dirty.
7. Báo UI ở tần số giới hạn.

Pseudocode:

```ts
function revealFineCell(
  state: ExplorationRuntimeState,
  cx: bigint,
  cy: bigint,
  localFineX: number,
  localFineY: number,
): boolean {
  const chunkKey = pairKey(cx, cy);
  const fineBit = localFineY * 8 + localFineX;

  const fineEntry = state.fineChunks.get(chunkKey) ?? {
    mask: 0n,
    lastTouchedTick: 0,
  };

  const nextFineMask = setBit(fineEntry.mask, fineBit);
  const changed = nextFineMask !== fineEntry.mask;

  touchFineChunk(state, chunkKey, {
    mask: nextFineMask,
    lastTouchedTick: nextTick(),
  });

  const sector = chunkToSector(cx, cy);
  const sectorKey = pairKey(sector.sx, sector.sy);

  const sectorEntry = state.sectors.get(sectorKey) ?? {
    visitedChunkMask: 0n,
    lastTouchedTick: 0,
  };

  touchSector(state, sectorKey, {
    visitedChunkMask: setBit(sectorEntry.visitedChunkMask, sector.bitIndex),
    lastTouchedTick: nextTick(),
  });

  const region = sectorToRegion(sector.sx, sector.sy);
  const regionKey = pairKey(region.rx, region.ry);

  const regionEntry = state.regions.get(regionKey) ?? {
    visitedSectorMask: 0n,
    lastTouchedTick: 0,
  };

  touchRegion(state, regionKey, {
    visitedSectorMask: setBit(regionEntry.visitedSectorMask, region.bitIndex),
    lastTouchedTick: nextTick(),
  });

  if (changed) {
    state.revision++;
    state.dirty = true;
  }

  return changed;
}
```

---

# 12. LRU và compaction

## 12.1 Ngân sách đề xuất

```text
Fine chunks: 4.096 entry
Sector exact masks: giới hạn theo 512 KiB serialized
Region masks: 16.384 entry hoặc theo 2 MiB serialized
Waypoint: 100
```

Phải đo số byte JSON thật:

```ts
const bytes = new TextEncoder().encode(JSON.stringify(save)).byteLength;
```

## 12.2 Evict fine chunk

Khi fine chunk bị đẩy khỏi LRU:

- xóa fine mask;
- không xóa sector bit;
- không xóa region bit.

Kết quả:

- zoom gần mất biên fog chi tiết cũ;
- zoom trung bình vẫn biết chunk đã được khám phá.

## 12.3 Evict sector

Khi sector bị compact:

- region bit đã bật;
- xóa mask 64 chunk;
- vùng đó chỉ còn trạng thái “sector từng được ghé”.

## 12.4 Evict region

Khi region vượt ngân sách:

- cập nhật Journey digest;
- xóa region mask cũ nhất;
- không dùng digest để tự mở fog.

## 12.5 Không evict vùng quan trọng

Không evict:

- region hiện tại;
- region có waypoint;
- region có quest đang hoạt động;
- region có landmark đã đánh dấu;
- region gần vị trí cuối.

Có thể dùng điểm:

\[
score=
w_a\cdot age+
w_d\cdot distance-
w_p\cdot pinned
\]

Entry có score cao nhất bị compact trước.

---

# 13. Storage: localStorage và IndexedDB

## 13.1 Khuyến nghị production

Không nên đưa 1–3 MB exploration vào `localStorage` lâu dài vì API đồng bộ và mỗi lần ghi phải stringify toàn bộ.

Kiến trúc production:

```text
localStorage:
- schema version
- seed hiện tại
- last position
- setting nhỏ
- pointer tới save revision

IndexedDB:
- fine chunk pages
- sector pages
- region pages
- waypoint
- journey metadata
```

## 13.2 MVP

Có thể dùng localStorage trước với điều kiện:

- target dưới 256–512 KiB;
- debounce save;
- compact trước khi write;
- xử lý `QuotaExceededError`.

## 13.3 Storage adapter

```ts
export interface ExplorationStorage {
  load(world: WorldIdentity): Promise<ExplorationSaveV2 | null>;
  save(world: WorldIdentity, data: ExplorationSaveV2): Promise<void>;
  remove(world: WorldIdentity): Promise<void>;
}
```

Implementation đầu:

```text
LocalStorageExplorationStorage
```

Production:

```text
IndexedDbExplorationStorage
```

---

# 14. Save an toàn

## 14.1 Debounce

```text
Reveal thay đổi state
    ↓
dirty = true
    ↓
debounce 750–1500 ms
    ↓
compact
    ↓
serialize
    ↓
save
```

Flush khi:

- `visibilitychange` sang hidden;
- `pagehide`;
- đổi seed;
- thoát world;
- người chơi bấm Save.

## 14.2 Backup

Với localStorage:

```text
exploration:<world>:current
exploration:<world>:backup
```

Quy trình:

1. Ghi current cũ sang backup.
2. Ghi save mới sang current.
3. Đọc lại và parse.
4. Nếu lỗi, phục hồi backup.

## 14.3 QuotaExceeded

1. Compact fine.
2. Compact sector.
3. Compact region.
4. Serialize lại.
5. Retry đúng một lần.
6. Nếu vẫn lỗi, chỉ lưu metadata cốt lõi và báo lỗi rõ.

Không retry vô hạn.

---

# 15. Migration từ `visitedChunks`

## 15.1 Nguồn cũ

```ts
visitedChunks: string[];
```

Mỗi key:

```text
"cx,cy"
```

## 15.2 Quy tắc

Với mỗi chunk:

1. Parse bằng `BigInt`.
2. Bật toàn bộ fine mask.
3. Bật bit trong sector.
4. Bật bit sector trong region.
5. Thêm vào LRU.
6. Compact.
7. Ghi `version: 2`.
8. Chỉ xóa save cũ sau khi V2 được kiểm tra.

```ts
const FULL_FINE_MASK = (1n << 64n) - 1n;
```

## 15.3 Idempotent

\[
migrate(migrate(save))=migrate(save)
\]

Nếu đã là V2, validate rồi trả về, không migrate lại.

## 15.4 Test bắt buộc

```text
0
7
8
-1
-8
-9
```

Tổ hợp:

```text
(0, 0)
(7, 7)
(8, 8)
(-1, -1)
(-8, -8)
(-9, -9)
(-1, 8)
(8, -1)
```

## 15.5 Key lỗi

```text
""
"1"
"1,2,3"
"a,b"
"1.5,2"
```

Không crash toàn migration. Bỏ entry lỗi, đếm và log dev.

---

# 16. API domain

Query:

```ts
export type ExplorationQuery = {
  isFineCellRevealed(
    cx: bigint,
    cy: bigint,
    fineX: number,
    fineY: number,
  ): boolean;

  isChunkKnown(cx: bigint, cy: bigint): boolean;

  getSectorKnowledge(
    sx: bigint,
    sy: bigint,
  ): "unknown" | "coarse" | "partial" | "detailed";

  isRegionKnown(rx: bigint, ry: bigint): boolean;
};
```

Mutation:

```ts
export type ExplorationCommands = {
  revealAt(input: RevealInput): boolean;
  addWaypoint(input: AddWaypointInput): Waypoint;
  removeWaypoint(id: string): void;
  clearCurrentWorld(): Promise<void>;
  flush(): Promise<void>;
};
```

UI chỉ subscribe snapshot nhỏ:

```ts
type ExplorationUiSnapshot = {
  revision: number;
  currentChunkKey: string;
  currentSectorKey: string;
  currentRegionKey: string;
  waypointCount: number;
  storageBytes: number;
};
```

Không đưa toàn bộ `Map` qua React state.

---

# 17. Tích hợp game loop

Không kiểm tra reveal mỗi frame nếu player chưa đổi fine cell.

```ts
let lastRevealCellKey: string | null = null;
```

Mỗi update player:

1. Tính chunk/fine cell.
2. Tạo key.
3. Nếu key giống lần trước, bỏ qua.
4. Nếu khác, gọi reveal.

UI được báo tối đa 5–10 lần/giây khi đang di chuyển.

Minimap khoảng 5 Hz.

---

# 18. Fog minimap

## 18.1 Nguồn terrain

Minimap chỉ dùng:

- chunk gameplay đã tải;
- payload height/biome hiện có;
- entity gameplay đã quản lý.

Không gọi map worker lúc startup.

## 18.2 Fog overlay

MVP:

1. Tạo mask nhỏ quanh player, ví dụ `64 x 64` hoặc `128 x 128`.
2. Lấy trạng thái fine cell.
3. Nội suy ô gần nhau.
4. Blur nhẹ hoặc smoothstep.
5. Chỉ cập nhật khi center/revision thay đổi.

Không blur canvas lớn mỗi frame.

## 18.3 Trạng thái

```text
Unknown:
- fog gần như kín
- không hiện terrain/entity

Fringe:
- silhouette nhẹ
- không hiện entity

Revealed:
- hiện terrain và marker hợp lệ
```

## 18.4 Entity visibility

```ts
function canShowEntityOnMap(entity: MapEntity): boolean {
  return (
    exploration.isChunkKnown(entity.cx, entity.cy) &&
    entity.discoveryRuleSatisfied
  );
}
```

Rương có thể cần discovery riêng, không chỉ chunk known.

---

# 19. World map theo tile và zoom

Không render canvas vô hạn.

## 19.1 Map tile key

```ts
type MapTileKey = {
  seedHash: string;
  generatorVersion: number;
  mapStyleVersion: number;
  zoomLevel: number;
  tileX: bigint;
  tileY: bigint;
};
```

## 19.2 Zoom level

```text
Z0 - rất gần:
1 tile map = 1 chunk

Z1 - gần:
1 tile map = 4 x 4 chunk

Z2 - trung bình:
1 tile map = 1 sector

Z3 - xa:
1 tile map = 1 region

Z4 - cực xa:
region occupancy, waypoint, journey only
```

## 19.3 Unknown

- không request terrain chi tiết nếu vùng hoàn toàn unknown;
- dùng màu silhouette trung tính;
- không lộ biome;
- không lộ entity.

## 19.4 Partial sector

\[
coverage=\frac{\operatorname{popcount}(S)}{64}
\]

Coverage chỉ điều khiển mức biết, không lộ phần chưa mở.

---

# 20. Map worker

## 20.1 Tách worker

```text
chunk.worker.ts
map.worker.ts
```

Gameplay không chờ map job.

## 20.2 Protocol

Request:

```ts
type MapTileRequest = {
  type: "generate-map-tile";
  requestId: number;
  viewportEpoch: number;

  world: {
    seed: string;
    generatorVersion: number;
  };

  styleVersion: number;
  zoomLevel: number;
  tileX: string;
  tileY: string;

  explorationSummary: {
    knowledge: "unknown" | "coarse" | "partial" | "detailed";
    maskHex?: string;
  };
};
```

Response:

```ts
type MapTileResponse = {
  type: "map-tile-result";
  requestId: number;
  viewportEpoch: number;
  cacheKey: string;
  width: number;
  height: number;
  rgbaBuffer?: ArrayBuffer;
  heightBuffer?: ArrayBuffer;
  generationMs: number;
  byteLength: number;
};
```

Error phải chứa `requestId` và `cacheKey` để xóa pending.

## 20.3 Viewport epoch

Mỗi lần pan/zoom đủ lớn:

```ts
viewportEpoch++;
```

Chỉ nhận response khi epoch còn hiện hành.

Response cũ:

- xóa pending;
- giải phóng buffer;
- không setState;
- không render.

## 20.4 Cancel cooperative

Worker chia công việc thành bước và kiểm tra cờ cancel giữa các bước.

Mobile tối đa một map job active.

## 20.5 Priority

1. center viewport;
2. edge viewport;
3. prefetch một vòng;
4. bỏ request xa.

---

# 21. Cache map tile theo byte

```ts
type MapTileCacheEntry = {
  key: string;
  byteLength: number;
  lastAccessTick: number;
  bitmap?: ImageBitmap;
  rgba?: Uint8ClampedArray;
};
```

Ngân sách gợi ý:

```text
Mobile: 16–24 MiB
Desktop: 48–96 MiB
```

Khi evict `ImageBitmap`:

```ts
bitmap.close();
```

Không giữ đồng thời nhiều bản sao buffer.

---

# 22. Pan và zoom với BigInt

```ts
type MapView = {
  centerChunkX: bigint;
  centerChunkY: bigint;
  localOffsetX: number;
  localOffsetY: number;
  zoom: number;
};
```

Giống floating origin:

- center toàn cục là BigInt;
- offset màn hình là Number nhỏ.

Khi offset vượt ngưỡng tile:

1. cộng phần nguyên vào center BigInt;
2. giữ offset nhỏ;
3. tăng viewport epoch;
4. request tile mới.

Zoom request debounce 100–200 ms.

---

# 23. Waypoint và teleport

## 23.1 Waypoint

```ts
type Waypoint = {
  id: string;
  name: string;
  worldX: bigint;
  worldY: bigint;
  kind: "user" | "quest" | "landmark";
  pinned: boolean;
  createdAt: number;
};
```

Persist BigInt bằng chuỗi.

## 23.2 Click known

Cho phép đặt waypoint chính xác.

## 23.3 Click unknown

- clamp marker vào rìa fog;
- không query terrain thật;
- hiện nhãn “Khu vực chưa khám phá”.

## 23.4 Teleport

Safe mode:

```text
chỉ waypoint đã khám phá
hoặc landmark đã kích hoạt
```

Developer mode cho tọa độ tùy ý nhưng không tự mở fog.

---

# 24. Seed và version

```text
Cùng seed + cùng generatorVersion:
dùng lại exploration

Cùng seed + khác generatorVersion:
save mới hoặc migration

Khác seed:
save riêng
```

Map cache key phải chứa:

```text
seedHash
generatorVersion
mapStyleVersion
```

---

# 25. Cấu trúc file đề xuất

```text
src/
  game/
    exploration/
      constants.ts
      spatial.ts
      bitset.ts
      keys.ts
      types.ts
      reveal.ts
      ExplorationStore.ts
      ExplorationController.ts
      serialize.ts
      compact.ts
      migrateVisitedChunks.ts

      storage/
        ExplorationStorage.ts
        LocalStorageExplorationStorage.ts
        IndexedDbExplorationStorage.ts

      tests/
        spatial.test.ts
        bitset.test.ts
        reveal.test.ts
        migration.test.ts
        compaction.test.ts
        serialization.test.ts

    map/
      MapViewState.ts
      MapTileKey.ts
      MapTileCache.ts
      MapRequestQueue.ts
      MapWorkerClient.ts
      mapTileGenerator.ts

    minimap/
      MinimapDataSource.ts
      MinimapFogMask.ts

  ui/
    Minimap.tsx
    WorldMap.tsx
    WorldMapCanvas.tsx
    WaypointLayer.tsx
    FogLayer.tsx
    MapControls.tsx

  workers/
    map.worker.ts
```

Điều chỉnh tên theo source hiện tại nhưng giữ rõ trách nhiệm.

---

# 26. Phase M0 — Domain, math và self-test

## Công việc

- [ ] `floorDiv`/`floorMod`.
- [x] Mapping chunk/sector/region ở cấp chunk hiện tại.
- [ ] Key parser/serializer.
- [ ] Bitset 64/256.
- [ ] Hex encode/decode.
- [x] Runtime schema tối thiểu cho chunk/sector/region.
- [x] Save V2 tối thiểu, tách theo seed.
- [x] Migration từ `visitedChunks`, bỏ qua key lỗi.
- [x] Compaction cơ bản: giới hạn chunk/sector/region và hạ sector cũ về region.
- [ ] Save byte estimator.

## Self-test

- [x] Floor division âm.
- [ ] Floor mod không âm.
- [ ] Bit index bốn góc.
- [x] Chunk `-1` → sector `-1`, local `7`.
- [x] Chunk `-8` → sector `-1`, local `0`.
- [x] Chunk `-9` → sector `-2`, local `7`.
- [ ] Sector `-1` → region `-1`, local `15`.
- [ ] Hex64/Hex256 roundtrip.
- [ ] Migration idempotent.
- [x] Entry legacy và `lastPosition` lỗi không crash.
- [ ] Save sai version bị từ chối rõ.

## Definition of Done

- Test không chạy ở production startup.
- Không có `Number(globalCoord)`.
- Build thành công.
- Chưa sửa rendering gameplay.

---

# 27. Phase M1 — Fog minimap

## Công việc

- [ ] Theo dõi fine cell player.
- [x] Reveal bán kính chunk khi player sang chunk mới.
- [ ] High-ground bonus tùy chọn.
- [x] Minimap dùng chunk đã tải.
- [x] Fog nhị phân che chunk chưa khám phá.
- [x] Lọc marker quái ngoài vùng đã khám phá.
- [ ] Debounce save.
- [ ] Metrics save/reveal.

## Benchmark

Đo:

```text
FPS
frame time
Minimap render count
fog rebuild time
save serialization time
save bytes
```

Mục tiêu đầu:

```text
Minimap <= 5 Hz
fog rebuild trung bình < 1 ms desktop
FPS giảm không quá 3%
không request worker lúc startup
```

---

# 28. Phase M2 — World map UI

- [x] Map camera BigInt + local offset.
- [ ] Tile key theo zoom.
- [ ] Unknown/coarse/partial/detailed.
- [ ] Fog layer tách terrain.
- [x] Player/waypoint.
- [x] Không hiện quái chưa biết.
- [x] Pan/zoom giữ tọa độ toàn cục ở `BigInt`.

Bản đầu có thể chưa dùng worker; dùng placeholder và dữ liệu cache để kiểm chứng logic.

---

# 29. Phase M3 — Worker và cache

- [x] Worker riêng.
- [x] Request ID.
- [ ] Viewport epoch.
- [x] Stale filtering theo tập tile viewport đang cần.
- [x] Pending tracking.
- [x] Priority queue theo khoảng cách tới tâm map.
- [x] Mobile concurrency = 1.
- [x] Cache theo byte: mobile 24 MiB, desktop 64 MiB.
- [x] Dispose worker và hàng đợi khi đóng map.
- [x] Không chạy khi map đóng.

Metrics:

```text
pending
active
stale
cancelled
cache bytes
hit/miss
generation avg/max
integration avg/max
```

---

# 30. Phase M4 — Waypoint/teleport

- [ ] Waypoint known area.
- [ ] Marker unknown bị clamp.
- [ ] Giới hạn 100.
- [ ] Pin region có waypoint.
- [x] Safe teleport chỉ cho waypoint nằm trong chunk đã khám phá.
- [ ] Developer teleport policy.
- [x] Không mở đường teleport; chỉ điểm đáp được khám phá theo vòng cập nhật player.
- [x] Save/load waypoint hiện tại.

---

# 31. Phase M5 — Storage production

- [ ] IndexedDB adapter.
- [ ] Transaction write.
- [ ] Import/export.
- [ ] Backup revision.
- [ ] Recovery.
- [ ] Page fine/sector/region.

Chỉ làm khi localStorage bắt đầu thành nút thắt.

---

# 32. Test tổng thể

## Determinism

- Cùng seed/tọa độ → cùng tile.
- Thứ tự request không đổi output.
- Reload không đổi fog.
- Worker/reference generator giống nhau.

## Spatial

- Biên âm/dương.
- Tọa độ `10^100`.
- Tọa độ `-10^100`.

## Save

- Trống.
- Tối đa.
- Corrupted.
- Quota exceeded.
- Migration.
- Đổi seed/version.

## Worker

- Pan nhanh.
- Zoom nhanh.
- Đóng map giữa request.
- Đổi seed giữa request.
- Worker error.
- Response stale.

## Secrecy

- Unknown không lộ biome.
- Unknown không lộ rương/quái.
- Click unknown không query terrain.
- Safe teleport từ chối unknown.

---

# 33. Performance budget

## Main thread

```text
Reveal chỉ khi fine cell đổi
Minimap tối đa 5 Hz
Save không chạy trong useFrame
World map không setState theo từng bước worker
```

## Worker

```text
Gameplay worker ưu tiên tuyệt đối
Map mobile: 1 request active
Desktop: bắt đầu 1, chỉ tăng sau benchmark
```

## Memory

```text
Fine: 4.096 entry
Map cache mobile: 16–24 MiB
Map cache desktop: 48–96 MiB
Không duplicate ArrayBuffer
```

## Save

```text
Mục tiêu localStorage: < 256 KiB
Compact mạnh: 512 KiB
Production: IndexedDB
```

---

# 34. Developer panel

Hiển thị:

```text
Current chunk/sector/region
Fine/sector/region entries
Serialized save bytes
Revision/dirty state
Last save duration/result
Map pending/active/stale
Map cache bytes/hit rate
```

Nút:

```text
Reveal current chunk
Reveal current sector
Clear exploration
Force compact
Force save
Export/import
Run self-tests
```

Nằm trong Settings → Developer.

---

# 35. Failure policy

## Save lỗi

- báo rõ cho người dùng;
- log error name, bytes, counts, revision;
- không fallback im lặng.

## Worker lỗi

- xóa pending;
- cho retry;
- render placeholder;
- không chặn gameplay.

## Migration lỗi

- giữ backup cũ;
- migrate phần hợp lệ;
- không xóa save cũ trước verify.

---

# 36. Điều kiện hoàn thành

1. Tọa độ âm đúng.
2. Không dùng Number cho global coordinate.
3. Không lưu từng tile.
4. Fine LRU.
5. Sector bitset.
6. Region bitset.
7. Compaction không mở unknown.
8. Terrain tái tạo từ seed.
9. Save không chứa raster/heightmap.
10. Reload giữ fog trong ngân sách.
11. Teleport không mở đường.
12. Developer teleport không phá fog.
13. Minimap không request worker startup.
14. World map không chạy khi đóng.
15. Pan nhanh bỏ stale response.
16. Gameplay worker ưu tiên.
17. Cache giới hạn theo byte.
18. Entity chưa khám phá không hiện.
19. Seed/version tách save.
20. Migration idempotent.
21. Build đạt.
22. Self-test đạt.
23. Benchmark mobile đạt.
24. Mở/đóng map không memory leak.
25. Không tuyên bố save hữu hạn nhớ chính xác vô hạn exploration.

---

# 37. Quy trình coding agent

Trước mỗi phase:

1. Đọc source.
2. Tóm tắt kiến trúc.
3. Chỉ ra file sửa.
4. Nêu giả định.
5. Nêu rủi ro.
6. Ghi baseline benchmark.

Sau mỗi phase:

1. Liệt kê file sửa.
2. Chạy typecheck/build.
3. Chạy self-test.
4. Ghi benchmark.
5. Ghi manual checklist.
6. Chưa đạt DoD thì không sang phase sau.

Thứ tự:

```text
M0
→ M1
→ M2
→ M3
→ M4
→ M5
```

---

# 38. Prompt cho coding agent

```text
Hãy triển khai theo file procedural_world_exploration_blueprint.md.

Không viết lại dự án từ đầu.

Bắt đầu duy nhất với Phase M0:
- floorDiv/floorMod BigInt;
- mapping chunk/sector/region;
- bitset 64/256;
- schema runtime/save V2;
- migration visitedChunks;
- compaction cơ bản;
- self-tests.

Trước khi code:
1. đọc source hiện tại;
2. chỉ ra file quản lý visitedChunks/minimap/save;
3. liệt kê file sẽ sửa;
4. giải thích lỗi chia tọa độ âm;
5. giải thích vì sao save hữu hạn không thể nhớ chính xác
   vô hạn điểm khám phá.

Sau khi code:
- chạy build;
- chạy self-tests;
- báo kết quả thật;
- chưa làm world map, worker hoặc waypoint.
```

---

# 39. Kết luận

Kiến trúc mục tiêu:

\[
\boxed{
\text{World regenerated from seed}

- \text{Fine exploration near player}
- \text{Hierarchical bitset}
- \text{Lossy compaction at extreme history}
- \text{On-demand map streaming}
  }
  \]

Nhờ đó:

- thế giới vẫn không có biên;
- fog có ý nghĩa gameplay;
- map không lưu theo từng tile;
- tọa độ cực lớn vẫn hoạt động;
- mobile không bị map worker làm đói gameplay;
- hệ thống nâng cấp dần mà không phá world generator.
