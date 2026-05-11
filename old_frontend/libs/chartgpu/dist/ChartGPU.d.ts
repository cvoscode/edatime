import type { CartesianSeriesData, ChartGPUOptions, OHLCDataPoint, RenderMode } from './config/types';
import type { PipelineCache } from './core/PipelineCache';
export type { PipelineCache, PipelineCacheStats } from './core/PipelineCache';
import type { PerformanceMetrics, PerformanceCapabilities } from './config/types';
/**
 * Source kind for zoom range changes.
 *
 * Used to distinguish zoom change sources:
 * - `'user'`: Direct user interaction (pan, pinch, wheel, slider)
 * - `'auto-scroll'`: Automatic zoom adjustment from streaming data with auto-scroll enabled
 * - `'api'`: Programmatic zoom via `setZoomRange(..., source)` calls
 */
export type ZoomChangeSourceKind = 'user' | 'auto-scroll' | 'api';
/**
 * Hit-test match for a chart element.
 */
export type ChartGPUHitTestMatch = Readonly<{
    readonly kind: 'cartesian' | 'candlestick' | 'pie';
    readonly seriesIndex: number;
    readonly dataIndex: number;
    readonly value: readonly [number, number];
}>;
/**
 * Result of a hit-test operation on a chart.
 */
export type ChartGPUHitTestResult = Readonly<{
    readonly isInGrid: boolean;
    readonly canvasX: number;
    readonly canvasY: number;
    readonly gridX: number;
    readonly gridY: number;
    readonly match: ChartGPUHitTestMatch | null;
}>;
export interface ChartGPUInstance {
    readonly options: Readonly<ChartGPUOptions>;
    readonly disposed: boolean;
    setOption(options: ChartGPUOptions): void;
    /**
     * Appends new points to a cartesian series at runtime (streaming).
     *
     * Accepts multiple formats for efficient data append without per-point object allocations:
     * - `DataPoint[]`: Traditional array of point objects/tuples (existing behavior)
     * - `XYArraysData`: Separate x/y/size arrays (`{x: ArrayLike<number>, y: ArrayLike<number>, size?: ArrayLike<number>}`)
     * - `InterleavedXYData`: Typed array with [x0,y0,x1,y1,...] layout (e.g. `Float32Array`)
     * - `OHLCDataPoint[]`: For candlestick series only
     *
     * Point count is derived via `getPointCount()` from `cartesianData.ts`:
     * - `XYArraysData`: min(x.length, y.length)
     * - `InterleavedXYData`: floor(length / 2), ignoring trailing odd element
     * - `DataView` is unsupported and throws an error
     *
     * Pie series are non-cartesian and are not supported by streaming append.
     */
    appendData(seriesIndex: number, newPoints: CartesianSeriesData | OHLCDataPoint[]): void;
    resize(): void;
    dispose(): void;
    on(eventName: 'crosshairMove', callback: ChartGPUCrosshairMoveCallback): void;
    on(eventName: 'zoomRangeChange', callback: ChartGPUZoomRangeChangeCallback): void;
    on(eventName: 'deviceLost', callback: ChartGPUDeviceLostCallback): void;
    on(eventName: 'dataAppend', callback: ChartGPUDataAppendCallback): void;
    on(eventName: ChartGPUEventName, callback: ChartGPUEventCallback): void;
    off(eventName: 'crosshairMove', callback: ChartGPUCrosshairMoveCallback): void;
    off(eventName: 'zoomRangeChange', callback: ChartGPUZoomRangeChangeCallback): void;
    off(eventName: 'deviceLost', callback: ChartGPUDeviceLostCallback): void;
    off(eventName: 'dataAppend', callback: ChartGPUDataAppendCallback): void;
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
    setZoomRange(start: number, end: number, source?: unknown): void;
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
    /**
     * Performs hit-testing on a pointer or mouse event.
     *
     * Returns coordinates and matched chart element (if any).
     * Accepts both `PointerEvent` (for hover/click) and `MouseEvent` (for contextmenu/right-click).
     *
     * @param e - Pointer or mouse event to test
     * @returns Hit-test result with coordinates and optional match
     */
    hitTest(e: PointerEvent | MouseEvent): ChartGPUHitTestResult;
    /**
     * Gets the current render mode ('auto' | 'external').
     */
    getRenderMode(): RenderMode;
    /**
     * Sets the render mode. In 'auto' mode, ChartGPU schedules renders automatically.
     * In 'external' mode, the application must call renderFrame() on each frame.
     */
    setRenderMode(mode: RenderMode): void;
    /**
     * Renders a single frame (external mode only).
     *
     * In 'auto' mode, this is a no-op and logs a warning in development.
     * In 'external' mode, executes a render if the chart is dirty.
     *
     * @returns true if a frame was rendered, false if the chart was already clean
     */
    renderFrame(): boolean;
    /**
     * Checks if the chart needs rendering (has pending changes).
     *
     * @returns true if the chart is dirty and needs a render
     */
    needsRender(): boolean;
}
export type ChartGPU = ChartGPUInstance;
export type ChartGPUEventName = 'click' | 'mouseover' | 'mouseout' | 'crosshairMove' | 'zoomRangeChange' | 'deviceLost' | 'dataAppend';
export type ChartGPUEventPayload = Readonly<{
    readonly seriesIndex: number | null;
    readonly dataIndex: number | null;
    readonly value: readonly [number, number] | null;
    readonly seriesName: string | null;
    readonly event: PointerEvent;
}>;
export type ChartGPUDeviceLostPayload = Readonly<{
    readonly reason: GPUDeviceLostReason;
    readonly message: string;
}>;
export type ChartGPUCrosshairMovePayload = Readonly<{
    readonly x: number | null;
    readonly source?: unknown;
}>;
export type ChartGPUZoomRangeChangePayload = Readonly<{
    readonly start: number;
    readonly end: number;
    readonly source?: unknown;
    readonly sourceKind?: ZoomChangeSourceKind;
}>;
export type ChartGPUDataAppendPayload = Readonly<{
    readonly seriesIndex: number;
    readonly count: number;
    readonly xExtent: {
        readonly min: number;
        readonly max: number;
    };
}>;
export type ChartGPUEventCallback = (payload: ChartGPUEventPayload) => void;
export type ChartGPUCrosshairMoveCallback = (payload: ChartGPUCrosshairMovePayload) => void;
export type ChartGPUZoomRangeChangeCallback = (payload: ChartGPUZoomRangeChangePayload) => void;
export type ChartGPUDeviceLostCallback = (payload: ChartGPUDeviceLostPayload) => void;
export type ChartGPUDataAppendCallback = (payload: ChartGPUDataAppendPayload) => void;
/**
 * Context for creating a ChartGPU instance with shared WebGPU device and adapter.
 * Use this to share a single GPU device across multiple chart instances for improved resource efficiency.
 *
 * Optionally provide a `pipelineCache` to share compiled pipelines across charts, reducing
 * shader compilation overhead during initialization.
 */
