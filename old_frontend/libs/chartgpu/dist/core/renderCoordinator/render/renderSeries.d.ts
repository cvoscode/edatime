/**
 * Series Rendering Utilities
 *
 * Prepares and renders all chart series types (area, line, bar, scatter, candlestick, pie).
 * Handles intro animations, GPU buffer management, and multi-pass rendering with proper layering.
 *
 * @module renderSeries
 */
import type { ResolvedChartGPUOptions, ResolvedSeriesConfig, ResolvedBarSeriesConfig } from '../../../config/OptionResolver';
import type { LinearScale } from '../../../utils/scales';
import type { GridArea } from '../../../renderers/createGridRenderer';
import type { LineRenderer } from '../../../renderers/createLineRenderer';
import type { AreaRenderer } from '../../../renderers/createAreaRenderer';
import type { BarRenderer } from '../../../renderers/createBarRenderer';
import type { ScatterRenderer } from '../../../renderers/createScatterRenderer';
import type { ScatterDensityRenderer } from '../../../renderers/createScatterDensityRenderer';
import type { PieRenderer } from '../../../renderers/createPieRenderer';
import type { CandlestickRenderer } from '../../../renderers/createCandlestickRenderer';
import type { ReferenceLineRenderer } from '../../../renderers/createReferenceLineRenderer';
import type { AnnotationMarkerRenderer } from '../../../renderers/createAnnotationMarkerRenderer';
import type { DataStore } from '../../../data/createDataStore';
export interface SeriesRenderers {
    readonly lineRenderers: ReadonlyArray<LineRenderer>;
    readonly areaRenderers: ReadonlyArray<AreaRenderer>;
    readonly barRenderer: BarRenderer;
    readonly scatterRenderers: ReadonlyArray<ScatterRenderer>;
    readonly scatterDensityRenderers: ReadonlyArray<ScatterDensityRenderer>;
    readonly pieRenderers: ReadonlyArray<PieRenderer>;
    readonly candlestickRenderers: ReadonlyArray<CandlestickRenderer>;
}
export interface AnnotationRenderers {
    referenceLineRenderer: ReferenceLineRenderer;
    referenceLineRendererMsaa: ReferenceLineRenderer;
    annotationMarkerRenderer: AnnotationMarkerRenderer;
    annotationMarkerRendererMsaa: AnnotationMarkerRenderer;
}
export interface SeriesPrepareContext {
    currentOptions: ResolvedChartGPUOptions;
    seriesForRender: ReadonlyArray<ResolvedSeriesConfig>;
    xScale: LinearScale;
    yScale: LinearScale;
    gridArea: GridArea;
    dataStore: DataStore;
    appendedGpuThisFrame: Set<number>;
    gpuSeriesKindByIndex: Array<'fullRawLine' | 'other' | 'unknown'>;
    zoomState: {
        getRange(): {
            start: number;
            end: number;
        } | null;
    } | null;
    visibleXDomain: {
        min: number;
        max: number;
    };
    introPhase: 'pending' | 'running' | 'done';
    introProgress01: number;
    withAlpha: (color: string, alpha: number) => string;
    maxRadiusCss: number;
}
export interface SeriesRenderContext {
    hasCartesianSeries: boolean;
    gridArea: GridArea;
    mainPass: GPURenderPassEncoder;
    plotScissor: {
        x: number;
        y: number;
        w: number;
        h: number;
    };
    introPhase: 'pending' | 'running' | 'done';
    introProgress01: number;
    referenceLineBelowCount: number;
    markerBelowCount: number;
}
export interface AboveSeriesAnnotationContext {
    hasCartesianSeries: boolean;
    gridArea: GridArea;
    overlayPass: GPURenderPassEncoder;
    plotScissor: {
        x: number;
        y: number;
        w: number;
        h: number;
    };
    referenceLineBelowCount: number;
    referenceLineAboveCount: number;
    markerBelowCount: number;
    markerAboveCount: number;
}
export interface SeriesPreparationResult {
    visibleSeriesForRender: ReadonlyArray<{
        series: ResolvedSeriesConfig;
        originalIndex: number;
    }>;
    barSeriesConfigs: ResolvedBarSeriesConfig[];
    visibleBarSeriesConfigs: ResolvedBarSeriesConfig[];
}
/**
 * Prepares all series renderers with current frame data.
 *
 * This loop prepares ALL series (including hidden) to maintain correct renderer indices.
 * Visibility filtering happens after preparation for rendering.
 *
 * @param renderers - Series renderer instances
 * @param context - Preparation context with scales, options, and state
 * @returns Preparation result with visibility-filtered series arrays
 */
export declare function prepareSeries(renderers: SeriesRenderers, context: SeriesPrepareContext): SeriesPreparationResult;
/**
 * Encodes scatter density compute passes before rendering.
 *
 * Must be called before beginRenderPass() for the main pass.
 *
 * @param renderers - Series renderer instances
 * @param seriesForRender - All series configurations
 * @param encoder - Command encoder for compute passes
 */
export declare function encodeScatterDensityCompute(renderers: SeriesRenderers, seriesForRender: ReadonlyArray<ResolvedSeriesConfig>, encoder: GPUCommandEncoder): void;
/**
 * Renders all series to the main render pass with proper layering.
 *
 * Render order (from back to front):
 * 1. Pies (non-cartesian, behind cartesian series)
 * 2. Annotations below series (reference lines, markers)
 * 3. Area fills
 * 4. Bars
 * 5. Candlesticks
 * 6. Scatter points
 * 7. Line strokes
 *
 * @param renderers - Series renderer instances
 * @param annotationRenderers - Annotation renderer instances
 * @param context - Render pass context with pass encoders and state
 */
export declare function renderSeries(renderers: SeriesRenderers, annotationRenderers: AnnotationRenderers, context: SeriesRenderContext, prepResult: SeriesPreparationResult): void;
/**
 * Renders above-series annotations to the MSAA overlay pass.
 *
 * Must be called during the MSAA overlay pass (after blit).
 *
 * @param annotationRenderers - Annotation renderer instances
 * @param context - Render pass context with overlay pass and state
 */
export declare function renderAboveSeriesAnnotations(annotationRenderers: AnnotationRenderers, context: AboveSeriesAnnotationContext): void;
//# sourceMappingURL=renderSeries.d.ts.map