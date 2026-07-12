# Blueprint nhân vật, chiến đấu và nâng cấp

## 1. Mục tiêu

Xây dựng vòng lặp gameplay gồm:

1. Khám phá thế giới để nhận Nguyên Thạch, Mora và nguyên liệu từ slime.
2. Dùng Nguyên Thạch mua và mở khóa nhân vật.
3. Chuyển sang nhân vật đã sở hữu để tiếp tục khám phá và chiến đấu.
4. Dùng Mora để tăng cấp nhân vật, tối đa cấp 100.
5. Mỗi nhân vật có HP, ATK và DEF riêng để tạo lựa chọn đội hình có ý nghĩa.
6. Mỗi slime có HP, ATK, DEF và cấp riêng; HUD phải cho người chơi thấy trạng thái chiến đấu.

Blueprint này chưa triển khai gacha, cung mệnh, thánh di vật, nguyên tố, kỹ năng riêng hoặc đội hình bốn người. Những hệ đó chỉ nên thêm sau khi vòng lặp mua - đổi - đánh - nâng cấp đã ổn định.

## 2. Hiện trạng đã kiểm tra

- Có sáu model trong `src/models/character`: Columbina, Furina, Hu Tao, Mavuika, Nahida và Zhongli.
- Aether hiện dùng model riêng `src/models/genshin_impact_aether.glb` và là nhân vật mặc định.
- Inventory đã có `primogem`, `mora` và `slime_condensate`.
- Nhặt vật phẩm đang nhận 1 Nguyên Thạch; rương nhận 500 Mora; hạ slime nhận 1 Dịch Slime.
- Slime hiện có 100 HP cố định, gây 8 sát thương và không có DEF/cấp/thanh HP riêng.
- Nhân vật hiện có 100 HP cố định; đòn thường gây 34 và kỹ năng gây 52 sát thương.
- Save hiện lưu theo seed trong localStorage và chưa có dữ liệu sở hữu, cấp hay nhân vật đang chọn.
- `PlayerGltfModel.tsx` đang import cứng Aether, vì vậy chưa thể đổi nhân vật bằng dữ liệu runtime.

## 3. Quyết định thiết kế cốt lõi

### 3.1 Aether là nhân vật khởi đầu

- Aether được mở khóa miễn phí ở cấp 1.
- Không được bán hoặc xóa Aether để người chơi luôn có nhân vật hợp lệ.
- Save cũ được tự động tạo profile có Aether, không mất inventory hay tiến trình khám phá.

### 3.2 Tiến trình nhân vật dùng chung giữa các seed

Sở hữu nhân vật và cấp nhân vật thuộc tài khoản/profile, không thuộc một thế giới cụ thể. Nếu lưu theo seed, người chơi đổi seed sẽ mất cảm giác đã mua nhân vật.

- Profile chung: `genshin-fake.profile.v1`.
- World save theo seed tiếp tục giữ vật phẩm đã nhặt, rương đã mở và slime đã hạ.
- Nguyên Thạch, Mora và Dịch Slime nên chuyển sang profile chung trong migration để tránh mỗi seed có một ví tiền khác nhau.
- Migration phải idempotent và chỉ cộng inventory world cũ sang profile đúng một lần cho mỗi `seedKey`.

### 3.3 Model chỉ là phần nhìn

Chỉ số, giá mua, cấp và trạng thái sở hữu không được đọc từ tên file GLB. Tạo catalog TypeScript làm nguồn dữ liệu duy nhất; model loader chỉ nhận `modelUrl`, chiều cao chuẩn hóa, góc xoay và alias animation.

## 4. Danh mục nhân vật đề xuất

Các số dưới đây là điểm khởi đầu để cân bằng, không mô phỏng chính xác Genshin Impact.

