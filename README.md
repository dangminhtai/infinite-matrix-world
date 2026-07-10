# Infinite Hybrid Matrix World

Game web 3D React + TypeScript + Three.js dựa trên thuật toán Infinite Hybrid Matrix World trong `template.py`.

## Chạy project

```bash
npm install
npm run dev
```

Build kiểm tra:

```bash
npm run build
```

## Kiến trúc ngắn

- `src/game/world`: toán BigInt, ma trận trên trường hữu hạn, recurrence khả nghịch, trộn tọa độ BigInt, noise, sinh chunk và `selfTest`.
- `src/game/workers`: Web Worker sinh chunk, tính hash và trả payload về main thread.
- `src/game/rendering`: terrain dùng `BufferGeometry`, màu biome bằng vertex color, cây/đá/hoa dùng `InstancedMesh`.
- `src/game/player`, `camera`, `controls`: di chuyển nhân vật, camera góc nhìn thứ ba, joystick/cảm ứng/chuột.
- `src/ui`: HUD, Seed editor, Teleport, overlay loading/debug.

## Kiểm thử

`selfTest()` chạy khi ứng dụng khởi động ở development. Các phần được kiểm:

- Recurrence thuận/ngược.
- Path independence.
- Neighbor movement so với `matPow`.
- Regeneration hash cho chunk thường và tọa độ BigInt rất lớn.
- Chunk seam.
- Cache bound.
- Floating-origin accounting cơ bản.
- Worker determinism được kiểm qua lệnh generate lặp khi game chạy.

Nếu self-test lỗi, màn hình sẽ hiển thị lỗi thay vì âm thầm fallback.
