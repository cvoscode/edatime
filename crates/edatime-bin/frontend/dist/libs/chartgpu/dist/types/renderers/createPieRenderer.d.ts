import type { ResolvedPieSeriesConfig } from '../config/OptionResolver';
import type { GridArea } from './createGridRenderer';
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
}
export declare function createPieRenderer(device: GPUDevice, options?: PieRendererOptions): PieRenderer;
//# sourceMappingURL=createPieRenderer.d.ts.map