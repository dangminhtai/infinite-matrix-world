# Kế hoạch phục hồi và tối ưu hiệu năng mobile

## 1. Baseline bắt buộc

Mốc ổn định dùng để so sánh là commit `5012c8aba552dfcb7c6cc998a85d4651516fb60d` (`add logic char`). Hệ nhân vật, profile, combat và model nhân vật của commit này được giữ nguyên.

Các thay đổi performance từ `dc47a35`, `a0faa0c`, `b3de7b7` và `3bcd8b6` đã được rollback khỏi working tree vì gây regression nhưng không có benchmark chứng minh.

## 2. Nguyên tắc triển khai lại

1. Mỗi commit chỉ tối ưu một subsystem: startup, minimap, cỏ, worker hoặc entity model.
2. Phải đo trước và sau cùng một đường chạy, cùng seed và cùng thiết bị.
3. Không thêm backend thứ hai nếu backend hiện tại chưa được profile bằng số liệu.
4. Không đánh dấu hoàn thành chỉ vì build thành công.
5. Nếu frame time hoặc thời gian startup xấu hơn quá 10%, rollback commit đó ngay.
6. Không tạo tài liệu tổng kết “đã tối ưu” trước khi có kết quả điện thoại thật.

## 3. Kịch bản benchmark cố định

### Thiết bị

- Desktop hiện tại của anh.
- Chrome DevTools mobile chỉ dùng để phát hiện layout và lỗi cơ bản, không dùng làm kết luận FPS.
- Ít nhất một điện thoại Android thật chạy bản Vercel production.

### Đường chạy

1. Hard refresh và đo từ lúc request HTML đến lúc điều khiển được nhân vật.
2. Đứng yên 30 giây tại seed mặc định.
3. Chạy thẳng 120 giây qua nhiều chunk.
4. Xoay camera liên tục 20 giây.
5. Mở/đóng minimap và world map năm lần.
6. Đổi qua hai nhân vật rồi tiếp tục chạy 60 giây.

### Chỉ số phải ghi

- Thời gian tải JS và model Aether.
- Thời gian chunk đầu tiên và thời gian đủ vùng gần.
- FPS trung bình, FPS thấp nhất, frame time trung bình và frame max.
- Draw calls, triangles, geometries, textures.
- Số chunk loaded/queued/in-flight.
- JS heap đầu bài test và sau 3 phút.
- Số lần minimap terrain redraw.
- Số blade cỏ thực tế.

## 4. Phase R0 - Khôi phục ổn định

- [x] Rollback code performance về nội dung commit `5012c8a`.
- [x] Xóa `GrassCPUInstanced` và `GrassCapability` khỏi runtime.
- [x] Khôi phục minimap/map raster cũ.
- [x] Khôi phục worker/chunk generator cũ.
- [x] Chạy production build sau rollback.
- [ ] Test local desktop tối thiểu 3 phút.
- [ ] Deploy bản rollback và test điện thoại thật.

Điều kiện qua phase: game vào được, không đứng sau loading và FPS không giảm liên tục trong 3 phút.

## 5. Phase R1 - Đo startup, chưa tối ưu hình ảnh

Chỉ thêm timestamp và counter, không đổi thuật toán render.

- Đo `app-start -> worker-created`.
- Đo `worker-created -> center-chunk-ready`.
- Đo `center-chunk-ready -> player-controllable`.
- Đo thời gian tải và parse từng GLB.
- Ghi rõ asset nào được request trong Network lúc khởi động.

Trạng thái triển khai:

- [x] Thêm profiler timestamp không tạo vòng render mới.
- [x] Hiển thị App → Worker, chunk đầu, chunk tâm, đủ vùng gần và thời điểm điều khiển được.
- [x] Ghi thời điểm model nhân vật sẵn sàng.
- [x] Liệt kê GLB từ Resource Timing gồm thời gian tải và transfer size.
- [x] Ghi FPS thấp nhất, frame max, số blade và thời gian minimap redraw trong phiên.
- [x] Production build sau instrumentation thành công.
- [ ] Thu số baseline local bằng kịch bản 3 phút.
- [ ] Thu số baseline trên điện thoại thật sau deploy.

Quyết định sau đo:

- Nếu worker chiếm phần lớn thời gian: tối ưu chunk đầu tiên.
- Nếu GLB chiếm phần lớn thời gian: trì hoãn entity model xa hoặc tạo asset nhẹ.
- Nếu main thread đứng sau chunk ready: profile React/Three và minimap/cỏ.

## 6. Phase R2 - Startup theo chunk trung tâm

Chỉ triển khai nếu R1 cho thấy chờ 9 chunk là nguyên nhân đáng kể.

- Ưu tiên chunk `(0, 0)` trước mọi job khác.
- Mở game khi chunk trung tâm và player fallback đã sẵn sàng.
- Tám chunk xung quanh tiếp tục stream nền có giới hạn.
- Không để nhân vật chạy vào chunk chưa có collision.
- Không bật lại loading overlay khi streaming hoặc teleport.

Ngưỡng đạt: thời gian điều khiển được nhân vật giảm ít nhất 25%, không xuất hiện rơi map hoặc chunk trống.

