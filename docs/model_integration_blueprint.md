# Blueprint tích hợp model 3D

## 1. Mục tiêu

Tích hợp các model trong `src/models` vào Infinite Hybrid Matrix World mà không làm mất tính vô hạn của thế giới, không khiến lần tải đầu quá nặng và không làm FPS giảm dần khi người chơi di chuyển lâu.

Blueprint này chỉ xác định kiến trúc, thứ tự triển khai và điều kiện kiểm chứng. Chưa thay model thủ tục đang chạy trong game.

## 2. Kiểm kê tài nguyên hiện có

Kích thước dưới đây là kích thước file thực tế trong repository tại thời điểm lập kế hoạch.

| Model | Kích thước | Vai trò dự kiến | Đưa vào runtime hiện tại |
| --- | ---: | --- | --- |
| `aethers_lumines_sword.glb` | 0.70 MB | Kiếm gắn với người chơi | Có, sau khi căn chỉnh trục và điểm gắn |
| `cryo_slime.glb` | 0.70 MB | Biến thể quái băng | Có |
| `fire_slime.glb` | 1.14 MB | Biến thể quái lửa | Có |
| `genshin_impact_aether.glb` | 3.42 MB | Model người chơi | Có, nhưng chỉ animation thủ tục ở phase đầu |
| `mutated_electro_slime.glb` | 1.47 MB | Biến thể quái điện | Có |
| `primogemmorastardust_from_genshin_impact_free.glb` | 0.45 MB | Vật phẩm thu thập | Có, cần chọn đúng mesh cần dùng |
| `medieval_chest.glb` | 12.10 MB | Rương tương tác | Có điều kiện, phải tối ưu trước |
| `mountain_terrain_-_haytor_dartmoor_national_park.glb` | 49.12 MB | Mẫu núi/điểm đặc biệt | Không tải trực tiếp trong vòng lặp chunk |
| `hero_mountain.glb` | 61.87 MB | Cảnh núi lớn | Không đưa vào runtime hiện tại |
| `dusty_path_in_the_fields.glb` | 85.41 MB | Cảnh đường/cánh đồng | Không đưa vào runtime hiện tại |

### Kết luận về GitHub và web

- Các file hiện tại đều thấp hơn giới hạn cứng 100 MiB cho một file thông thường của GitHub, nên về mặt kỹ thuật có thể commit và push.
- Không phải tất cả model đều dưới 50 MB. `hero_mountain.glb` và `dusty_path_in_the_fields.glb` vượt mức đó.
- Có thể lưu model nguồn trong GitHub không đồng nghĩa với việc nên tải chúng trong trình duyệt.
- Ba model cảnh lớn không được import tĩnh vào mã game. Nếu import, Vite có thể đưa URL của chúng vào bản build và người chơi phải tải lượng dữ liệu quá lớn khi tính năng được mở.

## 3. Những gì model hiện tại còn thiếu

Qua cấu trúc GLB hiện có, các model chưa cung cấp animation clip và không có skeleton/skin để điều khiển xương. Vì vậy chưa thể có ngay animation kiểu game hoàn chỉnh như idle, chạy, nhảy, bơi, leo và tấn công chỉ bằng các file này.

Các tài nguyên cần bổ sung sau:

- Nhân vật có skeleton và các clip: `idle`, `walk`, `run`, `jump`, `fall`, `swim`, `climb`, `attack`.
- Kiếm có điểm gắn hoặc tên bone bàn tay rõ ràng.
- Slime có tối thiểu các clip: `idle`, `move`, `attack`, `hit`, `death`.
- Rương có nắp tách riêng hoặc clip `open`.
- Model núi dùng cho gameplay phải có bản tối ưu, collider đơn giản và LOD.
- Thông tin giấy phép/nguồn của từng model trước khi phát hành công khai lâu dài.

