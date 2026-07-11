# Blueprint: waypoint và teleport từ bản đồ

## Mục tiêu

World map cần hoạt động giống một công cụ khám phá:

- Người chơi bấm `M` để mở bản đồ lớn.
- Click lên bản đồ để đặt một mốc tự do.
- HUD và minimap hiển thị mốc đó kèm khoảng cách tính bằng mét.
- Teleport tức thời từ map chỉ hoạt động khi người chơi bật trong Settings.
- Biome núi phải có dấu hiệu rõ hơn trên minimap/world map để phục vụ tính năng leo trèo.

## Nguyên tắc

Teleport từ map là một tính năng debug/tiện ích, không nên bật mặc định. Nếu bật sẵn, người chơi rất dễ phá vòng lặp khám phá vì chỉ cần click là bỏ qua địa hình, nước, núi và quái.

Luồng mặc định nên là:

1. Click map đặt waypoint.
2. Người chơi đi theo mốc.
3. Minimap giữ mũi tên/mốc ở mép nếu mốc nằm ngoài vùng nhìn.
4. HUD hiện khoảng cách theo mét hoặc kilomet.

Luồng khi bật teleport:

1. Settings -> Gameplay bật `Cho teleport từ bản đồ`.
2. Click map đặt waypoint.
3. World map hiện nút teleport tới waypoint.
4. Bấm teleport mới dịch chuyển nhân vật.

## Thiết kế dữ liệu

Thêm kiểu dữ liệu dùng chung:

```ts
export type MapWaypoint = {
  id: string;
  worldX: string;
  worldY: string;
  offsetX: number;
  offsetY: number;
};
```

Waypoint dùng world tile nguyên cộng offset thập phân. Cách này khớp với hệ tọa độ hiện tại của player, minimap, enemy và teleport.

## World map

World map cần có phép biến đổi ngược từ vị trí click trên canvas sang world coordinate:

```txt
screen -> center tile + residual -> world tile + offset
```

Nếu click trúng quái, ưu tiên chọn quái làm target. Nếu không trúng quái và không phải thao tác kéo/pinch, đặt waypoint.

Waypoint hiển thị bằng mốc màu vàng/cam, khác với quái màu đỏ và player màu trắng.

## Minimap

Minimap hiển thị:

- Quái: đỏ.
- Quái đang track: vàng.
- Waypoint: vàng/cam, có vòng ngoài.
- Nếu waypoint ở xa ngoài minimap, kẹp marker vào mép vòng tròn giống chỉ hướng.

## HUD

HUD ưu tiên hiển thị target quái nếu đang track. Nếu không có target quái nhưng có waypoint, hiển thị:

```txt
Mốc đánh dấu · 125 m
```

Nút `x` xóa mốc hiện tại.

## Settings

Thêm setting:

```ts
gameplay.allowMapTeleport: boolean
```

Mặc định `false`.

UI đặt trong tab Gameplay vì đây là lựa chọn thay đổi trải nghiệm chơi, không chỉ là đồ họa.

## Núi trên map

Biome núi hiện đã có màu xám. Cần tăng tín hiệu thị giác:

- Dùng màu xám lạnh sáng hơn một chút.
- Thêm nét viền/hatch nhẹ khi scale đủ lớn.
- Thêm legend `Núi`.

Không cần sinh icon núi riêng trong phase này vì map vẽ theo tile biome. Icon riêng có thể làm sau nếu muốn hiển thị đỉnh núi/độ cao.

## Kiểm chứng

- Build TypeScript phải pass.
- Click quái vẫn chọn target như cũ.
- Click đất/núi/nước trên world map đặt waypoint.
- HUD/minimap hiện waypoint và khoảng cách.
- Khi `allowMapTeleport = false`, không có teleport từ map.
- Khi bật setting, world map có nút teleport tới waypoint và gọi chung luồng teleport hiện tại.
