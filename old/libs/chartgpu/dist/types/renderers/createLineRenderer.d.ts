import type { ResolvedLineSeriesConfig } from '../config/OptionResolver';
import type { LinearScale } from '../utils/scales';
export interface LineRenderer {
    prepare(seriesConfig: ResolvedLineSeriesConfig, dataBuffer: GPUBuffer, xScale: LinearScale, yScale: LinearScale): void;
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
}
export declare function createLineRenderer(device: GPUDevice, options?: LineRendererOptions): LineRenderer;
//# sourceMappingURL=createLineRenderer.d.ts.map