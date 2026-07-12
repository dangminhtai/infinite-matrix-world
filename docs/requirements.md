Bạn là một senior game developer chuyên React, TypeScript, Three.js và procedural generation.

Hãy xây dựng một game web 3D hoàn chỉnh, có thể chạy và chơi ngay, dựa trên thuật toán “Infinite Hybrid Matrix World” được mô tả bên dưới.

Không chỉ viết demo hoặc đoạn code minh họa. Hãy tạo một project chạy được thực tế, có giao diện, nhân vật, camera, điều khiển cảm ứng, chunk streaming, tối ưu RAM/GPU và kiểm thử tính xác định của thế giới.

# 1. Mục tiêu sản phẩm

Tạo một game khám phá thế giới 3D gần như vô hạn trên trình duyệt.

Người chơi điều khiển một nhân vật đi qua:

- Đồng cỏ.
- Rừng.
- Bãi đất.
- Hồ và biển.
- Núi.
- Hoa.
- Đá và cây trang trí.

Thế giới không được tạo sẵn toàn bộ.

Người chơi đi đến đâu thì sinh chunk đến đó. Chunk quá xa phải bị loại khỏi RAM và GPU. Khi quay lại, địa hình phải được tái tạo giống hệt từ seed mà không cần lưu toàn bộ map.

Không được có world border do kiểu dữ liệu `number`.

Tọa độ thế giới, tọa độ chunk và các phép toán chính phải sử dụng JavaScript `BigInt`.

# 2. Công nghệ bắt buộc

Sử dụng:

- React.
- TypeScript.
- Vite.
- File giao diện `.tsx`.
- Three.js.
- `@react-three/fiber`.
- `@react-three/drei` khi thực sự cần thiết.
- Web Worker để sinh chunk ngoài main thread.
- IndexedDB hoặc localStorage chỉ cho cấu hình và các thay đổi của người chơi.

Không sử dụng:

- Unity.
- Babylon.js.
- Phaser.
- Noise library bên ngoài.
- Physics engine bên ngoài.
- Thư viện tạo procedural terrain.
- Redux hoặc state library nếu React state thông thường đủ dùng.

Không tạo một React component cho mỗi tile. Điều đó sẽ gây giảm hiệu năng.

# 3. Phong cách hình ảnh

Thiết kế theo phong cách low-poly, sáng, dễ nhìn, giống một game khám phá độc lập.

Yêu cầu:

- Camera góc nhìn thứ ba từ trên chéo xuống.
- Ánh sáng mặt trời có bóng đổ.
- Ambient light vừa phải.
- Sương mù che vùng xa.
- Nước có độ trong và chuyển động nhẹ.
- Cây là mô hình low-poly được dựng bằng primitive geometry.
- Núi có địa hình cao, màu đá.
- Cỏ, đất, cát và đá có màu phân biệt rõ.
- Nhân vật có thể là một mô hình low-poly tự dựng bằng capsule, box và sphere.
- Nhân vật có animation đi bộ đơn giản bằng chuyển động chân tay.
- Không phụ thuộc vào model 3D tải từ Internet.

Ưu tiên hình ảnh rõ ràng và hiệu năng thay vì hiệu ứng quá nặng.

# 4. Điều khiển

Game phải chơi được mà không cần bàn phím.

## Trên điện thoại

- Nửa trái màn hình có floating virtual joystick.
- Kéo joystick để nhân vật di chuyển theo hướng camera.
- Vuốt nửa phải màn hình để xoay camera.
- Chụm hai ngón để zoom.
- Nút nhỏ để đặt lại camera.
- Giao diện không được chặn thao tác cảm ứng của canvas.

## Trên máy tính

- Click chuột trái xuống mặt đất để nhân vật tự đi về điểm đó.
- Giữ chuột phải và kéo để xoay camera.
- Con lăn chuột để zoom.
- Có thể kéo joystick bằng chuột nếu muốn.
- WASD chỉ là điều khiển phụ, không được là cách chơi bắt buộc.

Sử dụng Three.js Raycaster để xác định điểm người dùng click trên địa hình.

