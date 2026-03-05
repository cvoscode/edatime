import type { RawBounds, ResolvedScatterSeriesConfig } from '../config/OptionResolver';
import type { LinearScale } from '../utils/scales';
import type { GridArea } from './createGridRenderer';
import type { PipelineCache } from '../core/PipelineCache';
export interface ScatterDensityRenderer {
    prepare(seriesConfig: ResolvedScatterSeriesConfig, pointBuffer: GPUBuffer, pointCount: number, visibleStartIndex: number, visibleEndIndex: number, xScale: LinearScale, yScale: LinearScale, gridArea: GridArea, rawBounds?: RawBounds): void;
    encodeCompute(encoder: GPUCommandEncoder): void;
    render(passEncoder: GPURenderPassEncoder): void;
    dispose(): void;
}
export interface ScatterDensityRendererOptions {
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
export declare function createScatterDensityRenderer(device: GPUDevice, options?: ScatterDensityRendererOptions): ScatterDensityRenderer;
//# sourceMappingURL=createScatterDensityRenderer.d.ts.map