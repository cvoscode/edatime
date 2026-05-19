import type { ResolvedPieSeriesConfig } from '../config/OptionResolver';
import type { GridArea } from './createGridRenderer';
import type { PipelineCache } from '../core/PipelineCache';
export interface PieRenderer {
    prepare(seriesConfig: ResolvedPieSeriesConfig, gridArea: GridArea): void;
    render(passEncoder: GPURenderPassEncoder): void;
    dispose(): void;
}
export interface PieRendererOptions {
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
export declare function createPieRenderer(device: GPUDevice, options?: PieRendererOptions): PieRenderer;
//# sourceMappingURL=createPieRenderer.d.ts.map