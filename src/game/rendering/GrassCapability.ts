import * as THREE from "three";

export type GrassBackend = "cpu-instanced" | "terrain-texture";

let cachedBackend: GrassBackend | null = null;
let cachedSupportsFloat = false;

/**
 * Detect if the GPU supports Float textures reliably
 */
export function detectFloatTextureSupport(): boolean {
  if (cachedBackend !== null) return cachedSupportsFloat;

  try {
    const canvas = document.createElement("canvas");
    const gl = canvas.getContext("webgl2") || canvas.getContext("webgl");
    if (!gl) {
      cachedSupportsFloat = false;
      return false;
    }

    // Check for float texture extension
    const floatExt = gl.getExtension("OES_texture_float") || 
                     gl.getExtension("OES_texture_half_float");
    
    if (!floatExt) {
      cachedSupportsFloat = false;
      return false;
    }

    // Try to create a float texture
    const texture = gl.createTexture();
    if (!texture) {
      cachedSupportsFloat = false;
      return false;
    }

    gl.bindTexture(gl.TEXTURE_2D, texture);
    
    const floatType = gl.getExtension("OES_texture_float") ? gl.FLOAT : 
                      (gl as any).HALF_FLOAT_OES;
    
    // Try to allocate a small float texture
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, 4, 4, 0, gl.RGBA, floatType, null);
    
    const error = gl.getError();
    gl.deleteTexture(texture);
    
    cachedSupportsFloat = error === gl.NO_ERROR;
    return cachedSupportsFloat;
  } catch (e) {
    cachedSupportsFloat = false;
    return false;
  }
}

/**
 * Detect if device is constrained (mobile, low memory, etc)
 */
export function detectConstrainedDevice(): boolean {
  const memory = (navigator as any).deviceMemory ?? 8;
  const cores = navigator.hardwareConcurrency || 4;
  const touchDevice = window.matchMedia("(pointer: coarse)").matches;
  const smallViewport = Math.min(window.innerWidth, window.innerHeight) <= 760;
  
  return touchDevice || smallViewport || memory <= 6 || cores <= 6;
}

/**
 * Select the best grass backend for this device
 */
export function selectGrassBackend(): GrassBackend {
  if (cachedBackend !== null) return cachedBackend;

  const isConstrained = detectConstrainedDevice();
  const supportsFloat = detectFloatTextureSupport();

  // Use CPU-instanced for:
  // 1. Constrained devices (mobile)
  // 2. Devices without reliable float texture support
  if (isConstrained || !supportsFloat) {
    cachedBackend = "cpu-instanced";
  } else {
    cachedBackend = "terrain-texture";
  }

  return cachedBackend;
}

/**
 * Get current backend (for display purposes)
 */
export function getCurrentBackend(): GrassBackend | null {
  return cachedBackend;
}

/**
 * Reset capability detection (for testing)
 */
export function resetCapabilityCache(): void {
  cachedBackend = null;
  cachedSupportsFloat = false;
}
