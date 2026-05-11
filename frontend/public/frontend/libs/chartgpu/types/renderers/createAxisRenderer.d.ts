import type { AxisConfig } from '../config/types';
import type { LinearScale } from '../utils/scales';
import type { GridArea } from './createGridRenderer';
export interface AxisRenderer {
    prepare(axisConfig: AxisConfig, scale: LinearScale, orientation: 'x' | 'y', gridArea: GridArea, axisLineColor?: string, axisTickColor?: string, tickCount?: number): void;
    render(passEncoder: GPURenderPassEncoder): void;
    dispose(): void;
}
export interface AxisRendererOptions {
    /**
     * Must match the canvas context format used for the render pass color attachment.
     * Usually this is `gpuContext.preferredFormat`.
     *
     * Defaults to `'bgra8unorm'` for backward compatibility.
     */
    readonly targetFormat?: GPUTextureFormat;
}
export declare function createAxisRenderer(device: GPUDevice, options?: AxisRendererOptions): AxisRenderer;
//# sourceMappingURL=createAxisRenderer.d.ts.map