# BLUEPRINT — TỐI ƯU FPS, CỎ, MINIMAP VÀ GIÁ NHÂN VẬT

## 1. Mục tiêu

Sửa bốn vấn đề ảnh hưởng trực tiếp đến trải nghiệm:

1. Mobile vẫn phải nhìn thấy cỏ, không được mất hoàn toàn.
2. Web và mobile không tụt FPS nghiêm trọng khi bật cỏ.
3. Minimap phải hiện ổn định, không trắng, đen hoặc làm nghẽn main thread.
4. Giá mua nhân vật giảm còn đúng 1/10.

Không thay đổi:

* Thuật toán tạo thế giới và seed.
* Gameplay, chiến đấu, chuyển động và save hiện tại.
* Hình dạng địa hình đã sinh.
* Nhân vật người chơi đã sở hữu.

---

# 2. Phân tích nguyên nhân hiện tại

## 2.1. Cỏ

File:

```text
src/game/rendering/GrassRing.tsx
```

Các vấn đề:

* Chất lượng cao đang tạo:

```text
192 × 192 = 36.864 lá cỏ
110.592 vertex
```

* Mỗi vertex lấy mẫu `FloatType DataTexture`.
* Texture dùng `LinearFilter`, có nguy cơ không tương thích hoặc hoạt động không ổn định trên một số GPU mobile.
* `frustumCulled={false}` khiến cỏ luôn được xử lý.
* Bounding sphere được đặt cực lớn.
* Terrain texture bị dựng lại mỗi khi danh sách chunk thay đổi.
* Material dùng `DoubleSide`, tăng lượng fragment phải xử lý.
* Preset thấp hiện đặt `decorativeGrass: false`, vì vậy mobile yếu hoàn toàn không có cỏ.

## 2.2. Minimap

File:

```text
src/ui/Minimap.tsx
src/ui/mapRaster.ts
```

Mỗi lần người chơi thay đổi vị trí hoặc góc quay:

* Tạo một canvas tạm mới.
* Tạo `ImageData` mới.
* Duyệt gần 30.000 pixel.
* Mỗi pixel thực hiện bốn lần lấy biome.
* Trong quá trình đó có nhiều phép toán `BigInt`, tạo chuỗi và tra cứu `Map`.

Phần địa hình minimap đang bị vẽ lại dù chỉ có mũi tên người chơi đổi hướng.

Ở mobile, render distance bằng 1 chỉ có vùng 3×3 chunk, trong khi minimap có thể yêu cầu phạm vi lớn hơn nên xuất hiện vùng chưa tải.

## 2.3. Quality Manager

File:

```text
src/game/core/QualityManager.ts
```

Quality Manager hiện:

* Chờ khoảng 4 giây mới đánh giá.
* Có cooldown 10 giây.
* Chỉ đổi cả preset thay vì giảm từng thành phần.
* Phản ứng quá chậm khi thiết bị đột ngột tụt FPS.

## 2.4. Terrain worker

Worker luôn tạo geometry với 32 subdivision, kể cả khi thiết bị đang dùng chất lượng thấp. Điều này làm mobile vẫn phải:

* Tính geometry chất lượng cao.
* Truyền payload lớn.
* Giữ các buffer không cần thiết trong RAM.

---

# 3. Kiến trúc sửa cỏ

## 3.1. Thay `GrassRing` bằng hệ cỏ có ngân sách cố định

Giữ tên component nếu muốn hạn chế thay đổi, nhưng cấu trúc bên trong phải được thay.

Ngân sách đề xuất:

| Thiết bị          |    Mức | Số cỏ tối đa |
| ----------------- | -----: | -----------: |
| Mobile yếu        |    Low |          324 |
| Mobile trung bình | Medium |          784 |
| Mobile mạnh       |   High |        1.600 |
| Desktop Low       |    Low |        1.024 |
| Desktop Medium    | Medium |        3.136 |
| Desktop High      |   High |        6.400 |

Không còn trường hợp 36.864 lá cỏ.

## 3.2. Mobile không được phụ thuộc Float Texture

Tạo hai backend rõ ràng:

```ts
type GrassBackend =
  | "cpu-instanced"
  | "terrain-texture";
```

### `cpu-instanced`

Dùng cho mobile và GPU không hỗ trợ đầy đủ texture float.

* Đọc height, biome và normal từ chunk khi dựng instance.
* Tính vị trí cỏ một lần khi người chơi đổi tile hoặc chunk.
* Gửi trực tiếp `position`, `height`, `random` vào `InstancedBufferGeometry`.
* Không lấy mẫu terrain texture trong mỗi frame.
* Chỉ animation gió được thực hiện trong vertex shader.

### `terrain-texture`

Chỉ dùng cho desktop tương thích tốt.

* Giới hạn tối đa 6.400 lá cỏ.
* Không dựng texture từ toàn bộ render distance.
* Chỉ dùng chunk trong bán kính cần thiết quanh người chơi.
* Không rebuild texture khi một chunk xa được tải.

