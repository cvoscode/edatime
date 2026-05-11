import type { ResolvedCandlestickSeriesConfig } from '../config/OptionResolver';
import type { LinearScale } from '../utils/scales';
import type { GridArea } from './createGridRenderer';
export interface CandlestickRenderer {
    prepare(series: ResolvedCandlestickSeriesConfig, data: ResolvedCandlestickSeriesConfig['data'], xScale: LinearScale, yScale: LinearScale, gridArea: GridArea, backgroundColor?: string): void;
    render(passEncoder: GPURenderPassEncoder): void;
    dispose(): void;
}
export interface CandlestickRendererOptions {
    /**
     * Must match the canvas context format used for the render pass color attachment.
     * Usually this is `gpuContext.preferredFormat`.
     *
     * Defaults to `'bgra8unorm'` for backward compatibility.
     */
    readonly targetFormat?: GPUTextureFormat;
}
export declare function createCandlestickRenderer(device: GPUDevice, options?: CandlestickRendererOptions): CandlestickRenderer;
//# sourceMappingURL=createCandlestickRenderer.d.ts.map