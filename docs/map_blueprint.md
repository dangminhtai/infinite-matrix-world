# Blueprint bản đồ thế giới

## 1. Mục tiêu

Bản đồ thế giới phải cho người chơi quan sát và khám phá không gian sinh thủ tục rất lớn mà không tải toàn bộ world 3D. Trải nghiệm cần gần với bản đồ trong game thế giới mở:

- Nhấn `M` để mở hoặc đóng bản đồ.
- Kéo bản đồ theo mọi hướng.
- Phóng to, thu nhỏ bằng thanh trượt, nút `+`, nút `-`, con lăn và pinch.
- Chọn marker quái để theo dõi.
- Minimap và HUD hiển thị hướng cùng khoảng cách tới mục tiêu.
- Không cho phép thu nhỏ vô hạn.

## 2. Kiến trúc hiện tại cần giữ

Phần này đang đi đúng hướng và không nên thay bằng cách tải chunk 3D:

- `map.worker.ts` sinh tile biome riêng cho bản đồ.
- Mỗi tile tương ứng một chunk `16 x 16` ô.
- Worker bản đồ không dựng geometry, mesh, cây, đá hoặc entity 3D.
- Chỉ yêu cầu tile nằm trong viewport hiện tại.
- Ưu tiên tile gần tâm bản đồ.
- Giới hạn tối đa 2 request đang xử lý.
- Cache LRU tối đa 512 tile.
- Cache tách theo seed và chỉ giữ tối đa 3 seed gần nhất.
- Tọa độ tâm dùng `BigInt`; chỉ hiệu tọa độ nhỏ trong viewport mới đổi sang `Number`.
- Khi đóng bản đồ phải terminate Worker và xóa hàng đợi đang chờ.
- Biome của map tile phải khớp biome của chunk 3D tại cùng seed và tọa độ.

## 3. Vấn đề của zoom tự do

Không được cho người dùng thu nhỏ vô hạn.

Khi scale quá nhỏ, một viewport có thể nhìn thấy hàng chục nghìn chunk. Dù mỗi tile bản đồ nhẹ hơn chunk 3D, số request, thời gian Worker và bộ nhớ cache vẫn vượt giới hạn.

Ví dụ với màn hình `1920 x 970`:

- Scale `8 px/tile`: khoảng `15 x 8` chunk chưa tính vùng đệm.
- Scale `0.45 px/tile`: có thể vượt `260 x 130` chunk.

Vì vậy giới hạn zoom không được chỉ là một con số cố định tùy ý. Mức thu nhỏ tối đa phải phụ thuộc kích thước viewport và ngân sách tile.

## 4. Thiết kế bộ điều khiển zoom

### Desktop và tablet ngang

Đặt cụm zoom ở mép phải bản đồ:

```text
   +
   │
   ●  Thanh trượt dọc
   │
   -
```

- Nút `+`: phóng gần thêm một nấc.
- Nút `-`: thu xa thêm một nấc.
- Thumb của slider có thể kéo liên tục trong khoảng hợp lệ.
- Wheel chuột cập nhật cùng giá trị slider.
- Khi đạt giới hạn gần hoặc xa, nút tương ứng bị `disabled`.
- Tooltip phải hiển thị `Phóng to` và `Thu nhỏ`.

### Mobile dọc

Đặt slider ngang ở cạnh dưới, phía trên phần chú thích:

```text
-  ─────●─────  +
```

- Kích thước vùng chạm tối thiểu `44 x 44 px`.
- Pinch cập nhật cùng giá trị slider.
- Slider không được đè marker, legend hoặc nút đóng.

## 5. Mô hình zoom có giới hạn

Không lưu trực tiếp slider dưới dạng scale. Lưu mức zoom chuẩn hóa:

```ts
zoomLevel: number // 0..100
```

Quy ước:

- `0`: xa nhất được phép.
- `100`: gần nhất được phép.
- Giá trị mặc định: khoảng `65`.

Scale nên nội suy theo hàm mũ để thao tác tự nhiên hơn:

```ts
scale = minScale * Math.pow(maxScale / minScale, zoomLevel / 100)
```

Không dùng nội suy tuyến tính vì vùng zoom xa sẽ thay đổi quá nhạy còn vùng zoom gần thay đổi quá chậm.

### Giới hạn gần

Giá trị đề xuất:

```ts
maxScale = 16 // px trên một tile world
```

Ở giới hạn này người chơi vẫn nhìn được cấu trúc biome nhưng không phóng lớn pixel vô ích.

### Giới hạn xa theo viewport

Tính `minScale` từ ngân sách tile thay vì hard-code một giá trị rất nhỏ:

```ts
const TILE_SIZE = 16;
const MAX_VISIBLE_MAP_TILES = 420;
const safetyFactor = 1.15;

const minScale = Math.max(
  1.5,
  Math.sqrt(
    (viewportWidth * viewportHeight) /
    (MAX_VISIBLE_MAP_TILES * TILE_SIZE * TILE_SIZE)
  ) * safetyFactor
);
```

