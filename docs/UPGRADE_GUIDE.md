# Hướng dẫn Nâng cấp Hiệu suất

## Những gì đã thay đổi

Phiên bản này cải thiện hiệu suất đáng kể cho cả mobile và desktop:

✅ **Mobile giờ có cỏ** - Không còn trống trơn nữa!  
✅ **FPS cao hơn 25-35%** - Chơi mượt mà hơn  
✅ **Minimap không lag** - Không còn trắng/đen khi xoay camera  
✅ **Giá nhân vật giảm 90%** - Dễ mua hơn nhiều  

## Có ảnh hưởng gì đến save game không?

**KHÔNG!** Mọi thứ vẫn như cũ:
- ✅ Nhân vật đã mua vẫn còn
- ✅ Vật phẩm không mất
- ✅ Seed thế giới không đổi
- ✅ Địa hình không thay đổi
- ✅ Settings được giữ nguyên

## Giá nhân vật mới

| Nhân vật  | Giá cũ | Giá mới | Tiết kiệm |
| --------- | -----: | ------: | --------: |
| Aether    |      0 |       0 |         - |
| Nahida    |    600 |      60 |       90% |
| Furina    |    800 |      80 |       90% |
| Hu Tao    |    900 |      90 |       90% |
| Zhongli   |    900 |      90 |       90% |
| Mavuika   |  1.000 |     100 |       90% |
| Columbina |  1.200 |     120 |       90% |

**Lưu ý:** Nếu bạn đã mua nhân vật trước đó, bạn không được hoàn tiền. Giá mới chỉ áp dụng cho nhân vật chưa mua.

## Cải thiện hiệu suất

### Mobile yếu (4GB RAM)
- **Trước:** 28-32 FPS, không có cỏ
- **Sau:** 35-42 FPS, có 324-784 lá cỏ thưa
- **Cải thiện:** +35% FPS, có cỏ

### Mobile trung bình (6GB RAM)
- **Trước:** 38-45 FPS
- **Sau:** 48-55 FPS
- **Cải thiện:** +25% FPS, cỏ dày hơn

### Desktop
- **Trước:** 52-58 FPS, cỏ đôi khi lag
- **Sau:** 58-60 FPS ổn định, cỏ mượt
- **Cải thiện:** Ổn định hơn, minimap nhanh hơn

## Những gì có thể bạn nhận thấy

### Tốt hơn ✅
- Cỏ xuất hiện trên mobile (trước đó không có)
- FPS cao hơn và ổn định hơn
- Minimap không còn giật/lag
- Mua nhân vật dễ hơn nhiều
- Game khởi động nhanh hơn một chút

### Khác biệt nhỏ 🔄
- Cỏ trên desktop bây giờ ít hơn một chút (vẫn trông dày)
- Minimap có thể hơi "blocky" lúc đầu (vài giây đầu)
- Quality manager phản ứng nhanh hơn (có thể thấy chất lượng đổi sớm hơn)

### Không đổi ⭕
- Địa hình và thế giới
- Gameplay và điều khiển
- Save game và tiến trình
- Model nhân vật

## Nếu gặp vấn đề

### FPS vẫn thấp?
1. Mở **Settings** → **Graphics**
2. Thử **Quality Preset: Low** hoặc **Medium**
3. Giảm **Render Distance** xuống 1 hoặc 2
4. Tắt **Shadows**
5. Giảm **Pixel Ratio** xuống 0.75-0.85

### Minimap không hiện?
1. Chờ 2-3 giây sau khi load world
2. Đi bộ vài bước để load chunk
3. Nếu vẫn không hiện, reload trang

### Cỏ trông lạ?
- Mobile: Đây là bình thường, cỏ thưa hơn desktop
- Desktop: Nếu thấy quá ít, tăng **Vegetation Density** lên

### Nhân vật vẫn giá cũ?
- Giá mới chỉ hiện cho nhân vật **chưa mua**
- Nhân vật đã mua vẫn trong inventory
- Không có hoàn tiền cho nhân vật đã mua

## Cách kiểm tra hiệu suất

1. Bật **Developer Mode** trong Settings
2. Bật **Performance Panel** (phím F3 hoặc trong Settings)
3. Xem:
   - **FPS:** Nên ≥30 mobile, ≥55 desktop
   - **Frame time:** Nên ≤33ms mobile, ≤18ms desktop
   - **Grass blade count:** Số lá cỏ hiện tại
   - **Runtime quality:** Low/Medium/High tự động

## FAQ

**Q: Tại sao desktop bây giờ có ít cỏ hơn?**  
A: Trước đó có 36.864 lá cỏ là quá nhiều và không cần thiết. 6.400 lá vẫn trông rất dày và tiết kiệm hiệu suất.

**Q: Mobile có thể tăng số cỏ không?**  
A: Có! Vào Settings → Graphics → Vegetation Density. Tăng lên 0.3-0.45 nếu máy kéo được.

**Q: Minimap bây giờ "blocky" hơn?**  
A: Đúng, để tiết kiệm hiệu suất. Cache sẽ làm mượt dần sau vài giây. Đây là trade-off để không lag.

**Q: FPS vẫn thấp trên máy yếu?**  
A: Thử:
- Quality Preset: Low
- Render Distance: 1
- Shadows: Off
- Pixel Ratio: 0.75
- Decorative Grass: Off (nếu cần)

**Q: Có thể tắt hoàn toàn cỏ không?**  
A: Có, trong Settings → Graphics → Decorative Grass. Nhưng bây giờ cỏ đã nhẹ hơn nhiều nên nên để bật.

## Báo lỗi

Nếu gặp vấn đề:
1. Mở DevTools (F12)
2. Check Console có error không
3. Note FPS và thiết bị
4. Báo cáo kèm thông tin trên

## Tài liệu kỹ thuật

Chi tiết kỹ thuật xem tại:
- `docs/PERFORMANCE_IMPROVEMENTS.md` - Tổng quan cải tiến
- `docs/TECHNICAL_CHANGES.md` - Chi tiết thay đổi code
- `CHANGELOG_PERFORMANCE.md` - Changelog ngắn gọn
