import type { RawBounds, ResolvedScatterSeriesConfig } from '../config/OptionResolver';
import type { LinearScale } from '../utils/scales';
import type { GridArea } from './createGridRenderer';
export interface ScatterDensityRenderer {
    prepare(seriesConfig: ResolvedScatterSeriesConfig, pointBuffer: GPUBuffer, pointCount: number, visibleStartIndex: number, visibleEndIndex: number, xScale: LinearScale, yScale: LinearScale, gridArea: GridArea, rawBounds?: RawBounds): void;
    encodeCompute(encoder: GPUCommandEncoder): void;
    render(passEncoder: GPURenderPassEncoder): void;
    dispose(): void;
}
export interface ScatterDensityRendererOptions {
    readonly targetFormat?: GPUTextureFormat;
}
export declare function createScatterDensityRenderer(device: GPUDevice, options?: ScatterDensityRendererOptions): ScatterDensityRenderer;
//# sourceMappingURL=createScatterDensityRenderer.d.ts.map