Không cần pathfinding phức tạp ở phiên bản đầu. Nhân vật có thể đi theo đường thẳng và dừng lại nếu gặp nước, núi quá dốc hoặc ô không thể đi qua.

# 5. Thuật toán thế giới

Sử dụng trường hữu hạn:

```ts
const P = (1n << 61n) - 1n;
```

Seed mặc định:

```ts
const DEFAULT_SEED = [
  [1n, 3n],
  [2n, 4n],
] as const;
```

Hệ thống phải hỗ trợ seed là ma trận vuông `n × n`, với `n >= 2`.

Các phép toán ma trận phải sử dụng `BigInt`:

- Chuẩn hóa modulo.
- Nhân ma trận.
- Ma trận đơn vị.
- Lũy thừa nhanh.
- Lũy thừa số mũ âm.
- Nghịch đảo Gauss–Jordan trên trường `F_p`.
- Modular exponentiation.
- Sinh hai ma trận khả nghịch `A` và `B` từ seed.

Địa chỉ chunk:

```text
C(cx, cy) = A^cx × S × B^cy mod P
```

Trong đó:

- `S` là seed matrix.
- `cx`, `cy` là `BigInt`.
- `A` và `B` luôn khả nghịch.

Di chuyển giữa các chunk liền kề:

```text
East:  C(cx + 1, cy) = A × C(cx, cy)
West:  C(cx - 1, cy) = A⁻¹ × C(cx, cy)
South: C(cx, cy + 1) = C(cx, cy) × B
North: C(cx, cy - 1) = C(cx, cy) × B⁻¹
```

Chỉ dùng `matPow` khi:

- Teleport đến tọa độ xa.
- Không có chunk liền kề trong cache.
- Khởi tạo một vùng hoàn toàn mới.

Không được tuần tự chạy recurrence từ gốc đến vị trí hiện tại.

# 6. Recurrence khả nghịch

Port chính xác recurrence sau sang TypeScript `BigInt`.

Với:

```text
v = (a₁, ..., aₙ₋₁, t)
u = (u₁, ..., uₙ)
```

Tạo:

```text
w₁ = t·u₁ - Σ(aⱼ·uⱼ₊₁) mod P
wᵢ = t·uᵢ - aᵢ₋₁·w₁ mod P
```

Khi `t = 0`, ánh xạ xác định sang `1` để biến đổi nội bộ luôn khả nghịch.

Phải có hàm ngược khôi phục `u` từ `v` và `w`.

Với trường hợp 2 chiều:

```text
v_old = (1, 2)
v_now = (3, 4)
```

Kết quả bắt buộc là:

```text
v_next = (P - 2, 14)
```

Và phép biến đổi ngược phải khôi phục lại `(1, 2)`.

# 7. Trộn tọa độ vô hạn

Không được chỉ dùng:

```ts
x % P;
y % P;
```

vì sẽ tạo chu kỳ đơn giản.

Phải trộn toàn bộ các limb 61-bit của tọa độ `BigInt`.

Các bước:

1. Zigzag encode số nguyên có dấu sang số nguyên không âm.
2. Chia tọa độ thành các limb 61-bit.
3. Trộn lần lượt từng limb.
4. Trộn số thứ tự limb.
5. Trộn thêm seed, chunk state và salt.

Ví dụ kiểu dữ liệu:

```ts
type WorldCoordinate = bigint;
type ChunkCoordinate = bigint;
```

Phải hoạt động với tọa độ như:

```ts
10n ** 100n - 10n ** 90n;
```

Không được chuyển toàn bộ tọa độ sang `number`.

Chỉ chuyển kết quả ngẫu nhiên đã rút còn tối đa 53 bit sang `number`.

Ví dụ:

```ts
const RANDOM_MASK_53 = (1n << 53n) - 1n;
const value = Number(randomBigInt & RANDOM_MASK_53) / 2 ** 53;
```

# 8. Noise và biome

Không sử dụng thư viện noise.

Tự triển khai deterministic value noise:

- Sample bốn điểm lattice.
- Smoothstep.
- Bilinear interpolation.
- Nhiều octave có scale khác nhau.

