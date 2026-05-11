/**
 * Canvas sizing and measurement utilities for the RenderCoordinator.
 *
 * These pure functions handle canvas dimension retrieval with special handling
 * for device pixel ratio and GPU overlay coordinate conversions.
 *
 * @module canvasUtils
 */
/**
 * Gets canvas CSS width - clientWidth for HTMLCanvasElement.
 *
 * @param canvas - The canvas element to measure, or null
 * @returns CSS width in pixels, or 0 if canvas is null
 */
export declare function getCanvasCssWidth(canvas: HTMLCanvasElement | null): number;
/**
 * Gets canvas CSS height - clientHeight for HTMLCanvasElement.
 *
 * @param canvas - The canvas element to measure, or null
 * @returns CSS height in pixels, or 0 if canvas is null
 */
export declare function getCanvasCssHeight(canvas: HTMLCanvasElement | null): number;
/**
 * Gets canvas CSS size derived strictly from device-pixel dimensions and DPR.
 *
 * This is intentionally different from `getCanvasCssWidth/Height(...)`:
 * - HTMLCanvasElement: `clientWidth/clientHeight` reflect DOM layout and can diverge (rounding, zoom, async resize)
 *   from the WebGPU render target size (`canvas.width/height` in device pixels).
 * - For GPU overlays that round-trip CSS↔device pixels in-shader, we must derive CSS size from
 *   `canvas.width/height` + DPR to keep transforms consistent with the render target.
 *
 * NOTE: Use this for GPU overlay coordinate conversion only (reference lines, markers).
 * Keep DOM overlays (labels/tooltips) using `clientWidth/clientHeight` for layout correctness.
 *
 * @param canvas - The canvas element to measure, or null
 * @param devicePixelRatio - The device pixel ratio (defaults to window.devicePixelRatio or 1)
 * @returns Object with width and height in CSS pixels derived from device pixels
 */
export declare function getCanvasCssSizeFromDevicePixels(canvas: HTMLCanvasElement | null, devicePixelRatio?: number): Readonly<{
    width: number;
    height: number;
}>;
/**
 * Clamps a value to an integer within [lo, hi] range.
 *
 * @param v - Value to clamp
 * @param lo - Lower bound (inclusive)
 * @param hi - Upper bound (inclusive)
 * @returns Clamped integer value
 */
export declare function clampInt(v: number, lo: number, hi: number): number;
//# sourceMappingURL=canvasUtils.d.ts.map