# Blueprint môi trường procedural: cỏ, cây và núi

## 1. Quyết định kiến trúc

Cỏ, cây và núi không dùng GLB trong runtime. Chúng được tạo bằng geometry đơn giản, shader và dữ liệu procedural theo seed. Model chỉ giữ cho nhân vật, slime, rương và vật phẩm đặc biệt vì số lượng của chúng nhỏ và có giới hạn.

Các file `realistics_grass_06.glb`, `tree_animate.glb`, `hero_mountain.glb` và model Haytor có thể giữ trong thư mục nguồn để tham khảo, nhưng không được import từ code runtime và không xuất hiện trong `dist`.

Nguồn tham khảo là `references/brunosimon-infinite-world`, giấy phép khai báo ISC trong `package.json`. Chỉ học cách tổ chức geometry/shader; phần triển khai phải viết lại cho Three.js hiện tại, React Three Fiber, chunk worker, floating origin và biome của dự án này.

## 2. Mục tiêu kỹ thuật

- Giữ thế giới xác định theo seed: cùng tọa độ luôn tạo cùng địa hình và thực vật.
- Không tạo React component cho từng lá cỏ hoặc từng cây.
- Không cấp phát geometry/material mới trong vòng lặp render.
- Khi người chơi đi lâu, số object GPU và bộ nhớ phải có trần cố định.
- Terrain procedural tiếp tục là nguồn duy nhất cho collision, đi bộ, bơi, leo trèo, minimap và world map.
- Cảnh gần đẹp và có chuyển động; cảnh xa chuyển sang hình học đơn giản hoặc màu terrain.

Ngân sách mục tiêu ở cấu hình mặc định:

| Hạng mục | Giới hạn |
| --- | ---: |
| Cỏ gần | tối đa 40.000 tam giác, 1 draw call |
| Cây gần | tối đa 2 draw call cho thân và tán |
| Cây xa | tối đa 1 draw call dạng billboard hoặc low-poly |
| Núi | nằm trong terrain chunk, không có draw call GLB riêng |
| Shadow thực vật | chỉ cây rất gần; cỏ không đổ bóng |
| Model môi trường trong `dist` | 0 byte |

## 3. Cỏ procedural

### Geometry

- Tạo một `BufferGeometry` duy nhất gồm lưới 160 x 160 đến 200 x 200 lá.
- Mỗi lá chỉ là một tam giác: hai đỉnh chân và một đỉnh ngọn.
- Lưu tâm lá, độ cao, độ rộng, độ lệch và số ngẫu nhiên vào vertex attributes.
- Geometry luôn bám quanh người chơi; shader dùng phép modulo để tái sử dụng cùng vùng cỏ khi di chuyển.

### Shader

Vertex shader chịu trách nhiệm:

- Xoay lá theo hướng camera để lá luôn có thể nhìn thấy.
- Lấy chiều cao và pháp tuyến terrain từ dữ liệu chunk gần.
- Không cho cỏ mọc trên nước, cát, núi hoặc mặt dốc vượt ngưỡng.
- Làm ngọn cỏ dao động bằng noise theo thời gian; chân cỏ đứng yên.
- Thu nhỏ rồi biến mất mềm theo khoảng cách, không pop đột ngột.

Fragment shader dùng hai hoặc ba sắc xanh theo độ cao lá, biome, ánh sáng và noise nhẹ. Không dùng `MeshStandardMaterial`, texture GLB hoặc shadow map cho cỏ.

### Tích hợp dữ liệu

Phương án đầu tiên dùng texture dữ liệu nhỏ được cập nhật khi người chơi đổi ô/chunk. Texture chứa `height`, `normalY`, `biome` và `grassMask` của các chunk gần. CPU không cập nhật hàng nghìn instance matrix khi người chơi bước sang ô mới.

Mức chất lượng:

- Low: 100 x 100 lá, bán kính ngắn, không wind noise thứ hai.
- Medium: 160 x 160 lá.
- High: 200 x 200 lá, gió và biến thiên màu đầy đủ.

## 4. Cây procedural

### Cây gần

- Dùng `InstancedMesh`, một geometry thân và một geometry tán.
- Thân là cylinder 5 hoặc 6 cạnh, có biến thiên chiều cao và độ nghiêng.
- Tán gồm 2-3 cone low-poly chồng nhau hoặc cụm icosahedron thấp; vẫn gộp thành một geometry trước khi instance.
- Màu thân/tán, tỉ lệ và rotation lấy từ hash của `tree.id`.
- Vertex shader cho tán rung nhẹ; gốc và thân dưới không chuyển động.

### Cây xa

- Từ LOD 2 chuyển thành một cone 4 cạnh hoặc billboard hai mặt.
- Không nhận/đổ bóng và dùng một material chung.
- Ngoài render distance chỉ còn màu biome trên terrain.

### Phân bố