Ví dụ độ cao:

```text
height =
    0.52 × noise(scale 96)
  + 0.30 × noise(scale 37)
  + 0.18 × noise(scale 13)
```

Độ ẩm:

```text
moisture =
    0.72 × noise(scale 71)
  + 0.28 × noise(scale 19)
```

Dùng salt riêng cho:

- Height.
- Moisture.
- Temperature.
- Tree placement.
- Rock placement.
- Flower placement.
- Water animation phase.

Biome gợi ý:

```text
height < 0.29              → nước
height > 0.80              → núi
moisture cao               → rừng
moisture thấp              → đất khô
height gần mực nước        → bờ cát
còn lại                    → đồng cỏ
```

Địa hình phải liên tục qua biên chunk.

Mọi sample phải sử dụng tọa độ thế giới, không sử dụng local coordinate độc lập của chunk.

# 9. Chunk và địa hình 3D

Thiết lập ban đầu:

```ts
const CHUNK_SIZE = 16;
const ACTIVE_RADIUS = 3;
```

Mỗi chunk phải chứa:

- Height map.
- Biome map.
- Walkability map.
- Terrain mesh.
- Water mesh nếu cần.
- Danh sách instance cây.
- Danh sách instance đá.
- Danh sách hoa hoặc cỏ trang trí.
- Hash xác minh tính xác định.

Không tạo 256 box mesh riêng cho một chunk.

Ưu tiên:

- Một `BufferGeometry` cho terrain chunk.
- Vertex color để thể hiện biome.
- `InstancedMesh` dùng chung cho cây.
- `InstancedMesh` dùng chung cho đá.
- Các đối tượng trang trí phải được gom theo loại.

Các vertex ở biên chunk phải lấy cùng sample world coordinate để không có khe hở.

Khi chunk bị unload:

- Remove khỏi scene.
- Dispose geometry không còn sử dụng.
- Dispose material chỉ khi material không dùng chung.
- Xóa dữ liệu chunk khỏi cache.
- Không để listener hoặc reference cũ gây memory leak.

# 10. Chunk streaming

Chunk Manager phải:

1. Xác định chunk hiện tại của người chơi.
2. Tạo danh sách chunk trong bán kính hoạt động.
3. Ưu tiên chunk gần người chơi.
4. Gửi yêu cầu sinh chunk cho Web Worker.
5. Không gửi trùng yêu cầu đang chạy.
6. Thêm chunk hoàn thành vào scene.
7. Hủy chunk quá xa.
8. Giữ cache có giới hạn cố định.

Phải có ít nhất ba loại cache:

```text
Chunk state cache
Generated chunk data cache
Rendered chunk cache
```

Giới hạn gợi ý:

```ts
const MAX_CHUNK_STATES = 256;
const MAX_GENERATED_CHUNKS = 96;
const MAX_RENDERED_CHUNKS = 64;
```

Sử dụng LRU thực sự, không chỉ xóa phần tử đầu mảng một cách tùy tiện.

Khi di chuyển bình thường, ưu tiên cập nhật chunk state từ chunk láng giềng bằng `A`, `A⁻¹`, `B`, `B⁻¹`.

# 11. Web Worker

Toàn bộ phần nặng phải nằm trong worker:

- BigInt matrix operations.
- `matPow`.
- `matInv`.
- Chunk state.
- Coordinate folding.
- Noise sampling.
- Height map.
- Biome.
- Tree và rock placement.

Main thread chỉ làm:

- Input.
- Camera.
- Player movement.
- Render.
- Nhận kết quả chunk.

Tin nhắn worker phải có request ID.

Ví dụ:

```ts
type GenerateChunkRequest = {
  type: "generateChunk";
  requestId: number;
  cx: string;
  cy: string;
  seed: string[][];
};

type GenerateChunkResponse = {
  type: "chunkGenerated";
  requestId: number;
  cx: string;
  cy: string;
  payload: ChunkPayload;
};
```

`BigInt` có thể truyền bằng structured clone, nhưng nên có lớp serialize rõ ràng để dễ debug và lưu trữ.

