# Tài liệu Kỹ thuật - Cải tiến Hiệu suất

## 1. GrassRing.tsx

### Thay đổi số lượng cỏ

```typescript
// TRƯỚC
function grassDetail(density: number): number {
  if (density <= 0.2) return 28;   // 784 blade
  if (density <= 0.3) return 36;   // 1.296 blade
  if (density <= 0.45) return 52;  // 2.704 blade
  if (density <= 0.7) return 112;  // 12.544 blade
  if (density <= 0.9) return 152;  // 23.104 blade
  return 192;                      // 36.864 blade ❌
}

// SAU
function grassDetail(density: number): number {
  if (density <= 0.2) return 18;   // 324 blade
  if (density <= 0.3) return 28;   // 784 blade
  if (density <= 0.45) return 40;  // 1.600 blade
  if (density <= 0.7) return 56;   // 3.136 blade
  if (density <= 0.9) return 70;   // 4.900 blade
  return 80;                       // 6.400 blade ✅
}
```

**Tại sao:**
- 36.864 blade quá nhiều, tạo 110.592 vertex
- GPU mobile không xử lý nổi
- 6.400 blade vẫn trông dày và đẹp

### Render optimization

```typescript
// TRƯỚC
side: THREE.DoubleSide,           // Render cả 2 mặt
frustumCulled: false,             // Luôn render
boundingSphere: new Sphere(0,0,0, 1_000_000)  // Sphere khổng lồ

// SAU
side: THREE.FrontSide,            // Chỉ render 1 mặt
frustumCulled: true,              // Culling bình thường
geometry.computeBoundingSphere()  // Sphere tự động
```

**Impact:**
- `FrontSide`: giảm 50% fragment shader calls
- `frustumCulled: true`: không render cỏ ngoài viewport
- Bounding sphere đúng: frustum culling hoạt động chính xác

### Position update

```typescript
// TRƯỚC
return <mesh position={[player.current.localX, 0, player.current.localZ]} />

// SAU
const meshRef = useRef<THREE.Mesh>(null);
useFrame(() => {
  if (meshRef.current) {
    meshRef.current.position.x = player.current.localX;
    meshRef.current.position.z = player.current.localZ;
  }
});
return <mesh ref={meshRef} />
```

**Tại sao:**
- Position cần update mỗi frame để frustum culling hoạt động
- Sử dụng ref thay vì prop để tránh re-render

## 2. QualityManager.ts

### Mobile grass policy

```typescript
// TRƯỚC
if (level === "low") {
  return {
    decorativeGrass: false,  // ❌ Không có cỏ
    vegetationDensity: constrainedDevice ? 0.16 : 0.3,
  };
}

// SAU
if (level === "low") {
  return {
    decorativeGrass: true,   // ✅ Có cỏ thưa
    vegetationDensity: constrainedDevice ? 0.22 : 0.3,
  };
}
```

**Mobile Low bây giờ:**
- Density 0.22 → 18×18 = 324 blade
- Vẫn thấy cỏ, không bị trống trơn

### Timing adjustments

```typescript
// TRƯỚC
const WINDOW_MS = 4_000;
const COOLDOWN_MS = 10_000;
const STABLE_WINDOWS_TO_RAISE = 3;

// SAU
const WINDOW_MS = 2_000;
const COOLDOWN_MS = 6_000;
const STABLE_WINDOWS_TO_RAISE = 8;
```

**Lợi ích:**
- Phát hiện lag nhanh gấp đôi (2s thay vì 4s)
- Phản ứng nhanh hơn (6s cooldown)
- Thận trọng hơn khi tăng quality (cần 8 windows thay vì 3)

### DPR limits

```typescript
// TRƯỚC
pixelRatio: Math.min(graphics.pixelRatio, 1.75)  // Desktop

// SAU - constrainedDevice detection
pixelRatio: Math.min(graphics.pixelRatio, constrainedDevice ? 0.85 : 1)  // Low
pixelRatio: Math.min(graphics.pixelRatio, constrainedDevice ? 1 : 1.25)  // Medium
pixelRatio: Math.min(graphics.pixelRatio, constrainedDevice ? 1.1 : 1.5) // High
```

**Mobile caps:**
- Low: 0.85
- Medium: 1.0
- High: 1.1

**Desktop caps:**
- Low: 1.0
- Medium: 1.25
- High: 1.5 (giảm từ 1.75)

## 3. GameCanvas.tsx

### WebGL context optimization

```typescript
// TRƯỚC
gl={{ antialias: true }}

// SAU
gl={{
  antialias: props.settings.graphics.pixelRatio >= 1.25,
  powerPreference: "high-performance",
  alpha: false,
  stencil: false,
}}
```

**Chi tiết:**
- `antialias`: chỉ bật khi DPR ≥ 1.25 (desktop hoặc high quality)
- `powerPreference`: yêu cầu GPU mạnh
- `alpha: false`: không cần alpha channel cho WebGL context
- `stencil: false`: không dùng stencil buffer

## 4. Minimap.tsx

### Architecture redesign

```
┌──────────────────────┐
│ TRƯỚC - Single Canvas│
├──────────────────────┤
│ • Redraw mọi frame   │
│ • 118k getBiome()    │
│ • Không throttle     │
│ • Lag khi xoay       │
└──────────────────────┘

┌──────────────────────┐
│ SAU - Dual Canvas    │
├──────────────────────┤
│ Terrain Canvas       │ ← Static, cache-based
│ • Chỉ redraw khi     │
│   đổi tile/chunk     │
│ • ~100 getBiome()    │
│ • DPR = 1           │
├──────────────────────┤
│ Overlay Canvas       │ ← Dynamic, throttled
│ • Player arrow       │
│ • Enemies            │
│ • Waypoint/target    │
│ • 15 FPS throttle    │
└──────────────────────┘
```

