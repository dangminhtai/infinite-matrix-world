Bạn là senior game engineer chuyên React, TypeScript, Three.js, React Three Fiber và tối ưu game WebGL trên desktop/mobile.

Hãy nâng cấp source hiện tại của dự án “Infinite Hybrid Matrix World” thành một game thế giới mở góc nhìn thứ ba, phong cách fantasy anime nhẹ nhàng, lấy cảm hứng về cảm giác khám phá từ các game như Genshin Impact nhưng tuyệt đối không sao chép nhân vật, tài sản, âm thanh, bản đồ, biểu tượng hoặc giao diện có bản quyền.

KHÔNG viết lại dự án từ đầu. Trước tiên phải đọc toàn bộ source hiện tại, hiểu luồng sinh chunk, floating origin, worker, cache, terrain, player, camera, HUD và điều khiển. Giữ nguyên thuật toán thế giới vô hạn và kiến trúc đang hoạt động, chỉ refactor khi thật sự cần thiết.

==================================================
I. MỤC TIÊU CHÍNH
==================================================

Biến prototype hiện tại thành một vertical slice game thế giới mở có:

1. Điều khiển nhân vật góc nhìn thứ ba mượt.
2. Camera độc lập với phím di chuyển.
3. HUD chơi game tối giản, không che bản đồ.
4. Menu Settings chứa toàn bộ công cụ kỹ thuật.
5. Thế giới có khám phá, vật phẩm, tương tác và chiến đấu cơ bản.
6. Hoạt động tốt trên cả máy tính và điện thoại.
7. Ưu tiên FPS, độ ổn định và kiến trúc có thể mở rộng.
8. Không phá vỡ tính xác định của thế giới theo seed và tọa độ.

Không triển khai mọi tính năng lớn cùng lúc. Làm lần lượt theo từng phase bên dưới, kiểm tra và báo cáo kết quả sau mỗi phase.

==================================================
II. NGUYÊN TẮC BẮT BUỘC
==================================================

- Không thay đổi thuật toán sinh thế giới nếu không có lý do rõ ràng.
- Không tạo abstraction thừa.
- Không thêm thư viện nặng khi chức năng có thể viết bằng Three.js/R3F hiện tại.
- Không dùng physics engine lớn trong MVP.
- Không tạo hàng trăm React component cập nhật mỗi frame.
- Không lưu trạng thái chuyển động nhanh bằng React state.
- Dữ liệu cập nhật mỗi frame phải dùng ref, object mutable hoặc game store phù hợp.
- Không tạo object/vector mới liên tục trong useFrame.
- Tái sử dụng Vector3, Quaternion, Matrix4 và Euler tạm.
- Không dùng fallback để giấu lỗi.
- Khi có lỗi phải tìm và sửa nguyên nhân gốc.
- Chạy TypeScript build sau mỗi phase.
- Không được làm giảm tính xác định: cùng seed + cùng tọa độ phải tạo cùng thế giới.
- Các thay đổi phải hoạt động với floating origin và tọa độ BigInt hiện tại.

==================================================
III. PHASE 0 — SỬA LỖI NỀN TẢNG TRƯỚC
==================================================

Trước khi thêm gameplay, sửa các vấn đề sau:

1. selfTest chỉ được chạy trong development:

if (import.meta.env.DEV) {
selfTest();
}

Tốt hơn là chuyển thành test riêng, không chạy khi người dùng mở game production.

2. Loại bỏ hoặc giới hạn mọi cấu trúc tăng vô hạn:

- queue
- visitedChunks
- seenDecorKeys
- request history
- debug history

Dùng bounded LRU, bounded Set hoặc chỉ lưu dữ liệu thật sự cần thiết.

3. Worker request phải có generationId/seedVersion:

- Khi đổi seed, teleport hoặc clear cache, tăng generationId.
- Bỏ mọi response thuộc generation cũ.
- Khi worker lỗi phải xóa request khỏi pending để có thể thử lại.
- Clear cache phải gửi message clear thật sự đến worker.
- Worker clear chỉ trả acknowledgement, không tự sinh chunk 0,0.

4. Tách LIMB_MASK khỏi số nguyên tố P:

const LIMB_BITS = 61n;
const LIMB_MASK = (1n << LIMB_BITS) - 1n;

Không dùng P như bit mask.

5. Xóa dependency và code không dùng.
6. Kiểm tra npm build phải thành công.

==================================================
IV. PHASE 1 — SỬA HOÀN TOÀN CAMERA VÀ ĐIỀU KHIỂN
==================================================

Lỗi hiện tại:
Khi người chơi chỉ nhấn W, A, S, D thì bản đồ/camera tự xoay. Đây là hành vi sai.

Nguyên nhân cần kiểm tra:

- Camera yaw bị tính lại từ hướng di chuyển.
- camera.lookAt làm thay đổi hướng camera ngoài ý muốn.
- Hướng nhân vật và hướng camera đang dùng chung một biến rotation.
- OrbitControls hoặc camera controller nhận input không đúng.
- Camera follow đang nội suy cả vị trí lẫn góc dựa theo player rotation.

Thiết kế điều khiển mới:

A. Camera

Camera có state độc lập:

cameraYaw
cameraPitch
cameraDistance
cameraTargetHeight

Chỉ được thay đổi yaw/pitch khi:

Desktop:

- Người dùng giữ chuột phải hoặc pointer lock rồi kéo chuột.
- Có thể hỗ trợ kéo chuột trái nếu không xung đột gameplay.
- Con lăn thay đổi khoảng cách camera.

Mobile:

- Kéo ở nửa phải màn hình để xoay camera.
- Pinch hoặc tùy chọn zoom để thay đổi khoảng cách.
- Joystick bên trái tuyệt đối không được xoay camera.

WASD và joystick không được trực tiếp thay đổi cameraYaw hoặc cameraPitch.

Camera follow:

- Target là vị trí player cộng offset chiều cao.
- Vị trí mong muốn được tính từ yaw, pitch và distance.
- Nội suy vị trí bằng damping theo delta time.
- Nội suy target bằng damping riêng.
- Không buộc yaw camera bằng rotation của player.
- Khi player chạy, camera giữ nguyên góc nhìn nếu người dùng không xoay camera.
- Có collision camera đơn giản với terrain để camera không chui xuống đất.
- Giới hạn pitch hợp lý, ví dụ từ -10° đến 65°.
- Không để camera lật ngược.

B. Di chuyển nhân vật

WASD phải di chuyển tương đối theo hướng nhìn của camera trên mặt phẳng XZ:

cameraForward.y = 0
cameraRight.y = 0

movement =
cameraForward _ inputForward +
cameraRight _ inputRight

Sau đó normalize movement nếu độ dài lớn hơn 1.

Nhân vật:

- Di chuyển theo movement.
- Chỉ nhân vật quay dần theo hướng di chuyển.
- Dùng quaternion hoặc lerpAngle để tránh giật khi đi qua góc ±π.
- Camera không quay theo nhân vật.
- W đi về phía trước theo camera.
- S đi lùi theo camera.
- A/D đi ngang theo camera.
- Hỗ trợ chạy chéo nhưng không nhanh hơn chạy thẳng.
- Movement phải nhân delta time, không phụ thuộc FPS.

C. Trạng thái chuyển động

Tối thiểu:

- idle
- walk
- run
- jump
- fall

Phím:

- WASD: di chuyển
- Shift: chạy
- Space: nhảy
- Escape: mở menu
- Chuột/touch phải: xoay camera

Mobile:

- Joystick trái: di chuyển
- Vùng vuốt phải: xoay camera
- Nút nhảy
- Nút chạy hoặc auto-run tùy settings
- Nút tương tác
- Nút tấn công

