export function clampCamera(pitch: number, zoom: number): { pitch: number; zoom: number } {
  return {
    pitch: Math.max(0.35, Math.min(1.15, pitch)),
    zoom: Math.max(8, Math.min(42, zoom)),
  };
}
