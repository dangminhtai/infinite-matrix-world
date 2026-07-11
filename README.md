# Infinite Hybrid Matrix World

Game khám phá thế giới 3D sinh thủ tục trên trình duyệt, xây dựng bằng React, TypeScript và Three.js. Thế giới được tạo xác định từ seed và tọa độ `BigInt`: cùng seed và cùng tọa độ luôn sinh lại cùng địa hình mà không cần lưu toàn bộ bản đồ trong bộ nhớ.

## Tính năng hiện tại

- Thế giới sinh theo chunk với tọa độ rất lớn và floating origin.
- Web Worker sinh địa hình ngoài main thread, có hàng đợi ưu tiên và giới hạn request đồng thời.
- Biome gồm nước, núi, rừng, đất, cát và đồng cỏ.
- Terrain LOD theo khoảng cách; cây, đá, hoa và entity sử dụng `InstancedMesh`.
- Camera góc nhìn thứ ba độc lập với hướng di chuyển, có zoom và chống xuyên địa hình.
- Nhân vật có trạng thái đứng, đi, chạy, nhảy, rơi và bơi.
- Bơi thường, bơi nhanh tốn stamina, mất máu khi kiệt sức và hồi sinh tại vị trí đất an toàn.
- Vật phẩm, rương, điểm hồi phục và quái sinh xác định theo seed/chunk.
- Tấn công thường, kỹ năng có hồi chiêu, AI quái gần và túi đồ có stack.
- Minimap, thống kê khám phá, thông số renderer và chất lượng đồ họa tự động.
- Giao diện responsive cho desktop, màn hình cảm ứng và thiết bị di động.
- Seed editor, teleport `BigInt`, xóa cache và công cụ developer.

NPC và nhiệm vụ không nằm trong phạm vi MVP hiện tại.

## Điều khiển

### Máy tính

| Phím/thao tác | Chức năng |
| --- | --- |
| `W A S D` | Di chuyển tương đối theo hướng camera |
| `Shift` | Chạy hoặc bơi nhanh |
| `Space` | Nhảy; khi bơi dùng để đạp nước |
| `E` | Nhặt vật phẩm, mở rương hoặc dùng điểm hồi phục |
| `J` | Tấn công thường |
| `K` | Kỹ năng |
| `I` | Mở hoặc đóng túi đồ |
| `M` | Mở hoặc đóng bản đồ thế giới |
| `Esc` | Mở Settings hoặc đóng cửa sổ đang mở |
| Kéo chuột | Xoay camera |
| Con lăn | Phóng gần hoặc xa camera |
| Nhấp địa hình | Tự di chuyển tới vị trí được chọn |

Các phím gameplay có thể đổi trong `Settings > Controls`.

### Điện thoại và màn hình cảm ứng

- Joystick bên trái để di chuyển và bơi.
- Vuốt vùng chơi để xoay camera; pinch để zoom.
- Các nút `RUN`, `E`, `ATK`, `SKL` và nút nhảy nằm ở cụm điều khiển bên phải.
- `RUN` được giữ để chạy hoặc bơi nhanh.

## Cài đặt và chạy

Yêu cầu máy đã cài Node.js và npm.

```bash
git clone https://github.com/dangminhtai/infinite-matrix-world.git
cd infinite-matrix-world
npm install
npm run dev
```

Vite sẽ in địa chỉ local trong terminal, mặc định thường là `http://localhost:5173`.

Build production:

```bash
npm run build
```

Xem thử bản build:

```bash
npm run preview
```

## Kiến trúc

```text
src/
├── game/
│   ├── camera/       Camera góc nhìn thứ ba và camera collision
│   ├── controls/     Chuột, cảm ứng, joystick và nút mobile
│   ├── core/         Quality manager và save manager
│   ├── entities/     Vật phẩm, rương, hồi phục, quái và combat nhẹ
│   ├── player/       Va chạm, chuyển động và model nhân vật
│   ├── rendering/    Terrain, nước, cây, đá, hoa, cỏ và bầu trời
│   ├── spawn/        Sinh entity xác định
│   ├── workers/      Web Worker sinh chunk
│   └── world/        Ma trận, recurrence, noise, chunk và self-test
└── ui/               HUD, minimap, settings, inventory và thống kê
```

### Luồng sinh thế giới

1. Vị trí người chơi xác định chunk đang cần.
2. `ChunkManager` ưu tiên các chunk gần và gửi tối đa số request đã giới hạn sang Worker.
3. Worker sinh địa hình và decor từ seed, tọa độ chunk và salt.
4. Main thread nhận payload, dựng geometry và chỉ giữ vùng hoạt động quanh người chơi.
5. Chunk đã rời xa được loại khỏi vùng render; cache có giới hạn để tránh tăng bộ nhớ vô hạn.

Entity không được lưu đầy đủ cho toàn thế giới. Game chỉ lưu các thay đổi thưa như vật phẩm đã nhặt, rương đã mở và quái đã bị hạ.

## Dữ liệu lưu cục bộ

Game sử dụng `localStorage` cho:

- Seed hiện tại.
- Cấu hình gameplay, đồ họa và điều khiển.
- Thống kê khám phá riêng theo seed.
- Inventory và thay đổi thế giới riêng theo seed.

Dữ liệu này thuộc trình duyệt và thiết bị hiện tại, chưa có đồng bộ tài khoản hoặc máy chủ. Xóa dữ liệu trang web trong trình duyệt cũng sẽ xóa tiến trình đã lưu.

## Kiểm thử

Chạy kiểm tra build và TypeScript:

```bash
npm run build
```

Trong development, `selfTest()` kiểm tra:

- Recurrence thuận/ngược.
- Path independence.
- Di chuyển giữa các chunk lân cận.
- Tái sinh cùng hash tại tọa độ thường và tọa độ `BigInt` rất lớn.
- Seam địa hình và normal giữa hai chunk.
- Giới hạn cache.
- Tính đúng của floating origin và phép chia tọa độ âm.
- Quality manager tự giảm/tăng chất lượng.

Các phép kiểm thử thủ công quan trọng gồm di chuyển qua biên chunk, teleport xa, camera desktop/mobile, bơi ra vào bờ, tương tác, combat và load lại save.

## Hiệu năng

Developer panel cung cấp FPS, frame time, JS heap khi trình duyệt hỗ trợ, dung lượng payload chunk, worker time, triangles, draw calls, geometry, texture và trạng thái hàng đợi chunk.

Chỉ số `JS heap` không phải tổng RAM của tab, GPU hay toàn hệ thống. Mức FPS thực tế phụ thuộc GPU, độ phân giải, trình duyệt và preset đồ họa.

## Giới hạn hiện tại

- Chưa có NPC, nhiệm vụ, hệ thống trang bị hoặc backend multiplayer.
- Save chưa đồng bộ giữa các trình duyệt hoặc thiết bị.
- Chưa hoàn thành báo cáo endurance 100 chunk và số liệu hiệu năng trước/sau.
- Bundle Three.js vẫn tương đối lớn và còn có thể tối ưu thêm bằng tải lười/code splitting.

## Tài liệu

- [`docs/requirements.md`](docs/requirements.md): yêu cầu và thiết kế nền tảng ban đầu.
- [`docs/checklists.md`](docs/checklists.md): danh sách cải tiến kỹ thuật và kiểm thử.
- [`docs/improve.md`](docs/improve.md): kế hoạch triển khai theo Phase 0-5.