D. Tiêu chí nghiệm thu camera

Phải kiểm tra đủ:

1. Đứng yên, kéo camera: camera quay quanh nhân vật.
2. Nhấn W liên tục 10 giây mà không kéo chuột: camera không tự xoay.
3. Nhấn A/D: camera không tự xoay.
4. Nhấn W+A: tốc độ không vượt tốc độ chạy thẳng.
5. Xoay camera 180° rồi nhấn W: player chạy theo hướng camera mới.
6. Player đổi hướng, camera vẫn giữ yaw hiện tại.
7. Mobile joystick không làm vùng camera nhận nhầm touch.
8. FPS khác nhau vẫn cho tốc độ di chuyển giống nhau.

==================================================
V. PHASE 2 — THIẾT KẾ LẠI HUD VÀ SETTINGS
==================================================

HUD mặc định hiện tại đang che quá nhiều màn hình.

HUD gameplay mặc định chỉ được hiển thị:

- Thanh máu nhỏ.
- Thanh stamina.
- Minimap.
- Tâm ngắm hoặc dấu tương tác khi cần.
- Nút kỹ năng/tấn công trên mobile.
- Thông báo nhặt vật phẩm ngắn hạn.

Không hiển thị mặc định:

- World coordinate
- Chunk coordinate
- Render distance
- Seed
- Teleport
- Clear cache
- Reset camera
- Debug
- Performance
- Journey debug
- Worker timing
- Triangle count
- Draw calls

Tất cả các mục trên phải chuyển vào menu Settings hoặc Developer Tools.

Tạo nút menu hình bánh răng hoặc mở bằng Escape.

Settings gồm các tab:

1. Gameplay

- Camera sensitivity
- Camera distance
- Invert Y
- Auto-run
- Show minimap

2. Graphics

- Quality preset: Low / Medium / High / Auto
- Render distance
- Terrain detail
- Vegetation density
- Shadow quality
- Water quality
- Pixel ratio
- FPS limit: 30 / 45 / 60 / Auto
- Fog quality
- Enable/disable decorative grass
- Enable/disable flowers
- Enable/disable distant shadows

3. Controls

- Key bindings desktop
- Joystick size
- Joystick opacity
- Touch camera sensitivity

4. World

- Seed
- Apply seed
- Teleport
- Reset position
- Clear world cache

5. Developer

- FPS
- Frame time
- Worker average/max
- Triangles
- Draw calls
- Loaded chunks
- Pending chunks
- Cache size
- Estimated memory
- Floating origin
- Debug chunk borders
- Debug collision
- Run self tests

Developer tab có thể bị ẩn trong production hoặc chỉ mở khi bật Developer Mode.

Settings phải:

- Responsive trên mobile.
- Có nền tối mờ nhưng không dùng blur quá nặng.
- Không render lại toàn bộ Canvas mỗi khi thay đổi một input.
- Lưu cấu hình phù hợp vào localStorage.
- Có nút Reset to defaults.

==================================================
VI. PHASE 3 — HỆ THỐNG CHẤT LƯỢNG ĐỒ HỌA TỰ ĐỘNG
==================================================

Tạo QualityManager độc lập.

Preset gợi ý:

LOW:

- devicePixelRatio tối đa 1.0
- render radius nhỏ
- ít vegetation
- shadow tắt hoặc rất thấp
- water đơn giản
- terrain LOD thấp
- fog ngắn hơn để che khoảng render

MEDIUM:

- pixel ratio tối đa 1.25
- shadow vừa
- vegetation trung bình
- render radius trung bình

HIGH:

- pixel ratio tối đa 1.5 hoặc 2 tùy thiết bị
- shadow cao hơn
- vegetation nhiều hơn
- render distance xa hơn

AUTO:

- Đo FPS trung bình trong cửa sổ 3–5 giây.
- Không thay đổi chất lượng liên tục.
- Nếu FPS thấp hơn mục tiêu trong nhiều giây, giảm từng mức nhỏ.
- Nếu FPS ổn định cao trong thời gian dài, có thể tăng nhẹ.
- Có cooldown ít nhất 10 giây giữa hai lần đổi.
- Không đổi seed hoặc nội dung gameplay khi đổi chất lượng.
- Chỉ thay đổi mật độ/LOD/hiệu ứng hiển thị.

Mục tiêu hiệu năng:

Desktop phổ thông:

- 60 FPS ổn định.
- Frame time phần lớn dưới 16.7 ms.

Điện thoại tầm trung:

- Mục tiêu 45–60 FPS.
- Không được tụt lâu dưới 30 FPS.

Ngân sách mobile ban đầu:

- Visible triangles khoảng 80k–180k.
- Draw calls lý tưởng dưới 80, tối đa khoảng 120.
- Không tạo hàng nghìn mesh riêng lẻ.
- Không upload lại geometry mỗi frame.
- Không tạo texture lớn không cần thiết.

==================================================
VII. PHASE 4 — TỐI ƯU RENDER VÀ CHUNK
==================================================

1. Terrain

- Chunk gần dùng LOD cao.
- Chunk xa dùng LOD thấp.
- Có terrain skirt để che khe LOD.
- Không tái tạo geometry nếu chunk không thay đổi.
- Dispose geometry/material đúng lúc.
- Normal giữa mép chunk phải nhất quán, tránh seam ánh sáng.

2. Object

- Cây, đá, hoa, cỏ dùng InstancedMesh.
- Chia instance theo loại và theo vùng.
- Có frustum culling.
- Có distance culling.
- Có LOD hoặc thay mesh xa bằng billboard/mesh đơn giản.
- Không tạo React component riêng cho mỗi cây hoặc mỗi viên đá.

3. Worker

- Ưu tiên sinh chunk theo khoảng cách và hướng player đang di chuyển.
- Chunk trước mặt có ưu tiên cao hơn chunk phía sau.
- Hủy hoặc bỏ qua job không còn cần thiết.
- Giới hạn số job pending.
- Có cache random/noise hợp lý trong worker.
- Transfer ArrayBuffer, không clone dữ liệu lớn.
- Không sinh lại chunk đang có trong cache.

4. Main thread

- Không setState mỗi frame.
- HUD chỉ cập nhật FPS 2–4 lần/giây.
- Minimap cập nhật ở tần số thấp hơn gameplay nếu cần.
- Không sort mảng lớn mỗi frame.
- Dùng spatial query đơn giản cho object gần player.

5. Shadows

- Chỉ dùng một directional light chính.
- Shadow map có giới hạn.
- Shadow camera đi theo player.
- Chỉ player và object gần mới cast shadow ở mobile.
- Không bật shadow cho toàn bộ cây xa.

6. Material

- Chia sẻ material và geometry.
- Tránh transparent material hàng loạt.
- Tránh post-processing trong MVP.
- Không dùng SSAO, bloom hoặc depth of field mặc định trên mobile.

==================================================
VIII. PHASE 5 — GAMEPLAY THẾ GIỚI MỞ MVP
==================================================

Sau khi camera và FPS ổn định, thêm gameplay nhỏ nhưng hoàn chỉnh.

1. Player

- Máu.
- Stamina.
- Chạy tiêu hao stamina.
- Nhảy.
- Rơi và tiếp đất.
- Có animation state machine, trước mắt có thể dùng model placeholder hợp pháp.
- Sau này dễ thay bằng GLTF nhân vật riêng.

2. Bơi

