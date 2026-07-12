export function grassAreaSize(density: number): number {
  if (density <= 0.2) return 14;
  if (density <= 0.3) return 18;
  if (density <= 0.7) return 28;
  return 32;
}

export function grassDetail(density: number): number {
  if (density <= 0.2) return 18;
  if (density <= 0.3) return 28;
  if (density <= 0.7) return 56;
  return 80;
}

export function grassBladeBudget(density: number): number {
  const detail = grassDetail(density);
  return detail * detail;
}