Ý nghĩa:

- Màn hình càng lớn thì mức thu nhỏ xa nhất tự động bị giới hạn chặt hơn.
- Mobile vẫn có thể thu nhỏ đủ rộng vì viewport nhỏ.
- Mỗi viewport chỉ yêu cầu khoảng 420 tile chính, chừa phần cache còn lại cho vùng đệm và thao tác pan.
- Không vượt cache LRU 512 tile.

Nếu `minScale >= maxScale`, khóa scale ở `maxScale` và disable cả hai hướng không còn hợp lệ.

## 6. Quy tắc request khi zoom và pan

1. Tính bounds chunk từ viewport, tâm `BigInt` và scale hiện tại.
2. Thêm vùng đệm 1 chunk quanh viewport để giảm nhấp nháy khi kéo.
3. Loại tile đã có trong cache hoặc đang in-flight.
4. Sắp xếp request theo khoảng cách tới tâm.
5. Chỉ giữ tối đa `MAX_VISIBLE_MAP_TILES` job phù hợp viewport hiện tại.
6. Khi người dùng tiếp tục kéo hoặc zoom, thay wanted set bằng viewport mới.
7. Response cũ không còn thuộc wanted set có thể bỏ qua.
8. Không gọi `ChunkManager.ensureAround()` từ bản đồ.
9. Không thay đổi render distance của world 3D khi zoom map.

## 7. Trạng thái tải

Không để vùng chưa tải trông giống lỗi nền trống.

- Tile chưa có dữ liệu dùng màu fog đồng nhất và grid nhẹ.
- Header hiển thị `Đang tải N tile...` khi còn request.
- Tile xuất hiện theo thứ tự từ tâm ra ngoài.
- Không dùng spinner lớn che bản đồ.
- Khi pan nhanh, ưu tiên viewport mới và dừng chờ viewport cũ.

## 8. Khám phá và fog

- Tile có thể được sinh để người dùng pan, nhưng chunk chưa khám phá phải phủ fog.
- Chunk đã đi qua hiển thị màu biome đầy đủ.
- Chunk chưa khám phá chỉ hiện màu biome tối hoặc silhouette, không lộ chi tiết entity.
- Marker quái chỉ hiện trong vùng entity đang hoạt động hoặc đã được khám phá theo luật gameplay.
- Không sinh toàn bộ quái của vùng xa chỉ vì người dùng kéo bản đồ tới đó.

## 9. Marker và mục tiêu

- Marker quái thường: đỏ.
- Marker đang theo dõi: vàng.
- Nhấn marker để chọn mục tiêu và đóng map.
- HUD hiển thị dạng `Echo · 125 m`.
- Dưới `1000 m`: hiển thị mét nguyên.
- Từ `1000 m`: hiển thị kilomet, ví dụ `1.4 km`.
- Minimap hiển thị marker mục tiêu ở đúng vị trí hoặc ghim vào mép nếu nằm ngoài vòng tròn.
- Quái bị hạ phải xóa marker và mục tiêu ngay.

## 10. Responsive

Phải kiểm tra tối thiểu:

- Desktop `1920 x 1080`.
- Laptop `1366 x 768`.
- Mobile dọc `390 x 844`.
- Mobile ngang `844 x 390`.
- Tablet `768 x 1024`.
- Màn hình 4K để xác nhận `minScale` động không vượt ngân sách tile.

Header, slider, legend và nút đóng không được chồng nhau ở bất kỳ viewport nào.

## 11. Tiêu chí nghiệm thu

- Nhấn `M` mở map và `Esc` đóng map.
- Map phủ kín viewport, không còn ô vuông nhỏ nằm giữa nền trống.
- Kéo sang tọa độ mới thì Worker sinh tile mới mà không tải scene 3D.
- Slider, wheel, pinch và nút `+/-` luôn đồng bộ.
- Không thể zoom vượt `minScale` hoặc `maxScale`.
- Nút `+/-` bị disable đúng tại giới hạn.
- Số tile wanted không vượt ngân sách đã đặt.
- Cache không vượt 512 tile.
- Đổi seed không nhận response của seed cũ.
- Pan tới tọa độ `BigInt` rất lớn không mất chính xác tâm map.
- Biome map tile khớp chunk 3D trong self-test.
- Chọn quái hiển thị đúng khoảng cách mét trên HUD và minimap.
- `npm run build` thành công và không có lỗi TypeScript.

## 12. Thứ tự triển khai đề xuất

1. Tách `zoomLevel` khỏi `scale`.
2. Viết hàm tính `minScale` theo viewport.
3. Thêm slider desktop/mobile và đồng bộ wheel/pinch.
4. Disable nút ở hai giới hạn.
5. Giới hạn wanted tile theo cùng ngân sách.
6. Kiểm tra resize và màn hình 4K.
7. Thêm test cho công thức zoom và giới hạn tile.
8. Chạy build, self-test và kiểm tra trực quan các viewport.
