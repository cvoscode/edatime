import type { ResolvedAreaSeriesConfig } from '../config/OptionResolver';
import type { LinearScale } from '../utils/scales';
export interface AreaRenderer {
    prepare(seriesConfig: ResolvedAreaSeriesConfig, data: ResolvedAreaSeriesConfig['data'], xScale: LinearScale, yScale: LinearScale, baseline?: number): void;
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
}
export declare function createAreaRenderer(device: GPUDevice, options?: AreaRendererOptions): AreaRenderer;
//# sourceMappingURL=createAreaRenderer.d.ts.map