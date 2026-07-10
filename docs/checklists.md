# Checklist cải thiện Infinite Matrix World

Checklist này dùng để nâng game hiện tại từ prototype chạy được thành một bản khám phá 3D mượt, đẹp và dễ kiểm chứng hơn. Nguồn tham khảo chính là repo `references/brunosimon-infinite-world`, nhưng không copy nguyên vì project của mình có yêu cầu riêng: BigInt coordinate, deterministic seed matrix, không dùng noise library ngoài và có React UI.

## 1. Giữ chuẩn nền trước khi tối ưu

- [x] `npm run build` pass sau mỗi nhóm thay đổi.
- [ ] `selfTest()` vẫn pass: recurrence, neighbor movement, regeneration, seam, cache bound.
- [ ] Teleport tới tọa độ BigInt rất lớn vẫn không treo UI.
- [ ] Clear cache rồi regenerate vùng hiện tại cho cùng hash/biome/height.
- [x] Không đưa `references/`, `dist/`, `node_modules/`, `*.tsbuildinfo` lên Git.
- [x] Không thêm noise library ngoài nếu chưa đổi yêu cầu gốc.

## 2. Terrain đẹp hơn nhưng vẫn deterministic

- [x] Tách `logic grid` và `visual grid`.
  - Logic vẫn có thể dùng `CHUNK_SIZE = 16`.
  - Visual terrain dùng subdivision cao hơn, ví dụ 32 hoặc 40.
- [x] Worker sinh thêm vertex mịn cho terrain thay vì chỉ 17 x 17 điểm.
- [x] Height sample vẫn dùng world coordinate, không dùng local coordinate độc lập.
- [ ] Biên chunk vẫn sample cùng tọa độ để không hở seam.
- [x] Thêm normal chính xác từ height lân cận thay vì chỉ `computeVertexNormals()` trên mesh thấp.
- [x] Thêm terrain skirt quanh mép chunk để che khe nếu sau này có LOD.
- [ ] Giữ hash deterministic sau khi tăng subdivision.

## 3. Tối ưu payload từ Web Worker

- [x] Đổi `heights: number[]` sang `Float32Array`.
- [x] Đổi `walkable: boolean[]` sang `Uint8Array`.
- [x] Đổi biome string array sang `Uint8Array` enum:
  - `0 = water`
  - `1 = mountain`
  - `2 = forest`
  - `3 = soil`
  - `4 = sand`
  - `5 = grass`
- [ ] Tách payload render và payload debug.
- [x] Dùng transferable object khi `postMessage` để giảm copy bộ nhớ.
- [ ] Không gửi object decor quá nhiều nếu có thể gom thành typed arrays.
- [x] Performance panel hiển thị byte payload trung bình mỗi chunk.

## 4. LOD và streaming giống game hơn

- [ ] Thiết kế LOD theo khoảng cách:
  - Gần player: terrain mịn.
  - Trung bình: terrain vừa.
  - Xa: terrain thưa.
- [ ] Không rebuild toàn bộ chunk khi player chỉ di chuyển trong cùng chunk.
- [ ] Ưu tiên queue chunk theo khoảng cách camera/player.
- [ ] Có giới hạn số request worker đang chạy.
- [x] Nếu player teleport xa, bỏ qua response cũ không thuộc vùng chunk đang cần render.
- [ ] Cache phân tầng:
  - state matrix cache,
  - generated typed payload cache,
  - rendered mesh cache.
- [ ] Khi unload mesh phải dispose geometry/material đúng.
- [ ] Thêm debug hiển thị LOD level từng chunk.

## 5. Cỏ, cây, đá và chi tiết gần người chơi

- [x] Thêm grass ring quanh player thay vì tạo cỏ rải rác theo từng chunk.
- [x] Grass ring dùng một mesh hoặc instanced mesh lớn, không tạo component cho từng blade.
- [x] Grass bám height/biome của chunk hiện tại.
- [x] Grass chỉ hiện trên `grass`, `forest`, một phần `soil`; không mọc dưới nước/núi dốc.
- [ ] Thêm sway animation nhẹ bằng shader hoặc cập nhật uniform thời gian.
- [ ] Cây/đá/hoa chuyển decor payload sang typed arrays.
- [ ] Có distance fade cho decoration xa.
- [x] Không để số draw call tăng tuyến tính theo số object.

## 6. Material, ánh sáng và bầu trời

- [ ] Thay terrain `meshStandardMaterial` đơn giản bằng material có màu theo height + biome + normal.
- [x] Thêm fog màu tốt hơn, che vùng streaming xa.
- [x] Thêm sky gradient/sun disk/stars nhẹ, không dùng ảnh ngoài.
- [x] Thêm day cycle đơn giản:
  - sun direction,
  - ambient intensity,
  - fog color.