Không để worker lỗi rồi âm thầm fallback sang main thread.

Mọi lỗi phải được gửi về UI và log đầy đủ.

# 12. Nhân vật và va chạm

Nhân vật:

- Có vị trí chính xác cục bộ bằng `number`.
- Có tọa độ thế giới/chunk riêng bằng `BigInt`.
- Khi vượt khỏi giới hạn local origin, thực hiện floating-origin shift.

Không đặt nhân vật trực tiếp tại tọa độ Three.js cực lớn.

Dùng floating origin:

```text
BigInt world coordinate
        +
small local floating-point offset
```

Khi local position vượt ngưỡng, dịch toàn bộ scene về gần `(0, 0, 0)` và cập nhật world origin bằng `BigInt`.

Điều này bắt buộc để tránh mất độ chính xác của `number` trong Three.js.

Nhân vật phải:

- Đi theo hướng joystick hoặc điểm click.
- Xoay mượt theo hướng chuyển động.
- Bám độ cao terrain.
- Không đi vào nước sâu.
- Không leo mặt dốc vượt quá giới hạn.
- Dừng lại khi chunk đích chưa tải.
- Có tốc độ chạy độc lập frame rate bằng `deltaTime`.

Không cần physics engine.

# 13. Camera

Camera góc nhìn thứ ba:

- Theo sau nhân vật bằng damping.
- Có yaw và pitch.
- Có giới hạn pitch.
- Có zoom tối thiểu và tối đa.
- Vuốt phải hoặc kéo chuột phải để xoay.
- Không giật khi floating origin thay đổi.
- Không xuyên xuống dưới terrain.
- Nút reset camera đưa về góc mặc định.

Camera phải hoạt động tốt trên màn hình cảm ứng.

# 14. Giao diện

HUD tối giản, không che game.

Hiển thị:

- Tọa độ thế giới dạng chuỗi.
- Tọa độ chunk.
- Số chunk đang render.
- Số chunk đang cache.
- Trạng thái worker.
- FPS trong chế độ debug.
- Seed matrix hiện tại.

Có các nút:

- Mở bảng Seed.
- Teleport.
- Clear cache.
- Reset camera.
- Bật/tắt debug.
- Bật/tắt âm thanh nếu có.

## Seed editor

Cho phép:

- Chọn kích thước ma trận từ 2 đến 4.
- Chỉnh từng phần tử.
- Chấp nhận số nguyên âm và số rất lớn.
- Validate dữ liệu.
- Áp dụng seed mới.
- Reset toàn bộ world khi seed đổi.
- Lưu seed trong localStorage.

## Teleport

Cho nhập tọa độ dưới dạng chuỗi:

```text
100000000000000000000000000000
-99999999999999999999999999999
```

Không dùng `parseInt` hoặc `Number`.

Sử dụng:

```ts
BigInt(input.trim());
```

Teleport phải hiển thị loading rõ ràng trong lúc worker tính `matPow`.

# 15. Floating origin và tọa độ

Three.js không hỗ trợ tọa độ vô hạn do sử dụng floating-point.

Phải tách:

```ts
type WorldPosition = {
  tileX: bigint;
  tileY: bigint;
  offsetX: number;
  offsetY: number;
};
```

Hoặc một cấu trúc tương đương.

Không bao giờ chuyển tọa độ thế giới rất lớn thành `Number`.

Mọi mesh trong scene chỉ được đặt tương đối so với origin chunk hiện tại.

Khi origin thay đổi:

- Terrain hiện có phải dịch đồng bộ.
- Camera giữ nguyên cảm giác.
- Nhân vật không giật.
- Tọa độ HUD vẫn chính xác.

# 16. Thay đổi của người chơi

Thiết kế sẵn một lớp delta storage.

Không lưu toàn bộ chunk.

Chỉ lưu những thay đổi như:

```text
cây đã bị chặt
đá đã bị phá
vật thể đã đặt
ô terrain đã sửa
```

Khóa lưu:

```text
seedHash + chunkX + chunkY + localCell
```

Dữ liệu lưu bằng IndexedDB.

