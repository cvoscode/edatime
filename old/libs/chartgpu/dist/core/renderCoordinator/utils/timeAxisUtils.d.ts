/**
 * Time axis and formatting utilities for the RenderCoordinator.
 *
 * These pure functions handle time-based tick generation, adaptive label formatting,
 * and number/percentage parsing for pie chart configuration.
 *
 * @module timeAxisUtils
 */
import type { LinearScale } from '../../../utils/scales';
import type { PieCenter, PieRadius } from '../../../config/types';
/**
 * Time constants for axis formatting decisions.
 */
export declare const MS_PER_DAY: number;
export declare const MS_PER_MONTH_APPROX: number;
export declare const MS_PER_YEAR_APPROX: number;
/**
 * Tick configuration constants.
 */
export declare const MAX_TIME_X_TICK_COUNT = 9;
export declare const MIN_TIME_X_TICK_COUNT = 1;
export declare const MIN_X_LABEL_GAP_CSS_PX = 6;
export declare const DEFAULT_MAX_TICK_FRACTION_DIGITS = 6;
export declare const DEFAULT_TICK_COUNT = 5;
/**
 * English month abbreviations for time axis labels.
 */
export declare const MONTH_SHORT_EN: readonly string[];
/**
 * Parses value as number or percentage string, returns null if invalid.
 * Used for pie chart center and radius configuration.
 *
 * @param value - Number or percentage string (e.g. "50%", "120", 120)
 * @param basis - Basis value for percentage calculation
 * @returns Parsed number or null if invalid
 */
export declare const parseNumberOrPercent: (value: number | string, basis: number) => number | null;
/**
 * Resolves pie center from mixed number/string/percent format.
 * Defaults to center of plot area (50%, 50%).
 *
 * @param center - Pie center configuration or undefined
 * @param plotWidthCss - Plot area width in CSS pixels
 * @param plotHeightCss - Plot area height in CSS pixels
 * @returns Resolved center coordinates in CSS pixels
 */
export declare const resolvePieCenterPlotCss: (center: PieCenter | undefined, plotWidthCss: number, plotHeightCss: number) => {
    readonly x: number;
    readonly y: number;
};
/**
 * Type guard for pie radius tuple format `[inner, outer]`.
 *
 * @param radius - Pie radius configuration
 * @returns True if radius is a tuple
 */
export declare const isPieRadiusTuple: (radius: PieRadius) => radius is readonly [inner: number | string, outer: number | string];
/**
 * Resolves pie inner/outer radii with defaults, bounds checking.
 * Default outer radius is 70% of max, inner radius is 0 (full pie).
 *
 * @param radius - Pie radius configuration or undefined
 * @param maxRadiusCss - Maximum radius in CSS pixels
 * @returns Resolved inner and outer radii in CSS pixels
 */
export declare const resolvePieRadiiCss: (radius: PieRadius | undefined, maxRadiusCss: number) => {
    readonly inner: number;
    readonly outer: number;
};
/**
 * Calculates decimal precision needed for clean tick formatting from tick step.
 * Prefers "clean" decimal representations (e.g. 2.5, 0.25, 0.125) without relying on magnitude alone.
 *
 * @param tickStep - Step size between ticks
 * @param cap - Maximum fraction digits to return (default 6)
 * @returns Number of fraction digits for formatting
 */
export declare const computeMaxFractionDigitsFromStep: (tickStep: number, cap?: number) => number;
/**
 * Creates Intl.NumberFormat instance for consistent tick formatting.
 * Automatically computes appropriate fraction digits from tick step.
 *
 * @param tickStep - Step size between ticks
 * @returns NumberFormat instance
 */
export declare const createTickFormatter: (tickStep: number) => Intl.NumberFormat;
/**
 * Formats numeric value using NumberFormat, handles -0 and NaN edge cases.
 *
 * @param nf - NumberFormat instance
 * @param v - Value to format
 * @returns Formatted string or null if invalid
 */
export declare const formatTickValue: (nf: Intl.NumberFormat, v: number) => string | null;
/**
 * Pads single-digit numbers with leading zero (used by time formatting).
 *
 * @param n - Number to pad
 * @returns Zero-padded string (minimum 2 digits)
 */
export declare const pad2: (n: number) => string;
/**
 * Formats millisecond timestamps with adaptive precision based on visible range.
 * Format tiers:
 * - < 1 day: HH:mm
 * - 1-7 days: MM/DD HH:mm
 * - 1-12 weeks (up to ~3 months): MM/DD
 * - 3-12 months: MMM DD
 * - > 1 year: YYYY/MM
 *
 * @param timestampMs - Timestamp in milliseconds
 * @param visibleRangeMs - Visible range width in milliseconds
 * @returns Formatted time string or null if invalid
 */
export declare const formatTimeTickValue: (timestampMs: number, visibleRangeMs: number) => string | null;
/**
 * Generates evenly-spaced tick values across domain.
 *
 * @param domainMin - Domain minimum value
 * @param domainMax - Domain maximum value
 * @param tickCount - Number of ticks to generate
 * @returns Array of tick values
 */
export declare const generateLinearTicks: (domainMin: number, domainMax: number, tickCount: number) => number[];
/**
 * Computes optimal tick count + values to avoid label overlap on time x-axis.
 * Uses text measurement context to test label widths.
 * Tries tick counts from MAX (9) down to MIN (1) until labels fit without overlap.
 *
 * @param params - Configuration object with axis, scale, canvas, and measurement settings
 * @returns Object with tickCount and tickValues
 */
export declare const computeAdaptiveTimeXAxisTicks: (params: {
    readonly axisMin: number | null;
    readonly axisMax: number | null;
    readonly xScale: LinearScale;
    readonly plotClipLeft: number;
    readonly plotClipRight: number;
    readonly canvasCssWidth: number;
    readonly visibleRangeMs: number;
    readonly measureCtx: CanvasRenderingContext2D | null;
    readonly measureCache?: Map<string, number>;
    readonly fontSize: number;
    readonly fontFamily: string;
    readonly tickFormatter?: (value: number) => string | null;
}) => {
    readonly tickCount: number;
    readonly tickValues: readonly number[];
};
//# sourceMappingURL=timeAxisUtils.d.ts.map