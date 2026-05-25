/**
 * Single authoritative implementation of WebGPU support detection.
 */
export function isWebGPUSupported(): boolean {
  try {
    if (typeof navigator === 'undefined' || !(navigator as any).gpu) {
      return false;
    }
    const gpu = (navigator as any).gpu;
    if (typeof gpu.requestAdapter !== 'function') {
      return false;
    }
    return typeof gpu.requestAdapter === 'function';
  } catch {
    return false;
  }
}