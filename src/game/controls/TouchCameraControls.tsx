export function clampCamera(pitch: number, zoom: number): { pitch: number; zoom: number } {
  return {
    pitch: Math.max(-Math.PI / 18, Math.min((65 * Math.PI) / 180, pitch)),
    zoom: Math.max(6, Math.min(14, zoom)),
  };
}