### Terrain layer

```typescript
const [lastTerrainUpdate, setLastTerrainUpdate] = useState({
  tileX: "0",
  tileY: "0",
  chunkCount: 0
});

useEffect(() => {
  // Chỉ redraw khi thay đổi
  if (
    lastTerrainUpdate.tileX === currentTileX &&
    lastTerrainUpdate.tileY === currentTileY &&
    lastTerrainUpdate.chunkCount === currentChunkCount
  ) {
    return;  // Skip redraw
  }
  
  // Draw terrain...
  setLastTerrainUpdate({...});
}, [chunks, worldTileX, worldTileY]);
```

### Overlay throttle

```typescript
useEffect(() => {
  const intervalId = window.setInterval(() => {
    cancelAnimationFrame(overlayFrameRef.current);
    overlayFrameRef.current = requestAnimationFrame(drawOverlay);
  }, 1000 / 15);  // 15 FPS
  
  return () => {
    window.clearInterval(intervalId);
    cancelAnimationFrame(overlayFrameRef.current);
  };
}, [/* dependencies */]);
```

**Kết quả:**
- Terrain: 1-4 lần/giây (chỉ khi cần)
- Overlay: 15 FPS (throttled)
- Không còn 60 FPS redraw toàn bộ

## 5. mapRaster.ts

### Biome tile caching

```typescript
type CachedBiomeTile = {
  key: string;              // "worldX,worldY"
  canvas: HTMLCanvasElement;
  lastUsed: number;
};

const biomeCache = new Map<string, CachedBiomeTile>();
const MAX_CACHE_SIZE = 64;
```

### Cache workflow

```
┌────────────────────────────────────┐
│ 1. Request tile at worldX, worldY  │
└──────────┬─────────────────────────┘
           ↓
┌──────────┴─────────────────────────┐
│ 2. Check cache by key "X,Y"        │
└──────────┬─────────────────────────┘
           ↓
     ┌─────┴─────┐
     │ In cache? │
     └─────┬─────┘
        NO │     YES
           ↓       ↓
┌──────────┴───┐  ┌──────────────────┐
│ 3. Raster    │  │ 3. Return cached │
│    32×32 px  │  │    canvas        │
│    tile      │  │    Update LRU    │
└──────────┬───┘  └──────────────────┘
           ↓
┌──────────┴──────────────────────────┐
│ 4. Store in cache, evict if > 64   │
└─────────────────────────────────────┘
```

### Drawing

```typescript
// TRƯỚC - Raster mọi pixel mỗi frame
for (let py = 0; py < rasterHeight; py++) {
  for (let px = 0; px < rasterWidth; px++) {
    const ids = [
      getBiome(worldX, worldY),      // 4 calls
      getBiome(worldX + 1n, worldY),
      getBiome(worldX, worldY + 1n),
      getBiome(worldX + 1n, worldY + 1n),
    ];
    // Blend colors...
  }
}
// 172×172 = 29.584 pixel × 4 = 118.336 getBiome() calls

// SAU - Cache tile, vẽ bằng drawImage
for (let ty = -tilesPerScreen; ty <= tilesPerScreen; ty++) {
  for (let tx = -tilesPerScreen; tx <= tilesPerScreen; tx++) {
    const key = `${worldX},${worldY}`;
    const tileCanvas = getCachedBiomeTile(key, 32, getBiome, ...);
    ctx.drawImage(tileCanvas, screenX, screenY, pixelsPerTile, pixelsPerTile);
  }
}
// Chỉ ~100 getBiome() cho tile mới, còn lại dùng cache
```

## Performance Impact Summary

| Component       | Trước          | Sau          | Cải thiện      |
| --------------- | -------------- | ------------ | -------------- |
| Grass blade max | 36.864         | 6.400        | -82%           |
| Grass vertex    | 110.592        | 19.200       | -83%           |
| Mobile Low cỏ   | 0              | 324-784      | +∞             |
| Minimap getBiome| 118.336/frame  | ~100/frame   | -99.9%         |
| Minimap redraw  | 60 FPS         | 1-4 FPS      | -93%           |
| Overlay redraw  | 60 FPS         | 15 FPS       | -75%           |
| DPR mobile      | 1.0-1.75       | 0.85-1.1     | -37% pixels    |
| Antialias mobile| Always         | Only DPR≥1.25| Conditional    |

## Testing Checklist

### Desktop
- [ ] Build thành công
- [ ] FPS 55+ trong gameplay bình thường
- [ ] Cỏ vẫn trông dày và đẹp
- [ ] Minimap không lag khi xoay camera
- [ ] Quality auto-adjust hoạt động

### Mobile
- [ ] FPS 30+ trên thiết bị yếu
- [ ] Thấy cỏ thưa ở Low quality
- [ ] Minimap hiện nhanh, không trắng/đen
- [ ] Không tụt FPS nghiêm trọng
- [ ] Mua nhân vật với giá mới

### Regression
- [ ] Seed và địa hình không đổi
- [ ] Save game load bình thường
- [ ] Nhân vật đã mua vẫn còn
- [ ] Không có console error

## Files Changed

1. `src/game/characters/characterCatalog.ts`
2. `src/game/rendering/GrassRing.tsx`
3. `src/game/core/QualityManager.ts`
4. `src/game/GameCanvas.tsx`
5. `src/ui/Minimap.tsx`
6. `src/ui/mapRaster.ts`

## Next Steps (P2, P3)

### P2 - CPU-instanced grass for mobile
- Detect Float Texture support
- Fallback to CPU positioning
- Pre-calculate height/normal

### P3 - Terrain LOD from worker
- Pass `visualDetail` to worker
- Generate 8/16/32 subdivision
- Lazy refine nearby chunks
