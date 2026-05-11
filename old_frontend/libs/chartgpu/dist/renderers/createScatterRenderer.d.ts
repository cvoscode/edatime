import type { ResolvedScatterSeriesConfig } from '../config/OptionResolver';
import type { CartesianSeriesData } from '../config/types';
import type { LinearScale } from '../utils/scales';
import type { GridArea } from './createGridRenderer';
import type { PipelineCache } from '../core/PipelineCache';
export interface ScatterRenderer {
    prepare(seriesConfig: ResolvedScatterSeriesConfig, data: CartesianSeriesData, xScale: LinearScale, yScale: LinearScale, gridArea?: GridArea): void;
    render(passEncoder: GPURenderPassEncoder): void;
    dispose(): void;
}
export interface ScatterRendererOptions {
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
export declare function createScatterRenderer(device: GPUDevice, options?: ScatterRendererOptions): ScatterRenderer;
//# sourceMappingURL=createScatterRenderer.d.ts.map