- Phát hiện vùng nước từ biome/collision data xác định của chunk, không dựa vào raycast toàn scene.
- Player được phép đi từ bờ xuống nước; water không còn là ô bị chặn tuyệt đối.
- Khi thân player chạm mặt nước, chuyển sang trạng thái swim và nổi ở cao độ mặt nước ổn định.
- Di chuyển bơi vẫn tương đối theo camera và nhân delta time.
- Bơi thường có tốc độ thấp hơn đi bộ; giữ Shift để bơi nhanh và tiêu hao stamina.
- Stamina hồi khi đứng trên đất, không hồi khi đang bơi.
- Khi stamina bằng 0, player chỉ bơi chậm và bắt đầu mất máu theo thời gian; không chết chìm ngay lập tức.
- Khi máu bằng 0, đưa player về vị trí đất an toàn gần nhất đã ghi nhận.
- Space tạo một nhịp nổi/đạp nước ngắn; không triển khai lặn tự do trong MVP.
- Khi đi từ nước vào ô đất walkable, player tự rời trạng thái swim và bám lại độ cao terrain.
- Camera giữ yaw/pitch độc lập khi bơi và không bị kéo xuống dưới mặt nước.
- Mobile dùng joystick để bơi, nút chạy để bơi nhanh và nút nhảy để đạp nước.
- Tối thiểu có animation state swim; model placeholder có thể dùng chuyển động tay/chân procedural.

3. Tương tác

- Vật phẩm thu thập được.
- Rương.
- Điểm hồi phục.
- Hiển thị nút “Tương tác” khi đủ gần.
- Không kiểm tra toàn bộ object mỗi frame; chỉ query object lân cận.

4. Inventory

- Inventory đơn giản.
- Stack item.
- Hiển thị icon placeholder nhẹ.
- Lưu localStorage.
- Không cần hệ thống trang bị phức tạp trong MVP.

5. Combat cơ bản

- Một đòn đánh thường.
- Một kỹ năng có cooldown.
- Hitbox đơn giản.
- Quái có HP.
- Quái đi tuần trong phạm vi nhỏ.
- Quái đuổi player khi ở gần.
- Quái trở về khu vực spawn nếu player đi quá xa.
- Không chạy AI cho quái ở chunk xa.
- Entity xa phải sleep hoàn toàn.

6. Spawn xác định
   Rương, tài nguyên, điểm hồi phục và quái phải được sinh deterministically từ:

seed
chunk coordinate
entity salt

Không lưu toàn bộ thế giới vô hạn.

Chỉ lưu thay đổi của người chơi dưới dạng sparse world modifications, ví dụ:

- rương đã mở
- vật phẩm đã nhặt
- quái đặc biệt đã bị tiêu diệt

Khóa lưu phải dựa trên seed + chunk + entityId.

==================================================
IX. KIẾN TRÚC ĐỀ XUẤT
==================================================

Không bắt buộc đổi đúng tên nếu source hiện tại đã có cấu trúc tương đương.

src/
game/
core/
GameLoop.ts
GameState.ts
InputManager.ts
QualityManager.ts
SaveManager.ts
player/
PlayerController.tsx
PlayerMovement.ts
PlayerState.ts
PlayerModel.tsx
Swimming.ts
camera/
ThirdPersonCamera.tsx
CameraCollision.ts
world/
ChunkManager.ts
TerrainChunk.tsx
WorldStreamer.ts
spawn/
deterministicSpawn.ts
entities/
EntityManager.ts
Enemy.ts
Collectible.ts
Chest.ts
combat/
CombatSystem.ts
Hitbox.ts
ui/
HUD.tsx
Minimap.tsx
SettingsMenu.tsx
InventoryMenu.tsx
MobileControls.tsx
DeveloperPanel.tsx
workers/
terrain.worker.ts

Không chuyển toàn bộ logic game vào React Context.

==================================================
X. QUY TẮC CAMERA CỤ THỂ CẦN TUÂN THỦ
==================================================

Camera yaw/pitch là nguồn sự thật duy nhất cho hướng camera.

Không được làm:

cameraYaw = player.rotation.y