- [x] Nước có material riêng:
  - trong nhẹ,
  - chuyển động bằng uniform time,
  - màu khác giữa hồ và biển nếu cần.
- [ ] Giữ shader vừa đủ nhẹ cho laptop phổ thông.

## 7. Camera và cảm giác điều khiển

- [ ] Zoom chuột và pinch phải mượt, có damping.
- [ ] Camera không xuyên terrain.
- [ ] Camera không giật khi floating origin shift.
- [x] Click-to-move raycast chỉ chọn terrain, không chọn player/decor/minimap.
- [ ] Joystick không đè HUD trên mobile dọc.
- [ ] Swipe camera trên nửa phải màn hình không bị HUD bắt sự kiện.
- [x] Thêm nút reset camera rõ ràng trên HUD mobile.
- [ ] Kiểm tra desktop, mobile dọc, mobile ngang, tablet.

## 8. Minimap và thống kê khám phá

- [ ] Minimap vẽ từ chunk payload hiện có, không sinh world riêng.
- [ ] Minimap có:
  - player marker,
  - hướng camera,
  - chunk border,
  - biome color,
  - vùng đã khám phá.
- [ ] Exploration stats lưu theo `seedHash`.
- [ ] Không trộn thống kê của seed cũ với seed mới.
- [ ] Thống kê cần có:
  - số chunk đã thăm,
  - biome đã gặp,
  - quãng đường đi,
  - tọa độ xa nhất,
  - số lần teleport,
  - số cây/đá/hoa đã thấy.
- [x] Có nút reset exploration stats cho seed hiện tại.

## 9. Đo hiệu năng thật

- [ ] Performance panel hiển thị:
  - FPS hiện tại,
  - FPS trung bình 5 giây,
  - worker avg/max duration,
  - rendered chunk count,
  - generated cache size,
  - pending request count,
  - estimated triangles,
  - estimated draw calls,
  - JS heap nếu browser hỗ trợ.
- [ ] Không bịa RAM khi `performance.memory` không tồn tại.
- [ ] Thêm counter số geometry/material đang sống.
- [ ] Đi thẳng qua ít nhất 100 chunk và kiểm tra RAM không tăng mãi.
- [ ] Teleport xa 5 lần liên tiếp và kiểm tra UI không đóng băng.
- [ ] Ghi kết quả test vào `docs/performance-notes.md`.

## 10. Kế hoạch triển khai đề xuất

### Phase A: Nền tối ưu an toàn

- [x] Chuyển payload chunk sang typed arrays.
- [x] Build pass.
- [ ] So sánh hash regeneration trước/sau.
- [x] Performance panel thêm byte payload.

### Phase B: Terrain mịn hơn

- [x] Thêm visual subdivision 32 hoặc 40.
- [x] Worker sinh positions/normals/indices trực tiếp.
- [x] Render dùng geometry từ worker, không tự build lại nhiều ở React.
- [ ] Kiểm tra seam và FPS.

### Phase C: Cỏ và visual polish

- [x] Thêm grass ring quanh player.
- [ ] Thêm terrain material đẹp hơn.
- [x] Thêm sky/fog/day cycle nhẹ.
- [ ] Kiểm tra mobile không tụt FPS quá mạnh.

### Phase D: LOD

- [ ] Thiết kế LOD levels.
- [x] Thêm terrain skirt.
- [ ] Queue ưu tiên chunk gần.
- [ ] Debug overlay hiển thị LOD/chunk border.

### Phase E: Hoàn thiện game feel

- [ ] Camera clamp terrain.
- [x] Click-to-move chính xác hơn.
- [ ] Mobile HUD/menu gọn hơn.
- [ ] Minimap có vùng đã khám phá.
- [ ] README cập nhật ảnh/chỉ dẫn/phím điều khiển.

## 11. Tiêu chí coi là cải thiện thật

- [x] Build pass.
- [ ] Self-test pass.
- [ ] Game chạy được trên `npm run dev`.
- [ ] Player đi qua chunk liên tục không giật mạnh.
- [ ] Clear cache không đổi địa hình.
- [ ] Teleport BigInt vẫn hoạt động.
- [ ] FPS desktop ổn định hơn hoặc hình ảnh đẹp hơn mà không tụt nghiêm trọng.
- [ ] RAM không tăng liên tục khi di chuyển dài.
- [ ] UI mobile không che phần chơi chính.
- [ ] Có ghi chú rõ phần nào chưa kiểm chứng.
