import type { ResolvedChartGPUOptions } from '../config/OptionResolver';
import type { OHLCDataPoint } from '../config/types';
import { GPUContext } from './GPUContext';
import type { CartesianSeriesData } from '../config/types';
import type { PipelineCache } from './PipelineCache';
import type { ZoomChangeSourceKind } from '../ChartGPU';
export interface GPUContextLike {
    readonly device: GPUDevice | null;
    readonly canvas: HTMLCanvasElement | null;
    readonly canvasContext: GPUCanvasContext | null;
    readonly preferredFormat: GPUTextureFormat | null;
    readonly initialized: boolean;
    readonly devicePixelRatio?: number;
}
export interface RenderCoordinator {
    setOptions(resolvedOptions: ResolvedChartGPUOptions): void;
    /**
     * Appends new points to a cartesian series’ runtime data without requiring a full `setOptions(...)`
     * resolver pass.
     *
     * Appends are coalesced and flushed once per render frame.
     */
    appendData(seriesIndex: number, newPoints: CartesianSeriesData | ReadonlyArray<OHLCDataPoint>): void;
    /**
     * Gets the current “interaction x” in domain units (or `null` when inactive).
     *
     * This is derived from pointer movement inside the plot grid and can also be driven
     * externally via `setInteractionX(...)` (e.g. chart sync).
     */
    getInteractionX(): number | null;
    /**
     * Drives the chart’s crosshair + tooltip from a domain-space x value.
     *
     * Passing `null` clears the interaction (hides crosshair/tooltip).
     */
    setInteractionX(x: number | null, source?: unknown): void;
    /**
     * Subscribes to interaction x changes (domain units).
     *
     * Returns an unsubscribe function.
     */
    onInteractionXChange(callback: (x: number | null, source?: unknown) => void): () => void;
    /**
     * Returns the current percent-space zoom window (or `null` when zoom is disabled).
     */
    getZoomRange(): Readonly<{
        start: number;
        end: number;
    }> | null;
    /**
     * Sets the percent-space zoom window.
     *
     * No-op when zoom is disabled.
     */
    setZoomRange(start: number, end: number): void;
    /**
     * Subscribes to zoom window changes (percent space).
     *
     * Returns an unsubscribe function.
     */
    onZoomRangeChange(cb: (range: Readonly<{
        start: number;
        end: number;
    }>, sourceKind?: ZoomChangeSourceKind) => void): () => void;
    render(): void;
    dispose(): void;
}
export type RenderCoordinatorCallbacks = Readonly<{
    /**
     * Optional hook for render-on-demand systems (like `ChartGPU`) to re-render when
     * interaction state changes (e.g. crosshair on pointer move).
     */
    readonly onRequestRender?: () => void;
    /**
     * Optional shared cache for shader modules + render pipelines (CGPU-PIPELINE-CACHE).
     * Opt-in only: if omitted, coordinator/renderers behave identically.
     */
    readonly pipelineCache?: PipelineCache;
}>;
export declare function createRenderCoordinator(gpuContext: GPUContext, options: ResolvedChartGPUOptions, callbacks?: RenderCoordinatorCallbacks): RenderCoordinator;
//# sourceMappingURL=createRenderCoordinator.d.ts.map