Không được tự gọi camera.lookAt theo cách làm mất yaw/pitch do người dùng điều khiển.

Mỗi frame thực hiện theo thứ tự:

1. Đọc input.
2. Tính movement tương đối theo camera yaw.
3. Cập nhật vị trí và rotation player.
4. Cập nhật camera target từ vị trí player.
5. Tính camera desired position từ yaw/pitch/distance.
6. Xử lý camera collision.
7. Damping camera đến vị trí mong muốn.
8. Camera nhìn vào target.
9. Cập nhật world streaming/floating origin.
10. Render.

Camera không được phụ thuộc vào frame rate:

alpha = 1 - Math.exp(-damping \* delta)

Không dùng alpha cố định kiểu lerp(..., 0.1) mà không xét delta.

==================================================
XI. PERFORMANCE PROFILING
==================================================

Thêm công cụ đo thực tế:

- FPS trung bình.
- 1% low gần đúng.
- Frame time trung bình và max.
- Worker generation time.
- Main-thread chunk integration time.
- Loaded/pending chunk count.
- Geometry count.
- Texture count.
- Renderer.info.render.calls.
- Renderer.info.render.triangles.
- Renderer.info.memory.geometries.
- Renderer.info.memory.textures.

Không gọi tất cả phép đo nặng mỗi frame.

Developer panel chỉ cập nhật khoảng 2 lần/giây.

Phải phân biệt:

- JS heap.
- Dữ liệu chunk ước lượng.
- GPU/WebGL resource count.

Không ghi “RAM tổng” nếu số liệu chỉ là JS heap.

==================================================
XII. ACCEPTANCE CRITERIA CUỐI CÙNG
==================================================

Dự án chỉ được coi là hoàn thành MVP khi:

1. npm run build thành công.
2. Không có lỗi TypeScript.
3. WASD không làm camera tự xoay.
4. Camera desktop và mobile hoạt động độc lập.
5. HUD không còn che bản đồ.
6. Seed, teleport, debug và performance nằm trong Settings.
7. Có preset Low/Medium/High/Auto.
8. Game vẫn xác định theo seed và tọa độ.
9. Teleport xa không nhận chunk cũ từ worker.
10. Cache và history không tăng vô hạn.
11. Player có idle/walk/run/jump/fall/swim.
12. Player có thể đi từ bờ xuống nước, bơi bằng keyboard/joystick và trở lại bờ mà camera không giật.
13. Có ít nhất một vật phẩm, một rương, một điểm hồi phục và một quái.
14. Có save/load local.
15. Không tạo một mesh riêng cho từng cây/đá/hoa.
16. Mobile không nhận nhầm touch joystick thành xoay camera.
17. Có báo cáo trước/sau về:
    - FPS
    - triangles
    - draw calls
    - worker time
    - bundle size
18. Không thêm asset vi phạm bản quyền.
19. Không làm mất các tính năng world generation hiện tại.

==================================================
XIII. CÁCH LÀM VIỆC
==================================================

Trước khi code:

1. Tóm tắt kiến trúc source hiện tại.
2. Chỉ ra chính xác file gây ra camera tự xoay.
3. Giải thích nguyên nhân gốc.
4. Liệt kê file sẽ sửa.
5. Nêu rủi ro làm hỏng world streaming hoặc floating origin.
6. Đưa kế hoạch theo từng phase.

Sau mỗi phase:

1. Liệt kê thay đổi.
2. Chạy npm run build.
3. Báo lỗi thật, không che lỗi.
4. Đưa checklist kiểm thử thủ công.
5. Không chuyển sang phase tiếp theo nếu phase hiện tại chưa đạt.

Bắt đầu bằng PHASE 0 và PHASE 1. Chưa triển khai combat hoặc inventory cho đến khi camera, input và FPS đã ổn định. NPC và nhiệm vụ nằm ngoài phạm vi MVP hiện tại.
