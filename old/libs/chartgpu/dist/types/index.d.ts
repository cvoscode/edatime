/**
 * ChartGPU - A GPU-accelerated charting library built with WebGPU
 */
export declare const version = "1.0.0";
import { createChartInWorker } from './worker/createChartInWorker';
export declare const ChartGPU: {
    createInWorker: typeof createChartInWorker;
    create: typeof import("./ChartGPU").createChartGPU;
};
export { createChartGPU as createChart } from './ChartGPU';
export type { ChartGPUInstance } from './ChartGPU';
export type { ChartGPUEventName, ChartGPUEventPayload, ChartGPUCrosshairMovePayload, ChartGPUEventCallback, ChartGPUCrosshairMoveCallback, } from './ChartGPU';
export type { AreaStyleConfig, AnimationConfig, AxisConfig, AxisLabel, AxisType, BarItemStyleConfig, CandlestickItemStyleConfig, CandlestickSeriesConfig, CandlestickStyle, ChartGPUOptions, DataZoomConfig, DataPoint, GridConfig, LegendItem, LineStyleConfig, AreaSeriesConfig, LineSeriesConfig, BarSeriesConfig, NormalizedPointerEvent, PerformanceMetrics, PointerEventData, OHLCDataPoint, PieCenter, PieDataItem, PieItemStyleConfig, PieRadius, PieSeriesConfig, ScatterSeriesConfig, ScatterSymbol, ScatterPointTuple, SeriesConfig, SeriesSampling, SeriesType, TooltipConfig, TooltipData, TooltipParams, } from './config/types';
export { candlestickDefaults, defaultOptions } from './config/defaults';
export { OptionResolver, resolveOptions } from './config/OptionResolver';
export type { ResolvedCandlestickSeriesConfig, ResolvedChartGPUOptions, ResolvedAreaSeriesConfig, ResolvedAreaStyleConfig, ResolvedGridConfig, ResolvedLineSeriesConfig, ResolvedLineStyleConfig, ResolvedSeriesConfig, } from './config/OptionResolver';
export type { ThemeConfig } from './themes/types';
export { darkTheme, lightTheme, getTheme } from './themes';
export type { ThemeName } from './themes';
export { createLinearScale, createCategoryScale } from './utils/scales';
export type { LinearScale, CategoryScale } from './utils/scales';
export { packDataPoints, packOHLCDataPoints } from './data/packDataPoints';
export { connectCharts } from './interaction/createChartSync';
export type { GPUContextState, GPUContextOptions, SupportedCanvas, } from './core/GPUContext';
export { createGPUContext, createGPUContextAsync, initializeGPUContext, getCanvasTexture, clearScreen, destroyGPUContext, } from './core/GPUContext';
export { GPUContext } from './core/GPUContext';
export type { RenderSchedulerState, RenderCallback } from './core/RenderScheduler';
export { createRenderScheduler, createRenderSchedulerAsync, startRenderScheduler, stopRenderScheduler, requestRender, destroyRenderScheduler, } from './core/RenderScheduler';
export type { RenderCoordinatorCallbacks } from './core/createRenderCoordinator';
export { RenderScheduler } from './core/RenderScheduler';
export { ChartGPUWorkerProxy } from './worker/ChartGPUWorkerProxy';
export { ChartGPUWorkerError, XY_STRIDE, OHLC_STRIDE } from './worker/types';
export type { WorkerConfig, PendingRequest, StrideBytes } from './worker/types';
export type { WorkerInboundMessage, WorkerOutboundMessage, InitMessage, SetOptionMessage, AppendDataMessage, AppendDataBatchMessage, ResizeMessage, ForwardPointerEventMessage, SetZoomRangeMessage, SetInteractionXMessage, SetAnimationMessage, DisposeMessage, ReadyMessage, RenderedMessage, TooltipUpdateMessage, LegendUpdateMessage, AxisLabelsUpdateMessage, WorkerEventPayload, HoverChangeMessage, ClickMessage, CrosshairMoveMessage, ZoomChangeMessage, DeviceLostMessage, DisposedMessage, ErrorMessage, } from './worker/protocol';
//# sourceMappingURL=index.d.ts.map