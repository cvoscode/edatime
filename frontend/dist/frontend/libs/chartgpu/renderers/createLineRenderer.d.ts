import type { ResolvedLineSeriesConfig } from '../config/OptionResolver';
import type { LinearScale } from '../utils/scales';
import type { PipelineCache } from '../core/PipelineCache';
export interface LineRenderer {
    prepare(seriesConfig: ResolvedLineSeriesConfig, dataBuffer: GPUBuffer, xScale: LinearScale, yScale: LinearScale, xOffset?: number, devicePixelRatio?: number, canvasWidthDevicePx?: number, canvasHeightDevicePx?: number): void;
    render(passEncoder: GPURenderPassEncoder): void;
    dispose(): void;
}
export interface LineRendererOptions {
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
     * Opt-in only: if omitted, behavior is identical to the uncached path.
     */
    readonly pipelineCache?: PipelineCache;
}
export declare function createLineRenderer(device: GPUDevice, options?: LineRendererOptions): LineRenderer;
//# sourceMappingURL=createLineRenderer.d.ts.map