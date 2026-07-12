# Genshin Impact Fake

Game thế giới mở góc nhìn thứ ba chạy trực tiếp trên trình duyệt, lấy cảm hứng từ cảm giác khám phá, bản đồ và chiến đấu của Genshin Impact. Đây là dự án fan-made phục vụ học tập, không phải sản phẩm chính thức của HoYoverse.

## Tính năng

- Thế giới procedural có thể tiếp tục sinh khi người chơi di chuyển.
- Địa hình, núi, nước, cỏ và cây được dựng theo seed.
- Nhân vật Aether, slime, rương và vật phẩm GLB.
- Đi bộ, chạy, nhảy, bơi, leo trèo và mantle.
- Minimap, bản đồ thế giới, waypoint và theo dõi slime.
- Nhặt Nguyên Thạch, mở rương nhận Mora và hạ slime nhận Dịch Slime.
- Web Worker sinh chunk và hệ chất lượng tự động giữ FPS.
- Hỗ trợ bàn phím, chuột và điều khiển cảm ứng.

## Chạy dự án

Yêu cầu Node.js 20 trở lên.

```bash
npm install
npm run dev
```

Mở `http://localhost:5173/`.

Build production:

```bash
npm run build
npm run preview
```

## Điều khiển

- `W/A/S/D`: di chuyển.
- `Shift`: chạy.
- `Space`: nhảy.
- `E`: tương tác.
- `J`: tấn công.
- `K`: kỹ năng.
- `M`: bản đồ thế giới.
- `I`: túi đồ.
- Kéo chuột: xoay camera.
- Con lăn: zoom camera trong giới hạn gameplay.

## Cấu trúc chính

```text
src/
├── config/       Tên và cấu hình trình bày
├── game/         Gameplay, camera, worker, terrain và entity
├── models/       Model GLB
└── ui/           HUD, bản đồ, settings và inventory
```

## Kiểm tra

```bash
npm run build
```

Self-test chạy trong chế độ phát triển và kiểm tra tính xác định của thế giới, biên chunk, cache, floating origin, map tile và quality manager.

## Lưu ý bản quyền

Tên Genshin Impact, nhân vật và các tài sản liên quan thuộc chủ sở hữu tương ứng. Cần kiểm tra giấy phép từng model trước khi phát hành công khai hoặc sử dụng thương mại.