Khi tải chunk:

```text
Sinh chunk gốc từ seed
→ đọc delta
→ áp dụng delta
→ render
```

Phiên bản đầu có thể chỉ cần cho phép click một cây để chặt thử và chứng minh delta được lưu đúng.

# 17. Cấu trúc project

Tổ chức mã nguồn rõ ràng, ví dụ:

```text
src/
├── main.tsx
├── App.tsx
├── styles.css
├── game/
│   ├── GameCanvas.tsx
│   ├── constants.ts
│   ├── types.ts
│   ├── world/
│   │   ├── fieldMath.ts
│   │   ├── matrix.ts
│   │   ├── recurrence.ts
│   │   ├── coordinateHash.ts
│   │   ├── noise.ts
│   │   ├── hybridWorld.ts
│   │   ├── chunkGenerator.ts
│   │   ├── chunkManager.ts
│   │   ├── lruCache.ts
│   │   └── selfTest.ts
│   ├── workers/
│   │   ├── chunk.worker.ts
│   │   └── workerMessages.ts
│   ├── rendering/
│   │   ├── WorldRenderer.tsx
│   │   ├── TerrainChunk.tsx
│   │   ├── Water.tsx
│   │   ├── TreeInstances.tsx
│   │   ├── RockInstances.tsx
│   │   └── Lighting.tsx
│   ├── player/
│   │   ├── Player.tsx
│   │   ├── PlayerController.ts
│   │   ├── movement.ts
│   │   └── collision.ts
│   ├── camera/
│   │   └── ThirdPersonCamera.tsx
│   ├── controls/
│   │   ├── VirtualJoystick.tsx
│   │   ├── PointerControls.tsx
│   │   └── TouchCameraControls.tsx
│   ├── persistence/
│   │   └── worldDeltaStore.ts
│   └── debug/
│       ├── DebugOverlay.tsx
│       └── WorldDebugHelpers.tsx
└── ui/
    ├── HUD.tsx
    ├── SeedEditor.tsx
    ├── TeleportDialog.tsx
    └── LoadingOverlay.tsx
```

Không bắt buộc giống hoàn toàn, nhưng phải giữ separation of concerns.

# 18. Quy tắc code

- TypeScript strict.
- Không dùng `any` trừ trường hợp có lý do rõ ràng.
- Không dùng mutable global state cho world.
- Không copy-paste cùng một thuật toán ở worker và main thread.
- Phần toán học phải nằm trong module dùng chung.
- Không nuốt exception.
- Không tạo fallback âm thầm.
- Nếu một chunk lỗi, hiển thị lỗi cùng tọa độ chunk và stack trace trong debug overlay.
- Không ghi log cho từng tile.
- Không tạo allocation lớn trong mỗi frame.
- Không cập nhật React state 60 lần mỗi giây nếu có thể dùng ref.
- Không dùng `.map()` tạo hàng nghìn component mesh.
- Tất cả listener phải được cleanup.
- Tất cả animation phải dùng `deltaTime`.
- Tất cả geometry dùng lại phải được memoize hoặc share.
- Không tối ưu giả định trước khi đo, nhưng phải tránh kiến trúc chắc chắn chậm.

# 19. Kiểm thử bắt buộc

Tạo `selfTest()` chạy trong development.

## Recurrence

```text
applyTransform((3,4),(1,2)) = (P-2,14)
invertTransform((3,4),(P-2,14)) = (1,2)
```

## Path independence

```text
A × (S × B) = (A × S) × B
```

## Neighbor movement

Kết quả cập nhật bằng láng giềng phải giống kết quả tính trực tiếp bằng `matPow`.

Kiểm tra đủ bốn hướng.

## Regeneration

Sinh hash của các chunk:

```text
(0,0)
(-17,31)
(10^80 + 123, -(10^75) + 7)
```

Sau đó:

- Xóa toàn bộ cache.
- Sinh lại.
- Hash phải giống hoàn toàn.

## Chunk seam

Hai chunk cạnh nhau phải có cùng height sample trên đường biên.

## Cache bound