export type ChartGPUCreateContext = Readonly<{
    readonly device: GPUDevice;
    readonly adapter: GPUAdapter;
    /**
     * Optional pipeline cache for sharing compiled pipelines across charts.
     * Must be created for the same GPUDevice as the context.
     *
     * @example
     * ```ts
     * const cache = createPipelineCache(device);
     * const chart1 = await ChartGPU.create(container1, options, { adapter, device, pipelineCache: cache });
     * const chart2 = await ChartGPU.create(container2, options, { adapter, device, pipelineCache: cache });
     * ```
     */
    readonly pipelineCache?: PipelineCache;
}>;
/**
 * Creates a ChartGPU instance with default WebGPU initialization.
 */
export declare function createChartGPU(container: HTMLElement, options: ChartGPUOptions): Promise<ChartGPUInstance>;
/**
 * Creates a ChartGPU instance with a shared WebGPU device and adapter.
 * Use this overload to share a single GPU device across multiple chart instances.
 *
 * @param container - HTML container element for the chart
 * @param options - Chart configuration options
 * @param context - Shared GPU context with device and adapter
 */
export declare function createChartGPU(container: HTMLElement, options: ChartGPUOptions, context: ChartGPUCreateContext): Promise<ChartGPUInstance>;
export declare const ChartGPU: {
    create: typeof createChartGPU;
};
//# sourceMappingURL=ChartGPU.d.ts.map