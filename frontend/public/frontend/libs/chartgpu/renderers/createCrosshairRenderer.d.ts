import type { GridArea } from './createGridRenderer';
import type { PipelineCache } from '../core/PipelineCache';
export interface CrosshairRenderOptions {
    /** Whether to render the vertical crosshair line. */
    readonly showX: boolean;
    /** Whether to render the horizontal crosshair line. */
    readonly showY: boolean;
    /** CSS color string for the crosshair lines. */
    readonly color: string;
    /**
     * Desired line width in CSS pixels.
     *
     * Note: WebGPU wide lines are not reliably supported; the renderer emulates thickness by
     * drawing multiple 1px lines in device-pixel offsets (best-effort, deterministic).
     */
    readonly lineWidth: number;
}
export interface CrosshairRenderer {
    /**
     * Positions the crosshair for rendering.
     *
     * Coordinate contract:
     * - `x`, `y` are CANVAS-LOCAL CSS pixels (e.g. eventManager payload x/y)
     * - `gridArea` margins are CSS pixels; `gridArea.canvasWidth/Height` are device pixels
     */
    prepare(x: number, y: number, gridArea: GridArea, options: CrosshairRenderOptions): void;
    /** Draws the crosshair (if visible) clipped to the plot rect. */
    render(passEncoder: GPURenderPassEncoder): void;
    /** Shows/hides the crosshair without destroying GPU resources. */
    setVisible(visible: boolean): void;
    /** Cleans up GPU resources (best-effort). */
    dispose(): void;
}
export interface CrosshairRendererOptions {
    /**
     * Must match the canvas context format used for the render pass color attachment.
     * Usually this is `gpuContext.preferredFormat`.
     *
     * Defaults to `'bgra8unorm'` for backward compatibility.
     */
    readonly targetFormat?: GPUTextureFormat;
    /**
     * Multisample count for the render pipeline.
     *
     * Must match the render pass color attachment sampleCount.
     * Defaults to 1 (no MSAA).
     */
    readonly sampleCount?: number;
    /**
     * Optional shared cache for shader modules + render pipelines.
     */
    readonly pipelineCache?: PipelineCache;
}
export declare function createCrosshairRenderer(device: GPUDevice, options?: CrosshairRendererOptions): CrosshairRenderer;
//# sourceMappingURL=createCrosshairRenderer.d.ts.map