# Blueprint hệ thống leo núi

## 1. Mục tiêu

Cho phép nhân vật leo các mặt núi dốc trong thế giới sinh thủ tục mà vẫn giữ được:

- Điều khiển mượt trên desktop và mobile.
- Camera độc lập với hướng di chuyển.
- Stamina có ý nghĩa như khi chạy và bơi.
- Tính đúng khi đi qua biên chunk và floating origin.
- Hiệu năng ổn định, không raycast toàn scene mỗi frame.
- Không cần thêm physics engine trong phiên bản đầu.

Hệ thống đầu tiên chỉ áp dụng cho terrain. Cây, đá trang trí, rương và entity chưa cần leo được vì chúng đang dùng `InstancedMesh` và không có collider riêng.

## 2. Hiện trạng kỹ thuật

Terrain hiện tại là heightfield sinh xác định theo seed:

- Mỗi chunk logic có kích thước `16 x 16` ô.
- Terrain render có lưới chi tiết cao hơn và được lưu trong payload typed array.
- Collision hiện chủ yếu sample height và cờ `walkable` theo ô.
- Biome núi đang không walkable, nên nhân vật bị chặn thay vì bám vào mặt dốc.
- Player chưa có capsule physics hoặc rigid body.
- Movement nằm trong game loop và đã nhân theo delta time.

Vì vậy không thể chỉ đổi `mountain` thành walkable. Làm vậy sẽ khiến nhân vật đi bộ xuyên dốc, rung theo height và mất phân biệt giữa đi bộ với leo.

## 3. Nguyên tắc thiết kế

1. Đi bộ và leo là hai trạng thái vật lý khác nhau.
2. Quyết định leo dựa trên độ dốc/surface normal, không chỉ dựa trên biome.
3. Collision phải sample dữ liệu terrain gần nhân vật, không raycast tất cả mesh.
4. Tọa độ thế giới vẫn dùng `BigInt + local offset`.
5. Mọi chuyển động leo phải nhân delta time.
6. Không tự xoay camera khi bắt đầu hoặc kết thúc leo.
7. Không cho leo nếu chunk cần thiết chưa tải.
8. Khi hết stamina phải rơi có kiểm soát, không teleport.

## 4. Surface sampler liên tục

Tạo helper mới:

```text
src/game/player/terrainSurface.ts
```

API đề xuất:

```ts
type TerrainSurface = {
  height: number;
  normal: { x: number; y: number; z: number };
  walkable: boolean;
  water: boolean;
  loaded: boolean;
};

sampleTerrainSurface(
  chunks,
  worldX,
  worldY,
  offsetX,
  offsetY
): TerrainSurface | null;
```

Sampler phải:

- Dùng nội suy song tuyến tính giữa các điểm height gần nhất.
- Tính gradient theo X/Z rồi tạo normal:

```ts
normal = normalize({ x: -dHeightDx, y: 1, z: -dHeightDz });
```

- Sample đúng khi tọa độ âm.
- Đọc được điểm ở chunk lân cận khi đứng sát seam.
- Trả `null` hoặc `loaded: false` nếu thiếu chunk, không tự đoán height.

Nên lấy dữ liệu collision từ lưới terrain có sẵn trong payload thay vì gọi lại noise trên main thread. Nếu việc đọc `terrainPositions` quá khó duy trì, Worker có thể trả thêm `collisionHeights` dạng `Float32Array`; không tạo object cho từng sample.

## 5. Phân loại bề mặt

Gọi `normal.y` là độ hướng lên của bề mặt.

Ngưỡng khởi đầu đề xuất:

```ts
const WALKABLE_NORMAL_Y = 0.72;
const CLIMBABLE_MIN_NORMAL_Y = 0.12;
const CLIMBABLE_MAX_NORMAL_Y = 0.72;
```

Ý nghĩa gần đúng:

- `normal.y >= 0.72`: đi bộ được.
- `0.12 <= normal.y < 0.72`: có thể leo.
- `normal.y < 0.12`: gần như mặt ngược/không ổn định, chưa cho leo trong MVP.

Với generator hiện tại, biome núi có thể tạo sườn dài với `normal.y` lớn hơn `0.72` nhưng vẫn bị đánh dấu không walkable. Vì vậy luật triển khai phải xem ô `mountain + non-walkable` là climbable; normal tiếp tục dùng để định hướng, làm mượt và xử lý các bề mặt dốc không thuộc biome núi.

Các ngưỡng phải đặt trong một file cấu hình và kiểm thử bằng nhiều loại núi. Không hard-code lặp lại trong game loop.

## 6. State machine của nhân vật

Mở rộng movement state:

```ts
type MovementState =
  | "idle"
  | "walk"
  | "run"
  | "jump"
  | "fall"
  | "swim"
  | "climbIdle"
  | "climb"
  | "mantle";
```

Luồng chính:

```text
walk/jump/fall
   -> phát hiện mặt dốc phía trước
   -> climbIdle hoặc climb
   -> leo tới mép -> mantle -> walk
   -> nhảy khỏi tường -> fall
   -> hết stamina -> fall
```

