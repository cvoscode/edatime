import type { ResolvedBarSeriesConfig } from '../config/OptionResolver';
import type { LinearScale } from '../utils/scales';
import type { GridArea } from './createGridRenderer';
import type { DataStore } from '../data/createDataStore';
export interface BarRenderer {
    prepare(seriesConfigs: ReadonlyArray<ResolvedBarSeriesConfig>, dataStore: DataStore, xScale: LinearScale, yScale: LinearScale, gridArea: GridArea): void;
    render(passEncoder: GPURenderPassEncoder): void;
    dispose(): void;
}
export interface BarRendererOptions {
    /**
     * Must match the canvas context format used for the render pass color attachment.
     * Usually this is `gpuContext.preferredFormat`.
     *
     * Defaults to `'bgra8unorm'` for backward compatibility.
     */
    readonly targetFormat?: GPUTextureFormat;
}
export declare function createBarRenderer(device: GPUDevice, options?: BarRendererOptions): BarRenderer;
//# sourceMappingURL=createBarRenderer.d.ts.map