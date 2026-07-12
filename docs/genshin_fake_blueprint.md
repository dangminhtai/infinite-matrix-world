# Blueprint hoàn thiện nhận diện và trải nghiệm Genshin Impact Fake

## 1. Mục tiêu

Đổi lớp trình bày của game thành **Genshin Impact Fake**, sửa camera và hướng nhân vật, làm minimap/world map liền mạch không lộ ô hoặc chunk, đồng thời thay toàn bộ vật phẩm ma trận bằng hệ vật phẩm phù hợp với model đang dùng.

Thuật toán matrix, BigInt, recurrence và thế giới procedural vẫn được giữ bên trong code vì đó là nền tảng sinh thế giới. Các từ `Infinite`, `Matrix`, `Ma trận` không còn xuất hiện trong tên sản phẩm, tiêu đề trang, giao diện, vật phẩm hoặc nội dung dành cho người chơi. Không đổi hàng loạt tên class/file lõi nếu việc đó không tạo giá trị hiển thị và có nguy cơ phá save hoặc worker.

## 2. Kết quả mong muốn

- Tên duy nhất người chơi nhìn thấy: `Genshin Impact Fake`.
- Camera khởi đầu đủ gần để Aether và môi trường gần là trọng tâm.
- Khi nhấn tiến, mặt và ngực Aether hướng về hướng di chuyển; lưng quay về camera.
- Minimap và world map không còn lưới ô, viền chunk hoặc răng cưa bậc thang rõ.
- Mũi tên bản đồ trùng hướng di chuyển thật sau khi sửa model.
- Vật phẩm gồm `Nguyên Thạch`, `Mora` và `Dịch Slime`; không còn tinh thể/mảnh/lõi ma trận.
- Save cũ được chuyển đổi, không làm mất vật phẩm người chơi đã nhặt.

## 3. Phase G1 - Camera gần và ổn định

### Thiết kế

- Camera mặc định: `7.5` thay cho `10`.
- Khoảng zoom bình thường: `6` đến `10`.
- Developer có thể kiểm thử đến `14`, nhưng giá trị này không được lưu thành camera khởi đầu cho người chơi thường.
- Pitch khởi đầu khoảng `18-22°`, không dùng góc từ trên cao làm lộ bán kính cỏ và chunk streaming.
- Khi đọc save settings cũ, mọi `cameraDistance > 10` được migrate về `7.5`, không chỉ clamp về `10`.
- Màn loading vẫn giữ đến khi đủ 3 x 3 chunk; camera chỉ fade vào sau khi player model, cỏ và chunk gần sẵn sàng.

### Việc cần làm

- [x] Tạo hằng số chung `DEFAULT_CAMERA_DISTANCE`, `PLAYER_CAMERA_MAX` và `DEVELOPER_CAMERA_MAX`.
- [x] Dùng cùng hằng số trong settings, wheel/touch clamp và state khởi đầu.
- [x] Migrate giá trị camera cũ trong `loadSettings`.
- [x] Thêm fade 280 ms khi bỏ loading overlay để tránh lộ một frame chưa đủ cỏ.
- [x] Chụp kiểm tra desktop 1440 x 900 và mobile 390 x 844.

Điều kiện đạt: ở frame đầu sau loading không nhìn thấy đường biên vùng cỏ hoặc biên vùng chunk; Aether chiếm tỷ lệ hợp lý trong viewport.

## 4. Phase G2 - Sửa mặt trước/sau của Aether

### Nguyên nhân hiện tại

`state.yaw` được tính bằng `atan2(worldDx, worldDz)`, nghĩa là yaw `0` đại diện cho hướng `+Z`. Sau đó toàn bộ player group quay theo yaw này. Tuy nhiên model Aether còn bị xoay thêm:

```ts
PLAYER_MODEL_ROTATION_Y = Math.PI
```

Offset `Math.PI` đang làm mặt trước model ngược với hướng gameplay.

### Thiết kế sửa

- Đặt offset model về `0` nếu kiểm tra trục GLB xác nhận mặt model hướng `+Z`.
- Nếu GLB dùng trục khác, chỉ sửa `PLAYER_MODEL_ROTATION_Y`; không cộng/trừ `Math.PI` vào `state.yaw`, camera hoặc minimap để vá triệu chứng.
- Kiếm sau lưng phải được kiểm tra lại sau khi xoay model; offset kiếm vẫn nằm sau lưng, không xuyên ngực.
- Giữ `playerYaw` là hướng gameplay duy nhất cho minimap, world map và theo dõi mục tiêu.