Khi chưa bổ sung đủ, chuyển động sẽ dùng animation thủ tục ở cấp `group`: nhún, nghiêng, co giãn và xoay. Đây là giải pháp chuyển tiếp, không được ghi nhận là animation nhân vật hoàn chỉnh.

## 4. Nguyên tắc kiến trúc

### 4.1 Tách logic gameplay khỏi hình ảnh

`GameState`, va chạm, leo trèo, bơi, chiến đấu và tọa độ vô hạn vẫn là nguồn dữ liệu chính. Model chỉ đọc trạng thái để hiển thị, không quyết định vị trí hoặc luật gameplay.

```text
GameState / RuntimeEntity
        |
        +-- điều khiển gameplay, collider, HP, tương tác
        |
        +-- ModelView chỉ biểu diễn hình ảnh
```

Nhờ đó model lỗi hoặc chưa tải xong không làm nhân vật mất điều khiển và không làm quái ngừng hoạt động.

### 4.2 Có fallback hình học

- Khi model đang tải hoặc tải thất bại, giữ model hình học hiện tại.
- Không để `Suspense` làm trắng toàn bộ canvas.
- Lỗi một model không được làm hỏng terrain, HUD hoặc các entity khác.

### 4.3 Tải theo nhu cầu

- Model người chơi được preload vì luôn xuất hiện.
- Model quái chỉ tải khi hệ thống entity chuẩn bị hiển thị quái.
- Rương chỉ tải khi chunk có rương ở vùng render gần.
- Model cảnh lớn không nằm trong tuyến tải mặc định.
- Không tải lại cùng một GLB sau mỗi lần chunk được sinh hoặc hủy.

### 4.4 Chuẩn hóa model một lần

Mỗi model cần cấu hình riêng thay vì rải các con số `scale`, `rotation` và `position` trong component:

```ts
type ModelDefinition = {
  url: string;
  scale: number;
  rotation: [number, number, number];
  offset: [number, number, number];
  castShadow: boolean;
  receiveShadow: boolean;
};
```

Các giá trị này được đo trong scene kiểm thử model. Không tự động chuẩn hóa bounding box trong mỗi frame.

### 4.5 Không nhân bản vật liệu và texture liên tục

- Cache kết quả tải GLTF theo URL.
- Dùng chung geometry/material giữa các slime cùng loại.
- Quái đông phải render bằng `InstancedMesh` hoặc một cơ chế batching tương đương.
- Chỉ clone scene khi đối tượng thực sự cần trạng thái mesh riêng.
- Giải phóng tài nguyên chỉ khi asset không còn được cache và không còn instance sử dụng.

## 5. Ánh xạ vào code hiện tại

### Người chơi

`src/game/player/Player.tsx` đang vừa cập nhật transform vừa dựng hình người thủ tục. Cần tách thành:

```text
src/game/player/
├── Player.tsx                 # transform và trạng thái chung
├── PlayerProceduralModel.tsx  # fallback hiện tại
├── PlayerGltfModel.tsx        # Aether, kiếm và animation thủ tục
└── playerModelConfig.ts       # scale, trục, offset, chất lượng
```

`Player.tsx` tiếp tục nhận `GameState`. `PlayerGltfModel` chỉ ánh xạ `movementState` sang nhún/nghiêng tạm thời. Collider và vòng debug không gắn vào mesh GLB.

### Quái

`src/game/entities/EntitySystem.tsx` hiện gom quái vào một `InstancedMesh` hình khối. Để giữ hiệu năng:

- Không tạo một React component độc lập cho mỗi quái.
- Chia quái thành ba nhóm instance: Cryo, Fire và Electro.
- Mỗi nhóm dùng geometry/material trích từ model tương ứng.
- Transform và AI vẫn dùng `RuntimeEntity` hiện tại.
- Giữ giới hạn tổng entity đang hoạt động và bổ sung giới hạn theo loại.
- Quái xa dùng hình đơn giản hiện tại hoặc bị cull; quái gần mới dùng model GLB.

