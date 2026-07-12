import { PLAYER_CAMERA_MAX, PLAYER_CAMERA_MIN } from "../camera/cameraConfig";

export function clampCamera(pitch: number, zoom: number): { pitch: number; zoom: number } {
  return {
    pitch: Math.max(-Math.PI / 18, Math.min((65 * Math.PI) / 180, pitch)),
    zoom: Math.max(PLAYER_CAMERA_MIN, Math.min(PLAYER_CAMERA_MAX, zoom)),
  };
}
