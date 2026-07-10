export type MoveInput = { x: number; y: number };

export function normalizeInput(input: MoveInput): MoveInput {
  const len = Math.hypot(input.x, input.y);
  if (len <= 1e-5) return { x: 0, y: 0 };
  const scale = Math.min(1, len) / len;
  return { x: input.x * scale, y: input.y * scale };
}
