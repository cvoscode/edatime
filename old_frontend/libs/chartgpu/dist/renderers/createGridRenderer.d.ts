import type { PipelineCache } from '../core/PipelineCache';
export interface GridRenderer {
    /**
     * Backward compatible:
     * - `prepare(gridArea, lineCount)` where `lineCount` is `{ horizontal?, vertical? }`
     *
     * Preferred:
     * - `prepare(gridArea, { lineCount, color })`
     */
    prepare(gridArea: GridArea, lineCountOrOptions?: GridLineCount | GridPrepareOptions): void;
    render(passEncoder: GPURenderPassEncoder): void;
    dispose(): void;
}
export interface GridArea {
    readonly left: number;
    readonly right: number;
    readonly top: number;
    readonly bottom: number;
    readonly canvasWidth: number;
    readonly canvasHeight: number;
    readonly devicePixelRatio: number;
}
export interface GridLineCount {
    readonly horizontal?: number;
    readonly vertical?: number;
}
export interface GridPrepareOptions {
    readonly lineCount?: GridLineCount;
    /**
     * CSS color string used for grid lines.
     *
     * Expected formats: `#rgb`, `#rrggbb`, `#rrggbbaa`, `rgb(r,g,b)`, `rgba(r,g,b,a)`.
     */
    readonly color?: string;
    /**
     * When true, appends additional grid line geometry to the existing prepared
     * batch instead of replacing it. This enables rendering multiple grid batches
     * (e.g. different colors for horizontal vs vertical lines).
     *
     * Backward compatible: call sites that don't use `append` continue to replace
     * the prepared geometry each frame.
     */
    readonly append?: boolean;
}
export interface GridRendererOptions {
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
export declare function createGridRenderer(device: GPUDevice, options?: GridRendererOptions): GridRenderer;
//# sourceMappingURL=createGridRenderer.d.ts.map