Do một GLB slime có nhiều mesh/material, cần kiểm tra batching thực tế. Nếu mỗi slime tạo nhiều draw call, phải gộp mesh khi tiền xử lý hoặc chỉ dùng một mesh đại diện.

### Vật phẩm

Model primogem có nhiều mesh và material. Không nên instance toàn bộ file ngay. Cần mở scene kiểm thử, chọn đúng mesh hiển thị, sau đó:

- Dùng geometry/material đã chọn cho `collectibleRef`.
- Giữ hiệu ứng bay lên xuống và xoay hiện tại.
- Giữ ID, lưu game và logic nhặt vật phẩm không đổi.

### Rương

Model rương 12.10 MB lớn hơn nhiều so với vai trò của nó. Chỉ tích hợp sau khi:

- Nén texture và giảm độ phân giải phù hợp cho web.
- Giảm polygon nếu cần.
- Tách nắp rương để animation mở không phải thay toàn bộ model.
- Xác nhận nhiều rương không tạo quá nhiều draw call.

### Núi và đường

Thế giới hiện tại sinh terrain theo chunk vô hạn. Các model cảnh hữu hạn không được thay thế terrain generator vì sẽ tạo lặp cảnh, khe map, collider phức tạp và tải quá nặng.

Hướng sử dụng hợp lý về sau:

- Dùng model làm tài liệu tham chiếu hình dáng để cải thiện thuật toán sinh núi.
- Hoặc tạo landmark hiếm, có tọa độ xác định theo seed.
- Landmark phải có bản low-poly, collider đơn giản và ít nhất ba mức LOD.
- Landmark chỉ tải trong bán kính giới hạn và phải được hủy khi ra xa.
- Không dùng trực tiếp `hero_mountain.glb` hay `dusty_path_in_the_fields.glb` trong phase hiện tại.

## 6. Ngân sách hiệu năng

Các ngưỡng này là điều kiện thiết kế ban đầu, cần đo lại trên bản deploy Vercel:

- Tải bắt buộc ở lần mở game: tối đa 5 MB model nén.
- Tải bổ sung khi bắt đầu gặp quái: tối đa 4 MB.
- Một model tương tác đơn lẻ như rương sau tối ưu: mục tiêu dưới 3 MB.
- Không model runtime đơn lẻ nào vượt 10 MB nếu chưa có màn hình tải và đo kiểm riêng.
- Texture thông thường tối đa 1024 px; chỉ dùng 2048 px khi nhìn gần cho thấy khác biệt rõ.
- Không tăng số lượng object React theo số entity đang hoạt động.
- Không tăng draw call quá 15 chỉ vì thay toàn bộ entity thủ tục bằng model.
- FPS phải ổn định sau ít nhất 10 phút di chuyển liên tục, không chỉ lúc đứng yên tại điểm spawn.

## 7. Các phase triển khai

### Phase 0 - Kiểm tra asset và giấy phép

- [ ] Ghi nguồn tải, tác giả và giấy phép của từng GLB.
- [ ] Chụp preview từng model trong scene kiểm thử.
- [ ] Đo bounding box, hướng mặt trước, trục đứng và số draw call.
- [ ] Ghi số mesh, material, texture, triangle và animation clip.
- [ ] Xác nhận model nào được phép deploy công khai.

Điều kiện hoàn thành: có bảng asset manifest chính xác, không chỉ dựa vào tên file.

### Phase 1 - Hạ tầng tải model và nhân vật tĩnh

- [x] Tạo `ModelErrorBoundary` hoặc cơ chế fallback cục bộ.
- [x] Tạo cấu hình chuẩn hóa model.
- [x] Tách model thủ tục khỏi `Player.tsx`.
- [x] Hiển thị Aether và kiếm, giữ nguyên collider/gameplay.
- [x] Ánh xạ trạng thái sang nhún/nghiêng thủ tục.
- [x] Preload model người chơi, không chặn terrain và HUD.