### Bài kiểm tra hướng

- [x] Mô phỏng giữ W: Aether quay lưng về camera và nhìn theo hướng chạy tới.
- [ ] Nhấn S: Aether quay 180° rồi đi, không moonwalk.
- [ ] Nhấn A/D: mặt Aether trùng vector vận tốc.
- [ ] Chạy chéo đủ bốn hướng.
- [ ] Kiểm tra bơi, leo và mantle không bị quay ngược.
- [x] So sánh mũi tên minimap với hướng chạy Aether trong ảnh runtime.

Điều kiện đạt: sai số giữa forward vector của model và vector vận tốc nhỏ hơn 5° khi đã quay ổn định.

## 5. Phase G3 - Minimap không lưới và khử răng cưa

### Vấn đề hiện tại

Minimap đang vẽ từng cell bằng `fillRect` kích thước `3.2 px` và vẽ thêm `strokeRect` quanh mỗi chunk. World map cũng vẽ từng cell bằng `fillRect` rồi vẽ `strokeRect` theo chunk. Vì vậy cấu trúc ô vuông và đường ghép chunk luôn hiện rõ; bật canvas antialias đơn thuần không thể sửa đường biên này.

### Pipeline raster mới

1. Ghép biome của các chunk/tile nhìn thấy vào một lưới dữ liệu có thêm viền 1 cell từ chunk hàng xóm.
2. Với mỗi pixel đầu ra, lấy bốn biome lân cận và nội suy trọng số theo khoảng cách.
3. Trộn màu trong không gian tuyến tính, không chọn cứng một màu bằng nearest cell.
4. Dùng `smoothstep` cho ranh giới biome để vẫn nhận ra bờ biển/rừng nhưng không có bậc thang.
5. Render terrain vào offscreen canvas ở DPR thật, sau đó `drawImage` sang canvas chính với `imageSmoothingEnabled = true` và `imageSmoothingQuality = "high"`.
6. Vẽ marker quái, waypoint và người chơi ở pass cuối để icon luôn sắc nét, không bị blur cùng terrain.

### Minimap

- Bỏ hoàn toàn `strokeRect` chunk.
- Không vẽ đường lưới cell.
- Dùng vùng lấy mẫu tròn lớn hơn viewport 4-8 px để không hở viền khi camera/player dịch chuyển lẻ.
- Cache nền raster và chỉ dựng lại khi player đổi ô hoặc tập chunk thay đổi; mỗi frame chỉ cập nhật marker/hướng.
- Giữ mũi tên ở tâm và xoay theo `playerYaw`.

### World map

- Mỗi map tile worker tạo thêm raster biome supersample, đề xuất `64 x 64` pixel cho tile logic `16 x 16`.
- Tile có gutter 2-4 px lấy dữ liệu hàng xóm để nội suy qua biên chunk.
- Không vẽ `strokeRect` ở bất kỳ zoom nào.
- Khi zoom gần, thêm texture/noise nhẹ hoặc contour độ cao; không hiện lại pixel logic.
- Khi pan/zoom, tái sử dụng `ImageBitmap` cache thay vì nội suy toàn bản đồ trên main thread mỗi frame.

### Kiểm tra

- [x] Không thấy đường kẻ chunk ở minimap.
- [x] Không thấy đường kẻ chunk ở world map tại mức zoom mặc định.
- [x] Nền biome được nội suy và blur riêng; marker render ở pass sắc nét.
- [x] Không còn `strokeRect` cell/chunk trong minimap và world map.
- [ ] Pan/zoom world map vẫn giữ FPS UI ổn định.
- [x] Marker quái và player vẫn sắc nét trong ảnh DPR 1 và DPR 2.

## 6. Phase G4 - Đổi nhận diện thành Genshin Impact Fake

### Một nguồn tên duy nhất

Tạo `src/config/branding.ts`:

```ts
export const PRODUCT_NAME = "Genshin Impact Fake";
export const PRODUCT_SHORT_NAME = "Genshin Fake";
```

Không tiếp tục hard-code tên sản phẩm ở nhiều component.

### Phạm vi đổi tên hiển thị

- [x] `index.html`: `<title>Genshin Impact Fake</title>`.
- [x] Settings dùng branding từ một nguồn cấu hình.
- [x] Package metadata đổi thành `genshin-impact-fake`.
- [x] README title, mô tả và hướng dẫn chạy.
- [x] World map title giữ là `Bản đồ thế giới`, không dùng từ vô hạn.
- [x] Seed editor đổi thành `Seed thế giới`.
- [x] Bỏ giải thích BigInt matrix khỏi UI người chơi; chỉ giữ trong Developer/docs kỹ thuật.