Quyết định hiện tại: chưa triển khai. Benchmark headless viewport mobile ghi nhận chunk tâm khoảng `300,8 ms` và đủ vùng 9 chunk khoảng `353,3 ms`; chênh lệch khoảng `52,5 ms`, không đạt ngưỡng cải thiện 25%. Cần đo lại trên Vercel/điện thoại trước khi mở phase này.

## 7. Phase R3 - Minimap tối giản

Giữ một canvas trước. Không tạo cache theo từng world cell.

- Terrain chỉ redraw khi đổi tile/chunk.
- Marker redraw khi dữ liệu marker thay đổi; không dùng interval 15 FPS nếu không cần.
- Không gán lại `canvas.width/height` trong vòng redraw.
- Mobile DPR bằng 1.
- Mỗi terrain redraw có ngân sách dưới 4 ms.

Cấm lặp lại thiết kế đã rollback:

- Không tạo hơn 12.000 canvas tile cho một minimap.
- Không dùng cache 64 phần tử cho một vòng vẽ yêu cầu hàng nghìn tile.
- Không chạy hàng chục triệu phép `BigInt/getBiome` trong một lần redraw.

Trạng thái triển khai:

- [x] Giữ đúng một canvas hiển thị.
- [x] Cache nền terrain trong một offscreen canvas cố định, không cache từng world cell.
- [x] Chỉ raster lại biome khi đổi tile, tập chunk, kích thước hoặc DPR.
- [x] Xoay camera/marker chỉ chép nền cache rồi vẽ overlay.
- [x] Không gán lại backing size nếu kích thước không đổi.
- [x] Mobile dùng minimap 148 px và DPR 1.
- [x] Production build thành công.
- [ ] Xác nhận terrain redraw dưới 4 ms trên điện thoại thật.

## 8. Phase R4 - Cỏ theo ngân sách, một backend

Giữ backend shader hiện tại và giảm số blade theo phép đo trước. Chưa tạo CPU backend mới.

Ngân sách thử nghiệm ban đầu:

- Mobile Low: 18 x 18 = 324 blade.
- Mobile Medium: 28 x 28 = 784 blade.
- Desktop Medium: 56 x 56 = 3.136 blade.
- Desktop High: 80 x 80 = 6.400 blade.

Yêu cầu:

- Geometry/material/texture không được tạo trong `useFrame`.
- Không thay `BufferAttribute` liên tục.
- Chỉ rebuild dữ liệu cỏ khi thay chunk hoặc thay preset.
- Nếu float texture không hoạt động, tắt blade cỏ và dùng terrain ground cover trước; không tự thêm backend phức tạp trong cùng phase.

Trạng thái triển khai:

- [x] Tách ngân sách cỏ thành `grassConfig.ts` dùng chung cho render và metrics.
- [x] Mobile Low tối đa 324 blade khi density không vượt 0,2.
- [x] Mobile Medium tối đa 784 blade khi density không vượt 0,3.
- [x] Desktop Medium tối đa 3.136 blade.
- [x] Mọi cấu hình còn lại bị chặn ở 6.400 blade.
- [x] Giữ một backend shader, không thêm CPU backend.
- [ ] Đo FPS và frame max trên điện thoại thật.

## 9. Phase R5 - Asset và entity model

- Ghi dung lượng và thời gian decode của player, slime, rương và collectible.
- Không tải model entity nếu không có entity đó trong vùng gần.
- Model lớn phải có bản runtime tối ưu riêng; procedural fallback luôn sẵn sàng.
- Không import/preload toàn bộ model nhân vật lúc startup.

Ngưỡng đạt: không có tác vụ decode model tạo frame trên 100 ms khi người chơi đang điều khiển.

Trạng thái triển khai:

- [x] Resource Timing cho thấy rương cũ tải khoảng 11,8 MB ở startup local.
- [x] Loại model rương khỏi runtime; dùng fallback procedural đến khi có asset nhẹ.
- [x] Mobile dùng fallback procedural cho slime và collectible, không decode entity GLB.
- [x] Desktop vẫn dùng model slime/collectible hiện có.
- [x] Player chỉ tải model nhân vật đang chọn và kiếm.
- [x] Production build không còn asset `medieval_chest.glb`.
- [ ] Đo frame max lúc đổi nhân vật trên điện thoại thật.

## 10. Phase R6 - Worker LOD

Chỉ làm sau R0-R5 vì thay worker và render cùng lúc sẽ làm mất baseline.

- Logic height/biome vẫn giữ độ phân giải hiện tại.
- Geometry visual Low/Medium/High được đo riêng.
- Request phải mang phiên bản/detail trong cache key; không dùng chunk High cũ như Low hoặc ngược lại.
- Khi đổi quality, không regenerate toàn bộ vùng cùng một frame.

Quyết định hiện tại: chưa triển khai. Worker local không phải nút thắt chính trong benchmark R1; thay worker lúc này sẽ làm mất baseline mà chưa có lợi ích đủ lớn.

## 11. Tiêu chí phát hành

Không deploy nếu thiếu một trong các điều kiện:

- Production build thành công.
- Desktop chạy liên tục 3 phút không tụt FPS theo thời gian.
- Điện thoại thật điều khiển được trong thời gian chấp nhận được.
- Không có frame đứng dài khi minimap xuất hiện.
- Heap/geometries/textures không tăng liên tục khi đi qua chunk.
- Báo cáo trước/sau có số liệu thực, không dùng nhận xét “mượt hơn” làm bằng chứng duy nhất.