Trạng thái kiểm chứng: production build đã thành công. Bundle chỉ phát hành Aether và kiếm; chưa kéo các model cảnh lớn vào `dist`. Hướng mặt, vị trí kiếm và fallback khi mạng lỗi vẫn cần kiểm tra trực tiếp trong trình duyệt trước khi coi toàn bộ điều kiện Phase 1 là hoàn tất.

Điều kiện hoàn thành: refresh lạnh vẫn điều khiển được; model lỗi thì hình người cũ xuất hiện; build không chứa model cảnh lớn trong tuyến tải đầu.

### Phase 2 - Slime theo hệ thống instance

- [x] Tạo catalog Cryo/Fire/Electro theo seed.
- [x] Trích geometry/material có thể dùng chung.
- [x] Giữ AI, HP, truy đuổi, tấn công và đánh dấu minimap hiện tại.
- [x] Thêm animation thủ tục ở cấp instance.
- [x] Giữ fallback quái hình khối khi asset đang tải hoặc tải lỗi.

Trạng thái kiểm chứng: production build đã thành công. Ba model slime được phát hành thành asset riêng với tổng dung lượng khoảng 3.3 MB; rương và model cảnh lớn không xuất hiện trong `dist`. Ba loại slime hiện dùng tổng cộng 14 mesh con, nên số draw call của lớp slime không tăng theo số lượng quái. Hình dáng, hướng model và FPS khi có nhiều slime vẫn cần kiểm tra trực tiếp trong trình duyệt trước khi coi toàn bộ điều kiện Phase 2 là hoàn tất.

Điều kiện hoàn thành: số quái và logic chiến đấu không đổi; draw call và FPS nằm trong ngân sách.

### Phase 3 - Vật phẩm và rương

- [x] Chọn mesh primogem cần thiết rồi instance hóa.
- [ ] Tối ưu rương xuống ngân sách web.
- [x] Tích hợp rương nguồn hiện tại theo quyết định tạm thời, giữ save ID hiện tại.
- [x] Không tải rương nếu vùng render không có rương.

Trạng thái kiểm chứng: primogem đã dùng mesh `Primogem_2_Primo_0` từ GLB nguồn và render bằng `InstancedMesh`, có fallback tinh thể hình học khi asset chưa tải hoặc tải lỗi. Logic nhặt vật phẩm, inventory và save ID không đổi. Rương nguồn hiện tại đã được đưa vào runtime bằng `InstancedMesh` nhiều mesh con và chỉ mount khi vùng render có rương. Model rương vẫn chưa được tối ưu; đây là quyết định tạm thời để có hình thật trước, sau đó thay bằng bản runtime nhẹ khi có asset phù hợp.

Điều kiện hoàn thành: nhặt vật phẩm, mở rương, lưu và tải lại không sinh trùng phần thưởng.

### Phase 4 - Animation có skeleton

Phase này chỉ hoàn tất đầy đủ khi có model/clip phù hợp. Với asset hiện tại, chỉ có thể triển khai hạ tầng mixer và fallback procedural.

- [x] Tích hợp `AnimationMixer`.
- [x] Chuyển clip theo `movementState` với cross-fade nếu model có clip tương ứng.
- [ ] Đồng bộ idle/walk/run/jump/fall/swim/climb/mantle/attack bằng animation thật.
- [ ] Gắn kiếm vào bone bàn tay hoặc bone lưng.
- [x] Không tạo mixer mới trong mỗi frame.

Trạng thái kiểm chứng: `PlayerGltfModel` đã có clip map cho idle/walk/run/jump/fall/swim/climb/mantle và chỉ tạo mixer khi GLB có `animations`. Model Aether hiện tại không có animation clip, skeleton hoặc bone gắn kiếm, nên chuyển động nhìn thấy vẫn là procedural bob/tilt và kiếm vẫn gắn bằng offset trên lưng.

Điều kiện hoàn thành: không trượt chân rõ rệt, không giật khi chuyển trạng thái và leo/bơi không phá camera.

### Phase 5 - Landmark núi tối ưu

