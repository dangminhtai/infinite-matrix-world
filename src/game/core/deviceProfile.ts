type NavigatorWithDeviceMemory = Navigator & { deviceMemory?: number };

export function isConstrainedDevice(): boolean {
  const memory = (navigator as NavigatorWithDeviceMemory).deviceMemory ?? 8;
  const cores = navigator.hardwareConcurrency || 4;
  return window.matchMedia("(pointer: coarse)").matches
    || Math.min(window.innerWidth, window.innerHeight) <= 760
    || memory <= 6
    || cores <= 4;
}
