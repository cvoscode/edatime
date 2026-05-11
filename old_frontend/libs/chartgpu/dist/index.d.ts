/**
 * ChartGPU - A GPU-accelerated charting library built with WebGPU
 */
export declare const version = "1.0.0";
export declare const ChartGPU: {
    create: typeof import("./ChartGPU").createChartGPU;
};
export { createChartGPU as createChart } from './ChartGPU';
export type { ChartGPUInstance } from './ChartGPU';
export type { ChartGPUEventName, ChartGPUEventPayload, ChartGPUCrosshairMovePayload, ChartGPUEventCallback, ChartGPUCrosshairMoveCallback, ChartGPUZoomRangeChangePayload, ChartGPUZoomRangeChangeCallback, ChartGPUDeviceLostPayload, ChartGPUDeviceLostCallback, ChartGPUCreateContext, ChartGPUHitTestMatch, ChartGPUHitTestResult, ZoomChangeSourceKind, } from './ChartGPU';
export type { AnnotationConfig, AnnotationConfigBase, AnnotationLabel, AnnotationLabelAnchor, AnnotationLabelBackground, AnnotationLabelPadding, AnnotationLayer, AnnotationLineX, AnnotationLineY, AnnotationPoint, AnnotationPointMarker, AnnotationPosition, AnnotationStyle, AnnotationText, AreaStyleConfig, AnimationConfig, AxisConfig, AxisType, BarItemStyleConfig, CandlestickItemStyleConfig, CandlestickSeriesConfig, CandlestickStyle, ChartGPUOptions, DataZoomConfig, DataPoint, GridConfig, GridLinesConfig, GridLinesDirectionConfig, LegendConfig, LegendPosition, LineStyleConfig, AreaSeriesConfig, LineSeriesConfig, BarSeriesConfig, PerformanceMetrics, OHLCDataPoint, PieCenter, PieDataItem, PieItemStyleConfig, PieRadius, PieSeriesConfig, RenderMode, ScatterSeriesConfig, ScatterSymbol, ScatterPointTuple, SeriesConfig, SeriesSampling, SeriesType, TooltipConfig, TooltipParams, } from './config/types';
export { candlestickDefaults, defaultOptions } from './config/defaults';
export { OptionResolver, resolveOptions } from './config/OptionResolver';
export type { ResolvedCandlestickSeriesConfig, ResolvedChartGPUOptions, ResolvedAreaSeriesConfig, ResolvedAreaStyleConfig, ResolvedGridConfig, ResolvedGridLinesConfig, ResolvedGridLinesDirectionConfig, ResolvedLineSeriesConfig, ResolvedLineStyleConfig, ResolvedPieDataItem, ResolvedPieSeriesConfig, ResolvedSeriesConfig, } from './config/OptionResolver';
export type { ThemeConfig } from './themes/types';
export { darkTheme, lightTheme, getTheme } from './themes';
export type { ThemeName } from './themes';
export { createLinearScale, createCategoryScale } from './utils/scales';
export type { LinearScale, CategoryScale } from './utils/scales';
export { connectCharts } from './interaction/createChartSync';
export type { ChartSyncOptions } from './interaction/createChartSync';
export { createAnnotationAuthoring } from './interaction/createAnnotationAuthoring';
export type { AnnotationAuthoringInstance, AnnotationAuthoringOptions } from './interaction/createAnnotationAuthoring';
export type { GPUContextState, GPUContextOptions, SupportedCanvas, } from './core/GPUContext';
export { createGPUContext, createGPUContextAsync, initializeGPUContext, getCanvasTexture, clearScreen, destroyGPUContext, } from './core/GPUContext';
export { GPUContext } from './core/GPUContext';
export type { RenderSchedulerState, RenderCallback } from './core/RenderScheduler';
export { createRenderScheduler, createRenderSchedulerAsync, startRenderScheduler, stopRenderScheduler, requestRender, destroyRenderScheduler, } from './core/RenderScheduler';
export { RenderScheduler } from './core/RenderScheduler';
export type { PipelineCache, PipelineCacheStats } from './core/PipelineCache';
export { createPipelineCache, getPipelineCacheStats, destroyPipelineCache } from './core/createPipelineCache';
//# sourceMappingURL=index.d.ts.map