Phase này chưa thể triển khai bằng asset hiện có.

- [ ] Có model low-poly và các LOD.
- [ ] Có collider đơn giản riêng.
- [ ] Sinh landmark xác định theo seed và đủ thưa.
- [ ] Streaming theo khoảng cách, có hủy tài nguyên đúng cách.
- [ ] Hiển thị ký hiệu địa hình phù hợp trên minimap/world map.

Điều kiện hoàn thành: đi vào/ra vùng landmark nhiều lần không tăng RAM liên tục và không tạo khe terrain.

## 8. Chế độ chất lượng model

Settings nên có mục `Chất lượng model`:

- `Thấp`: luôn dùng hình học thủ tục cho quái và vật thể; nhân vật có thể dùng model nhẹ.
- `Trung bình`: model nhân vật và slime gần, fallback cho entity xa.
- `Cao`: model đã tối ưu, shadow gần và khoảng hiển thị lớn hơn.

Thiết lập phải được đọc khi tạo render group, không làm thay đổi spawn, save hoặc dữ liệu khám phá.

## 9. Quy trình tối ưu asset trước khi dùng

1. Giữ bản GLB nguồn trong kho tài nguyên.
2. Tạo bản runtime riêng bằng công cụ tối ưu GLTF.
3. Loại node, camera, light và animation không dùng.
4. Gộp mesh/material khi không làm mất chức năng.
5. Nén geometry bằng Meshopt hoặc Draco sau khi đo thời gian giải nén.
6. Chuyển texture sang KTX2/Basis khi pipeline hỗ trợ.
7. So sánh ảnh trước/sau và đo dung lượng, triangle, draw call, thời gian tải.
8. Chỉ code import bản runtime đã đạt ngân sách.

Không ghi đè model nguồn khi tối ưu. Bản runtime nên nằm trong thư mục riêng để có thể tái tạo và so sánh.

## 10. Kiểm thử bắt buộc

### Chức năng

- Player vẫn đi, chạy, nhảy, bơi, leo, mantle và teleport đúng.
- Model luôn theo local coordinate sau khi đổi origin chunk.
- Kiếm không lệch khỏi nhân vật khi xoay hoặc leo.
- Quái hiển thị đúng vị trí trên thế giới, minimap và world map.
- Vật phẩm/rương không xuất hiện lại sau khi đã lưu trạng thái.

### Hiệu năng

- Đo cold load khi tắt cache trình duyệt.
- Đo FPS, RAM, draw call và triangle tại đồng bằng, rừng dày và vùng nhiều quái.
- Chạy liên tục ít nhất 10 phút qua nhiều chunk.
- So sánh local production build với Vercel, không dùng Vite dev mode làm mốc duy nhất.
- Kiểm tra mạng chậm để chắc chắn fallback vẫn hiện và gameplay không khóa.

### Responsive

- Desktop 1920x1080 và màn hình cửa sổ nhỏ.
- Mobile ngang và dọc.
- Thiết bị DPR cao phải áp dụng giới hạn pixel ratio hiện có.
- Model không che HUD, minimap hoặc nút cảm ứng.

## 11. Thứ tự đề xuất khi bắt đầu code

Thứ tự an toàn và có kết quả nhìn thấy sớm:

1. Hoàn thành asset manifest và kiểm tra giấy phép.
2. Tích hợp Aether + kiếm với fallback, chưa đụng logic gameplay.
3. Tích hợp ba slime bằng batching/instancing.
4. Tích hợp primogem.
5. Tối ưu rồi mới tích hợp rương.
6. Chờ model có skeleton để làm animation đầy đủ.
7. Chờ bản núi low-poly + LOD + collider trước khi làm landmark.

Các model hiện có đủ để bắt đầu Phase 0, Phase 1 và phần lớn Phase 2. Chưa đủ tài nguyên để hoàn thành animation nhân vật chuẩn hoặc landmark núi dùng ổn định trong thế giới vô hạn.