| ID          | Model                       | Vai trò           | HP gốc | ATK gốc | DEF gốc |        Giá mở khóa |
| ----------- | --------------------------- | ----------------- | -----: | ------: | ------: | -----------------: |
| `aether`    | `genshin_impact_aether.glb` | Cân bằng          |  1.000 |      55 |      55 |           Miễn phí |
| `nahida`    | `character/nahida.glb`      | Tấn công, ít HP   |    820 |      72 |      42 |   600 Nguyên Thạch |
| `furina`    | `character/furina.glb`      | Cân bằng thiên HP |  1.080 |      62 |      48 |   800 Nguyên Thạch |
| `hu_tao`    | `character/hu_tao.glb`      | Sát thương cao    |    900 |      82 |      38 |   900 Nguyên Thạch |
| `zhongli`   | `character/zhongli.glb`     | Phòng thủ         |  1.250 |      48 |      78 |   900 Nguyên Thạch |
| `mavuika`   | `character/mavuika.glb`     | Tấn công bền bỉ   |  1.050 |      78 |      52 | 1.000 Nguyên Thạch |
| `columbina` | `character/columbina.glb`   | Cao cấp, cân bằng |  1.100 |      76 |      60 | 1.200 Nguyên Thạch |

Trước khi chốt catalog phải kiểm tra trực tiếp từng GLB: trục mặt trước, kích thước, số mesh/material, animation clips, texture và tư thế gốc. Không giả định sáu model dùng cùng rig hoặc cùng animation với Aether.

## 5. Tăng cấp đến cấp 100

### 5.1 Quy tắc

- Cấp nhỏ nhất: 1.
- Cấp tối đa: 100.
- Mỗi lần nâng tăng đúng một cấp để thông báo chi phí rõ ràng.
- Có nút tăng 1 cấp và tăng tối đa theo số Mora hiện có.
- Không cho phép cấp 101, số Mora âm hoặc mua nhiều lần cùng một nhân vật.
- Nhân vật phải đột phá ở cấp 20, 30, 40, 50, 60, 70, 80 và 90 trước khi được nâng sang khoảng cấp kế tiếp.

### 5.2 Đột phá bằng Dịch Slime

| Đang ở cấp | Mở giới hạn | Dịch Slime cần |
| ---------: | ----------: | -------------: |
|         20 |          30 |              3 |
|         30 |          40 |              5 |
|         40 |          50 |              8 |
|         50 |          60 |             12 |
|         60 |          70 |             18 |
|         70 |          80 |             25 |
|         80 |          90 |             35 |
|         90 |         100 |             50 |

- Đột phá không tự tăng cấp; sau khi đột phá cấp 20, nhân vật vẫn ở cấp 20 và có thể dùng Mora nâng lên 21.
- Mỗi mốc chỉ được đột phá một lần và phải lưu trong profile.
- Nút tăng cấp phải chuyển thành `Đột phá` khi nhân vật chạm giới hạn chưa mở.
- Nút tăng tối đa phải dừng ở mốc chưa đột phá, không tự tiêu Dịch Slime ngoài ý muốn.
- Cấp 100 không có đột phá tiếp theo.

### 5.3 Chi phí Mora

Chi phí từ cấp `L` lên `L + 1`:

```text
cost(L) = roundTo100(500 + 80 * L^2)
```

Trong đó `roundTo100(x)` làm tròn lên bội số 100. Công thức bậc hai làm cấp cao đắt rõ rệt nhưng vẫn dễ tính và dễ cân bằng.

Ví dụ:

- Cấp 1 -> 2: 600 Mora.
- Cấp 10 -> 11: 8.500 Mora.
- Cấp 50 -> 51: 200.500 Mora.
- Cấp 99 -> 100: 784.600 Mora.
- Tổng từ cấp 1 đến 100 là 26.322.000 Mora; cần kiểm tra lại tốc độ kiếm Mora trước khi khóa con số này.

### 5.4 Tăng chỉ số

Với `L` là cấp hiện tại:

```textw
HP(L)  = round(baseHP  * (1 + 0.045 * (L - 1)))
ATK(L) = round(baseATK * (1 + 0.032 * (L - 1)))
DEF(L) = round(baseDEF * (1 + 0.038 * (L - 1)))
```

HP tăng nhanh hơn ATK để trận đấu cấp cao không biến thành hạ quái trong một đòn. Catalog chỉ lưu chỉ số gốc; chỉ số cuối phải được tính bằng hàm thuần dùng chung cho UI và combat.

