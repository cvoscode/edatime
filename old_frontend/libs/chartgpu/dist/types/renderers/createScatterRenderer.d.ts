import type { ResolvedScatterSeriesConfig } from '../config/OptionResolver';
import type { LinearScale } from '../utils/scales';
import type { GridArea } from './createGridRenderer';
export interface ScatterRenderer {
    prepare(seriesConfig: ResolvedScatterSeriesConfig, data: ResolvedScatterSeriesConfig['data'], xScale: LinearScale, yScale: LinearScale, gridArea?: GridArea): void;
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
}
export declare function createScatterRenderer(device: GPUDevice, options?: ScatterRendererOptions): ScatterRenderer;
//# sourceMappingURL=createScatterRenderer.d.ts.map