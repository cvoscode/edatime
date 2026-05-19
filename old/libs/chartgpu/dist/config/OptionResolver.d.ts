import type { AreaStyleConfig, AnnotationConfig, AxisConfig, CandlestickItemStyleConfig, CandlestickSeriesConfig, CandlestickStyle, ChartGPUOptions, GridConfig, LineStyleConfig, AreaSeriesConfig, BarSeriesConfig, LineSeriesConfig, PieDataItem, PieSeriesConfig, ScatterSeriesConfig, SeriesSampling } from './types';
import type { ThemeConfig } from '../themes/types';
export type ResolvedGridConfig = Readonly<Required<GridConfig>>;
export type ResolvedLineStyleConfig = Readonly<Required<Omit<LineStyleConfig, 'color'>> & {
    readonly color: string;
}>;
export type ResolvedAreaStyleConfig = Readonly<Required<Omit<AreaStyleConfig, 'color'>> & {
    readonly color: string;
}>;
/**
 * Resolved grid lines direction configuration with all defaults applied.
 */
export type ResolvedGridLinesDirectionConfig = Readonly<{
    readonly show: boolean;
    readonly count: number;
    readonly color: string;
}>;
/**
 * Resolved grid lines configuration with all defaults and color resolution applied.
 */
export type ResolvedGridLinesConfig = Readonly<{
    readonly show: boolean;
    readonly color: string;
    readonly opacity: number;
    readonly horizontal: ResolvedGridLinesDirectionConfig;
    readonly vertical: ResolvedGridLinesDirectionConfig;
}>;
export type RawBounds = Readonly<{
    xMin: number;
    xMax: number;
    yMin: number;
    yMax: number;
}>;
export type ResolvedLineSeriesConfig = Readonly<Omit<LineSeriesConfig, 'color' | 'lineStyle' | 'areaStyle' | 'sampling' | 'samplingThreshold' | 'data' | 'connectNulls'> & {
    readonly connectNulls: boolean;
    readonly color: string;
    readonly lineStyle: ResolvedLineStyleConfig;
    readonly areaStyle?: ResolvedAreaStyleConfig;
    readonly sampling: SeriesSampling;
    readonly samplingThreshold: number;
    /**
     * Original (unsampled) series data.
     *
     * Used at runtime for zoom-aware re-sampling so we can increase detail when zoomed-in without
     * losing outliers or permanently discarding points.
     */
    readonly rawData: Readonly<LineSeriesConfig['data']>;
    readonly data: Readonly<LineSeriesConfig['data']>;
    /**
     * Bounds computed from the original (unsampled) data. Used for axis auto-bounds so sampling
     * cannot clip outliers.
     */
    readonly rawBounds?: RawBounds;
}>;
export type ResolvedAreaSeriesConfig = Readonly<Omit<AreaSeriesConfig, 'color' | 'areaStyle' | 'sampling' | 'samplingThreshold' | 'data' | 'connectNulls'> & {
    readonly connectNulls: boolean;
    readonly color: string;
    readonly areaStyle: ResolvedAreaStyleConfig;
    readonly sampling: SeriesSampling;
    readonly samplingThreshold: number;
    /** Original (unsampled) series data (see `ResolvedLineSeriesConfig.rawData`). */
    readonly rawData: Readonly<AreaSeriesConfig['data']>;
    readonly data: Readonly<AreaSeriesConfig['data']>;
    /**
     * Bounds computed from the original (unsampled) data. Used for axis auto-bounds so sampling
     * cannot clip outliers.
     */
    readonly rawBounds?: RawBounds;
}>;
export type ResolvedBarSeriesConfig = Readonly<Omit<BarSeriesConfig, 'color' | 'sampling' | 'samplingThreshold' | 'data'> & {
    readonly color: string;
    readonly sampling: SeriesSampling;
    readonly samplingThreshold: number;
    /** Original (unsampled) series data (see `ResolvedLineSeriesConfig.rawData`). */
    readonly rawData: Readonly<BarSeriesConfig['data']>;
    readonly data: Readonly<BarSeriesConfig['data']>;
    /**
     * Bounds computed from the original (unsampled) data. Used for axis auto-bounds so sampling
     * cannot clip outliers.
     */
    readonly rawBounds?: RawBounds;
}>;
export type ResolvedScatterSeriesConfig = Readonly<Omit<ScatterSeriesConfig, 'color' | 'sampling' | 'samplingThreshold' | 'data' | 'mode' | 'binSize' | 'densityColormap' | 'densityNormalization'> & {
    readonly color: string;
    readonly sampling: SeriesSampling;
    readonly samplingThreshold: number;
    readonly mode: NonNullable<ScatterSeriesConfig['mode']>;
    readonly binSize: number;
    readonly densityColormap: NonNullable<ScatterSeriesConfig['densityColormap']>;
    readonly densityNormalization: NonNullable<ScatterSeriesConfig['densityNormalization']>;
    /** Original (unsampled) series data (see `ResolvedLineSeriesConfig.rawData`). */
    readonly rawData: Readonly<ScatterSeriesConfig['data']>;
    readonly data: Readonly<ScatterSeriesConfig['data']>;
    /**
     * Bounds computed from the original (unsampled) data. Used for axis auto-bounds so sampling
     * cannot clip outliers.
     */
    readonly rawBounds?: RawBounds;
}>;
export type ResolvedPieDataItem = Readonly<Omit<PieDataItem, 'color' | 'visible'> & {
    readonly color: string;
    readonly visible: boolean;
}>;
export type ResolvedPieSeriesConfig = Readonly<Omit<PieSeriesConfig, 'color' | 'data'> & {
    readonly color: string;
    readonly data: ReadonlyArray<ResolvedPieDataItem>;
}>;
export type ResolvedCandlestickItemStyleConfig = Readonly<Required<CandlestickItemStyleConfig>>;
export type ResolvedCandlestickSeriesConfig = Readonly<Omit<CandlestickSeriesConfig, 'color' | 'style' | 'itemStyle' | 'barWidth' | 'barMinWidth' | 'barMaxWidth' | 'sampling' | 'samplingThreshold' | 'data'> & {
    readonly color: string;
    readonly style: CandlestickStyle;
    readonly itemStyle: ResolvedCandlestickItemStyleConfig;
    readonly barWidth: number | string;
    readonly barMinWidth: number;
    readonly barMaxWidth: number;
    readonly sampling: 'none' | 'ohlc';
    readonly samplingThreshold: number;
    /** Original (unsampled) series data. */
    readonly rawData: Readonly<CandlestickSeriesConfig['data']>;
    readonly data: Readonly<CandlestickSeriesConfig['data']>;
    /**
     * Bounds computed from the original (unsampled) data. Used for axis auto-bounds so sampling
     * cannot clip outliers.
     */
    readonly rawBounds?: RawBounds;
}>;
export type ResolvedSeriesConfig = ResolvedLineSeriesConfig | ResolvedAreaSeriesConfig | ResolvedBarSeriesConfig | ResolvedScatterSeriesConfig | ResolvedPieSeriesConfig | ResolvedCandlestickSeriesConfig;
export interface ResolvedChartGPUOptions extends Omit<ChartGPUOptions, 'grid' | 'gridLines' | 'xAxis' | 'yAxis' | 'theme' | 'palette' | 'series' | 'legend'> {
    readonly grid: ResolvedGridConfig;
    readonly gridLines: ResolvedGridLinesConfig;
    readonly xAxis: AxisConfig;
    readonly yAxis: AxisConfig;
    readonly autoScroll: boolean;
    readonly theme: ThemeConfig;
    readonly palette: ReadonlyArray<string>;
    readonly series: ReadonlyArray<ResolvedSeriesConfig>;
    readonly annotations?: ReadonlyArray<AnnotationConfig>;
    readonly legend?: import('./types').LegendConfig;
}
export declare function resolveOptions(userOptions?: ChartGPUOptions): ResolvedChartGPUOptions;
/**
 * Resolves chart options with slider bottom-space reservation.
 *
 * This function wraps `resolveOptions()` and applies additional grid bottom spacing
 * when a slider-type dataZoom is configured. The reservation ensures x-axis labels
 * and ticks are visible above the slider overlay.
 *
 * **Usage**: Use this function instead of `resolveOptions()` when creating charts
 * to ensure consistent slider layout.
 *
 * @param userOptions - User-provided chart options
 * @returns Resolved options with slider bottom-space applied if needed
 */
export declare function resolveOptionsForChart(userOptions?: ChartGPUOptions): ResolvedChartGPUOptions;
export declare const OptionResolver: {
    readonly resolve: typeof resolveOptions;
};
//# sourceMappingURL=OptionResolver.d.ts.map