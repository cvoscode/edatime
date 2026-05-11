import type { ChartGPUOptions, DataPoint, OHLCDataPoint } from './config/types';
import type { PerformanceMetrics, PerformanceCapabilities } from './config/types';
export interface ChartGPUInstance {
    readonly options: Readonly<ChartGPUOptions>;
    readonly disposed: boolean;
    setOption(options: ChartGPUOptions): void;
    /**
     * Appends new points to a cartesian series at runtime (streaming).
     *
     * For candlestick series, pass `OHLCDataPoint[]`.
     * For other cartesian series (line, area, bar, scatter), pass `DataPoint[]`.
     * Pie series are non-cartesian and are not supported by streaming append.
     */
    appendData(seriesIndex: number, newPoints: DataPoint[] | OHLCDataPoint[]): void;
    resize(): void;
    dispose(): void;
    on(eventName: 'crosshairMove', callback: ChartGPUCrosshairMoveCallback): void;
    on(eventName: ChartGPUEventName, callback: ChartGPUEventCallback): void;
    off(eventName: 'crosshairMove', callback: ChartGPUCrosshairMoveCallback): void;
    off(eventName: ChartGPUEventName, callback: ChartGPUEventCallback): void;
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
     * Alias for `setInteractionX(...)` for chart sync semantics.
     */
    setCrosshairX(x: number | null, source?: unknown): void;
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
     * Gets the latest performance metrics.
     * Returns exact FPS and detailed frame statistics.
     *
     * @returns Current performance metrics, or null if not available
     */
    getPerformanceMetrics(): Readonly<PerformanceMetrics> | null;
    /**
     * Gets the performance capabilities of the current environment.
     * Indicates which performance features are supported.
     *
     * @returns Performance capabilities, or null if not initialized
     */
    getPerformanceCapabilities(): Readonly<PerformanceCapabilities> | null;
    /**
     * Registers a callback to be notified of performance metric updates.
     * Callback is invoked every frame with the latest metrics.
     *
     * @param callback - Function to call with updated metrics
     * @returns Unsubscribe function to remove the callback
     */
    onPerformanceUpdate(callback: (metrics: Readonly<PerformanceMetrics>) => void): () => void;
}
export type ChartGPU = ChartGPUInstance;
export type ChartGPUEventName = 'click' | 'mouseover' | 'mouseout' | 'crosshairMove';
export type ChartGPUEventPayload = Readonly<{
    readonly seriesIndex: number | null;
    readonly dataIndex: number | null;
    readonly value: readonly [number, number] | null;
    readonly seriesName: string | null;
    readonly event: PointerEvent;
}>;
export type ChartGPUCrosshairMovePayload = Readonly<{
    readonly x: number | null;
    readonly source?: unknown;
}>;
export type ChartGPUEventCallback = (payload: ChartGPUEventPayload) => void;
export type ChartGPUCrosshairMoveCallback = (payload: ChartGPUCrosshairMovePayload) => void;
export declare function createChartGPU(container: HTMLElement, options: ChartGPUOptions): Promise<ChartGPUInstance>;
export declare const ChartGPU: {
    create: typeof createChartGPU;
};
//# sourceMappingURL=ChartGPU.d.ts.map