Giữ nguyên `chunk.trees` do worker sinh để không đổi seed, minimap và thống kê khám phá. Renderer chỉ quyết định LOD theo khoảng cách. Cây model cũ không còn fallback runtime; fallback cuối cùng là cây cone/cylinder procedural.

## 5. Núi procedural

Núi không phải object đặt lên mặt đất. Núi là một phần của heightfield terrain hiện tại.

### Hình dáng

- Kết hợp noise tần số thấp để tạo khối núi lớn với ridge noise để tạo sống núi.
- Dùng domain warping nhẹ để đường núi bớt tròn và lặp.
- Giữ biên chunk liên tục bằng cách chỉ lấy noise từ tọa độ thế giới tuyệt đối.
- Tăng subdivision cho chunk núi gần; chunk xa dùng index LOD hiện có.
- Giữ skirt ở biên chunk để che khe khi hai LOD khác nhau.

### Vật liệu

- Trộn màu theo biome, độ cao và độ dốc: cỏ ở chân, đất ở dốc vừa, đá ở dốc lớn, màu sáng nhẹ ở đỉnh cao.
- Dùng vertex color hoặc shader terrain chung, không dùng texture/model núi 50-60 MB.
- Thêm chi tiết đá bằng noise trong shader, không tăng geometry.

### Gameplay và bản đồ

Collision và leo trèo tiếp tục đọc cùng `heights` và `terrainNormals`; không tạo mesh collider thứ hai. Minimap/world map suy ra ký hiệu núi từ biome, độ cao và độ dốc nên hình trên bản đồ khớp địa hình thật.

## 6. Các phase triển khai

### Phase P1 - Loại model môi trường khỏi runtime

- [x] Thay `GrassModelRing` bằng renderer cỏ shader.
- [x] Thay `TreeModelInstances` bằng cây procedural có LOD.
- [x] Gỡ `MountainLandmarks` khỏi `WorldRenderer`.
- [x] Xóa mọi import runtime tới bốn GLB môi trường.
- [x] Build và xác nhận các GLB môi trường không xuất hiện trong `dist/assets`.

### Phase P2 - Cỏ shader

- [x] Tạo geometry một tam giác mỗi lá và một draw call.
- [x] Tạo terrain-data texture cho vùng quanh người chơi.
- [x] Bám chiều cao, biome và độ dốc theo dữ liệu chunk.
- [x] Thêm billboard, wind, distance fade và ba mức chất lượng.
- [x] Không cập nhật từng instance matrix khi nhân vật di chuyển.

### Phase P3 - Cây procedural đẹp và có LOD

- [x] Tạo thân/tán low-poly dùng geometry/material chung.
- [x] Thêm biến thiên theo seed mà không làm thay đổi spawn.
- [x] Thêm gió ở tán bằng shader.
- [ ] Chuyển LOD gần/xa không tạo pop rõ rệt.
- [x] Giới hạn shadow vào cây gần camera.

### Phase P4 - Núi đẹp hơn

- [x] Bổ sung ridge noise và domain warping vào height generation.
- [x] Kiểm tra liên tục tại biên chunk và floating origin bằng self-test.
- [x] Trộn màu đá/cỏ theo độ dốc và độ cao.
- [x] Đồng bộ dữ liệu núi trên minimap và world map qua `sampleHeight` dùng chung.
- [ ] Kiểm tra đi bộ, leo, trượt, bơi và teleport tại vùng núi.

### Phase P5 - Đo và khóa hiệu năng

- [ ] So sánh FPS đứng yên, chạy liên tục 5 phút và đi qua rừng/núi.
- [ ] Ghi triangles, draw calls, RAM và thời gian worker ở Low/Medium/High.
- [ ] Xác nhận cache/render object không tăng vô hạn sau khi đi xa.
- [x] Kiểm tra render desktop bằng ảnh Chrome headless.
- [ ] Kiểm tra màn hình nhỏ.
- [x] Build qua và không còn GLB môi trường trong bundle.

Trạng thái kiểm chứng hiện tại: production build và 11 nhóm self-test đều qua. Ảnh Chrome headless 1440 x 900 xác nhận cỏ và cây procedural render đúng; lỗi cây đen do instance color đã được phát hiện và sửa. Đo FPS chạy 5 phút, kiểm tra chuyển LOD khi di chuyển và màn hình nhỏ vẫn để mở, không đánh dấu hoàn thành giả.

## 7. Thứ tự ưu tiên

Triển khai P1 và P2 trước vì cỏ GLB đang gây chi phí lớn nhất theo số lượng. Sau đó làm cây procedural ở P3. P4 thay đổi thuật toán terrain và tác động collision/map nên phải làm sau, có self-test biên chunk riêng. P5 là cổng bắt buộc trước khi commit phase cuối.

Không xóa các GLB nguồn trong phase đầu. Chỉ loại chúng khỏi import runtime để có thể đối chiếu hình dáng trong lúc thiết kế procedural.
