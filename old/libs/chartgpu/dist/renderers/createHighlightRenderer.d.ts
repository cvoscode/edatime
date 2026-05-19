import type { PipelineCache } from '../core/PipelineCache';
export type HighlightPoint = Readonly<{
    /** Center in *device pixels* (same coordinate space as fragment `@builtin(position)`). */
    centerDeviceX: number;
    centerDeviceY: number;
    /** Device pixel ratio used for CSS→device conversion. */
    devicePixelRatio: number;
    /** Canvas dimensions in *device pixels* (used to reset scissor). */
    canvasWidth: number;
    canvasHeight: number;
    /** Plot scissor rect in *device pixels*. */
    scissor: Readonly<{
        x: number;
        y: number;
        w: number;
        h: number;
    }>;
}>;
export interface HighlightRenderer {
    /**
     * Prepares the highlight ring.
     *
     * Coordinate contract:
     * - `point.centerDeviceX/Y` are device pixels in the same space as fragment `@builtin(position)`.
     * - `size` is specified in CSS pixels; the renderer will scale it by `point.devicePixelRatio`.
     */
    prepare(point: HighlightPoint, color: string, size: number): void;
    render(passEncoder: GPURenderPassEncoder): void;
    setVisible(visible: boolean): void;
    dispose(): void;
}
export interface HighlightRendererOptions {
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
export declare function createHighlightRenderer(device: GPUDevice, options?: HighlightRendererOptions): HighlightRenderer;
//# sourceMappingURL=createHighlightRenderer.d.ts.map