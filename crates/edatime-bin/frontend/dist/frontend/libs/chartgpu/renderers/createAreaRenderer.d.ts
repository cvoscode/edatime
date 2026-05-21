import type { ResolvedAreaSeriesConfig } from '../config/OptionResolver';
import type { CartesianSeriesData } from '../config/types';
import type { LinearScale } from '../utils/scales';
import type { PipelineCache } from '../core/PipelineCache';
export interface AreaRenderer {
    prepare(seriesConfig: ResolvedAreaSeriesConfig, data: CartesianSeriesData, xScale: LinearScale, yScale: LinearScale, baseline?: number): void;
    render(passEncoder: GPURenderPassEncoder): void;
    dispose(): void;
}
export interface AreaRendererOptions {
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
export declare function createAreaRenderer(device: GPUDevice, options?: AreaRendererOptions): AreaRenderer;
//# sourceMappingURL=createAreaRenderer.d.ts.map