## 6. Công thức chiến đấu

### 6.1 Sát thương nhân vật gây lên slime

```text
rawDamage = characterATK * attackMultiplier
damage = max(1, round(rawDamage * 100 / (100 + slimeDEF)))
```

- Đòn thường ban đầu: `attackMultiplier = 0.75`.
- Kỹ năng ban đầu: `attackMultiplier = 1.35`.
- Không giữ các số cố định 34 và 52 trong `EntitySystem`.

Ví dụ: nhân vật có 80 ATK đánh thường vào slime có 25 DEF:

```text
rawDamage = 80 * 0.75 = 60
damage = round(60 * 100 / 125) = 48
```

### 6.2 Sát thương slime gây lên nhân vật

```text
damage = max(1, round(slimeATK * 100 / (100 + characterDEF)))
```

HP runtime của người chơi phải nằm trong khoảng `0..maxHP`. Hồi phục hoàn toàn phải đặt HP về `maxHP`, không còn gán cứng 100.

### 6.3 Cấp và chỉ số slime

Cấp slime được xác định theo khoảng cách chunk so với điểm bắt đầu, nhưng phải có trần để thế giới xa không sinh số vượt giới hạn:

```text
slimeLevel = clamp(1 + floor(distanceFromOrigin / 12), 1, 100)
```

Mỗi loại slime có base stat riêng:

| Loại    | HP gốc | ATK gốc | DEF gốc | Đặc điểm           |
| ------- | -----: | ------: | ------: | ------------------ |
| Cryo    |    150 |      22 |      28 | Phòng thủ cao hơn  |
| Pyro    |    125 |      30 |      18 | Sát thương cao hơn |
| Electro |    135 |      26 |      22 | Cân bằng           |

Tăng theo cấp:

```text
maxHP = round(baseHP * (1 + 0.055 * (level - 1)))
ATK   = round(baseATK * (1 + 0.035 * (level - 1)))
DEF   = round(baseDEF * (1 + 0.030 * (level - 1)))
```

Slime phải giữ `currentHP`, `maxHP`, `level`, `atk`, `def` trong runtime entity. Thanh HP chỉ hiện khi slime ở gần, đang bị theo dõi hoặc vừa nhận sát thương; không tạo một React component cho từng slime vì sẽ ảnh hưởng FPS.

## 7. Mua và đổi nhân vật

### 7.1 Giao diện nhân vật

Thêm nút Nhân vật cạnh Túi đồ và phím tắt `C`. Màn hình gồm:

- Danh sách nhân vật với ảnh/model preview nhẹ, tên, cấp và trạng thái khóa.
- Khối chỉ số HP, ATK, DEF ở cấp hiện tại và mức tăng ở cấp kế tiếp.
- Nhân vật chưa sở hữu: nút Mua và giá Nguyên Thạch.
- Nhân vật đã sở hữu: nút Chọn nhân vật.
- Nhân vật đang dùng: trạng thái Đang sử dụng, không hiện nút mua/chọn sai ngữ cảnh.
- Nút Nâng cấp hiển thị chính xác Mora cần và vô hiệu hóa khi thiếu Mora hoặc đã cấp 100.

Không tải đồng thời sáu GLB chỉ để dựng danh sách. Giai đoạn đầu dùng portrait tĩnh/fallback tên và chỉ preload model đang chọn; model mới chỉ tải sau khi xác nhận đổi nhân vật.

### 7.2 Giao dịch an toàn

Mọi thao tác mua/nâng cấp phải đi qua hàm domain duy nhất:

```ts
purchaseCharacter(profile, characterId);
upgradeCharacter(profile, characterId, levels);
selectCharacter(profile, characterId);
```

Mỗi hàm kiểm tra điều kiện trước, sau đó cập nhật tiền và dữ liệu nhân vật trong một lần lưu. Không trừ Nguyên Thạch/Mora ở UI rồi gọi save lần thứ hai.

### 7.3 Đổi model trong thế giới