Không được `try/catch` rồi âm thầm đổi backend. Backend phải được chọn từ capability test và hiển thị trong Performance Panel.

## 3.3. Quy tắc hiển thị cỏ

Cỏ chỉ xuất hiện khi:

```text
Biome: grass, forest hoặc soil
normalY >= ngưỡng cho phép
không nằm dưới nước
nằm trong bán kính cỏ
```

Preset Low vẫn phải có cỏ thưa:

```ts
decorativeGrass: true
grassQuality: "low"
```

Chỉ tắt hoàn toàn cỏ trong chế độ khẩn cấp khi FPS dưới 20 liên tục.

## 3.4. Render

* Thay `DoubleSide` bằng billboard luôn quay mặt về camera và `FrontSide`.
* Không dùng bounding sphere kích thước một triệu.
* Đặt mesh tại vị trí đã snap theo tile của người chơi.
* Cho phép frustum culling bình thường.
* Chỉ cập nhật vị trí vùng cỏ khi người chơi qua ít nhất 1–2 tile.
* Không tạo geometry, material hoặc typed array mới trong `useFrame`.

---

# 4. Kiến trúc minimap mới

## 4.1. Tách thành hai canvas

```text
MinimapTerrainCanvas
MinimapOverlayCanvas
```

### Terrain canvas

Chứa:

* Màu biome.
* Nước, núi, cát, rừng và đất.

Chỉ redraw khi:

* Người chơi bước sang tile mới.
* Có map tile mới tải xong.
* Seed thay đổi.
* Kích thước minimap thay đổi.

### Overlay canvas

Chứa:

* Mũi tên người chơi.
* Slime.
* Target.
* Waypoint.

Có thể redraw 10–15 lần/giây mà không dựng lại terrain.

## 4.2. Không raster từng pixel trong mỗi lần update

Tạo cache:

```ts
type CachedBiomeTile = {
  key: string;
  canvas: HTMLCanvasElement | ImageBitmap;
};
```

Mỗi chunk biome 16×16 được raster đúng một lần. Khi vẽ minimap chỉ dùng:

```ts
ctx.drawImage(cachedTile, ...);
```

Không gọi `getBiome()` bốn lần trên từng pixel nữa.

Có thể thêm viền một cell quanh tile để nội suy mềm mà không tạo seam.

## 4.3. Map tile service dùng chung

Tạo:

```text
src/game/map/MapTileService.ts
```

Nhiệm vụ:

* Quản lý một `map.worker.ts`.
* Cache map tile theo `seed + cx + cy`.
* WorldMap và Minimap dùng chung cache.
* Minimap ưu tiên dữ liệu biome từ chunk đã tải.
* Chỉ yêu cầu worker cho vùng còn thiếu.
* Tối đa một request minimap đang chạy trên mobile.
* Không tranh tài nguyên với chunk khởi tạo ban đầu.

## 4.4. Giới hạn mobile

```text
CSS size: 148–156 px
DPR canvas: tối đa 1
Terrain refresh: tối đa 4 lần/giây
Overlay refresh: tối đa 15 lần/giây
Cache minimap: tối đa 64 map tile
```

Khi tile chưa tải:

* Hiện màu nền bản đồ.
* Hiện vòng loading nhỏ.
* Không để minimap biến mất.
* Không chạy vòng lặp nặng trên main thread để bù dữ liệu thiếu.

---

# 5. Quality Manager mới

## 5.1. Phản ứng theo từng tầng

Không hạ toàn bộ chất lượng cùng lúc.

Thứ tự giảm:

```text
1. Pixel ratio
2. Số lượng cỏ
3. Shadow
4. Hoa và vật trang trí
5. Water quality
6. Terrain detail
7. Render distance
8. Tắt cỏ trong emergency mode
```

Thứ tự tăng phải ngược lại và chậm hơn.

## 5.2. Ngưỡng

Đo theo cửa sổ 2 giây:

```text
Mobile yếu: mục tiêu 30 FPS
Mobile trung bình: mục tiêu 45 FPS
Desktop: mục tiêu 60 FPS
```

Hạ một tầng khi:

```text
FPS < 82% mục tiêu trong hai cửa sổ liên tiếp
hoặc frame max > 80 ms nhiều lần trong một giây
```

Nâng một tầng khi:

```text
FPS >= 95% mục tiêu trong tám cửa sổ liên tiếp
```

Emergency:

```text
FPS < 20 trong 2 giây
```

Khi emergency:

* Tắt shadow.
* DPR tối đa 0.75.
* Cỏ tạm tắt.
* Render distance bằng 1.

Chỉ thoát emergency sau ít nhất 10 giây ổn định.

## 5.3. Cấu hình Canvas

Sửa `GameCanvas.tsx`:

```ts
gl={{
  antialias: !constrainedDevice,
  powerPreference: "high-performance",
  alpha: false,
  stencil: false,
  preserveDrawingBuffer: false,
}}
```

DPR đề xuất:

```text
Mobile Low: 0.75–0.85
Mobile Medium: 1.0
Mobile High: tối đa 1.1
Desktop: tối đa 1.5
```

---

# 6. Tối ưu chunk worker

Sửa:

```text
src/game/workers/workerMessages.ts
src/game/workers/chunk.worker.ts
src/game/world/chunkGenerator.ts
src/game/world/chunkManager.ts
src/game/types.ts
```

Thêm vào request:

```ts
visualDetail: "low" | "medium" | "high";
```

Subdivision:

```text
Low: 8
Medium: 16
High: 32
```

Các mảng logic vẫn giữ nguyên:

```text
heights 17×17
biomes 16×16
walkable 16×16
```

Chỉ geometry hiển thị thay đổi.

Khi quality giảm:

* Chunk đã có có thể tiếp tục dùng index LOD thấp.
* Chunk mới phải sinh theo detail hiện tại.

Khi quality tăng:

* Chỉ refine dần các chunk gần người chơi.
* Không regenerate toàn bộ chunk cùng một lúc.

Mobile chỉ để một request worker đang xử lý. Desktop có thể giữ hai request.

---

# 7. Giảm giá nhân vật còn 1/10

Sửa:

```text
src/game/characters/characterCatalog.ts
```

Giá mới:

```ts
aether: 0
nahida: 60
furina: 80
hu_tao: 90
zhongli: 90
mavuika: 100
columbina: 120
```

Tương ứng:

| Nhân vật  | Giá cũ | Giá mới |
| --------- | -----: | ------: |
| Aether    |      0 |       0 |
| Nahida    |    600 |      60 |
| Furina    |    800 |      80 |
| Hu Tao    |    900 |      90 |
| Zhongli   |    900 |      90 |
| Mavuika   |  1.000 |     100 |
| Columbina |  1.200 |     120 |

Không chia giá tại UI. `purchaseCost` trong catalog phải là nguồn dữ liệu duy nhất để:

* Hiển thị giá.
* Kiểm tra đủ Nguyên Thạch.
* Trừ Nguyên Thạch khi mua.

Không thay đổi ví tiền hoặc hoàn tiền cho nhân vật đã mua trước đó.

---

# 8. Performance Panel

Bổ sung các chỉ số:

```text
Device profile
Runtime quality
Grass backend
Grass blade count
Minimap terrain render time
Minimap overlay render time
Map tile cache size
Chunk worker queue
Current DPR
Emergency mode
```

Không dùng thông báo chung chung như “đã tự tối ưu”. Phải cho biết chính xác thành phần nào vừa bị giảm.

---

# 9. Thứ tự triển khai

## P0 — Đo và sửa nhanh

1. Thêm grass count và minimap render time.
2. Giảm giá nhân vật.
3. Giới hạn cỏ tối đa còn 6.400.
4. Mobile dùng DPR tối đa 1.
5. Tắt antialias trên thiết bị hạn chế.
6. Preset Low vẫn có cỏ thưa.

## P1 — Sửa minimap

1. Tách terrain canvas và overlay canvas.
2. Cache raster theo chunk.
3. Không redraw terrain khi chỉ đổi yaw hoặc offset nhỏ.
4. Dùng chung MapTileService.

## P2 — Sửa hệ cỏ

1. Thêm capability detection.
2. Tạo backend `cpu-instanced`.
3. Bỏ Float Texture khỏi đường render mobile.
4. Snap vùng cỏ theo tile và bật frustum culling.

## P3 — Worker LOD

1. Truyền visual detail vào worker.
2. Sinh geometry đúng subdivision.
3. Refine chunk gần người chơi theo từng đợt.

Không triển khai P3 trước khi P0–P2 đã được đo lại.

---

# 10. Tiêu chí hoàn thành

## Mobile yếu

* FPS trung bình tối thiểu 30 sau khi tải xong.
* Cỏ vẫn xuất hiện ở Low.
* Không có frame trên 100 ms khi di chuyển bình thường.
* Minimap hiện trong vòng 500 ms sau khi thế giới sẵn sàng.
* Minimap không trắng hoặc mất khi xoay camera.

## Mobile trung bình

* FPS trung bình từ 40 trở lên.
* Cỏ tối thiểu 700 blade quanh người chơi.
* Frame time P95 dưới 30 ms.

## Desktop

* FPS trung bình từ 55 trở lên.
* Cỏ tối đa 6.400 blade.
* Frame time P95 dưới 20 ms.
* Minimap terrain redraw dưới 4 ms sau khi cache.

## Tính đúng

* Cỏ không mọc dưới nước hoặc trên vách quá dốc.
* Không xuất hiện seam rõ giữa các chunk.
* Seed và địa hình không thay đổi.
* Mua nhân vật trừ đúng giá mới.
* `npm run build` thành công.
* Không có geometry, material hoặc texture tăng liên tục khi di chuyển.
* Không có fallback âm thầm; mọi chế độ giảm chất lượng phải có trạng thái và lý do rõ ràng.