### Phần không đổi vội

- Class `HybridMatrixWorld`, module `matrix.ts`, recurrence và thuật toán seed.
- Prefix localStorage cũ `ihmw.*` trong giai đoạn migration.
- Tên repository/URL GitHub nếu chưa đổi remote.

Các tên kỹ thuật này không hiển thị với người chơi và đổi ngay sẽ tạo một refactor lớn không liên quan trải nghiệm. Có thể migrate ở phase riêng sau khi save và deployment ổn định.

Lưu ý phát hành: tên và asset liên quan Genshin/Aether/Nguyên Thạch cần được xem là bản fan/parody không chính thức; trước khi quảng bá hoặc thương mại hóa phải kiểm tra quyền sử dụng asset và nhãn hiệu.

## 7. Phase G5 - Chuẩn hóa vật phẩm và migrate save

### Danh mục vật phẩm

| ID mới | Tên hiển thị | Nguồn |
| --- | --- | --- |
| `primogem` | Nguyên Thạch | Vật phẩm model Primogem ngoài thế giới |
| `mora` | Mora | Rương |
| `slime_condensate` | Dịch Slime | Slime bị hạ |

### Reward đề xuất

- Nhặt Primogem: `+1 Nguyên Thạch`.
- Mở rương: `+500 Mora`.
- Hạ slime: `+1 Dịch Slime`.

### Migration save cũ

Trong `loadWorldSave`, migrate một lần trước khi trả inventory:

- `matrix_crystal` -> cộng sang `primogem` theo tỷ lệ `1:1`.
- `matrix_shard` -> cộng sang `mora` theo tỷ lệ `1:100`.
- `echo_core` -> cộng sang `slime_condensate` theo tỷ lệ `1:1`.
- Xóa ID cũ sau khi cộng để tránh hiển thị trùng.
- Migration phải idempotent: load nhiều lần không được cộng lại.

### Thay đổi gameplay/UI

- [x] Interaction collectible: `Nhặt Nguyên Thạch`.
- [x] Notification collectible: `Đã nhận 1 Nguyên Thạch`.
- [x] Notification chest: `Rương: +500 Mora`.
- [x] Notification slime: `Đã nhận 1 Dịch Slime`.
- [x] Inventory dùng metadata chung gồm tên, màu và thứ tự.
- [x] Fallback collectible đổi thành tetrahedron tím, không còn tinh thể xanh cũ.
- [x] Self-test migration với save cũ và kiểm tra idempotent.

## 8. Thứ tự triển khai

### Phase 1 - Lỗi trải nghiệm trực tiếp

- [x] G1 Camera.
- [x] G2 Hướng Aether cho di chuyển W; các trạng thái đặc biệt còn kiểm tra thêm.

### Phase 2 - Bản đồ

- [x] G3 Minimap raster mượt.
- [x] G3 World map raster nội suy có ngân sách cố định.

### Phase 3 - Nhận diện và dữ liệu

- [x] G4 Branding.
- [x] G5 Item IDs, reward và migration save.

### Phase 4 - Kiểm chứng

- [x] Build TypeScript/Vite.
- [x] Chạy toàn bộ self-test hiện tại.
- [x] Thêm self-test migration inventory.
- [x] Chụp game desktop/mobile.
- [ ] Chụp minimap và world map ở zoom min/mid/max.
- [x] Kiểm tra không còn chuỗi user-facing `Infinite`, `Matrix`, `Ma trận`, `Tinh thể ma trận`, `Mảnh ma trận`, `Lõi Echo`.

## 9. Tiêu chí hoàn thành bắt buộc

Không đánh dấu blueprint hoàn thành nếu còn một trong các lỗi sau:

- Camera khởi đầu vẫn nhìn thấy rìa vùng cỏ hoặc vùng streaming.
- Aether quay lưng về hướng di chuyển.
- Minimap/world map còn lưới, viền chunk hoặc seam giữa tile.
- Mũi tên bản đồ ngược với hướng nhân vật.
- Save cũ mất vật phẩm hoặc cộng migration nhiều lần.
- Giao diện người chơi còn tên Infinite/Matrix hoặc vật phẩm ma trận.
- Build/self-test chưa chạy hoặc ảnh desktop/mobile chưa được kiểm tra.