Không được chuyển trực tiếp từ `swim` sang `climb` nếu nhân vật vẫn nằm sâu trong nước. Chỉ cho bám khi gần bờ, phần thân trên đã chạm mặt terrain và surface hợp lệ.

## 7. Điều kiện bắt đầu leo

Mỗi frame chỉ kiểm tra vùng gần player bằng một số probe cố định:

1. Probe phía trước ngực.
2. Probe phía trước hông.
3. Probe phía trên đầu để tránh chui vào trần/mép kín.

Cho phép bắt đầu leo khi:

- Player đang đi, nhảy hoặc rơi chậm gần mặt terrain.
- Khoảng cách tới mặt dốc nhỏ hơn khoảng `0.45 m`.
- Surface normal nằm trong khoảng climbable.
- Player đang hướng tương đối về phía mặt dốc.
- Stamina lớn hơn ngưỡng tối thiểu, ví dụ `5`.
- Không ở trạng thái chết, teleport, mở menu hoặc mantle.
- Chunk hiện tại và chunk cần sample đều đã tải.

Desktop có thể tự bám khi người chơi giữ hướng tiến vào vách. Mobile cũng dùng joystick tiến vào vách, không cần thêm nút leo riêng trong MVP.

## 8. Trạng thái bám tường

Khi bắt đầu leo, lưu:

```ts
type ClimbContact = {
  worldX: bigint;
  worldY: bigint;
  localX: number;
  localY: number;
  normalX: number;
  normalY: number;
  normalZ: number;
  wallDistance: number;
};
```

Player được giữ cách mặt terrain một khoảng ổn định:

```ts
const CLIMB_BODY_OFFSET = 0.28;
```

Không snap vị trí bằng số nguyên. Dùng damping có delta time:

```ts
alpha = 1 - Math.exp(-climbAttachDamping * delta);
```

Mỗi frame phải sample lại contact gần vị trí mới. Nếu normal thay đổi, damp normal cũ sang normal mới để nhân vật không rung ở biên cell.

## 9. Di chuyển trên mặt núi

Tạo hai trục tiếp tuyến của mặt dốc:

```ts
wallRight = normalize(cross(worldUp, wallNormal));
wallUp = normalize(cross(wallNormal, wallRight));
```

Input joystick/WASD được đổi thành:

- Trái/phải: di chuyển theo `wallRight`.
- Lên/xuống: di chuyển theo `wallUp`.

Tốc độ đề xuất:

```ts
const CLIMB_SPEED = 1.8;
const CLIMB_SIDE_SPEED = 1.45;
```

Không dùng tốc độ chạy trên đất cho leo. Mỗi bước di chuyển phải probe contact mới trước khi chấp nhận vị trí.

Nếu mặt dốc kết thúc sang bên trái/phải, player dừng ở mép thay vì trượt vào không khí. Leo vòng qua góc terrain có thể để phase sau.

## 10. Stamina

Quy tắc đề xuất:

```ts
const CLIMB_IDLE_STAMINA_PER_SECOND = 2.5;
const CLIMB_MOVE_STAMINA_PER_SECOND = 10;
const CLIMB_JUMP_COST = 18;
```

- Đứng bám vẫn hao stamina chậm.
- Di chuyển khi leo hao nhanh hơn.
- Nhảy khỏi vách trừ stamina ngay.
- Không hồi stamina khi đang bám.
- Khi stamina về `0`, chuyển sang `fall` và khóa bám lại khoảng `0.6 s` để tránh bám/rơi liên tục.
- Chỉ hồi stamina khi đã đứng trên đất hợp lệ.

HUD dùng thanh stamina hiện có, không tạo thanh mới.

## 11. Nhảy khỏi vách

Khi đang leo và nhấn `Space`:

- Trừ `CLIMB_JUMP_COST`.
- Thêm vận tốc hướng ra khỏi wall normal.
- Thêm một phần vận tốc hướng lên.
- Chuyển sang `fall` hoặc `jump`.
- Đặt cooldown bám lại ngắn.

Ví dụ:

```ts
velocity = wallNormal * 3.2 + worldUp * 4.6;
```

Không đổi camera yaw. Hướng nhân vật có thể xoay ra khỏi vách bằng damping.

## 12. Leo qua mép núi

Mantle chỉ bắt đầu khi:

- Probe ngực không còn gặp vách.
- Probe phía trên và hơi tiến vào trong tìm được mặt walkable.
- Khoảng trống cho thân và đầu đủ lớn.
- Điểm đáp nằm trong chunk đã tải.

Mantle gồm ba đoạn ngắn:

1. Nâng thân lên.
2. Đẩy người vào phía mặt đất.
3. Đặt chân xuống surface walkable.

Thời gian đề xuất `0.3–0.45 s`. Dùng easing theo thời gian, không teleport ngay lên đỉnh.

Nếu probe mép thất bại, player tiếp tục `climbIdle` thay vì xuyên terrain.

## 13. Animation placeholder