Đi qua nhiều chunk nhưng số phần tử cache không vượt giới hạn.

## Floating origin

Di chuyển qua nhiều lần shift origin nhưng tọa độ thế giới vẫn chính xác.

## Worker determinism

Cùng seed và cùng chunk gửi nhiều lần phải trả cùng hash.

# 20. Debug mode

Debug overlay phải có thể hiển thị:

- Viền chunk.
- Chunk coordinate.
- Local origin.
- Player world coordinate.
- Player local coordinate.
- Chunk loading queue.
- Cache hit/miss.
- Worker duration.
- Số triangle.
- Số draw call.
- FPS.
- Terrain hash của chunk hiện tại.

Có nút “Clear caches and regenerate current area”.

Sau khi clear cache, cảnh quan quanh người chơi không được thay đổi.

# 21. Performance mục tiêu

Mục tiêu ban đầu:

- 60 FPS trên laptop phổ thông.
- Ít nhất 30 FPS trên điện thoại tầm trung.
- Không đóng băng UI khi teleport xa.
- Không tăng RAM liên tục khi người chơi đi mãi.
- Draw call thấp nhờ instancing và geometry theo chunk.
- Không rebuild tất cả chunk khi nhân vật chỉ di chuyển trong cùng chunk.

Giới hạn render gợi ý:

```text
7 × 7 chunk quanh người chơi
49 terrain meshes tối đa
cây và đá dùng InstancedMesh
```

Có thể giảm bán kính trên thiết bị yếu.

# 22. Trình tự triển khai

Thực hiện theo thứ tự sau:

## Giai đoạn 1: Toán học

- Port thuật toán BigInt.
- Viết self-test.
- Xác minh recurrence và chunk addressing.

Không làm giao diện trước khi self-test pass.

## Giai đoạn 2: Chunk worker

- Sinh height map và biome.
- Sinh hash.
- Kiểm tra regeneration.
- Kiểm tra seam.

## Giai đoạn 3: Render

- Terrain mesh.
- Vertex color.
- Water.
- Trees và rocks bằng instancing.

## Giai đoạn 4: Player

- Player movement.
- Terrain height following.
- Collision.
- Camera.

## Giai đoạn 5: Touch control

- Floating joystick.
- Swipe camera.
- Pinch zoom.
- Click-to-move.

## Giai đoạn 6: Streaming

- Chunk loading queue.
- LRU cache.
- Unload và dispose.
- Floating origin.

## Giai đoạn 7: UI và lưu delta

- Seed editor.
- Teleport.
- Debug.
- IndexedDB delta.

Ở cuối mỗi giai đoạn, chạy kiểm thử và sửa lỗi trước khi tiếp tục.

# 23. Kết quả đầu ra

Hãy cung cấp:

1. Toàn bộ source code chạy được.
2. `package.json`.
3. Cấu hình Vite.
4. README tiếng Việt.
5. Lệnh cài đặt và chạy.
6. Giải thích ngắn kiến trúc.
7. Danh sách kiểm thử đã pass.
8. Không để TODO giả hoặc hàm rỗng.
9. Không chỉ đưa pseudocode.
10. Không dừng lại ở màn hình terrain tĩnh.

Lệnh mong muốn:

```bash
npm install
npm run dev
```

Sau khi chạy, người dùng phải có thể:

- Nhìn thấy thế giới 3D.
- Điều khiển nhân vật bằng chuột hoặc cảm ứng.
- Đi liên tục qua các chunk.
- Quay lại vùng cũ và thấy địa hình giống hệt.
- Teleport tới tọa độ BigInt cực lớn.
- Clear cache rồi tái sinh cảnh giống hệt.
- Thay seed matrix và nhận một thế giới mới.

# 24. Thuật toán Python tham chiếu

Dùng đoạn Python “Infinite Hybrid Matrix World” được cung cấp bởi người dùng làm nguồn sự thật cho:

- Công thức trường hữu hạn.
- Matrix multiplication.
- Matrix inversion.
- Matrix exponentiation.
- Derive axis matrices.
- Reversible recurrence.
- BigInt coordinate folding.
- Multi-scale value noise.
- Biome classification.
- Cache behavior.