- `PlayerGltfModel` nhận `characterId` thay vì import cứng Aether.
- Catalog ánh xạ ID sang URL model bằng static imports để Vite vẫn đóng gói đúng asset.
- Khi đổi nhân vật, giữ nguyên tọa độ, hướng, stamina và camera.
- Quy đổi HP theo tỷ lệ để tránh đổi nhân vật hồi máu miễn phí:

```text
newHP = clamp(round(oldHP / oldMaxHP * newMaxHP), 1, newMaxHP)
```

- Nếu model mới tải lỗi, giữ model hiện tại hoặc dùng procedural fallback; không đổi selected ID thành trạng thái không render được.
- Chuẩn hóa chiều cao collider riêng với chiều cao visual. Nhân vật thấp như Nahida không được có lợi thế collider ngoài ý muốn.

## 8. Cấu trúc dữ liệu đề xuất

```ts
type CharacterId =
  | "aether"
  | "columbina"
  | "furina"
  | "hu_tao"
  | "mavuika"
  | "nahida"
  | "zhongli";

type CharacterDefinition = {
  id: CharacterId;
  name: string;
  modelUrl: string;
  purchaseCost: number;
  baseHP: number;
  baseATK: number;
  baseDEF: number;
  modelHeight: number;
  rotationY: number;
};

type PlayerProfile = {
  version: 1;
  wallet: {
    primogem: number;
    mora: number;
    slimeCondensate: number;
  };
  characters: Partial<
    Record<
      CharacterId,
      {
        level: number;
        ascendedCaps: number[];
      }
    >
  >;
  selectedCharacterId: CharacterId;
  importedWorldWallets: string[];
};
```

Catalog đặt tại `src/game/characters/characterCatalog.ts`; công thức tại `characterProgression.ts`; transaction/profile tại `ProfileManager.ts`. UI không tự tính lại công thức.

## 9. Save và migration

1. Đọc profile mới; nếu chưa có thì tạo profile cấp 1 có Aether.
2. Đọc world save hiện tại bằng schema cũ.
3. Nếu `seedKey` chưa nằm trong `importedWorldWallets`, chuyển `primogem`, `mora`, `slime_condensate` sang profile.
4. Xóa ba currency khỏi inventory world sau khi profile đã lưu thành công.
5. Đánh dấu seed đã import để tải lại không cộng lần hai.
6. Nếu profile hỏng, phục hồi Aether cấp 1 và ví bằng 0; không xóa world save.

Giới hạn `importedWorldWallets` không nên cắt tùy tiện vì cắt sẽ làm một seed cũ được import lại. Có thể lưu map hash theo seed hoặc giữ registry riêng nếu số seed tăng lớn.

## 10. Phần nên bổ sung

### Bắt buộc cho vòng lặp hiện tại

- Thanh HP nhân vật dùng số thực `current/max`, không chỉ phần trăm 100 cố định.
- Thanh HP và cấp của slime khi nhắm/đánh.
- Trạng thái chết và hồi sinh tại vị trí an toàn; không để HP 0 nhưng vẫn di chuyển.
- Thông báo thiếu Nguyên Thạch/Mora rõ ràng.
- So sánh chỉ số nhân vật đang dùng với nhân vật đang xem.
- Lưu selected character và level ngay sau giao dịch.
- Chặn input chiến đấu trong menu nhân vật.

### Nên làm sau MVP

- Drop Mora từ slime theo cấp, nhưng có giới hạn để không phá cân bằng kinh tế.
- Chỉ số tốc độ chạy/bơi/leo nên giữ giống nhau ở giai đoạn đầu; khác biệt chỉ ở chiến đấu để tránh một nhân vật trở thành lựa chọn bắt buộc khi khám phá.
- Hiển thị DPS ước tính hoặc độ sống sót thay vì chỉ ghi vai trò bằng chữ.
- Thêm âm thanh mua, nâng cấp, nhận sát thương và hạ slime sau khi gameplay đã ổn định.

### Chưa đưa vào phạm vi

- Gacha/ngẫu nhiên khi mua nhân vật.
- Trùng nhân vật và cung mệnh.
- Vũ khí, thánh di vật, nguyên tố và phản ứng nguyên tố.
- Party bốn nhân vật hoặc đổi nhanh giữa trận.
- Multiplayer và backend tài khoản.