Model hiện tại có thể dùng procedural animation:

- Thân nghiêng theo wall normal.
- Hai tay/chân chuyển động chéo nhau khi leo.
- `climbIdle`: chuyển động nhỏ, không vung tay liên tục.
- `climb`: tay trái/chân phải rồi tay phải/chân trái.
- `mantle`: tay nâng lên, thân dịch qua mép.

Animation chỉ đọc movement state và tốc độ, không được điều khiển collision.

## 14. Camera

- Giữ nguyên yaw/pitch do người dùng điều khiển.
- Camera target tăng nhẹ khi leo để nhìn được phía trên.
- Camera collision vẫn sample terrain, tránh chui vào núi.
- Không tự quay camera vuông góc với vách.
- Khi mantle, camera target damp theo player, không snap theo animation.
- Trên mobile, swipe camera vẫn độc lập với joystick leo.

## 15. Chunk seam và floating origin

- Surface sampler phải dùng cùng world coordinate ở hai phía seam.
- Normal hai chunk lân cận phải liên tục trong sai số cho phép.
- Contact lưu bằng `BigInt + local offset`, không lưu world position dưới dạng `number` lớn.
- Khi floating origin shift, contact point và player phải cùng dịch trong một frame.
- Không rebase giữa chừng trong một bước mantle; có thể hoàn thành mantle trước hoặc chuyển toàn bộ state đồng thời.
- Nếu chunk phía trên chưa tải, tạm dừng leo lên ở mép và yêu cầu chunk theo hướng player, không đoán terrain.

## 16. Hiệu năng

Không dùng:

- `raycaster.intersectObjects(scene.children, true)` mỗi frame cho climbing.
- Collider riêng cho từng triangle.
- Mesh collider cho từng cây/đá instance.
- Tạo object/vector mới hàng loạt trong game loop.

Mỗi frame chỉ nên có khoảng 3–6 surface sample gần player. Tái sử dụng vector tạm và contact object.

Developer panel nên bổ sung khi debug:

- Movement state.
- `normal.y` hiện tại.
- Climb contact distance.
- Số surface probe/frame.

Các thông số debug không cần hiển thị trong HUD gameplay.

## 17. File dự kiến

```text
src/game/player/
├── ClimbingController.ts
├── terrainSurface.ts
├── climbingConfig.ts
├── collision.ts
└── Player.tsx

src/game/
└── GameCanvas.tsx

src/ui/
├── HUD.tsx
└── SettingsMenu.tsx
```

Không bắt buộc tách controller thành React component. Logic vật lý nên là hàm TypeScript thuần để dễ self-test và không gây render React.

## 18. Các phase triển khai

### Phase A — Surface sampler

- Nội suy height liên tục.
- Tính normal.
- Sample xuyên chunk seam.
- Self-test tọa độ âm và seam.

### Phase B — Bám và leo cơ bản

- Thêm state `climbIdle`, `climb`.
- Probe mặt dốc.
- Di chuyển lên/xuống/trái/phải.
- Stamina và rơi khi kiệt sức.

### Phase C — Nhảy và mantle

- Nhảy khỏi vách.
- Cooldown bám lại.
- Probe mép và chuyển động mantle.

### Phase D — Animation, camera và mobile

- Procedural climb animation.
- Camera target khi leo.
- Điều khiển joystick và nút nhảy.
- Debug overlay developer.

### Phase E — Tối ưu và kiểm thử

- Kiểm tra FPS.
- Kiểm tra seam/floating origin.
- Kiểm tra teleport và unload chunk.
- Kiểm tra desktop/mobile/tablet.

## 19. Tiêu chí nghiệm thu

- Player không đi bộ xuyên mặt núi dốc.
- Giữ hướng tiến vào vách hợp lệ thì player bắt đầu leo.
- WASD/joystick di chuyển đúng trên mặt vách.
- Camera không tự xoay khi leo.
- Stamina giảm đúng theo thời gian và không phụ thuộc FPS.
- Hết stamina làm player rơi, không teleport.
- Nhấn `Space` khi leo làm player nhảy khỏi vách.
- Player leo qua mép và đứng đúng trên mặt walkable.
- Không xuyên terrain khi mantle thất bại.
- Leo qua chunk seam không rung hoặc đổi normal đột ngột.
- Floating origin không làm mất contact.
- Không bám vào nước, cây, đá instance hoặc mặt gần nằm ngang.
- Mobile joystick và camera swipe không xung đột.
- Không raycast toàn scene mỗi frame.
- Build và TypeScript thành công.
- Self-test có surface normal, seam, stamina và zoom-independent movement.

## 20. Phần chưa làm trong MVP leo núi

- Leo vòng qua góc lồi/lõm phức tạp.
- Leo cây hoặc đá instance.
- Trần và mặt đảo ngược.
- Hệ thống tay tìm điểm bám bằng IK.
- Animation GLTF chuyên nghiệp.
- Multiplayer prediction cho climbing.

Các phần này chỉ nên làm sau khi bám terrain, stamina, seam và mantle đã ổn định.
