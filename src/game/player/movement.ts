export type MoveInput = { x: number; y: number };

export function dampAngle(current: number, target: number, damping: number, delta: number): number {
  const difference = Math.atan2(Math.sin(target - current), Math.cos(target - current));
  return current + difference * (1 - Math.exp(-damping * delta));
}