## 11. Các phase triển khai

### Phase 1 - Domain và save

- [x] Tạo character catalog và hàm tính chỉ số/chi phí thuần.
- [x] Tạo PlayerProfile và migration currency từ world save.
- [x] Thêm self-test cấp 1, cấp 100, tổng chi phí và migration idempotent.
- [x] Thêm self-test chặn cấp 20 khi chưa đột phá và trừ đúng Dịch Slime ở từng mốc.
- [x] Bảo đảm save cũ luôn có Aether cấp 1.

### Phase 2 - Model và đổi nhân vật

- [ ] Audit sáu GLB và ghi modelHeight/rotationY/animation clips.
- [x] Refactor `PlayerGltfModel` nhận `characterId`.
- [x] Lazy-load model được chọn và giữ fallback khi tải lỗi.
- [x] Giữ vị trí, camera và tỷ lệ HP khi đổi nhân vật.
- [ ] Kiểm tra đi, chạy, bơi, leo và hướng mặt cho từng model.

### Phase 3 - Menu nhân vật và giao dịch

- [x] Tạo menu Nhân vật responsive cho desktop/mobile.
- [x] Mua bằng Nguyên Thạch qua transaction duy nhất.
- [x] Nâng cấp bằng Mora, hỗ trợ +1 và tối đa.
- [x] Hiển thị so sánh HP/ATK/DEF và chi phí cấp kế tiếp.
- [x] Không preload toàn bộ GLB trong menu.

### Phase 4 - Combat theo chỉ số

- [x] Thay damage cố định bằng công thức ATK/DEF.
- [x] Tạo stat riêng cho ba loại slime và scale cấp theo khoảng cách.
- [x] Thêm HP bar/cấp cho slime mục tiêu.
- [x] Chuyển hồi phục, chết và HUD sang `maxHP` động.
- [ ] Kiểm thử không có NaN, HP âm, damage 0 hoặc slime bất tử.

### Phase 5 - Cân bằng và tối ưu

- [ ] Đo thời gian kiếm 600/900/1.200 Nguyên Thạch và Mora nâng cấp.
- [ ] Điều chỉnh reward/giá bằng dữ liệu, không dựa vào cảm giác.
- [ ] Đo FPS và bộ nhớ khi đổi qua từng model trên desktop/mobile.
- [ ] Kiểm tra model/texture cũ được giải phóng hợp lý sau nhiều lần đổi.
- [ ] Production build, self-test và kiểm tra runtime ở màn hình desktop/mobile.

Trạng thái kiểm chứng hiện tại: production build đã thành công. Self-test mới đã được biên dịch nhưng chưa chạy từ bảng Developer trong trình duyệt. Audit cấu trúc GLB xác nhận cả sáu model không có animation clip; Furina, Hu Tao, Mavuika, Nahida và Zhongli có skeleton, Columbina không có skin. Hướng mặt, chiều cao và các trạng thái đi/bơi/leo vẫn phải kiểm tra trực tiếp trước khi đánh dấu Phase 2 hoàn tất.

## 12. Tiêu chí hoàn thành

- Người chơi mới luôn có Aether cấp 1 và không mất save cũ.
- Mua nhân vật trừ đúng Nguyên Thạch một lần; tải lại trang vẫn sở hữu.
- Nhân vật chưa sở hữu không thể được chọn bằng UI hoặc sửa state tạm thời.
- Nâng cấp trừ đúng Mora, không vượt cấp 100 và chỉ số khớp ở UI/combat.
- Đổi nhân vật giữ vị trí và không hồi máu miễn phí.
- Mỗi loại slime có HP/ATK/DEF/cấp riêng và damage phản ánh DEF của nhân vật.
- Sáu model hoạt động hoặc fallback an toàn; một model lỗi không làm crash game.
- Menu và model không khiến mobile tụt FPS vì tải đồng thời toàn bộ asset.
- Build và self-test thành công; các mục runtime chỉ được đánh dấu sau khi kiểm tra trực tiếp.