Không được đơn giản hóa thuật toán thành `Math.random()`, hash chuỗi thông thường hoặc noise library.

Khi port sang TypeScript, phải giữ nguyên tính xác định và ý nghĩa toán học của thuật toán.

Trước khi bắt đầu code, hãy đọc toàn bộ yêu cầu, lập kế hoạch ngắn và xác định rõ module nào chạy trong main thread, module nào chạy trong Web Worker. Sau đó triển khai trực tiếp, không chỉ mô tả.

# 25. Yêu cầu bổ sung từ người dùng

## REQ001 - Đọc và hiểu dự án Genshin Impact Fake

Mô tả:
- Khảo sát toàn bộ mã nguồn của dự án (React + Vite + TypeScript + Three.js).
- Tìm hiểu các cơ chế lõi: toán học trường hữu hạn (Field Math), ma trận (Matrix), thuật toán lặp (Recurrence), băm tọa độ (Coordinate Hash), nhiễu trị (Value Noise), và kiến trúc thế giới lai (Hybrid Matrix World).
- Phân tích cơ chế sinh địa hình (Chunk Generator, Web Worker), quản lý tải chunk (Chunk Manager, LRU Cache), dời gốc tọa độ (Floating Origin).
- Phân tích cơ chế di chuyển của nhân vật (Player, Climbing, Swimming, Collision), góc nhìn camera (Third Person Camera), hệ thống tương tác và chiến đấu (Entity System, Slime, Chest, Collectible).
- Xác minh tính khả thi của việc xây dựng (Build project thành công).

Tiêu chí hoàn thành:
- Liệt kê cấu trúc thư mục và vai trò các file chính trong dự án.
- Giải thích chi tiết các thuật toán lõi và cơ chế hoạt động của game.
- Build thành công dự án (đã kiểm chứng qua lệnh npm run build).
- Tạo tài liệu học tập/learned (`docs/learned.md`), danh sách lỗi (`docs/issue_lists.md`), và các bước tiếp theo (`docs/next_step.md`).

## REQ002 - Tối ưu hóa hiệu năng (minimap, cỏ) và giảm giá nhân vật

Mô tả:
- Khắc phục hiện tượng drop FPS và lag khi tải cỏ bằng cách tối ưu hóa cơ chế tạo dữ liệu texture địa hình (`DataTexture`) trong `GrassRing`. Thay vì tạo mới texture và mảng `Float32Array` liên tục mỗi khi nạp chunk mới, cần tái sử dụng đối tượng texture và ghi đè dữ liệu trực tiếp khi kích thước không đổi.
- Khắc phục hiện tượng minimap tải không nổi do render lại mượt mỗi frame trên Main Thread. Triển khai cơ chế cache canvas nền raster cho minimap. Chỉ thực hiện vẽ lại nền raster khi người chơi đi sang ô gạch nguyên mới hoặc khi danh sách chunk thay đổi. Tại mỗi frame di chuyển thông thường, chỉ cần sử dụng `drawImage` để di chuyển (pan) canvas nền đã cache theo độ dời `offsetX/offsetY` và vẽ các marker/hướng.
- Giảm giá mua các nhân vật trong catalog xuống còn 1/10 so với ban đầu (ví dụ: Nahida từ 600 còn 60, Furina từ 800 còn 80, Hu Tao từ 900 còn 90...).

Tiêu chí hoàn thành:
- Tệp `GrassRing.tsx` được tối ưu hóa để tái sử dụng `DataTexture` khi kích thước không đổi, giảm thiểu việc cấp phát bộ nhớ động trên GPU và CPU.
- Tệp `Minimap.tsx` được thiết kế lại để cache canvas offscreen nền raster, loại bỏ việc chạy vòng lặp pixel mượt `drawSmoothBiomeLayer` ở mỗi frame di chuyển.
- Tệp `characterCatalog.ts` được chỉnh sửa giảm giá tất cả các nhân vật xuống còn 1/10.
- Dự án build thành công và chạy mượt mà trên cả trình duyệt máy tính và di động.


