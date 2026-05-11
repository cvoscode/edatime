import type { PipelineCache } from '../core/PipelineCache';
export type AnnotationMarkerInstance = Readonly<{
    /**
     * Center in CANVAS-LOCAL CSS pixels.
     * (0,0) is the canvas top-left in CSS pixel coordinates.
     */
    xCssPx: number;
    yCssPx: number;
    /** Marker diameter in CSS pixels. */
    sizeCssPx: number;
    /** Fill color RGBA in 0..1 (straight alpha). */
    fillRgba: readonly [r: number, g: number, b: number, a: number];
    /** Optional stroke width in CSS pixels (0 disables stroke). */
    strokeWidthCssPx?: number;
    /** Optional stroke color RGBA in 0..1 (straight alpha). */
    strokeRgba?: readonly [r: number, g: number, b: number, a: number];
}>;
export interface AnnotationMarkerRenderer {
    /**
     * Uploads marker instances and prepares uniforms for rendering.
     *
     * Coordinate contract:
     * - `instances[*].xCssPx/yCssPx` are CANVAS-LOCAL CSS pixels.
     * - `canvasWidth/canvasHeight` are in *device pixels* (same as render target size).
     * - `devicePixelRatio` is used to convert CSS px to device px inside the shader.
     *
     * Scissor contract:
     * - This renderer intentionally does NOT set or reset scissor state.
     *   The caller must set scissor for plot clipping before invoking `render()`.
     */
    prepare(params: Readonly<{
        canvasWidth: number;
        canvasHeight: number;
        devicePixelRatio: number;
        instances: readonly AnnotationMarkerInstance[];
    }>): void;
    /** Draws all prepared instances (if any). */
    render(passEncoder: GPURenderPassEncoder, firstInstance?: number, instanceCount?: number): void;
    /** Cleans up GPU resources (best-effort). */
    dispose(): void;
}
export interface AnnotationMarkerRendererOptions {
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
export declare function createAnnotationMarkerRenderer(device: GPUDevice, options?: AnnotationMarkerRendererOptions): AnnotationMarkerRenderer;
//# sourceMappingURL=createAnnotationMarkerRenderer.d.ts.map